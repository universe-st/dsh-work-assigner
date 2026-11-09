/**
 * 工程师活跃度汇总：供会话列表给经理会话显示 LOADING 动画。
 *
 * 「正在工作」不只等于 `engineer.status === 'running'`：
 * - 空闲工程师收到 `paihuo_message` 补充消息后，会自己开一个回合，状态仍是 idle；
 * - Codex 工程师的补充回合根本不会改 `status`，只登记在 `runtime.runs` 里。
 * 两种情况下经理都以为对方在干活，所以这里一并算作忙碌。
 */

import { BACKEND_CODEX } from './wire.js';

/** 工程师是否正在执行任务或补充回合。 */
export function isEngineerWorking(runtime, engineer) {
  if (engineer === null || engineer === undefined) return false;
  if (engineer.status === 'running') return true;
  const sessionId = engineer.sessionId;
  if (typeof sessionId !== 'string' || sessionId === '') return false;
  try {
    if (runtime?.currentTurn?.has?.(sessionId) === true) return true;
  } catch {
    /* 运行状态未就绪 */
  }
  if (engineer.supplement?.turn !== undefined) return true;
  try {
    if (runtime?.runs?.has?.(`supplement:${sessionId}`) === true) return true;
  } catch {
    /* Codex 运行表未就绪 */
  }
  return false;
}

/**
 * 按经理汇总正在工作的工程师数量。
 *
 * 只返回有工程师在工作的经理；客户端把「不在列表里」当作 0。
 * 会话工程师与 Codex 工程师分开计数，方便以后在提示里说明来源。
 */
export function managerActivity(state, runtime) {
  const managers = new Map();
  for (const engineer of Object.values(state?.engineers ?? {})) {
    if (!isEngineerWorking(runtime, engineer)) continue;
    const managerId = engineer.managerId;
    if (typeof managerId !== 'string' || managerId === '') continue;
    let entry = managers.get(managerId);
    if (entry === undefined) {
      entry = {
        managerId,
        runningEngineers: 0,
        sessionEngineers: 0,
        codexEngineers: 0,
      };
      managers.set(managerId, entry);
    }
    entry.runningEngineers += 1;
    if (engineer.backend === BACKEND_CODEX) entry.codexEngineers += 1;
    else entry.sessionEngineers += 1;
  }
  return { managers: [...managers.values()] };
}
