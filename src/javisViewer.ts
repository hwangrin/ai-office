// Read-only Javis visualization adapter cho AI Office 3D.
// Tuân thủ chặt chẽ ranh giới bảo mật:
// 1. Không chạy model, không tạo execution adapter, không tự uỷ quyền hay trích xuất token.
// 2. Live connection giữ trạng thái DISCONNECTED khi chưa có đường đọc xác thực chính thức từ Javis.
// 3. Hỗ trợ kịch bản sự kiện mẫu tất định (deterministic mock events) để kiểm thử trực quan persistent agents + temporary subagents.
import { EventEmitter } from 'node:events';
import type {
  Agent,
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

export class JavisReadOnlyViewer extends EventEmitter {
  private departments: Department[];
  private agents = new Map<string, Agent>();
  private status = new Map<string, AgentStatus>();
  private currentTasks = new Map<string, TaskRecord>();
  private events: OfficeEvent[] = [];
  private seenEventIds = new Set<string>();
  private eventSeq = 1;
  private stepCursor = 0;
  private mode: 'DISCONNECTED' | 'MOCK_DETERMINISTIC' = 'DISCONNECTED';
  private scenarioId: string | null = null;
  private lastEventId: string | null = null;
  private lastUpdatedAt: number | null = null;

  constructor(baseDepartments: Department[], initialMock = false) {
    super();
    this.departments = localizeDepartmentsEnglish(baseDepartments);
    this.seedPersistentRoster();
    if (initialMock) {
      this.loadScenario('default-all');
    }
  }

  private seedPersistentRoster() {
    this.agents.clear();
    this.status.clear();
    this.currentTasks.clear();
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
        sourceEventId: 'baseline-roster',
      };
      this.agents.set(a.id, a);
      this.status.set(a.id, 'idle');
    }
  }

  getViewerStatus(): JavisViewerStatus {
    const isMock = this.mode === 'MOCK_DETERMINISTIC';
    return {
      enabled: true,
      readOnly: true,
      brain: 'Kyan',
      liveConnection: 'DISCONNECTED',
      liveReason: 'Live Javis endpoint GET /agents?brain=Kyan&prompt=0&system=1 returned 401 Unauthorized. Held at authentication boundary.',
      mode: this.mode,
      scenarioId: this.scenarioId,
      appliedEvents: this.seenEventIds.size,
      lastEventId: this.lastEventId,
      lastUpdatedAt: this.lastUpdatedAt,
      coverage: {
        agents: isMock ? 'mock' : 'unknown',
        tasks: isMock ? 'mock' : 'unknown',
        subagents: isMock ? 'mock' : 'unknown',
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
    this.recordEvent('javis-core', 'system', 'Live Javis adapter is DISCONNECTED (401 auth boundary). Persistent roster shown idle; no fabricated live activity.');
    this.emit('changed');
    return this.getViewerStatus();
  }

  stepDeterministicMock(): { applied: JavisViewerEvent | null; status: JavisViewerStatus } {
    if (this.mode !== 'MOCK_DETERMINISTIC') {
      this.mode = 'MOCK_DETERMINISTIC';
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
    this.seedPersistentRoster();
    this.mode = 'MOCK_DETERMINISTIC';
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
    return this.events.filter(e => e.agentId === agentId).slice(-limit);
  }

  listTasks(agentId?: string): TaskRecord[] {
    const all = [...this.currentTasks.values()];
    return agentId ? all.filter(t => t.agentId === agentId) : all;
  }

  snapshot() {
    return {
      departments: this.departments,
      agents: [...this.agents.values()].map(a => ({
        ...a,
        status: this.status.get(a.id) ?? 'idle',
        currentTask: this.currentTasks.get(a.id) ?? null,
        queued: 0,
      })),
      permissions: [],
      feed: this.events.filter(e => ['task', 'result', 'error', 'permission', 'system'].includes(e.kind)).slice(-30),
      limits: { maxConcurrent: 6, maxDepth: 3 },
      javisViewer: this.getViewerStatus(),
    };
  }
}
