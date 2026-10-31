// Office Commentary (UX v0.5 slice 1): one short, natural HUD sentence chosen by plain rules.
// No model call, no randomness, no network. Inputs are only things the HUD already shows:
//   working / approvals: Javis records (or DEMO). null means unknown, never 0.
//   cafe / game: where the scene placed people (a simulated position, not Javis data).
// Variants rotate on a slow clock bucket, so the 2 s poll never makes the sentence flicker.

export const VARIANTS = {
  offline: 1, approval: 2, work: 2, workBreak: 1, allBreak: 1, gameMore: 1, someBreak: 1, quiet: 1, quietNight: 1, demo: 1, demoApproval: 1,
};
const BUCKET_MS = 90_000;

/** @param {{mode:'live'|'demo'|'offline', total:number, working:number|null, approvals:number|null, cafe:number, game:number, night?:boolean, now?:number}} c */
export function pickCommentary(c) {
  const bucket = Math.floor((c.now ?? Date.now()) / BUCKET_MS);
  const pick = (id) => ({ id, key: `comment.${id}.${bucket % VARIANTS[id]}` });
  const out = (id, tone, tip) => ({ ...pick(id), tone, tip, tag: c.mode === 'demo' ? 'comment.tag.demo' : null });
  if (c.mode === 'offline' || c.working == null) return out('offline', 'muted', 'comment.tip.offline');
  if (c.mode === 'demo') return c.approvals > 0 ? out('demoApproval', 'attn', 'comment.tip.demo') : out('demo', 'demo', 'comment.tip.demo');
  const tip = 'comment.tip.live';
  const away = (c.cafe || 0) + (c.game || 0);
  if (c.approvals > 0) return out('approval', 'attn', tip);
  if (c.working > 0) return c.cafe > 0 ? out('workBreak', 'work', tip) : out('work', 'work', tip);
  if (c.total > 0 && away >= c.total) return out('allBreak', 'break', tip);
  if ((c.game || 0) >= 2 && c.game > (c.cafe || 0)) return out('gameMore', 'break', tip);
  if (away > 0) return out('someBreak', 'break', tip);
  return c.night ? out('quietNight', 'quiet', tip) : out('quiet', 'quiet', tip);
}

/** Office roles come from the registered roster only; nothing here creates or counts an agent. */
export function officeRole(agent) {
  if (!agent) return null;
  if (agent.id === 'slug:kyan') return 'director';
  if (agent.id === 'slug:javis-core') return 'system';
  return null;
}
export const findDirector = (agents) => (agents || []).find((a) => officeRole(a) === 'director') || null;
