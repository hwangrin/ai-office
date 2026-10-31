// Agent hover / preview / detail card. Pure rendering of the source-labelled `card` the server attaches to each agent.
// Rule: show only what the source provides. No invented summaries or timestamps; a missing fact is left out or stated as unavailable.
import { message, getLanguage } from './i18n.js';

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

export const activityLabel = (activity) => KNOWN('act.' + activity) ?? activity;
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
  const c = agent.card;
  const parts = [];
  if (!c) {
    // Original Studio agent: only facts its local session record has.
    parts.push(`<div class="ac-head"><b>${esc(agent.name)}</b><span class="ac-chip ac-${esc(agent.status)}">${esc(statusLabel)}</span></div>`);
    parts.push(`<div class="ac-sub">${esc([clip(agent.role, detailed ? 220 : 70), zoneName].filter(Boolean).join(' · '))}</div>`);
    const prompt = agent.currentTask?.prompt;
    parts.push(prompt ? `<div class="ac-task">${esc(prompt.slice(0, detailed ? 400 : 140))}</div>` : `<div class="ac-task ac-none">${esc(message('card.noTask'))}</div>`);
    if (agent.queued) parts.push(`<div class="ac-line">${esc(message('card.moreQueued', { count: agent.queued }))}</div>`);
    parts.push(`<div class="ac-src">${esc(message('card.source.local'))}</div>`);
    return parts.join('');
  }
  const act = c.activity;
  parts.push(`<div class="ac-head"><b>${esc(agent.name)}</b><span class="ac-chip ac-${esc(act)}">${esc(activityLabel(act))}</span></div>`);
  const sub = [clip(agent.role, detailed ? 220 : 70), zoneName ? message('card.zone', { name: zoneName }) : ''].filter(Boolean).join(' · ');
  if (sub) parts.push(`<div class="ac-sub">${esc(sub)}</div>`);
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
    parts.push(`<div class="ac-task ac-none">${esc(act === 'unknown' ? (why ?? activityLabel('unknown')) : message('card.noTask'))}</div>`);
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

  if (detailed) {
    const u = c.usage;
    parts.push(`<div class="ac-line ac-sub">${esc(u?.available
      ? message('card.usage.known', { calls: u.calls ?? 0, tokens: fmtTok((u.tokensIn ?? 0) + (u.tokensOut ?? 0)) })
        + (u.costUsd > 0 ? message('card.usage.cost', { cost: '$' + u.costUsd.toFixed(u.costUsd >= 1 ? 2 : 4) }) : '') + (u.partial ? message('card.usage.partial') : '')
      : message('card.usage.unavailable'))}</div>`);
    if (c.source?.kind === 'LIVE' && c.source.sourceAt) parts.push(`<div class="ac-line ac-sub">${esc(message('card.sourceTime', { time: whenText(c.source.sourceAt) }))}</div>`);
  }
  parts.push(`<div class="ac-src ${c.source?.stale ? 'ac-stale' : ''}">${esc(sourceLine(c.source))}</div>`);
  return parts.join('');
}
