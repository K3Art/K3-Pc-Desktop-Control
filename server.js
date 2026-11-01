import express from 'express';
import fs from 'fs';
import path from 'path';
import { exec, spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createDeviceAccess } from './device-access.mjs';
import { startProtectedOpenChamber } from './openchamber-launch.mjs';
import { passwordAccess } from './password-access.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT === undefined ? 3157 : parseInt(process.env.PORT, 10);
const CONTROLS_DIR = 'C:\\Users\\Kim\\Desktop\\Controls';
const CONTROL_SCRIPTS_ROOT = 'D:\\Nextcloud\\_AI_SYSTEMS\\tools\\_Control';
const STUDIO_HELPER = path.join(CONTROL_SCRIPTS_ROOT, 'K3-Concept-Studio.ps1');
const STUDIO_PORT = 8790;
const REVIEW_HELPER = path.join(CONTROL_SCRIPTS_ROOT, 'K3-Review-Server.ps1');
const REVIEW_PORT = 8901;
const WAKA_SESSION_TOGGLE = path.join(process.env.USERPROFILE || process.env.HOME || '~', '.config', 'opencode', 'wakatime-session.enabled.json');
const ASSISTANT_STATUS_FILE = 'D:\\Nextcloud\\_AI_SYSTEMS\\_OPENCLAW\\STATUS.json';
const ASSISTANT_LAUNCHER = 'E:\\Git\\AI_SYSTEMS\\K3-OpenClaw-Assistant\\Start-PersonalAssistant.ps1';
const ASSISTANT_TASK = 'OpenClaw-Personal-Assistant';
const HIVE_SERVER = 'E:\\Git\\AI_SYSTEMS\\K3-OpenCode-Hive\\packages\\app\\server.mjs';
const HIVE_CONNECTION = 'E:\\Git\\AI_SYSTEMS\\K3-OpenCode-Hive\\.local\\openchamber-connection.json';
const HIVE_NODE = 'C:\\Program Files\\nodejs\\node.exe';

function getWakaSessionStatus() {
  try {
    const j = JSON.parse(fs.readFileSync(WAKA_SESSION_TOGGLE, 'utf8'));
    return { alive: j.enabled !== false, enabled: j.enabled !== false };
  } catch {
    return { alive: true, enabled: true }; // missing file → plugin defaults to on
  }
}

function setWakaSessionEnabled(enabled) {
  fs.writeFileSync(WAKA_SESSION_TOGGLE, JSON.stringify({ enabled }, null, 2) + '\n', 'utf8');
}

const PUBLIC_ORIGIN = 'https://kimpc.tail91f061.ts.net:8444';
const PUBLIC_HOST = new URL(PUBLIC_ORIGIN).host;
let LOCAL_HOST = `127.0.0.1:${PORT}`;
const passwordMode=process.env.K3_CONTROLS_TESTING!=='1'||Boolean(process.env.K3_CONTROLS_PASSWORD_FILE);
const access = passwordMode?passwordAccess({file:process.env.K3_CONTROLS_PASSWORD_FILE||path.join(process.env.LOCALAPPDATA,'K3Controls','password-auth.json'),origin:PUBLIC_ORIGIN}):createDeviceAccess();
const localSecret = randomBytes(32).toString('hex');
const powershellExe = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const localKeyPath = process.env.K3_CONTROLS_TEST_KEY || path.join(process.env.LOCALAPPDATA, 'K3Controls', 'pairing-key.txt');
fs.mkdirSync(path.dirname(localKeyPath), { recursive: true });
// DPAPI encrypts the local issuance key to the current Windows account.
const encrypted = spawnSync(powershellExe, ['-NoProfile', '-NonInteractive', '-Command', '$v=[Console]::In.ReadToEnd(); ConvertFrom-SecureString (ConvertTo-SecureString $v -AsPlainText -Force)'], { input: localSecret, encoding: 'utf8', timeout: 10000 });
if (encrypted.status !== 0 || !encrypted.stdout.trim()) throw new Error('Cannot protect local pairing key; refusing to start.');
fs.writeFileSync(localKeyPath, encrypted.stdout.trim(), 'utf8');
const equalSecret = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use(async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const host = req.headers.host;
  if (host !== PUBLIC_HOST && host !== LOCAL_HOST) return res.status(403).json({ error: 'Host not allowed' });
  if (req.path === '/api/local/pair-code' && req.method === 'POST') {
    if(passwordMode)return res.status(410).json({error:'Pairing has been replaced by password sign-in.'});
    if (host !== LOCAL_HOST || req.headers.origin || !equalSecret(req.headers['x-controls-local-key'], localSecret)) return res.status(403).json({ error: 'Not allowed' });
    return res.json({ code: access.issueCode() });
  }
  // Loopback is only for the local code helper, never an authentication bypass.
  if (host !== PUBLIC_HOST) return res.status(403).json({ error: 'Use the private HTTPS address' });
  if (req.headers.forwarded || (req.headers['x-forwarded-host'] && req.headers['x-forwarded-host'] !== PUBLIC_HOST) || (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] !== 'https')) return res.status(403).json({ error: 'Forwarded authority not allowed' });
  if(req.path==='/api/login'&&req.method==='POST'){
    if(!passwordMode||req.headers.origin!==PUBLIC_ORIGIN||!req.is('application/json'))return res.status(403).json({error:'Origin not allowed'});
    try {
      const result=await access.login(req.body?.password,'Controls browser',req.body?.remember);
      if(result.error)return res.status(result.status).json({error:result.error});
      res.setHeader('Set-Cookie',`__Host-k3controls=${result.token}; Path=/; HttpOnly; Secure; SameSite=Strict`+(req.body.remember===true?`; Max-Age=${result.maxAge}`:''));
      return res.json({ok:true});
    }catch{return res.status(503).json({error:'Sign-in could not be completed. Try again later.'});}
  }
  if (req.path === '/api/pair' && req.method === 'POST') {
    if(passwordMode)return res.status(410).json({error:'Use password sign-in.'});
    if (req.headers.origin !== PUBLIC_ORIGIN || !req.is('application/json')) return res.status(403).json({ error: 'Origin not allowed' });
    const paired = access.pair(req.body?.code);
    if (!paired) return res.status(401).json({ error: 'Code invalid, expired or used. Generate a new code on the PC.' });
    res.setHeader('Set-Cookie', `__Host-k3controls=${paired.token}; Path=/; HttpOnly; Secure; SameSite=Strict`);
    return res.json({ ok: true });
  }
  const token = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('__Host-k3controls='))?.slice('__Host-k3controls='.length);
  const session = access.authenticate(token);
  if (!session) {
    if (req.method === 'GET' && ['/', '/pair.js','/login.js'].includes(req.path)) return res.sendFile(path.join(__dirname, 'public', passwordMode?(req.path==='/'?'login.html':'login.js'):(req.path==='/'?'pair.html':'pair.js')));
    return res.status(401).json({ error: 'Sign in first' });
  }
  const csrf=session.csrfToken||session.csrf;
  if (req.path === '/api/session' && req.method === 'GET') return res.json({ csrf });
  if (!['GET', 'HEAD'].includes(req.method) && (req.headers.origin !== PUBLIC_ORIGIN || !equalSecret(req.headers['x-controls-csrf'], csrf) || !req.is('application/json'))) return res.status(403).json({ error: 'Invalid origin or session' });
  if(passwordMode&&req.path==='/api/logout'&&req.method==='POST'){access.revoke(session.id);res.setHeader('Set-Cookie','__Host-k3controls=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');return res.json({ok:true});}
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

function execPs(cmd) {
  return new Promise((resolve) => {
    exec(`powershell -NoProfile -Command "${cmd.replace(/"/g, '`"')}"`, { timeout: 15000 }, (err, stdout, stderr) => {
      resolve({ err, stdout: stdout?.trim() ?? '', stderr: stderr?.trim() ?? '' });
    });
  });
}

async function getHelperStatus(lockName) {
  const cmd = `$p = Get-Content -LiteralPath (Join-Path $env:TEMP '${lockName}') -ErrorAction SilentlyContinue; if(-not $p){ Write-Output 'DEAD' } else { $proc = Get-Process -Id ([int]$p.Trim()) -ErrorAction SilentlyContinue; if($proc){ Write-Output \"ALIVE:$($p.Trim())\" } else { Write-Output 'DEAD' } }`;
  const { stdout } = await execPs(cmd);
  if (stdout.startsWith('ALIVE:')) {
    const pid = stdout.split(':')[1];
    return { alive: true, pid: parseInt(pid, 10) };
  }
  return { alive: false, pid: null };
}

async function getOpenChamberStatus() {
  const cmd = `$c = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if($c){ $proc = Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -eq $c.OwningProcess } | Select-Object -First 1; $cl = $proc.CommandLine; if($cl -match 'openchamber'){ Write-Output \"ALIVE:$($c.OwningProcess)\" } else { Write-Output \"ALIVE:$($c.OwningProcess):$cl\" } } else { Write-Output 'DEAD' }`;
  const { stdout } = await execPs(cmd);
  if (stdout.startsWith('ALIVE:')) {
    const parts = stdout.split(':');
    const pid = parseInt(parts[1], 10);
    return { alive: true, pid, detail: parts.slice(2).join(':') };
  }
  return { alive: false, pid: null };
}

async function getMcpOrphanStatus() {
  const cmd = `$live = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'opencode.exe' -and $_.CommandLine -match 'serve' }); Write-Output $live.Count`;
  const { stdout } = await execPs(cmd);
  const count = parseInt(stdout.trim(), 10);
  return { sessions: isNaN(count) ? 0 : count, canClean: (isNaN(count) ? true : count === 0) };
}

async function getStudioStatus() {
  const cmd = `$c = Get-NetTCPConnection -LocalPort ${STUDIO_PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if($c){ Write-Output "ALIVE:$($c.OwningProcess)" } else { Write-Output 'DEAD' }`;
  const { stdout } = await execPs(cmd);
  if (stdout.startsWith('ALIVE:')) {
    return { alive: true, pid: parseInt(stdout.split(':')[1], 10) };
  }
  return { alive: false, pid: null };
}

async function getReviewStatus() {
  const cmd = `$c = Get-NetTCPConnection -LocalPort ${REVIEW_PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if($c){ Write-Output "ALIVE:$($c.OwningProcess)" } else { Write-Output 'DEAD' }`;
  const { stdout } = await execPs(cmd);
  if (stdout.startsWith('ALIVE:')) {
    return { alive: true, pid: parseInt(stdout.split(':')[1], 10) };
  }
  return { alive: false, pid: null };
}

async function getHiveStatus() {
  const cmd = `$c = Get-NetTCPConnection -LocalPort 8912 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if(-not $c){Write-Output 'OFF'} else { $p = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $c.OwningProcess); if($p.Name -eq 'node.exe' -and $p.CommandLine -like '*K3-OpenCode-Hive*packages*app*server.mjs*' -and $p.CommandLine -like '*--public-origin*kimpc.tail91f061.ts.net:8443*'){Write-Output ('ON:' + $c.OwningProcess)} else {Write-Output 'BLOCKED'} }`;
  const { stdout, err } = await execPs(cmd);
  if (err) return { alive: false, blocked: true };
  if (/^ON:\d+$/.test(stdout)) return { alive: true, pid: Number(stdout.slice(3)), blocked: false };
  return { alive: false, blocked: stdout !== 'OFF' };
}

// The assistant is up when its loopback bridge answers and the logon supervisor
// is looping. The -Command filter is required: the probe itself is a powershell
// -Command process whose command line contains the supervisor script name.
async function getAssistantStatus() {
  let state = 'unknown';
  let checkedAt = null;
  try {
    const j = JSON.parse(fs.readFileSync(ASSISTANT_STATUS_FILE, 'utf8'));
    state = j.state || 'unknown';
    checkedAt = j.checkedAt || null;
  } catch {}
  const cmd = `$b = @(Get-NetTCPConnection -LocalPort 18790 -State Listen -ErrorAction SilentlyContinue) | Select-Object -First 1; $s = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'powershell.exe' -and $_.CommandLine -like '*-File*Run-AssistantSupervisor.ps1*' -and $_.CommandLine -notlike '*-Command*' }); Write-Output ('BRIDGE:' + $(if($b){$b.OwningProcess}else{0}) + ';SUP:' + $s.Count)`;
  const { stdout } = await execPs(cmd);
  const bridge = parseInt((stdout.match(/BRIDGE:(\d+)/) || [])[1] || '0', 10);
  const supervisors = parseInt((stdout.match(/SUP:(\d+)/) || [])[1] || '0', 10);
  return { alive: bridge > 0 && supervisors > 0, pid: bridge || null, supervisors, state, checkedAt };
}

function scanControls() {
  const items = [];
    items.push({ id: 'hive-mobile', name: 'K3 Hive Server', file: 'Hive Mobile', dir: 'VIRTUAL', type: 'toggle', icon: 'H', description: 'Runs in the background. Stopping signs out paired devices and can interrupt active work.' });
  // virtual OpenChamber Server entry - always first, toggleable
  items.push({
    id: 'openchamber-server',
    name: 'OpenChamber Server',
    file: 'OpenChamber Server.lnk',
    target: 'D:\\Nextcloud\\_AI_SYSTEMS\\_AI_CORE_SYSTEMS\\02_apps\\openchamber-server\\OpenChamber Server.exe',
    dir: 'VIRTUAL',
    type: 'toggle',
    icon: '🟣',
    description: 'Web UI on :3000 — real ON/OFF via port check, not just .lnk',
  });

  // virtual OpenClaw personal assistant entry - bridge + logon supervisor
  items.push({
    id: 'openclaw-assistant',
    name: 'OpenClaw Personal Assistant',
    file: 'OpenClaw Personal Assistant',
    target: 'SCHEDULED-TASK:' + ASSISTANT_TASK,
    dir: 'VIRTUAL',
    type: 'toggle',
    icon: 'AI',
    description: 'PC-hosted assistant - bridge on :18790 with logon supervisor. Toggle pauses or resumes it.',
  });

  // virtual K3 Concept Studio entry - always a toggle, port-checked on :8790
  items.push({
    id: 'studio-server',
    name: 'K3 Concept Studio',
    file: 'K3-Concept-Studio.ps1',
    target: STUDIO_HELPER,
    dir: 'VIRTUAL',
    type: 'toggle',
    icon: '🎨',
    description: 'Concept review studio on :8790 — real ON/OFF via port check',
  });

  // virtual K3 AI Workspace review API entry - always a toggle, port-checked on :8901
  items.push({
    id: 'review-server',
    name: 'K3 Review Server',
    file: 'K3-Review-Server.ps1',
    target: REVIEW_HELPER,
    dir: 'VIRTUAL',
    type: 'toggle',
    icon: '📝',
    description: 'Workspace Approve / Reject / Comment API on :8901 — saves each card reviews.json',
  });

  // virtual WakaTime session tracking entry - toggleable (writes the plugin toggle file)
  items.push({
    id: 'wakatime-session',
    name: 'WakaTime Session Track',
    file: 'WAKA-SESSION',
    target: WAKA_SESSION_TOGGLE,
    dir: 'VIRTUAL',
    type: 'toggle',
    icon: '⏱️',
    description: 'Session heartbeats (PC + phone) — flips wakatime-session.enabled.json',
  });

  // virtual WakaTime watcher process - start/stop the background heartbeat loop
  items.push({
    id: 'wakatime-session-watch',
    name: 'WakaTime Session Watch',
    file: 'WAKA-SESSION-WATCH',
    target: path.join(CONTROL_SCRIPTS_ROOT, 'WakaTimeSessionWatch.ps1'),
    dir: 'VIRTUAL',
    type: 'toggle',
    icon: '🔄',
    description: 'Background heartbeat watcher (1/min) — lock .wakatime-session-watch.lock',
  });

  const scanDir = (dir, sub) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        scanDir(full, sub ? `${sub}/${e.name}` : e.name);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.lnk')) {
        const base = e.name.replace(/\.lnk$/i, '');
        // Determine type
        let type = 'run'; // one-shot
        let icon = '🔗';
        let description = '';
        const lower = base.toLowerCase();
        if (lower.includes('blender local')) { type = 'toggle'; icon = '🟦'; description = 'WakaTime helper — lock .blender-helper-local.lock'; }
        else if (lower.includes('blender server')) { type = 'toggle'; icon = '🟦'; description = 'WakaTime helper — lock .blender-helper.lock (server)'; }
        else if (lower.includes('houdini')) { type = 'toggle'; icon = '🟧'; description = 'WakaTime helper — lock .houdini-helper-local.lock'; }
        else if (lower.includes('after effects') || lower.includes('afterfx')) { type = 'toggle'; icon = '🟪'; description = 'WakaTime helper — lock .afterfx-helper-local.lock (idle heartbeats when AE closed)'; }
        else if (lower.includes('mcp orphan')) { type = 'run'; icon = '🧹'; description = 'Only when OpenChamber closed — PID-targeted cleanup'; }
        else if (lower.includes('vault reindex')) { type = 'run'; icon = '📚'; description = 'RAG reindex.bat'; }
        else if (lower.includes('helper') || lower.includes('dashboard')) { type = 'run'; icon = '📊'; description = 'Status dashboard window'; }
        else if (lower.includes('git') || lower.includes('k3art_mtx') || lower.includes('delivery') || lower.includes('fork')) { type = 'run'; icon = '🔀'; description = 'Robocopy sync'; }
        else { type = 'run'; icon = '▶️'; }

        items.push({
          id: (sub ? `${sub}/${base}` : base).replace(/[^a-zA-Z0-9-_]/g, '_'),
          name: base,
          file: e.name,
          fullPath: full,
          dir: sub || '',
          type,
          icon,
          description,
        });
      }
    }
  };
  scanDir(CONTROLS_DIR, '');
  return items;
}

// API: list
app.get('/api/items', (req, res) => {
  res.json(scanControls());
});

// API: status of all toggles
app.get('/api/status', async (req, res) => {
  const [oc, blLocal, blServer, houdini, aeLocal, mcp, studio, review] = await Promise.all([
    getOpenChamberStatus(),
    getHelperStatus('.blender-helper-local.lock'),
    getHelperStatus('.blender-helper.lock'),
    getHelperStatus('.houdini-helper-local.lock'),
    getHelperStatus('.afterfx-helper-local.lock'),
    getMcpOrphanStatus(),
    getStudioStatus(),
    getReviewStatus(),
  ]);
  res.json({
    'openchamber-server': oc,
    'Blender_Local_Control': blLocal,
    'Blender_Server_Control': blServer,
    'Houdini_Control': houdini,
    'After_Effects_Control': aeLocal,
    mcpOrphan: mcp,
    'studio-server': studio,
    'review-server': review,
    'openclaw-assistant': await getAssistantStatus(),
    'hive-mobile': await getHiveStatus(),
    'wakatime-session': getWakaSessionStatus(),
    'wakatime-session-watch': await getHelperStatus('.wakatime-session-watch.lock'),
  });
});

// Helpers to start helpers — spawn via Node (detached:false keeps helper alive as child of server; avoids quoting hell)
async function startHelper(helperScript) {
  try {
    const child = spawn('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', helperScript], {
      windowsHide: true,
      detached: false,
      stdio: 'ignore',
    });
    // don't unref when detached:false — keep reference so helper stays alive while server alive
    return { ok: true, pid: child.pid };
  } catch (e) {
    const safe = helperScript.replace(/'/g, "''");
    const ps = `Start-Process -FilePath powershell -ArgumentList '-NoProfile','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File','${safe}' -WindowStyle Hidden`;
    const { stdout, stderr, err } = await execPs(ps);
    return { stdout, stderr, err, fallback: true };
  }
}
async function stopHelper(lockName) {
  const ps = `$p = Get-Content -LiteralPath (Join-Path $env:TEMP '${lockName}') -ErrorAction SilentlyContinue; if($p){ Stop-Process -Id ([int]$p.Trim()) -Force -ErrorAction SilentlyContinue; Remove-Item -LiteralPath (Join-Path $env:TEMP '${lockName}') -Force -ErrorAction SilentlyContinue; Write-Output 'stopped' } else { Write-Output 'no-lock' }`;
  return execPs(ps);
}

let hiveToggleBusy = false;
// Toggle endpoint
app.post('/api/toggle', async (req, res) => {
  const { id } = req.body;
  try {
    if (id === 'hive-mobile') {
      if (hiveToggleBusy) return res.status(409).json({ error: 'Hive is already changing state.' });
      hiveToggleBusy = true;
      try {
      const before = await getHiveStatus();
      if (before.blocked) return res.status(409).json({ error: 'Hive port is in use by an unverified process.' });
      if (before.alive) {
        const recheck = await getHiveStatus();
        if (!recheck.alive || recheck.pid !== before.pid) return res.status(409).json({ error: 'Hive status changed; retry.' });
        const stopped = await execPs(`$c=Get-NetTCPConnection -LocalPort 8912 -State Listen -ErrorAction Stop | Select-Object -First 1; $p=Get-CimInstance Win32_Process -Filter ('ProcessId=' + $c.OwningProcess); if($c.OwningProcess -ne ${before.pid} -or $p.Name -ne 'node.exe' -or $p.CommandLine -notlike '*K3-OpenCode-Hive*packages*app*server.mjs*' -or $p.CommandLine -notlike '*--public-origin*kimpc.tail91f061.ts.net:8443*'){throw 'Hive ownership changed'}; Stop-Process -Id ${before.pid} -ErrorAction Stop`);
        if (stopped.err) return res.status(500).json({ error: 'Could not safely stop Hive.' });
      } else {
        if (!fs.existsSync(HIVE_SERVER) || !fs.existsSync(HIVE_CONNECTION) || !fs.existsSync(HIVE_NODE) || !fs.statSync(HIVE_NODE).size) return res.status(500).json({ error: 'Hive server, connection or Node is missing.' });
        const launch = await execPs(`Start-Process -FilePath '${HIVE_NODE}' -WindowStyle Hidden -ArgumentList '${HIVE_SERVER}','--connection','${HIVE_CONNECTION}','--port','8912','--public-origin','https://kimpc.tail91f061.ts.net:8443','--background-control'`);
        if (launch.err) return res.status(500).json({ error: 'Could not start Hive.' });
      }
      let after = await getHiveStatus();
      const deadline = Date.now() + 12000;
      while (!after.blocked && after.alive === before.alive && Date.now() < deadline) { await new Promise(r => setTimeout(r, 500)); after = await getHiveStatus(); }
      return res.json({ action: before.alive ? 'stop' : 'start', before, after, ok: !after.blocked && after.alive !== before.alive });
      } finally { hiveToggleBusy = false; }
    }
    if (id === 'openchamber-server') {
      const st = await getOpenChamberStatus();
      if (st.alive) {
        // STOP via openchamber CLI, then poll up to ~12s for port release.
        // (Graceful shutdown alone can take ~5s, so a fixed 2s wait
        // re-checks too early and reports failure while stopping.)
        const stopRes = await execPs(`cmd /c openchamber stop`);
        let after = await getOpenChamberStatus();
        const deadline = Date.now() + 12000;
        while (after.alive && Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 1000));
          after = await getOpenChamberStatus();
        }
        const raw = ((stopRes.stdout || '') + '\n' + (stopRes.stderr || '')).trim();
        return res.json({ action: 'stop', before: st, after, ok: !after.alive, raw });
      } else {
        // START - hidden cmd, then poll up to ~12s for port to come up
        try { await startProtectedOpenChamber(); }
        catch { return res.status(503).json({ error: 'Protected OpenChamber credential is not configured. Launch from its trusted local launcher.' }); }
        let after = await getOpenChamberStatus();
        const deadline = Date.now() + 12000;
        while (!after.alive && Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 1000));
          after = await getOpenChamberStatus();
        }
        return res.json({ action: 'start', before: st, after, ok: after.alive });
      }
    }
    if (id === 'openclaw-assistant') {
      const st = await getAssistantStatus();
      const local = path.join(process.env.LOCALAPPDATA || '', 'OpenClawPersonal');
      fs.mkdirSync(local, { recursive: true });
      if (st.alive) {
        // Operator pause: the launcher sets the pause flag and stops the owned
        // bridge and gateway by exact PID; the supervisor then exits by itself.
        const { stdout } = await execPs(`powershell -NoProfile -ExecutionPolicy Bypass -File '${ASSISTANT_LAUNCHER}' -Stop`);
        await new Promise(r => setTimeout(r, 2500));
        const after = await getAssistantStatus();
        return res.json({ action: 'stop', before: st, after, ok: !after.alive, raw: stdout });
      }
      // Resume: clear the operator pause flag, then let the logon supervisor
      // rebuild the bridge. Startup takes about two minutes and is not awaited.
      fs.writeFileSync(path.join(local, 'control.json'), JSON.stringify({ paused: false }), 'utf8');
      await execPs(`Start-ScheduledTask -TaskName '${ASSISTANT_TASK}'; Write-Output 'started'`);
      await new Promise(r => setTimeout(r, 4000));
      const after = await getAssistantStatus();
      return res.json({ action: 'start', before: st, after, ok: true, note: 'Supervisor rebuilds the bridge within about two minutes.' });
    }
    if (id === 'studio-server') {
      const st = await getStudioStatus();
      if (st.alive) {
        // STOP - helper is PID-targeted internally, then verify port released
        const { stdout } = await execPs(`powershell -NoProfile -ExecutionPolicy Bypass -File '${STUDIO_HELPER}' -Stop`);
        await new Promise(r => setTimeout(r, 2500));
        const after = await getStudioStatus();
        return res.json({ action: 'stop', before: st, after, ok: !after.alive, raw: stdout });
      } else {
        // START - helper spawns node hidden, then verify port listening
        await startHelper(STUDIO_HELPER);
        await new Promise(r => setTimeout(r, 3500));
        const after = await getStudioStatus();
        return res.json({ action: 'start', before: st, after, ok: after.alive });
      }
    }
    if (id === 'review-server') {
      const st = await getReviewStatus();
      if (st.alive) {
        // STOP - helper is PID-targeted internally, then verify port released
        const { stdout } = await execPs(`powershell -NoProfile -ExecutionPolicy Bypass -File '${REVIEW_HELPER}' -Stop`);
        await new Promise(r => setTimeout(r, 1200));
        const after = await getReviewStatus();
        return res.json({ action: 'stop', before: st, after, ok: !after.alive, raw: stdout });
      } else {
        // START - helper spawns node hidden, then verify port listening
        await startHelper(REVIEW_HELPER);
        await new Promise(r => setTimeout(r, 2500));
        const after = await getReviewStatus();
        return res.json({ action: 'start', before: st, after, ok: after.alive });
      }
    }
    if (id === 'wakatime-session') {
      const before = getWakaSessionStatus();
      const afterEnabled = !before.enabled;
      setWakaSessionEnabled(afterEnabled);
      const after = getWakaSessionStatus();
      return res.json({ action: afterEnabled ? 'start' : 'stop', before, after, ok: after.enabled === afterEnabled });
    }
    if (id === 'wakatime-session-watch') {
      const st = await getHelperStatus('.wakatime-session-watch.lock');
      if (st.alive) {
        const r = await stopHelper('.wakatime-session-watch.lock');
        await new Promise(r => setTimeout(r, 800));
        const after = await getHelperStatus('.wakatime-session-watch.lock');
        return res.json({ action: 'stop', before: st, after, ok: !after.alive, raw: r.stdout });
      } else {
        const helper = path.join(CONTROL_SCRIPTS_ROOT, 'WakaTimeSessionWatch.ps1');
        await startHelper(helper);
        await new Promise(r => setTimeout(r, 3000));
        const after = await getHelperStatus('.wakatime-session-watch.lock');
        return res.json({ action: 'start', before: st, after, ok: after.alive });
      }
    }
    if (id === 'Blender_Local_Control') {
      const st = await getHelperStatus('.blender-helper-local.lock');
      if (st.alive) {
        const r = await stopHelper('.blender-helper-local.lock');
        await new Promise(r => setTimeout(r, 800));
        const after = await getHelperStatus('.blender-helper-local.lock');
        return res.json({ action: 'stop', before: st, after, ok: !after.alive, raw: r.stdout });
      } else {
        const helper = path.join(CONTROL_SCRIPTS_ROOT, 'BlenderHelper-Local.ps1');
        await startHelper(helper);
        await new Promise(r => setTimeout(r, 3000));
        const after = await getHelperStatus('.blender-helper-local.lock');
        return res.json({ action: 'start', before: st, after, ok: after.alive });
      }
    }
    if (id === 'Blender_Server_Control') {
      const st = await getHelperStatus('.blender-helper.lock');
      if (st.alive) {
        const r = await stopHelper('.blender-helper.lock');
        await new Promise(r => setTimeout(r, 800));
        const after = await getHelperStatus('.blender-helper.lock');
        return res.json({ action: 'stop', before: st, after, ok: !after.alive, raw: r.stdout });
      } else {
        const helper = path.join(CONTROL_SCRIPTS_ROOT, 'BlenderHelper.ps1');
        await startHelper(helper);
        await new Promise(r => setTimeout(r, 3000));
        const after = await getHelperStatus('.blender-helper.lock');
        return res.json({ action: 'start', before: st, after, ok: after.alive });
      }
    }
    if (id === 'Houdini_Control') {
      const st = await getHelperStatus('.houdini-helper-local.lock');
      if (st.alive) {
        const r = await stopHelper('.houdini-helper-local.lock');
        await new Promise(r => setTimeout(r, 800));
        const after = await getHelperStatus('.houdini-helper-local.lock');
        return res.json({ action: 'stop', before: st, after, ok: !after.alive, raw: r.stdout });
      } else {
        const helper = path.join(CONTROL_SCRIPTS_ROOT, 'wakatime-houdini.ps1');
        await startHelper(helper);
        await new Promise(r => setTimeout(r, 3000));
        const after = await getHelperStatus('.houdini-helper-local.lock');
        return res.json({ action: 'start', before: st, after, ok: after.alive });
      }
    }
    if (id === 'After_Effects_Control') {
      const st = await getHelperStatus('.afterfx-helper-local.lock');
      if (st.alive) {
        const r = await stopHelper('.afterfx-helper-local.lock');
        await new Promise(r => setTimeout(r, 800));
        const after = await getHelperStatus('.afterfx-helper-local.lock');
        return res.json({ action: 'stop', before: st, after, ok: !after.alive, raw: r.stdout });
      } else {
        const helper = path.join(CONTROL_SCRIPTS_ROOT, 'AfterEffectsHelper-Local.ps1');
        await startHelper(helper);
        await new Promise(r => setTimeout(r, 3000));
        const after = await getHelperStatus('.afterfx-helper-local.lock');
        return res.json({ action: 'start', before: st, after, ok: after.alive });
      }
    }
    return res.status(400).json({ error: 'unknown toggle id: ' + id });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Helper Dashboard — run inline and return output to show inside the phone app
async function runHelperDashboard() {
  return new Promise((resolve) => {
    const src = path.join(CONTROL_SCRIPTS_ROOT, 'Helper Dashboard.ps1');
    let txt = '';
    try { txt = fs.readFileSync(src, 'utf8'); } catch { return resolve({ stdout: 'Helper Dashboard.ps1 not found', ok: false }); }
    // Remove interactive / clear lines, keep logic
    const filtered = txt.split(/\r?\n/).filter(l => !l.match(/^\s*Clear-Host|^\s*Read-Host/)).join('\r\n');
    const tmp = path.join(process.env.TEMP, `helper_dash_${Date.now()}.ps1`);
    // Force non-interactive: pipe output as plain text, ensure colors are still captured via Write-Host -> write to host but we capture via transcript
    const wrapper = `$orig = "${tmp}"; Start-Transcript -Path "$env:TEMP\\helper_dash_out.txt" -Force | Out-Null; try { . "${tmp.replace(/"/g, '""')}" } catch { Write-Output $_ } ; Stop-Transcript | Out-Null; Get-Content "$env:TEMP\\helper_dash_out.txt" -Raw | Write-Output`;
    // Simpler: just exec the filtered script and capture Write-Host via redirect
    fs.writeFileSync(tmp, filtered, 'utf8');
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmp}"`, { timeout: 20000, encoding: 'utf8' }, (err, stdout, stderr) => {
      let out = (stdout || '') + (stderr || '');
      // Fallback: also try transcript if stdout empty (Write-Host goes to host)
      if (!out.trim()) {
        try { out = fs.readFileSync(path.join(process.env.TEMP, 'helper_dash_out.txt'), 'utf8'); } catch {}
      }
      try { fs.unlinkSync(tmp); } catch {}
      resolve({ stdout: out.trim() || 'No output (check helper dashboard on PC)', ok: !err });
    });
  });
}

// Structured dashboard for in-app rendering (no colors, JSON)
async function getDashboardJson() {
  const [blLocal, blServer, houdiniLocal, houdiniServer, aeLocal, localBlender, localHoudini, localAE, mcp] = await Promise.all([
    getHelperStatus('.blender-helper-local.lock'),
    getHelperStatus('.blender-helper.lock'),
    getHelperStatus('.houdini-helper-local.lock'),
    getHelperStatus('.houdini-helper.lock'),
    getHelperStatus('.afterfx-helper-local.lock'),
    execPs(`$p = Get-Process -Name blender -ErrorAction SilentlyContinue | Select-Object -First 1; if($p){ $t=$p.MainWindowTitle; Write-Output "ALIVE:$($p.Id):$t" } else { Write-Output 'DEAD' }`),
    execPs(`$p = Get-Process -Name houdini -ErrorAction SilentlyContinue | Select-Object -First 1; if(-not $p){ $p = Get-Process -Name hython -ErrorAction SilentlyContinue | Select-Object -First 1 }; if($p){ Write-Output "ALIVE:$($p.Id)" } else { Write-Output 'DEAD' }`),
    execPs(`$p = Get-Process -Name AfterFX -ErrorAction SilentlyContinue | Select-Object -First 1; if($p){ Write-Output "ALIVE:$($p.Id):$($p.MainWindowTitle)" } else { Write-Output 'DEAD' }`),
    getMcpOrphanStatus(),
  ]);
  return {
    helpers: { blLocal, blServer, houdiniLocal, houdiniServer, aeLocal },
    localApps: { blender: localBlender.stdout, houdini: localHoudini.stdout, afterfx: localAE.stdout },
    mcp,
    time: new Date().toISOString(),
  };
}

app.get('/api/dashboard', async (req, res) => {
  const json = await getDashboardJson();
  res.json(json);
});

// Run one-shot
app.post('/api/run', async (req, res) => {
  const { id } = req.body;
  const items = scanControls();
  const item = items.find(x => x.id === id);
  if (!item) return res.status(404).json({ error: 'not found' });
  if (item.id === 'openchamber-server') return res.status(400).json({ error: 'use toggle for openchamber' });

  // Special: Helper Dashboard — return output to show inside app
  if (id === '_HELPER_DASHBOARD') {
    const r = await runHelperDashboard();
    const json = await getDashboardJson();
    return res.json({ ok: true, output: r.stdout, dashboard: json });
  }

  // Special: MCP orphan guard - only when no live sessions
  if (id === 'MCP_Orphan_Cleanup') {
    const mcp = await getMcpOrphanStatus();
    if (!mcp.canClean) {
      return res.status(409).json({ error: `Blocked: ${mcp.sessions} live OpenChamber session(s) running. Close OpenChamber first.` });
    }
    const guard = 'D:\\Nextcloud\\_AI_SYSTEMS\\_AI_CORE_SYSTEMS\\00_core\\scripts\\mcp_orphan_guard\\cleanup_orphan_mcp.ps1';
    const { stdout } = await execPs(`powershell -NoProfile -ExecutionPolicy Bypass -File \\"${guard}\\" | Out-String`);
    return res.json({ ok: true, output: stdout });
  }

  // General: execute the .lnk via WScript.Shell hidden — avoid nested template escaping by writing a temp ps1
  const tmpPs = path.join(process.env.TEMP, `launch_${Date.now()}.ps1`);
  const psContent = [
    `$sh = New-Object -COM WScript.Shell`,
    `$lnk = $sh.CreateShortcut('${item.fullPath.replace(/'/g, "''")}')`,
    `$t = $lnk.TargetPath; $a = $lnk.Arguments; $w = $lnk.WorkingDirectory`,
    `if($w){ Set-Location -LiteralPath $w }`,
    `if($t -match '\\.ps1$'){ Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File \`"$t\`" $a" -WindowStyle Hidden }`,
    `elseif($t -match '\\.bat$|\\.cmd$'){ Start-Process cmd -ArgumentList "/c \`"$t\`" $a" -WindowStyle Hidden }`,
    `else { Start-Process -LiteralPath $t -ArgumentList $a -WorkingDirectory $w }`,
    `Write-Output "launched:$t"`,
  ].join('; ');
  fs.writeFileSync(tmpPs, psContent, 'utf8');
  const r = await execPs(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpPs}"`);
  try{ fs.unlinkSync(tmpPs); }catch{}
  // Fallback: also try shell execute the .lnk directly hidden
  if (r.stdout.includes('launched:') || !r.err) {
    return res.json({ ok: true, output: r.stdout || 'launched' });
  }
  // direct lnk launch hidden
  exec(`powershell -NoProfile -Command "Start-Process -LiteralPath \\"${item.fullPath}\\" -WindowStyle Hidden"`, { windowsHide: true });
  return res.json({ ok: true, output: 'launched lnk' });
});

app.get('/api/health', (req, res) => res.json({ ok: true, controlsDir: CONTROLS_DIR }));

const TAILSCALE_IP = '100.92.107.30';
const listener = app.listen(PORT, '127.0.0.1', () => {
  LOCAL_HOST = `127.0.0.1:${listener.address().port}`;
  if (process.env.K3_CONTROLS_TESTING === '1') { console.log(`TEST_READY:${listener.address().port}`); return; }
  console.log(`Controls launcher on http://localhost:${PORT} and http://${TAILSCALE_IP}:${PORT}`);
  console.log(`Serving ${CONTROLS_DIR}`);
  // Auto-start the K3 review API (:8901) on boot so card review buttons are
  // never left "review server offline". Idempotent: helper exits if already up.
  getReviewStatus()
    .then(st => st.alive ? null : startHelper(REVIEW_HELPER))
    .catch(() => {});
});
