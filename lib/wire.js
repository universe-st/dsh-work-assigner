/**
 * 「派活」插件共享常量。
 *
 * 角色不写进会话日志的新事件类型：角色由 `/paihuo` 命令的
 * `command/run` + `command/done` 事件折叠成 `paihuo` 会话投影，
 * 这样恢复、分叉、重放都能得到同一个角色，且不会让会话无法重开。
 */

export const PACKAGE_NAME = 'dsh-paihuo';
export const PROJECTION_KEY = 'paihuo';
export const COMMAND_NAME = 'paihuo';

/** 会话创建时可选的管理者预设：`session.header.agentPreset === MANAGER_PRESET_ID`。 */
export const MANAGER_PRESET_ID = 'paihuo';
export const PRESET_ROW_ID = 'preset-paihuo';

export const ROLE_NONE = 'none';
export const ROLE_MANAGER = 'manager';
export const ROLE_ENGINEER = 'engineer';
export const ROLES = [ROLE_NONE, ROLE_MANAGER, ROLE_ENGINEER];

/** 会话列表里可见的角色标记（emoji 放在标题最前面，运行中也不会消失）。 */
export const TITLE_MANAGER_PREFIX = '👔 经理 · ';
export const TITLE_ENGINEER_PREFIX = '👷 ';
/** 空标题的经理会话先占位，保证列表里立刻能看到经理图标。 */
export const MANAGER_PLACEHOLDER_TITLE = '👔 经理';

/** 经理允许保留的只读工具；实际生效值是它与当前代理可用工具名的交集。 */
export const MANAGER_TOOL_WHITELIST = Object.freeze([
  'read',
  'read_image',
  'glob',
  'grep',
  'web_search',
  'web_fetch',
  'ask_user_question',
  'skill',
  'session_event_read',
  'session_event_search',
  'session_event_trace',
  'session_search',
  'session_trace',
  'list_agents',
]);

/** 派活工具前缀：经理自己注册，不受 `tools.restrict` 掩码影响。 */
export const PAISHUO_TOOL_PREFIX = 'paihuo_';

/**
 * 记忆插件（meow-memory）的工具前缀：`memory_search` / `memory_remember` /
 * `memory_update` / `memory_dream` 等。
 *
 * 记忆库是 `$DSH_HOME` 下的 SQLite，不碰工作区，所以写记忆不算「经理动手」。
 * 必须整族放行：经理会话正是用户拍板、决策发生的现场，dream 的记忆整理也
 * 只能在会话自己的上下文里做。以前只放行只读工具时，记忆写入被守卫拒绝，
 * dream 注入的整理任务没有任何写入口，只能回一句「整理完成」空转，等于
 * 派活模式下整类记忆永久丢失。
 *
 * 按前缀认而不是列名单：插件以后新增记忆工具（如 topic 类），不会又被挡掉。
 */
export const MEMORY_TOOL_PREFIX = 'memory_';

/** 是否是派活工具。 */
export function isPaihuoTool(name) {
  return typeof name === 'string' && name.startsWith(PAISHUO_TOOL_PREFIX);
}

/** 是否是记忆插件工具（只读写记忆库，不碰工作区）。 */
export function isMemoryTool(name) {
  return typeof name === 'string' && name.startsWith(MEMORY_TOOL_PREFIX);
}

/** 经理可用的继承工具：只读白名单 + 记忆工具。 */
export function isManagerTool(name) {
  return typeof name === 'string'
    && (MANAGER_TOOL_WHITELIST.includes(name) || isMemoryTool(name));
}

/**
 * 经理守卫的拒绝理由：预设作用域里注册的写入/终端工具不受 `tools.restrict`
 * 掩码影响，所以“经理不能改文件、跑命令”必须由守卫兜底。
 */
export const MANAGER_GUARD_REASON = '派活模式（经理）不直接执行任务：请用 paihuo_dispatch 派给工程师；只允许只读工具与记忆工具（memory_*）。';

export const TOOL_DISPATCH = 'paihuo_dispatch';
export const TOOL_ENGINEERS = 'paihuo_engineers';
export const TOOL_TASKS = 'paihuo_tasks';
export const TOOL_TASK = 'paihuo_task';
export const TOOL_MESSAGE = 'paihuo_message';
export const TOOL_CANCEL = 'paihuo_cancel';
export const TOOL_INTEGRATE = 'paihuo_integrate';
export const TOOL_RELEASE = 'paihuo_release';
export const TOOL_REPORT = 'paihuo_report';
export const TOOL_TODO = 'paihuo_todo';

export const MANAGER_TOOL_NAMES = Object.freeze([
  TOOL_DISPATCH,
  TOOL_ENGINEERS,
  TOOL_TASKS,
  TOOL_TASK,
  TOOL_MESSAGE,
  TOOL_CANCEL,
  TOOL_INTEGRATE,
  TOOL_RELEASE,
  TOOL_TODO,
]);

/** 待办状态：暂停是独立的，不与 built-in todo_write 的三态混用。 */
export const TODO_STATUSES = Object.freeze([
  'pending',
  'in_progress',
  'paused',
  'completed',
]);

/** 任务终态，用于剪枝与状态判断。 */
export const FINAL_TASK_STATUSES = Object.freeze([
  'done',
  'failed',
  'blocked',
  'cancelled',
  'interrupted',
]);

export const MANAGER_OFF_FORCE_ARG = 'force';
