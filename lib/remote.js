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

import { TodoSchema } from './state.js';
import { PACKAGE_NAME } from './wire.js';

export const REMOTE_SERVICE = 'paihuo';
export const REMOTE_METHOD = 'todos';
export const REMOTE_METHOD_ID = `${PACKAGE_NAME}#${REMOTE_SERVICE}/${REMOTE_METHOD}`;

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
  ],
  model: { services: [], events: [], objects: [] },
};

/** 最小的 Host Remote 服务：只有 `todos` 一个只读方法。 */
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
}

/** 供测试/诊断检查 Host 声明与 Client contribution 一致。 */
export const REMOTE_DESCRIPTOR = {
  id: REMOTE_METHOD_ID,
  service: REMOTE_SERVICE,
  namespace: REMOTE_SERVICE,
  method: REMOTE_METHOD,
};
