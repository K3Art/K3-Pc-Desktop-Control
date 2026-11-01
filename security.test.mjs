import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { setPassword } from './password-access.mjs';

test('pairing, host, origin and CSRF gates fail closed', { timeout: 30000 }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'k3controls-test-'));
  const keyPath = path.join(dir, 'key.txt');
  const child = spawn(process.execPath, ['server.js'], { cwd: process.cwd(), env: { ...process.env, PORT: '0', K3_CONTROLS_TESTING: '1', K3_CONTROLS_TEST_KEY: keyPath }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const port = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Test server startup timed out')), 15000);
      child.stdout.on('data', chunk => { output += chunk; const match = output.match(/TEST_READY:(\d+)/); if (match) { clearTimeout(timer); resolve(Number(match[1])); } });
      child.on('exit', code => { clearTimeout(timer); reject(new Error(`Test server exited: ${code}`)); });
    });
    const powershell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const key = execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', '$s=ConvertTo-SecureString ([Console]::In.ReadToEnd().Trim());$p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s);try{[Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}'], { input: readFileSync(keyPath, 'utf8'), encoding: 'utf8' }).trim();
    const host = 'kimpc.tail91f061.ts.net:8444';
    const origin = `https://${host}`;
    const request = (route, headers = {}, method = 'GET', body) => new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port, path: route, method, headers }, res => {
        let text = ''; res.setEncoding('utf8'); res.on('data', chunk => text += chunk); res.on('end', () => resolve({ status: res.statusCode, headers: { get: name => Array.isArray(res.headers[name]) ? res.headers[name][0] : res.headers[name] }, json: async () => JSON.parse(text) }));
      });
      req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
    });
    assert.equal((await request('/api/items', { host })).status, 401);
    assert.equal((await request('/api/items', { host: 'attacker.invalid' })).status, 403);
    assert.equal((await request('/api/local/pair-code', { host: `127.0.0.1:${port}`, 'content-type': 'application/json' }, 'POST', {})).status, 403);
    const issue = await request('/api/local/pair-code', { host: `127.0.0.1:${port}`, 'content-type': 'application/json', 'x-controls-local-key': key }, 'POST', {});
    assert.equal(issue.status, 200);
    const { code } = await issue.json();
    assert.equal((await request('/api/pair', { host, origin: 'https://attacker.invalid', 'content-type': 'application/json' }, 'POST', { code })).status, 403);
    const pair = await request('/api/pair', { host, origin, 'content-type': 'application/json' }, 'POST', { code });
    assert.equal(pair.status, 200);
    const cookie = pair.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
    assert.equal((await request('/api/pair', { host, origin, 'content-type': 'application/json' }, 'POST', { code })).status, 401);
    const session = await request('/api/session', { host, cookie });
    const { csrf } = await session.json();
    assert.ok(csrf);
    assert.equal((await request('/api/toggle', { host, cookie, origin, 'content-type': 'application/json' }, 'POST', { id: 'hive-mobile' })).status, 403);
    assert.equal((await request('/api/toggle', { host, cookie, origin: 'https://attacker.invalid', 'x-controls-csrf': csrf, 'content-type': 'application/json' }, 'POST', { id: 'hive-mobile' })).status, 403);
    assert.equal((await request('/api/session', { host: `127.0.0.1:${port}`, cookie })).status, 403);
  } finally {
    child.kill();
  }
});

test('password dashboard gates, remember cookie, persisted session, logout and rotation', {timeout:30000}, async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'controls-password-'));const file=path.join(dir,'password.json');
  await setPassword(file,'fixture-controls-password');
  const child=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env:{...process.env,PORT:'0',K3_CONTROLS_TESTING:'1',K3_CONTROLS_TEST_KEY:path.join(dir,'key.txt'),K3_CONTROLS_PASSWORD_FILE:file},stdio:['ignore','pipe','pipe']});
  try{
    const port=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Startup timeout')),15000);child.stdout.on('data',chunk=>{output+=chunk;const m=output.match(/TEST_READY:(\d+)/);if(m){clearTimeout(timer);resolve(Number(m[1]));}});child.on('exit',()=>{clearTimeout(timer);reject(Error('Server exited'));});});
    const host='kimpc.tail91f061.ts.net:8444',origin=`https://${host}`;
    const request=(route,headers={},method='GET',body)=>new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path:route,headers:{host,...headers},method},res=>{let text='';res.on('data',part=>text+=part);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,json:()=>JSON.parse(text)}));});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});
    assert.equal((await request('/api/items')).status,401);
    assert.equal((await request('/api/pair',{},'POST',{})).status,410);
    const login=await request('/api/login',{origin,'content-type':'application/json'},'POST',{password:'fixture-controls-password',remember:true});assert.equal(login.status,200);assert.match(login.headers['set-cookie'][0],/Max-Age=2592000/);
    const cookie=login.headers['set-cookie'][0].split(';')[0];const session=(await request('/api/session',{cookie})).json();assert.ok(session.csrf);
    assert.equal((await request('/api/logout',{cookie,origin,'content-type':'application/json'},'POST',{})).status,403);
    assert.equal((await request('/api/logout',{cookie,origin,'content-type':'application/json','x-controls-csrf':session.csrf},'POST',{})).status,200);
    assert.equal((await request('/api/session',{cookie})).status,401);
    const second=await request('/api/login',{origin,'content-type':'application/json'},'POST',{password:'fixture-controls-password',remember:false});assert.equal(second.status,200);assert.ok(!second.headers['set-cookie'][0].includes('Max-Age'));
    await setPassword(file,'changed-controls-password');assert.equal((await request('/api/session',{cookie:second.headers['set-cookie'][0].split(';')[0]})).status,401);
    assert.equal((await request('/api/login',{origin:'https://hostile.invalid','content-type':'application/json'},'POST',{})).status,403);
  }finally{child.kill();}
});
