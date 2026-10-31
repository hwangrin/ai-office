// Read-only client for the Javis workforce projection (schema javis.workforce/1).
// The credential stays in this Node process (env / file). It is never sent to the browser and never logged.
// Only GET requests are issued. Connection states are explicit; when Javis cannot be reached the consumer must show
// UNKNOWN, never a false "idle" or a zero cost.
import { EventEmitter } from 'node:events';

export type LiveConnection = 'CONNECTED' | 'STALE' | 'CONNECTING' | 'DISCONNECTED' | 'AUTH_FAILED';

export interface WorkforceTask {
  id: string; title: string; source: string; team: string; status: string; bucket: string;
  step: { done: number; total: number } | null; step_kind: string; reason: string; next: string;
  queue_pos: number | null; started_at: number | null; state_changed_at: number | null;
  parent: string | null; open: unknown;
}
export interface WorkforceApproval {
  id: string; title: string; kind: string; team_id: string; task_id: string;
  requested_at: number | null; deadline_at: number | null; open: unknown;
}
export interface WorkforceAgent {
  id: string; agent_key?: string | null; slug: string; name: string; role: string; kind: 'persistent' | 'subagent'; system: boolean;
  activity: 'working' | 'queued' | 'needs_input' | 'approval_pending' | 'idle' | 'unknown';
  activity_reason: string; task: WorkforceTask | null; queued: number; approval: WorkforceApproval | null;
  parent_id?: string | null;
  usage: { available: boolean; reason?: string; calls?: number; tokens_in?: number; tokens_out?: number; cost_usd?: number; partial?: boolean; window_s?: number };
}
export interface SourceStatus { available: boolean; source: string; at: number | null; reason?: string; error?: string }
export interface WorkforceSnapshot {
  schema: string; seq: number; epoch: string; generated_at: number; brain: { label: string };
  sources: Record<string, SourceStatus>; agents: WorkforceAgent[]; subagents: WorkforceAgent[];
  approvals: { pending: number; questions: number; attached: number; items: Array<{ id: string; agent_id: string; title: string; kind: string; requested_at: number | null; open: unknown }> };
}
export interface WorkforceEvent {
  seq: number; event_id: string; type: string; agent_id: string; from: unknown; to: unknown; at: number | null; seen_at: number;
  task_id?: string; approval_id?: string;
}
export interface LiveStatus {
  configured: boolean; connection: LiveConnection; reason: string; baseHost: string; brainLabel: string | null;
  seq: number | null; epoch: string | null; lastSuccessAt: number | null; lastAttemptAt: number | null;
  consecutiveFailures: number; snapshotAgeMs: number | null; stale: boolean; eventsApplied: number; duplicatesDropped: number; resets: number;
}

export interface LiveOptions {
  baseUrl: string; token: string; brain: string; intervalMs?: number; staleAfterMs?: number; timeoutMs?: number;
  fetchImpl?: typeof fetch; now?: () => number;
}

const MAX_SEEN = 2000;

export class JavisLiveFeed extends EventEmitter {
  private snap: WorkforceSnapshot | null = null;
  private conn: LiveConnection = 'CONNECTING';
  private reason = 'Waiting for the first Javis response.';
  private failures = 0;
  private lastOk: number | null = null;
  private lastTry: number | null = null;
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;
  private seen = new Set<string>();
  private order: string[] = [];
  private applied = 0;
  private dups = 0;
  private resets = 0;
  private recent: WorkforceEvent[] = [];
  private readonly base: string;
  private readonly interval: number;
  private readonly staleAfter: number;
  private readonly timeout: number;
  private readonly doFetch: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly opt: LiveOptions) {
    super();
    this.base = opt.baseUrl.replace(/\/+$/, '');
    this.interval = Math.max(500, opt.intervalMs ?? 2000);
    this.staleAfter = opt.staleAfterMs ?? this.interval * 4 + 2000;
    this.timeout = opt.timeoutMs ?? 8000;
    this.doFetch = opt.fetchImpl ?? fetch;
    this.now = opt.now ?? Date.now;
  }

  start() { this.stopped = false; void this.tick(); }
  stop() { this.stopped = true; clearTimeout(this.timer); }

  getSnapshot(): WorkforceSnapshot | null { return this.snap; }
  getRecentEvents(): WorkforceEvent[] { return this.recent.slice(-60); }

  status(): LiveStatus {
    const age = this.lastOk == null ? null : this.now() - this.lastOk;
    let host = '';
    try { host = new URL(this.base).host; } catch { /* keep empty */ }
    return {
      configured: true, connection: this.effectiveConnection(), reason: this.reason, baseHost: host,
      brainLabel: this.snap?.brain.label ?? null, seq: this.snap?.seq ?? null, epoch: this.snap?.epoch ?? null,
      lastSuccessAt: this.lastOk, lastAttemptAt: this.lastTry, consecutiveFailures: this.failures, snapshotAgeMs: age,
      stale: this.effectiveConnection() === 'STALE', eventsApplied: this.applied, duplicatesDropped: this.dups, resets: this.resets,
    };
  }

  private effectiveConnection(): LiveConnection {
    if (this.conn === 'CONNECTED' && this.lastOk != null && this.now() - this.lastOk > this.staleAfter) return 'STALE';
    return this.conn;
  }

  private async get(path: string): Promise<{ status: number; body: any }> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.timeout);
    try {
      const res = await this.doFetch(this.base + path, {
        method: 'GET', headers: { Authorization: 'Bearer ' + this.opt.token, Accept: 'application/json' }, signal: ctl.signal,
      });
      let body: any = null;
      try { body = await res.json(); } catch { /* non-JSON error body */ }
      return { status: res.status, body };
    } finally { clearTimeout(t); }
  }

  private schedule(ms: number) {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), ms);
    this.timer.unref?.();
  }

  /** One poll cycle (public for tests). Reads events first; takes a snapshot on first run, reset, or change. */
  async tick(): Promise<void> {
    this.lastTry = this.now();
    const q = 'brain=' + encodeURIComponent(this.opt.brain);
    try {
      let needSnapshot = this.snap == null;
      if (this.snap) {
        const ev = await this.get(`/workforce/events?${q}&since=${this.snap.seq}&epoch=${encodeURIComponent(this.snap.epoch)}`);
        if (this.authBad(ev.status)) return this.fail(ev.status);
        if (ev.status !== 200) throw new Error('events HTTP ' + ev.status);
        if (ev.body.reset) { this.resets++; needSnapshot = true; this.seen.clear(); this.order = []; }
        else {
          const fresh = (ev.body.events as WorkforceEvent[]).filter(e => this.remember(e.event_id));
          this.dups += (ev.body.events as unknown[]).length - fresh.length;
          for (const e of fresh) { this.applied++; this.recent.push(e); }
          if (this.recent.length > 200) this.recent.splice(0, this.recent.length - 200);
          if (ev.body.changed || fresh.length) needSnapshot = true;
        }
      }
      if (needSnapshot) {
        const s = await this.get(`/workforce/snapshot?${q}`);
        if (this.authBad(s.status)) return this.fail(s.status);
        if (s.status !== 200 || s.body?.schema !== 'javis.workforce/1') throw new Error('snapshot HTTP ' + s.status);
        const prev = this.snap;
        this.snap = s.body as WorkforceSnapshot;
        if (!prev || prev.seq !== this.snap.seq || prev.epoch !== this.snap.epoch) this.emit('changed');
      }
      this.lastOk = this.now();
      this.failures = 0;
      const was = this.conn;
      this.conn = 'CONNECTED';
      this.reason = '';
      if (was !== 'CONNECTED') this.emit('changed');
      this.schedule(this.interval);
    } catch (e: any) {
      this.failures++;
      // Keep the last snapshot but flag it; after repeated failures the consumer must treat it as unknown.
      const was = this.effectiveConnection();
      this.conn = this.failures >= 3 ? 'DISCONNECTED' : (this.snap ? 'STALE' : 'CONNECTING');
      this.reason = `Javis unreachable (${e?.name === 'AbortError' ? 'timeout' : String(e?.message ?? e).slice(0, 80)}).`;
      if (was !== this.effectiveConnection()) this.emit('changed');
      this.schedule(Math.min(30000, this.interval * 2 ** Math.min(this.failures, 4)));
    }
  }

  private authBad(status: number) { return status === 401 || status === 403; }

  private fail(status: number) {
    this.failures++;
    this.conn = 'AUTH_FAILED';
    this.reason = status === 401 ? 'Javis rejected the viewer credential (401).' : 'Javis refused this brain for the viewer credential (403).';
    this.emit('changed');
    this.schedule(60000);
  }

  private remember(id: string): boolean {
    if (this.seen.has(id)) return false;
    this.seen.add(id);
    this.order.push(id);
    if (this.order.length > MAX_SEEN) this.seen.delete(this.order.shift()!);
    return true;
  }
}
