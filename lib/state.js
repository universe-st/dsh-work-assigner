/**
 * 插件自有运行状态：经理、工程师、任务台账。
 *
 * 角色本身由会话日志中的命令事件推导；这里是派发队列、工位与回报所需的
 * 操作状态，通过 `storageDomain` 的单文档持久化，内存中保留一份镜像。
 */

import { z } from 'zod';

import { FINAL_TASK_STATUSES, TODO_STATUSES } from './wire.js';

const ModelSchema = z.object({
  provider: z.string(),
  model: z.string(),
}).nullable();

const ManagerSchema = z.object({
  sessionId: z.string(),
  baseTitle: z.string().optional(),
  titlePlaceholder: z.boolean().optional(),
  createdAt: z.number(),
});

const WorktreeSchema = z.object({
  path: z.string(),
  branch: z.string(),
  baseCommit: z.string().optional(),
  repositoryRoot: z.string().optional(),
}).nullable();

const EngineerSchema = z.object({
  sessionId: z.string(),
  managerId: z.string(),
  projectPath: z.string(),
  projectKey: z.string(),
  workspaceId: z.string().optional(),
  backend: z.enum(['session', 'codex']).optional(),
  codexSessionId: z.string().optional(),
  codexModel: z.string().optional(),
  model: ModelSchema,
  permissionPreset: z.string().optional(),
  worktree: WorktreeSchema,
  status: z.enum(['idle', 'running']),
  activeTaskId: z.string().optional(),
  queue: z.array(z.string()),
  createdAt: z.number(),
});

const ReportSchema = z.object({
  outcome: z.enum(['success', 'failed', 'blocked']),
  summary: z.string(),
  changes: z.array(z.string()).optional(),
  tests: z.string().optional(),
  blockers: z.string().optional(),
  branch: z.string().optional(),
  commit: z.string().optional(),
  unreported: z.boolean().optional(),
  reason: z.string().optional(),
});

const TASK_STATUSES = [
  'queued',
  'running',
  'done',
  'failed',
  'blocked',
  'cancelled',
  'interrupted',
];

export const TaskSchema = z.object({
  taskId: z.string(),
  managerId: z.string(),
  engineerId: z.string().nullable(),
  title: z.string(),
  brief: z.string(),
  projectPath: z.string(),
  projectKey: z.string(),
  backend: z.enum(['session', 'codex']).optional(),
  codexSessionId: z.string().optional(),
  codexModel: z.string().optional(),
  model: ModelSchema,
  priority: z.enum(['normal', 'urgent']),
  resources: z.array(z.string()),
  useWorktree: z.boolean(),
  workspaceMode: z.enum(['worktree', 'main']).optional(),
  worktree: WorktreeSchema.optional(),
  engineerReused: z.boolean().optional(),
  engineerCreated: z.boolean().optional(),
  worktreeReason: z.string().optional(),
  worktreeFailure: z.string().optional(),
  integration: z.object({
    sourceTaskId: z.string(),
    branch: z.string(),
    target: z.string(),
  }).optional(),
  baseBranch: z.string().nullable().optional(),
  baseCommit: z.string().nullable().optional(),
  forceNew: z.boolean().optional(),
  status: z.enum(TASK_STATUSES),
  createdAt: z.number(),
  startedAt: z.number().optional(),
  endedAt: z.number().optional(),
  turn: z.number().optional(),
  report: ReportSchema.optional(),
  notifiedAt: z.number().optional(),
  notifyPending: z.boolean().optional(),
});

/** 经理待办条目；`id` 稳定，状态包含独立的 paused。 */
export const TodoSchema = z.object({
  id: z.string(),
  content: z.string(),
  status: z.enum(TODO_STATUSES),
  note: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

/** Codex 会话转录条目：只保留可读的消息、命令摘要与错误。 */
export const CodexEntrySchema = z.object({
  id: z.string(),
  kind: z.enum(['user', 'assistant', 'command', 'error', 'note']),
  label: z.string().optional(),
  text: z.string(),
  command: z.string().optional(),
  output: z.string().optional(),
  exitCode: z.number().nullable().optional(),
  at: z.number(),
});

export const CodexTranscriptSchema = z.object({
  engineerId: z.string(),
  sessionId: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  updatedAt: z.number(),
  truncated: z.boolean().optional(),
  entries: z.array(CodexEntrySchema),
});

export const StateSchema = z.object({
  version: z.literal(1),
  nextSeq: z.number().int().nonnegative(),
  managers: z.record(z.string(), ManagerSchema),
  engineers: z.record(z.string(), EngineerSchema),
  tasks: z.record(z.string(), TaskSchema),
  // 旧状态没有这两个字段：默认值保证升级无损；单条待办损坏不应拖垮任务台账。
  todos: z.record(z.string(), z.array(TodoSchema)).default({}).catch({}),
  nextTodoSeq: z.number().int().nonnegative().default(1).catch(1),
});

export function createEmptyState() {
  return {
    version: 1,
    nextSeq: 1,
    managers: {},
    engineers: {},
    tasks: {},
    todos: {},
    nextTodoSeq: 1,
  };
}

/**
 * 读取并校验持久化状态；损坏时回退为空状态而不是让插件失效。
 *
 * @param {unknown} raw 存储里的原始值。
 * @returns {{state: object, recovered: boolean}} 状态与是否发生回退。
 */
export function hydrateState(raw) {
  const parsed = StateSchema.safeParse(raw);
  if (parsed.success) return { state: parsed.data, recovered: false };
  return { state: createEmptyState(), recovered: true };
}

export function nextTaskId(state) {
  const seq = state.nextSeq;
  state.nextSeq = seq + 1;
  return `t${seq}`;
}

export function isFinalTask(task) {
  return FINAL_TASK_STATUSES.includes(task.status);
}

/**
 * 任务台账剪枝：只保留最近 `limit` 条，优先删除已结束的旧任务。
 * 就地修改并返回被删除的 id。
 */
export function pruneTasks(state, limit = 200) {
  const ids = Object.keys(state.tasks);
  let excess = ids.length - limit;
  if (excess <= 0) return [];
  const finals = Object.values(state.tasks)
    .filter((task) => isFinalTask(task))
    .sort((left, right) => (left.endedAt ?? left.createdAt) - (right.endedAt ?? right.createdAt));
  const removed = [];
  for (const task of finals) {
    if (excess <= 0) break;
    delete state.tasks[task.taskId];
    removed.push(task.taskId);
    excess -= 1;
  }
  for (const engineer of Object.values(state.engineers)) {
    if (engineer.activeTaskId !== undefined && !(engineer.activeTaskId in state.tasks)) {
      delete engineer.activeTaskId;
    }
    engineer.queue = engineer.queue.filter((taskId) => taskId in state.tasks);
  }
  return removed;
}

/**
 * 内存状态 + 串行写回。`writer` 为空时是纯内存模式（不持久化）。
 */
export function createStateStore(initialState, writer = null) {
  let state = initialState;
  let currentWriter = writer;
  let chain = Promise.resolve();
  let lastError;
  const log = (error) => {
    lastError = error;
  };
  return {
    get: () => state,
    replace(next) {
      state = next;
    },
    setWriter(next) {
      currentWriter = next;
    },
    snapshot() {
      return JSON.parse(JSON.stringify(state));
    },
    get lastError() {
      return lastError;
    },
    /** 排队写回；连续变更合并成串行写。 */
    save() {
      if (typeof currentWriter !== 'function') return Promise.resolve();
      const snapshot = JSON.parse(JSON.stringify(state));
      chain = chain.then(() => currentWriter(snapshot)).catch(log);
      return chain;
    },
  };
}
