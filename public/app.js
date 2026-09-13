const grid = document.getElementById('grid');
const sub = document.getElementById('sub');
const health = document.getElementById('health');
const toast = document.getElementById('toast');

let toastTimer = null;
function showToast(msg, ok = true) {
  toast.textContent = msg;
  toast.classList.toggle('bad', !ok);
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

async function refreshHealth() {
  try {
    await fetch('/api/health');
    health.textContent = 'ONLINE';
    health.classList.add('ok');
    health.classList.remove('bad');
  } catch {
    health.textContent = 'OFFLINE';
    health.classList.add('bad');
    health.classList.remove('ok');
  }
}

let items = [];
let status = {};
let built = false;
let signature = '';

function statusFor(item) {
  if (item.id === 'openchamber-server') return status['openchamber-server'];
  if (item.id === 'Blender_Local_Control') return status['Blender_Local_Control'];
  if (item.id === 'Blender_Server_Control') return status['Blender_Server_Control'];
  if (item.id === 'Houdini_Control') return status['Houdini_Control'];
  if (item.id === 'MCP_Orphan_Cleanup') return status.mcpOrphan;
  return null;
}

const isToggle = it => it.type === 'toggle';

function buildCard(it) {
  const el = document.createElement('div');
  el.className = 'card ' + (isToggle(it) ? 'is-toggle' : 'is-run');
  el.dataset.id = it.id;
  el.innerHTML = `
    <div class="cardTop">
      <span class="led"></span>
      <span class="name">${it.name}</span>
    </div>
    <div class="desc">${it.description || ''}</div>
    ${isToggle(it)
      ? `<div class="foot"><span class="state"></span><button class="switch" type="button" role="switch" aria-label="${it.name}"><span class="knob"></span></button></div>`
      : `<button class="runBtn" type="button">Run</button>`}
  `;
  if (isToggle(it)) {
    el.addEventListener('click', () => doToggle(it, el));
  } else {
    const btn = el.querySelector('.runBtn');
    btn.addEventListener('click', e => { e.stopPropagation(); doRun(it, btn); });
  }
  return el;
}

function render() {
  grid.innerHTML = '';
  const order = [...items].sort((a, b) => {
    if (a.id === 'openchamber-server') return -1;
    if (b.id === 'openchamber-server') return 1;
    if (a.type === 'toggle' && b.type !== 'toggle') return -1;
    if (b.type === 'toggle' && a.type !== 'toggle') return 1;
    return a.name.localeCompare(b.name);
  });
  let currentDir = null;
  for (const it of order) {
    if (it.dir && it.dir !== currentDir) {
      currentDir = it.dir;
      const sec = document.createElement('div');
      sec.className = 'section';
      sec.textContent = currentDir;
      grid.appendChild(sec);
    }
    grid.appendChild(buildCard(it));
  }
}

function paint() {
  for (const el of grid.querySelectorAll('.card')) {
    const it = items.find(x => x.id === el.dataset.id);
    if (!it) continue;
    if (isToggle(it)) {
      const st = statusFor(it);
      const alive = !!st?.alive;
      el.classList.toggle('alive', alive);
      el.classList.toggle('dead', !alive);
      const sw = el.querySelector('.switch');
      if (sw) {
        sw.classList.toggle('on', alive);
        sw.setAttribute('aria-checked', String(alive));
      }
      const state = el.querySelector('.state');
      if (state) state.textContent = alive ? 'RUNNING' + (st.pid ? ' · PID ' + st.pid : '') : 'STOPPED';
    } else {
      const blocked = it.id === 'MCP_Orphan_Cleanup' && status.mcpOrphan && !status.mcpOrphan.canClean;
      el.classList.toggle('blocked', !!blocked);
      const btn = el.querySelector('.runBtn');
      if (btn) btn.disabled = !!blocked;
      const led = el.querySelector('.led');
      if (led) led.classList.toggle('warn', !!blocked);
    }
  }
}

async function load() {
  try {
    const [itRes, stRes] = await Promise.all([fetch('/api/items'), fetch('/api/status')]);
    items = await itRes.json();
    status = await stRes.json();
    const sig = items.map(i => i.id).join('|');
    if (!built || sig !== signature) {
      render();
      built = true;
      signature = sig;
    }
    paint();
    sub.textContent = `${items.length} items · ${new Date().toLocaleTimeString()}`;
  } catch {
    sub.textContent = 'connection error';
  }
}

async function doToggle(it, card) {
  card.style.opacity = '.55';
  try {
    const r = await fetch('/api/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: it.id }),
    });
    const j = await r.json();
    if (j.error) showToast(j.error, false);
    else showToast(`${it.name}: ${String(j.action).toUpperCase()} ${j.ok ? '✓' : '⚠ check'}`, j.ok);
  } catch (e) {
    showToast(String(e), false);
  }
  card.style.opacity = '1';
  await new Promise(r => setTimeout(r, 500));
  load();
}

function closeModal() { document.getElementById('modal').classList.remove('open'); }
function openModal(title, html) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('modal').classList.add('open');
}

function renderDashboard(d) {
  if (!d) return '<pre>no data</pre>';
  const h = d.helpers || {};
  const row = (label, st) => `<div class="dashRow"><span><span class="dot ${st?.alive ? 'on' : 'off'}"></span>${label}</span><b style="color:${st?.alive ? 'var(--alive)' : 'var(--dead)'}">${st?.alive ? 'ALIVE · PID ' + st.pid : 'DEAD'}</b></div>`;
  const lb = d.localApps?.blender || 'DEAD';
  const lh = d.localApps?.houdini || 'DEAD';
  const mcp = d.mcp ? `${d.mcp.sessions} session(s) — ${d.mcp.canClean ? 'can clean' : 'blocked (close OpenChamber)'}` : '';
  let html = '<div class="dashGrid">';
  html += row('Blender Local', h.blLocal);
  html += row('Blender Server', h.blServer);
  html += row('Houdini Local', h.houdiniLocal);
  html += row('Houdini Server', h.houdiniServer);
  html += `<div class="dashRow"><span>Blender App</span><b style="color:var(--dim)">${lb.startsWith('ALIVE') ? lb : 'not running'}</b></div>`;
  html += `<div class="dashRow"><span>Houdini App</span><b style="color:var(--dim)">${lh.startsWith('ALIVE') ? lh : 'not running'}</b></div>`;
  html += `<div class="dashRow"><span>MCP</span><b style="color:var(--dim)">${mcp}</b></div>`;
  html += '</div>';
  return html;
}

async function doRun(it, btn) {
  btn.disabled = true;
  btn.textContent = '…';
  try {
    const r = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: it.id }),
    });
    const j = await r.json();
    if (j.error) showToast(j.error, false);
    else if (it.id === '_HELPER_DASHBOARD') {
      openModal('Helper Dashboard', renderDashboard(j.dashboard) + (j.output ? `<pre>${j.output.replace(/</g, '&lt;')}</pre>` : ''));
      showToast('Dashboard loaded ✓');
    } else {
      showToast(`${it.name} launched ✓`);
      if (j.output) openModal(it.name, `<pre>${j.output.replace(/</g, '&lt;')}</pre>`);
    }
  } catch (e) {
    showToast(String(e), false);
  }
  btn.disabled = false;
  btn.textContent = 'Run';
}

load();
refreshHealth();
setInterval(load, 5000);
setInterval(refreshHealth, 10000);
