import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
const derive = promisify(scrypt);
const hash = value => createHash('sha256').update(value).digest('hex');
const same = (a,b) => a.length===b.length && timingSafeEqual(a,b);
function atomic(file, value) {
  mkdirSync(path.dirname(file),{recursive:true});
  const temporary=file+'.'+randomBytes(6).toString('hex')+'.tmp';
  writeFileSync(temporary,JSON.stringify(value),{encoding:'utf8',mode:0o600});
  renameSync(temporary,file);
}
function read(file) { try { return JSON.parse(readFileSync(file,'utf8')); } catch { return null; } }
export async function setPassword(file,password) {
  if(typeof password!=='string'||password.length<11||password.length>256)throw Error('Use a password between 11 and 256 characters.');
  const salt=randomBytes(32).toString('hex');
  const key=await derive(password,salt,64);
  atomic(file,{version:1,id:randomBytes(24).toString('hex'),salt,key:key.toString('hex')});
}
// Only password hashes and hashed bearer tokens persist, never plaintext passwords.
export function passwordAccess({file,origin,clock=Date.now}) {
  const sessionFile=file+'.sessions';
  let attempts=[],busy=false;
  function config(){const c=read(file);return c?.version===1&&/^[a-f0-9]{48}$/.test(c.id)&&/^[a-f0-9]{64}$/.test(c.salt)&&/^[a-f0-9]{128}$/.test(c.key)?c:null;}
  function rows(c){const s=read(sessionFile);return s?.version===1&&s.passwordId===c.id&&Array.isArray(s.sessions)?s.sessions.filter(row=>row.expiresAt>clock()&&row.origin===origin):[];}
  function save(c,sessions){atomic(sessionFile,{version:1,passwordId:c.id,sessions});}
  return {
    configured:()=>Boolean(config()),
    async login(password,name,remember){
      const c=config();if(!c)return {error:'Set this service’s password on your PC first.',status:503};
      attempts=attempts.filter(t=>clock()-t<15*60*1000);
      if(busy||attempts.length>=10)return {error:'Too many sign-in attempts. Wait 15 minutes and try again.',status:429};
      attempts.push(clock());busy=true;
      try {
        if(typeof password!=='string'||password.length>256||typeof name!=='string'||!name.trim()||name.length>60)return {error:'Password or device name is invalid.',status:401};
        const actual=await derive(password,c.salt,64);
        if(!same(actual,Buffer.from(c.key,'hex')))return {error:'Password or device name is invalid.',status:401};
        if(config()?.id!==c.id)return {error:'Password changed. Sign in again.',status:401};
        const sessions=rows(c);if(sessions.length>=32)return {error:'Device limit reached. Change the password on your PC to revoke old sign-ins.',status:409};
        const token=randomBytes(32).toString('hex');const maxAge=remember===true?30*86400:8*3600;
        const session={id:randomBytes(12).toString('hex'),name:name.trim(),origin,csrfToken:randomBytes(32).toString('hex'),expiresAt:clock()+maxAge*1000,remember:remember===true,digest:hash(token)};
        save(c,[...sessions,session]);return {token,session,maxAge};
      }finally{busy=false;}
    },
    authenticate(token,requestOrigin=origin){if(requestOrigin!==origin||typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return null;const c=config();return c?rows(c).find(s=>s.digest===hash(token))??null:null;},
    list(){const c=config();return c?rows(c).map(({id,name,expiresAt})=>({id,name,expiresAt})):[];},
    revoke(id){const c=config();if(c)save(c,rows(c).filter(s=>s.id!==id));},
    revokeAll(){const c=config();if(c)save(c,[]);},
  };
}
