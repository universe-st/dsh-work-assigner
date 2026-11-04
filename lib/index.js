/**
 * 「派活」Host 插件入口。
 *
 * 装配：配置、状态存储、角色投影、`/paihuo` 命令、代理作用域、任务派发。
 * 角色由命令事件折叠成会话投影；派发队列与工位由插件自有存储维护。
 */

import Schema from '@deepseek-ai/schemastery';
import { z } from 'zod';

import { resolveConfig } from './config.js';
import {
  isSubagentSession,
  managerTitle,
  roleFromTitle,
  stripRolePrefix,
} from './policy.js';
import { buildStatusText } from './prompt.js';
import { paihuoProjection, parseCommandArgs } from './projection.js';
import { MANIFEST, PaihuoRemote } from './remote.js';
import { disposeAllScopes, installEngineerScope, installManagerScope } from './scope.js';
import {
  createEmptyState,
  createStateStore,
  hydrateState,
  StateSchema,
} from './state.js';
import { createTasks } from './tasks.js';
import { createTodos } from './todos.js';
import {
  COMMAND_NAME,
  MANAGER_PLACEHOLDER_TITLE,
  MANAGER_PRESET_ID,
  PROJECTION_KEY,
  ROLE_ENGINEER,
  ROLE_MANAGER,
  ROLE_NONE,
} from './wire.js';

export const inject = ['tools', 'systemPrompt', 'commands', 'sessionController', 'sessions'];

/**
 * 插件配置：根节点 volatile，使「插件 → 配置」页可以整表编辑并即时生效。
 * 字段默认值与 `lib/config.js` 保持一致。
 */
export const Config = Schema.object({
  engineerModels: Schema.array(Schema.object({
    provider: Schema.string().required(),
    model: Schema.string().required(),
    description: Schema.string().default(''),
  })).default([]).description('可选工程师模型：provider/model + 适用范围说明'),
  workstationsPerProject: Schema.number().min(1).step(1).default(2).description('单项目同时运行的工程师数上限'),
  totalWorkstations: Schema.number().min(1).step(1).default(4).description('所有项目合计的工位上限'),
  worktree: Schema.boolean().default(true).description('是否为工程师创建独立 git worktree'),
  serializedResources: Schema.array(Schema.string()).default(['browser']).description('全局串行资源（同一资源同时最多一个任务）'),
  maxEngineerQueue: Schema.number().min(1).step(1).default(6).description('单个工程师的排队上限'),
  engineerPermission: Schema.union([Schema.string(), Schema.const(null)]).default(null).description('经理预设为 custom 时的兜底权限预设；null 表示目录默认'),
  managerSection: Schema.union([Schema.string(), Schema.const(null)]).default(null).description('覆盖经理提示词段'),
  engineerSection: Schema.union([Schema.string(), Schema.const(null)]).default(null).description('覆盖工程师提示词段'),
}).volatile();

function describeError(error) {
  return error instanceof Error ? error.message : String(error ?? '未知错误');
}

function warn(ctx, message) {
  try {
    ctx.logger?.warn?.(`[paihuo] ${message}`);
  } catch {
    /* 日志失败不影响激活 */
  }
}

function currentTitle(runtime, agent) {
  try {
    return runtime.ctx.get('sessionTitle')?.get(agent.session)?.title ?? '';
  } catch {
    return '';
  }
}

async function renameSession(runtime, agent, title) {
  const value = String(title ?? '').trim();
  if (value === '') return;
  // 直接追加 title 事件：与 sessionTitle.rename 同形，但不经过服务的
  // “同一次标题提交期间不可重入”限制（在 session/title 回调里改名时尤其重要）。
  try {
    agent.session.append('session/title', {
      title: value,
      messageSeqs: [],
      source: { kind: 'user' },
    });
    return;
  } catch (error) {
    warn(runtime.ctx, `会话改名失败（append）：${describeError(error)}`);
  }
  const sessionTitle = runtime.ctx.get('sessionTitle');
  if (sessionTitle) {
    try {
      sessionTitle.rename(agent.session, value);
      return;
    } catch (error) {
      warn(runtime.ctx, `会话改名失败（sessionTitle）：${describeError(error)}`);
    }
  }
  try {
    await runtime.ctx.get('sessionController')?.rename({ sessionId: agent.id, title: value });
  } catch (error) {
    warn(runtime.ctx, `会话改名失败（sessionController）：${describeError(error)}`);
  }
}

/** 重新读取 Loader 提交后的（volatile）配置。 */
function refreshConfig(runtime, rawConfig) {
  const candidates = [];
  try {
    if (runtime.ctx.config !== undefined) candidates.push(runtime.ctx.config);
  } catch {
    /* 无 ctx.config */
  }
  candidates.push(rawConfig);
  for (const candidate of candidates) {
    try {
      runtime.config = resolveConfig(candidate);
      return true;
    } catch {
      /* 尝试下一个来源 */
    }
  }
  warn(runtime.ctx, '配置刷新失败，沿用上一次的有效配置');
  return false;
}

/** 确保经理会话在插件存储里有记录，并让会话列表立刻显示经理图标。 */
async function ensureManagerSession(runtime, agent) {
  const state = runtime.store.get();
  if (state.todos === undefined || state.todos === null) state.todos = {};
  if (state.managers[agent.id] === undefined) {
    state.managers[agent.id] = {
      sessionId: agent.id,
      baseTitle: stripRolePrefix(currentTitle(runtime, agent)),
      createdAt: Date.now(),
    };
    if (state.todos[agent.id] === undefined) state.todos[agent.id] = [];
    await runtime.store.save();
  }
  const record = state.managers[agent.id];
  const title = currentTitle(runtime, agent);
  if (title === '' || title === MANAGER_PLACEHOLDER_TITLE) {
    if (record.titlePlaceholder !== true) {
      record.titlePlaceholder = true;
      await renameSession(runtime, agent, MANAGER_PLACEHOLDER_TITLE);
      await runtime.store.save();
    }
    return;
  }
  if (!title.startsWith('👔')) {
    record.baseTitle = stripRolePrefix(title);
    record.titlePlaceholder = false;
    await renameSession(runtime, agent, managerTitle(record.baseTitle));
    await runtime.store.save();
  } else {
    record.baseTitle = stripRolePrefix(title);
    record.titlePlaceholder = false;
  }
}

/** 当前生效的 Agent 预设：会话内切换过的预设优先于创建时的 header。 */
function effectivePresetOf(runtime, agent) {
  try {
    const preset = runtime.ctx.get('sessionProjections')?.stateOf(agent.session, PROJECTION_KEY)?.preset;
    if (typeof preset === 'string' && preset !== '') return preset;
  } catch {
    /* 投影不可用 */
  }
  return agent.session?.header?.agentPreset;
}

async function restoreManagerTitle(runtime, agent, record) {
  const restore = record?.titlePlaceholder === true
    ? '新会话'
    : (record?.baseTitle || stripRolePrefix(currentTitle(runtime, agent)));
  if (restore !== '') await renameSession(runtime, agent, restore);
}

/** 卸载经理作用域：切走「派活模式」预设时使用。 */
async function detachManager(runtime, agent) {
  const state = runtime.store.get();
  const record = state.managers[agent.id];
  delete state.managers[agent.id];
  runtime.scopes.get(agent.id)?.();
  await restoreManagerTitle(runtime, agent, record);
  await runtime.store.save();
}

async function activateManager(runtime, agent) {
  if (isSubagentSession(agent.session.header)) {
    return { kind: 'error', text: '子代理会话不能进入派活模式。' };
  }
  if (runtime.roleOf(agent) === ROLE_ENGINEER) {
    return { kind: 'error', text: '该会话已是工程师，不能同时成为经理。' };
  }
  const state = runtime.store.get();
  if (state.todos === undefined || state.todos === null) state.todos = {};
  if (state.managers[agent.id] === undefined) {
    state.managers[agent.id] = {
      sessionId: agent.id,
      baseTitle: stripRolePrefix(currentTitle(runtime, agent)),
      createdAt: Date.now(),
    };
  }
  if (state.todos[agent.id] === undefined) state.todos[agent.id] = [];
  installManagerScope(runtime, agent);
  const record = state.managers[agent.id];
  if (record.baseTitle !== '') {
    await renameSession(runtime, agent, managerTitle(record.baseTitle));
  } else {
    // 还没有标题：先放一个带图标的占位标题，保证会话列表立刻显示经理；
    // 第一条用户消息到达后再刷新出真正的标题。
    record.titlePlaceholder = true;
    await renameSession(runtime, agent, MANAGER_PLACEHOLDER_TITLE);
  }
  await runtime.store.save();
  return {
    kind: 'success',
    text: '已进入派活模式（经理）。把需求告诉我，我会先总结，再派给工程师执行。',
  };
}

async function deactivateManager(runtime, agent, force) {
  const state = runtime.store.get();
  const pending = Object.values(state.tasks).filter(
    (task) => task.managerId === agent.id && (task.status === 'queued' || task.status === 'running'),
  );
  if (pending.length > 0 && !force) {
    return {
      kind: 'error',
      text: `还有 ${pending.length} 个未完成任务（${pending.map((task) => `#${task.taskId}`).join('、')}）。等它们完成，或用 /paihuo off force 强制取消。`,
    };
  }
  if (pending.length > 0) await runtime.tasks.cancelAllFor(agent.id, '关闭派活模式');

  // 由「派活」预设创建的会话（含会话内切换过来的）：先切回默认预设，
  // 否则标题/角色会被预设继续标记为经理。
  if (effectivePresetOf(runtime, agent) === MANAGER_PRESET_ID) {
    const presets = runtime.ctx.get('agentPresets');
    if (presets === undefined) {
      return { kind: 'error', text: '无法退出：当前组合没有 agentPresets 服务，请新建一个普通会话。' };
    }
    let target;
    try {
      target = (await presets.resolve())?.id;
    } catch (error) {
      return { kind: 'error', text: `无法读取默认预设：${describeError(error)}` };
    }
    if (typeof target !== 'string' || target === '' || target === MANAGER_PRESET_ID) target = 'standard';
    try {
      await presets.select(agent, target);
    } catch (error) {
      return { kind: 'error', text: `切换预设失败：${describeError(error)}（也可以新建一个普通会话）` };
    }
  }

  const record = state.managers[agent.id];
  delete state.managers[agent.id];
  runtime.scopes.get(agent.id)?.();
  await restoreManagerTitle(runtime, agent, record);
  await runtime.store.save();
  return {
    kind: 'success',
    text: force ? '已退出派活模式（未完成任务已取消）。' : '已退出派活模式。',
  };
}

function activateEngineer(runtime, agent, taskId) {
  const state = runtime.store.get();
  const engineer = state.engineers[agent.id];
  if (engineer === undefined) {
    return { kind: 'error', text: '该会话不是派活工程师（缺少工程师记录）。' };
  }
  const task = state.tasks[taskId];
  if (task === undefined || task.engineerId !== agent.id) {
    return { kind: 'error', text: '任务号与工程师不匹配。' };
  }
  installEngineerScope(runtime, agent);
  return { kind: 'success', text: `工程师已就绪（任务 #${task.taskId}）。` };
}

/** 把工程师会话恢复成普通会话：移除工程师记录、作用域与标题前缀。 */
async function releaseEngineerSession(runtime, agent) {
  const state = runtime.store.get();
  const engineer = state.engineers[agent.id];
  if (engineer === undefined) return { kind: 'error', text: '该会话不是派活工程师。' };
  if (engineer.activeTaskId !== undefined) {
    return { kind: 'error', text: '工程师仍在执行任务；先取消任务（/paihuo off force）再恢复。' };
  }
  if (Array.isArray(engineer.queue) && engineer.queue.length > 0) {
    return { kind: 'error', text: '工程师还有排队任务；先取消再恢复。' };
  }
  delete state.engineers[agent.id];
  runtime.scopes.get(agent.id)?.();
  const restore = stripRolePrefix(currentTitle(runtime, agent)) || '新会话';
  await renameSession(runtime, agent, restore);
  await runtime.store.save();
  return { kind: 'success', text: '已恢复为普通会话：工程师角色与标题前缀已移除。' };
}

/**
 * 挂载插件。
 *
 * @param {object} ctx 插件上下文。
 * @param {unknown} rawConfig Loader 行配置。
 */
export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig);

  let resolveReady;
  const ready = new Promise((resolvePromise) => {
    resolveReady = resolvePromise;
  });

  const runtime = {
    ctx,
    config,
    rawConfig,
    logger: ctx.logger,
    scopes: new Map(),
    turnWatch: new Map(),
    persistence: { mode: 'pending' },
    ready: () => ready,
    store: createStateStore(createEmptyState()),
    /** 会话角色：有效预设 > 命令投影 > 标题前缀 > 插件存储。 */
    roleOf(agent) {
      if (agent === undefined || agent === null || agent.session === undefined) return ROLE_NONE;
      let projection;
      try {
        projection = ctx.get('sessionProjections')?.stateOf(agent.session, PROJECTION_KEY);
      } catch {
        projection = undefined;
      }
      // 会话内切换过的预设优先于创建时的 header.agentPreset。
      const preset = typeof projection?.preset === 'string' && projection.preset !== ''
        ? projection.preset
        : agent.session.header?.agentPreset;
      if (preset === MANAGER_PRESET_ID) return ROLE_MANAGER;
      if (projection !== undefined && projection !== null && typeof projection.role === 'string') {
        return projection.role;
      }
      try {
        const snapshot = ctx.get('sessionTitle')?.get(agent.session);
        if (typeof snapshot?.title === 'string' && snapshot.title !== '') return roleFromTitle(snapshot.title);
      } catch {
        /* 标题不可用 */
      }
      const state = runtime.store.get();
      if (state.managers[agent.id] !== undefined) return ROLE_MANAGER;
      if (state.engineers[agent.id] !== undefined) return ROLE_ENGINEER;
      return ROLE_NONE;
    },
  };

  runtime.tasks = createTasks(runtime);
  runtime.todos = createTodos(runtime);

  // ── 浏览器读取待办（只读 Remote） ─────────────────────────────────────
  // typert 在 base 组合里始终可用；测试 harness 没有它时静默跳过，经理工具
  // 与持久状态仍然工作，只是 Web 面板会显示“不可用”。
  ctx.inject(['typert'], (typertCtx) => {
    try {
      // 与 pingshu 一致：Service 绑定在根上下文，manifest 在 typert 就绪的
      // 子上下文里注册，卸载时随 effect 回收。
      runtime.remote = new PaihuoRemote(ctx, runtime);
      typertCtx.effect(
        () => typertCtx.typert.register(MANIFEST),
        'paihuo: typert manifest',
      );
    } catch (error) {
      warn(ctx, `待办 Remote 注册失败：${describeError(error)}`);
    }
  });

  // ── 角色投影 ──────────────────────────────────────────────────────────
  ctx.inject(['sessionProjections'], (projectionCtx) => {
    projectionCtx.effect(
      () => projectionCtx.sessionProjections.register(paihuoProjection),
      'paihuo: role projection',
    );
  });

  // ── 持久化状态 ────────────────────────────────────────────────────────
  const storage = ctx.get('storageDomain');
  if (storage === undefined || storage === null) {
    runtime.persistence = { mode: 'memory' };
    resolveReady();
    warn(ctx, 'storageDomain 不可用，本次运行的派发状态只保存在内存中');
  } else {
    const opening = (async () => {
      let domain;
      try {
        domain = await storage.open({
          name: 'paihuo',
          version: 1,
          layout: 'single',
          invalidRecords: 'backup-and-skip',
          global: {
            schema: StateSchema,
            initial: createEmptyState(),
          },
          tables: {
            meta: { valueSchema: z.record(z.string(), z.unknown()) },
          },
        });
        const hydrated = hydrateState(domain.global.get());
        runtime.store.replace(hydrated.state);
        runtime.store.setWriter((snapshot) => domain.global.set(snapshot));
        runtime.persistence = { mode: 'domain', recovered: hydrated.recovered };
        if (hydrated.recovered) warn(ctx, '持久化状态校验失败，已回退为空状态');
        // 立刻落盘一次：既物化存储域，也能在启动时暴露写入问题。
        await runtime.store.save();
      } catch (error) {
        runtime.persistence = { mode: 'memory', error: describeError(error) };
        warn(ctx, `状态持久化不可用，本次运行只保存在内存：${describeError(error)}`);
      } finally {
        resolveReady();
      }
      return domain;
    })();
    ctx.effect(
      () => () => {
        void opening.then((domain) => domain?.close()).catch(() => {});
      },
      'paihuo: close state domain',
    );
  }

  // ── /paihuo 命令 ──────────────────────────────────────────────────────
  ctx.effect(
    () => ctx.commands.register({
      name: COMMAND_NAME,
      description: '派活模式：经理只沟通与派发，工程师执行任务',
      input: { hint: '[on|off [force]|status]', attachments: false },
      handler: async ({ agent, rawInput }) => {
        const parsed = parseCommandArgs(rawInput);
        try {
          await runtime.ready();
          if (parsed.kind === 'on') return await activateManager(runtime, agent);
          if (parsed.kind === 'off') {
            if (runtime.roleOf(agent) === ROLE_ENGINEER) return await releaseEngineerSession(runtime, agent);
            return await deactivateManager(runtime, agent, parsed.force);
          }
          if (parsed.kind === 'status') {
            return { kind: 'success', text: buildStatusText(runtime, agent, runtime.roleOf(agent)) };
          }
          if (parsed.kind === 'engineer') return activateEngineer(runtime, agent, parsed.taskId);
          return { kind: 'error', text: '用法：/paihuo on | off [force] | status' };
        } catch (error) {
          return { kind: 'error', text: `派活失败：${describeError(error)}` };
        }
      },
    }),
    'paihuo: command',
  );

  // ── 配置热更新与自带配置页 ────────────────────────────────────────────
  ctx.on('loader/volatile-update', () => {
    refreshConfig(runtime, rawConfig);
  });
  ctx.on('app-boot/config-reload', () => {
    refreshConfig(runtime, rawConfig);
  });
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.effect(
      () => settingsCtx.settings.configure({ auto: false }, ctx.fiber),
      'paihuo: settings presentation',
    );
  });

  // ── 代理生命周期 ──────────────────────────────────────────────────────
  const attach = (agent) => {
    try {
      const role = runtime.roleOf(agent);
      if (role === ROLE_MANAGER) {
        installManagerScope(runtime, agent);
        void runtime.ready()
          .then(() => ensureManagerSession(runtime, agent))
          .catch((error) => warn(ctx, `经理会话初始化失败：${describeError(error)}`));
      } else if (role === ROLE_ENGINEER) {
        installEngineerScope(runtime, agent);
      }
    } catch (error) {
      warn(ctx, `装配会话作用域失败：${describeError(error)}`);
    }
  };

  ctx.on('agent/created', ({ agent }) => {
    attach(agent);
    void runtime.ready()
      .then(() => runtime.tasks.flushPendingNotifications(agent.id))
      .catch(() => {});
  });

  // 会话创建后再切换 Agent 预设（例如在会话里把「标准模式」切成「派活模式」）：
  // header 不变，只追加 agent-preset/selected，必须在切换时立即装载/卸载经理作用域。
  ctx.on('agent-preset/selected', (sessionId, agentPreset) => {
    try {
      const agent = ctx.get('agents')?.get(sessionId);
      if (agent === undefined || agent === null) return;
      let commandRole;
      try {
        commandRole = ctx.get('sessionProjections')?.stateOf(agent.session, PROJECTION_KEY)?.role;
      } catch {
        commandRole = undefined;
      }
      const manager = agentPreset === MANAGER_PRESET_ID || commandRole === ROLE_MANAGER;
      if (manager) {
        installManagerScope(runtime, agent);
        void runtime.ready()
          .then(() => ensureManagerSession(runtime, agent))
          .catch((error) => warn(ctx, `切换预设后初始化经理失败：${describeError(error)}`));
      } else {
        void runtime.ready()
          .then(() => detachManager(runtime, agent))
          .catch((error) => warn(ctx, `切换预设后卸载经理失败：${describeError(error)}`));
      }
    } catch (error) {
      warn(ctx, `处理预设切换失败：${describeError(error)}`);
    }
  });

  ctx.on('agent/disposed', ({ agent }) => {
    runtime.turnWatch.delete(agent.id);
  });

  ctx.on('session/event', (session, event) => {
    try {
      // 自愈：插件重载或错过预设切换事件时，下一次开轮前补装经理作用域。
      if (event.type === 'turn/start' && !runtime.scopes.has(session.id)) {
        const agent = ctx.get('agents')?.get(session.id);
        if (agent !== undefined && runtime.roleOf(agent) === ROLE_MANAGER) attach(agent);
      }
      if (event.type === 'user/message') {
        // 占位标题（👔 经理）在第一条用户消息后刷新成“👔 经理 · 真实主题”。
        const state = runtime.store.get();
        const record = state.managers[session.id];
        if (record !== undefined && record.titlePlaceholder === true) {
          record.titlePlaceholder = false;
          void runtime.ready().then(async () => {
            const sessionTitle = ctx.get('sessionTitle');
            if (!sessionTitle || typeof sessionTitle.refresh !== 'function') return;
            try {
              await sessionTitle.refresh(session);
            } catch (error) {
              warn(ctx, `刷新经理标题失败：${describeError(error)}`);
            }
          }).catch(() => {});
        }
      }
      if (event.type === 'session/title') {
        const state = runtime.store.get();
        const record = state.managers[session.id];
        const title = typeof event.data?.title === 'string' ? event.data.title : '';
        if (record !== undefined && title !== '' && title !== MANAGER_PLACEHOLDER_TITLE && !title.startsWith('👔 经理 · ')) {
          const base = stripRolePrefix(title);
          record.baseTitle = base;
          record.titlePlaceholder = false;
          const target = managerTitle(base);
          try {
            ctx.get('sessionTitle')?.rename(session, target);
          } catch (error) {
            warn(ctx, `补齐经理标题失败：${describeError(error)}`);
          }
        }
      }
      runtime.tasks.handleSessionEvent(session, event);
    } catch (error) {
      warn(ctx, `处理会话事件失败：${describeError(error)}`);
    }
  });

  // ── 已存在的活动会话（插件热重载时） ─────────────────────────────────
  // 立即扫一遍；再延后一拍，等角色投影注册完成后再扫一遍（切换过预设的会话
  // 只能靠投影识别，投影没就绪时会被漏掉）。
  const attachLiveAgents = () => {
    for (const agent of ctx.get('agents')?.list?.() ?? []) attach(agent);
  };
  attachLiveAgents();
  const attachTimer = setTimeout(attachLiveAgents, 0);
  ctx.effect(() => () => clearTimeout(attachTimer), 'paihuo: attach live agents');

  ctx.effect(() => () => disposeAllScopes(runtime), 'paihuo: scopes');

  // ── 启动对账 ──────────────────────────────────────────────────────────
  void runtime.ready()
    .then(() => runtime.tasks.reconcile())
    .catch((error) => warn(ctx, `启动对账失败：${describeError(error)}`));
}

export { COMMAND_NAME, PROJECTION_KEY };
