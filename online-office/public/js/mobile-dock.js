// Mobile dock (UX v0.5 slice 1): keeps the bottom composer reachable while an agent panel is open,
// follows the on-screen keyboard, and lets the panel be minimized. Pure layout: no network, no state of its own beyond CSS variables.
import { message } from './i18n.js';

const $ = (s) => document.querySelector(s);

export function initMobileDock() {
  const root = document.documentElement, cc = $('#chat-composer'), panel = $('#panel'), min = $('#p-min');
  const measure = () => root.style.setProperty('--cc-h', Math.max(cc && !cc.hidden ? Math.ceil(cc.getBoundingClientRect().height) : 0, 64) + 'px');
  if (cc && 'ResizeObserver' in window) new ResizeObserver(measure).observe(cc);
  // ResizeObserver is frame-bound and can lag on slow devices; DOM mutations and input run in microtasks, so the panel offset never trails the composer height.
  if (cc) new MutationObserver(measure).observe(cc, { attributes: true, attributeFilter: ['class', 'hidden'], childList: true, subtree: true, characterData: true });
  window.addEventListener('resize', measure);
  measure();
  // ResizeObserver can lag on slow renderers; also re-measure right after the composer content changes.
  const soon = () => { measure(); requestAnimationFrame(measure); };
  cc?.addEventListener('input', soon); window.addEventListener('office-language', soon);
  window.addEventListener('resize', soon);
  const vv = window.visualViewport;
  const keyboard = () => {
    if (!vv) return;
    const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    root.style.setProperty('--kb', inset + 'px');
    root.style.setProperty('--vvh', Math.round(vv.height) + 'px');
    document.body.classList.toggle('kb-open', inset > 80);
  };
  vv?.addEventListener('resize', keyboard); vv?.addEventListener('scroll', keyboard); keyboard();
  $('#cc-input')?.addEventListener('focus', () => setTimeout(() => cc?.scrollIntoView({ block: 'end' }), 250));
  const label = () => {
    if (!min || !panel) return;
    const m = panel.classList.contains('min');
    min.textContent = message(m ? 'panel.expand' : 'panel.min'); min.setAttribute('aria-expanded', String(!m));
  };
  min?.addEventListener('click', () => { panel.classList.toggle('min'); label(); });
  // A newly opened or closed panel always starts expanded.
  // Guard the write: classList.remove() on an absent token still queues a mutation record, which would re-trigger this observer forever.
  new MutationObserver(() => { if (!panel.classList.contains('open') && panel.classList.contains('min')) panel.classList.remove('min'); label(); }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('office-language', label);
  label();
  return { measure, keyboard };
}
