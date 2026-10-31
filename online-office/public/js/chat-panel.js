// In-scene Direct Agent Chat (isolated interactive origin only). Sends through /api/gateway/chat; AI Office keeps no conversation
// of its own. Rules: exactly one @mentioned agent per message (never broadcast), one request in flight, a turn id per user action,
// an `unknown` outcome is shown as unknown and is never re-sent unless the user explicitly sends it again as a NEW message.
import { getLanguage } from './i18n.js';
import { draftBody } from './mentions.js';
const $ = s => document.querySelector(s);
const W = {
  en: { send: 'Send', sending: 'Sending…', chatWith: 'Chat with', noHistory: 'No messages yet with this agent.', you: 'You', agent: 'Agent', fixture: 'FIXTURE REPLY',
    waiting: 'Waiting for the agent…', unknown: 'Not confirmed. The message may or may not have reached the agent. It was NOT re-sent.', failed: 'Not delivered.',
    engine_error: 'The agent reported an error.', unauthorized: 'Credential not accepted. Nothing was sent to the agent.', forbidden: 'Not permitted. Nothing was sent.',
    agent_not_authorized: 'This agent is not available for chat here.', agent_not_found: 'Agent not found in this Brain.', turn_in_progress: 'This agent is still answering. Wait for the reply.',
    network: 'Connection lost after sending.', timeout: 'No reply in time.', no_confirmation: 'No confirmation from Javis.', interrupted_before_confirmation: 'Interrupted before confirmation.',
    resend: 'Send again as a new message', check: 'Refresh', hint: 'Enter sends · Shift+Enter new line', pick: 'Mention exactly one agent with @ to chat.', loadFail: 'History unavailable.',
    open: 'Chat with this agent', receipts: 'Turns sent from this office (fixture). Javis keeps the authoritative thread.' },
  vi: { send: 'Gửi', sending: 'Đang gửi…', chatWith: 'Trò chuyện với', noHistory: 'Chưa có tin nhắn nào với trợ lý này.', you: 'Bạn', agent: 'Trợ lý', fixture: 'PHẢN HỒI MẪU',
    waiting: 'Đang chờ trợ lý trả lời…', unknown: 'Chưa xác nhận. Tin có thể đã hoặc chưa tới trợ lý. Hệ thống KHÔNG tự gửi lại.', failed: 'Chưa gửi được.',
    engine_error: 'Trợ lý báo lỗi khi xử lý.', unauthorized: 'Thông tin xác thực không được chấp nhận. Chưa gửi gì tới trợ lý.', forbidden: 'Không được phép. Chưa gửi gì.',
    agent_not_authorized: 'Trợ lý này chưa được mở để trò chuyện tại đây.', agent_not_found: 'Không tìm thấy trợ lý trong Brain này.', turn_in_progress: 'Trợ lý đang trả lời. Hãy đợi phản hồi.',
    network: 'Mất kết nối sau khi gửi.', timeout: 'Quá thời gian chờ phản hồi.', no_confirmation: 'Javis không xác nhận.', interrupted_before_confirmation: 'Bị gián đoạn trước khi xác nhận.',
    resend: 'Gửi lại thành tin mới', check: 'Làm mới', hint: 'Enter để gửi · Shift+Enter xuống dòng', pick: 'Gõ @ và chọn đúng một trợ lý để trò chuyện.', loadFail: 'Không tải được lịch sử.',
    open: 'Trò chuyện với trợ lý này', receipts: 'Các lượt gửi từ văn phòng này (dữ liệu mẫu). Javis giữ cuộc hội thoại gốc.' },
};
const t = k => (W[getLanguage()] || W.en)[k] || k;

export function attachChatPanel({ token, getSelected, getModel, getAgent }) {
  const root = $('#chat-composer'), input = $('#cc-input');
  const style = document.createElement('style');
  style.textContent = '#chat-log{max-height:min(34dvh,260px);overflow:auto;display:flex;flex-direction:column;gap:6px;padding:4px 2px}#chat-log .m{max-width:88%;padding:7px 10px;border-radius:10px;font-size:13px;line-height:1.4;white-space:pre-wrap;overflow-wrap:anywhere}#chat-log .me{align-self:flex-end;background:#2b3f5a}#chat-log .ag{align-self:flex-start;background:#26202f;border:1px solid #6b4f8f}#chat-log .m small{display:block;opacity:.65;font:10px monospace;margin-bottom:2px}#chat-log .st{align-self:flex-start;font-size:12px;color:#ffd58a}#chat-log .st[data-state=failed]{color:#ff9a9a}#chat-log .empty{opacity:.6;font-size:12px}#cc-send,#chat-refresh,.chat-resend,#panel-chat{background:#1f3a2c;color:#f3f5fb;border:1px solid #4caf7a;border-radius:7px;min-height:40px;padding:6px 12px}#cc-send:disabled{opacity:.5}.chat-resend{min-height:32px;margin-left:6px}#chat-hint{font-size:11px;opacity:.7;margin:0}#chat-title{font:600 12px monospace;margin:0}';
  document.head.append(style);
  const wrap = document.createElement('div'); wrap.id = 'chat-wrap';
  wrap.innerHTML = '<p id="chat-title"></p><div id="chat-log" role="log" aria-live="polite" aria-relevant="additions text"></div><div class="row"><button id="cc-send" type="button"></button><button id="chat-refresh" type="button"></button></div><p id="chat-hint"></p>';
  root.insertBefore(wrap, root.querySelector('.cc-bottom') || null);
  const log = $('#chat-log'), send = $('#cc-send');
  const panelBtn = document.createElement('button'); panelBtn.id = 'panel-chat'; $('#panel')?.append(panelBtn);
  let busy = false, shown = null, viewSeq = 0, items = [], local = null, loadError = false;

  const slugOf = a => a?.id?.replace(/^slug:/, '') || null;
  function current() { const m = getModel(); const a = m?.mentionedIds?.length === 1 ? getAgent(m.recipientId) : null; return a || (!m?.mentionedIds?.length ? getAgent(getSelected()) : null); }
  const isMessage = () => root.dataset.intent !== 'task';

  function bubble(cls, who, text) { const d = document.createElement('div'); d.className = 'm ' + cls; const s = document.createElement('small'); s.textContent = who; d.append(s, document.createTextNode(text)); return d; }
  function status(state, code, extra) {
    const d = document.createElement('div'); d.className = 'st'; d.dataset.state = state;
    d.textContent = state === 'unknown' ? t('unknown') + ' (' + t(code) + ')' : state === 'failed' ? t('failed') + ' ' + t(code) : t('waiting');
    if (extra) d.append(extra); return d;
  }
  function renderLog() {
    log.replaceChildren();
    if (!shown) { const e = document.createElement('p'); e.className = 'empty'; e.textContent = t('pick'); log.append(e); return; }
    if (loadError) { const e = document.createElement('p'); e.className = 'empty'; e.textContent = t('loadFail'); log.append(e); }
    const rows = [...items];
    if (local && local.slug === shown.slug && !rows.some(r => r.turn === local.turn)) rows.push({ turn: local.turn, text: local.text, state: 'dispatching', code: 'pending' });
    if (!rows.length && !loadError) { const e = document.createElement('p'); e.className = 'empty'; e.textContent = t('noHistory'); log.append(e); }
    for (const r of rows) {
      log.append(bubble('me', t('you'), r.text));
      if (r.state === 'completed') log.append(bubble('ag', t('agent') + ' · ' + shown.name + ' · ' + t('fixture'), r.reply || ''));
      else if (r.state === 'dispatching') log.append(status('dispatching', 'pending'));
      else {
        let extra = null;
        if (r.state === 'unknown') { extra = document.createElement('button'); extra.type = 'button'; extra.className = 'chat-resend'; extra.textContent = t('resend');
          extra.onclick = () => { if (busy) return; input.value = '@' + shown.slug + ' ' + r.text; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); }; }
        log.append(status(r.state, r.code, extra));
      }
    }
    log.scrollTop = log.scrollHeight;
  }
  async function load() {
    const a = current(); const seq = ++viewSeq;
    shown = a ? { slug: slugOf(a), name: a.name } : null;
    if (!shown) { items = []; loadError = false; return renderAll(); }
    const slug = shown.slug;
    try {
      const r = await fetch('/office/api/gateway/chat/history?slug=' + encodeURIComponent(slug), { headers: { 'X-Office-Token': token } });
      const data = r.ok ? await r.json() : null;
      if (seq !== viewSeq || shown?.slug !== slug) return;       // a newer view won: drop the stale answer
      items = data?.items ?? []; loadError = !r.ok;
    } catch { if (seq !== viewSeq) return; items = []; loadError = true; }
    renderAll();
  }
  function renderAll() {
    const ok = !!current() && !busy && isMessage() && !!draftBody(input.value, current()).trim() && getModel().mentionedIds.length === 1;
    $('#chat-title').textContent = shown ? t('chatWith') + ' ' + shown.name + ' [slug:' + shown.slug + ']' : '';
    send.textContent = busy ? t('sending') : t('send'); send.disabled = !ok;
    $('#chat-refresh').textContent = t('check'); $('#chat-hint').textContent = t('hint') + ' · ' + t('receipts'); panelBtn.textContent = t('open');
    wrap.hidden = !isMessage(); if (shown && isMessage()) root.classList.add('cc-live');   // an open conversation must stay visible (mobile collapses the composer otherwise)
    renderLog();
  }
  async function submit() {
    if (busy || !isMessage()) return;
    const a = current(), m = getModel();
    if (!a || m.mentionedIds.length !== 1) return;
    const text = draftBody(input.value, a).trim(); if (!text) return;
    const slug = slugOf(a), turn = crypto.randomUUID().replaceAll('-', '');
    busy = true; local = { slug, turn, text }; input.value = '@' + slug + ' '; input.dispatchEvent(new Event('input', { bubbles: true }));
    shown = { slug, name: a.name }; renderAll();
    let data = null, restored = false;
    try {
      const r = await fetch('/office/api/gateway/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Office-Token': token }, body: JSON.stringify({ slug, text, turn }) });
      try { data = await r.json(); } catch { data = { state: 'unknown', code: 'no_confirmation' }; }
    } catch { data = { state: 'unknown', code: 'network' }; }
    // Delivered nothing at all (blocked / busy / definite failure before the engine): give the text back so nothing is lost.
    if (['blocked', 'busy', 'conflict'].includes(data.state) || (data.state === 'failed' && data.code !== 'engine_error')) { if (!input.value) { input.value = '@' + slug + ' ' + text; input.dispatchEvent(new Event('input', { bubbles: true })); restored = true; } }
    busy = false; local = null;
    window.dispatchEvent(new CustomEvent('chat-turn', { detail: { slug, turn, state: data.state, code: data.code, restored } }));
    await load();
    if (['blocked', 'busy', 'conflict'].includes(data.state)) { const d = status('failed', data.code); log.append(d); log.scrollTop = log.scrollHeight; }
  }
  send.onclick = submit;
  $('#chat-refresh').onclick = load;
  panelBtn.onclick = () => { const a = getAgent(getSelected()); if (!a || busy) return; root.querySelector('[data-intent="message"]')?.click(); input.value = '@' + slugOf(a) + ' '; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); };
  input.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;       // Shift+Enter = newline; IME composition never sends
    if (input.getAttribute('aria-expanded') === 'true') return;                              // mention list owns Enter
    if (!isMessage()) return;
    e.preventDefault(); submit();
  });
  for (const ev of ['input', 'office-state', 'office-language']) window.addEventListener(ev, () => { if (ev === 'office-language') renderAll(); }, false);
  input.addEventListener('input', () => { const a = current(); renderAll(); if ((a ? slugOf(a) : null) !== shown?.slug) load(); });
  root.querySelector('#cc-intent')?.addEventListener('click', () => setTimeout(() => load(), 0));
  window.addEventListener('office-select', () => load());
  load();
  return { reload: load, state: () => ({ busy, shown, items: items.length }) };
}
