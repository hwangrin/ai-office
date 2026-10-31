// Display-only projection. Never edits the Javis record or creates a translation request.
let catalog = new Map();
const hashes = new Map();
const sourceOf = a => a.canonicalIdentity || { name: a.name || '', role: a.role || '', description: a.description || '' };
export const identityText = a => JSON.stringify(sourceOf(a));
export function setIdentityCatalog(data) {
  catalog = new Map((Array.isArray(data?.entries) ? data.entries : []).filter(e => e && typeof e.id === 'string' && typeof e.sourceHash === 'string').map(e => [(e.brainId||'')+'|'+(e.agentIdentity||e.id) + ':' + e.sourceHash, e]));
}
export async function prepareIdentities(agents) {
  await Promise.all(agents.filter(a => a.id).map(async a => {
    const text = identityText(a);
    if (!hashes.has(text)) hashes.set(text, crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(b => Array.from(new Uint8Array(b), v => v.toString(16).padStart(2, '0')).join('')));
    const hash = await hashes.get(text);
    hashes.set(text, hash);
  }));
}
export function projectIdentity(a, language) {
  if (!a.id || a.id.startsWith('local:')) return a;
  const source = sourceOf(a), hash = hashes.get(JSON.stringify(source));
  const entry = typeof hash === 'string' ? catalog.get((a.displayBrainId||'')+'|'+(a.canonicalAgentId||a.id)+':'+hash) || catalog.get((a.displayBrainId||'')+'|'+a.id+':'+hash) : null;
  const display = entry?.[language === 'vi' ? 'vi' : 'en'];
  return { ...a, canonicalIdentity: source, identityHash: typeof hash === 'string' ? hash : null,
    identityFallback: !display, identityReview: entry?.reviewStatus || 'unavailable',
    name: display?.name || source.name.replace(/\s*[·-]?\s*FIXTURE\s*/gi,'').trim(), role: display?.role || source.role || '',
    description: display?.description || source.description || '' };
}
// Preserve real source information until its prepared catalog update is published.
// No request-time translation, chat rewriting or technical fallback notices.
export const identityNotice = () => '';
