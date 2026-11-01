import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';

const origin = 'https://kimpc.tail91f061.ts.net:8444';
const powershell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const encrypted = readFileSync(path.join(process.env.LOCALAPPDATA, 'K3Controls', 'pairing-key.txt'), 'utf8');
const key = execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', '$s=ConvertTo-SecureString ([Console]::In.ReadToEnd().Trim());$p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s);try{[Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}'], { input: encrypted, encoding: 'utf8' }).trim();
const issue = await fetch('http://127.0.0.1:3157/api/local/pair-code', { method: 'POST', headers: { 'content-type': 'application/json', 'x-controls-local-key': key }, body: '{}' });
assert.equal(issue.status, 200);
const { code } = await issue.json();
const pair = await fetch(origin + '/api/pair', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ code }) });
assert.equal(pair.status, 200);
const cookie = pair.headers.get('set-cookie').split(';')[0];
const get = url => fetch(origin + url, { headers: { cookie } });
const session = await get('/api/session');
assert.equal(session.status, 200);
const { csrf } = await session.json();
const items = await (await get('/api/items')).json();
assert.ok(items.some(item => item.id === 'hive-mobile'));
const readStatus = async () => (await (await get('/api/status')).json())['hive-mobile'];
const before = await readStatus();
assert.equal(before.blocked, false);
const toggle = async () => fetch(origin + '/api/toggle', { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json', 'x-controls-csrf': csrf }, body: JSON.stringify({ id: 'hive-mobile' }) });
if (process.argv.includes('--visual-only')) {
  const require = createRequire('E:/Git/AI_SYSTEMS/K3-OpenCode-Hive/package.json');
  const { chromium } = require('playwright-core');
  const target = 'E:/Git/AI_SYSTEMS/K3-AI-Workspace-Master/K3-AI-Workspace/workspace/2026-10-26_opencode-hive/assets/hive-server-name-r10';
  await mkdir(target, { recursive: true });
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    for (const [name, width, height] of [['mobile', 390, 844], ['desktop', 1440, 900]]) {
      const context = await browser.newContext({ viewport: { width, height } });
      await context.addCookies([{ name: '__Host-k3controls', value: cookie.split('=')[1], url: origin, secure: true, httpOnly: true, sameSite: 'Strict' }]);
      const page = await context.newPage();
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await page.locator('[data-id="hive-mobile"] .name').getByText('K3 Hive Server', { exact: true }).waitFor({ timeout: 30000 });
      assert.match(await page.locator('[data-id="hive-mobile"] .state').innerText(), before.alive ? /RUNNING/ : /STOPPED/);
      await page.screenshot({ path: path.join(target, name + '.png'), fullPage: true });
      await context.close();
    }
    console.log('Paired mobile and desktop dashboard screenshots captured; no actions sent.');
  } finally { await browser.close(); }
} else if (!before.alive) {
  const start = await (await toggle()).json();
  assert.equal(start.ok, true, 'Hive should start');
  assert.equal(start.after.alive, true);
  // The background helper must issue a one-time code without a console window.
  const hiveEncrypted = readFileSync(path.join(process.env.LOCALAPPDATA, 'K3Hive', 'pairing-key.txt'), 'utf8');
  const hiveKey = execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', '$s=ConvertTo-SecureString ([Console]::In.ReadToEnd().Trim());$p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s);try{[Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}'], { input: hiveEncrypted, encoding: 'utf8' }).trim();
  const hiveIssue = await fetch('http://127.0.0.1:8912/api/local/pair-code', { method: 'POST', headers: { 'content-type': 'application/json', 'x-hive-local-key': hiveKey }, body: '{}' });
  assert.equal(hiveIssue.status, 200);
  const hiveCode = (await hiveIssue.json()).code;
  const hiveOrigin = 'https://kimpc.tail91f061.ts.net:8443';
  const hivePair = await fetch(hiveOrigin + '/api/pair', { method: 'POST', headers: { origin: hiveOrigin, 'content-type': 'application/json' }, body: JSON.stringify({ code: hiveCode, name: 'Temporary verification' }) });
  assert.equal(hivePair.status, 200);
  const windowHandle = execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${start.after.pid} -ErrorAction Stop).MainWindowHandle`], { encoding: 'utf8' }).trim();
  assert.equal(windowHandle, '0', 'Hive must have no visible main window');
  if (process.argv.includes('--leave-on')) {
    console.log('Dashboard pairing, hidden Hive start and Hive pairing verified; Hive left running.');
  } else {
    const stop = await (await toggle()).json();
    assert.equal(stop.ok, true, 'Hive should stop');
    assert.equal(stop.after.alive, false);
    console.log('Dashboard pairing, hidden Hive start, Hive pairing, and stop verified; initial OFF state restored.');
  }
} else {
  console.log('Pairing, secured API and Hive running status verified; existing running Hive was not interrupted.');
}
