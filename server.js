import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { exec, spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3157;
const CONTROLS_DIR = 'C:\\Users\\User\\Desktop\\Controls';
const CONTROL_SCRIPTS_ROOT = 'F:\\NextCloud\\_AI_SYSTEMS\\Obsidian Vault\\Kims_Documentation_Vault\\Scripts_Tools\\_Control';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function execPs(cmd) {
  return new Promise((resolve) => {
    exec(`powershell -NoProfile -Command "${cmd.replace(/"/g, '`"')}"`, { timeout: 15000 }, (err, stdout, stderr) => {
      resolve({ err, stdout: stdout?.trim() ?? '', stderr: stderr?.trim() ?? '' });
    });
  });
}

async function getHelperStatus(lockName) {
  const cmd = `$p = Get-Content -LiteralPath \\"$env:TEMP\\${lockName}\\" -ErrorAction SilentlyContinue; if(-not $p){ Write-Output 'DEAD' } else { $proc = Get-Process -Id ([int]$p) -ErrorAction SilentlyContinue; if($proc){ Write-Output \"ALIVE:$p\" } else { Write-Output 'DEAD' } }`;
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

function scanControls() {
  const items = [];
  // virtual OpenChamber Server entry - always first, toggleable
  items.push({
    id: 'openchamber-server',
    name: 'OpenChamber Server',
    file: 'OpenChamber Server.lnk',
    target: 'F:\\NextCloud\\_AI_CORE_SYSTEMS\\02_apps\\openchamber-server\\OpenChamber Server.exe',
    dir: 'VIRTUAL',
    type: 'toggle',
    icon: '🟣',
    description: 'Web UI on :3000 — real ON/OFF via port check, not just .lnk',
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
  const [oc, blLocal, blServer, houdini, mcp] = await Promise.all([
    getOpenChamberStatus(),
    getHelperStatus('.blender-helper-local.lock'),
    getHelperStatus('.blender-helper.lock'),
    getHelperStatus('.houdini-helper-local.lock'),
    getMcpOrphanStatus(),
  ]);
  res.json({
    'openchamber-server': oc,
    'Blender_Local_Control': blLocal,
    'Blender_Server_Control': blServer,
    'Houdini_Control': houdini,
    mcpOrphan: mcp,
  });
});

// Helpers to start helpers
async function startHelper(helperScript) {
  const ps = `Start-Process powershell -ArgumentList "-NoProfile -WindowStyle Hidden -File \\"${helperScript}\\"" -WindowStyle Hidden`;
  const { stdout, stderr } = await execPs(ps);
  return { stdout, stderr };
}
async function stopHelper(lockName) {
  const ps = `$p = Get-Content -LiteralPath \\"$env:TEMP\\${lockName}\\" -ErrorAction SilentlyContinue; if($p){ Stop-Process -Id ([int]$p) -Force -ErrorAction SilentlyContinue; Remove-Item -LiteralPath \\"$env:TEMP\\${lockName}\\" -Force -ErrorAction SilentlyContinue; Write-Output 'stopped' } else { Write-Output 'no-lock' }`;
  return execPs(ps);
}

// Toggle endpoint
app.post('/api/toggle', async (req, res) => {
  const { id } = req.body;
  try {
    if (id === 'openchamber-server') {
      const st = await getOpenChamberStatus();
      if (st.alive) {
        // STOP - PID-targeted via openchamber stop, wait 5s, verify port dead
        await execPs(`cmd /c openchamber stop`);
        // wait a bit
        await new Promise(r => setTimeout(r, 2000));
        const after = await getOpenChamberStatus();
        return res.json({ action: 'stop', before: st, after, ok: !after.alive });
      } else {
        // START - hidden cmd
        exec(`cmd /c openchamber --lan --port 3000 --ui-password korakot1179`, { windowsHide: true });
        await new Promise(r => setTimeout(r, 2500));
        const after = await getOpenChamberStatus();
        return res.json({ action: 'start', before: st, after, ok: after.alive });
      }
    }
    if (id === 'Blender_Local_Control') {
      const st = await getHelperStatus('.blender-helper-local.lock');
      if (st.alive) {
        const r = await stopHelper('.blender-helper-local.lock');
        const after = await getHelperStatus('.blender-helper-local.lock');
        return res.json({ action: 'stop', before: st, after, ok: !after.alive, raw: r.stdout });
      } else {
        const helper = path.join(CONTROL_SCRIPTS_ROOT, 'BlenderHelper-Local.ps1');
        await startHelper(helper);
        await new Promise(r => setTimeout(r, 1500));
        const after = await getHelperStatus('.blender-helper-local.lock');
        return res.json({ action: 'start', before: st, after, ok: after.alive });
      }
    }
    if (id === 'Blender_Server_Control') {
      const st = await getHelperStatus('.blender-helper.lock');
      if (st.alive) {
        const r = await stopHelper('.blender-helper.lock');
        const after = await getHelperStatus('.blender-helper.lock');
        return res.json({ action: 'stop', before: st, after, ok: !after.alive, raw: r.stdout });
      } else {
        const helper = path.join(CONTROL_SCRIPTS_ROOT, 'BlenderHelper.ps1');
        await startHelper(helper);
        await new Promise(r => setTimeout(r, 1500));
        const after = await getHelperStatus('.blender-helper.lock');
        return res.json({ action: 'start', before: st, after, ok: after.alive });
      }
    }
    if (id === 'Houdini_Control') {
      const st = await getHelperStatus('.houdini-helper-local.lock');
      if (st.alive) {
        const r = await stopHelper('.houdini-helper-local.lock');
        const after = await getHelperStatus('.houdini-helper-local.lock');
        return res.json({ action: 'stop', before: st, after, ok: !after.alive, raw: r.stdout });
      } else {
        const helper = path.join(CONTROL_SCRIPTS_ROOT, 'wakatime-houdini.ps1');
        await startHelper(helper);
        await new Promise(r => setTimeout(r, 1500));
        const after = await getHelperStatus('.houdini-helper-local.lock');
        return res.json({ action: 'start', before: st, after, ok: after.alive });
      }
    }
    return res.status(400).json({ error: 'unknown toggle id: ' + id });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Run one-shot
app.post('/api/run', async (req, res) => {
  const { id } = req.body;
  const items = scanControls();
  const item = items.find(x => x.id === id);
  if (!item) return res.status(404).json({ error: 'not found' });
  if (item.id === 'openchamber-server') return res.status(400).json({ error: 'use toggle for openchamber' });

  // Special: MCP orphan guard - only when no live sessions
  if (id === 'MCP_Orphan_Cleanup') {
    const mcp = await getMcpOrphanStatus();
    if (!mcp.canClean) {
      return res.status(409).json({ error: `Blocked: ${mcp.sessions} live OpenChamber session(s) running. Close OpenChamber first.` });
    }
    const guard = 'F:\\NextCloud\\_AI_CORE_SYSTEMS\\00_core\\scripts\\mcp_orphan_guard\\cleanup_orphan_mcp.ps1';
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

const TAILSCALE_IP = '100.99.206.17';
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Controls launcher on http://localhost:${PORT} and http://${TAILSCALE_IP}:${PORT}`);
  console.log(`Serving ${CONTROLS_DIR}`);
});
