// Brain selector (UX v0.5 slice 2). The Brain list comes from the viewer server (configuration + per-Brain credential check);
// nothing is hardcoded here. Switching is a local view choice: the server swaps its Brain-bound feed and bumps `seq`.
// Every response carries the seq it was built for, so a late answer for the previous Brain can be recognised and dropped.
import { message } from './i18n.js';

const $ = (s) => document.querySelector(s);
let api = null, onSwitch = null, list = [], seq = 0, busy = false;

export const currentBrainSeq = () => seq;
/** True when a payload (state, history page...) was produced for an older Brain than the one on screen. */
export const isStaleBrain = (payloadSeq) => payloadSeq != null && Number(payloadSeq) < seq;

function render() {
  const wrap = $('#brain-wrap'), sel = $('#brain-select');
  if (!wrap || !sel) return;
  wrap.hidden = list.length === 0;
  sel.innerHTML = '';
  for (const b of list) {
    const o = document.createElement('option');
    o.value = b.id; o.setAttribute('data-user-content', '1');
    o.textContent = b.access === 'ready' ? b.label : `${b.label} · ${message('brain.accessShort')}`;
    o.title = b.access === 'ready' ? '' : message('brain.accessTip');
    if (b.active) o.selected = true;
    sel.appendChild(o);
  }
  sel.disabled = busy;
}

function adopt(res) {
  list = res.brains || [];
  if (res.seq != null) seq = Math.max(seq, Number(res.seq));
  render();
}

export async function initBrainSelector(opts) {
  api = opts.api; onSwitch = opts.onSwitch;
  const sel = $('#brain-select');
  if (!sel) return;
  try { adopt(await api('/javis-viewer/brains')); } catch { list = []; render(); }
  sel.addEventListener('change', async () => {
    const to = sel.value; busy = true; sel.disabled = true;
    try {
      const res = await api('/javis-viewer/brain', 'POST', { id: to });
      await switched(res);
    } catch (e) { opts.toast?.(message('brain.error')); try { adopt(await api('/javis-viewer/brains')); } catch { /* keep list */ } }
    finally { busy = false; render(); }
  });
  window.addEventListener('office-language', render);
}

/** Called for the POST answer and for the server's `brain` WebSocket event (idempotent per seq). */
export async function switched(res) {
  const nextSeq = Number(res.seq ?? 0);
  const changed = nextSeq > seq || (res.brains && res.brains.find((b) => b.active)?.id !== list.find((b) => b.active)?.id);
  if (res.brains) adopt(res); else seq = Math.max(seq, nextSeq);
  if (changed) await onSwitch?.(seq);
}

/** WebSocket `brain` payload: { id, label, seq, accessRequired }. */
export async function onBrainEvent(p) {
  if (!p || Number(p.seq) <= seq) return;
  try { adopt(await api('/javis-viewer/brains')); } catch { seq = Number(p.seq); }
  await onSwitch?.(seq);
}
