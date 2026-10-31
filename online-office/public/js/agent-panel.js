// Click-to-chat panel extras (UX v0.3 slice C): resizable panel + the "Javis references / conversation / tasks" section.
// Everything shown comes from the Viewer backend's /agents/:id/history descriptor. Nothing is invented: a conversation or
// session that the Brain-bound view credential cannot read is shown as an explicit unavailable state, never as empty history.
import { message, getLanguage } from './i18n.js';
import { mountConversation } from './conversation.js';
import { officeRole } from './office-commentary.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);
const KEY = 'office.panelSize';

export function initPanelResize() {
  const panel = $('#panel'), grip = $('#panel-resizer'); if (!panel || !grip) return;
  const narrow = () => matchMedia('(max-width: 760px)').matches;
  const root = document.documentElement;
  const clampW = (w) => Math.max(340, Math.min(Math.round(innerWidth * 0.7), 760, w));
  const clampH = (h) => Math.max(Math.round(innerHeight * 0.35), Math.min(Math.round(innerHeight * 0.9), h));
  const apply = (v) => { if (narrow()) root.style.setProperty('--panel-h', clampH(v) + 'px'); else root.style.setProperty('--panel-w', clampW(v) + 'px'); };
  try { const saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved?.w && !narrow()) apply(saved.w); if (saved?.h && narrow()) apply(saved.h); } catch { /* ignore */ }
  // Width (desktop) and height (bottom sheet) are stored separately so one layout never inherits the other's size.
  const save = () => {
    try {
      const cur = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
      if (narrow()) cur.h = panel.offsetHeight; else cur.w = panel.offsetWidth;
      localStorage.setItem(KEY, JSON.stringify(cur));
    } catch { /* ignore */ }
  };
  grip.setAttribute('aria-label', message('panel.resize'));
  grip.title = message('panel.resize');
  window.addEventListener('office-language', () => { grip.setAttribute('aria-label', message('panel.resize')); grip.title = message('panel.resize'); });
  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault(); grip.setPointerCapture(e.pointerId); document.body.classList.add('panel-resizing');
    const move = (ev) => { const r = panel.getBoundingClientRect(); apply(narrow() ? r.bottom - ev.clientY : r.right - ev.clientX); };
    const up = () => { grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up); document.body.classList.remove('panel-resizing'); save(); };
    grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
  });
  grip.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 80 : 24;
    const grow = narrow() ? e.key === 'ArrowUp' : e.key === 'ArrowLeft', shrink = narrow() ? e.key === 'ArrowDown' : e.key === 'ArrowRight';
    if (!grow && !shrink) return;
    e.preventDefault(); apply((narrow() ? panel.offsetHeight : panel.offsetWidth) + (grow ? step : -step)); save();
  });
  window.addEventListener('resize', () => { if (!narrow()) apply(panel.offsetWidth); });
}

const cache = new Map();   // agentId -> { at, data }

export async function loadHistory(api, agentId, { force = false, brainId = '', brainSeq = null } = {}) {
  const cacheKey = `${brainId}|${brainSeq ?? ''}|${agentId}`;
  const hit = cache.get(cacheKey);
  if (!force && hit && Date.now() - hit.at < 3000) return hit.data;
  let data;
  const scope = brainId ? '?brainId=' + encodeURIComponent(brainId) + '&brainSeq=' + encodeURIComponent(String(brainSeq ?? '')) : '';
  try { data = await api('/agents/' + encodeURIComponent(agentId) + '/history' + scope); } catch { data = null; }
  cache.set(cacheKey, { at: Date.now(), data });
  return data;
}

const row = (k, v, mono = true) => `<div class="pj-row"><span>${esc(k)}</span>${mono ? `<code data-user-content>${esc(v)}</code>` : `<span data-user-content>${esc(v)}</span>`}</div>`;
const jobStatus = (status) => message('panel.javis.jobStatus.' + (['running','waiting','needs_you','completed','failed','cancelled'].includes(status) ? status : 'unknown'));
const jobUpdated = (value) => {
  const date = new Date(Number(value)); if (!Number.isFinite(date.getTime())) return '';
  return message('panel.javis.jobUpdated', { time: date.toLocaleString(getLanguage() === 'vi' ? 'vi-VN' : 'en-US') });
};

/** HTML for the Javis section of the panel. `agent` is a state.agents entry, `h` the history descriptor (or null while loading). */
export function renderJavisSection(agent, h) {
  if (!h) return `<h4>${esc(message('panel.javis.refs'))}</h4><p class="pj-note">${esc(message('panel.javis.loading'))}</p>`;
  const refs = h.refs || {};
  const demo = h.source === 'DEMO' || agent.dataSource === 'DEMO';
  const offline = h.source === 'UNKNOWN';
  const parts = [];
  if (h.nativeWorkStatus) {
    parts.push(`<h4>${esc(message('panel.javis.currentWork'))}</h4>`);
    parts.push(`<p class="pj-note">${esc(message('panel.javis.jobCoverage'))}</p>`);
    const items = h.tasks?.items || [];
    if (!h.tasks?.available) parts.push(`<p class="pj-note">${esc(message('panel.javis.tasksUnknown'))}</p>`);
    else if (!items.length) parts.push(`<p class="pj-note">${esc(message('panel.javis.tasksNone'))}</p>`);
    else parts.push(`<ul class="pj-tasks">${items.map((t) => {
      const updated = jobUpdated(t.updatedAt);
      const link = safeUrl(t.openUrl);
      return `<li><span class="pj-job-status">${esc(jobStatus(t.status))}</span><span data-user-content>${esc(String(t.title || '').slice(0, 240))}</span>`
        + (updated ? `<small class="pj-note">${esc(updated)}</small>` : '')
        + (link ? `<a class="pj-job-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(message('panel.javis.openJob'))} ↗</a>` : '')
        + `</li>`;
    }).join('')}</ul>`);
    const chat = safeUrl(h.links?.chat);
    if (chat) parts.push(`<div class="pj-links"><a class="btn small primary" href="${esc(chat)}" target="_blank" rel="noopener noreferrer">${esc(message('panel.javis.openChat'))} ↗</a></div>`);
    return parts.join('');
  }
  // 1) Javis references (IDs reused as-is)
  parts.push(`<h4>${esc(message('panel.javis.refs'))}</h4>`);
  parts.push(row(message('panel.javis.agent'), agent.id));
  if (!demo) {
    parts.push(row(message('panel.javis.key'), refs.agentKey || message('panel.javis.keyNone'), !!refs.agentKey));
    if (refs.taskId) parts.push(row(message('panel.javis.task'), refs.taskId));
    if (refs.teamId) parts.push(row(message('panel.javis.team'), refs.teamId));
    if (!h.sessions?.available) parts.push(row(message('panel.javis.sessions'), message('panel.javis.sessionsNone'), false));
  }
  // 2) Related tasks (the conversation has its own stable section, see syncConversation)
  parts.push(`<h4>${esc(message('panel.javis.tasks'))}</h4>`);
  const items = h.tasks?.items || [];
  if (items.length) parts.push(`<ul class="pj-tasks">${items.map((t) => `<li><code>${esc(t.id)}</code> <span data-user-content>${esc(String(t.prompt || '').slice(0, 160))}</span></li>`).join('')}</ul>`);
  else parts.push(`<p class="pj-note">${esc(message('panel.javis.tasksNone'))}</p>`);
  if (!demo) parts.push(`<p class="pj-note">${esc(message('panel.javis.tasksScope'))}</p>`);
  // 3) Native deep links
  const chat = safeUrl(h.links?.chat), task = safeUrl(h.links?.task);
  const links = [];
  const isCore = officeRole(agent) === 'system';   // Javis Core has no agent file: its link is the dashboard root, not a chat
  if (chat) links.push(`<a class="btn small primary" id="pj-open-chat" href="${esc(chat)}" target="_blank" rel="noopener noreferrer">${esc(message(isCore ? 'composer.openCore' : 'panel.javis.openChat'))} ↗</a>`);
  if (task) links.push(`<a class="btn small" id="pj-open-task" href="${esc(task)}" target="_blank" rel="noopener noreferrer">${esc(message('panel.javis.openTask'))} ↗</a>`);
  parts.push(links.length ? `<div class="pj-links">${links.join('')}</div>` : `<p class="pj-note">${esc(message('panel.javis.noLinks'))}</p>`);
  if (isCore) parts.push(`<p class="pj-note" id="pj-core-note">${esc(message('panel.core.note'))}</p>`);
  return parts.join('');
}

export function clearHistoryCache() { cache.clear(); }

let convo = null;   // { id, configured, inst }
/** Keep the conversation section in step with the open agent. Mounted once per agent so the 2 s state poll never wipes it. */
export function syncConversation(box, api, agent, h) {
  if (!box) return;
  if (!agent || !h) { unmountConversation(box); return; }
  const note = (key) => { unmountConversation(box); box.hidden = false; box.innerHTML = `<h4>${esc(message('conv.title'))}</h4><div class="pj-unavailable" role="note" data-state="${key}">${esc(message(key === 'demo' ? 'panel.javis.convoDemo' : 'panel.javis.convoOffline'))}</div>`; };
  if (h.source === 'DEMO' || agent.dataSource === 'DEMO') return note('demo');
  if (h.source === 'UNKNOWN') return note('offline');
  const configured = !!h.conversation?.available;
  if (convo && convo.id === agent.id && convo.configured === configured) return;
  unmountConversation(box);
  box.hidden = false;
  convo = { id: agent.id, configured, inst: mountConversation(box, { api, agent, configured }) };
}
export function unmountConversation(box) {
  convo?.inst?.destroy(); convo = null;
  if (box) { box.hidden = true; box.innerHTML = ''; delete box.dataset.state; }
}
window.addEventListener('office-language', () => convo?.inst?.rerender());
window.__conversation = () => convo?.inst?.state?.() ?? null;
void getLanguage;
