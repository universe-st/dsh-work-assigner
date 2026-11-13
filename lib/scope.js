/**
 * 代理作用域装配：经理（只读 + 派活工具）与工程师（回报工具）。
 *
 * 工程师模型不在这里挂请求监听：Host 在 step preparation 时就固定路由，
 * 模型由 tasks.js 在回合开始前用 `agent.model.select()` 选好。
 *
 * 每个作用域只注册一次，注册在 `agent.ctx` 上；代理销毁或插件卸载时一起回收。
 */

import { buildEngineerSection, buildManagerSection } from './prompt.js';
import { createEngineerTools, createManagerTools } from './tools.js';
import {
  MANAGER_GUARD_REASON,
  MANAGER_TOOL_WHITELIST,
  ROLE_MANAGER,
  isImTool,
  isManagerTool,
  isMemoryTool,
  isPaihuoTool,
  managerToolAllowed,
} from './wire.js';

/**
 * 经理可保留的工具：白名单与「该代理可被 restrict 的继承工具」的交集。
 *
 * 必须按 agent 视图计算，不能用全局视图：预设注册的工具挂在 agent 祖先层，
 * 全局视图里根本没有它们，求交集会得到空列表，`tools.restrict` 被整个跳过，
 * 于是 profile 级 MCP（如 playwright 的 25 个浏览器工具）会留在经理 prompt 里，
 * 既占 token 又只能靠工具守卫拒绝。restrict 只过滤继承面，agent 自己注册的
 * `paihuo_*` 工具不受影响，所以这里不必把它们算进 allow。
 *
 * 只读白名单、记忆工具（`memory_*`：只读写记忆库，不碰工作区）与 IM 工具
 * （`dsh_im_*`：收发聊天里的图片/文件、读群历史，不执行任务）都保留。
 *
 * @param {object} runtime 插件运行时。
 * @param {object} agent 当前经理代理。
 * @returns {string[]} 允许保留的继承工具名。
 */
export function computeAllowList(runtime, agent) {
  let names = [];
  const tools = runtime.ctx.tools;
  try {
    const view = typeof tools.view === 'function' ? tools.view(agent) : undefined;
    if (view !== undefined && view !== null && view.restrictableNames !== undefined) {
      names = [...view.restrictableNames];
    }
  } catch {
    names = [];
  }
  if (names.length === 0) {
    // 老版本 Host 没有 view()：退回全局视图（至少能屏蔽全局写入类工具）。
    try {
      names = tools.schemas().map((schema) => schema.name);
    } catch {
      names = [];
    }
  }
  return names.filter((name) => managerToolAllowed(name, runtime.config));
}

/**
 * 全局（profile 级）工具里经理不该看到的：MCP 浏览器工具、工作区依赖等。
 *
 * 与 allow 互补：allow 依赖 agent 视图里已经出现的预设工具，若作用域安装得早、
 * 预设工具还没注册，allow 会为空；deny 只针对全局层，任何时候都能把 profile
 * 级 MCP 工具挡在经理 prompt 之外。
 *
 * @param {object} runtime 插件运行时。
 * @returns {string[]} 需要从经理工具面移除的全局工具名。
 */
export function computeDenyList(runtime) {
  let names = [];
  try {
    names = runtime.ctx.tools.schemas().map((schema) => schema.name);
  } catch {
    names = [];
  }
  // run_code 是 PTC 呈现层的保留名，restrict 不允许提它。
  return names.filter((name) => (
    name !== 'run_code'
    && !isPaihuoTool(name)
    && !managerToolAllowed(name, runtime.config)
  ));
}

function disposeAll(disposers) {
  for (const dispose of disposers.splice(0).reverse()) {
    try {
      dispose();
    } catch {
      /* 单个注销失败不影响其余 */
    }
  }
}

/**
 * 安装/复用经理作用域。
 *
 * @returns {() => void} 幂等卸载函数。
 */
export function installManagerScope(runtime, agent) {
  const existing = runtime.scopes.get(agent.id);
  if (existing !== undefined) return existing;

  const disposers = [];
  const agentCtx = agent.ctx;
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    disposeAll(disposers);
    runtime.scopes.delete(agent.id);
    runtime.todoGuard?.delete(agent.id);
  };

  disposers.push(agentCtx.systemPrompt.section({
    name: 'paihuo:manager',
    order: 2400,
    text: () => buildManagerSection(runtime),
  }));

  const allow = computeAllowList(runtime, agent);
  const deny = computeDenyList(runtime);
  const filter = {
    ...(allow.length > 0 ? { allow } : {}),
    ...(deny.length > 0 ? { deny } : {}),
  };
  if (filter.allow !== undefined || filter.deny !== undefined) {
    disposers.push(agentCtx.tools.restrict(filter));
  }

  // restrict 只过滤继承面（全局与祖先层）；守卫再兜一层：既覆盖老版本 Host
  // 上没有 view() 的情况，也覆盖 restrict 安装之后才注册进来的工具。
  // 两层都只放行只读工具、记忆工具、IM 工具与派活工具。
  disposers.push(agentCtx.tools.guard((execution) => {
    const name = execution?.name;
    if (typeof name !== 'string' || name === '') return undefined;
    if (isPaihuoTool(name)) return undefined;
    // 守卫按调用时的配置判定：配置页改了放行清单，下一步就生效。
    if (managerToolAllowed(name, runtime.config)) return undefined;
    return MANAGER_GUARD_REASON;
  }));

  for (const definition of createManagerTools(runtime)) {
    disposers.push(agentCtx.tools.register(definition));
  }

  // 轮次关闭前的待办强制核对：通过 steer 把提醒留在同一轮，而不是另起一轮。
  // 监听器内部吞掉所有错误，避免把正常的轮次收尾变成失败。
  disposers.push(agentCtx.on('agent/turn-stopping', async (payload) => {
    try {
      await runtime.tasks.ensureManagerTodoChecked(agent, payload);
    } catch (error) {
      try {
        runtime.logger?.warn?.(`[paihuo] 待办核对提醒失败：${error instanceof Error ? error.message : String(error)}`);
      } catch {
        /* 日志失败不影响轮次 */
      }
    }
  }));

  agentCtx.effect(() => () => dispose(), 'paihuo: manager scope');
  runtime.scopes.set(agent.id, dispose);
  return dispose;
}

/**
 * 安装/复用工程师作用域。
 *
 * @returns {() => void} 幂等卸载函数。
 */
export function installEngineerScope(runtime, agent) {
  const existing = runtime.scopes.get(agent.id);
  if (existing !== undefined) return existing;

  const disposers = [];
  const agentCtx = agent.ctx;
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    disposeAll(disposers);
    runtime.scopes.delete(agent.id);
  };

  disposers.push(agentCtx.systemPrompt.section({
    name: 'paihuo:engineer',
    order: 2410,
    text: () => buildEngineerSection(runtime),
  }));

  for (const definition of createEngineerTools(runtime)) {
    disposers.push(agentCtx.tools.register(definition));
  }

  // 工程师模型不在这里用 `agent/request` 覆盖：Host 在 step preparation 时
  // 就固定了 provider/model，之后改会被拒绝（该事件自 DSH 0.2.1-alpha.4 起
  // 已弃用且不允许改路由）。模型由 tasks.js 在回合开始前调用
  // `agent.model.select()` 写进会话选择。

  agentCtx.effect(() => () => dispose(), 'paihuo: engineer scope');
  runtime.scopes.set(agent.id, dispose);
  return dispose;
}

/** 工具分组：配置页按这个分组展示；`locked` 的工具不可关（派活工具）。 */
function toolGroupOf(name) {
  if (isPaihuoTool(name)) return 'paihuo';
  if (isImTool(name)) return 'im';
  if (isMemoryTool(name)) return 'memory';
  if (MANAGER_TOOL_WHITELIST.includes(name)) return 'readonly';
  return 'other';
}

/**
 * 列出经理可放行的全部工具（含第三方）：全局工具 + 经理视图里的继承工具 +
 * 配置里手填过的名字（工具被卸载后仍能看到并清掉）。
 *
 * @param {object} runtime 插件运行时。
 * @param {string} [managerId] 已存在的经理会话；给了就把它继承面的工具也算进来。
 * @returns {{tools: {name: string, group: string, allowed: boolean, locked: boolean}[]}} 清单。
 */
export function listManagerToolCatalog(runtime, managerId) {
  const names = new Set();
  try {
    for (const schema of runtime.ctx.tools.schemas()) {
      if (typeof schema?.name === 'string' && schema.name !== '') names.add(schema.name);
    }
  } catch {
    /* 没有 tools 服务时只靠配置里的名字 */
  }
  try {
    const agent = typeof managerId === 'string' && managerId !== ''
      ? runtime.ctx.get('agents')?.get?.(managerId)
      : undefined;
    const view = agent === undefined ? undefined : runtime.ctx.tools?.view?.(agent);
    for (const name of view?.restrictableNames ?? []) names.add(name);
  } catch {
    /* 视图不可用就只用全局清单 */
  }
  const extra = Array.isArray(runtime.config?.managerExtraTools) ? runtime.config.managerExtraTools : [];
  const denied = Array.isArray(runtime.config?.managerDeniedTools) ? runtime.config.managerDeniedTools : [];
  for (const name of [...extra, ...denied]) names.add(name);
  // run_code 是 PTC 呈现层的保留名，restrict 不允许提它。
  names.delete('run_code');
  const tools = [...names]
    .sort((left, right) => left.localeCompare(right))
    .map((name) => {
      const locked = isPaihuoTool(name);
      return {
        name,
        group: toolGroupOf(name),
        allowed: locked ? true : managerToolAllowed(name, runtime.config),
        locked,
      };
    });
  return { tools };
}

/**
 * 配置改动后重建所有经理作用域，让新的 allow/deny 立刻生效（守卫本身读实时配置，
 * 但 `tools.restrict` 的 allow/deny 是安装时算的）。
 */
export function refreshManagerScopes(runtime) {
  let agents = [];
  try {
    agents = runtime.ctx.get('agents')?.list?.() ?? [];
  } catch {
    agents = [];
  }
  for (const agent of agents) {
    if (runtime.roleOf(agent) !== ROLE_MANAGER) continue;
    try {
      runtime.scopes.get(agent.id)?.();
      installManagerScope(runtime, agent);
    } catch (error) {
      runtime.logger?.warn?.(`[paihuo] 经理工具面刷新失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/** 插件卸载时清掉所有代理作用域。 */
export function disposeAllScopes(runtime) {
  for (const dispose of [...runtime.scopes.values()]) dispose();
}
