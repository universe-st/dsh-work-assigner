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

/** 经理允许保留的只读类工具；实际生效值是它与当前全局工具名的交集。 */
export const MANAGER_TOOL_WHITELIST = Object.freeze([
  'read',
  'read_image',
  'glob',
  'grep',
  'web_search',
  'web_fetch',
  'ask_user_question',
  'todo_write',
  'skill',
  'session_event_read',
  'session_event_search',
  'session_event_trace',
  'session_search',
  'session_trace',
  'list_agents',
]);

/**
 * 经理守卫的拒绝理由：预设作用域里注册的写入/终端工具不受 `tools.restrict`
 * 掩码影响，所以“经理不能改文件、跑命令”必须由守卫兜底。
 */
export const MANAGER_GUARD_REASON = '派活模式（经理）不直接执行任务：请用 paihuo_dispatch 派给工程师；只允许只读工具。';

export const TOOL_DISPATCH = 'paihuo_dispatch';
export const TOOL_ENGINEERS = 'paihuo_engineers';
export const TOOL_TASKS = 'paihuo_tasks';
export const TOOL_TASK = 'paihuo_task';
export const TOOL_MESSAGE = 'paihuo_message';
export const TOOL_CANCEL = 'paihuo_cancel';
export const TOOL_INTEGRATE = 'paihuo_integrate';
export const TOOL_RELEASE = 'paihuo_release';
export const TOOL_REPORT = 'paihuo_report';

export const MANAGER_TOOL_NAMES = Object.freeze([
  TOOL_DISPATCH,
  TOOL_ENGINEERS,
  TOOL_TASKS,
  TOOL_TASK,
  TOOL_MESSAGE,
  TOOL_CANCEL,
  TOOL_INTEGRATE,
  TOOL_RELEASE,
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
