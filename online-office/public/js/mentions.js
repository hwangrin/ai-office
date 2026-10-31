// Pure @mention helpers (no DOM). Shared by the composer and the node unit test.
/** Lower-case, diacritic-free form used only for matching (so "Chi" finds "Chị"). */
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Addressable agents: persistent roster entries only (temporary subagents are not message targets). */
export function roster(state) {
  return (state.agents || []).filter((a) => a.actorKind !== 'subagent');
}

function keysOf(a) {
  const slug = norm(String(a.id).replace(/^slug:/, ''));
  return [...new Set([norm(a.name), slug].filter(Boolean))];
}

/**
 * Stateless mention resolution. Returns the distinct agents mentioned in `text` (longest names first, so
 * "@Leon Pro" is never read as "@Leon"). The result carries the stable ID, which is what routing uses.
 */
export function resolveMentions(text, agents) {
  let t = ' ' + norm(text) + ' ';
  const byKey = new Map();
  for (const a of agents) for (const k of keysOf(a)) byKey.set(k, [...(byKey.get(k) || []), a]);
  const found = new Map();
  for (const k of [...byKey.keys()].sort((x, y) => y.length - x.length)) {
    const re = new RegExp('(^|[\\s(])@' + reEsc(k) + '(?=$|[\\s.,;:!?)])', 'g');
    if (re.test(t)) {
      // A display name shared by several agents is ambiguous: every holder is returned so the caller refuses to route.
      for (const a of byKey.get(k)) found.set(a.id, a);
      t = t.replace(re, (m, p) => p + ' '.repeat(k.length + 1));
    }
  }
  return [...found.values()];
}

/** Draft text without the @mention, which is routing metadata and not part of the message body. */
export function draftBody(text, recipient) {
  if (!recipient) return text.trim();
  // Build a diacritic-free copy with an index map back to the original so accent-less mentions are removed too.
  let n = '', map = [];
  [...text].forEach((ch, idx) => { const x = norm(ch); for (const c of x) { n += c; map.push(idx); } });
  const chars = [...text];
  const drop = new Set();
  for (const k of keysOf(recipient)) {
    const re = new RegExp('(^|[\\s(])(@' + reEsc(k) + ')(?=$|[\\s.,;:!?)])', 'g');
    let m;
    while ((m = re.exec(n))) { const from = m.index + m[1].length; for (let q = from; q < from + m[2].length; q++) drop.add(map[q]); }
  }
  return chars.filter((_, idx) => !drop.has(idx)).join('').replace(/\s{2,}/g, ' ').trim();
}
