/**
 * 任务派发、工位调度、完成回报。
 *
 * 所有对外操作（工具 / 命令 / 客户端）都走这里，界面与模型不各写一份逻辑。
 */

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import {
  backendOf,
  canDispatchTo,
  canStartTask,
  canSupervise,
  engineerTitle,
  formatModel,
  normalizeKey,
  orderQueued,
  runningCount,
  runningMainWorkspaceTask,
  sameModel,
  sandboxRank,
  shorten,
  workspaceModeOf,
} from './policy.js';
import { assertCodexCli, startCodexTurn } from './codex.js';
import { deliverToImSession } from './im.js';
import { buildCodexSupplementMessage, buildCodexTaskPrompt, buildReportMessage, buildSessionSupplementMessage, buildTaskPrompt, buildTodoCheckReminder } from './prompt.js';
import { nextTaskId, pruneTasks } from './state.js';
import { BACKEND_CODEX, BACKEND_SESSION, ROLE_MANAGER, TOOL_INTEGRATE, TOOL_TODO } from './wire.js';

function now() {
  return Date.now();
}

/** 运行 git 并返回 stdout；失败时抛出带 stderr 的错误。 */
function git(dir, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(
      'git',
      ['-C', dir, ...args],
      { windowsHide: true, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const detail = String(stderr ?? '').trim() || error.message;
          rejectPromise(new Error(detail));
          return;
        }
        resolvePromise(String(stdout ?? ''));
      },
    );
  });
}

/** 当前分支（分离头指针返回 null）。 */
async function detectBranch(dir) {
  try {
    const value = (await git(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
    return value === '' || value === 'HEAD' ? null : value;
  } catch {
    return null;
  }
}

async function detectCommit(dir) {
  try {
    return (await git(dir, ['rev-parse', 'HEAD'])).trim();
  } catch {
    return null;
  }
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function describeError(error) {
  if (error instanceof Error) return error.message;
  return String(error ?? '未知错误');
}

function logWarn(runtime, message) {
  try {
    runtime.logger?.warn?.(`[paihuo] ${message}`);
  } catch {
    /* 日志失败不影响业务 */
  }
}

function isCodexTask(task) {
  return backendOf(task) === BACKEND_CODEX;
}

function isCodexEngineer(engineer) {
  return backendOf(engineer) === BACKEND_CODEX;
}

function codexModelFor(runtime, engineer, requested) {
  if (typeof requested === 'string' && requested.trim() !== '') return requested.trim();
  if (engineer !== undefined && typeof engineer.codexModel === 'string' && engineer.codexModel !== '') {
    return engineer.codexModel;
  }
  const configured = runtime.config?.codexModel;
  return typeof configured === 'string' && configured !== '' ? configured : null;
}

function normalizeCodexModel(value) {
  const text = String(value ?? '').trim();
  if (text === '') return null;
  if (!/^[A-Za-z0-9._:/-]+$/.test(text)) {
    throw new Error('Codex model 含不支持的字符（只允许字母、数字、._:/-）');
  }
  return text;
}

/** Codex 模式的前置检查：CLI 必须存在且支持 resume。 */
function assertCodexAvailable(runtime) {
  if (runtime.config?.engineerBackend !== BACKEND_CODEX) return;
  assertCodexCli(runtime);
}

/** 把 Codex CLI 轮次结果转成任务报告。 */
function codexReport(result) {
  const stopReason = typeof result?.stopReason === 'string' ? result.stopReason : 'failed';
  const text = typeof result?.finalText === 'string' ? result.finalText.trim() : '';
  const diagnostic = typeof result?.diagnostic === 'string' ? result.diagnostic.trim() : '';
  const summary = text === '' ? '' : shorten(text, 4000);
  if (stopReason === 'completed' && summary !== '') {
    return { outcome: 'success', summary };
  }
  if (stopReason === 'aborted') {
    return {
      outcome: 'failed',
      summary: summary === '' ? 'Codex 运行被中止。' : summary,
      blockers: 'Codex 运行被中止。',
      reason: 'aborted',
    };
  }
  return {
    outcome: 'failed',
    summary: summary === '' ? 'Codex 运行失败。' : summary,
    blockers: diagnostic === '' ? 'Codex 运行失败（没有诊断信息）。' : diagnostic,
    reason: stopReason,
  };
}

/**
 * 为任务准备独立 worktree。会话工程师与 Codex 工程师共用这段逻辑；
 * 失败时写进 task.worktreeFailure，并退回主工作区。
 */
async function prepareTaskWorktree(runtime, task, engineer) {
  if (!task.useWorktree || !runtime.config.worktree) return;
  const branch = worktreeName(task);
  const root = dirname(task.projectPath);
  const checkoutPath = join(root, '.paihuo-worktrees', `${basename(task.projectPath)}-${task.taskId}`);
  try {
    await mkdir(dirname(checkoutPath), { recursive: true });
    await git(task.projectPath, [
      'worktree', 'add', '-b', branch, checkoutPath, task.baseBranch ?? 'HEAD',
    ]);
    const baseCommit = await detectCommit(checkoutPath);
    engineer.worktree = {
      path: checkoutPath,
      branch,
      ...(baseCommit === null ? {} : { baseCommit }),
      repositoryRoot: task.projectPath,
    };
  } catch (error) {
    // 失败原因写进任务，回执里直接告诉经理与用户，不再静默退回主工作区。
    task.worktreeFailure = describeError(error);
    logWarn(runtime, `worktree 创建失败，退回项目目录：${task.worktreeFailure}`);
  }
}

function textOf(message) {
  if (message === undefined || message === null) return '';
  const content = Array.isArray(message.content) ? message.content : [];
  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function roleOf(runtime, agent) {
  try {
    return runtime.roleOf(agent);
  } catch {
    return 'none';
  }
}

function requireManager(runtime, agent) {
  if (agent === undefined || agent === null) throw new Error('该工具需要一个发起会话');
  if (roleOf(runtime, agent) !== ROLE_MANAGER) {
    throw new Error('只有「派活」经理可以调用该工具；先用 /paihuo on 进入派活模式');
  }
}

function managerWorkingDirectory(runtime, session) {
  try {
    const directory = runtime.ctx.get('workingDirectory')?.get(session);
    if (typeof directory === 'string' && directory !== '') return directory;
  } catch {
    /* 回退到会话头 */
  }
  return session?.header?.cwd ?? '';
}

function sandboxModeOf(runtime, session) {
  try {
    const policy = runtime.ctx.get('sandboxPolicy');
    if (!policy) return null;
    return policy.resolve({ session }).mode;
  } catch {
    return null;
  }
}

function managerPresetName(runtime, agent) {
  const presets = runtime.ctx.get('permissionPresets');
  if (!presets) return null;
  let current;
  try {
    current = presets.current(agent.session);
  } catch {
    return null;
  }
  const valid = (name) => {
    if (typeof name !== 'string' || name === '' || name === 'custom') return false;
    try {
      presets.resolve(name);
      return true;
    } catch {
      return false;
    }
  };
  if (valid(current)) return current;
  if (runtime.config.engineerPermission !== null && valid(runtime.config.engineerPermission)) {
    return runtime.config.engineerPermission;
  }
  try {
    const fallback = presets.catalog()?.defaultPreset;
    if (valid(fallback)) return fallback;
  } catch {
    /* 无目录 */
  }
  return null;
}

async function resolveAgentWithRetry(runtime, sessionId) {
  const controller = runtime.ctx.get('sessionController');
  if (!controller) throw new Error('缺少 sessionController 服务');
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await controller.resolveAgent(sessionId);
    if (result?.agent !== undefined) return result.agent;
    lastError = result?.error;
    const code = String(lastError?.code ?? '');
    if (!/busy|writer|starting/i.test(code)) break;
    await delay(320 * (attempt + 1));
  }
  throw new Error(`无法激活工程师会话 ${sessionId}：${lastError?.code ?? 'unknown'}`);
}

async function ensureLiveSession(runtime, sessionId) {
  const live = runtime.ctx.sessions.get(sessionId);
  if (live !== undefined) return live;
  const agent = await resolveAgentWithRetry(runtime, sessionId);
  return agent.session;
}

async function admit(runtime, sessionId, text, mode) {
  const controller = runtime.ctx.get('sessionController');
  if (!controller) throw new Error('缺少 sessionController 服务');
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await controller.prompt(
        {
          requestId: randomUUID(),
          sessionId,
          mode,
          content: [{ type: 'text', text }],
        },
        AbortSignal.timeout(60_000),
      );
      if (result?.accepted === true) return;
      lastError = new Error('会话没有接受消息');
    } catch (error) {
      lastError = error;
      if (!/busy|writer|not-found|starting|conflict|session\//i.test(describeError(error))) break;
    }
    await delay(420 * (attempt + 1));
  }
  throw new Error(`向会话 ${sessionId} 发送消息失败：${describeError(lastError)}`);
}

async function resolveProjectPath(managerSandbox, managerCwd, requested) {
  const raw = typeof requested === 'string' && requested.trim() !== '' ? requested.trim() : managerCwd;
  if (raw === '') {
    throw new Error('无法确定项目目录：当前会话没有工作目录，请显式传入 project_path');
  }
  const absolute = resolve(raw);
  const info = await stat(absolute).catch(() => undefined);
  if (info === undefined || !info.isDirectory()) {
    throw new Error(`项目目录不存在或不是目录：${absolute}`);
  }
  if (!canDispatchTo(managerSandbox, managerCwd, absolute)) {
    throw new Error(`当前权限（${managerSandbox ?? '未知'}）只能派发到工作目录之内：${managerCwd}`);
  }
  return absolute;
}

function normalizeResources(runtime, value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error('resources 必须是数组');
  const allowed = runtime.config.serializedResources;
  const result = [];
  for (const entry of value) {
    const name = String(entry ?? '').trim().toLowerCase();
    if (name === '') continue;
    if (!allowed.includes(name)) {
      throw new Error(`未配置的串行资源：${name}。可用：${allowed.length === 0 ? '（无）' : allowed.join('、')}`);
    }
    if (!result.includes(name)) result.push(name);
  }
  return result;
}

async function resolveEngineerModel(runtime, agent, requested) {
  if (typeof requested === 'string' && requested.trim() !== '') {
    const value = requested.trim();
    const slash = value.indexOf('/');
    if (slash <= 0 || slash === value.length - 1) throw new Error('model 必须形如 provider/model');
    const provider = value.slice(0, slash);
    const model = value.slice(slash + 1);
    const configured = runtime.config.engineerModels;
    if (configured.length > 0 && !configured.some((entry) => entry.provider === provider && entry.model === model)) {
      throw new Error(`未配置该工程师模型：${value}。可选：${configured.map((entry) => `${entry.provider}/${entry.model}`).join('、')}`);
    }
    return { provider, model };
  }
  try {
    const config = agent.session.requestHeader?.()?.config;
    if (config && typeof config.provider === 'string' && typeof config.model === 'string') {
      return { provider: config.provider, model: config.model };
    }
  } catch {
    /* 无请求头 */
  }
  try {
    const catalog = await runtime.ctx.get('sessionController')?.modelCatalog();
    if (catalog?.default) return { provider: catalog.default.provider, model: catalog.default.model };
  } catch {
    /* 目录不可用 */
  }
  return null;
}

function engineerSandbox(runtime, engineer) {
  if (typeof engineer.permissionPreset === 'string') {
    try {
      const spec = runtime.ctx.get('permissionPresets')?.resolve(engineer.permissionPreset);
      if (spec?.sandbox) return spec.sandbox;
    } catch {
      /* 预设已不可用 */
    }
  }
  return 'workspace-write';
}

async function enforceSuperiorPermission(runtime, agent, engineer, managerSandbox) {
  if (canSupervise(managerSandbox, engineerSandbox(runtime, engineer))) return;
  const preset = managerPresetName(runtime, agent);
  if (preset === null) {
    throw new Error('该工程师权限高于经理，且无法自动降级（经理权限预设为 custom）');
  }
  const session = await ensureLiveSession(runtime, engineer.sessionId);
  runtime.ctx.get('permissionPresets')?.set(session, preset);
  engineer.permissionPreset = preset;
  await runtime.store.save();
}

function engineerWorkspaceMode(engineer) {
  return engineer?.worktree !== null && engineer?.worktree !== undefined ? 'worktree' : 'main';
}

function pickIdleEngineer(state, task) {
  // 只复用工作区模式匹配的工程师：主工作区任务不能落到 worktree 工程师，
  // worktree 任务也不能悄悄复用主工作区工程师（worktree 参数对复用无效）。
  const desired = task.workspaceMode === 'worktree' || task.workspaceMode === 'main'
    ? task.workspaceMode
    : null;
  const codexTask = isCodexTask(task);
  const candidates = Object.values(state.engineers).filter((engineer) => {
    if (engineer.managerId !== task.managerId) return false;
    if (codexTask ? !isCodexEngineer(engineer) : isCodexEngineer(engineer)) return false;
    if (engineer.projectKey !== task.projectKey) return false;
    if (engineer.status !== 'idle' || engineer.queue.length !== 0) return false;
    // 正在跑「经理补充」那一轮的工程师不算空闲：它是被对话占着的。
    if (engineer.supplement !== undefined) return false;
    if (codexTask) {
      const wanted = task.codexModel ?? null;
      const actual = engineer.codexModel ?? null;
      if (wanted !== null && actual !== null && wanted !== actual) return false;
    } else if (!(task.model === null || engineer.model === null || sameModel(engineer.model, task.model))) {
      return false;
    }
    return desired === null || engineerWorkspaceMode(engineer) === desired;
  });
  candidates.sort((left, right) => left.createdAt - right.createdAt);
  return candidates[0];
}

async function ensureWorkspace(runtime, projectPath) {
  const registry = runtime.ctx.get('workspaceRegistry');
  if (!registry) return undefined;
  try {
    const existing = await registry.resolveByPath(projectPath);
    if (existing) return existing;
    return await registry.create(projectPath, basename(projectPath));
  } catch (error) {
    logWarn(runtime, `工作区注册失败：${describeError(error)}`);
    return undefined;
  }
}

function worktreeName(task) {
  const slug = task.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return `paihuo/${task.taskId}${slug === '' ? '' : `-${slug}`}`;
}

async function createEngineer(runtime, task) {
  const controller = runtime.ctx.get('sessionController');
  if (!controller) throw new Error('缺少 sessionController 服务');
  const workspace = await ensureWorkspace(runtime, task.projectPath);
  const created = await controller.create(workspace ? { workspaceId: workspace.id } : { cwd: task.projectPath });
  const sessionId = created?.sessionId;
  if (typeof sessionId !== 'string' || sessionId === '') throw new Error('创建会话没有返回 sessionId');
  task.engineerCreated = true;

  const state = runtime.store.get();
  const managerAgent = runtime.ctx.get('agents')?.get(task.managerId) ?? await resolveAgentWithRetry(runtime, task.managerId);
  const preset = managerPresetName(runtime, managerAgent);

  const engineer = {
    sessionId,
    managerId: task.managerId,
    projectPath: task.projectPath,
    projectKey: task.projectKey,
    backend: BACKEND_SESSION,
    model: task.model,
    worktree: null,
    status: 'idle',
    queue: [],
    createdAt: now(),
  };
  if (workspace?.id !== undefined) engineer.workspaceId = workspace.id;
  if (preset !== null) engineer.permissionPreset = preset;
  state.engineers[sessionId] = engineer;
  task.engineerId = sessionId;
  await runtime.store.save();

  try {
    await controller.rename({ sessionId, title: engineerTitle(task.title, basename(task.projectPath)) });
  } catch (error) {
    logWarn(runtime, `工程师会话改名失败：${describeError(error)}`);
  }

  const agent = await resolveAgentWithRetry(runtime, sessionId);

  if (preset !== null) {
    const presets = runtime.ctx.get('permissionPresets');
    if (presets) {
      try {
        presets.set(agent.session, preset);
      } catch (error) {
        logWarn(runtime, `工程师权限设置失败：${describeError(error)}`);
      }
    }
  }

  await prepareTaskWorktree(runtime, task, engineer);
  if (engineer.worktree !== null) {
    const workingDirectory = runtime.ctx.get('workingDirectory');
    if (workingDirectory && typeof workingDirectory.set === 'function') {
      try {
        await workingDirectory.set(agent, engineer.worktree.path);
      } catch (error) {
        logWarn(runtime, `工程师工作目录设置失败：${describeError(error)}`);
      }
    }
  }
  task.workspaceMode = engineerWorkspaceMode(engineer);

  const commands = runtime.ctx.get('commands');
  if (!commands) throw new Error('缺少 commands 服务，无法登记工程师角色');
  const execution = await commands.execute(agent, `/paihuo engineer ${task.taskId}`, [], AbortSignal.timeout(30_000));
  if (execution === undefined) throw new Error('内部命令 /paihuo engineer 未注册');
  if (execution.result?.kind !== 'success') {
    throw new Error(execution.result?.text ?? '工程师角色登记失败');
  }

  await runtime.store.save();
  return engineer;
}

/**
 * 创建一个 Codex 工程师记录。CLI 进程在 startTask 里启动；
 * 这里先把 worktree 和工作目录准备好，并给一个稳定 id。
 */
async function createCodexEngineer(runtime, task) {
  const state = runtime.store.get();
  const engineerId = `codex-${task.taskId}`;
  const engineer = {
    sessionId: engineerId,
    managerId: task.managerId,
    projectPath: task.projectPath,
    projectKey: task.projectKey,
    backend: BACKEND_CODEX,
    model: null,
    ...(task.codexModel === undefined ? {} : { codexModel: task.codexModel }),
    worktree: null,
    status: 'idle',
    queue: [],
    createdAt: now(),
  };
  await prepareTaskWorktree(runtime, task, engineer);
  task.engineerCreated = true;
  task.engineerId = engineerId;
  if (engineer.worktree !== null) task.worktree = engineer.worktree;
  task.workspaceMode = engineerWorkspaceMode(engineer);
  state.engineers[engineerId] = engineer;
  await runtime.store.save();
  return engineer;
}

async function lastAssistantText(runtime, sessionId) {
  const session = runtime.ctx.sessions.get(sessionId);
  if (session !== undefined) {
    try {
      const messages = session.deriveMessages();
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index]?.role === 'assistant') {
          const text = textOf(messages[index]);
          if (text !== '') return shorten(text, 2000);
        }
      }
    } catch {
      /* 回退到持久化事件 */
    }
  }
  try {
    const inspection = await runtime.ctx.get('sessionController')?.inspect(sessionId);
    const events = inspection?.events ?? [];
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (event.type === 'assistant/message') {
        const text = textOf(event.data?.message);
        if (text !== '') return shorten(text, 2000);
      }
    }
  } catch {
    /* 无法读取 */
  }
  return '';
}

async function notifyManager(runtime, task, engineer) {
  if (task.status === 'cancelled') return;
  try {
    await admit(runtime, task.managerId, buildReportMessage(task, engineer), 'queue');
    task.notifiedAt = now();
    delete task.notifyPending;
  } catch (error) {
    task.notifyPending = true;
    logWarn(runtime, `任务 ${task.taskId} 的回报未能送达经理：${describeError(error)}`);
  }
  await runtime.store.save();
}

async function finalizeTask(runtime, task, engineer, reason) {
  if (task.status !== 'running') return;
  if (task.report === undefined) {
    const text = await lastAssistantText(runtime, engineer.sessionId);
    task.report = {
      outcome: reason?.kind === 'completed' ? 'success' : 'failed',
      summary: text === '' ? '（没有可提取的最终回复）' : text,
      unreported: true,
      reason: reason?.kind ?? 'unknown',
    };
  } else if (task.report.reason === undefined && reason?.kind !== undefined) {
    task.report.reason = reason.kind;
  }
  task.status = task.report.outcome === 'success'
    ? 'done'
    : (task.report.outcome === 'blocked' ? 'blocked' : 'failed');
  task.endedAt = now();
  engineer.status = 'idle';
  delete engineer.activeTaskId;
  engineer.queue = engineer.queue.filter((id) => id !== task.taskId);
  runtime.turnWatch.delete(engineer.sessionId);
  pruneTasks(runtime.store.get(), 200);
  await runtime.store.save();
  await notifyManager(runtime, task, engineer);
  await pump(runtime);
}

async function failTask(runtime, task, engineer, reason) {
  if (task.status !== 'running' && task.status !== 'queued') return;
  task.status = 'failed';
  task.endedAt = now();
  task.report = { outcome: 'failed', summary: reason, unreported: true, reason: 'dispatch-failed' };
  if (engineer !== undefined) {
    engineer.status = 'idle';
    delete engineer.activeTaskId;
    engineer.queue = engineer.queue.filter((id) => id !== task.taskId);
    if (isCodexEngineer(engineer)) runtime.engineerMessages.delete(engineer.sessionId);
  }
  runtime.runs.delete(task.taskId);
  await runtime.store.save();
  await notifyManager(runtime, task, engineer);
  await pump(runtime);
}

function takeEngineerMessages(runtime, engineerId) {
  const list = runtime.engineerMessages.get(engineerId) ?? [];
  runtime.engineerMessages.delete(engineerId);
  return list;
}

function combineEngineerMessages(messages) {
  return messages
    .map((entry) => `【经理补充】\n${entry.text}`)
    .join('\n\n');
}

/**
 * 为某个 Codex 工程师跑一轮 CLI，并把 JSONL 事件写进转录。
 *
 * @returns {Promise<object>} startCodexTurn 的结果。
 */
async function runCodexTurnForEngineer(runtime, engineer, prompt, label, runKey) {
  const cwd = engineer.worktree?.path ?? engineer.projectPath;
  const model = codexModelFor(runtime, engineer);
  runtime.codexUi.recordUser(engineer, prompt, label);
  const commands = new Map();
  const turn = startCodexTurn(runtime, {
    cwd,
    prompt,
    sessionId: engineer.codexSessionId,
    model,
    onEvent: (event) => {
      if (event.type === 'thread' && typeof event.threadId === 'string' && event.threadId !== '') {
        engineer.codexSessionId = event.threadId;
      } else if (event.type === 'message') {
        runtime.codexUi.recordAssistant(engineer, event.text);
      } else if (event.type === 'command-start') {
        const entryId = runtime.codexUi.startCommand(engineer, event.command);
        if (event.itemId !== '') commands.set(event.itemId, entryId);
      } else if (event.type === 'command-end') {
        const entryId = commands.get(event.itemId) ?? runtime.codexUi.startCommand(engineer, event.command);
        commands.delete(event.itemId);
        runtime.codexUi.finishCommand(engineer, entryId, {
          output: event.output,
          exitCode: event.exitCode,
          status: event.status,
        });
      } else if (event.type === 'error') {
        runtime.codexUi.recordError(engineer, event.message);
      } else if (event.type === 'file-change') {
        runtime.codexUi.recordNote(engineer, 'Codex 修改了文件。');
      }
    },
  });
  const run = { cancel: turn.cancel, engineerId: engineer.sessionId };
  runtime.runs.set(runKey, run);
  try {
    const result = await turn.promise;
    if (result.sessionId !== null && result.sessionId !== undefined && result.sessionId !== '') {
      engineer.codexSessionId = result.sessionId;
    }
    return result;
  } finally {
    if (runtime.runs.get(runKey) === run) runtime.runs.delete(runKey);
  }
}

async function finalizeCodexTask(runtime, task, engineer, result) {
  if (runtime.disposed) return;
  if (task.status !== 'running') return;
  const report = codexReport(result);
  const worktree = engineer?.worktree ?? task.worktree ?? null;
  if (worktree) {
    report.branch = worktree.branch;
    try {
      const commit = await detectCommit(worktree.path);
      if (commit !== null && commit !== worktree.baseCommit) report.commit = commit;
      if (report.outcome === 'success') {
        const status = (await git(worktree.path, ['status', '--porcelain=v1', '-uno'])).trim();
        if (status !== '') {
          report.outcome = 'blocked';
          report.blockers = [
            report.blockers,
            'Codex 结束时 worktree 里仍有未提交的已跟踪改动；请检查并提交后再合并。',
          ].filter(Boolean).join('\n');
        }
      }
    } catch (error) {
      logWarn(runtime, `检查 Codex worktree 失败：${describeError(error)}`);
    }
  }
  task.report = report;
  task.status = report.outcome === 'success' ? 'done' : (report.outcome === 'blocked' ? 'blocked' : 'failed');
  task.endedAt = now();
  if (engineer !== undefined) {
    engineer.status = 'idle';
    delete engineer.activeTaskId;
    engineer.queue = engineer.queue.filter((id) => id !== task.taskId);
    runtime.engineerMessages.delete(engineer.sessionId);
    if (engineer.codexSessionId !== undefined) task.codexSessionId = engineer.codexSessionId;
    if (engineer.codexModel !== undefined) task.codexModel = engineer.codexModel;
  }
  pruneTasks(runtime.store.get(), 200);
  await runtime.store.save();
  await notifyManager(runtime, task, engineer);
  await pump(runtime);
}

/** 任务轮次循环：首轮 → 处理经理补充 → 结算。 */
async function runCodexTaskLoop(runtime, task, engineer) {
  let result = await runCodexTurnForEngineer(
    runtime,
    engineer,
    buildCodexTaskPrompt(task, engineer),
    `任务 #${task.taskId}`,
    task.taskId,
  );
  if (runtime.disposed || task.status !== 'running') return;
  if (engineer.codexSessionId !== undefined) task.codexSessionId = engineer.codexSessionId;
  await runtime.store.save();

  while (task.status === 'running' && result.stopReason !== 'failed') {
    const messages = takeEngineerMessages(runtime, engineer.sessionId);
    if (messages.length === 0) break;
    result = await runCodexTurnForEngineer(
      runtime,
      engineer,
      combineEngineerMessages(messages),
      '经理补充',
      task.taskId,
    );
    if (runtime.disposed || task.status !== 'running') return;
    if (engineer.codexSessionId !== undefined) task.codexSessionId = engineer.codexSessionId;
    await runtime.store.save();
  }

  await finalizeCodexTask(runtime, task, engineer, result);
}

/** 启动 Codex 任务；进程在后台跑，不阻塞经理本轮。 */
function startCodexTaskTurn(runtime, task, engineer) {
  try {
    assertCodexAvailable(runtime);
  } catch (error) {
    void failTask(runtime, task, engineer, `Codex 不可用：${describeError(error)}`);
    return 'failed';
  }
  const model = codexModelFor(runtime, engineer, task.codexModel);
  if (model !== null) {
    engineer.codexModel = model;
    task.codexModel = model;
  }
  void runCodexTaskLoop(runtime, task, engineer).catch((error) => {
    if (runtime.disposed) return;
    void failTask(runtime, task, engineer, `Codex 执行失败：${describeError(error)}`);
  });
  return 'started';
}

/**
 * 对空闲 Codex 工程师执行一条补充消息（没有任务台账条目）。
 * 回复以【派活系统补充回复】送回经理。
 */
async function runCodexSupplement(runtime, engineer, text) {
  const runKey = `supplement:${engineer.sessionId}`;
  const result = await runCodexTurnForEngineer(
    runtime,
    engineer,
    `【经理补充】\n${text}`,
    '经理补充',
    runKey,
  );
  if (runtime.disposed) return;
  engineer.status = 'idle';
  if (engineer.codexSessionId !== undefined) await runtime.store.save();
  const summary = typeof result.finalText === 'string' && result.finalText.trim() !== ''
    ? shorten(result.finalText.trim(), 4000)
    : (result.diagnostic || 'Codex 没有返回内容。');
  try {
    await admit(runtime, engineer.managerId, buildCodexSupplementMessage(engineer, summary), 'queue');
  } catch (error) {
    logWarn(runtime, `Codex 补充回复未能送达经理：${describeError(error)}`);
  }
  await pump(runtime);
}

async function startTask(runtime, task, engineer) {
  const state = runtime.store.get();
  task.engineerId = engineer.sessionId;
  task.workspaceMode = engineerWorkspaceMode(engineer);
  task.status = 'running';
  task.startedAt = now();
  delete task.turn;
  if (task.model !== null) engineer.model = task.model;
  engineer.status = 'running';
  engineer.activeTaskId = task.taskId;
  engineer.queue = engineer.queue.filter((id) => id !== task.taskId);
  await runtime.store.save();

  if (isCodexEngineer(engineer)) return startCodexTaskTurn(runtime, task, engineer);

  const session = runtime.ctx.sessions.get(engineer.sessionId);
  runtime.turnWatch.set(engineer.sessionId, {
    taskId: task.taskId,
    fromSeq: session?.seq ?? 0,
  });

  try {
    await admit(runtime, engineer.sessionId, buildTaskPrompt(task, engineer), 'queue');
  } catch (error) {
    await failTask(runtime, task, engineer, `派发消息失败：${describeError(error)}`);
  }
  return 'started';
}

let pumping = false;
let pumpRequested = false;

async function pumpOnce(runtime) {
  for (let guard = 0; guard < 64; guard += 1) {
    const state = runtime.store.get();
    const queued = orderQueued(state.tasks);
    if (queued.length === 0) return;
    let progressed = false;
    for (const task of queued) {
      let engineer;
      if (task.engineerId !== null) {
        engineer = state.engineers[task.engineerId];
        if (engineer === undefined) {
          task.engineerId = null;
          engineer = task.forceNew === true ? undefined : pickIdleEngineer(state, task);
        } else if (engineer.status !== 'idle') {
          continue;
        }
      } else if (task.forceNew !== true) {
        engineer = pickIdleEngineer(state, task);
      }

      // 容量按“实际工作区模式”判定：复用工程师时沿用其现有 worktree/主工作区，
      // worktree 创建失败则退回主工作区，不能让两个任务同时改同一份工作区。
      const plannedMode = engineer !== undefined
        ? engineerWorkspaceMode(engineer)
        : (task.useWorktree ? 'worktree' : 'main');
      const capacity = canStartTask({
        tasks: state.tasks,
        projectKey: task.projectKey,
        resources: task.resources,
        workstationsPerProject: runtime.config.workstationsPerProject,
        totalWorkstations: runtime.config.totalWorkstations,
        workspaceMode: plannedMode,
      });
      if (!capacity.ok) continue;

      const reused = engineer !== undefined && task.engineerCreated !== true;
      if (engineer === undefined) {
        try {
          engineer = isCodexTask(task)
            ? await createCodexEngineer(runtime, task)
            : await createEngineer(runtime, task);
        } catch (error) {
          await failTask(runtime, task, undefined, `创建工程师失败：${describeError(error)}`);
          progressed = true;
          break;
        }
      }

      const actualMode = engineerWorkspaceMode(engineer);
      if (actualMode !== plannedMode) {
        const recheck = canStartTask({
          tasks: state.tasks,
          projectKey: task.projectKey,
          resources: task.resources,
          workstationsPerProject: runtime.config.workstationsPerProject,
          totalWorkstations: runtime.config.totalWorkstations,
          workspaceMode: actualMode,
        });
        if (!recheck.ok) {
          // 例如 worktree 创建失败后需要退回主工作区，但主工作区正被占用。
          task.workspaceMode = actualMode;
          task.engineerReused = reused || undefined;
          engineer.status = 'idle';
          delete engineer.activeTaskId;
          await runtime.store.save();
          progressed = true;
          break;
        }
      }

      task.engineerReused = reused || task.engineerReused;
      const started = await startTask(runtime, task, engineer);
      progressed = true;
      if (started === 'deferred') return;
      break;
    }
    if (!progressed) return;
  }
}

/** 调度泵：单飞 + 合并请求，避免并发派发冲爆工位。 */
async function pump(runtime) {
  pumpRequested = true;
  if (pumping) return;
  pumping = true;
  try {
    while (pumpRequested) {
      pumpRequested = false;
      await pumpOnce(runtime);
    }
  } catch (error) {
    logWarn(runtime, `调度失败：${describeError(error)}`);
  } finally {
    pumping = false;
  }
}

function queuePosition(runtime, task) {
  if (task.status !== 'queued') return 0;
  const queued = orderQueued(runtime.store.get().tasks);
  const index = queued.findIndex((entry) => entry.taskId === task.taskId);
  return index === -1 ? 0 : index + 1;
}

function taskSummary(task) {
  return {
    task_id: task.taskId,
    title: task.title,
    status: task.status,
    backend: backendOf(task),
    engineer: task.engineerId,
    project: task.projectPath,
    priority: task.priority,
    resources: task.resources,
    model: backendOf(task) === BACKEND_CODEX
      ? (task.codexModel ?? 'codex')
      : formatModel(task.model),
    created_at: task.createdAt,
    ended_at: task.endedAt ?? null,
    result: task.report?.summary ?? null,
    outcome: task.report?.outcome ?? null,
  };
}

async function dispatch(runtime, agent, args) {
  requireManager(runtime, agent);
  const state = runtime.store.get();
  const session = agent.session;
  const managerCwd = managerWorkingDirectory(runtime, session);
  const managerSandbox = sandboxModeOf(runtime, session);

  const title = String(args.title ?? '').trim();
  const brief = String(args.brief ?? '').trim();
  if (title === '') throw new Error('title 不能为空');
  if (brief === '') throw new Error('brief 不能为空；请写清目标、范围与验收标准');

  const projectPath = await resolveProjectPath(managerSandbox, managerCwd, args.project_path);
  const projectKey = normalizeKey(projectPath);
  const configuredBackend = runtime.config.engineerBackend === BACKEND_CODEX
    ? BACKEND_CODEX
    : BACKEND_SESSION;

  // 复用工程师必须先把工程师解析出来：worktree 参数对复用无效，
  // worktree_reason 也只对“新建工程师 + 关闭 worktree”强制。
  let engineer;
  if (typeof args.engineer === 'string' && args.engineer.trim() !== '') {
    engineer = state.engineers[args.engineer.trim()];
    if (engineer === undefined) throw new Error(`不是本插件登记的工程师会话：${args.engineer}`);
    if (engineer.managerId !== agent.id) throw new Error('该工程师不属于当前经理');
    if (engineer.queue.length >= runtime.config.maxEngineerQueue) {
      throw new Error(`该工程师排队已满（上限 ${runtime.config.maxEngineerQueue}）`);
    }
  }
  const backend = engineer === undefined ? configuredBackend : backendOf(engineer);
  if (backend === BACKEND_CODEX) assertCodexAvailable(runtime);

  const model = backend === BACKEND_CODEX
    ? normalizeCodexModel(args.model) ?? (engineer?.codexModel ?? normalizeCodexModel(runtime.config.codexModel))
    : await resolveEngineerModel(runtime, agent, args.model);
  const codexModel = backend === BACKEND_CODEX ? model : null;
  const sessionModel = backend === BACKEND_CODEX ? null : model;
  const resources = normalizeResources(runtime, args.resources);

  if (engineer !== undefined && backend === BACKEND_SESSION) {
    await enforceSuperiorPermission(runtime, agent, engineer, managerSandbox);
  }
  const reuse = engineer !== undefined;

  const requestedWorktree = reuse
    ? engineerWorkspaceMode(engineer) === 'worktree'
    : (typeof args.worktree === 'boolean' ? args.worktree : runtime.config.worktree);
  const worktreeReason = String(args.worktree_reason ?? '').trim();
  if (!reuse && requestedWorktree === false && runtime.config.worktree && worktreeReason === '') {
    throw new Error(
      '关闭 worktree 需要给出 worktree_reason：例如「只读分析/出报告，不写文件」或「必须读取主工作区未提交改动」。'
      + '会改代码、或需要与其它工程师并行时请使用默认的独立 worktree。',
    );
  }
  const baseBranch = String(args.base_branch ?? '').trim() || await detectBranch(projectPath);
  const baseCommit = await detectCommit(projectPath);

  const task = {
    taskId: nextTaskId(state),
    managerId: agent.id,
    engineerId: engineer === undefined ? null : engineer.sessionId,
    title: shorten(title, 60),
    brief,
    projectPath,
    projectKey,
    backend,
    model: sessionModel,
    ...(backend === BACKEND_CODEX && codexModel !== null ? { codexModel } : {}),
    priority: args.priority === 'urgent' ? 'urgent' : 'normal',
    resources,
    useWorktree: requestedWorktree,
    workspaceMode: reuse ? engineerWorkspaceMode(engineer) : (requestedWorktree ? 'worktree' : 'main'),
    ...(reuse ? { engineerReused: true } : {}),
    ...(requestedWorktree || reuse ? {} : { worktreeReason }),
    baseBranch,
    baseCommit,
    status: 'queued',
    createdAt: now(),
  };
  if (engineer === undefined && args.reuse !== 'auto') task.forceNew = true;
  state.tasks[task.taskId] = task;
  if (engineer !== undefined) engineer.queue.push(task.taskId);
  await runtime.store.save();

  await pump(runtime);

  const current = runtime.store.get().tasks[task.taskId] ?? task;
  const assigned = current.engineerId === null ? undefined : runtime.store.get().engineers[current.engineerId];
  const position = queuePosition(runtime, current);
  const worktreeBranch = assigned?.worktree?.branch ?? current.worktree?.branch ?? null;
  const statusText = current.status === 'running'
    ? '已开工'
    : current.status === 'queued'
      ? `排队中${position > 0 ? `（第 ${position} 位）` : ''}`
      : current.status;
  const codexTask = isCodexTask(current);

  const lines = [
    `任务 #${current.taskId}「${current.title}」${statusText}。`,
    `- ${codexTask ? '执行者' : '工程师'}：${codexTask ? `Codex 工程师${current.engineerId ? ` ${current.engineerId}` : '（待分配）'}` : (current.engineerId ?? '（待分配）')}`,
    `- 项目：${current.projectPath}`,
    `- 模型：${codexTask ? (current.codexModel ?? 'Codex（原生默认）') : formatModel(current.model)}`,
  ];
  if (current.resources.length > 0) lines.push(`- 串行资源：${current.resources.join('、')}`);
  if (current.baseBranch !== null && current.baseBranch !== undefined) {
    lines.push(`- 基线分支：${current.baseBranch}`);
  }
  if (worktreeBranch !== null) {
    lines.push(`- 工作区：独立 worktree，分支 ${worktreeBranch}`);
  } else if (current.worktreeFailure !== undefined) {
    lines.push(`- 工作区：worktree 创建失败（${current.worktreeFailure}），已退回主工作区`);
  } else if (current.engineerReused === true) {
    lines.push(`- 工作区：主工作区（复用工程师 ${current.engineerId} 的现有工作目录）`);
  } else if (current.useWorktree) {
    lines.push('- 工作区：独立 worktree（开工时创建）');
  } else {
    lines.push(`- 工作区：主工作区${current.worktreeReason ? `（理由：${current.worktreeReason}）` : ''}`);
  }
  if (reuse && args.worktree === true && engineer !== undefined && engineer.worktree === null) {
    lines.push('- 提示：复用工程师不会新建 worktree，任务在主工作区执行。');
  }
  if (reuse && args.worktree === false && engineer?.worktree) {
    lines.push(`- 注意：复用工程师时 worktree 参数不生效，任务仍在分支 ${engineer.worktree.branch} 的 worktree 中执行。`);
  }
  if (current.status === 'queued' && workspaceModeOf(current) === 'main') {
    const busy = runningMainWorkspaceTask(runtime.store.get().tasks, current.projectKey);
    if (busy !== undefined && busy.taskId !== current.taskId) {
      lines.push(`- 等待原因：主工作区正被 #${busy.taskId} 占用`);
    }
  }
  lines.push('', '本轮无需等待；工程师完成后会自动回报到本会话。');

  return {
    shape: 'dispatched',
    title: `已派发 #${current.taskId}`,
    task_id: current.taskId,
    backend: backendOf(current),
    engineer: current.engineerId,
    status: current.status,
    queue_position: position,
    project: current.projectPath,
    model: codexTask ? (current.codexModel ?? 'codex') : formatModel(current.model),
    resources: current.resources,
    worktree: worktreeBranch,
    text: lines.join('\n'),
  };
}

function listEngineers(runtime, agent) {
  requireManager(runtime, agent);
  const state = runtime.store.get();
  const engineers = Object.values(state.engineers).filter((engineer) => engineer.managerId === agent.id);
  const rows = engineers.map((engineer) => {
    const active = engineer.activeTaskId === undefined ? undefined : state.tasks[engineer.activeTaskId];
    return {
      session_id: engineer.sessionId,
      backend: backendOf(engineer),
      codex_session: engineer.codexSessionId ?? null,
      one_shot: false,
      project: engineer.projectPath,
      status: engineer.status,
      active_task: active === undefined ? null : { task_id: active.taskId, title: active.title },
      queued: engineer.queue.length,
      model: isCodexEngineer(engineer) ? (engineer.codexModel ?? 'codex') : formatModel(engineer.model),
      permission: engineer.permissionPreset ?? null,
      worktree: engineer.worktree?.branch ?? null,
      path: engineer.worktree?.path ?? engineer.projectPath,
    };
  });
  const lines = rows.length === 0
    ? ['还没有工程师；下一次派发会自动创建。']
    : rows.map((row) => [
      `- ${row.session_id}｜${basename(row.project)}｜${row.backend === 'codex' ? 'Codex 工程师（可复用）' : '会话工程师'}｜${row.status === 'running' ? `运行中 #${row.active_task?.task_id ?? ''} ${row.active_task?.title ?? ''}` : '空闲'}｜排队 ${row.queued}｜模型 ${row.model}${row.backend === 'codex' && row.codex_session ? `｜会话 ${row.codex_session}` : ''}${row.worktree === null ? '' : `｜分支 ${row.worktree}`}`,
    ].join(''));
  return {
    shape: 'engineers',
    title: `执行者（${rows.length}）`,
    engineers: rows,
    text: [`执行者（${rows.length}）：`, ...lines].join('\n'),
  };
}

function listTasks(runtime, agent, args) {
  requireManager(runtime, agent);
  const state = runtime.store.get();
  const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
  const status = typeof args.status === 'string' ? args.status : undefined;
  const engineer = typeof args.engineer === 'string' ? args.engineer : undefined;
  const tasks = Object.values(state.tasks)
    .filter((task) => task.managerId === agent.id)
    .filter((task) => status === undefined || task.status === status)
    .filter((task) => engineer === undefined || task.engineerId === engineer)
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, limit)
    .map(taskSummary);
  const lines = tasks.length === 0
    ? ['没有符合条件的任务。']
    : tasks.map((task) => `- #${task.task_id} ${task.status}${task.backend === 'codex' ? '｜codex' : ''}｜${task.title}｜${task.engineer ?? '待分配'}｜${task.outcome ?? ''}`);
  return {
    shape: 'tasks',
    title: `任务（${tasks.length}）`,
    tasks,
    text: [`任务（${tasks.length}）：`, ...lines].join('\n'),
  };
}

function getTask(runtime, agent, args) {
  requireManager(runtime, agent);
  const task = runtime.store.get().tasks[String(args.task_id ?? '').trim()];
  if (task === undefined) throw new Error(`任务不存在：${args.task_id}`);
  if (task.managerId !== agent.id) throw new Error('该任务不属于当前经理');
  const report = task.report;
  const includeBrief = args.include_brief === true;
  const codexTask = isCodexTask(task);
  const lines = [
    `任务 #${task.taskId}「${task.title}」`,
    `- 状态：${task.status}`,
    `- 后端：${codexTask ? 'Codex 工程师（CLI）' : '会话工程师'}`,
    `- ${codexTask ? '执行者' : '工程师'}：${task.engineerId ?? '（待分配）'}`,
    `- 项目：${task.projectPath}`,
    `- 模型：${codexTask ? (task.codexModel ?? 'Codex（原生默认）') : formatModel(task.model)}`,
    ...(codexTask && task.codexSessionId ? [`- Codex 会话：${task.codexSessionId}`] : []),
    `- 优先级：${task.priority}`,
    task.resources.length > 0 ? `- 串行资源：${task.resources.join('、')}` : '',
    '',
    includeBrief ? '## 任务说明' : '（任务说明已省略；需要时传 include_brief: true）',
  ];
  if (includeBrief) lines.push(task.brief);
  if (report !== undefined) {
    lines.push(
      '',
      codexTask ? '## Codex 执行报告' : '## 工程师报告',
      `- 结果：${report.outcome}${!codexTask && report.unreported ? '（未显式报告）' : ''}`,
      `- 摘要：${report.summary}`,
      report.changes !== undefined && report.changes.length > 0 ? `- 改动：${report.changes.join('、')}` : '',
      report.tests !== undefined && report.tests !== '' ? `- 测试：${report.tests}` : '',
      report.blockers !== undefined && report.blockers !== '' ? `- 阻塞：${report.blockers}` : '',
    );
  }
  return {
    shape: 'task',
    title: `任务 #${task.taskId}`,
    task: taskSummary(task),
    brief: task.brief,
    report: report ?? null,
    text: lines.filter((line) => line !== '').join('\n'),
  };
}

async function messageEngineer(runtime, agent, args) {
  requireManager(runtime, agent);
  const engineer = runtime.store.get().engineers[String(args.engineer ?? '').trim()];
  if (engineer === undefined) throw new Error(`未知工程师会话：${args.engineer}`);
  if (engineer.managerId !== agent.id) throw new Error('该工程师不属于当前经理');
  const message = String(args.message ?? '').trim();
  if (message === '') throw new Error('message 不能为空');
  const mode = args.mode === 'steer' ? 'steer' : 'queue';

  if (isCodexEngineer(engineer)) {
    const active = engineer.activeTaskId === undefined ? undefined : runtime.store.get().tasks[engineer.activeTaskId];
    if (active !== undefined && active.status === 'running') {
      const pending = runtime.engineerMessages.get(engineer.sessionId) ?? [];
      pending.push({ text: message, mode });
      runtime.engineerMessages.set(engineer.sessionId, pending);
      if (mode === 'steer') {
        const run = runtime.runs.get(active.taskId);
        try {
          run?.cancel?.();
        } catch {
          /* 进程可能已退出 */
        }
      }
      return {
        shape: 'message',
        title: mode === 'steer' ? '已请求中断并追加' : '已排队',
        engineer: engineer.sessionId,
        mode,
        text: mode === 'steer'
          ? `已请求中断任务 #${active.taskId} 的当前 Codex 轮次，随后用同一会话送达补充消息；若会话无法恢复会报告失败，请重新派发。`
          : `补充消息已排队，当前 Codex 轮次结束后会用同一会话送达（任务 #${active.taskId}）。`,
      };
    }
    if (engineer.queue.length > 0) {
      throw new Error('该 Codex 工程师还有排队任务；先取消排队任务，或等任务开始后再追加消息。');
    }
    if (runtime.runs.has(`supplement:${engineer.sessionId}`)) {
      throw new Error('该 Codex 工程师正在处理上一条补充消息；等它完成后再发送。');
    }
    engineer.status = 'running';
    await runtime.store.save();
    void runCodexSupplement(runtime, engineer, message).catch(async (error) => {
      if (runtime.disposed) return;
      engineer.status = 'idle';
      await runtime.store.save();
      try {
        await admit(runtime, engineer.managerId, buildCodexSupplementMessage(engineer, `补充消息执行失败：${describeError(error)}`), 'queue');
      } catch {
        /* 送达失败已记录 */
      }
      await pump(runtime);
    });
    return {
      shape: 'message',
      title: '已送达',
      engineer: engineer.sessionId,
      mode,
      text: `已用同一 Codex 会话开始一轮补充执行；回复会回到本会话。`,
    };
  }

  const state = runtime.store.get();
  const active = engineer.activeTaskId === undefined ? undefined : state.tasks[engineer.activeTaskId];
  const prefix = active === undefined ? '【经理补充】' : `【经理补充 · 任务 #${active.taskId}】`;
  await admit(runtime, engineer.sessionId, `${prefix}\n${message}`, mode);
  // 空闲工程师没有任务台账：登记一条待回报记录，等这一轮结束时把回复送回经理。
  // 有任务在跑时不用登记，任务结束会按任务回报。
  if (active === undefined) {
    markSupplementSent(runtime, engineer);
    await runtime.store.save();
  }
  return {
    shape: 'message',
    title: '已送达',
    engineer: engineer.sessionId,
    mode,
    text: `已用 ${mode} 方式把补充消息发给工程师 ${engineer.sessionId}。`,
  };
}

async function cancelTask(runtime, agent, args) {
  requireManager(runtime, agent);
  const state = runtime.store.get();
  const task = state.tasks[String(args.task_id ?? '').trim()];
  if (task === undefined) throw new Error(`任务不存在：${args.task_id}`);
  if (task.managerId !== agent.id) throw new Error('该任务不属于当前经理');
  const engineer = task.engineerId === null ? undefined : state.engineers[task.engineerId];
  const reason = typeof args.reason === 'string' && args.reason.trim() !== '' ? args.reason.trim() : '经理取消';

  if (task.status === 'queued') {
    task.status = 'cancelled';
    task.endedAt = now();
    task.report = { outcome: 'failed', summary: reason, unreported: true, reason: 'cancelled' };
  } else if (task.status === 'running') {
    task.status = 'cancelled';
    task.endedAt = now();
    task.report = { outcome: 'failed', summary: reason, unreported: true, reason: 'cancelled' };
    if (engineer !== undefined) {
      if (isCodexEngineer(engineer)) {
        const run = runtime.runs.get(task.taskId);
        try {
          run?.cancel?.();
        } catch {
          /* 进程可能已退出 */
        }
        runtime.engineerMessages.delete(engineer.sessionId);
        engineer.status = 'idle';
        delete engineer.activeTaskId;
      } else {
        try {
          runtime.ctx.get('sessionController')?.cancel({ sessionId: engineer.sessionId });
        } catch (error) {
          logWarn(runtime, `取消工程师轮次失败：${describeError(error)}`);
        }
        engineer.status = 'idle';
        delete engineer.activeTaskId;
      }
    }
  } else {
    throw new Error(`任务已结束（${task.status}），不能取消`);
  }
  if (engineer !== undefined) {
    engineer.queue = engineer.queue.filter((id) => id !== task.taskId);
    if (isCodexEngineer(engineer)) runtime.engineerMessages.delete(engineer.sessionId);
  }
  await runtime.store.save();
  await pump(runtime);
  return {
    shape: 'cancelled',
    title: `已取消 #${task.taskId}`,
    task_id: task.taskId,
    text: `任务 #${task.taskId} 已取消（${reason}）。`,
  };
}

async function reportTask(runtime, agent, args) {
  const state = runtime.store.get();
  const engineer = state.engineers[agent.id];
  if (engineer === undefined) throw new Error('只有派活工程师可以回报任务');
  const taskId = String(args.task_id ?? '').trim();
  const task = state.tasks[taskId];
  if (task === undefined) throw new Error(`任务不存在：${taskId}`);
  if (task.engineerId !== agent.id) throw new Error(`任务 #${taskId} 不属于当前工程师`);
  if (task.status !== 'running') throw new Error(`任务 #${taskId} 未在运行（${task.status}）`);
  if (engineer.activeTaskId !== taskId) throw new Error(`任务 #${taskId} 不是当前任务`);

  const outcome = ['success', 'failed', 'blocked'].includes(args.outcome) ? args.outcome : 'success';
  const report = {
    outcome,
    summary: String(args.summary ?? '').trim() || '（无摘要）',
  };
  if (Array.isArray(args.changes)) report.changes = args.changes.map((entry) => String(entry)).filter(Boolean);
  if (typeof args.tests === 'string' && args.tests.trim() !== '') report.tests = args.tests.trim();
  if (typeof args.blockers === 'string' && args.blockers.trim() !== '') report.blockers = args.blockers.trim();
  if (typeof args.branch === 'string' && args.branch.trim() !== '') report.branch = args.branch.trim();
  if (typeof args.commit === 'string' && args.commit.trim() !== '') report.commit = args.commit.trim();
  task.report = report;
  await runtime.store.save();
  return {
    shape: 'report',
    title: '报告已记录',
    task_id: taskId,
    text: `任务 #${taskId} 的报告已记录（${outcome}）。请结束本轮，经理会收到回报。`,
  };
}

const MAX_TODO_GUARD_NUDGES = 2;

/** 补充消息的待回报记录多久算陈旧（插件重载对账用）。 */
const SUPPLEMENT_STALE_MS = 10 * 60_000;

/**
 * 记录经理本轮是否成功看过/改过待办。
 *
 * 只看成功结果：失败的 `paihuo_todo` 调用不算核对；`turn/end` 清理状态，
 * 下一轮从零开始。
 */
function trackManagerTodoGuard(runtime, session, event) {
  const state = runtime.store.get();
  if (state.managers[session.id] === undefined) return;
  const guard = runtime.todoGuard ?? (runtime.todoGuard = new Map());
  if (event.type === 'turn/start') {
    guard.set(session.id, {
      turn: event.data.turn,
      checked: false,
      nudges: 0,
      calls: new Map(),
    });
    return;
  }
  const entry = guard.get(session.id);
  if (entry === undefined) return;
  if (event.type === 'tool/call') {
    if (event.data.name === TOOL_TODO) entry.calls.set(event.data.callId, event.data.turn);
    return;
  }
  if (event.type === 'tool/result') {
    const callId = event.data.message?.toolCallId;
    if (typeof callId === 'string' && entry.calls.has(callId) && event.data.message?.isError !== true) {
      entry.checked = true;
    }
    return;
  }
  if (event.type === 'turn/end') guard.delete(session.id);
}

/**
 * 轮次结束前的待办强制核对。
 *
 * DSH 在 `agent/turn-stopping` 后检查 `inbox.nextStep`：用 steer 注入提醒会
 * 让同一轮继续执行下一步，而不是另起一轮。提醒失败只记日志，绝不向 loop
 * 抛错；连续忽略时最多提醒 `MAX_TODO_GUARD_NUDGES` 次后放行。
 */
async function ensureManagerTodoChecked(runtime, agent, payload) {
  if (agent === undefined || agent === null) return;
  const state = runtime.store.get();
  if (state.managers[agent.id] === undefined) return;
  const turn = payload?.turn;
  if (!Number.isInteger(turn)) return;
  if (payload?.signal?.aborted) return;
  const guard = runtime.todoGuard ?? (runtime.todoGuard = new Map());
  let entry = guard.get(agent.id);
  if (entry === undefined || entry.turn !== turn) {
    entry = { turn, checked: false, nudges: 0, calls: new Map() };
    guard.set(agent.id, entry);
  }
  if (entry.checked) return;
  if (entry.nudges >= MAX_TODO_GUARD_NUDGES) {
    logWarn(runtime, `经理 ${agent.id} 第 ${turn} 轮连续 ${entry.nudges} 次未核对未待办，放行`);
    return;
  }
  entry.nudges += 1;
  try {
    await admit(runtime, agent.id, buildTodoCheckReminder(), 'steer');
  } catch (error) {
    logWarn(runtime, `待办核对提醒发送失败：${describeError(error)}`);
  }
}

/** 经理补充消息的正文前缀：`paihuo_message` 注入工程师会话时写的就是它。 */
const SUPPLEMENT_PREFIX = '【经理补充';

/**
 * 记录每个会话当前所在的回合号。
 *
 * `user/message` 事件本身不带回合号，而补充消息是随回合一起出现的；只有记住
 * 最近的 `turn/start` 才能把「这条补充消息属于哪一轮」对上。
 */
function trackCurrentTurn(runtime, session, event) {
  const turns = runtime.currentTurn ?? (runtime.currentTurn = new Map());
  if (event.type === 'turn/start' && Number.isInteger(event.data?.turn)) {
    turns.set(session.id, event.data.turn);
    return;
  }
  if (event.type === 'turn/end' && turns.get(session.id) === event.data?.turn) {
    turns.delete(session.id);
  }
}

/**
 * 回合里出现了经理补充消息：把这条补充消息绑到当前回合。
 *
 * 有任务在跑时不登记——该回合结束时 `finalizeTask` 会按任务回报；只有「工程师
 * 空闲、补充消息自己开了一轮」这种没有任务台账的情况才需要单独回报。
 */
function bindSupplementTurn(runtime, engineer, event) {
  const text = textOf({ content: event.data?.content });
  if (!text.startsWith(SUPPLEMENT_PREFIX)) return;
  const turn = runtime.currentTurn?.get(engineer.sessionId);
  const task = engineer.activeTaskId === undefined
    ? undefined
    : runtime.store.get().tasks[engineer.activeTaskId];
  // 这一轮就是任务回合时由任务回报覆盖；任务结束后排队的补充消息会另起一轮，
  // 那时 activeTaskId 可能还没清掉，所以按回合号判断而不是按 activeTaskId。
  if (task !== undefined && (turn === undefined || task.turn === turn)) return;
  engineer.supplement = {
    at: engineer.supplement?.at ?? now(),
    ...(Number.isInteger(turn) ? { turn } : {}),
    ...(engineer.supplement?.pendingText === undefined ? {} : { pendingText: engineer.supplement.pendingText }),
  };
  void runtime.store.save();
}

/**
 * 经理给空闲工程师发补充消息后登记一条待回报记录。
 *
 * 不登记的话，工程师做完这一轮就结束了：它没有任务号，无法调用 `paihuo_report`，
 * 经理也收不到任何回报——经理会一直以为对方还在干活。
 */
function markSupplementSent(runtime, engineer) {
  engineer.supplement = engineer.supplement === undefined
    ? { at: now() }
    : { ...engineer.supplement, at: engineer.supplement.at ?? now() };
}

/** 补充回合结束：把工程师的最后一条回复回报给经理。 */
async function finalizeSupplementTurn(runtime, engineer, turn, reason) {
  const record = engineer.supplement;
  if (record === undefined) return;
  if (record.turn === undefined || record.turn !== turn) return;
  const text = await lastAssistantText(runtime, engineer.sessionId);
  const kind = typeof reason === 'string' ? reason : reason?.kind;
  const messages = [];
  // 上一次没送出去的报告先补发，避免它被这一轮的新记录覆盖掉。
  if (typeof record.pendingText === 'string' && record.pendingText !== '') messages.push(record.pendingText);
  messages.push(buildSessionSupplementMessage(engineer, text, kind));
  delete engineer.supplement;
  const pending = [];
  for (const message of messages) {
    try {
      await admit(runtime, engineer.managerId, message, 'queue');
    } catch (error) {
      pending.push(message);
      logWarn(runtime, `工程师 ${engineer.sessionId} 的补充回复未能送达经理：${describeError(error)}`);
    }
  }
  if (pending.length > 0) engineer.supplement = { at: now(), pendingText: pending.join('\n\n') };
  await runtime.store.save();
  await pump(runtime);
}

/** 派活插件注入给经理的回报消息前缀（任务回报 / 补充回复）。 */
const REPORT_PREFIXES = ['【派活系统回报', '【派活系统补充回复'];

/**
 * 经理回合的记录：这一轮是不是由派活回报/补充回复触发的。
 *
 * 只看插件自己注入的回报消息。IM 只会把「从 IM 发起的那一轮」发回聊天，所以
 * 工程师汇报引起的这一轮必须由插件再送一次（见 `relayManagerTurn`）。
 */
function trackManagerReportTurn(runtime, session, event) {
  const state = runtime.store.get();
  if (state.managers[session.id] === undefined) return;
  const watch = runtime.reportTurns ?? (runtime.reportTurns = new Map());
  if (event.type === 'user/message') {
    const text = textOf({ content: event.data?.content });
    if (!REPORT_PREFIXES.some((prefix) => text.startsWith(prefix))) return;
    const turn = runtime.currentTurn?.get(session.id);
    if (Number.isInteger(turn)) watch.set(session.id, { turn, text: '' });
    return;
  }
  const entry = watch.get(session.id);
  if (entry === undefined) return;
  // 只取这一轮最后一个助手文本：中间的工具调用与旧回合的回复都不能混进来。
  if (event.type === 'assistant/message' && event.data?.turn === entry.turn) {
    if (event.data?.interrupted === true) return;
    const text = textOf(event.data?.message);
    if (text !== '') entry.text = text;
    return;
  }
  if (event.type !== 'turn/end') return;
  if (event.data?.turn !== entry.turn) {
    // 记录的回合已经过去（例如插件漏接了那一轮）：丢掉，别让旧记录一直挂着。
    if (Number.isInteger(event.data?.turn) && event.data.turn > entry.turn) watch.delete(session.id);
    return;
  }
  watch.delete(session.id);
  const kind = typeof event.data?.reason === 'string' ? event.data.reason : event.data?.reason?.kind;
  if (kind !== undefined && kind !== 'completed') return;
  void relayManagerTurn(runtime, session.id, entry.text);
}

/**
 * 把经理对汇报的反应补发到 IM。
 *
 * dsh-im 只回传「从聊天里发起的那一轮」；工程师汇报、补充回复由插件注入，那一轮
 * 不会回到聊天里。这里用同 Host 的 `dshIm` 服务把经理这一轮的最终回复主动送过去。
 * 服务不可用（旧版 dsh-im / 未接入 IM / 该会话不是 IM 会话）时静默跳过。
 */
async function relayManagerTurn(runtime, sessionId, finalText) {
  if (runtime.config.imRelay !== true) return;
  // 这一轮没有助手文本时宁可不发，也不要回退到上一轮的旧回复。
  const text = finalText === undefined ? await lastAssistantText(runtime, sessionId) : finalText;
  if (text === '') return;
  try {
    const result = await deliverToImSession(runtime.ctx, sessionId, `【派活 · 经理】\n\n${text}`);
    if (result.delivered !== true && result.reason !== 'no-im' && result.reason !== 'unbound') {
      logWarn(runtime, `经理回复没有补发到 IM：${result.reason}`);
    }
  } catch (error) {
    logWarn(runtime, `经理回复补发到 IM 失败：${describeError(error)}`);
  }
}

function handleSessionEvent(runtime, session, event) {
  const state = runtime.store.get();
  trackCurrentTurn(runtime, session, event);
  trackManagerTodoGuard(runtime, session, event);
  trackManagerReportTurn(runtime, session, event);
  const engineer = state.engineers[session.id];
  if (engineer === undefined) return;
  if (isCodexEngineer(engineer)) return;

  if (event.type === 'user/message') {
    bindSupplementTurn(runtime, engineer, event);
    return;
  }

  if (event.type === 'turn/start') {
    if (engineer.activeTaskId === undefined) return;
    const task = state.tasks[engineer.activeTaskId];
    if (task === undefined || task.status !== 'running' || task.turn !== undefined) return;
    const watch = runtime.turnWatch.get(session.id);
    if (watch !== undefined && event.seq < watch.fromSeq) return;
    task.turn = event.data.turn;
    void runtime.store.save();
    return;
  }

  if (event.type === 'turn/end') {
    // 先看这一轮是不是补充轮：补充轮结束时 activeTaskId 可能已经被下一个任务占上，
    // 按回合号判断才不会把补充回复吞掉。
    if (engineer.supplement !== undefined && engineer.supplement.turn === event.data?.turn) {
      void finalizeSupplementTurn(runtime, engineer, event.data.turn, event.data.reason);
      return;
    }
    if (engineer.activeTaskId === undefined) return;
    const task = state.tasks[engineer.activeTaskId];
    if (task === undefined || task.status !== 'running') return;
    if (task.turn !== undefined && task.turn !== event.data.turn) return;
    void finalizeTask(runtime, task, engineer, event.data.reason);
  }
}

async function reconcile(runtime) {
  const state = runtime.store.get();
  let summaries;
  try {
    const listed = await runtime.ctx.get('sessionController')?.list({});
    summaries = listed?.items;
  } catch (error) {
    logWarn(runtime, `读取会话列表失败：${describeError(error)}`);
  }
  const byId = new Map((summaries ?? []).map((item) => [item.sessionId, item]));
  let changed = false;
  // 旧状态没有 workspaceMode：重载后按工程师现有 worktree 回填，避免主工作区
  // 互斥把复用主工作区工程师的任务误判成 worktree 任务。
  for (const task of Object.values(state.tasks)) {
    if (task.workspaceMode !== undefined) continue;
    const engineer = task.engineerId === null ? undefined : state.engineers[task.engineerId];
    task.workspaceMode = engineer !== undefined
      ? engineerWorkspaceMode(engineer)
      : (task.useWorktree ? 'worktree' : 'main');
    changed = true;
  }
  for (const task of Object.values(state.tasks)) {
    if (task.status !== 'running') continue;
    const engineer = task.engineerId === null ? undefined : state.engineers[task.engineerId];
    if (isCodexTask(task)) {
      // CLI 进程无法跨插件重载恢复；任务结算为中断，工程师保留供后续复用。
      task.status = 'interrupted';
      task.endedAt = now();
      task.report = {
        outcome: 'failed',
        summary: '插件重载时 Codex 进程已无法恢复，任务被中断；请检查工作区后重试或派发新任务。',
        unreported: true,
        reason: 'interrupted',
      };
      if (engineer !== undefined) {
        engineer.status = 'idle';
        delete engineer.activeTaskId;
        runtime.engineerMessages.delete(engineer.sessionId);
      }
      runtime.runs.delete(task.taskId);
      changed = true;
      await notifyManager(runtime, task, engineer);
      continue;
    }
    const summary = task.engineerId === null ? undefined : byId.get(task.engineerId);
    const stillRunning = summary === undefined ? summaries === undefined : summary.running === true;
    if (stillRunning) {
      if (engineer !== undefined) {
        engineer.status = 'running';
        engineer.activeTaskId = task.taskId;
        changed = true;
      }
      continue;
    }
    task.status = 'interrupted';
    task.endedAt = now();
    task.report = {
      outcome: 'failed',
      summary: '插件重载时该任务已不在运行，可能被中断；请检查工程师会话后决定重试或派发新任务。',
      unreported: true,
      reason: 'interrupted',
    };
    if (engineer !== undefined) {
      engineer.status = 'idle';
      delete engineer.activeTaskId;
    }
    changed = true;
    if (engineer !== undefined) await notifyManager(runtime, task, engineer);
  }
  for (const engineer of Object.values(state.engineers)) {
    engineer.queue = engineer.queue.filter((id) => state.tasks[id]?.status === 'queued');
  }
  // 补充消息的回合没有任务台账：插件重载时那一轮若已经结束，经理收不到任何事。
  // 只在记录明显陈旧、且会话确实不在运行时清掉并告知一次，避免让经理一直等。
  for (const engineer of Object.values(state.engineers)) {
    const record = engineer.supplement;
    if (record === undefined || record.pendingText !== undefined) continue;
    const summary = byId.get(engineer.sessionId);
    const running = summary === undefined ? summaries === undefined : summary.running === true;
    if (running) continue;
    if (now() - (record.at ?? 0) < SUPPLEMENT_STALE_MS) continue;
    delete engineer.supplement;
    changed = true;
    try {
      await admit(
        runtime,
        engineer.managerId,
        buildSessionSupplementMessage(
          engineer,
          '（插件重载时这一轮已经结束，未能读取最终回复；请查看工程师会话确认结果）',
          'interrupted',
        ),
        'queue',
      );
    } catch {
      /* 送达失败时经理可以用 paihuo_engineers 自查 */
    }
  }
  if (changed) await runtime.store.save();
  await pump(runtime);
}

async function flushPendingNotifications(runtime, managerId) {
  const state = runtime.store.get();
  const pending = Object.values(state.tasks).filter((task) => task.managerId === managerId && task.notifyPending === true);
  for (const task of pending) {
    const engineer = task.engineerId === null ? undefined : state.engineers[task.engineerId];
    try {
      await admit(runtime, managerId, buildReportMessage(task, engineer), 'queue');
      task.notifiedAt = now();
      delete task.notifyPending;
    } catch {
      break;
    }
  }
  // 补充消息的回复没有任务台账可挂：送达失败时先把文本存在工程师记录上，
  // 下次该经理的会话被激活时重试。
  for (const engineer of Object.values(state.engineers)) {
    if (engineer.managerId !== managerId) continue;
    const text = engineer.supplement?.pendingText;
    if (typeof text !== 'string' || text === '') continue;
    try {
      await admit(runtime, managerId, text, 'queue');
      delete engineer.supplement;
    } catch {
      break;
    }
  }
  await runtime.store.save();
}

/** 验收合并：派一个工程师在主工作区把来源分支合入目标分支（默认是用户下发任务时的分支）。 */
async function integrate(runtime, agent, args) {
  requireManager(runtime, agent);
  const state = runtime.store.get();
  const taskId = String(args.task_id ?? '').trim();
  const source = state.tasks[taskId];
  if (source === undefined) throw new Error(`任务不存在：${taskId}`);
  if (source.managerId !== agent.id) throw new Error('该任务不属于当前经理');
  if (source.status !== 'done') throw new Error(`任务 #${taskId} 尚未完成（${source.status}），不能合并`);
  const backend = runtime.config.engineerBackend === BACKEND_CODEX ? BACKEND_CODEX : BACKEND_SESSION;
  if (backend === BACKEND_CODEX) assertCodexAvailable(runtime);
  const engineer = source.engineerId === null ? undefined : state.engineers[source.engineerId];
  const branch = engineer?.worktree?.branch ?? source.worktree?.branch ?? source.report?.branch ?? null;
  if (branch === null || branch === '') {
    throw new Error('该任务没有独立分支（工程师直接改在主工作区），无需合并。');
  }
  const target = String(args.target_branch ?? '').trim()
    || source.baseBranch
    || await detectBranch(source.projectPath);
  if (target === null || target === '') {
    throw new Error('无法确定目标分支：请在 target_branch 指定要合入的分支。');
  }
  if (target === branch) throw new Error('目标分支与工程师分支相同，无需合并。');
  try {
    await git(source.projectPath, ['rev-parse', '--verify', '--quiet', `refs/heads/${target}`]);
  } catch {
    throw new Error(`目标分支不存在：${target}`);
  }

  const notes = typeof args.notes === 'string' ? args.notes.trim() : '';
  if (notes.length > 2000) throw new Error('notes 不能超过 2000 个字符');

  const briefLines = [
    `目标：把工程师分支 ${branch} 合并到分支 ${target}，处理冲突并验证。`,
    `项目根：${source.projectPath}`,
    '',
    '## 步骤',
    '1. 先检查工作区：`git status --porcelain=v1 -uno` 必须为空（已跟踪文件不能有未提交改动）；若有，不要动手，直接在报告里写阻塞。未跟踪文件可以存在，但不要修改、删除或提交它们，并在报告里列出。',
    `2. 确认当前分支是 ${target}（不是就先切过去；切不过去就报告，不要强行 checkout）。`,
    `3. \`git merge --no-ff ${branch}\`，逐个解决冲突并保留双方语义，最后完成 merge commit。`,
    '4. 跑该项目的测试/构建（按 README 或 package.json 里的命令），确认通过。',
    backend === BACKEND_CODEX
      ? '5. 完成后在最终回答里说明：结果、merge commit、跑过的测试、冲突处理；不要 push，不要删除分支。'
      : '5. 用 paihuo_report 汇报：结果、commit、跑过的测试、冲突处理说明。不要 push，不要删除分支。',    '',
    `来源任务：#${source.taskId}「${source.title}」（执行者 ${source.engineerId ?? '未知'}）`,
  ];
  if (notes !== '') briefLines.push('', '## 经理补充', notes);
  const brief = briefLines.join('\n');

  const task = {
    taskId: nextTaskId(state),
    managerId: agent.id,
    engineerId: null,
    title: shorten(`合并 ${branch} → ${target}`, 60),
    brief,
    projectPath: source.projectPath,
    projectKey: source.projectKey,
    backend,
    model: backend === BACKEND_CODEX ? null : source.model,
    ...(backend === BACKEND_CODEX
      ? { codexModel: source.codexModel ?? normalizeCodexModel(runtime.config.codexModel) ?? undefined }
      : {}),
    priority: 'normal',
    resources: [],
    useWorktree: false,
    workspaceMode: 'main',
    worktreeReason: '合并必须在主工作区完成',
    integration: { sourceTaskId: source.taskId, branch, target },
    baseBranch: target,
    baseCommit: await detectCommit(source.projectPath),
    forceNew: true,
    status: 'queued',
    createdAt: now(),
  };
  state.tasks[task.taskId] = task;
  await runtime.store.save();
  await pump(runtime);

  const current = runtime.store.get().tasks[task.taskId] ?? task;
  const position = queuePosition(runtime, current);
  const statusText = current.status === 'running'
    ? '已开工'
    : current.status === 'queued'
      ? `排队中${position > 0 ? `（第 ${position} 位）` : ''}`
      : current.status;
  const busy = current.status === 'queued'
    ? runningMainWorkspaceTask(runtime.store.get().tasks, current.projectKey)
    : undefined;
  return {
    shape: 'dispatched',
    title: `已派发合并 #${current.taskId}`,
    task_id: current.taskId,
    backend: backendOf(current),
    engineer: current.engineerId,
    status: current.status,
    queue_position: position,
    project: current.projectPath,
    worktree: null,
    text: [
      `合并任务 #${current.taskId}：${branch} → ${target}，${statusText}。`,
      backend === BACKEND_CODEX
        ? `- 执行者：Codex 工程师${current.engineerId ? ` ${current.engineerId}` : '（待分配，新建）'}`
        : `- 工程师：${current.engineerId ?? '（待分配，新建）'}`,
      '- 工作区：主工作区（worktree 之外）',
      ...(busy !== undefined && busy.taskId !== current.taskId
        ? [`- 等待原因：主工作区正被 #${busy.taskId} 占用`]
        : []),
      '',
      '合并完成后会回报到本会话；冲突或工作区不干净时会报告阻塞。',
    ].join('\n'),
  };
}

/** 把空闲的工程师会话恢复成普通会话（由 /paihuo off 完成角色清理）。 */
async function releaseEngineer(runtime, agent, args) {
  requireManager(runtime, agent);
  const sessionId = String(args.engineer ?? '').trim();
  const engineer = runtime.store.get().engineers[sessionId];
  if (engineer === undefined) throw new Error(`不是派活工程师会话：${sessionId}`);
  if (engineer.managerId !== agent.id) throw new Error('该工程师不属于当前经理');
  if (engineer.activeTaskId !== undefined) throw new Error('工程师仍在执行任务；先取消任务再释放');
  if (engineer.status === 'running') throw new Error('工程师仍在执行任务或补充消息；先取消任务再释放');
  if (Array.isArray(engineer.queue) && engineer.queue.length > 0) throw new Error('工程师还有排队任务；先取消再释放');
  if (isCodexEngineer(engineer)) {
    delete runtime.store.get().engineers[sessionId];
    runtime.engineerMessages.delete(sessionId);
    runtime.codexUi.delete(sessionId);
    await runtime.store.save();
    return {
      shape: 'text',
      title: '已释放 Codex 工程师',
      text: `Codex 工程师 ${sessionId} 已从插件中移除，之后不能再复用或追加消息。Codex 原生会话文件仍保留在磁盘上。`,
    };
  }
  const engineerAgent = runtime.ctx.get('agents')?.get(sessionId) ?? await resolveAgentWithRetry(runtime, sessionId);
  const commands = runtime.ctx.get('commands');
  if (!commands) throw new Error('缺少 commands 服务');
  const execution = await commands.execute(engineerAgent, '/paihuo off', [], AbortSignal.timeout(30_000));
  if (execution?.result?.kind !== 'success') {
    throw new Error(execution?.result?.text ?? '恢复普通会话失败');
  }
  return {
    shape: 'text',
    title: '已恢复为普通会话',
    text: `会话 ${sessionId} 已恢复为普通会话：工程师角色、工具集与标题前缀都已移除，后续可以像普通会话一样使用。`,
  };
}

/**
 * 创建任务运行器。
 *
 * @param {object} runtime 插件运行时。
 * @returns 对外操作集合。
 */
export function createTasks(runtime) {
  return {
    dispatch: (agent, args) => dispatch(runtime, agent, args),
    integrate: (agent, args) => integrate(runtime, agent, args),
    releaseEngineer: (agent, args) => releaseEngineer(runtime, agent, args),
    listEngineers: (agent) => listEngineers(runtime, agent),
    listTasks: (agent, args) => listTasks(runtime, agent, args),
    getTask: (agent, args) => getTask(runtime, agent, args),
    messageEngineer: (agent, args) => messageEngineer(runtime, agent, args),
    cancelTask: (agent, args) => cancelTask(runtime, agent, args),
    reportTask: (agent, args) => reportTask(runtime, agent, args),
    handleSessionEvent: (session, event) => handleSessionEvent(runtime, session, event),
    ensureManagerTodoChecked: (agent, payload) => ensureManagerTodoChecked(runtime, agent, payload),
    reconcile: () => reconcile(runtime),
    flushPendingNotifications: (managerId) => flushPendingNotifications(runtime, managerId),
    pump: () => pump(runtime),
    /** 供模式关闭时同步取消本经理的未完成任务。 */
    cancelAllFor: async (managerId, reason) => {
      const state = runtime.store.get();
      const pending = Object.values(state.tasks).filter(
        (task) => task.managerId === managerId && (task.status === 'queued' || task.status === 'running'),
      );
      for (const task of pending) {
        const engineer = task.engineerId === null ? undefined : state.engineers[task.engineerId];
        task.status = 'cancelled';
        task.endedAt = now();
        task.report = { outcome: 'failed', summary: reason, unreported: true, reason: 'cancelled' };
        if (engineer !== undefined) {
          if (isCodexEngineer(engineer)) {
            const run = runtime.runs.get(task.taskId);
            try {
              run?.cancel?.();
            } catch {
              /* 进程可能已退出 */
            }
            runtime.engineerMessages.delete(engineer.sessionId);
            engineer.status = 'idle';
            delete engineer.activeTaskId;
          } else if (engineer.activeTaskId === task.taskId) {
            try {
              runtime.ctx.get('sessionController')?.cancel({ sessionId: engineer.sessionId });
            } catch {
              /* 已停止 */
            }
            engineer.status = 'idle';
            delete engineer.activeTaskId;
          }
          engineer.queue = engineer.queue.filter((id) => id !== task.taskId);
        }
      }
      await runtime.store.save();
      await pump(runtime);
      return pending.length;
    },
  };
}
