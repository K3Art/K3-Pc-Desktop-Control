const grid = document.getElementById('grid');
const sub = document.getElementById('sub');
const health = document.getElementById('health');
const toast = document.getElementById('toast');

function showToast(msg, ok=true){
  toast.textContent = msg;
  toast.style.borderColor = ok ? '#2a2a30' : '#5c1a1a';
  toast.classList.add('show');
  setTimeout(()=> toast.classList.remove('show'), 2500);
}

let items = [];
let status = {};

async function refreshHealth(){
  try{
    const r = await fetch('/api/health');
    const j = await r.json();
    health.textContent = '● online';
    health.style.color = '#2ecc71';
  }catch{
    health.textContent = '● offline';
    health.style.color = '#ff5a5a';
  }
}

async function load(){
  const [itRes, stRes] = await Promise.all([fetch('/api/items'), fetch('/api/status')]);
  items = await itRes.json();
  status = await stRes.json();
  // Normalize keys for lookup: keep original + sanitized
  render();
  sub.textContent = `${items.length} items • ${new Date().toLocaleTimeString()}`;
}

function statusFor(item){
  // OpenChamber
  if(item.id === 'openchamber-server') return status['openchamber-server'];
  // Helpers: map by sanitized id
  if(item.id === 'Blender_Local_Control') return status['Blender_Local_Control'];
  if(item.id === 'Blender_Server_Control') return status['Blender_Server_Control'];
  if(item.id === 'Houdini_Control') return status['Houdini_Control'];
  if(item.id === 'MCP_Orphan_Cleanup') return status.mcpOrphan;
  return null;
}

function render(){
  grid.innerHTML = '';
  // Put virtual OpenChamber first visually
  const order = [...items].sort((a,b)=>{
    if(a.id==='openchamber-server') return -1;
    if(b.id==='openchamber-server') return 1;
    if(a.type==='toggle' && b.type!=='toggle') return -1;
    if(b.type==='toggle' && a.type!=='toggle') return 1;
    return a.name.localeCompare(b.name);
  });

  let currentDir = null;
  for(const it of order){
    if(it.dir && it.dir !== currentDir){
      currentDir = it.dir;
      const sec = document.createElement('div');
      sec.className = 'section';
      sec.textContent = '▸ ' + currentDir;
      grid.appendChild(sec);
    }
    if(!it.dir && currentDir){ /* back to root */ }
    const st = statusFor(it);
    const isAlive = st?.alive;
    const card = document.createElement('div');
    card.className = 'card' + (it.type==='toggle' ? ' toggle ' + (isAlive ? 'alive' : 'dead') : '');

    if(it.type === 'toggle'){
      card.innerHTML = `
        <div class="icon">${it.icon}</div>
        <div class="name">${it.name}</div>
        <div class="desc">${it.description}</div>
        <div class="status ${isAlive ? 'alive' : 'dead'}">${isAlive ? '● RUNNING' + (st.pid ? ' · PID '+st.pid : '') : '○ STOPPED'}</div>
        <div class="row">
          <span style="font-size:12px;color:#888">${isAlive ? 'Tap to STOP' : 'Tap to START'}</span>
          <button class="switch ${isAlive ? 'on' : ''}" aria-label="toggle"><div class="knob"></div></button>
        </div>
      `;
      card.style.cursor = 'pointer';
      card.addEventListener('click', ()=> doToggle(it));
    } else {
      // one-shot
      const isBlocked = it.id==='MCP_Orphan_Cleanup' && status.mcpOrphan && !status.mcpOrphan.canClean;
      card.innerHTML = `
        <div class="icon">${it.icon}</div>
        <div class="name">${it.name}</div>
        <div class="desc">${it.description}${isBlocked ? '<br><span style="color:#ff5a5a">⚠ Close OpenChamber first</span>' : ''}</div>
        <button class="runBtn" ${isBlocked ? 'disabled' : ''}>▶ Run</button>
      `;
      const btn = card.querySelector('.runBtn');
      btn.addEventListener('click', (e)=>{ e.stopPropagation(); doRun(it, btn); });
    }
    grid.appendChild(card);
  }
}

async function doToggle(it){
  const card = event.currentTarget;
  card.style.opacity = '.6';
  try{
    const r = await fetch('/api/toggle', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id: it.id})});
    const j = await r.json();
    if(j.error){ showToast(j.error, false); }
    else {
      showToast(`${it.name}: ${j.action.toUpperCase()} ${j.ok ? '✓' : '⚠ check'}`, j.ok);
    }
  }catch(e){ showToast(String(e), false); }
  card.style.opacity = '1';
  await new Promise(r=>setTimeout(r,600));
  load();
}

function closeModal(){ document.getElementById('modal').classList.remove('open'); }
function openModal(title, html){ document.getElementById('modalTitle').textContent = title; document.getElementById('modalBody').innerHTML = html; document.getElementById('modal').classList.add('open'); }

function renderDashboard(d){
  if(!d) return '<pre>no data</pre>';
  const h = d.helpers || {};
  const mk = (label, st) => `<div class="dashRow"><span><span class="dot ${st?.alive ? 'on' : 'off'}"></span>${label}</span><b style="color:${st?.alive ? '#2ecc71' : '#ff5a5a'}">${st?.alive ? 'ALIVE · PID '+st.pid : 'DEAD'}</b></div>`;
  let html = '<div class="dashGrid">';
  html += mk('Blender Local', h.blLocal);
  html += mk('Blender Server', h.blServer);
  html += mk('Houdini Local', h.houdiniLocal);
  html += mk('Houdini Server', h.houdiniServer);
  // local apps from strings like ALIVE:123:Title
  const lb = d.localApps?.blender || 'DEAD';
  const lh = d.localApps?.houdini || 'DEAD';
  const mcp = d.mcp ? `${d.mcp.sessions} session(s) — ${d.mcp.canClean ? 'can clean' : 'blocked (close OpenChamber)'}` : '';
  html += `<div class="dashRow"><span>Blender App</span><span style="font-size:11px;color:#888">${lb.startsWith('ALIVE') ? lb : 'not running'}</span></div>`;
  html += `<div class="dashRow"><span>Houdini App</span><span style="font-size:11px;color:#888">${lh.startsWith('ALIVE') ? lh : 'not running'}</span></div>`;
  html += `<div class="dashRow"><span>MCP</span><span style="font-size:11px;color:#888">${mcp}</span></div>`;
  html += '</div>';
  return html;
}

async function doRun(it, btn){
  btn.disabled = true;
  btn.textContent = '…';
  try{
    const r = await fetch('/api/run', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id: it.id})});
    const j = await r.json();
    if(j.error){ showToast(j.error, false); }
    else {
      if(it.id === '_HELPER_DASHBOARD'){
        const dashHtml = renderDashboard(j.dashboard) + (j.output ? `<pre>${j.output.replace(/</g,'&lt;')}</pre>` : '');
        openModal('Helper Dashboard', dashHtml);
        showToast('Dashboard loaded ✓');
      } else {
        showToast(`${it.name} launched ✓`);
        if(j.output){ openModal(it.name, `<pre>${j.output.replace(/</g,'&lt;')}</pre>`); }
      }
    }
  }catch(e){ showToast(String(e), false); }
  btn.disabled = false;
  btn.textContent = '▶ Run';
}

load();
refreshHealth();
setInterval(load, 5000);
setInterval(refreshHealth, 10000);
