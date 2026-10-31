import {modeReady,switchOfficeMode} from './office-mode.js';
// Deterministic local DEMO director (UX v0.3 slice B).
// Pure client-side fixtures: no Javis request, no task creation, no model call, no mutation of Kyan data.
// It only drives the existing scene hooks (office.setStatus / office.courier) on already-loaded roster characters.
import { getLanguage } from './i18n.js';

const T = {
  en: {
    title: { team: 'Team Collaboration', workflow: 'Workflow Execution' },
    ribbon: 'DEMO · simulated scenario · not real Javis work',
    play: 'Play', pause: 'Pause', replay: 'Replay', reset: 'Reset', live: 'Return to Live',
    speed: 'Speed', done: 'Completed', step: 'Step', time: 'Time',
    pick: 'Choose a DEMO scenario', pickNote: 'Fixed local samples. They do not start agents, create Javis tasks or call any model.',
    teamDesc: 'Leader assigns work, agents work in parallel, hand work over, request approval and finish.',
    wfDesc: 'Sequential and parallel steps with visible dependencies, handoffs and completion states.',
    returning: 'Fetching the latest authenticated Javis snapshot…', liveFail: 'Could not refresh from Javis. The viewer shows its own connection state.',
    need: 'Not enough roster characters for this scenario (need at least 4).',
    hud: {
      eyebrow: 'DEMO · SIMULATED · NOT LIVE',
      stepOf: 'Step {n} of {total}', stepNone: 'Ready to start',
      workers: ['No simulated workers', '1 simulated worker', '{count} simulated workers'],
      approvals: ['No simulated approvals', '1 simulated approval pending', '{count} simulated approvals pending'],
      granted: '{count} granted (simulated)', progress: 'Progress {pct}%', finished: 'Scenario completed',
      reason: 'Simulated scenario. Live Javis activity is hidden while DEMO is on.',
      pill: 'DEMO', pillLive: 'Live paused',
      returnTitle: 'Reconnecting to Javis…', returnSub: 'Requesting a fresh authenticated snapshot. Cached data is not reused.',
    },
    st: { pending: 'Pending', active: 'In progress', waiting: 'Needs approval', done: 'Completed' },
    team: [
      'Leader plans and assigns the work',
      'Agents A and B work in parallel',
      'Agent A hands the draft to Agent C',
      'Agent C requests approval',
      'Approval granted (simulated)',
      'Agent C returns the result to the Leader',
      'Leader reviews and closes the task',
    ],
    wf: [
      'Step 1 · Collect brief (sequential)',
      'Step 2a · Draft content (parallel)',
      'Step 2b · Prepare assets (parallel)',
      'Step 3 · Merge and review (waits for 2a + 2b)',
      'Step 4 · Final approval',
    ],
    roles: ['Leader', 'Agent A', 'Agent B', 'Agent C', 'Agent D'],
  },
  vi: {
    title: { team: 'Phối hợp nhóm', workflow: 'Chạy quy trình' },
    ribbon: 'DEMO · kịch bản mô phỏng · không phải việc thật của Javis',
    play: 'Chạy', pause: 'Tạm dừng', replay: 'Chạy lại', reset: 'Đặt lại', live: 'Quay về dữ liệu thật',
    speed: 'Tốc độ', done: 'Hoàn tất', step: 'Bước', time: 'Thời gian',
    pick: 'Chọn kịch bản DEMO', pickNote: 'Kịch bản mẫu cố định trên máy. Không khởi chạy agent, không tạo việc trong Javis và không gọi mô hình.',
    teamDesc: 'Trưởng nhóm giao việc, các agent làm song song, chuyển giao, xin duyệt và hoàn tất.',
    wfDesc: 'Các bước tuần tự và song song, thấy rõ phụ thuộc, chuyển giao và trạng thái hoàn tất.',
    returning: 'Đang lấy ảnh chụp mới nhất từ Javis đã xác thực…', liveFail: 'Chưa làm mới được từ Javis. Viewer hiển thị đúng trạng thái kết nối của nó.',
    need: 'Danh sách nhân sự chưa đủ cho kịch bản này (cần ít nhất 4 nhân vật).',
    hud: {
      eyebrow: 'DEMO · MÔ PHỎNG · KHÔNG PHẢI DỮ LIỆU THẬT',
      stepOf: 'Bước {n}/{total}', stepNone: 'Sẵn sàng bắt đầu',
      workers: ['Không có nhân vật mô phỏng đang làm', '1 nhân vật mô phỏng đang làm', '{count} nhân vật mô phỏng đang làm'],
      approvals: ['Không có phê duyệt mô phỏng', '1 phê duyệt mô phỏng đang chờ', '{count} phê duyệt mô phỏng đang chờ'],
      granted: '{count} đã duyệt (mô phỏng)', progress: 'Tiến độ {pct}%', finished: 'Kịch bản đã hoàn tất',
      reason: 'Kịch bản mô phỏng. Hoạt động thật của Javis được ẩn trong lúc chạy DEMO.',
      pill: 'DEMO', pillLive: 'Tạm ẩn dữ liệu thật',
      returnTitle: 'Đang kết nối lại với Javis…', returnSub: 'Đang xin ảnh chụp mới đã xác thực. Không dùng lại dữ liệu cũ.',
    },
    st: { pending: 'Chờ', active: 'Đang làm', waiting: 'Chờ duyệt', done: 'Xong' },
    team: [
      'Trưởng nhóm lập kế hoạch và giao việc',
      'Agent A và Agent B làm song song',
      'Agent A chuyển bản nháp cho Agent C',
      'Agent C xin phê duyệt',
      'Đã được duyệt (mô phỏng)',
      'Agent C trả kết quả cho Trưởng nhóm',
      'Trưởng nhóm rà soát và đóng việc',
    ],
    wf: [
      'Bước 1 · Thu thập yêu cầu (tuần tự)',
      'Bước 2a · Soạn nội dung (song song)',
      'Bước 2b · Chuẩn bị tài sản (song song)',
      'Bước 3 · Hợp nhất và rà soát (chờ 2a + 2b)',
      'Bước 4 · Duyệt cuối',
    ],
    roles: ['Trưởng nhóm', 'Agent A', 'Agent B', 'Agent C', 'Agent D'],
  },
};
const L = () => T[getLanguage()] || T.en;

// Fixtures. Actors are role slots 0..4 (0 = leader). Times are scenario seconds.
// set: [slot, status]; hand: [fromSlot, toSlot]; step: [stepIndex, state]
const SCENARIOS = {
  team: {
    length: 20,
    events: [
      { t: 0.0, set: [[0, 'working']], step: [0, 'active'] },
      { t: 2.5, hand: [0, 1], set: [[1, 'working']], step: [0, 'done'] },
      { t: 3.0, hand: [0, 2], set: [[2, 'working']], step: [1, 'active'] },
      { t: 3.5, set: [[0, 'idle']] },
      { t: 8.0, hand: [1, 3], set: [[1, 'idle'], [3, 'working']], step: [1, 'done'] },
      { t: 8.5, step: [2, 'active'] },
      { t: 10.5, hand: [2, 3], set: [[2, 'idle']], step: [2, 'done'] },
      { t: 12.0, set: [[3, 'waiting']], step: [3, 'waiting'] },
      { t: 15.0, set: [[3, 'working']], step: [3, 'done'] },
      { t: 15.2, step: [4, 'done'] },
      { t: 16.5, hand: [3, 0], set: [[3, 'idle'], [0, 'working']], step: [5, 'active'] },
      { t: 17.0, step: [5, 'done'] },
      { t: 19.0, set: [[0, 'idle']], step: [6, 'done'] },
    ],
    stepCount: 7,
  },
  workflow: {
    length: 20,
    events: [
      { t: 0.0, set: [[1, 'working']], step: [0, 'active'] },
      { t: 4.0, set: [[1, 'idle']], step: [0, 'done'] },
      { t: 4.2, hand: [1, 2], set: [[2, 'working']], step: [1, 'active'] },
      { t: 4.4, hand: [1, 3], set: [[3, 'working']], step: [2, 'active'] },
      { t: 9.0, set: [[2, 'idle']], step: [1, 'done'] },
      { t: 11.5, set: [[3, 'idle']], step: [2, 'done'] },
      { t: 12.0, hand: [2, 4], set: [[4, 'working']], step: [3, 'active'] },
      { t: 12.2, hand: [3, 4] },
      { t: 15.0, set: [[4, 'waiting']], step: [3, 'done'] },
      { t: 15.1, step: [4, 'waiting'] },
      { t: 18.0, set: [[4, 'idle']], step: [4, 'done'] },
    ],
    stepCount: 5,
  },
};

const D = { returning: false, st: [], active: false, id: null, t: 0, speed: 1, playing: false, timer: null, actors: [], applied: 0, steps: [], last: 0, saved: new Map() };
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function pickActors(state) {
  const people = (state.agents || []).filter((a) => a.actorKind !== 'subagent');
  // Leader: the registered office director (Kyan) when present. Javis Core is never chosen automatically: its activity is not measured.
  const pool = people.filter((a) => a.id !== 'slug:javis-core');
  const lead = pool.find((a) => a.id === 'slug:kyan') || pool[0];
  const rest = pool.filter((a) => a !== lead);
  return lead && rest.length >= 4 ? [lead, ...rest.slice(0, 4)] : null;
}

function applyStatus(office, slot, status) {
  const a = D.actors[slot]; if (!a) return;
  D.st[slot] = status;
  office.setStatus(a.id, status);
}

function resetScene(office) {
  for (const a of D.actors) office.setStatus(a.id, 'idle');
  D.st = D.actors.map(() => 'idle');
  D.steps = Array(SCENARIOS[D.id].stepCount).fill('pending');
  D.applied = 0; D.t = 0;
}

function applyUpTo(office, t) {
  const ev = SCENARIOS[D.id].events;
  while (D.applied < ev.length && ev[D.applied].t <= t) {
    const e = ev[D.applied++];
    for (const [slot, st] of e.set || []) applyStatus(office, slot, st);
    if (e.hand) { const f = D.actors[e.hand[0]], g = D.actors[e.hand[1]]; if (f && g) office.courier(f.id, g.id); }
    if (e.step) D.steps[e.step[0]] = e.step[1];
  }
}

function stepLabels() { return D.id === 'team' ? L().team : L().wf; }

function render() {
  const bar = $('#demo-bar'); if (!bar) return;
  const l = L(), len = SCENARIOS[D.id].length, finished = D.t >= len;
  const rows = stepLabels().map((s, i) => {
    const st = D.steps[i] || 'pending';
    return `<li class="ds-${st}"><span class="ds-dot"></span><span>${esc(s)}</span><em>${esc(l.st[st])}</em></li>`;
  }).join('');
  const who = D.actors.slice(0, D.id === 'team' ? 4 : 5).map((a, i) => `<span class="dw">${esc(l.roles[i])} = ${esc(a.name)}</span>`).join('');
  bar.innerHTML = `<div class="demo-ribbon">${esc(l.ribbon)}</div>
    <div class="demo-head"><b>${esc(l.title[D.id])}</b><span class="demo-time">${esc(l.time)} ${D.t.toFixed(1)}s / ${len}s${finished ? ' · ' + esc(l.done) : ''}</span></div>
    <ul class="demo-steps">${rows}</ul><div class="demo-who">${who}</div>
    <div class="demo-ctl">
      <button class="btn" id="dm-play">${esc(D.playing ? l.pause : (finished ? l.replay : l.play))}</button>
      <button class="btn" id="dm-replay">${esc(l.replay)}</button>
      <button class="btn" id="dm-speed">${esc(l.speed)} ×${D.speed}</button>
      <button class="btn" id="dm-reset">${esc(l.reset)}</button>
      <button class="btn demo-live" id="dm-live">${esc(l.live)}</button>
    </div>`;
  $('#dm-play').onclick = () => (D.playing ? pause() : play());
  $('#dm-replay').onclick = () => { reset(); play(); };
  $('#dm-speed').onclick = () => { D.speed = D.speed === 1 ? 2 : 1; render(); };
  $('#dm-reset').onclick = () => reset();
  $('#dm-live').onclick = () => returnToLive();
  window.dispatchEvent(new Event('demo-hud'));
}

function tick() {
  const now = performance.now(), dt = Math.min(1, (now - D.last) / 1000); D.last = now;
  D.t = Math.min(SCENARIOS[D.id].length, D.t + dt * D.speed);
  applyUpTo(window.__office, D.t);
  if (D.t >= SCENARIOS[D.id].length) { D.playing = false; clearInterval(D.timer); D.timer = null; }
  render();
}
function play() {
  if (D.t >= SCENARIOS[D.id].length) reset();
  D.playing = true; D.last = performance.now();
  clearInterval(D.timer); D.timer = setInterval(tick, 100); render();
}
function pause() { D.playing = false; clearInterval(D.timer); D.timer = null; render(); }
function reset() { pause(); resetScene(window.__office); render(); }

export function startDemo(id, state) {
  const actors = pickActors(state);
  if (!actors) return { ok: false, reason: L().need };
  if (D.active) stopTimer();
  D.id = id; D.actors = actors; D.active = true; window.__demoActive = true; D.speed = 1;
  document.body.classList.add('demo-on');
  let bar = $('#demo-bar'); if (!bar) { bar = document.createElement('div'); bar.id = 'demo-bar'; document.body.appendChild(bar); }
  resetScene(window.__office); render(); play();
  return { ok: true };
}
function stopTimer() { clearInterval(D.timer); D.timer = null; D.playing = false; }

export async function returnToLive(loadState, toast) {
  const nativeModes=await modeReady;if(nativeModes&&window.__state?.applicationMode==='ISOLATED_INTERACTIVE_FIXTURE'){stopTimer();await switchOfficeMode('LIVE');return;}

  if (D.returning) return;
  stopTimer();
  const loader = loadState || window.__officeUi?.loadState;
  const api = window.__officeUi?.api;
  D.returning = true; D.active = false; window.__demoActive = false;
  for (const a of D.actors) window.__office.setStatus(a.id, 'idle');
  const bar = $('#demo-bar');
  if (bar) bar.innerHTML = `<div class="demo-ribbon">${esc(L().ribbon)}</div><p class="demo-note" role="status">${esc(L().hud.returnSub)}</p>`;
  window.dispatchEvent(new Event('demo-hud'));
  // 1) Fresh authenticated snapshot through the Viewer backend (a GET to Javis; the cached snapshot is never reused as fresh).
  let fresh = null, ok = true;
  try { fresh = api ? await api('/javis-viewer/refresh', 'POST', {}) : null; } catch { ok = false; }
  // 2) Reconcile HUD and actors from that state.
  try { await loader(); } catch { ok = false; }
  window.__lastReturnToLive = { at: Date.now(), fresh: !!fresh?.fresh, seq: fresh?.seq ?? null, connection: fresh?.connection ?? null, fetchedAt: fresh?.fetchedAt ?? null, configured: fresh?.configured ?? null };
  D.returning = false;
  document.body.classList.remove('demo-on');
  $('#demo-bar')?.remove();
  window.dispatchEvent(new Event('demo-hud'));
  if (!ok || (fresh && fresh.configured && !fresh.fresh)) (toast || window.__officeUi?.toast || (() => {}))(L().liveFail);
}

/** Localised DEMO HUD model, or null when no DEMO is running. main.js renders it in place of the live summary. */
export function demoHud() {
  const l = L(), h = l.hud;
  if (D.returning) return { returning: true, eyebrow: h.eyebrow, title: h.returnTitle, sub: h.returnSub, count: '', approvals: '', reason: h.reason, pill: h.pill, pillLive: h.pillLive };
  if (!D.active) return null;
  const labels = stepLabels(), total = SCENARIOS[D.id].stepCount;
  const doneN = D.steps.filter((x) => x === 'done').length;
  let idx = D.steps.findIndex((x) => x === 'waiting'); if (idx < 0) idx = D.steps.findIndex((x) => x === 'active');
  if (idx < 0) idx = Math.max(0, doneN - 1);
  const started = D.steps.some((x) => x !== 'pending');
  const finished = doneN === total;
  const workers = D.st.filter((x) => x === 'working').length;
  const pending = D.st.filter((x) => x === 'waiting').length;
  const granted = D.steps[4] === 'done' ? 1 : 0;
  const form = (arr, n) => arr[n === 0 ? 0 : n === 1 ? 1 : 2].replace('{count}', String(n));
  const pct = Math.round((doneN / total) * 100);
  // Workflow labels already carry their own "Step 2a" numbering, so only the team scenario gets a "Step n of N" prefix.
  const prefix = D.id === 'team' ? h.stepOf.replace('{n}', idx + 1).replace('{total}', total) + ' · ' : '';
  const sub = finished ? h.finished : started ? prefix + labels[idx] : h.stepNone;
  return {
    returning: false, eyebrow: h.eyebrow, title: l.title[D.id], sub,
    count: [form(h.workers, workers), h.progress.replace('{pct}', pct)].join(' · '),
    workersN: workers, pendingN: pending, grantedN: granted, pct, progressLabel: h.progress.replace('{pct}', pct),
    approvals: form(h.approvals, pending) + (granted ? ' · ' + h.granted.replace('{count}', granted) : ''), approvalsPending: pending,
    reason: h.reason, pill: h.pill, pillLive: h.pillLive,
  };
}

export function isDemoActive() { return D.active; }
export function demoCatalog() {
  const l = L();
  return [{ id: 'team', name: l.title.team, desc: l.teamDesc }, { id: 'workflow', name: l.title.workflow, desc: l.wfDesc }];
}
export function demoPickText() { return { pick: L().pick, note: L().pickNote }; }
window.addEventListener('office-language', () => { if (D.active) render(); });

// Deterministic seek, used by acceptance tests: replays the fixture from 0 to t without timers.
window.__demoSeek = (t) => { if (!D.active) return false; pause(); resetScene(window.__office); D.t = Math.min(t, SCENARIOS[D.id].length); applyUpTo(window.__office, D.t); render(); return true; };
