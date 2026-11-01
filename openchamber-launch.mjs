import { readFileSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import path from 'node:path';

// The UI password is never placed in source code or process arguments.
export function startProtectedOpenChamber({ file, runSync = spawnSync, launch = spawn } = {}) {
  const powershell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const encrypted = readFileSync(file || path.join(process.env.LOCALAPPDATA, 'K3Controls', 'openchamber-password.txt'), 'utf8').trim();
  const decoded = runSync(powershell, ['-NoProfile','-NonInteractive','-Command','$s=ConvertTo-SecureString ([Console]::In.ReadToEnd().Trim());$p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s);try{[Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}'], { input: encrypted, encoding: 'utf8', timeout: 10000 });
  if (decoded.status !== 0 || !decoded.stdout.trim()) throw new Error('Protected OpenChamber credential is unavailable.');
  const executable = process.execPath;
  const cli = path.join(process.env.APPDATA, 'npm', 'node_modules', '@openchamber', 'web', 'bin', 'cli.js');
  const child = launch(executable, [cli,'--lan','--port','3000'], { env: { ...process.env, OPENCHAMBER_UI_PASSWORD: decoded.stdout.trim() }, windowsHide: true, detached: true, stdio: 'ignore' });
  return new Promise((resolve,reject) => {
    child.once('error',()=>reject(new Error('OpenChamber could not be launched.')));
    child.once('spawn',()=>{child.unref();resolve();});
  });
}
