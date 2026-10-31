// Unit checks for the read-only Javis live feed + viewer mapping. Run: node tools/verify-live-feed.ts
import { readFileSync } from 'node:fs';
import { JavisLiveFeed, type WorkforceSnapshot, type WorkforceAgent } from '../src/javisLive.ts';
import { JavisReadOnlyViewer, type ViewerLayout } from '../src/javisViewer.ts';
import type { Department } from '../src/types.ts';

let failed = 0;
const check = (name: string, ok: boolean, extra: unknown = '') => {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && extra ? '  ' + JSON.stringify(extra).slice(0, 400) : ''));
  if (!ok) failed++;
};

const NOW = 1_800_000_000;
const mkAgent = (slug: string, over: Partial<WorkforceAgent> = {}): WorkforceAgent => ({
  id: 'slug:' + slug, slug, name: slug.toUpperCase(), role: 'Role ' + slug, kind: 'persistent', system: false,
  activity: 'idle', activity_reason: '', task: null, queued: 0, approval: null,
  usage: { available: false, reason: 'no_recorded_calls' }, ...over,
});
const task = (id: string, title: string, over = {}) => ({
  id, title, source: 'team', team: 'Ops team', status: 'team_running', bucket: 'running', step: { done: 1, total: 3 }, step_kind: 'work',
  reason: '', next: '', queue_pos: null, started_at: null, state_changed_at: NOW - 120, parent: null, open: null, ...over,
});
const baseSnap = (seq: number, agents: WorkforceAgent[], extra: Partial<WorkforceSnapshot> = {}): WorkforceSnapshot => ({
  schema: 'javis.workforce/1', seq, epoch: 'e1', generated_at: NOW, brain: { label: 'Kyan' },
  sources: {
    tasks: { available: true, source: 'agent_jobs.collect', at: NOW }, approvals: { available: true, source: 'team_approvals', at: NOW },
    usage: { available: false, source: 'agent_calls', at: null }, subagents: { available: false, source: 'none', at: null, reason: 'javis_records_no_subagent_lifecycle' },
  },
  agents, subagents: [], approvals: { pending: 0, questions: 0, attached: 0, items: [] }, ...extra,
});

// ---- scripted fake Javis (no network): records every request
const calls: Array<{ method: string; url: string; auth: string | null }> = [];
let mode: 'ok' | '401' | '403' | 'down' = 'ok';
let snapshot = baseSnap(1, [mkAgent('leon'), mkAgent('lyly')]);
let eventsReply: any = { epoch: 'e1', seq: 1, reset: false, events: [], changed: false };
const fakeFetch: typeof fetch = async (url: any, init: any) => {
  const u = String(url);
  calls.push({ method: init?.method ?? 'GET', url: u, auth: (init?.headers as any)?.Authorization ?? null });
  if (mode === 'down') throw new Error('ECONNREFUSED');
  if (mode === '401') return new Response('{"error":"unauthorized"}', { status: 401 });
  if (mode === '403') return new Response('{"error":"forbidden"}', { status: 403 });
  if (u.includes('/workforce/snapshot')) return new Response(JSON.stringify(snapshot), { status: 200 });
  if (u.includes('/workforce/events')) return new Response(JSON.stringify(eventsReply), { status: 200 });
  return new Response('{}', { status: 404 });
};

let clock = 1_000_000;
const feed = new JavisLiveFeed({ baseUrl: 'http://127.0.0.1:7790/', token: 'jvs_SECRETTOKEN', brain: 'C:\\b\\Kyan', fetchImpl: fakeFetch, now: () => clock, intervalMs: 1000 });

const departments = JSON.parse(readFileSync('office.config.json', 'utf8')).departments as Department[];
const layout: ViewerLayout = { default: 'dieu-phoi', byId: { 'slug:leon': 'khach-hang', 'slug:lyly': 'khach-hang' } };
const viewer = new JavisReadOnlyViewer(departments, false, { live: feed, layout, openBase: 'http://127.0.0.1:7790' });
let changes = 0;
viewer.on('changed', () => changes++);

// 1. first poll
await feed.tick();
check('first tick takes a snapshot and connects', feed.status().connection === 'CONNECTED' && feed.getSnapshot()?.seq === 1, feed.status());
check('only GET with bearer header, token never in a URL', calls.every(c => c.method === 'GET' && c.auth === 'Bearer jvs_SECRETTOKEN' && !c.url.includes('jvs_')), calls);
check('requests carry the bound brain', calls.every(c => c.url.includes('brain=C%3A%5Cb%5CKyan')));
let snap: any = viewer.snapshot();
check('real roster size is shown (2), not the six demo actors', snap.agents.length === 2 && snap.agents.every((a: any) => a.card.source.kind === 'LIVE'));
check('stable ids and layout zone from viewer layout', snap.agents[0].id === 'slug:leon' && snap.agents[0].departmentId === 'khach-hang' && snap.agents[0].card.department.source === 'viewer-layout');
check('idle is idle; usage unavailable is not zero', snap.agents[0].status === 'idle' && snap.agents[0].card.usage.available === false && snap.agents[0].card.usage.tokensIn === undefined);
check('sample/mock controls refuse in live mode', viewer.isLive() === true);

// 2. activity: working / queued / needs_input / approval_pending are distinct statuses
snapshot = baseSnap(2, [
  mkAgent('a', { activity: 'working', task: task('team:T1', 'Draft report') as any }),
  mkAgent('b', { activity: 'queued', task: task('team:T2', 'Later', { bucket: 'waiting', status: 'team_queued', queue_pos: 2 }) as any }),
  mkAgent('c', { activity: 'needs_input', task: task('kanban:K1', 'Reply batch', { bucket: 'needs_you', source: 'chat', reason: 'need price' }) as any }),
  mkAgent('d', { activity: 'approval_pending', task: task('team:T3', 'Ship plan') as any,
    approval: { id: 'A1', title: 'Approve ship plan', kind: 'plan', team_id: 't1', task_id: 'T3', requested_at: NOW - 30, deadline_at: null, open: { kind: 'team', team_id: 't1', task_id: 'T3' } } }),
  mkAgent('e', { activity: 'unknown', activity_reason: 'core_not_instrumented', system: true }),
], { approvals: { pending: 1, questions: 0, attached: 1, items: [{ id: 'A1', agent_id: 'slug:d', title: 'Approve ship plan', kind: 'plan', requested_at: NOW - 30, open: null }] } });
eventsReply = { epoch: 'e1', seq: 2, reset: false, changed: true, events: [
  { seq: 2, event_id: 'ev-1', type: 'agent.activity', agent_id: 'slug:a', from: 'idle', to: 'working', at: NOW - 120, seen_at: NOW, task_id: 'team:T1' },
  { seq: 2, event_id: 'ev-2', type: 'approval.requested', agent_id: 'slug:d', from: null, to: 'pending', at: NOW - 30, seen_at: NOW, approval_id: 'A1', task_id: 'T3' },
] };
await feed.tick();
snap = viewer.snapshot();
const by: Record<string, any> = Object.fromEntries(snap.agents.map((a: any) => [a.id, a]));
check('four attention states map to distinct scene statuses',
  by['slug:a'].status === 'working' && by['slug:b'].status === 'queued' && by['slug:c'].status === 'input' && by['slug:d'].status === 'waiting', Object.values(by).map((a: any) => a.status));
check('core activity stays unknown (not idle)', by['slug:e'].status === 'unknown');
check('hover card facts come from the record', by['slug:a'].card.task.title === 'Draft report' && by['slug:a'].card.task.step.total === 3 && by['slug:a'].card.task.team === 'Ops team'
  && by['slug:a'].card.task.stateChangedAt === (NOW - 120) * 1000 && by['slug:a'].card.task.startedAt === null);
check('approval carries a Javis deep link and request time', by['slug:d'].card.approval.openUrl === 'http://127.0.0.1:7790/#team=t1&task=T3' && by['slug:d'].card.approval.requestedAt === (NOW - 30) * 1000);
check('approvals summary counts only confirmed approvals', snap.approvalSummary.pending === 1 && snap.approvals.length === 1 && snap.approvals[0].agentId === 'slug:d');
check('events were applied and a feed line is structured (EN/VI by key)', feed.status().eventsApplied === 2 && snap.feed.some((f: any) => f.data.msg.key === 'feed.approvalRequested') && snap.feed.some((f: any) => f.data.msg.key === 'feed.workingOn'), snap.feed);

// 3. deduplication across repeated delivery
eventsReply = { epoch: 'e1', seq: 2, reset: false, changed: false, events: eventsReply.events };
await feed.tick();
check('replayed events are dropped by event_id', feed.status().duplicatesDropped === 2 && feed.status().eventsApplied === 2, feed.status());

// 4. reset forces a snapshot reconcile
snapshot = baseSnap(5, [mkAgent('a')]);
eventsReply = { epoch: 'e2', seq: 5, reset: true, changed: true, events: [] };
await feed.tick();
check('server reset => snapshot reconciled, roster replaced', feed.getSnapshot()?.seq === 5 && viewer.snapshot().agents.length === 1 && feed.status().resets === 1);

// 5. failures: stale first, then DISCONNECTED -> everything UNKNOWN (never false idle)
mode = 'down';
await feed.tick();
check('first failure keeps data but flags STALE', feed.status().connection === 'STALE' && viewer.snapshot().agents[0].card.source.stale === true, feed.status());
await feed.tick(); await feed.tick();
snap = viewer.snapshot();
check('after repeated failures status is DISCONNECTED and every agent is unknown with no task/approval',
  feed.status().connection === 'DISCONNECTED' && snap.agents.every((a: any) => a.status === 'unknown' && a.card.task === null && a.card.approval === null && a.card.source.kind === 'UNKNOWN')
  && snap.approvalSummary.pending === null, feed.status());
check('usage shows unavailable, never zero, when disconnected', snap.agents.every((a: any) => a.card.usage.available === false));
mode = 'ok';
snapshot = baseSnap(6, [mkAgent('a', { activity: 'working', task: task('team:T9', 'Back again') as any })]);
eventsReply = { epoch: 'e2', seq: 6, reset: false, changed: true, events: [] };
await feed.tick();
check('recovery reconnects and resumes', feed.status().connection === 'CONNECTED' && viewer.snapshot().agents[0].status === 'working');

// 6. staleness by time alone
clock += 60_000;
check('no response for a long time => STALE without any error', feed.status().connection === 'STALE');
clock += 0;

// 7. auth failures do not hammer
const before = calls.length;
mode = '401';
await feed.tick();
check('401 => AUTH_FAILED, reason shown, agents unknown', feed.status().connection === 'AUTH_FAILED' && viewer.snapshot().agents.every((a: any) => a.status === 'unknown'), feed.status());
mode = '403';
await feed.tick();
check('403 => AUTH_FAILED with brain-refused reason', feed.status().connection === 'AUTH_FAILED' && /refused this brain/.test(feed.status().reason));
check('status exposes host but never the token', !JSON.stringify(feed.status()).includes('SECRETTOKEN') && !JSON.stringify(viewer.getViewerStatus()).includes('SECRETTOKEN'));
check('viewer emitted change notifications', changes >= 4, changes);
check('network calls stayed GET-only the whole run', calls.every(c => c.method === 'GET') && calls.length > before);

// 8. DEMO viewer still labels its data and has no invented timestamps
const demo = new JavisReadOnlyViewer(departments, true, { layout });
const ds: any = demo.snapshot();
check('DEMO cards are labelled DEMO with no observed times', ds.agents.every((a: any) => a.card.source.kind === 'DEMO' && a.card.task?.stateChangedAt == null));
check('DEMO waiting agent has an approval fixture marked demo', ds.approvals.length === 1 && ds.approvals[0].kind === 'demo' && ds.approvals[0].openUrl === null);

feed.stop(); viewer.shutdown();
console.log(failed ? `\n${failed} FAILED` : '\nAll live-feed checks passed');
process.exit(failed ? 1 : 0);
