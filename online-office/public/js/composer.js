// Floating bottom composer (UX v0.3 slice C), inspired by Agent Arena's @mention interaction only.
// It is a DRAFTING surface: it never sends, never assigns, never calls a model and makes no network request.
// Message / Assign task are two separate intents; both end in a native Javis deep link built by the Viewer backend.
// Recipient resolution is by stable Javis agent ID (never by display text alone) and there is no implicit broadcast.
import { message, getLanguage } from './i18n.js';
import { officeRole } from './office-commentary.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

import { norm, roster, resolveMentions, draftBody } from './mentions.js';
export { norm, roster, resolveMentions, draftBody };
const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);

const S = { intent: 'message', open: false, list: [], active: 0, query: null };

function mentionQuery(el) {
  const before = el.value.slice(0, el.selectionStart ?? el.value.length);
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  if (at > 0 && !/[\s(]/.test(before[at - 1])) return null;
  const q = before.slice(at + 1);
  if (q.length > 40 || /\n/.test(q)) return null;
  return { at, q };
}

function suggest(agents, q) {
  const nq = norm(q).trim();
  const score = (a) => {
    const n = norm(a.name), s = norm(String(a.id).replace(/^slug:/, '')), r = norm(a.role);
    if (!nq) return 3;
    if (n.startsWith(nq) || s.startsWith(nq)) return 0;
    if (n.includes(nq) || s.includes(nq)) return 1;
    if (r.includes(nq)) return 2;
    return -1;
  };
  return agents.map((a) => ({ a, s: score(a) })).filter((x) => x.s >= 0).sort((x, y) => x.s - y.s || x.a.name.localeCompare(y.a.name)).slice(0, 6).map((x) => x.a);
}

export function initComposer({ getState, toast }) {
  const root = $('#chat-composer'); if (!root) return null;
  const input = $('#cc-input'), list = $('#cc-list'), to = $('#cc-to'), note = $('#cc-note'), openBtn = $('#cc-open'), copyBtn = $('#cc-copy');
  const agents = () => roster(getState());

  const visible = () => !!getState().javisViewer?.readOnly;

  function model() {
    const mentioned = resolveMentions(input.value, agents());
    const brain = getState().javisViewer?.brain || '';
    const recipient = mentioned.length === 1 ? mentioned[0] : null;
    const link = recipient ? safeUrl(recipient.card?.links?.chat) : null;
    return { mentioned, recipient, brain, link };
  }

  function renderStatic() {
    $('#cc-label').textContent = message('composer.title');
    input.placeholder = message('composer.placeholder');
    input.setAttribute('aria-label', input.dataset.interactiveLabel || message('composer.title'));
    $('#cc-intent').setAttribute('aria-label', message('composer.intent'));
    for (const b of root.querySelectorAll('[data-intent]')) {
      b.textContent = message('composer.intent.' + b.dataset.intent);
      b.setAttribute('aria-checked', String(b.dataset.intent === S.intent));
      b.tabIndex = b.dataset.intent === S.intent ? 0 : -1;
    }
    copyBtn.textContent = message('composer.copy');
    list.setAttribute('aria-label', message('composer.suggestions'));
  }

  function render() {
    root.hidden = !visible();
    document.body.classList.toggle('has-composer', visible());
    if (root.hidden) return;
    renderStatic();
    const m = model();
    to.innerHTML = m.recipient
      ? `<span class="cc-chip" data-agent-id="${esc(m.recipient.id)}" title="${esc(m.recipient.id)}"><b>${esc(message('composer.to'))}</b> ${esc(m.recipient.name)} <code>${esc(m.recipient.id)}</code></span><span class="cc-chip cc-brain">${esc(message('composer.brain', { brain: m.brain }))}</span>`
      : `<span class="cc-chip cc-brain">${esc(message('composer.brain', { brain: m.brain }))}</span>`;
    let text;
    if (!m.recipient) text = m.mentioned.length > 1 ? message('composer.many', { count: m.mentioned.length }) : message('composer.none');
    else if (!m.link) text = message('composer.noLink', { name: m.recipient.name });
    else if (officeRole(m.recipient) === 'system') text = message('composer.noteCore');
    else text = message(S.intent === 'task' ? 'composer.noteTask' : 'composer.noteMessage');
    note.textContent = text;
    note.classList.toggle('cc-warn', !m.link);
    openBtn.textContent = message(officeRole(m.recipient) === 'system' ? 'composer.openCore' : S.intent === 'task' ? 'composer.openTask' : 'composer.openMessage') + ' ↗';
    if (m.link) { openBtn.href = m.link; openBtn.removeAttribute('aria-disabled'); openBtn.tabIndex = 0; }
    else { openBtn.removeAttribute('href'); openBtn.setAttribute('aria-disabled', 'true'); openBtn.tabIndex = -1; }
    root.dataset.recipientId = m.recipient?.id || '';
    root.dataset.intent = S.intent;
    root.classList.toggle('cc-live', S.open || !!input.value);
  }

  function renderList() {
    if (!S.open) { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); return; }
    list.hidden = false; input.setAttribute('aria-expanded', 'true');
    if (!S.list.length) {
      list.innerHTML = `<li class="cc-empty" role="presentation">${esc(message('composer.noMatch', { query: S.query ?? '' }))}</li>`;
      input.removeAttribute('aria-activedescendant'); return;
    }
    list.innerHTML = S.list.map((a, i) => `<li role="option" id="cc-opt-${i}" data-i="${i}" data-agent-id="${esc(a.id)}" aria-selected="${i === S.active}" class="${i === S.active ? 'on' : ''}"><b>${esc(a.name)}</b><span>${esc(a.role || '')}</span><code>${esc(a.id)}</code></li>`).join('');
    input.setAttribute('aria-activedescendant', 'cc-opt-' + S.active);
    list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  }

  function refreshSuggestions() {
    const mq = mentionQuery(input);
    if (!mq) { S.open = false; S.query = null; return renderList(); }
    S.query = mq.q; S.list = suggest(agents(), mq.q); S.active = 0;
    S.open = mq.q.length === 0 || S.list.length > 0 || !/\s/.test(mq.q) ? true : false;
    renderList();
  }

  function pick(i) {
    const a = S.list[i]; if (!a) return;
    const mq = mentionQuery(input); if (!mq) return;
    const dup = agents().filter((x) => norm(x.name) === norm(a.name)).length > 1;
    const token = '@' + (dup ? String(a.id).replace(/^slug:/, '') : a.name) + ' ';
    const after = input.value.slice(input.selectionStart ?? input.value.length);
    input.value = input.value.slice(0, mq.at) + token + after;
    const pos = mq.at + token.length;
    input.setSelectionRange(pos, pos);
    S.open = false; renderList(); render(); input.focus();
  }

  input.addEventListener('input', () => { refreshSuggestions(); render(); autosize(); });
  input.addEventListener('click', refreshSuggestions);
  input.addEventListener('focus', () => { root.classList.add('cc-live'); });
  input.addEventListener('blur', () => { setTimeout(() => { if (!root.contains(document.activeElement)) { S.open = false; renderList(); root.classList.toggle('cc-live', !!input.value); } }, 120); });
  input.addEventListener('keydown', (e) => {
    if (S.open && S.list.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); S.active = (S.active + 1) % S.list.length; return renderList(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); S.active = (S.active - 1 + S.list.length) % S.list.length; return renderList(); }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); return pick(S.active); }
    }
    if (e.key === 'Escape') { if (S.open) { e.preventDefault(); S.open = false; renderList(); } else input.blur(); }
  });
  // pointerdown (not click) so the textarea keeps focus and touch taps select reliably.
  list.addEventListener('pointerdown', (e) => { const li = e.target.closest('[data-i]'); if (!li) return; e.preventDefault(); pick(Number(li.dataset.i)); });

  root.querySelector('#cc-intent').addEventListener('click', (e) => {
    const b = e.target.closest('[data-intent]'); if (!b) return;
    S.intent = b.dataset.intent; render(); input.focus();
  });
  root.querySelector('#cc-intent').addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault(); S.intent = S.intent === 'message' ? 'task' : 'message'; render();
    root.querySelector(`[data-intent="${S.intent}"]`).focus();
  });

  openBtn.addEventListener('click', (e) => { if (openBtn.getAttribute('aria-disabled') === 'true') e.preventDefault(); });

  copyBtn.addEventListener('click', async () => {
    const m = model(); const body = draftBody(input.value, m.recipient);
    if (!body) return toast(message('composer.emptyDraft'));
    try { await navigator.clipboard.writeText(body); toast(message('composer.copied')); }
    catch {
      try { const t = document.createElement('textarea'); t.value = body; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); toast(message(ok ? 'composer.copied' : 'composer.copyFail')); }
      catch { toast(message('composer.copyFail')); }
    }
  });

  function autosize() { input.style.height = 'auto'; input.style.height = Math.min(120, input.scrollHeight) + 'px'; }

  window.addEventListener('office-language', render);
  window.addEventListener('office-state', render);
  // Test / acceptance hook: pure read of the routing model, no side effects.
  window.__composer = { model: () => { const m = model(); return { recipientId: m.recipient?.id ?? null, mentionedIds: m.mentioned.map((a) => a.id), brain: m.brain, link: m.link, intent: S.intent, linkEnabled: !!m.link }; }, suggest: (q) => suggest(agents(), q).map((a) => a.id) };
  render();
  return { render };
}
