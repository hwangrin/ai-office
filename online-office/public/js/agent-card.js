import { identityNotice } from './agent-identity.js';
// Agent hover / preview / detail card. Pure rendering of the source-labelled `card` the server attaches to each agent.
// Rule: show only what the source provides. No invented summaries or timestamps; a missing fact is left out or stated as unavailable.
import { translatedField, message, getLanguage } from './i18n.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lang = () => (getLanguage() === 'vi' ? 'vi-VN' : 'en-GB');
const KNOWN = (key, values) => { try { return message(key, values); } catch { return null; } };

/** Hour and minute in the browser's configured local time zone; adds dd/MM when the moment is not today. */
export function whenText(ts) {
  if (ts == null || !Number.isFinite(ts)) return '';
  const d = new Date(ts);
  const t = d.toLocaleTimeString(lang(), { hour: '2-digit', minute: '2-digit', hour12: false });
  if (d.toDateString() === new Date().toDateString()) return t;
  return d.toLocaleDateString(lang(), { day: '2-digit', month: '2-digit' }) + ' ' + t;
}

export const activityLabel = (activity) => KNOWN('act.' + activity) ?? message('act.unknown');
const fmtTok = (n) => !n ? '0' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'k' : String(Math.round(n));

function sourceLine(src) {
  if (!src) return '';
  if (src.kind === 'LIVE') {
    const when = whenText(src.receivedAt);
    return src.stale ? message('card.source.stale', { time: when || '-' }) : message('card.source.live', { time: when || '-' });
  }
  if (src.kind === 'DEMO') return message('card.source.demo');
  if (src.kind === 'LOCAL') return message('card.source.local');
  return message('card.source.unknown');
}

const clip = (t, n) => { const x = String(t ?? '').replace(/\s+/g, ' ').trim(); return x.length > n ? x.slice(0, n - 1).trimEnd() + '…' : x; };
const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);

/**
 * @param agent   an entry of state.agents (viewer entries carry `card`)
 * @param opt     { detailed, pinned, zoneName, statusLabel }  statusLabel: fallback text for Studio agents
 */
export function renderCard(agent, { detailed = false, pinned = false, zoneName = '', statusLabel = '' } = {}) {
  const source=agent.card;const c=source?{...source,task:source.task?{...source.task,title:translatedField(source.task.title),reason:translatedField(source.task.reason),team:translatedField(source.task.team)}:null,approval:source.approval?{...source.approval,title:translatedField(source.approval.title)}:null}:null;
  const parts = [];
  const notice = identityNotice(agent, getLanguage());
  if (notice) parts.push('<div class="ac-src">'+esc(notice)+'</div>');
  if (detailed && agent.description && agent.description !== agent.role) parts.push('<p class="ac-description">'+esc(agent.description)+'</p>');
  if (!c) {
    // Original Studio agent: only facts its local session record has.
    parts.push(`<div class="ac-head"><b>${esc(agent.name)}</b><span class="ac-chip ac-${esc(agent.status)}">${esc(statusLabel)}</span></div>`);
    parts.push(`<div class="ac-sub">${esc([clip(agent.role, 70), zoneName].filter(Boolean).join(' · '))}</div>`);
    const prompt = translatedField(agent.currentTask?.prompt);
    parts.push(prompt ? `<div class="ac-task">${esc(prompt.slice(0, detailed ? 400 : 140))}</div>` : `<div class="ac-task ac-none">${esc(message('card.noTask'))}</div>`);
    if (agent.queued) parts.push(`<div class="ac-line">${esc(message('card.moreQueued', { count: agent.queued }))}</div>`);
    parts.push(`<div class="ac-src">${esc(message('card.source.local'))}</div>`);
    return parts.join('');
  }
  const act = c.activity;
  if(!detailed)parts.push(`<div class="ac-head"><b>${esc(agent.name)}</b><span class="ac-chip ac-${esc(act)}">${esc(activityLabel(act))}</span></div>`);
  const sub = [clip(agent.role, 70), zoneName ? message('card.zone', { name: zoneName }) : ''].filter(Boolean).join(' · ');
  if (sub && !detailed) parts.push(`<div class="ac-sub">${esc(sub)}</div>`);
  if (c.parent) parts.push(`<div class="ac-line ac-sub">${esc(message('card.parent', { name: c.parent.name }))}</div>`);

  if (c.task) {
    parts.push(`<div class="ac-task">${esc(c.task.title.slice(0, detailed ? 400 : 140))}</div>`);
    const bits = [];
    if (c.task.step) {
      const kind = c.task.stepKind ? KNOWN('card.stepKind.' + c.task.stepKind) : null;
      bits.push(message('card.step', { done: c.task.step.done, total: c.task.step.total }) + (kind ? ' · ' + kind : ''));
    }
    if (c.task.queuePos) bits.push(message('card.queuePos', { n: c.task.queuePos }));
    if (c.task.stateChangedAt) bits.push(message('card.changed', { time: whenText(c.task.stateChangedAt) }));
    if (bits.length) parts.push(`<div class="ac-line">${esc(bits.join(' · '))}</div>`);
    if (detailed) {
      if (c.task.team) parts.push(`<div class="ac-line">${esc(message('card.team', { name: c.task.team }))}</div>`);
      if (c.task.startedAt == null) parts.push(`<div class="ac-line ac-sub">${esc(message('card.startUnknown'))}</div>`);
      if (c.task.reason) parts.push(`<div class="ac-line ac-sub">${esc(c.task.reason.slice(0, 240))}</div>`);
    }
    if (c.moreQueued) parts.push(`<div class="ac-line ac-sub">${esc(message('card.moreQueued', { count: c.moreQueued }))}</div>`);
  } else {
    const why = c.activityReason ? KNOWN('reason.' + c.activityReason) : null;
    if (act === 'unknown') parts.push(`<div class="ac-task ac-none">${esc(why ?? activityLabel('unknown'))}</div>`);
    else if (act === 'idle') parts.push(`<div class="ac-task ac-none">${esc(message('card.noTask'))}</div>`);
    // Working, queued and needs-attention records are detailed on demand in the profile panel.
    if (act !== 'unknown' && why) parts.push(`<div class="ac-line ac-sub">${esc(why)}</div>`);
  }

  if (c.approval) {
    const kindLabel = KNOWN('card.kind.' + c.approval.kind) ?? '';
    const when = c.approval.requestedAt ? message('card.requested', { time: whenText(c.approval.requestedAt) }) : '';
    const isApproval = act === 'approval_pending';
    parts.push(`<div class="ac-approval ${isApproval ? '' : 'ac-question'}"><b>${esc(isApproval ? message('badge.approval') : message('badge.input'))}</b>`
      + `<span>${esc([kindLabel, c.approval.title].filter(Boolean).join(': ').slice(0, 200))}</span>`
      + (when ? `<span class="ac-sub">${esc(when)}</span>` : '')
      + ((pinned || detailed) && safeUrl(c.approval.openUrl) ? `<a class="ac-link" href="${esc(safeUrl(c.approval.openUrl))}" target="_blank" rel="noopener noreferrer">${esc(message('card.open'))}</a>` : '')
      + `</div>`);
  } else if (act === 'needs_input' && c.task?.reason) {
    parts.push(`<div class="ac-approval ac-question"><b>${esc(message('badge.input'))}</b><span>${esc(c.task.reason.slice(0, 200))}</span></div>`);
  }

  parts.push(`<div class="ac-src ${c.source?.stale ? 'ac-stale' : ''}">${esc(sourceLine(c.source))}</div>`);
  return parts.join('');
}
