/**
 * 纯策略函数：沙箱等级、路径包含、工位/资源容量、排队顺序、标题。
 * 不依赖任何 DSH 服务，便于单元测试。
 */

import { resolve, sep } from 'node:path';

import {
  ROLE_ENGINEER,
  ROLE_MANAGER,
  ROLE_NONE,
  TITLE_ENGINEER_PREFIX,
  TITLE_MANAGER_PREFIX,
} from './wire.js';

const SANDBOX_ORDER = ['read-only', 'workspace-write', 'danger-full-access'];

/** 沙箱模式的可比较等级；未知值按最低处理。 */
export function sandboxRank(mode) {
  const index = SANDBOX_ORDER.indexOf(mode);
  return index === -1 ? -1 : index;
}

export function isValidSandboxMode(mode) {
  return SANDBOX_ORDER.includes(mode);
}

/** 用于比较的规范化路径（Windows 下大小写不敏感）。 */
export function normalizeKey(path) {
  const absolute = resolve(String(path));
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

/**
 * child 是否等于 parent 或位于其下。
 *
 * @param {string} parent 父目录。
 * @param {string} child 子路径。
 * @returns {boolean} 是否包含。
 */
export function isInside(parent, child) {
  const outer = normalizeKey(parent);
  const inner = normalizeKey(child);
  if (inner === outer) return true;
  const prefix = outer.endsWith(sep) ? outer : `${outer}${sep}`;
  return inner.startsWith(prefix);
}

/**
 * 经理能否把任务派发到某个项目目录。
 * 完全权限：只要目录存在即可（由调用方校验存在性），相关与否由用户声明；
 * 其余权限：必须位于经理自己的工作目录之下。
 */
export function canDispatchTo(managerSandbox, managerCwd, projectPath) {
  if (managerSandbox === 'danger-full-access') return true;
  if (typeof managerCwd !== 'string' || managerCwd === '') return false;
  return isInside(managerCwd, projectPath);
}

/** 工程师权限不得高于经理。 */
export function canSupervise(managerSandbox, engineerSandbox) {
  return sandboxRank(engineerSandbox) <= sandboxRank(managerSandbox);
}

export function runningTaskList(tasks) {
  return Object.values(tasks).filter((task) => task.status === 'running');
}

export function runningCount(tasks) {
  return runningTaskList(tasks).length;
}

export function runningByProject(tasks, projectKey) {
  let count = 0;
  for (const task of runningTaskList(tasks)) {
    if (task.projectKey === projectKey) count += 1;
  }
  return count;
}

/** 正在被运行任务占用的全局串行资源。 */
export function heldResources(tasks) {
  const held = new Set();
  for (const task of runningTaskList(tasks)) {
    for (const resource of task.resources ?? []) held.add(resource);
  }
  return held;
}

/**
 * 判断一个排队任务此刻能否开工。
 *
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function canStartTask({ tasks, projectKey, resources = [], workstationsPerProject, totalWorkstations }) {
  if (runningByProject(tasks, projectKey) >= workstationsPerProject) {
    return { ok: false, reason: 'project-workstations-full' };
  }
  if (runningCount(tasks) >= totalWorkstations) {
    return { ok: false, reason: 'total-workstations-full' };
  }
  const held = heldResources(tasks);
  for (const resource of resources) {
    if (held.has(resource)) return { ok: false, reason: `resource-busy:${resource}` };
  }
  return { ok: true };
}

/** 排队顺序：urgent 优先，其次按创建时间升序。 */
export function orderQueued(tasks, engineerId = undefined) {
  return Object.values(tasks)
    .filter((task) => task.status === 'queued')
    .filter((task) => engineerId === undefined || task.engineerId === engineerId)
    .sort((left, right) => {
      const leftUrgent = left.priority === 'urgent' ? 0 : 1;
      const rightUrgent = right.priority === 'urgent' ? 0 : 1;
      if (leftUrgent !== rightUrgent) return leftUrgent - rightUrgent;
      return left.createdAt - right.createdAt;
    });
}

export function shorten(text, max = 40) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(1, max - 1))}…`;
}

/** 去掉本插件添加过的角色前缀。 */
export function stripRolePrefix(title) {
  let value = String(title ?? '');
  if (value.startsWith(TITLE_MANAGER_PREFIX)) value = value.slice(TITLE_MANAGER_PREFIX.length);
  else if (value.startsWith(TITLE_ENGINEER_PREFIX)) value = value.slice(TITLE_ENGINEER_PREFIX.length);
  else if (value.startsWith('👔 ')) value = value.slice(3);
  return value.trim();
}

export function managerTitle(baseTitle) {
  return `${TITLE_MANAGER_PREFIX}${stripRolePrefix(baseTitle) || '新会话'}`;
}

export function engineerTitle(taskTitle, projectName) {
  const name = shorten(projectName ?? '', 24);
  const head = shorten(taskTitle, 40) || '任务';
  return `${TITLE_ENGINEER_PREFIX}${name === '' ? head : `${head} · ${name}`}`;
}

/** 从标题前缀推断角色（投影不可用时的兜底）。 */
export function roleFromTitle(title) {
  const value = String(title ?? '');
  if (value.startsWith('👔')) return ROLE_MANAGER;
  if (value.startsWith('👷')) return ROLE_ENGINEER;
  return ROLE_NONE;
}

/** 子代理/派生活话不能当经理或工程师。 */
export function isSubagentSession(header) {
  if (header === undefined || header === null) return false;
  return header.origin === 'subagent' || header.parentSession !== undefined;
}

export function formatModel(model) {
  if (!model || typeof model.provider !== 'string' || typeof model.model !== 'string') return '（默认）';
  return `${model.provider}/${model.model}`;
}

export function sameModel(left, right) {
  if (!left || !right) return false;
  return left.provider === right.provider && left.model === right.model;
}
