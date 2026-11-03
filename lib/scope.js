/**
 * 代理作用域装配：经理（只读 + 派活工具）与工程师（回报工具 + 模型路由）。
 *
 * 每个作用域只注册一次，注册在 `agent.ctx` 上；代理销毁或插件卸载时一起回收。
 */

import { buildEngineerSection, buildManagerSection } from './prompt.js';
import { createEngineerTools, createManagerTools } from './tools.js';
import { MANAGER_GUARD_REASON, MANAGER_TOOL_WHITELIST } from './wire.js';

/** 当前全局可见工具名与经理白名单的交集（restrict 不接受未知名字）。 */
export function computeAllowList(runtime) {
  let names = [];
  try {
    names = runtime.ctx.tools.schemas().map((schema) => schema.name);
  } catch {
    names = [];
  }
  const seen = new Set(names);
  return MANAGER_TOOL_WHITELIST.filter((name) => seen.has(name));
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
  };

  disposers.push(agentCtx.systemPrompt.section({
    name: 'paihuo:manager',
    order: 2400,
    text: () => buildManagerSection(runtime, agent),
  }));

  const allow = computeAllowList(runtime);
  if (allow.length > 0) {
    disposers.push(agentCtx.tools.restrict({ allow }));
  }

  // 预设作用域注册的工具（bash/pwsh/write/edit 等）不受 restrict 掩码影响，
  // 因此“经理不能执行任务/改文件”由守卫兜底：只放行只读工具与派活工具。
  disposers.push(agentCtx.tools.guard((execution) => {
    const name = execution?.name;
    if (typeof name !== 'string' || name === '') return undefined;
    if (name.startsWith('paihuo_')) return undefined;
    if (MANAGER_TOOL_WHITELIST.includes(name)) return undefined;
    return MANAGER_GUARD_REASON;
  }));

  for (const definition of createManagerTools(runtime)) {
    disposers.push(agentCtx.tools.register(definition));
  }

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

  // 工程师模型：按任务覆盖本次调用路由，不写全局默认模型。
  disposers.push(agentCtx.on('agent/request', async (payload, next) => {
    const config = await next();
    const engineer = runtime.store.get().engineers[agent.id];
    const model = engineer?.model;
    if (model === null || model === undefined) return config;
    if (config.provider === model.provider && config.model === model.model) return config;
    const { reasoningEffort: _reasoningEffort, maxTokens: _maxTokens, ...rest } = config;
    return { ...rest, provider: model.provider, model: model.model };
  }));

  agentCtx.effect(() => () => dispose(), 'paihuo: engineer scope');
  runtime.scopes.set(agent.id, dispose);
  return dispose;
}

/** 插件卸载时清掉所有代理作用域。 */
export function disposeAllScopes(runtime) {
  for (const dispose of [...runtime.scopes.values()]) dispose();
}
