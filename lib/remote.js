/**
 * 派活 Host 的只读 Remote：让 Web 客户端轮询经理待办。
 *
 * 为什么只读：待办的唯一写入方是经理工具 `paihuo_todo`；用户面板只展示，
 * 不提供编辑入口，避免 UI 与工具各写一套状态机。
 *
 * 客户端 `lib/client.js` 里的 CONTRIBUTION 必须与本文件的 MANIFEST 保持
 * 相同的 id / service / namespace / method；两边各有一份，测试会校验 ID。
 */

import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';

import { listCodexModels } from './codex.js';
import { CodexEntrySchema, TodoSchema } from './state.js';
import { PACKAGE_NAME } from './wire.js';

export const REMOTE_SERVICE = 'paihuo';
export const REMOTE_METHOD = 'todos';
export const REMOTE_METHOD_ID = `${PACKAGE_NAME}#${REMOTE_SERVICE}/${REMOTE_METHOD}`;
export const REMOTE_CODEX_SESSIONS_METHOD = 'codexSessions';
export const REMOTE_CODEX_SESSIONS_METHOD_ID = `${PACKAGE_NAME}#${REMOTE_SERVICE}/${REMOTE_CODEX_SESSIONS_METHOD}`;
export const REMOTE_CODEX_TRANSCRIPT_METHOD = 'codexTranscript';
export const REMOTE_CODEX_TRANSCRIPT_METHOD_ID = `${PACKAGE_NAME}#${REMOTE_SERVICE}/${REMOTE_CODEX_TRANSCRIPT_METHOD}`;
export const REMOTE_CODEX_MODELS_METHOD = 'codexModels';
export const REMOTE_CODEX_MODELS_METHOD_ID = `${PACKAGE_NAME}#${REMOTE_SERVICE}/${REMOTE_CODEX_MODELS_METHOD}`;

const TodoCountsSchema = z.object({
  pending: z.number().int().nonnegative(),
  inProgress: z.number().int().nonnegative(),
  paused: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  open: z.number().int().nonnegative(),
});

const TodosPayloadSchema = z.object({
  managerId: z.string().min(1),
});

const TodosResultSchema = z.object({
  todos: z.array(TodoSchema),
  counts: TodoCountsSchema,
});

const CodexSessionSchema = z.object({
  engineerId: z.string().min(1),
  sessionId: z.string().nullable(),
  model: z.string().nullable(),
  status: z.enum(['idle', 'running']),
  activeTaskId: z.string().nullable(),
  activeTaskTitle: z.string().nullable(),
  projectPath: z.string(),
  worktreeBranch: z.string().nullable(),
  updatedAt: z.number(),
  entryCount: z.number().int().nonnegative(),
  lastText: z.string(),
});

const CodexSessionsPayloadSchema = z.object({
  managerId: z.string().min(1),
});

const CodexSessionsResultSchema = z.object({
  enabled: z.boolean(),
  sessions: z.array(CodexSessionSchema),
});

const CodexTranscriptPayloadSchema = z.object({
  managerId: z.string().min(1),
  engineerId: z.string().min(1),
});

const CodexTranscriptResultSchema = z.object({
  session: CodexSessionSchema.nullable(),
  entries: z.array(CodexEntrySchema),
  truncated: z.boolean(),
});

const CodexModelSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string(),
  reasoningLevels: z.array(z.object({
    effort: z.string().min(1),
    description: z.string(),
  })),
  defaultReasoningLevel: z.string().nullable(),
});

const CodexModelsPayloadSchema = z.object({
  force: z.boolean().optional(),
});

const CodexModelsResultSchema = z.object({
  models: z.array(CodexModelSchema),
  error: z.string().nullable(),
});

function strictCodec(typeSymbol, schema) {
  return {
    mode: 'strict',
    typeSymbol,
    create: () => schema,
  };
}

export const MANIFEST = {
  package: PACKAGE_NAME,
  face: 'host',
  schemas: [],
  invocations: [
    {
      id: REMOTE_METHOD_ID,
      service: REMOTE_SERVICE,
      namespace: REMOTE_SERVICE,
      method: REMOTE_METHOD,
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'payload',
          wire: 'payload',
          source: 'json',
          codec: strictCodec(`${PACKAGE_NAME}#${REMOTE_METHOD}Payload`, TodosPayloadSchema),
        },
      ],
      result: strictCodec(`${PACKAGE_NAME}#${REMOTE_METHOD}Result`, TodosResultSchema),
    },
    {
      id: REMOTE_CODEX_SESSIONS_METHOD_ID,
      service: REMOTE_SERVICE,
      namespace: REMOTE_SERVICE,
      method: REMOTE_CODEX_SESSIONS_METHOD,
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'payload',
          wire: 'payload',
          source: 'json',
          codec: strictCodec(
            `${PACKAGE_NAME}#${REMOTE_CODEX_SESSIONS_METHOD}Payload`,
            CodexSessionsPayloadSchema,
          ),
        },
      ],
      result: strictCodec(
        `${PACKAGE_NAME}#${REMOTE_CODEX_SESSIONS_METHOD}Result`,
        CodexSessionsResultSchema,
      ),
    },
    {
      id: REMOTE_CODEX_TRANSCRIPT_METHOD_ID,
      service: REMOTE_SERVICE,
      namespace: REMOTE_SERVICE,
      method: REMOTE_CODEX_TRANSCRIPT_METHOD,
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'payload',
          wire: 'payload',
          source: 'json',
          codec: strictCodec(
            `${PACKAGE_NAME}#${REMOTE_CODEX_TRANSCRIPT_METHOD}Payload`,
            CodexTranscriptPayloadSchema,
          ),
        },
      ],
      result: strictCodec(
        `${PACKAGE_NAME}#${REMOTE_CODEX_TRANSCRIPT_METHOD}Result`,
        CodexTranscriptResultSchema,
      ),
    },
    {
      id: REMOTE_CODEX_MODELS_METHOD_ID,
      service: REMOTE_SERVICE,
      namespace: REMOTE_SERVICE,
      method: REMOTE_CODEX_MODELS_METHOD,
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'payload',
          wire: 'payload',
          source: 'json',
          codec: strictCodec(
            `${PACKAGE_NAME}#${REMOTE_CODEX_MODELS_METHOD}Payload`,
            CodexModelsPayloadSchema,
          ),
        },
      ],
      result: strictCodec(
        `${PACKAGE_NAME}#${REMOTE_CODEX_MODELS_METHOD}Result`,
        CodexModelsResultSchema,
      ),
    },
  ],
  model: { services: [], events: [], objects: [] },
};

/** 只读 Host Remote：待办、Codex 会话列表与转录。 */
export class PaihuoRemote extends TypertRemoteService {
  /**
   * @param {object} ctx Cordis 上下文（typert 可用）。
   * @param {object} runtime 插件运行时。
   */
  constructor(ctx, runtime) {
    super(ctx, REMOTE_SERVICE);
    this.runtime = runtime;
  }

  /**
   * 读取一个经理会话的待办快照。
   *
   * @param {{ managerId?: string }} payload 经理会话 id。
   * @returns {Promise<{ todos: object[], counts: object }>} 待办与计数。
   */
  async todos(payload) {
    await this.runtime.ready();
    const managerId = typeof payload?.managerId === 'string' ? payload.managerId : '';
    return this.runtime.todos.listFor(managerId);
  }

  /**
   * 列出经理名下的 Codex 会话摘要。
   *
   * @param {{ managerId?: string }} payload 经理会话 id。
   * @returns {Promise<{ enabled: boolean, sessions: object[] }>} 会话摘要。
   */
  async codexSessions(payload) {
    await this.runtime.ready();
    const managerId = typeof payload?.managerId === 'string' ? payload.managerId : '';
    return this.runtime.codexUi.sessions(managerId);
  }

  /**
   * 读取一个 Codex 工程师的转录。
   *
   * @param {{ managerId?: string, engineerId?: string }} payload 经理与工程师 id。
   * @returns {Promise<{ session: object|null, entries: object[], truncated: boolean }>} 转录。
   */
  async codexTranscript(payload) {
    await this.runtime.ready();
    const managerId = typeof payload?.managerId === 'string' ? payload.managerId : '';
    const engineerId = typeof payload?.engineerId === 'string' ? payload.engineerId : '';
    return this.runtime.codexUi.transcript(managerId, engineerId);
  }

  /**
   * 读取本机 Codex CLI 当前支持的模型目录。
   *
   * @returns {Promise<{ models: object[], error: string|null }>} 模型与错误。
   */
  async codexModels(payload) {
    await this.runtime.ready();
    return listCodexModels(this.runtime, payload?.force === true);
  }
}

/** 供测试/诊断检查 Host 声明与 Client contribution 一致。 */
export const REMOTE_DESCRIPTOR = {
  id: REMOTE_METHOD_ID,
  service: REMOTE_SERVICE,
  namespace: REMOTE_SERVICE,
  method: REMOTE_METHOD,
};

export const REMOTE_CODEX_SESSIONS_DESCRIPTOR = {
  id: REMOTE_CODEX_SESSIONS_METHOD_ID,
  service: REMOTE_SERVICE,
  namespace: REMOTE_SERVICE,
  method: REMOTE_CODEX_SESSIONS_METHOD,
};

export const REMOTE_CODEX_TRANSCRIPT_DESCRIPTOR = {
  id: REMOTE_CODEX_TRANSCRIPT_METHOD_ID,
  service: REMOTE_SERVICE,
  namespace: REMOTE_SERVICE,
  method: REMOTE_CODEX_TRANSCRIPT_METHOD,
};

export const REMOTE_CODEX_MODELS_DESCRIPTOR = {
  id: REMOTE_CODEX_MODELS_METHOD_ID,
  service: REMOTE_SERVICE,
  namespace: REMOTE_SERVICE,
  method: REMOTE_CODEX_MODELS_METHOD,
};
