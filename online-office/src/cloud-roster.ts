/** Display adapter for authenticated Javis roster + native registered Jobs count records.
 *  This projects existing read-only Javis data; it does not create or store tasks. */
const absent = (source: string) => ({ available: false, source, at: null, reason: 'not_available' });
const isRecord = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const validCount = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;

function countRow(value: unknown) {
  if (!isRecord(value) || !validCount(value.running) || !validCount(value.needs_you) || !validCount(value.waiting)) return null;
  for (const key of ['done', 'failed']) if (value[key] !== undefined && !validCount(value[key])) return null;
  return { running: value.running, needs_you: value.needs_you, waiting: value.waiting, done: value.done ?? 0, failed: value.failed ?? 0 };
}

/** Counts is sparse by design: a missing slug in a successful, complete response means no recorded Jobs.
 *  A missing/invalid response means Unknown for every agent and must never be painted as zero. */
export function projectNativeRoster(roster: any[], brain: any, jobs: any = null, at = Date.now() / 1000) {
  const hasCounts = jobs?.ok === true && isRecord(jobs.counts);
  const observedAt = Number.isFinite(at) ? at : Date.now() / 1000;
  const jobsSource = { available: hasCounts, source: 'native /agents/jobs/counts', scope: 'registered_jobs', activityComplete: false,
    at: hasCounts ? observedAt : null,
    ...(!hasCounts ? { reason: 'not_available' } : {}) };
  const project = (a: any) => {
    const slug = typeof a?.slug === 'string' ? a.slug : '';
    const present = !!slug && hasCounts && Object.hasOwn(jobs.counts, slug);
    const counts = present ? countRow(jobs.counts[slug]) : hasCounts ? { running: 0, needs_you: 0, waiting: 0, done: 0, failed: 0 } : null;
    const known = !!counts;
    // Registered Jobs do not cover every ordinary chat/background execution. A valid zero row
    // proves only that no registered job was found; it does not prove the agent is available.
    const activity = !known ? 'unknown' : counts.running > 0 ? 'working' : counts.needs_you > 0 ? 'needs_you'
      : counts.waiting > 0 ? 'queued' : 'unknown';
    return { ...a, id: a.agent_key || 'slug:' + (slug || 'unknown'), agent_key: a.agent_key || 'slug:' + (slug || 'unknown'),
      kind: 'persistent', system: slug === 'javis-core' || !!a.system, activity,
      activity_reason: known ? (activity === 'unknown' ? 'jobs_empty_partial_coverage' : 'native_jobs_counts') : 'jobs_unavailable',
      task: null, queued: counts?.waiting ?? 0,
      work_counts: counts, work_status_at: known ? observedAt : null,
      approval: null, usage: { available: false, reason: 'not_available_in_native_roster' } };
  };
  return { schema: 'javis.workforce/1', seq: 0, epoch: 'cloud-roster:' + brain.id + ':' + (hasCounts ? 'jobs' : 'unknown'),
    generated_at: observedAt, brain: { label: brain.label || brain.name },
    sources: {
      agents: { available: true, source: 'native /agents?prompt=0&system=1', at: observedAt },
      tasks: jobsSource, activity: jobsSource, approvals: absent('native_jobs_counts'), usage: absent('native_roster'), subagents: absent('native_roster'),
    }, agents: roster.map(project), subagents: [],
    approvals: { pending: 0, questions: 0, attached: 0, items: [] } };
}

/** Safe profile projection from Javis' existing read-only agent Jobs endpoint. */
export function projectNativeJobList(response: any) {
  const errors = Array.isArray(response?.errors) ? response.errors : null;
  if (response?.ok !== true || !Array.isArray(response.jobs) || !errors || errors.length) return { available: false, items: [] };
  const statuses: Record<string, string> = { running: 'running', waiting: 'waiting', needs_you: 'needs_you' };
  const items = response.jobs.flatMap((job: any) => {
    const bucket = String(job?.bucket || '');
    const title = typeof job?.title === 'string' ? job.title.trim() : '';
    if (!title || !['running', 'waiting', 'needs_you', 'done'].includes(bucket)) return [];
    const status = bucket === 'done' ? (job.failed ? 'failed' : job.cancelled ? 'cancelled' : 'completed') : statuses[bucket];
    const stamp = Number(job.updated_at);
    const sessionId = job?.open?.kind === 'chat' && typeof job.open.session_id === 'string' ? job.open.session_id : '';
    return [{ id: String(job.id || ''), title: title.slice(0, 240), source: ['team', 'chat', 'auto'].includes(job.source) ? job.source : '',
      status, updatedAt: Number.isFinite(stamp) && stamp > 0 ? Math.round(stamp * 1000) : null, sessionId }];
  });
  return { available: true, items };
}
