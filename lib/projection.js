/**
 * `paihuo` 会话投影：把 `/paihuo` 命令事件折叠成命令角色，
 * 并记录会话内切换过的 Agent 预设（`agent-preset/selected`）。
 */

import { z } from 'zod';

import {
  PROJECTION_KEY,
  ROLE_ENGINEER,
  ROLE_MANAGER,
  ROLE_NONE,
  ROLES,
} from './wire.js';

/** 命令参数解析结果（也用于投影折叠）。 */
export function parseCommandArgs(rawInput) {
  const text = String(rawInput ?? '').trim();
  if (text === '') return { kind: 'on', force: false, taskId: '' };
  const parts = text.split(/\s+/);
  const head = parts[0].toLowerCase();
  if (head === 'on') return { kind: 'on', force: false, taskId: '' };
  if (head === 'off') {
    return {
      kind: 'off',
      force: parts.slice(1).some((part) => part.toLowerCase() === 'force'),
      taskId: '',
    };
  }
  if (head === 'status') return { kind: 'status', force: false, taskId: '' };
  if (head === 'engineer') return { kind: 'engineer', force: false, taskId: parts[1] ?? '' };
  return { kind: 'unknown', force: false, taskId: '' };
}

function targetRoleOf(intent) {
  if (intent === 'on') return ROLE_MANAGER;
  if (intent === 'off') return ROLE_NONE;
  if (intent === 'engineer') return ROLE_ENGINEER;
  return null;
}

export const paihuoProjection = {
  key: PROJECTION_KEY,
  stateVersion: 2,
  stateSchema: z.object({
    role: z.enum(ROLES),
    /** 会话内最后一次切换到的 Agent 预设；null 表示沿用创建时的头部预设。 */
    preset: z.string().nullable(),
    running: z.object({
      commandId: z.string(),
      target: z.enum([ROLE_MANAGER, ROLE_ENGINEER, ROLE_NONE]).nullable(),
    }).nullable(),
  }),
  init: () => ({ role: ROLE_NONE, preset: null, running: null }),
  apply: (state, event) => {
    // 会话内切换预设：比创建时的 header.agentPreset 更能代表“现在是什么模式”。
    if (event.type === 'agent-preset/selected') {
      const preset = typeof event.data?.agentPreset === 'string' ? event.data.agentPreset : null;
      return { ...state, preset };
    }
    if (event.type === 'command/run' && event.data?.name === PROJECTION_KEY) {
      const parsed = parseCommandArgs(event.data.args);
      return {
        ...state,
        running: {
          commandId: String(event.data.commandId),
          target: targetRoleOf(parsed.kind),
        },
      };
    }
    if (state.running !== null && event.type === 'command/done' && event.data?.commandId === state.running.commandId) {
      const target = state.running.target;
      const succeeded = event.data.kind === 'success';
      return {
        role: succeeded && target !== null ? target : state.role,
        running: null,
      };
    }
    return state;
  },
  wire: {
    viewSchema: z.object({ role: z.enum(ROLES) }),
    view: (state) => ({ role: state.role }),
  },
};
