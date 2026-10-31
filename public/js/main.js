// localized-static-ui
// Ứng dụng văn phòng ảo: dữ liệu, WebSocket, HUD, đồng hồ ngày/đêm, nhãn tên, panel nhân viên, modal. Cảnh 3D nằm trong scene/office3d.js
import { Office3D, QUALITY, LABEL_MODES } from './scene/office3d.js';
import { tr, ui, getLanguage, setLanguage, localizeDom, message, countText } from './i18n.js';
import { renderCard, activityLabel, whenText } from './agent-card.js';

const TOKEN = document.querySelector('meta[name="office-token"]').content;
const PROVIDER_LABEL = {
  'claude-code': 'Claude Code', 'codex': 'OpenAI Codex', 'anthropic-chat': 'Claude chat (API)',
  'openai-chat': 'OpenAI chat (API)', 'observer': tr('Read-Only Observer'),
};
const STATUS_LABEL = { unknown: tr('Unknown'), idle: tr('Idle'), queued: tr('Queued'), working: tr('Working'), waiting: tr('Waiting Review'), input: tr('Needs input'), error: tr('Error'), offline: tr('Offline') };
const SHAPES = { zone: tr('Khu cụm bàn'), lounge: tr('Lounge trung tâm'), room: tr('Phòng họp kính'), cafe: tr('Khu cà phê (giờ nghỉ)'), game: tr('Khu giải trí (giờ nghỉ)') };
const AMENITY = new Set(['cafe', 'game']);   // khu nghỉ: không xếp nhân viên vào
const THEMES = { docs: tr('Văn bản'), code: 'Code', design: tr('Thiết kế'), charts: tr('Biểu đồ'), media: tr('Mạng xã hội'), video: tr('Dựng phim') };

const DEPT_DISPLAY_EN = {
  'thiet-ke': 'Visual Design',
  'chien-luoc': 'Strategy & Content',
  'ky-thuat': 'Engineering & Web',
  'san-xuat-noi-dung': 'Content Production',
  'dieu-phoi': 'Coordination',
  'khach-hang': 'Client Services',
  'san-xuat-phim': 'Film Production',
  'ca-phe': 'Cafe',
  'giai-tri': 'Recreation',
};

// ---------------- Tiện ích
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hhmm = (ts) => new Date(ts).toLocaleTimeString(getLanguage()==='vi'?'vi-VN':'en-GB', {hour:'2-digit',minute:'2-digit',hour12:false});
const ago = (ts) => { const minutes=Math.round((Date.now()-ts)/60000); return minutes===0 ? (getLanguage()==='vi'?'Vừa xong':'Just now') : new Intl.RelativeTimeFormat(getLanguage()==='vi'?'vi':'en',{numeric:'auto'}).format(-minutes,'minute'); };
function toast(msg, ms = 3200) { const t = $('#toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(toast._t); toast._t = setTimeout(() => t.style.display = 'none', ms); }
async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, { method, headers: { 'content-type': 'application/json', 'x-office-token': TOKEN }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

// ---------------- Tệp đính kèm (dán ảnh, kéo thả, chọn tệp)
const fmtSize = (n) => n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB';
const fileUrl = (a) => ui`/files/${a.id}/${encodeURIComponent(a.name)}?t=${encodeURIComponent(TOKEN)}`;
const extOf = (n) => (String(n).split('.').pop() || '').slice(0, 4);
const MAX_FILES = 10, MAX_SIZE = 25 * 1024 * 1024;

/** Khay đính kèm gắn vào 1 ô nhập: dán / kéo thả / nút chọn tệp, tự tải lên ngay */
function makeTray({ list: listEl, input, dropZone, fileInput, button }) {
  const items = [];
  const render = () => {
    listEl.innerHTML = items.map((it, i) => ui`
      <div class="att ${it.status === 'uploading' ? 'uploading' : ''} ${it.status === 'error' ? 'err' : ''}" title="${esc(it.name)}">
        ${it.preview ? ui`<img src="${it.preview}" alt="" />` : ui`<div class="ficon">${esc(extOf(it.name))}</div>`}
        <div class="nm">${esc(it.name)}<small>${it.status === 'uploading' ? 'đang tải lên…' : it.status === 'error' ? 'lỗi tải lên' : fmtSize(it.size)}</small></div>
        <button class="x" type="button" data-rm="${i}" title="Bỏ tệp">×</button>
      </div>`).join('');
  };
  listEl.addEventListener('click', e => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    const [it] = items.splice(+b.dataset.rm, 1);
    if (it?.preview) URL.revokeObjectURL(it.preview);
    render();
  });
  async function add(files) {
    for (const f of files) {
      if (items.length >= MAX_FILES) { toast(ui`Tối đa ${MAX_FILES} tệp mỗi việc`); break; }
      if (f.size > MAX_SIZE) { toast(ui`${f.name} quá lớn (tối đa 25MB)`); continue; }
      let name = f.name || 'tep';
      if (/^image\.(png|jpe?g|gif|webp)$/i.test(name) || !f.name) { // ảnh dán từ clipboard
        const d = new Date(); const p = (n) => String(n).padStart(2, '0');
        name = ui`anh-dan-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`;
      }
      const it = { name, size: f.size, mime: f.type, status: 'uploading', preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null };
      items.push(it); render();
      try {
        const r = await fetch('/api/uploads', { method: 'POST', body: f, headers: {
          'x-office-token': TOKEN, 'content-type': 'application/octet-stream', 'x-filename': encodeURIComponent(name), 'x-mime': f.type || '' } });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || r.statusText);
        it.id = j.id; it.status = 'ok';
      } catch (err) { it.status = 'error'; toast(ui`Không tải lên được ${name}: ${err.message}`); }
      render();
    }
  }
  input.addEventListener('paste', e => {
    const files = [...(e.clipboardData?.files ?? [])];
    if (!files.length) return;
    if (!e.clipboardData.getData('text/plain')) e.preventDefault(); // chỉ có ảnh → không dán chữ rác
    add(files);
  });
  let depth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  dropZone.addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); depth++; dropZone.classList.add('dragging'); });
  dropZone.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  dropZone.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; dropZone.classList.remove('dragging'); } });
  dropZone.addEventListener('drop', e => {
    if (!hasFiles(e)) return; e.preventDefault(); depth = 0; dropZone.classList.remove('dragging');
    add([...e.dataTransfer.files]);
  });
  button.onclick = () => fileInput.click();
  fileInput.onchange = () => { add([...fileInput.files]); fileInput.value = ''; };
  return {
    busy: () => items.some(it => it.status === 'uploading'),
    ids: () => items.filter(it => it.status === 'ok').map(it => it.id),
    count: () => items.filter(it => it.status === 'ok').length,
    clear: () => { items.forEach(it => it.preview && URL.revokeObjectURL(it.preview)); items.length = 0; render(); },
  };
}
const attHtml = (atts) => atts?.length ? ui`<div class="ev-atts">${atts.map(a => /^image\//.test(a.mime)
  ? ui`<a class="img" href="${fileUrl(a)}" target="_blank" rel="noopener" title="${esc(a.name)}"><img src="${fileUrl(a)}" alt="${esc(a.name)}" loading="lazy" /></a>`
  : ui`<a href="${fileUrl(a)}" title="Tải ${esc(a.name)}"><div class="ficon">${esc(extOf(a.name))}</div><span>${esc(a.name)}</span></a>`).join('')}</div>` : '';

// ---------------- Trạng thái
const state = { departments: [], agents: [], permissions: [], approvals: [], approvalSummary: null, feed: [], providers: [], usageToday: null, javisViewer: null };
const fmtTok = (n) => !n ? '0' : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'k' : String(Math.round(n));
const fmtUsd = (v) => v >= 100 ? '$' + v.toFixed(0) : v >= 1 ? '$' + v.toFixed(2) : v > 0 ? '$' + v.toFixed(3) : '$0';
const fmtVnd = (v, rate) => rate ? ' · ' + Math.round(v * rate).toLocaleString('vi-VN') + '₫' : '';
const usageOf = (id) => state.usageToday?.agents.find(a => a.agentId === id);
let selectedId = null;
const agentById = (id) => state.agents.find(a => a.id === id);
const deptById = (id) => state.departments.find(d => d.id === id);
const deptDisplayName = (id) => localizedDept(deptById(id))?.name ?? id;

// ---------------- Cảnh 3D
const params = new URLSearchParams(location.search);
const office = new Office3D($('#stage'), {
  onPick: (id) => { hideCard(true); openPanel(id); },
  onHover: (id, e) => showHover(id, e),
  onPreview: (id, e) => showPreview(id, e),
  onProgress: (msg) => { $('#loading-text').textContent = tr(msg); },
});
if (params.get('q') && QUALITY[params.get('q')]) office.quality = params.get('q');
if (params.get('auto') === '0') office.autoQuality = false;
if (params.get('nghi') === 'nhanh') office.leisureSpeed = 10;   // thử nhanh cảnh đi nghỉ
if (params.get('labels') && LABEL_MODES[params.get('labels')]) office.setLabelMode(params.get('labels'));
office.onLeisure = () => renderHud();
office.onQualityAuto = (q) => { renderQuality(); toast(ui`Your device is slow - render quality changed to "${tr(QUALITY[q])}"`); };

function renderQuality() { $('#btn-quality').textContent = ui`Chất lượng: ${tr(QUALITY[office.quality])}`; }
$('#btn-quality').onclick = () => {
  const order = ['high', 'medium', 'low'];
  office.autoQuality = false;
  office.applyQuality(order[(order.indexOf(office.quality) + 1) % 3]);
  renderQuality();
};
$('#btn-overview').onclick = () => office.overview();

function renderLabelToggle() {
  const btn = $('#btn-labels');
  if (!btn) return;
  btn.textContent = ui`Labels: ${tr(LABEL_MODES[office.labelMode] ?? tr('Always'))}`;
}
$('#btn-labels').onclick = () => {
  const order = ['always', 'hover', 'off'];
  const next = order[(order.indexOf(office.labelMode) + 1) % order.length];
  office.setLabelMode(next);
  renderLabelToggle();
};

// ---------------- Đồng hồ địa phương & Ngày/Đêm (hỗ trợ test-time override)
let clockSceneReady=false;
let clockOverride = params.get('time') || params.get('clock') || null;
const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
function parseClockOverride(val) {
 if(!val)return null;
 const value=String(val).trim().toLowerCase();
 if(value==='day')return {hh:10,mm:30};
 if(value==='night')return {hh:22,mm:15};
 const parts=value.split(':');
 if(parts.length<2||parts.length>3||parts.some(p=>!p||!Number.isInteger(Number(p))))return null;
 const [hh,mm,ss=0]=parts.map(Number);
 if(hh<0||hh>23||mm<0||mm>59||ss<0||ss>59)return null;
 return {hh,mm};
}
function updateClockAndEnvironment() {
 const ov=parseClockOverride(clockOverride),now=new Date();
 const hh=ov?ov.hh:now.getHours(),mm=ov?ov.mm:now.getMinutes();
 const timeStr=String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0');
 const isDay=hh>=7&&hh<19,mode=isDay?'day':'night';if(clockSceneReady)office.setDayNight(mode);
 const el=$('#hud-clock');
 if(el){el.textContent=message(mode,{time:timeStr});el.title=message('timezone',{zone:localTz,override:ov?message('override'):''});el.classList.toggle('is-day',isDay);el.classList.toggle('is-night',!isDay);}
 return {hh,isDay,mode,timeStr,timeZone:localTz,override:!!ov};
}
window.__setClockOverride=val=>{clockOverride=val;return updateClockAndEnvironment();};
let clockTimer;
function scheduleClock(){clearTimeout(clockTimer);clockTimer=setTimeout(()=>{updateClockAndEnvironment();scheduleClock();},60000-Date.now()%60000+15);}
scheduleClock();
document.addEventListener('visibilitychange',()=>{if(!document.hidden){updateClockAndEnvironment();scheduleClock();}});

// ---------------- HUD & feed
function applyViewerModeUi() {
  const v = state.javisViewer;
  const ro = !!v?.readOnly;
  for (const sel of ['#btn-brief', '#btn-add', '#btn-attach']) {
    const el = $(sel);
    if (el) el.style.display = ro ? 'none' : '';
  }
  const banner = $('#viewer-banner');
  if (!banner) return;
  if (ro) {
    banner.style.display = 'block';
    $('#hud-eyebrow').textContent = tr('JAVIS WORKFORCE · READ-ONLY VIEWER');
    const conn = v.liveConnection || 'DISCONNECTED';
    const pills = v.mode === 'LIVE'
      ? [ui`<span class="vb-pill readonly">${esc(message('pill.readonly'))}</span>`,
         `<span class="vb-pill ${conn === 'CONNECTED' ? 'live' : conn === 'STALE' ? 'stale' : 'disconnected'}">${esc(message('pill.' + conn))}</span>`]
      : [
      tr('<span class="vb-pill mock">DEMO / LOCAL SAMPLE</span>'),
      ui`<span class="vb-pill readonly">READ-ONLY</span>`,
      ui`<span class="vb-pill disconnected">LIVE: ${esc(tr(v.liveConnection || 'DISCONNECTED'))}</span>`,
    ];
    if (v.mode === 'MOCK_DETERMINISTIC') {
      pills.push(ui`<span class="vb-pill mock">MOCK: ${esc(v.scenarioId || 'ACTIVE')} (${v.appliedEvents} events)</span>`);
    }
    $('#viewer-pills').innerHTML = pills.join('');
    $('#viewer-reason').textContent = v.mode === 'LIVE' ? message('live.reason.' + conn) : message('unavailable');
  } else {
    banner.style.display = state.executionEnabled ? 'none' : 'block';
    $('#hud-eyebrow').textContent = tr('Original Studio · LOCAL');
    if (!state.executionEnabled) { $('#viewer-pills').textContent = tr('STUDIO WORKERS HELD'); $('#viewer-reason').textContent = tr('Task execution is disabled until explicitly enabled. Local data only.'); }
  }
}

function renderHud() {
  applyViewerModeUi();
  const v = state.javisViewer;
  const ro = !!v?.readOnly;
  const live = v?.mode === 'LIVE';
  const liveUp = live && (v.liveConnection === 'CONNECTED' || v.liveConnection === 'STALE');
  const working = state.agents.filter(a => a.status === 'working' || a.status === 'waiting');
  const subagents = state.agents.filter(a => a.actorKind === 'subagent');
  const lead = working.find(a => a.status === 'waiting') ?? working[0];
  if (live && !liveUp) {
    $('#hud-title').textContent = message('disconnected');
    $('#hud-sub').textContent = message('live.reason.' + (v.liveConnection || 'DISCONNECTED'));
  } else if (lead) {
    const dept = deptDisplayName(lead.departmentId);
    $('#hud-title').textContent = lead.status === 'waiting'
      ? message('review',{name:lead.name})
      : message('active',{department:dept});
    const title = lead.card?.task?.title ?? lead.currentTask?.prompt;
    $('#hud-sub').textContent = (title ? (lead.dataSource==='DEMO'?tr(title):title).slice(0,110) : null) || ui`${lead.name} · ${lead.role}`;
  } else {
    if (live) {
      $('#hud-title').textContent = message('hud.idleLive');
      $('#hud-sub').textContent = message('hud.liveRoster', { count: state.agents.length });
    } else if (ro) {
      $('#hud-title').textContent = v.mode === 'MOCK_DETERMINISTIC'
        ? message('demo')
        : message('disconnected');
      $('#hud-sub').textContent = message(v.mode === 'DISCONNECTED'?'unavailable':'demoDetail');
    } else {
      $('#hud-title').textContent = message(state.agents.length?'idle':'empty');
      $('#hud-sub').textContent = message(state.agents.length?'idleHint':'emptyHint');
    }
  }
  renderApprovalsHud();
  if (ro && !live && v.mode === 'DISCONNECTED') { $('#hud-count').textContent=message('unknownCount',{count:state.agents.length}); return; }
  if (live && !liveUp) { $('#hud-count').textContent = countText('actors', state.agents.length); return; }
  const q=state.agents.reduce((s,a)=>s+(a.queued||0),0),t=state.usageToday?.total;
  const spend=!ro&&t&&(t.input+t.output)>0?ui` · Hôm nay ${fmtTok(t.input+t.output+t.cacheRead+t.cacheWrite)} token${t.costUsd>0?' ~'+fmtUsd(t.costUsd):''}`:'';
  const lc=office.leisureCounts?.()??{cafe:0,game:0};
  const parts=[countText('working',working.filter(a=>a.status==='working').length),countText(ro&&!live?'demoActors':'actors',state.agents.length)];
  if(live){const ni=state.agents.filter(a=>a.status==='input').length;if(ni)parts.push(countText('needsInput',ni));}
  if(!live&&working.some(a=>a.status==='waiting'))parts.push(countText('waiting',working.filter(a=>a.status==='waiting').length));if(q)parts.push(countText('queued',q));if(subagents.length)parts.push(countText('subagents',subagents.length));if(lc.cafe)parts.push(countText('cafe',lc.cafe));if(lc.game)parts.push(countText('game',lc.game));
  $('#hud-count').textContent=parts.join(' · ')+spend;
}
/** Pending-approval counter. Counts only confirmed approval records; unavailable is shown as such, never as zero. */
function renderApprovalsHud() {
  const el = $('#hud-approvals');
  if (!el) return;
  const ro = !!state.javisViewer?.readOnly, sum = state.approvalSummary;
  document.body.classList.toggle('hud-attn', ro && !!sum?.available && sum.pending > 0);
  el.className = ''; el.onclick = null; el.removeAttribute('title');
  if (!ro || !sum) { el.textContent = ''; return; }
  if (!sum.available || sum.pending == null) { el.className = 'unknown'; el.textContent = message('hud.approvalsUnknown'); return; }
  el.textContent = countText('approvals', sum.pending);
  if (sum.pending > 0) {
    el.className = 'has';
    el.onclick = () => { const first = state.approvals[0]; if (first) { office.flyTo(first.agentId); openPanel(first.agentId); } };
  } else el.className = 'none';
}
/** Dòng sự kiện góc dưới: chỉ giữ tin trong 2 phút gần nhất cho đỡ che khu cà phê / giải trí */
/** Structured live events are rendered from message keys (EN/VI); older text events keep the existing DEMO translation. */
function feedText(e, a) {
  const m = e.data?.msg;
  if (m) {
    const key = m.key === 'feed.approvalRequested' && m.values?.title ? 'feed.approvalRequestedTitle' : m.key;
    try { return message(key, m.values ?? {}); } catch { /* fall through to the stored text */ }
  }
  return a?.dataSource === 'DEMO' ? tr(e.text) : e.text;
}
function renderFeed() {
  const fresh = state.feed.filter(e => Date.now() - e.ts < 120000);
  $('#feed').innerHTML = fresh.slice(-4).map(e => {
    const a = agentById(e.agentId);
    if (e.data?.msg) return ui`<div>${hhmm(e.ts)} · ${esc(feedText(e, a).slice(0,120))}</div>`;   // structured lines already name the agent
    return ui`<div>${hhmm(e.ts)} · <b>${esc(a?.name ?? e.agentId)}</b>: ${esc(feedText(e, a).slice(0,110))}</div>`;
  }).join('');
}

setInterval(renderFeed, 15000);

// ---------------- Thẻ hover / xem nhanh
let cardAgentId = null, cardPinned = false;
const cardEl = () => $('#agent-card');
function fillCard(id, pinned) {
  const a = agentById(id), el = cardEl();
  if (!a) return false;
  el.innerHTML = renderCard(a, { detailed: false, pinned, zoneName: deptDisplayName(a.departmentId), statusLabel: tr(STATUS_LABEL[a.status] ?? a.status) })
    + (pinned ? `<div class="ac-actions"><button class="btn small primary" type="button" data-card-details>${esc(message('card.details'))}</button><button class="btn small" type="button" data-card-close>${esc(message('card.close'))}</button></div><div class="ac-sub" style="margin-top:6px">${esc(message('card.tapAgain'))}</div>` : '');
  return true;
}
function placeCard(x, y) {
  const el = cardEl(), pad = 12;
  el.style.display = 'block';
  const w = el.offsetWidth, h = el.offsetHeight;
  let left = x + 18, top = y + 16;
  if (left + w > innerWidth - pad) left = x - w - 18;
  if (left < pad) left = pad;
  if (top + h > innerHeight - pad) top = innerHeight - h - pad;
  if (top < pad) top = pad;
  el.style.left = left + 'px'; el.style.top = top + 'px';
}
function hideCard(force = false) {
  if (cardPinned && !force) return;
  cardPinned = false; cardAgentId = null;
  const el = cardEl(); el.classList.remove('pinned', 'sheet'); el.style.display = 'none';
}
function showHover(id, e) {
  if (cardPinned) return;
  if (!id) return hideCard();
  if (selectedId === id && document.body.classList.contains('panel-open')) return hideCard();
  if (cardAgentId !== id) { if (!fillCard(id, false)) return hideCard(); cardAgentId = id; }
  if (e) placeCard(e.clientX, e.clientY);
}
function showPreview(id, e) {
  if (!id) return hideCard(true);
  if (!fillCard(id, true)) return;
  cardAgentId = id; cardPinned = true;
  const el = cardEl(); el.classList.add('pinned', 'sheet');
  el.style.left = el.style.top = ''; el.style.display = 'block';   // bottom sheet: never covers the person who was tapped
}
cardEl().addEventListener('click', ev => {
  if (ev.target.closest('[data-card-close]')) return hideCard(true);
  if (ev.target.closest('[data-card-details]')) { const id = cardAgentId; hideCard(true); office.previewId = null; if (id) openPanel(id); }
});
window.addEventListener('office-language', () => { if (cardAgentId) { fillCard(cardAgentId, cardPinned); } });

// ---------------- Panel nhân viên
async function openPanel(id) {
  selectedId = id; $('#panel').classList.add('open'); document.body.classList.add('panel-open'); renderPanel(); office.select(id);
  const evs = await api(ui`/agents/${id}/events?limit=200`).catch(() => []);
  if (selectedId !== id) return;
  $('#log').innerHTML = ''; evs.forEach(appendLog); $('#log').scrollTop = 1e9;
}
function closePanel() { selectedId = null; $('#panel').classList.remove('open'); document.body.classList.remove('panel-open'); office.select(null); }
function renderPanel() {
  const a = agentById(selectedId); if (!a) return closePanel();
  const ro = !!state.javisViewer?.readOnly;
  $('#p-name').textContent = a.name;
  $('#p-role').textContent = ui`${a.role || '-'} · ${deptDisplayName(a.departmentId)}`;
  const chips = [
    ui`<span class="chip status-${a.status}">${a.card ? esc(activityLabel(a.card.activity)) : tr(STATUS_LABEL[a.status] ?? a.status)}</span>`,
    ui`<span class="chip">${tr(PROVIDER_LABEL[a.provider] ?? a.provider)}</span>`,
  ];
  if (a.actorKind === 'subagent') {
    chips.push(ui`<span class="chip kind-subagent">Temporary Subagent</span>`);
    if (a.parentId) chips.push(ui`<span class="chip">Parent: ${esc(a.parentId)}</span>`);
  } else if (a.actorKind === 'persistent') {
    chips.push(ui`<span class="chip">Persistent Agent</span>`);
  }
  if (a.model) chips.push(ui`<span class="chip">${esc(a.model)}</span>`);
  if (a.permissionMode && !['anthropic-chat', 'openai-chat', 'observer'].includes(a.provider)) chips.push(ui`<span class="chip">quyền: ${a.permissionMode}</span>`);
  if (a.sessionId) chips.push(ui`<span class="chip" title="${esc(a.sessionId)}">phiên ${esc(a.sessionId.split(/[\\/]/).pop().slice(0, 10))}…</span>`);
  if (a.queued) chips.push(ui`<span class="chip status-queued">${a.queued} việc chờ</span>`);
  const u = usageOf(a.id);
  if (u) chips.push(ui`<span class="chip chip-cost" title="Token vào ${fmtTok(u.input)} · ra ${fmtTok(u.output)} · cache ${fmtTok(u.cacheRead + u.cacheWrite)}">Hôm nay: ${fmtTok(u.input + u.output + u.cacheRead + u.cacheWrite)} token${u.costUsd > 0 ? ' · ~' + fmtUsd(u.costUsd) : u.unpriced ? ' · chưa có giá' : ''}</span>`);
  $('#p-chips').innerHTML = chips.join('');
  $('#p-card').innerHTML = renderCard(a, { detailed: true, pinned: true, zoneName: deptDisplayName(a.departmentId), statusLabel: tr(STATUS_LABEL[a.status] ?? a.status) });
  const observer = ro || a.provider === 'observer';
  $('#composer').style.display = observer ? 'none' : 'flex';
  $('#p-stop').style.display = observer ? 'none' : '';
  $('#p-reset').style.display = observer ? 'none' : '';
  $('#p-edit').style.display = ro ? 'none' : '';
  $('#p-del').style.display = ro ? 'none' : '';
  renderPerms();
}
function renderPerms() {
  const ro = !!state.javisViewer?.readOnly;
  if (ro) { $('#perms').innerHTML = state.permissions.filter(p => p.agentId === selectedId).map(p => tr('<div class="perm"><b>DEMO approval · Read-only</b><pre data-user-content>') + esc(JSON.stringify(p.input, null, 2)) + '</pre></div>').join(''); return; }
  const list = state.permissions.filter(p => p.agentId === selectedId);
  $('#perms').innerHTML = list.map(p => ui`
    <div class="perm"><b>Xin quyền: ${esc(p.tool)}</b>
      <pre>${esc(JSON.stringify(p.input, null, 2).slice(0, 1500))}</pre>
      <button class="btn small primary" data-perm="${p.id}" data-allow="1">Cho phép</button>
      <button class="btn small danger" data-perm="${p.id}" data-allow="0">Từ chối</button>
    </div>`).join('');
}
$('#perms').addEventListener('click', async e => {
  const b = e.target.closest('[data-perm]'); if (!b) return;
  b.disabled = true;
  await api(ui`/permissions/${b.dataset.perm}`, 'POST', { allow: b.dataset.allow === '1' }).catch(err => toast(tr(err.message)));
});
function appendLog(e) {
  const el = document.createElement('div'); el.className = ui`ev k-${e.kind}`;
  el.innerHTML = ui`<time>${hhmm(e.ts)} · ${e.kind}</time>${esc(feedText(e, agentById(e.agentId)))}${attHtml(e.data?.attachments)}`;
  const log = $('#log'); const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
  log.appendChild(el); if (atBottom) log.scrollTop = 1e9;
}
const panelTray = makeTray({ list: $('#p-atts'), input: $('#p-input'), dropZone: $('#composer'), fileInput: $('#p-file'), button: $('#p-attach') });
async function sendTask() {
  const prompt = $('#p-input').value.trim(); if ((!prompt && !panelTray.count()) || !selectedId) return;
  if (panelTray.busy()) return toast(tr('Đợi tải tệp lên xong rồi giao nhé'));
  $('#p-send').disabled = true;
  try { await api(ui`/agents/${selectedId}/tasks`, 'POST', { prompt, attachments: panelTray.ids() }); $('#p-input').value = ''; panelTray.clear(); }
  catch (err) { toast(tr(err.message)); }
  finally { $('#p-send').disabled = false; }
}
$('#p-send').onclick = sendTask;
$('#p-input').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendTask(); });
$('#p-close').onclick = closePanel;
$('#p-focus').onclick = () => selectedId && office.flyTo(selectedId);
$('#p-stop').onclick = () => api(ui`/agents/${selectedId}/stop`, 'POST').then(r => toast(ui`Đã dừng${r.cancelledQueued ? ui`, huỷ ${r.cancelledQueued} việc chờ` : ''}`)).catch(e => toast(e.message));
$('#p-reset').onclick = () => confirm(tr('Bắt đầu phiên mới? Nhân viên sẽ quên ngữ cảnh cũ.')) && api(ui`/agents/${selectedId}/reset`, 'POST').catch(e => toast(e.message));
$('#p-del').onclick = () => { const a = agentById(selectedId); if (a && confirm(ui`Xoá ${a.name} khỏi văn phòng?`)) api(ui`/agents/${a.id}`, 'DELETE').then(closePanel).catch(e => toast(e.message)); };
$('#p-edit').onclick = () => agentForm(agentById(selectedId));

// ---------------- Modal
function openModal(html) { $('#modal-box').innerHTML = html; $('#modal').classList.add('open'); const actions=$('#modal-box .modal-actions'); if(actions){const b=document.createElement('button');b.type='button';b.className='btn';b.id='modal-language';b.textContent='EN / VI';b.onclick=()=>setLanguage(getLanguage()==='en'?'vi':'en');actions.prepend(b);} localizeDom(); }
function closeModal() { $('#modal').classList.remove('open'); }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.dataset.close !== undefined) closeModal(); });
const opt = (v, cur, label = v) => ui`<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;

function agentForm(a = {}, isEdit = !!a.id && !!agentById(a.id)) {
  openModal(ui`
    <h3>${isEdit ? 'Sửa nhân viên' : tr('Tuyển nhân viên mới')}</h3>
    <form id="agent-form">
      <div class="row2">
        <div class="field"><label>Tên hiển thị</label><input name="name" required value="${esc(a.name)}" /></div>
        <div class="field"><label>Phòng ban</label><select name="departmentId">${state.departments.filter(d => !AMENITY.has(d.style?.shape)).map(d => opt(d.id, a.departmentId, deptDisplayName(d.id))).join('')}</select></div>
      </div>
      <div class="field"><label>Vai trò</label><input name="role" value="${esc(a.role)}" placeholder="VD: Viết copy Naver tiếng Hàn" /></div>
      <div class="row2">
        <div class="field"><label>Loại nhân viên</label><select name="provider">${state.providers.map(p => opt(p, a.provider ?? 'claude-code', PROVIDER_LABEL[p])).join('')}</select></div>
        <div class="field" data-for="claude-code codex anthropic-chat openai-chat"><label>Model (bỏ trống = mặc định)</label><input name="model" value="${esc(a.model)}" /></div>
      </div>
      <div class="field" data-for="claude-code codex"><label>Thư mục làm việc (cwd)</label><input name="cwd" value="${esc(a.cwd)}" placeholder="C:\\du-an\\web hoặc /home/ban/du-an" /><small>Agent chỉ nên đọc/ghi trong thư mục này.</small></div>
      <div class="field" data-for="claude-code codex"><label>Quyền</label><select name="permissionMode">
        ${opt('default', a.permissionMode ?? 'default', tr('Hỏi trước khi sửa file / chạy lệnh'))}
        ${opt(tr('acceptEdits'), a.permissionMode, tr('Tự sửa file, hỏi khi chạy lệnh'))}
        ${opt('plan', a.permissionMode, tr('Chỉ đọc & lập kế hoạch'))}
        ${opt(tr('bypassPermissions'), a.permissionMode, tr('⚠ Toàn quyền, không hỏi'))}
      </select></div>
      <div class="field" data-for="observer claude-code codex openai-chat"><label>${tr(a.provider === 'observer' ? 'Session / thread ID (JSONL file path)' : 'Session / thread ID (blank = new session)')}</label><input name="sessionId" value="${esc(a.sessionId)}" /></div>
      <div class="field" data-for="claude-code codex anthropic-chat openai-chat"><label>Hướng dẫn riêng (system prompt)</label><textarea name="systemPrompt">${esc(a.systemPrompt)}</textarea></div>
      <div class="modal-actions"><button type="button" class="btn" data-close>Huỷ</button><button class="btn primary">${isEdit ? 'Lưu' : tr('Tuyển')}</button></div>
    </form>`);
  const form = $('#agent-form');
  const sync = () => { const p = form.provider.value; form.querySelectorAll('[data-for]').forEach(el => el.style.display = el.dataset.for.split(' ').includes(p) ? '' : 'none'); };
  form.provider.onchange = sync; sync();
  form.onsubmit = async e => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    try {
      if (body.permissionMode === tr('bypassPermissions') && !confirm(tr('Toàn quyền: agent có thể chạy MỌI lệnh trên máy bạn mà không hỏi. Chắc chắn?'))) return;
      if (isEdit) await api(ui`/agents/${a.id}`, 'PATCH', body);
      else { const c = await api('/agents', 'POST', body); setTimeout(() => openPanel(c.id), 400); }
      closeModal();
    } catch (err) { toast(tr(err.message)); }
  };
}
$('#btn-add').onclick = () => agentForm({ departmentId: state.departments[0]?.id });

// Gắn phiên có sẵn
$('#btn-attach').onclick = async () => {
  openModal(tr('<h3>Gắn phiên có sẵn</h3><p style="color:var(--muted)">Đang quét ~/.claude/projects và ~/.codex/sessions…</p>'));
  let list = [];
  try { list = await api('/discover'); } catch (e) { return openModal(ui`<h3>Lỗi</h3><p>${esc(e.message)}</p>`); }
  openModal(ui`
    <h3>Gắn phiên có sẵn</h3>
      <div class="warnbox">${tr("Observe an existing terminal session without controlling it. Taking over resumes the session and allows new tasks. Close that session in your terminal first to prevent conflicting writes.")}</div>
    ${list.length ? '' : tr('<p style="color:var(--muted)">Không tìm thấy phiên nào.</p>')}
    ${list.map((s, i) => ui`
      <div class="sess">
        <div class="top"><span>${s.source === 'claude' ? 'Claude Code' : 'Codex'} · ${esc(s.project)}</span><span data-relative-time="${esc(s.mtime)}">${ago(s.mtime)}</span></div>
        <div class="pv"${s.preview ? '' : ' data-empty-preview'}>${esc(s.preview || tr('(không có xem trước)'))}</div>
        <button class="btn small" data-i="${i}" data-mode="observe">Quan sát</button>
        <button class="btn small" data-i="${i}" data-mode="control">Tiếp quản</button>
      </div>`).join('')}
    <div class="modal-actions"><button class="btn" data-close>Đóng</button></div>`);
  $('#modal-box').onclick = e => {
    const b = e.target.closest('[data-mode]'); if (!b) return;
    const s = list[+b.dataset.i];
    const name = (s.preview || s.project).slice(0, 28) || 'Phiên';
    const dept = state.departments.find(d => d.id === 'ky-thuat')?.id ?? state.departments[0]?.id;
    $('#modal-box').onclick = null;
    if (b.dataset.mode === 'observe') agentForm({ name, role: tr('Phiên terminal'), departmentId: dept, provider: 'observer', sessionId: s.file }, false);
    else agentForm({ name, role: tr('Phiên tiếp quản'), departmentId: dept, provider: s.source === 'claude' ? 'claude-code' : 'codex', sessionId: s.sessionId, cwd: s.cwd || '', permissionMode: 'default' }, false);
  };
};

// Giao brief
$('#btn-brief').onclick = () => {
  const lead = state.agents.find(a => a.departmentId === 'dieu-phoi' && a.provider !== 'observer') ?? state.agents.find(a => a.provider !== 'observer');
  if (!lead) return toast(tr('Chưa có nhân viên nào nhận việc được'));
  openModal(ui`
    <h3>Giao brief</h3>
    <form id="brief-form">
      <div class="field"><label>Người nhận</label><select name="to">${state.agents.filter(a => a.provider !== 'observer').map(a => ui`<option value="${a.id}" ${a.id === lead.id ? 'selected' : ''}>${esc(a.name)} - ${esc(deptDisplayName(a.departmentId))}</option>`).join('')}</select></div>
      <div class="field brief-drop" id="brief-drop"><label>Brief</label><textarea name="prompt" style="min-height:140px" placeholder="VD: Lên 3 mẫu quảng cáo Naver Power Content cho resort ở Phú Quốc, khách Hàn 30-45 tuổi, kèm gợi ý hình ảnh. Dán ảnh tham khảo bằng Ctrl+V hoặc kéo thả tệp vào đây."></textarea>
        <div class="drop-hint">Thả tệp vào để đính kèm</div></div>
      <div class="atts" id="brief-atts" style="margin:-4px 0 10px"></div>
      <input type="file" id="brief-file" multiple hidden />
      <div class="modal-actions"><button type="button" class="btn" id="brief-attach" style="margin-right:auto">Đính kèm tệp</button><button type="button" class="btn" data-close>Huỷ</button><button class="btn primary">Giao</button></div>
    </form>`);
  const f0 = $('#brief-form');
  const tray = makeTray({ list: $('#brief-atts'), input: f0.prompt, dropZone: $('#brief-drop'), fileInput: $('#brief-file'), button: $('#brief-attach') });
  f0.onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    if (tray.busy()) return toast(tr('Đợi tải tệp lên xong rồi giao nhé'));
    try { await api(ui`/agents/${f.to.value}/tasks`, 'POST', { prompt: f.prompt.value, attachments: tray.ids() }); closeModal(); openPanel(f.to.value); }
    catch (err) { toast(tr(err.message)); }
  };
};

// Sửa bố cục phòng ban
$('#btn-depts').onclick = () => {
  const list = state.departments;
  openModal(ui`
    <h3>Phòng ban</h3>
    <p style="color:var(--muted);margin:0 0 10px;font-size:12.5px">Sàn rộng x −18…18, z −14…14 (mét). Toạ độ là tâm khu vực.</p>
    <form id="dept-form">
      <div class="field"><label>Chọn phòng</label><select name="id">${list.map(d => opt(d.id, list[0]?.id, deptDisplayName(d.id))).join('')}${opt('__new', '', tr('+ Thêm phòng mới'))}</select></div>
      <div id="dept-fields"></div>
      <div class="modal-actions"><button type="button" class="btn" data-close>Đóng</button><button class="btn primary">Lưu</button></div>
    </form>`);
  const form = $('#dept-form');
  const readOnly = !!state.javisViewer?.readOnly;
  if (readOnly) form.querySelector('.btn.primary').hidden = true;
  const fill = () => {
    const d = deptById(form.id.value) ?? { id: '', name: '', color: '#6b6f78', x: 0, z: 9, w: 6, d: 4, style: { shape: 'zone', screenTheme: 'docs' } };
    const st = d.style ?? {};
    $('#dept-fields').innerHTML = ui`
      ${form.id.value === '__new' ? ui`<div class="field"><label>Mã (không dấu)</label><input name="newId" required pattern="[a-z0-9-]+" /></div>` : ''}
      <div class="row2">
        <div class="field"><label>Tên</label><input name="name" required value="${esc(d.name)}" /></div>
        <div class="field"><label>Chữ trên sàn</label><input name="label" value="${esc(st.label ?? '')}" placeholder="${esc(d.name)}" /></div>
      </div>
      <div class="row2">
        <div class="field"><label>Kiểu khu vực</label><select name="shape">${Object.entries(SHAPES).map(([k, v]) => opt(k, st.shape ?? 'zone', v)).join('')}</select></div>
        <div class="field"><label>Màn hình hiển thị</label><select name="screenTheme">${Object.entries(THEMES).map(([k, v]) => opt(k, st.screenTheme ?? 'docs', v)).join('')}</select></div>
      </div>
      <div class="row4">
        <div class="field"><label>Tâm x</label><input name="x" type="number" step="0.1" value="${d.x}" /></div>
        <div class="field"><label>Tâm z</label><input name="z" type="number" step="0.1" value="${d.z}" /></div>
        <div class="field"><label>Rộng</label><input name="w" type="number" step="0.1" min="2" value="${d.w}" /></div>
        <div class="field"><label>Sâu</label><input name="d" type="number" step="0.1" min="2" value="${d.d}" /></div>
      </div>
      <div class="field"><label>Màu thảm</label><input name="color" type="color" value="${esc(d.color)}" /></div>`;
  };
  const inspect = () => { fill(); if (readOnly) form.querySelectorAll('#dept-fields input, #dept-fields select').forEach(el => el.disabled = true); };
  if (readOnly) form.id.querySelector('option[value=__new]')?.remove();
  form.id.onchange = inspect; inspect();
  form.onsubmit = async e => {
    e.preventDefault();
    if (readOnly) return;
    const f = Object.fromEntries(new FormData(form));
    const id = f.id === '__new' ? f.newId : f.id;
    const prev = deptById(id)?.style ?? {};
    const body = { id, name: f.name, color: f.color, x: +f.x, z: +f.z, w: +f.w, d: +f.d, style: { ...prev, shape: f.shape, screenTheme: f.screenTheme, label: f.label || undefined, seed: prev.seed ?? Math.floor(Math.random() * 1000) } };
    try { await api('/departments', 'POST', body); toast(tr('Đã lưu phòng ban')); closeModal(); }
    catch (err) { toast(tr(err.message)); }
  };
};

// ---------------- Token & chi phí
async function loadUsageToday() {
  try { state.usageToday = await api('/usage?range=today'); renderHud(); if (selectedId) renderPanel(); } catch { /* bỏ qua */ }
}
const PROVIDER_SHORT = { 'claude-code': 'Claude Code', 'codex': 'Codex', 'anthropic-chat': 'Claude API', 'openai-chat': 'OpenAI API', 'observer': tr('Quan sát') };
let costRange = 'today';
async function renderCost(range = 'today') {
  costRange = range;
  const box = $('#cost-box'); if (!box) return;
  let d;
  try { d = await api('/usage?range=' + range); } catch (e) { box.innerHTML = ui`<p>${esc(e.message)}</p>`; return; }
  if (d.available === false) { box.innerHTML = tr('<p class="warnbox"><b>Usage: UNKNOWN</b><br>Live Javis usage and cost data are not connected. No observed totals are available.</p>'); return; }
  const rate = d.usdToVnd;
  const tabs = [['today', tr('Hôm nay')], ['7d', tr('7 ngày')], ['30d', tr('30 ngày')], ['all', tr('Tất cả')]]
    .map(([k, v]) => ui`<button class="btn small ${k === range ? 'primary' : ''}" data-range="${k}">${v}</button>`).join('');
  const name = (id) => esc(agentById(id)?.name ?? id + tr(' (đã xoá)'));
  const costCell = (r) => r.costUsd > 0 ? fmtUsd(r.costUsd) + fmtVnd(r.costUsd, rate) + (r.unpriced ? ' <span class="muted">+ phần chưa có giá</span>' : '') : (r.unpriced ? '<span class="muted">chưa có giá</span>' : '$0');
  const rows = d.agents.map(a => ui`
    <tr class="agent-row"><td><b>${name(a.agentId)}</b><div class="muted">${PROVIDER_SHORT[a.provider] ?? a.provider} · ${a.tasks} việc</div></td>
      <td>${fmtTok(a.input)}</td><td>${fmtTok(a.output)}</td><td>${fmtTok(a.cacheRead + a.cacheWrite)}</td><td class="num">${costCell(a)}</td></tr>
    ${a.models.map(m => ui`<tr class="model-row"><td>↳ ${esc(m.model)}</td><td>${fmtTok(m.input)}</td><td>${fmtTok(m.output)}</td><td>${fmtTok(m.cacheRead + m.cacheWrite)}</td><td class="num">${costCell(m)}</td></tr>`).join('')}`).join('');
  const t = d.total;
  const maxDay = Math.max(1, ...d.byDay.map(x => x.tokens));
  const bars = d.byDay.length > 1 ? ui`<div class="daybars">${d.byDay.map(x => ui`<div title="${x.day}: ${fmtTok(x.tokens)} token · ${fmtUsd(x.costUsd)}"><span style="height:${Math.max(3, x.tokens / maxDay * 100)}%"></span><em>${x.day.slice(8)}</em></div>`).join('')}</div>` : '';
  box.innerHTML = ui`
    <div class="cost-tabs">${tabs}</div>
    <div class="cost-total"><div><small>Tổng token</small><b>${fmtTok(t.input + t.output + t.cacheRead + t.cacheWrite)}</b></div>
      <div><small>Chi phí ước tính</small><b>${fmtUsd(t.costUsd)}${rate ? '<em>' + Math.round(t.costUsd * rate).toLocaleString('vi-VN') + '₫</em>' : ''}</b></div>
      <div><small>Số việc</small><b>${t.tasks}</b></div></div>
    ${bars}
    ${d.agents.length ? ui`<div class="cost-scroll"><table class="cost-table"><thead><tr><th>Nhân viên</th><th>Vào</th><th>Ra</th><th>Cache</th><th class="num">Chi phí</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : tr('<p class="muted">Chưa có việc nào trong khoảng thời gian này.</p>')}
    <p class="cost-note">• <b>Claude Code</b>: chi phí do Claude Code tự tính theo giá API. Nếu dùng gói Pro/Max (token OAuth) thì đây là <i>giá trị tương đương</i>, không phải tiền bị trừ - dùng để biết ai đang ngốn hạn mức nhiều nhất.<br>
    • <b>Codex / chat API</b>: chỉ có số token; muốn ra tiền thì điền giá vào <code>pricing.json</code> (USD / 1 triệu token). Thêm <code>usdToVnd</code> để hiện VNĐ.<br>
    • "Cache" là token đọc/ghi bộ nhớ đệm - rẻ hơn nhiều so với token vào thường.</p>`;
  box.querySelectorAll('[data-range]').forEach(b => b.onclick = () => renderCost(b.dataset.range));
}
$('#btn-cost').onclick = () => {
  openModal(tr('<h3>Token &amp; chi phí</h3><div id="cost-box"><p class="muted">Đang tải…</p></div><div class="modal-actions"><button class="btn" data-close>Đóng</button></div>'));
  renderCost('today');
};

// ---------------- Dữ liệu & WebSocket
async function loadState() {
  const s = await api('/state');
  Object.assign(state, s);
  window.dispatchEvent(new Event("office-state"));
  state.approvals ??= [];
  office.setData(state.departments.map(localizedDept), state.agents);
  renderHud(); renderFeed(); if (selectedId) renderPanel();
  if (cardAgentId && !fillCard(cardAgentId, cardPinned)) hideCard(true);
}
function connect() {
  const ws = new WebSocket(ui`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?token=${TOKEN}`);
  ws.onopen = () => loadState().then(() => { $('#loading').classList.add('done'); loadUsageToday(); }).catch(e => toast(e.message));
  ws.onmessage = (m) => {
    const { type, payload } = JSON.parse(m.data);
    if (type === 'status') {
      const a = agentById(payload.agentId);
      if (a) { a.status = payload.status; office.setStatus(a.id, a.status); renderHud(); if (a.id === selectedId) renderPanel(); }
      clearTimeout(connect._t); connect._t = setTimeout(() => loadState().catch(() => {}), 400);
    } else if (type === 'event') {
      if (['task', 'result', 'error', 'permission', 'system'].includes(payload.kind)) { state.feed.push(payload); state.feed = state.feed.slice(-30); renderFeed(); }
      if (payload.kind === 'task' && payload.data?.fromAgentId) office.courier(payload.data.fromAgentId, payload.agentId);
      if (payload.agentId === selectedId) appendLog(payload);
    } else if (type === 'permission') {
      state.permissions.push(payload); if (payload.agentId === selectedId) renderPerms();
      const a = agentById(payload.agentId); toast(ui`${a?.name ?? payload.agentId} xin quyền dùng ${payload.tool}`);
    } else if (type === 'permission-resolved') {
      state.permissions = state.permissions.filter(p => p.id !== payload.id); renderPerms();
    } else if (type === 'usage') {
      clearTimeout(connect._u); connect._u = setTimeout(() => { loadUsageToday(); if ($('#cost-box')) renderCost(costRange); }, 800);
    } else if (type === 'changed') loadState().catch(() => {});
  };
  ws.onclose = () => { $('#hud-title').textContent = tr('Mất kết nối, đang thử lại…'); setTimeout(connect, 2000); };
}


const DEPT_VI={'thiet-ke':'Thiết kế hình ảnh','chien-luoc':'Chiến lược · Nội dung','ky-thuat':'Kỹ thuật · Web','san-xuat-noi-dung':'Sản xuất nội dung','dieu-phoi':'Điều phối','khach-hang':'Bàn khách hàng','san-xuat-phim':'Sản xuất phim','ca-phe':'Cà phê','giai-tri':'Giải trí'};
function localizedDept(d){if(!d)return d;const en=DEPT_DISPLAY_EN[d.id],vi=DEPT_VI[d.id];if(!en||![en,vi].includes(d.name))return d;const name=getLanguage()==='vi'?vi:en;return {...d,name,style:{...d.style,label:(!d.style?.label||['Thiết kế','Chiến lược','Kỹ thuật','Marketing','Điều phối','Khách hàng','Phim','Cà phê','Giải trí',en,vi].includes(d.style.label))?name:d.style.label}};}
window.addEventListener('office-language',()=>{applyBadgeWords();localizeDom();renderHud();renderFeed();renderLabelToggle();renderQuality();updateClockAndEnvironment();if(selectedId)renderPanel();if($('#cost-box'))renderCost(costRange);office.setData(state.departments.map(localizedDept),state.agents);});
function applyBadgeWords() { office.setBadgeText({ approval: message('badge.approval'), input: message('badge.input') }); }
window.__officeUi={openModal,closeModal,openPanel,api,tr,ui,loadState,deptDisplayName};

// Chờ font tiếng Việt (chữ trên sàn vẽ bằng canvas) rồi mới dựng cảnh
updateClockAndEnvironment();
await Promise.all([document.fonts.load('600 64px "Be Vietnam Pro"'), document.fonts.load('400 14px "Be Vietnam Pro"')]).catch(() => {});
await office.init();
applyBadgeWords();
clockSceneReady=true;
renderQuality();
renderLabelToggle();
updateClockAndEnvironment();
window.__office = office; // tiện debug: __office.stats()
window.__state = state;
connect();

window.addEventListener('office-language',()=>{document.querySelectorAll('select[name=departmentId] option,select[name=id] option').forEach(o=>{if(deptById(o.value))o.textContent=deptDisplayName(o.value);});document.querySelectorAll('select[name=to] option').forEach(o=>{const a=agentById(o.value);if(a)o.textContent=a.name+' - '+deptDisplayName(a.departmentId);});});

// Refresh only generated session metadata; preserve actual user preview text.
window.addEventListener('office-language',()=>{document.querySelectorAll('[data-relative-time]').forEach(el=>{el.textContent=ago(Number(el.dataset.relativeTime));});document.querySelectorAll('[data-empty-preview]').forEach(el=>{el.textContent=tr('(không có xem trước)');});});
