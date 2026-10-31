// Read-only Javis visualization adapter cho AI Office 3D.
// Tuân thủ chặt chẽ ranh giới bảo mật:
// 1. Không chạy model, không tạo execution adapter, không tự uỷ quyền hay trích xuất token.
// 2. Live connection giữ trạng thái DISCONNECTED khi chưa có đường đọc xác thực chính thức từ Javis.
// 3. Hỗ trợ kịch bản sự kiện mẫu tất định (deterministic mock events) để kiểm thử trực quan persistent agents + temporary subagents.
import { EventEmitter } from 'node:events';
import type { JavisLiveFeed, WorkforceAgent, WorkforceEvent } from './javisLive.ts';
import type {
  Agent,
  AgentCard,
  AgentStatus,
  Department,
  EventKind,
  JavisViewerEvent,
  JavisViewerStatus,
  OfficeEvent,
  TaskRecord,
} from './types.ts';

export const DEPT_DISPLAY_EN: Record<string, { name: string; label: string }> = {
  'thiet-ke': { name: 'Visual Design', label: 'Visual Design' },
  'chien-luoc': { name: 'Strategy & Content', label: 'Strategy' },
  'ky-thuat': { name: 'Engineering & Web', label: 'Engineering' },
  'san-xuat-noi-dung': { name: 'Content Production', label: 'Content' },
  'dieu-phoi': { name: 'Coordination', label: 'Coordination' },
  'khach-hang': { name: 'Client Services', label: 'Client Services' },
  'san-xuat-phim': { name: 'Film Production', label: 'Film' },
  'ca-phe': { name: 'Cafe', label: 'Cafe' },
  'giai-tri': { name: 'Recreation', label: 'Recreation' },
};

export function localizeDepartmentsEnglish(depts: Department[]): Department[] {
  return depts.map(d => {
    const en = DEPT_DISPLAY_EN[d.id];
    if (!en) return d;
    return {
      ...d,
      name: en.name,
      style: d.style ? { ...d.style, label: en.label } : { label: en.label },
    };
  });
}

const PERSISTENT_ROSTER: Array<{
  id: string;
  name: string;
  role: string;
  departmentId: string;
}> = [
  { id: 'javis-core', name: 'Javis Core', role: 'Orchestrator & Continuity', departmentId: 'dieu-phoi' },
  { id: 'leon', name: 'Leon', role: 'Lead Strategist & Architect', departmentId: 'chien-luoc' },
  { id: 'leader-marketing', name: 'Leader Marketing', role: 'Campaign & Growth Lead', departmentId: 'san-xuat-noi-dung' },
  { id: 'dao-dien-hinh-anh', name: 'Visual Director', role: 'Creative & Visual Direction', departmentId: 'thiet-ke' },
  { id: 'tro-ly-nghien-cuu', name: 'Research Assistant', role: 'Evidence & Technical Discovery', departmentId: 'ky-thuat' },
  { id: 'ly-ly-zalo', name: 'Ly Ly Zalo', role: 'Client Consultation Specialist', departmentId: 'khach-hang' },
];

export const DETERMINISTIC_MOCK_EVENTS: JavisViewerEvent[] = [
  {
    eventId: 'evt-mock-001',
    ts: 1761241200000,
    type: 'roster.sync',
    text: 'Synced 6 persistent Kyan roster profiles (idle baseline; roster presence does not imply active work).',
  },
  {
    eventId: 'evt-mock-002',
    ts: 1761241205000,
    type: 'task.started',
    actorId: 'javis-core',
    actorKind: 'persistent',
    departmentId: 'dieu-phoi',
    taskTitle: 'Coordinate AI Office 3D read-only visualization milestone',
    text: 'Javis Core started task: Coordinate AI Office 3D read-only visualization milestone',
  },
  {
    eventId: 'evt-mock-003',
    ts: 1761241210000,
    type: 'subagent.spawned',
    actorId: 'subagent-scene-verifier',
    actorKind: 'subagent',
    name: 'Subagent · Scene Verifier',
    title: 'Temporary Verification Subagent',
    departmentId: 'ky-thuat',
    parentId: 'javis-core',
    taskTitle: 'Verify Three.js label toggle, day/night cycle, and Mixamo hashes',
    text: 'Spawned temporary subagent Scene Verifier under Javis Core',
  },
  {
    eventId: 'evt-mock-004',
    ts: 1761241215000,
    type: 'subagent.working',
    actorId: 'subagent-scene-verifier',
    actorKind: 'subagent',
    parentId: 'javis-core',
    taskTitle: 'Auditing 18 Mixamo GLB hashes and WebGL canvas state',
    text: 'Subagent Scene Verifier is auditing Mixamo GLB hashes and WebGL canvas state',
  },
  {
    eventId: 'evt-mock-005',
    ts: 1761241220000,
    type: 'task.started',
    actorId: 'leon',
    actorKind: 'persistent',
    departmentId: 'chien-luoc',
    parentId: 'javis-core',
    taskTitle: 'Review canonical HANDOFF.md and architecture constraints',
    text: 'Leon started task: Review canonical HANDOFF.md and architecture constraints',
  },
  {
    eventId: 'evt-mock-006',
    ts: 1761241225000,
    type: 'agent.waiting',
    actorId: 'dao-dien-hinh-anh',
    actorKind: 'persistent',
    departmentId: 'thiet-ke',
    taskTitle: 'Awaiting human review gate on visual snapshot',
    text: 'Visual Director is at an approval gate: Awaiting human review on visual snapshot',
  },
  {
    eventId: 'evt-mock-007',
    ts: 1761241230000,
    type: 'subagent.completed',
    actorId: 'subagent-scene-verifier',
    actorKind: 'subagent',
    parentId: 'javis-core',
    text: 'Temporary subagent Scene Verifier completed verification and despawned cleanly',
  },
  {
    eventId: 'evt-mock-008',
    ts: 1761241235000,
    type: 'task.completed',
    actorId: 'leon',
    actorKind: 'persistent',
    parentId: 'javis-core',
    text: 'Leon completed architecture review and returned to idle',
  },
];

export interface ViewerLayout { byId: Record<string, string>; default: string }
export interface ViewerOptions { live?: JavisLiveFeed | null; layout?: ViewerLayout; openBase?: string; openBrain?: string; brainLabel?: string }

const ACTIVITY_STATUS: Record<WorkforceAgent['activity'], AgentStatus> = {
  working: 'working', queued: 'queued', needs_input: 'input', needs_you: 'input', approval_pending: 'waiting', idle: 'idle', unknown: 'unknown',
};
const sec = (v: number | null | undefined) => (v == null ? null : Math.round(v * 1000));

export class JavisReadOnlyViewer extends EventEmitter {
  private live: JavisLiveFeed | null = null;
  private layout: ViewerLayout = { byId: {}, default: 'dieu-phoi' };
  private openBase = '';
  private brainLabel = '';
  /** Brain FOLDER NAME the deep links name (never a path, never a token): Javis checks it against the signed-in account's own brains. */
  private openBrain = '';
  private lastConn = '';
  private watch: NodeJS.Timeout | undefined;
  private departments: Department[];
  private agents = new Map<string, Agent>();
  private status = new Map<string, AgentStatus>();
  private currentTasks = new Map<string, TaskRecord>();
  private taskHistory = new Map<string, TaskRecord>();
  private events: OfficeEvent[] = [];
  private seenEventIds = new Set<string>();
  private eventSeq = 1;
  private stepCursor = 0;
  private mode: 'DISCONNECTED' | 'MOCK_DETERMINISTIC' | 'LIVE' = 'DISCONNECTED';
  private scenarioId: string | null = null;
  private lastEventId: string | null = null;
  private lastUpdatedAt: number | null = null;

  constructor(baseDepartments: Department[], initialMock = false, opts: ViewerOptions = {}) {
    super();
    this.departments = baseDepartments;
    this.seedPersistentRoster();
    if (opts.layout) this.layout = opts.layout;
    this.openBase = (opts.openBase ?? '').replace(/\/+$/, '');
    this.openBrain = (opts.openBrain ?? '').trim();
    this.brainLabel = (opts.brainLabel ?? '').trim();
    if (opts.live) {
      // Live replaces the DEMO roster entirely: the real roster may have any size (not the six demo actors).
      this.live = opts.live;
      this.mode = 'LIVE';
      this.live.on('changed', () => { this.lastConn = this.live!.status().connection; this.emit('changed'); });
      // Staleness is a function of time, not of events: re-evaluate on a slow timer.
      this.watch = setInterval(() => {
        const c = this.live!.status().connection;
        if (c !== this.lastConn) { this.lastConn = c; this.emit('changed'); }
      }, 2000);
      this.watch.unref?.();
    } else if (initialMock) {
      this.loadScenario('default-all');
    }
  }

  isLive() { return this.live != null; }
  shutdown() { clearInterval(this.watch); this.live?.stop(); }

  private seedPersistentRoster() {
    this.agents.clear();
    this.status.clear();
    this.currentTasks.clear();
    this.taskHistory.clear();
    const now = 1761241200000;
    for (const item of PERSISTENT_ROSTER) {
      const a: Agent = {
        id: item.id,
        name: item.name,
        role: item.role,
        departmentId: item.departmentId,
        provider: 'observer',
        model: null,
        cwd: null,
        systemPrompt: null,
        permissionMode: 'plan',
        sessionId: null,
        createdAt: now,
        actorKind: 'persistent',
        parentId: null,
        sourceEventId: null,
        dataSource: 'DEMO',
      };
      this.agents.set(a.id, a);
      this.status.set(a.id, this.mode === 'DISCONNECTED' ? 'unknown' : 'idle');
    }
  }

  getViewerStatus(): JavisViewerStatus {
    if (this.live) {
      const st = this.live.status();
      const snap = this.live.getSnapshot();
      const src = snap?.sources;
      const ok = (k: string) => !!src?.[k]?.available && (st.connection === 'CONNECTED' || st.connection === 'STALE');
      return {
        enabled: true, readOnly: true, brain: snap?.brain.label ?? this.brainLabel, liveConnection: st.connection,
        liveReason: st.reason, mode: 'LIVE', scenarioId: null, appliedEvents: st.eventsApplied,
        lastEventId: this.live.getRecentEvents().at(-1)?.event_id ?? null, lastUpdatedAt: st.lastSuccessAt, live: st,
        coverage: {
          agents: st.connection === 'CONNECTED' || st.connection === 'STALE' ? 'live' : 'unknown',
          // Native Jobs is live data, but does not cover every chat/background execution.
          tasks: ok('tasks') ? 'partial' : 'unknown',
          subagents: 'unavailable',
          approvals: ok('approvals') ? 'live' : 'unavailable',
          usage: ok('usage') ? 'live' : 'unavailable',
        },
      };
    }
    const isMock = this.mode === 'MOCK_DETERMINISTIC';
    return {
      enabled: true,
      readOnly: true,
      brain: this.brainLabel || 'Kyan',
      liveConnection: 'DISCONNECTED',
      liveReason: 'Live bridge is not configured. Set JAVIS_VIEW_URL, JAVIS_VIEW_TOKEN (or JAVIS_VIEW_TOKEN_FILE) and JAVIS_VIEW_BRAIN.',
      mode: this.mode,
      scenarioId: this.scenarioId,
      appliedEvents: this.seenEventIds.size,
      lastEventId: this.lastEventId,
      lastUpdatedAt: this.lastUpdatedAt,
      coverage: {
        agents: isMock ? 'mock' : 'unknown',
        tasks: isMock ? 'mock' : 'unknown',
        subagents: isMock ? 'mock' : 'unknown',
        approvals: isMock ? 'mock' : 'unknown',
        usage: 'unknown',
      },
    };
  }

  resetToDisconnected() {
    this.seenEventIds.clear();
    this.events = [];
    this.stepCursor = 0;
    this.mode = 'DISCONNECTED';
    this.scenarioId = null;
    this.lastEventId = null;
    this.lastUpdatedAt = Date.now();
    this.seedPersistentRoster();
    // Disconnected samples are not observations. Do not manufacture event history.
    this.emit('changed');
    return this.getViewerStatus();
  }

  stepDeterministicMock(): { applied: JavisViewerEvent | null; status: JavisViewerStatus } {
    if (this.mode !== 'MOCK_DETERMINISTIC') {
      this.mode = 'MOCK_DETERMINISTIC';
      this.seedPersistentRoster();
      this.scenarioId = 'deterministic-step';
    }
    if (this.stepCursor >= DETERMINISTIC_MOCK_EVENTS.length) {
      return { applied: null, status: this.getViewerStatus() };
    }
    const ev = DETERMINISTIC_MOCK_EVENTS[this.stepCursor++];
    this.applyEvent(ev);
    return { applied: ev, status: this.getViewerStatus() };
  }

  loadScenario(scenario: 'disconnected' | 'active-subagent' | 'default-all'): JavisViewerStatus {
    if (scenario === 'disconnected') {
      return this.resetToDisconnected();
    }
    this.seenEventIds.clear();
    this.events = [];
    this.stepCursor = 0;
    this.mode = 'MOCK_DETERMINISTIC';
    this.seedPersistentRoster();
    this.scenarioId = scenario;

    // Giai đoạn 'active-subagent' dừng ở bước 6 để thấy rõ cả persistent working, waiting và temporary subagent trên sàn 3D
    const limit = scenario === 'active-subagent' ? 6 : DETERMINISTIC_MOCK_EVENTS.length;
    for (let i = 0; i < limit; i++) {
      const ev = DETERMINISTIC_MOCK_EVENTS[i];
      this.stepCursor = i + 1;
      this.applyEvent(ev);
    }
    return this.getViewerStatus();
  }

  applyEvent(ev: JavisViewerEvent): boolean {
    if (!ev || !ev.eventId || this.seenEventIds.has(ev.eventId)) {
      return false; // Deduplicate by stable eventId
    }
    this.seenEventIds.add(ev.eventId);
    this.lastEventId = ev.eventId;
    this.lastUpdatedAt = Date.now();

    const actorId = ev.actorId ?? 'javis-core';

    switch (ev.type) {
      case 'roster.sync': {
        for (const a of this.agents.values()) {
          if (a.actorKind === 'persistent') this.setAgentStatus(a.id, 'idle');
        }
        this.recordEvent('javis-core', 'system', ev.text ?? 'Roster synced (idle).', { eventId: ev.eventId });
        break;
      }
      case 'task.started': {
        const a = this.agents.get(actorId);
        if (a) {
          const task: TaskRecord = {
            id: `task-${ev.eventId}`,
            agentId: a.id,
            fromAgentId: ev.parentId ?? null,
            parentTaskId: null,
            depth: ev.parentId ? 1 : 0,
            prompt: ev.taskTitle ?? ev.text ?? 'Deterministic mock task',
            status: 'running',
            createdAt: ev.ts,
          };
          this.currentTasks.set(a.id, task);
          this.taskHistory.set(task.id, task);
          this.setAgentStatus(a.id, 'working');
          this.recordEvent(
            a.id,
            'task',
            ev.text ?? `Started: ${task.prompt}`,
            { taskId: task.id, fromAgentId: ev.parentId ?? undefined, eventId: ev.eventId },
          );
        }
        break;
      }
      case 'task.completed': {
        const a = this.agents.get(actorId);
        if (a) {
          const completed = this.currentTasks.get(a.id);
          if (completed) { completed.status = 'done'; completed.finishedAt = ev.ts; this.taskHistory.set(completed.id, completed); }
          this.currentTasks.delete(a.id);
          this.setAgentStatus(a.id, 'idle');
          this.recordEvent(a.id, 'result', ev.text ?? 'Task completed.', { eventId: ev.eventId });
        }
        break;
      }
      case 'subagent.spawned': {
        const sub: Agent = {
          id: actorId,
          name: ev.name ?? `Subagent ${actorId}`,
          role: ev.title ?? 'Temporary Subagent',
          departmentId: ev.departmentId ?? 'ky-thuat',
          provider: 'observer',
          model: null,
          cwd: null,
          systemPrompt: null,
          permissionMode: 'plan',
          sessionId: null,
          createdAt: ev.ts,
          actorKind: 'subagent',
          parentId: ev.parentId ?? 'javis-core',
          sourceEventId: ev.eventId,
          dataSource: 'DEMO',
        };
        this.agents.set(sub.id, sub);
        const task: TaskRecord = {
          id: `task-${ev.eventId}`,
          agentId: sub.id,
          fromAgentId: sub.parentId ?? null,
          parentTaskId: null,
          depth: 1,
          prompt: ev.taskTitle ?? ev.text ?? 'Subagent task',
          status: 'running',
          createdAt: ev.ts,
        };
        this.currentTasks.set(sub.id, task);
        this.taskHistory.set(task.id, task);
        this.status.set(sub.id, 'working');
        this.emit('changed');
        this.recordEvent(
          sub.id,
          'task',
          ev.text ?? `Subagent spawned: ${sub.name}`,
          { taskId: task.id, fromAgentId: sub.parentId ?? undefined, eventId: ev.eventId, actorKind: 'subagent' },
        );
        break;
      }
      case 'subagent.working': {
        const sub = this.agents.get(actorId);
        if (sub) {
          if (ev.taskTitle) {
            const cur = this.currentTasks.get(sub.id);
            if (cur) cur.prompt = ev.taskTitle;
          }
          this.setAgentStatus(sub.id, 'working');
          this.recordEvent(sub.id, 'tool', ev.text ?? 'Subagent working', { eventId: ev.eventId });
        }
        break;
      }
      case 'subagent.completed': {
        const sub = this.agents.get(actorId);
        if (sub && sub.actorKind === 'subagent') {
          const parentId = sub.parentId ?? 'javis-core';
          const completed = this.currentTasks.get(sub.id);
          if (completed) { completed.status = 'done'; completed.finishedAt = ev.ts; this.taskHistory.set(completed.id, completed); }
          this.currentTasks.delete(sub.id);
          this.status.delete(sub.id);
          this.agents.delete(sub.id);
          this.recordEvent(parentId, 'result', ev.text ?? `Subagent ${sub.name} completed and despawned.`, {
            eventId: ev.eventId,
            subagentId: sub.id,
          });
          this.emit('changed');
        }
        break;
      }
      case 'agent.waiting': {
        const a = this.agents.get(actorId);
        if (a) {
          if (ev.taskTitle) {
            this.currentTasks.set(a.id, {
              id: `task-${ev.eventId}`,
              agentId: a.id,
              fromAgentId: ev.parentId ?? null,
              parentTaskId: null,
              depth: 0,
              prompt: ev.taskTitle,
              status: 'running',
              createdAt: ev.ts,
            });
          }
          this.setAgentStatus(a.id, 'waiting');
          this.recordEvent(a.id, 'permission', ev.text ?? 'Waiting for review gate', { eventId: ev.eventId });
        }
        break;
      }
      case 'agent.idle': {
        const a = this.agents.get(actorId);
        if (a) {
          const completed = this.currentTasks.get(a.id);
          if (completed) { completed.status = 'done'; completed.finishedAt = ev.ts; this.taskHistory.set(completed.id, completed); }
          this.currentTasks.delete(a.id);
          this.setAgentStatus(a.id, 'idle');
          this.recordEvent(a.id, 'status', ev.text ?? 'Agent is idle', { eventId: ev.eventId });
        }
        break;
      }
      default:
        break;
    }
    return true;
  }

  private setAgentStatus(agentId: string, s: AgentStatus) {
    const prev = this.status.get(agentId);
    this.status.set(agentId, s);
    if (prev !== s) {
      this.emit('status', { agentId, status: s });
    }
    this.emit('changed');
  }

  private recordEvent(agentId: string, kind: EventKind, text: string, data?: unknown) {
    const ev: OfficeEvent = {
      id: this.eventSeq++,
      agentId,
      ts: Date.now(),
      kind,
      text,
      data,
    };
    this.events.push(ev);
    if (this.events.length > 200) this.events.shift();
    this.emit('event', ev);
  }

  listEvents(agentId: string, limit = 200): OfficeEvent[] {
    if (this.live) return this.liveFeed().filter(e => e.agentId === agentId).slice(-limit);
    return this.events.filter(e => e.agentId === agentId).slice(-limit);
  }

  listTasks(agentId?: string): TaskRecord[] {
    if (this.live) return this.liveTasks(agentId);
    const all = [...new Map([...this.taskHistory.values(), ...this.currentTasks.values()].map(t => [t.id, t])).values()];
    return agentId ? all.filter(t => t.agentId === agentId) : all;
  }

  // ------------------------------------------------------------------ live projection
  private usableLive(): boolean {
    const c = this.live!.status().connection;
    return !!this.live!.getSnapshot() && (c === 'CONNECTED' || c === 'STALE');
  }

  private liveAgents(): WorkforceAgent[] {
    const snap = this.live!.getSnapshot();
    return snap ? [...snap.agents, ...(snap.subagents ?? [])] : [];
  }

  private departmentOf(a: WorkforceAgent): string {
    const d = this.layout.byId[a.id] ?? this.layout.byId['slug:' + a.slug] ?? this.layout.byId[a.slug];
    return d && this.departments.some(x => x.id === d) ? d : this.layout.default;
  }

  private openUrl(open: unknown): string | null {
    const o = open as { team_id?: string; task_id?: string } | null;
    if (!this.openBase || !o?.team_id) return null;
    const task = o.task_id ? `&task=${encodeURIComponent(o.task_id)}` : '';
    return `${this.openBase}/#team=${encodeURIComponent(o.team_id)}${task}`;
  }

  /** `#brain=<folder>&` only when Brain-aware links are enabled (JAVIS_VIEW_DEEPLINK_BRAIN=1: Javis builds that parse `#brain=..&cs=..`), else `#` (legacy shape the current 7778 dashboard parses: opens in whatever brain the dashboard has selected). */
  private brainPart(): string {
    return this.openBrain ? `#brain=${encodeURIComponent(this.openBrain)}&` : '#';
  }

  /** Native Javis deep link that opens the agent (cong su) workspace in the NAMED brain. The link grants nothing: Javis authenticates the
   *  person and resolves the brain, agent and conversation itself, and refuses a mismatch instead of opening something else. */
  private chatUrl(slug: string): string | null {
    if (!this.openBase || !slug) return null;
    if (slug === 'javis-core') return `${this.openBase}/`;   // Javis Core has no agent file: open the dashboard root, never cs=agent:javis-core
    return `${this.openBase}/${this.brainPart()}cs=agent:${encodeURIComponent(slug)}`;
  }

  /** Honest history descriptor for one agent. The Brain-bound view credential can read the workforce projection only,
   *  so conversations and session transcripts are reported as unavailable instead of being fetched another way. */
  /** Slug of a CURRENT persistent live agent, or null. The history proxy accepts nothing else, so the browser cannot name arbitrary agents. */
  slugOf(agentId: string): string | null {
    if (!this.live || !this.usableLive()) return null;
    const a = this.liveAgents().find(x => x.id === agentId && x.kind !== 'subagent');
    return a?.slug || null;
  }

  /** Native Javis deep link that opens one agent conversation: `#brain=<folder>&cs=agent:<slug>:<session id>` (dashboard/console.js moLienKetCoBrain). */
  sessionUrl(slug: string, sessionId: string): string | null {
    if (!this.openBase || !slug || !sessionId) return null;
    return `${this.openBase}/${this.brainPart()}cs=agent:${encodeURIComponent(slug)}:${encodeURIComponent(sessionId)}`;
  }

  agentHistory(agentId: string, historyConfigured = false) {
    const a = this.live ? this.liveAgents().find(x => x.id === agentId) : undefined;
    const usable = !!this.live && this.usableLive();
    const card = a ? this.liveCard(a, usable) : null;
    return {
      agentId,
      source: this.live ? (usable ? 'LIVE' : 'UNKNOWN') : 'DEMO',
      refs: card?.refs ?? null,
      links: card?.links ?? { chat: null, task: null },
      // Conversations are only reachable through the dedicated `history` credential (fetched on demand, never cached here).
      conversation: { available: this.live ? historyConfigured : false, reason: !this.live ? 'not_connected' : historyConfigured ? 'on_demand' : 'history_not_configured', messages: [] as unknown[] },
      sessions: { available: this.live ? historyConfigured : false, reason: !this.live ? 'not_connected' : historyConfigured ? 'on_demand' : 'history_not_configured', items: [] as unknown[] },
      tasks: { available: usable, scope: 'current_only', items: usable ? this.liveTasks(agentId) : [] },
    };
  }

  /** Forced authenticated snapshot refresh (read-only GET to Javis). Used by Return to Live. */
  async refreshLive() {
    if (!this.live) return { configured: false, fresh: false, connection: 'DISCONNECTED', reason: 'Live bridge is not configured.', seq: null, fetchedAt: null };
    return { configured: true, ...(await this.live.refreshNow()) };
  }

  private liveCard(a: WorkforceAgent, usable: boolean): AgentCard {
    const st = this.live!.status();
    const snap = this.live!.getSnapshot();
    const names = new Map(this.liveAgents().map(x => [x.id, x.name]));
    const t = usable ? a.task : null;
    const ap = usable ? a.approval : null;
    const u = a.usage;
    return {
      activity: usable ? a.activity : 'unknown',
      activityReason: usable ? a.activity_reason : 'javis_unreachable',
      workCounts: usable ? (a.work_counts ?? null) : null,
      workStatusAt: usable ? sec(a.work_status_at) : null,
      task: t && {
        id: t.id, title: t.title, step: t.step, stepKind: t.step_kind, status: t.status, team: t.team, source: t.source,
        queuePos: t.queue_pos, reason: t.reason, startedAt: sec(t.started_at), stateChangedAt: sec(t.state_changed_at),
      },
      moreQueued: usable ? a.queued : 0,
      approval: ap && { id: ap.id, title: ap.title, kind: ap.kind, requestedAt: sec(ap.requested_at), deadlineAt: sec(ap.deadline_at), openUrl: this.openUrl(ap.open) },
      parent: a.parent_id ? { id: a.parent_id, name: names.get(a.parent_id) ?? a.parent_id } : null,
      department: { id: this.departmentOf(a), source: 'viewer-layout' },
      refs: {
        slug: a.slug || null, agentKey: a.agent_key ?? null, taskId: t?.id ?? null,
        teamId: ((t?.open as { team_id?: string } | null)?.team_id) ?? null,
      },
      links: { chat: a.kind === 'subagent' ? null : this.chatUrl(a.slug), task: t ? this.openUrl(t.open) : null },
      usage: usable && u?.available
        ? { available: true, calls: u.calls, tokensIn: u.tokens_in, tokensOut: u.tokens_out, costUsd: u.cost_usd, partial: u.partial }
        : { available: false, reason: usable ? (u?.reason ?? 'unavailable') : 'javis_unreachable' },
      source: {
        kind: usable ? 'LIVE' : 'UNKNOWN', name: 'Javis workforce projection', receivedAt: st.lastSuccessAt,
        sourceAt: sec(snap?.generated_at), stale: st.connection === 'STALE', connection: st.connection,
      },
    };
  }

  private liveSnapshot() {
    const usable = this.usableLive();
    const agents = this.liveAgents().map(a => {
      const card = this.liveCard(a, usable);
      const ag: Agent = {
        id: a.id, name: a.name, role: a.role, departmentId: card.department.id, provider: 'observer', model: null, cwd: null,
        systemPrompt: null, permissionMode: 'plan', sessionId: null, createdAt: 0,
        actorKind: a.kind, parentId: a.parent_id ?? null, sourceEventId: null, dataSource: usable ? 'LIVE' : undefined,
      };
      return {
        ...ag, status: (usable ? ACTIVITY_STATUS[a.activity] : 'unknown') as AgentStatus, currentTask: null,
        queued: usable ? a.queued : 0, card,
      };
    });
    const snap = this.live!.getSnapshot();
    const approvals = usable ? agents.filter(a => a.card.approval && a.card.activity === 'approval_pending').map(a => ({
      id: a.card.approval!.id, agentId: a.id, title: a.card.approval!.title, kind: a.card.approval!.kind,
      requestedAt: a.card.approval!.requestedAt, openUrl: a.card.approval!.openUrl,
    })) : [];
    const apOk = usable && !!snap?.sources.approvals?.available;
    return {
      departments: this.departments, agents, permissions: [], approvals,
      approvalSummary: { available: apOk, pending: apOk ? (snap?.approvals.pending ?? 0) : null, questions: apOk ? (snap?.approvals.questions ?? 0) : null },
      feed: this.liveFeed().slice(-30), limits: { maxConcurrent: 6, maxDepth: 3 }, javisViewer: this.getViewerStatus(),
    };
  }

  private liveTasks(agentId?: string): TaskRecord[] {
    if (!this.usableLive()) return [];
    return this.liveAgents().filter(a => a.task && (!agentId || a.id === agentId)).map(a => ({
      id: a.task!.id, agentId: a.id, fromAgentId: a.parent_id ?? null, parentTaskId: null, depth: a.parent_id ? 1 : 0,
      prompt: a.task!.title, status: a.activity === 'working' ? 'running' : 'queued',
      createdAt: sec(a.task!.state_changed_at) ?? 0,
    } as TaskRecord));
  }

  private liveFeed(): OfficeEvent[] {
    const byId = new Map(this.liveAgents().map(a => [a.id, a]));
    const out: OfficeEvent[] = [];
    for (const e of this.live!.getRecentEvents()) {
      const a = byId.get(e.agent_id);
      if (!a) continue;
      const m = describeLive(e, a);
      if (!m) continue;
      out.push({
        id: e.seq * 1000 + out.length, agentId: a.id, ts: Math.round((e.at ?? e.seen_at) * 1000), kind: m.kind, text: m.text,
        data: { msg: { key: m.key, values: m.values }, eventId: e.event_id, eventSeq: e.seq },
      });
    }
    return out;
  }

  snapshot() {
    if (this.live) return this.liveSnapshot();
    return this.demoSnapshot();
  }

  private demoCard(a: Agent): AgentCard {
    const status = this.status.get(a.id) ?? 'unknown';
    const t = this.currentTasks.get(a.id) ?? null;
    const activity: AgentCard['activity'] = status === 'working' ? 'working' : status === 'waiting' ? 'approval_pending'
      : status === 'idle' ? 'idle' : 'unknown';
    const parent = a.parentId ? this.agents.get(a.parentId) : null;
    return {
      activity, activityReason: this.mode === 'DISCONNECTED' ? 'javis_not_connected' : '',
      // Mock event times are synthetic: never shown as if they were observations.
      task: t && { id: t.id, title: t.prompt, step: null, stepKind: '', status: t.status, team: '', source: 'demo', queuePos: null, reason: '', startedAt: null, stateChangedAt: null },
      moreQueued: 0,
      approval: status === 'waiting' ? { id: 'demo-review-' + a.id, title: t?.prompt ?? '', kind: 'demo', requestedAt: null, deadlineAt: null, openUrl: null } : null,
      parent: a.parentId ? { id: a.parentId, name: parent?.name ?? a.parentId } : null,
      department: { id: a.departmentId, source: 'viewer-layout' },
      usage: { available: false, reason: 'demo_has_no_usage' },
      source: { kind: this.mode === 'MOCK_DETERMINISTIC' ? 'DEMO' : 'UNKNOWN', name: 'Deterministic sample', receivedAt: null, sourceAt: null, stale: false, connection: 'DISCONNECTED' },
    };
  }

  private demoSnapshot() {
    const waiting = [...this.agents.values()].filter(a => this.status.get(a.id) === 'waiting');
    return {
      departments: this.departments,
      agents: [...this.agents.values()].map(a => ({
        ...a,
        status: this.status.get(a.id) ?? 'unknown',
        currentTask: this.currentTasks.get(a.id) ?? null,
        queued: 0,
        card: this.demoCard(a),
      })),
      permissions: waiting.map(a => ({ id: 'demo-review-' + a.id, agentId: a.id, tool: 'DEMO human review', input: { task: this.currentTasks.get(a.id)?.prompt, dataSource: 'DEMO' }, createdAt: this.lastUpdatedAt })),
      approvals: waiting.map(a => ({ id: 'demo-review-' + a.id, agentId: a.id, title: this.currentTasks.get(a.id)?.prompt ?? '', kind: 'demo', requestedAt: null, openUrl: null })),
      approvalSummary: { available: this.mode === 'MOCK_DETERMINISTIC', pending: this.mode === 'MOCK_DETERMINISTIC' ? waiting.length : null, questions: null },
      feed: this.events.filter(e => ['task', 'result', 'error', 'permission', 'system'].includes(e.kind)).slice(-30),
      limits: { maxConcurrent: 6, maxDepth: 3 },
      javisViewer: this.getViewerStatus(),
    };
  }
}

/** Structured, language-neutral description of a projection event. The browser renders `key` + `values` in EN/VI. */
function describeLive(e: WorkforceEvent, a: WorkforceAgent): { kind: OfficeEvent['kind']; key: string; values: Record<string, string>; text: string } | null {
  const name = a.name;
  const title = a.task && e.task_id && a.task.id === e.task_id ? a.task.title : '';
  const mk = (kind: OfficeEvent['kind'], key: string, text: string, extra: Record<string, string> = {}) => ({ kind, key, values: { name, ...extra }, text });
  if (e.type === 'approval.requested') return mk('permission', 'feed.approvalRequested', `${name} needs approval`, { title: String(a.approval?.title ?? '') });
  if (e.type === 'approval.cleared') return mk('system', 'feed.approvalCleared', `Approval request for ${name} is no longer pending`);
  if (e.type === 'agent.activity') {
    switch (e.to) {
      case 'working': return title ? mk('task', 'feed.workingOn', `${name} is working on ${title}`, { title }) : mk('task', 'feed.working', `${name} is working`);
      case 'queued': return mk('task', 'feed.queued', `${name} has queued work`);
      case 'needs_input': return mk('permission', 'feed.needsInput', `${name} needs input`);
      case 'approval_pending': return null;   // covered by approval.requested, no duplicate line
      case 'idle': return mk('result', 'feed.idle', `${name} has no active work`);
      case 'unknown': return mk('system', 'feed.unknown', `${name}: activity unknown`);
    }
  }
  if (e.type === 'agent.appeared') return mk('system', 'feed.appeared', `${name} joined the roster`);
  if (e.type === 'agent.removed') return mk('system', 'feed.removed', `${name} left the roster`);
  return null;
}
