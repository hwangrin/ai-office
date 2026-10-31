// Conversation section of the click-to-chat panel (Slice D).
// Everything comes from the Viewer backend's GET-only proxy of Javis' `history` projection and is rendered, never stored:
// no localStorage, no cache beyond the open panel, no second chat database. Every non-ok state is shown as what it is.
import { message, countText } from './i18n.js';
import { whenText } from './agent-card.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);
const q = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
const KNOWN = ['not_configured', 'unauthorized', 'forbidden', 'not_found', 'unreachable', 'bad_request'];

/** Mount the conversation view for one agent into `root`. Returns { destroy, rerender }. */
export function mountConversation(root, { api, agent, configured }) {
  const S = { sessions: [], next: null, state: 'loading', detail: '', open: null, msgs: [], older: null, msgState: 'ok', msgDetail: '', link: null, busy: false, total: 0, gen: 0 };
  let dead = false;
  const idOf = encodeURIComponent(agent.id);

  const unavailable = (state, detail, retry) => {
    const key = 'conv.' + (KNOWN.includes(state) ? state : 'error');
    return `<div class="pj-unavailable" role="note" data-state="${esc(state)}" data-detail="${esc(detail || '')}">${esc(message(key))}`
      + (retry && state !== 'not_configured' ? ` <button type="button" class="btn small" data-conv-retry>${esc(message('conv.retry'))}</button>` : '') + '</div>';
  };
  const identityLine = (id) => {
    if (!id) return '';
    const ok = id.binding === 'pinned' || id.binding === 'live_unpinned';
    return `<span class="cv-id ${ok ? 'ok' : ''}" title="${esc(id.agent_key || '')}">${esc(message(ok ? 'conv.identity.verified' : 'conv.identity.slug_only'))}</span>`;
  };
  const deep = (url, label) => (safeUrl(url) ? `<a class="btn small" data-conv-open href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>` : '');

  function html() {
    let h = `<h4>${esc(message('conv.title'))}</h4>`;
    if (!configured) return h + unavailable('not_configured', 'history_not_configured', false);
    if (S.open) {
      const s = S.open;
      h += `<div class="cv-head"><button type="button" class="btn small" data-conv-back>← ${esc(message('conv.back'))}</button>${deep(S.link || s.link, message('conv.open'))}</div>`;
      h += `<div class="cv-meta"><b data-user-content>${esc(s.title || '')}</b><span>${esc(message('conv.source'))}</span>${identityLine(s.identity)}</div>`;
      if (S.msgState !== 'ok') return h + unavailable(S.msgState, S.msgDetail, true);
      if (S.older) h += `<button type="button" class="btn small cv-older" data-conv-older ${S.busy ? 'disabled' : ''}>${esc(message(S.busy ? 'conv.loading' : 'conv.older'))}</button>`;
      if (!S.msgs.length) return h + `<p class="pj-note">${esc(message('conv.noMessages'))}</p>`;
      h += '<ol class="cv-msgs" aria-live="polite">' + S.msgs.map((m) => {
        const who = m.role === 'user' ? message('conv.you') : agent.name;
        const flags = [m.truncated ? message('conv.truncated') : '', m.redactions ? message('conv.redacted', { count: m.redactions }) : '', m.tool_calls ? message('conv.tools', { count: m.tool_calls }) : ''].filter(Boolean);
        return `<li class="cv-msg cv-${esc(m.role)}" data-msg-id="${esc(m.id)}"><div class="cv-by"><b>${esc(who)}</b><time datetime="${esc(new Date(m.ts * 1000).toISOString())}">${esc(whenText(m.ts * 1000))}</time></div>`
          + `<div class="cv-text" data-user-content>${esc(m.text)}</div>${flags.length ? `<div class="cv-flags">${esc(flags.join(' · '))}</div>` : ''}</li>`;
      }).join('') + '</ol>';
      if (S.total > S.msgs.length) h += `<p class="pj-note">${esc(message('conv.shown', { shown: S.msgs.length, total: S.total }))}</p>`;
      return h;
    }
    if (S.state === 'loading') return h + `<p class="pj-note">${esc(message('conv.loading'))}</p>`;
    if (S.state !== 'ok') return h + unavailable(S.state, S.detail, true);
    if (!S.sessions.length) return h + `<p class="pj-note">${esc(message('conv.none'))}</p>`;
    h += '<ul class="cv-list">' + S.sessions.map((s, i) => `<li><button type="button" class="cv-sess" data-conv-open-session="${i}">`
      + `<b data-user-content>${esc(s.title || '—')}</b>`
      + `<span>${esc(countText('conv.count', s.msg_count))} · ${esc(message('conv.updated', { time: whenText(s.updated_at * 1000) }))}</span>`
      + `<span>${esc(message('conv.source'))}</span>${identityLine(s.identity)}</button>${deep(s.link, message('conv.open'))}</li>`).join('') + '</ul>';
    if (S.next) h += `<button type="button" class="btn small" data-conv-more ${S.busy ? 'disabled' : ''}>${esc(message('conv.moreSessions'))}</button>`;
    return h;
  }

  function draw() { if (!dead) { root.innerHTML = html(); root.dataset.state = S.open ? (S.msgState) : S.state; root.closest('#panel')?.classList.toggle('convo-open', !!S.open); } }

  async function loadSessions(append = false) {
    const gen = ++S.gen; S.busy = true; if (!append) { S.state = 'loading'; draw(); }
    const r = await api(`/agents/${idOf}/sessions?` + q({ limit: 20, before_updated_at: append ? S.next?.updated_at : undefined, before_rowid: append ? S.next?.rowid : undefined })).catch(() => ({ state: 'unreachable' }));
    if (dead || gen !== S.gen) return;
    S.busy = false; S.state = r.state; S.detail = r.detail || '';
    if (r.state === 'ok') { S.sessions = append ? S.sessions.concat(r.sessions || []) : (r.sessions || []); S.next = r.has_more ? r.next : null; }
    draw();
  }

  async function loadMessages(older = false) {
    const gen = ++S.gen; S.busy = true; if (older) draw();
    const r = await api(`/agents/${idOf}/sessions/${encodeURIComponent(S.open.id)}/messages?` + q({ limit: 20, before_ts: older ? S.older?.ts : undefined, before_id: older ? S.older?.id : undefined })).catch(() => ({ state: 'unreachable' }));
    if (dead || gen !== S.gen) return;
    S.busy = false; S.msgState = r.state; S.msgDetail = r.detail || '';
    if (r.state === 'ok') {
      S.msgs = older ? (r.messages || []).concat(S.msgs) : (r.messages || []);
      S.older = r.has_more ? r.next : null; S.link = r.link || S.link;
      if (r.session) { S.total = r.session.msg_count || S.total; S.open = { ...S.open, ...r.session }; }
    }
    draw();
  }

  root.onclick = (e) => {
    const t = e.target;
    if (t.closest('[data-conv-retry]')) return S.open ? loadMessages(false) : loadSessions(false);
    if (t.closest('[data-conv-more]')) return loadSessions(true);
    if (t.closest('[data-conv-older]')) return loadMessages(true);
    if (t.closest('[data-conv-back]')) { S.open = null; S.msgs = []; draw(); return; }
    const b = t.closest('[data-conv-open-session]');
    if (b) { S.open = S.sessions[Number(b.dataset.convOpenSession)]; S.msgs = []; S.older = null; S.msgState = 'ok'; S.link = S.open?.link || null; S.total = S.open?.msg_count || 0; draw(); loadMessages(false); }
  };

  if (configured) loadSessions(false); else { S.state = 'not_configured'; draw(); }
  return { destroy() { dead = true; root.onclick = null; root.innerHTML = ''; root.closest('#panel')?.classList.remove('convo-open'); }, rerender: draw, state: () => ({ ...S, sessions: S.sessions.length, msgs: S.msgs.length }) };
}
