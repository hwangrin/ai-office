import assert from 'node:assert/strict';
import { projectNativeRoster, projectNativeJobList } from '../src/cloud-roster.ts';

const roster = [
  { slug: 'alpha', agent_key: 'agent-key-a', name: 'Alpha' },
  { slug: 'beta', agent_key: 'agent-key-b', name: 'Beta' },
  { slug: 'gamma', agent_key: 'agent-key-c', name: 'Gamma' },
  { slug: 'delta', agent_key: 'agent-key-d', name: 'Delta' },
];
const brain = { id: 'qts', path: 'Brains/QTS', name: 'QTS', label: 'QTS' };
const observedAt = 1_790_000_000;
const result = projectNativeRoster(roster, brain, {
  ok: true,
  counts: {
    alpha: { running: 2, needs_you: 1, waiting: 4, done: 0, failed: 0 },
    beta: { running: 0, needs_you: 0, waiting: 3, done: 0, failed: 0 },
    gamma: { running: 0, needs_you: 1, waiting: 0, done: 0, failed: 0 },
  },
}, observedAt);
const bySlug = Object.fromEntries(result.agents.map(a => [a.slug, a]));
assert.equal(bySlug.alpha.activity, 'working', 'only active execution is working');
assert.equal(bySlug.alpha.queued, 4, 'queued work stays separate from active work');
assert.equal(bySlug.beta.activity, 'queued', 'waiting task is not active execution');
assert.equal(bySlug.gamma.activity, 'needs_you', 'needs_you is generic attention, not approval');
assert.equal(bySlug.delta.activity, 'unknown', 'no registered job does not prove the agent is available');
assert.equal(bySlug.delta.activity_reason, 'jobs_empty_partial_coverage');
assert.deepEqual(bySlug.delta.work_counts, { running: 0, needs_you: 0, waiting: 0, done: 0, failed: 0 });
assert.equal(result.sources.tasks.available, true);
assert.equal(result.sources.tasks.scope, 'registered_jobs');
assert.equal(result.sources.tasks.activityComplete, false);
assert.equal(result.brain.label, 'QTS');
assert.equal(bySlug.alpha.agent_key, 'agent-key-a');

const unavailable = projectNativeRoster(roster, brain, null, observedAt);
assert.ok(unavailable.agents.every(a => a.activity === 'unknown'), 'unavailable records must not become zero/idle');
assert.equal(unavailable.sources.tasks.available, false);

const malformed = projectNativeRoster(roster, brain, { ok: true, counts: { alpha: { running: '2' } } }, observedAt);
assert.equal(malformed.agents.find(a => a.slug === 'alpha').activity, 'unknown', 'malformed counts are not trusted');

const detail = projectNativeJobList({ ok: true, errors: [], jobs: [
  { id: 'team:t1', title: 'Actively running', source: 'team', bucket: 'running', updated_at: observedAt },
  { id: 'kanban:t2', title: 'Queued', source: 'chat', bucket: 'waiting', updated_at: observedAt },
  { id: 'goal:t3', title: 'Needs attention', source: 'auto', bucket: 'needs_you', updated_at: observedAt },
  { id: 'kanban:t4', title: 'Finished', source: 'chat', bucket: 'done', updated_at: observedAt },
  { id: 'goal:t5', title: 'Failed', source: 'auto', bucket: 'done', failed: true, updated_at: observedAt },
] });
assert.deepEqual(detail.items.map(j => j.status), ['running', 'waiting', 'needs_you', 'completed', 'failed']);
assert.ok(!detail.items.some(j => j.status === 'running' && j.title === 'Queued'));
assert.equal(projectNativeJobList({ ok: true, errors: ['team source unavailable'], jobs: [] }).available, false,
  'partial profile results stay unknown instead of appearing empty');
console.log('cloud-roster work status assertions passed');
