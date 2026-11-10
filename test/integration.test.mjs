import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { apply } from '../lib/index.js';
import { codexModelSupportsImages, listCodexModels } from '../lib/codex.js';
import { createWorld, FAKE_CODEX, PROJECT, settle } from './harness.mjs';

/**
 * 仓库目录之外的另一个真实目录，平台无关：POSIX 下是 /var/folders/…，
 * Windows 下是 C:\Users\…\AppData\Local\Temp，两边都与 PROJECT 没有包含关系。
 */
const OUTSIDE_PROJECT = tmpdir();

/** 测试用 1x1 PNG。 */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function boot(world) {
  apply(world.ctx, world.config);
  await settle();
  return world.ensureAgent('session-manager');
}

async function enterMode(world, manager) {
  const execution = await world.ctx.commands.execute(manager, '/paihuo on', []);
  assert.equal(execution.result.kind, 'success', execution.result.text);
  return execution;
}

function dispatchTool(world) {
  const definition = world.toolDefs.get('paihuo_dispatch');
  assert.ok(definition, 'manager tools should be registered');
  return definition;
}

function runDispatch(world, manager, args) {
  return dispatchTool(world).execute(args, {
    agent: manager,
    callId: 'call-dispatch',
    signal: new AbortController().signal,
  });
}

function runTool(world, manager, name, args) {
  const definition = world.toolDefs.get(name);
  assert.ok(definition, `${name} should be registered`);
  return definition.execute(args, {
    agent: manager,
    callId: `call-${name}`,
    signal: new AbortController().signal,
  });
}

async function fireTurnStopping(world, manager, turn) {
  const handlers = world.handlers.get('agent/turn-stopping') ?? [];
  for (const handler of handlers) {
    await handler({ turn, agent: manager, signal: new AbortController().signal });
  }
}

function todoReminders(world, manager) {
  return world.prompts.filter((entry) => (
    entry.sessionId === manager.id && entry.text.includes('派活系统提醒')
  ));
}

function beginCodexLog() {
  const directory = mkdtempSync(join(tmpdir(), 'paihuo-codex-log-'));
  const path = join(directory, 'runs.jsonl');
  process.env.PAIHUO_FAKE_CODEX_LOG = path;
  return {
    path,
    cleanup() {
      delete process.env.PAIHUO_FAKE_CODEX_LOG;
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

function readCodexRuns(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return undefined;
      }
    })
    .filter((entry) => entry?.kind === 'run');
}

async function waitFor(predicate, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await settle(25);
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

test('manager mode delegates, engineer reports, manager is woken', async () => {
  const world = createWorld();
  const manager = await boot(world);
  await enterMode(world, manager);

  assert.equal(world.projectionState(manager.session).role, 'manager');
  // 新会话还没标题时先不改名；自动标题生成后补上前缀。
  world.append(manager.session, 'session/title', {
    title: '派活试验',
    messageSeqs: [],
    source: { kind: 'provider' },
  });
  assert.equal(manager.session.title, '👔 经理 · 派活试验');
  assert.ok(world.sections.some((section) => section.agentId === manager.id && section.name === 'paihuo:manager'));

  const restriction = world.restrictions.find((entry) => entry.agentId === manager.id);
  assert.ok(restriction, 'manager must be restricted to read-only tools');
  assert.ok(restriction.allow.includes('read'));
  assert.ok(restriction.allow.includes('ask_user_question'));
  assert.ok(!restriction.allow.includes('write'));
  assert.ok(!restriction.allow.includes('pwsh'));
  // profile 级 MCP 工具与其它非白名单工具不能进经理 prompt（之前 allow 取自
  // 全局视图、交集为空导致 restrict 被整体跳过，25 个浏览器工具一直留在里面）。
  assert.ok(!restriction.allow.includes('mcp__playwright__browser_click'));
  assert.ok(!restriction.allow.includes('mcp__playwright__browser_navigate'));
  assert.ok(!restriction.allow.includes('working_directory'));
  assert.ok(!restriction.allow.includes('load_workspace_dependencies'));
  assert.ok(restriction.deny.includes('mcp__playwright__browser_click'));
  assert.ok(!restriction.deny.includes('read'));
  // 经理待办改用 paihuo_todo；内置 todo_write 不再出现在经理工具面。
  assert.ok(world.toolDefs.has('paihuo_todo'));
  assert.ok(!restriction.allow.includes('todo_write'));
  assert.ok(restriction.deny.includes('todo_write'));

  // 记忆插件整族放行：memory_* 只读写记忆库，不属于工作区改动。之前只放行
  // 只读工具，dream 注入的整理任务没有写入口，只能空转。
  for (const name of [
    'memory_search',
    'memory_read',
    'memory_project',
    'memory_find_similar',
    'memory_remember',
    'memory_update',
    'memory_dream',
    'memory_home',
  ]) {
    assert.ok(restriction.allow.includes(name), `${name} must stay visible to the manager`);
    assert.ok(!restriction.deny.includes(name), `${name} must not be denied`);
  }
  // 按 `memory_` 前缀放行：记忆插件以后新增工具（这里是 memory_topic）同样可用。
  assert.ok(restriction.allow.includes('memory_topic'));
  assert.ok(!restriction.deny.includes('memory_topic'));

  // IM 工具放行：用户从 QQ 里要图片/文件时，回复链就是经理这一轮，工具被挡掉就
  // 发不出去。按 `dsh_im_` 前缀放行，dsh-im 以后新增同类工具不必再改白名单。
  for (const name of ['dsh_im_return_file', 'dsh_im_group_history', 'dsh_im_group_file']) {
    assert.ok(restriction.allow.includes(name), `${name} must stay visible to the manager`);
    assert.ok(!restriction.deny.includes(name), `${name} must not be denied`);
  }

  // 预设作用域里的工具不受 restrict 掩码影响，真正兜底的是守卫。
  const guard = world.guards.find((entry) => entry.agentId === manager.id);
  assert.ok(guard, 'manager must install a tool guard');
  assert.equal(typeof guard.guard({ name: 'write' }), 'string');
  assert.equal(typeof guard.guard({ name: 'pwsh' }), 'string');
  assert.equal(guard.guard({ name: 'read' }), undefined);
  assert.equal(guard.guard({ name: 'skill' }), undefined);
  assert.equal(guard.guard({ name: 'paihuo_dispatch' }), undefined);
  // 记忆写入不是执行任务：守卫必须放行，否则 dream 整理无法落库。
  assert.equal(guard.guard({ name: 'memory_remember' }), undefined);
  assert.equal(guard.guard({ name: 'memory_update' }), undefined);
  assert.equal(guard.guard({ name: 'memory_dream' }), undefined);
  assert.equal(guard.guard({ name: 'memory_topic' }), undefined);
  // IM 工具即使在 restrict 之后才注册，也要由守卫放行。
  assert.equal(guard.guard({ name: 'dsh_im_return_file' }), undefined);
  assert.equal(guard.guard({ name: 'dsh_im_group_history' }), undefined);

  const result = await runDispatch(world, manager, {
    title: '补充 README 说明',
    brief: '在 README 里增加一行安装说明，并说明如何退出派活模式。',
  });

  assert.equal(result.status, 'running', JSON.stringify(result));
  assert.equal(result.task_id, 't1');
  assert.equal(result.model, 'test-provider/test-model');

  const engineerId = result.engineer;
  assert.ok(typeof engineerId === 'string' && engineerId !== '');
  const engineer = world.agents.get(engineerId);
  assert.ok(engineer, 'engineer agent should exist');
  assert.ok(engineer.session.title.startsWith('👷'), engineer.session.title);
  assert.ok(world.sections.some((section) => section.agentId === engineerId && section.name === 'paihuo:engineer'));
  assert.ok(world.toolDefs.has('paihuo_report'));
  assert.ok(world.presets.some((entry) => entry.sessionId === engineerId));

  const taskPrompt = world.prompts.find((entry) => entry.sessionId === engineerId);
  assert.ok(taskPrompt, 'engineer must receive the task prompt');
  assert.match(taskPrompt.text, /派活任务 #t1/);
  assert.match(taskPrompt.text, /README/);
  assert.equal(world.stored.tasks.t1.status, 'running');

  world.append(engineer.session, 'turn/start', { turn: 1 });
  world.append(engineer.session, 'turn/end', { turn: 1, reason: { kind: 'completed' } });
  await settle(60);

  assert.equal(world.stored.tasks.t1.status, 'done');
  const report = world.prompts.find(
    (entry) => entry.sessionId === manager.id && entry.text.includes('【派活系统回报'),
  );
  assert.ok(report, 'manager must receive the completion report');
  assert.match(report.text, /已完成/);
  assert.match(report.text, /测试完成/);
});

test('manager tool overrides reach the restrict lists and the guard', async () => {
  const world = createWorld({
    config: {
      worktree: false,
      managerExtraTools: ['pwsh', 'mcp__playwright__browser_click'],
      managerDeniedTools: ['web_fetch'],
    },
  });
  const manager = await boot(world);
  await enterMode(world, manager);

  const restriction = world.restrictions.find((entry) => entry.agentId === manager.id);
  assert.ok(restriction, 'manager must be restricted to a tool surface');
  assert.ok(restriction.allow.includes('pwsh'));
  assert.ok(restriction.allow.includes('mcp__playwright__browser_click'));
  assert.ok(!restriction.deny.includes('pwsh'));
  assert.ok(!restriction.allow.includes('web_fetch'));
  assert.ok(restriction.deny.includes('web_fetch'));

  const guard = world.guards.find((entry) => entry.agentId === manager.id);
  assert.equal(guard.guard({ name: 'pwsh' }), undefined);
  assert.equal(guard.guard({ name: 'read' }), undefined);
  assert.equal(typeof guard.guard({ name: 'web_fetch' }), 'string');
  assert.equal(typeof guard.guard({ name: 'write' }), 'string');

  // 改配置后立刻刷新经理作用域：新加的放行不用重开会话。
  world.config.managerExtraTools = ['write'];
  world.config.managerDeniedTools = [];
  world.emit('loader/volatile-update');
  await settle(20);
  const refreshed = world.restrictions.filter((entry) => entry.agentId === manager.id).at(-1);
  assert.ok(refreshed.allow.includes('write'));
  assert.ok(!refreshed.allow.includes('pwsh'));
  const refreshedGuard = world.guards.filter((entry) => entry.agentId === manager.id).at(-1);
  assert.equal(refreshedGuard.guard({ name: 'write' }), undefined);
  assert.equal(typeof refreshedGuard.guard({ name: 'pwsh' }), 'string');
});

test('workstation limits queue the second task and release it on completion', async () => {
  const world = createWorld({ config: { totalWorkstations: 1, workstationsPerProject: 1, worktree: false } });
  const manager = await boot(world);
  await enterMode(world, manager);

  const first = await runDispatch(world, manager, { title: '任务 A', brief: '执行任务 A。' });
  assert.equal(first.status, 'running');

  const second = await runDispatch(world, manager, { title: '任务 B', brief: '执行任务 B。' });
  assert.equal(second.status, 'queued');
  assert.equal(second.queue_position, 1);

  const engineerA = world.agents.get(first.engineer);
  world.append(engineerA.session, 'turn/start', { turn: 1 });
  world.append(engineerA.session, 'turn/end', { turn: 1, reason: { kind: 'completed' } });
  await settle(80);

  assert.equal(world.stored.tasks.t1.status, 'done');
  assert.equal(world.stored.tasks.t2.status, 'running');
  assert.ok(typeof world.stored.tasks.t2.engineerId === 'string');
});

test('workspace-write managers cannot dispatch outside their working directory', async () => {
  const outside = OUTSIDE_PROJECT;
  const world = createWorld({ managerSandbox: 'workspace-write', managerPreset: 'workspace-write' });
  const manager = await boot(world);
  await enterMode(world, manager);

  await assert.rejects(
    () => runDispatch(world, manager, { title: '越界', brief: '不该被允许。', project_path: outside }),
    /只能派发到工作目录之内/,
  );

  const inside = await runDispatch(world, manager, { title: '工作区内', brief: '允许。' });
  assert.equal(inside.status, 'running');
  assert.equal(world.stored.engineers[inside.engineer].permissionPreset, 'workspace-write');
});

test('danger-full-access managers may dispatch to another existing project', async () => {
  const outside = OUTSIDE_PROJECT;
  const world = createWorld({ managerSandbox: 'danger-full-access', managerPreset: 'danger-full-access' });
  const manager = await boot(world);
  await enterMode(world, manager);

  assert.notEqual(outside, PROJECT);
  const result = await runDispatch(world, manager, { title: '相关项目', brief: '在相关项目里执行。', project_path: outside });
  assert.equal(result.status, 'running');
  assert.equal(world.stored.engineers[result.engineer].permissionPreset, 'danger-full-access');
});

test('queued tasks can be cancelled and closing the mode is guarded', async () => {
  const world = createWorld({ config: { totalWorkstations: 1, workstationsPerProject: 1, worktree: false } });
  const manager = await boot(world);
  await enterMode(world, manager);

  const first = await runDispatch(world, manager, { title: '任务 A', brief: '执行任务 A。' });
  const second = await runDispatch(world, manager, { title: '任务 B', brief: '执行任务 B。' });
  assert.equal(second.status, 'queued');

  const cancel = world.toolDefs.get('paihuo_cancel');
  const cancelled = await cancel.execute({ task_id: second.task_id, reason: '不需要了' }, {
    agent: manager,
    callId: 'call-cancel',
    signal: new AbortController().signal,
  });
  assert.equal(cancelled.task_id, second.task_id);
  assert.equal(world.stored.tasks[second.task_id].status, 'cancelled');

  const close = await world.ctx.commands.execute(manager, '/paihuo off', []);
  assert.equal(close.result.kind, 'error');
  assert.match(close.result.text, /未完成任务/);

  const forced = await world.ctx.commands.execute(manager, '/paihuo off force', []);
  assert.equal(forced.result.kind, 'success');
  assert.equal(world.projectionState(manager.session).role, 'none');
  assert.equal(world.stored.tasks[first.task_id].status, 'cancelled');
});

test('switching to the paihuo preset inside a session installs the manager', async () => {
  const world = createWorld();
  apply(world.ctx, world.config);
  await settle();

  const agent = world.ensureAgent('session-switch');
  world.emit('agent/created', { agent, source: 'startup' });
  await settle(20);
  assert.ok(!world.sections.some((section) => section.agentId === agent.id && section.name === 'paihuo:manager'));

  world.append(agent.session, 'agent-preset/selected', { agentPreset: 'paihuo' });
  world.emit('agent-preset/selected', agent.id, 'paihuo');
  await settle(40);

  assert.ok(world.sections.some((section) => section.agentId === agent.id && section.name === 'paihuo:manager'));
  assert.ok(world.toolDefs.has('paihuo_dispatch'));
  assert.equal(agent.session.title, '👔 经理');
  assert.ok(world.stored.managers[agent.id] !== undefined);

  world.append(agent.session, 'agent-preset/selected', { agentPreset: 'standard' });
  world.emit('agent-preset/selected', agent.id, 'standard');
  await settle(40);
  assert.ok(!world.sections.some((section) => section.agentId === agent.id && section.name === 'paihuo:manager'));
});

test('the paihuo agent preset creates a manager without /paihuo on', async () => {
  const world = createWorld();
  apply(world.ctx, world.config);
  await settle();

  const session = world.ensureSession('session-preset');
  session.header.agentPreset = 'paihuo';
  const agent = world.ensureAgent('session-preset');
  world.emit('agent/created', { agent, source: 'startup' });
  await settle(30);

  // 预设即角色：无需命令，作用域、工具与守卫都已就绪。
  assert.ok(world.sections.some((section) => section.agentId === agent.id && section.name === 'paihuo:manager'));
  assert.ok(world.toolDefs.has('paihuo_dispatch'));
  const guard = world.guards.find((entry) => entry.agentId === agent.id);
  assert.ok(guard, 'preset manager must install a tool guard');
  assert.equal(typeof guard.guard({ name: 'edit' }), 'string');
  assert.equal(guard.guard({ name: 'grep' }), undefined);

  // 空标题的经理会话先得到带图标的占位标题，列表里立刻能看到经理图标。
  assert.equal(session.title, '👔 经理');

  // 第一条用户消息后，标题刷新成“👔 经理 · 真实主题”。
  world.append(session, 'user/message', {});
  await settle(40);
  assert.equal(session.title, '👔 经理 · 测试会话');

  // 关闭模式：切回默认预设，标题恢复。
  const off = await world.ctx.commands.execute(agent, '/paihuo off force', []);
  assert.equal(off.result.kind, 'success', off.result.text);
  assert.equal(session.header.agentPreset, 'standard');
  assert.equal(session.title, '测试会话');
});

test('reusing an engineer reports the actual main workspace', async () => {
  const world = createWorld({ config: { worktree: false, workstationsPerProject: 2, totalWorkstations: 2 } });
  const manager = await boot(world);
  await enterMode(world, manager);

  const first = await runDispatch(world, manager, { title: '任务 A', brief: '执行 A。' });
  assert.equal(first.status, 'running');
  const engineer = world.agents.get(first.engineer);
  world.append(engineer.session, 'turn/start', { turn: 1 });
  world.append(engineer.session, 'turn/end', { turn: 1, reason: { kind: 'completed' } });
  await settle(80);

  const second = await runDispatch(world, manager, {
    title: '任务 B',
    brief: '在同一个主工作区继续执行 B。',
    engineer: first.engineer,
  });
  assert.equal(second.status, 'running');
  assert.match(second.text, /复用工程师/);
  assert.doesNotMatch(second.text, /独立 worktree/);
});

test('main-workspace tasks queue behind each other', async () => {
  const world = createWorld({ config: { worktree: false, workstationsPerProject: 2, totalWorkstations: 2 } });
  const manager = await boot(world);
  await enterMode(world, manager);

  const first = await runDispatch(world, manager, { title: '任务 A', brief: '执行 A。' });
  const second = await runDispatch(world, manager, { title: '任务 B', brief: '执行 B。' });
  assert.equal(first.status, 'running');
  assert.equal(second.status, 'queued');
  assert.match(second.text, /主工作区正被/);

  const engineer = world.agents.get(first.engineer);
  world.append(engineer.session, 'turn/start', { turn: 1 });
  world.append(engineer.session, 'turn/end', { turn: 1, reason: { kind: 'completed' } });
  await settle(100);

  assert.equal(world.stored.tasks[first.task_id].status, 'done');
  assert.equal(world.stored.tasks[second.task_id].status, 'running');
});

test('paihuo_task omits the brief unless requested', async () => {
  const world = createWorld({ config: { worktree: false } });
  const manager = await boot(world);
  await enterMode(world, manager);

  const result = await runDispatch(world, manager, { title: '任务 A', brief: 'UNIQUE_BRIEF_TEXT' });
  const short = await runTool(world, manager, 'paihuo_task', { task_id: result.task_id });
  assert.doesNotMatch(short.text, /UNIQUE_BRIEF_TEXT/);
  assert.match(short.text, /include_brief/);

  const full = await runTool(world, manager, 'paihuo_task', {
    task_id: result.task_id,
    include_brief: true,
  });
  assert.match(full.text, /UNIQUE_BRIEF_TEXT/);
});

test('paihuo_integrate passes notes and the untracked-file policy', async () => {
  const world = createWorld({ config: { worktree: false } });
  const manager = await boot(world);
  await enterMode(world, manager);

  const result = await runDispatch(world, manager, { title: '任务 A', brief: '执行 A。' });
  const engineer = world.agents.get(result.engineer);
  world.append(engineer.session, 'turn/start', { turn: 1 });
  const report = await runTool(world, engineer, 'paihuo_report', {
    task_id: result.task_id,
    outcome: 'success',
    summary: '完成',
    branch: 'paihuo/fake',
  });
  assert.equal(report.task_id, result.task_id);
  world.append(engineer.session, 'turn/end', { turn: 1, reason: { kind: 'completed' } });
  await settle(80);

  const target = world.stored.tasks[result.task_id].baseBranch;
  assert.ok(typeof target === 'string' && target !== '');
  const integrated = await runTool(world, manager, 'paihuo_integrate', {
    task_id: result.task_id,
    target_branch: target,
    notes: 'ONLY_AFFECTED_TESTS',
  });
  assert.equal(integrated.status, 'running');
  const mergePrompt = world.prompts.find((entry) => entry.text.includes('## 经理补充'));
  assert.ok(mergePrompt, 'merge engineer should receive manager notes');
  assert.match(mergePrompt.text, /ONLY_AFFECTED_TESTS/);
  assert.match(mergePrompt.text, /--porcelain=v1 -uno/);
});

test('manager turns without a todo check are forced to review todos', async () => {
  const world = createWorld({ config: { worktree: false } });
  const manager = await boot(world);
  await enterMode(world, manager);

  world.append(manager.session, 'turn/start', { turn: 1 });
  await fireTurnStopping(world, manager, 1);
  assert.equal(todoReminders(world, manager).length, 1);
  assert.equal(todoReminders(world, manager)[0].mode, 'steer');

  world.append(manager.session, 'tool/call', {
    turn: 1,
    step: 1,
    callId: 'todo-1',
    name: 'paihuo_todo',
    arguments: '{"action":"list"}',
  });
  world.append(manager.session, 'tool/result', {
    turn: 1,
    step: 1,
    message: {
      role: 'tool',
      toolCallId: 'todo-1',
      content: [{ type: 'text', text: '待办（0）' }],
      isError: false,
    },
  });
  await fireTurnStopping(world, manager, 1);
  assert.equal(todoReminders(world, manager).length, 1, 'a successful todo call satisfies the guard');

  world.append(manager.session, 'turn/end', { turn: 1, reason: { kind: 'completed' } });
  world.append(manager.session, 'turn/start', { turn: 2 });
  await fireTurnStopping(world, manager, 2);
  assert.equal(todoReminders(world, manager).length, 2, 'the next turn starts a fresh check');
});

test('a failed todo call does not satisfy the guard', async () => {
  const world = createWorld({ config: { worktree: false } });
  const manager = await boot(world);
  await enterMode(world, manager);

  world.append(manager.session, 'turn/start', { turn: 1 });
  world.append(manager.session, 'tool/call', {
    turn: 1,
    step: 1,
    callId: 'todo-failed',
    name: 'paihuo_todo',
    arguments: '{"action":"list"}',
  });
  world.append(manager.session, 'tool/result', {
    turn: 1,
    step: 1,
    message: {
      role: 'tool',
      toolCallId: 'todo-failed',
      content: [{ type: 'text', text: '待办服务不可用' }],
      isError: true,
    },
  });
  await fireTurnStopping(world, manager, 1);
  assert.equal(todoReminders(world, manager).length, 1);
});

test('todo guard nudges at most twice per turn', async () => {
  const world = createWorld({ config: { worktree: false } });
  const manager = await boot(world);
  await enterMode(world, manager);

  world.append(manager.session, 'turn/start', { turn: 1 });
  await fireTurnStopping(world, manager, 1);
  await fireTurnStopping(world, manager, 1);
  await fireTurnStopping(world, manager, 1);
  assert.equal(todoReminders(world, manager).length, 2);
});

test('codex mode dispatches a CLI engineer and wakes the manager', async () => {
  const log = beginCodexLog();
  try {
    const world = createWorld({
      config: { engineerBackend: 'codex', worktree: false, codexReasoningEffort: 'high' },
    });
    const manager = await boot(world);
    await enterMode(world, manager);
    const sessionsBefore = world.sessions.size;

    const result = await runDispatch(world, manager, {
      title: 'Codex 任务',
      brief: '修改 README，并在最终回答里说明结果。PAIHUO_FAKE_DELAY_MS=200',
    });
    assert.equal(result.status, 'running', JSON.stringify(result));
    assert.equal(result.backend, 'codex');
    assert.equal(result.engineer, 'codex-t1');
    assert.equal(world.sessions.size, sessionsBefore, 'codex mode must not create an engineer session');
    assert.ok(!world.agents.has(result.engineer), 'codex engineer is not a DSH agent');

    await waitFor(() => readCodexRuns(log.path).length >= 1);
    const run = readCodexRuns(log.path)[0];
    assert.equal(run.resume, false);
    assert.equal(run.cwd, PROJECT);
    assert.match(run.prompt, /派活任务 #t1/);
    assert.doesNotMatch(run.prompt, /paihuo_report/);
    assert.ok(run.args.includes('--color'));
    assert.ok(run.args.includes('--sandbox'));
    assert.ok(run.args.includes('model_reasoning_effort=high'));

    const engineers = await runTool(world, manager, 'paihuo_engineers', {});
    assert.ok(engineers.engineers.some((entry) => entry.backend === 'codex' && entry.codex_session === null));

    await waitFor(() => world.stored.tasks.t1?.status === 'done');
    const engineer = world.stored.engineers['codex-t1'];
    assert.ok(engineer, 'codex engineer record should remain for reuse');
    assert.equal(engineer.status, 'idle');
    assert.equal(engineer.codexSessionId, 'fake-thread-1');
    const report = world.prompts.find(
      (entry) => entry.sessionId === manager.id && entry.text.includes('【派活系统回报'),
    );
    assert.ok(report, 'manager must receive the codex completion report');
    assert.match(report.text, /Codex 工程师/);
    assert.match(report.text, /FAKE_CODEX_OK/);
    assert.doesNotMatch(report.text, /未显式调用报告工具/);
  } finally {
    log.cleanup();
  }
});

test('codex engineers can be reused and messaged', async () => {
  const log = beginCodexLog();
  try {
    const world = createWorld({
      config: { engineerBackend: 'codex', worktree: false, codexReasoningEffort: 'high' },
    });
    const manager = await boot(world);
    await enterMode(world, manager);

    const first = await runDispatch(world, manager, {
      title: '任务 A',
      brief: '执行 A。PAIHUO_FAKE_DELAY_MS=50',
    });
    await waitFor(() => world.stored.tasks[first.task_id]?.status === 'done');

    const second = await runDispatch(world, manager, {
      title: '任务 B',
      brief: '在同一条工作线上执行 B。PAIHUO_FAKE_DELAY_MS=50',
      engineer: first.engineer,
    });
    assert.equal(second.status, 'running');
    await waitFor(() => world.stored.tasks[second.task_id]?.status === 'done');
    let runs = readCodexRuns(log.path);
    assert.equal(runs.length, 2);
    assert.equal(runs[1].resume, true);
    assert.equal(runs[1].sessionId, 'fake-thread-1');
    assert.match(runs[1].prompt, /派活任务 #t2/);
    assert.ok(!runs[1].args.includes('--color'), 'resume does not accept --color');
    assert.ok(!runs[1].args.includes('--sandbox'), 'resume reuses the session sandbox');
    assert.ok(runs[1].args.includes('model_reasoning_effort=high'));

    const sent = await runTool(world, manager, 'paihuo_message', {
      engineer: first.engineer,
      message: '再补充一句。PAIHUO_FAKE_DELAY_MS=50',
    });
    assert.equal(sent.engineer, first.engineer);
    await waitFor(() => world.prompts.some((entry) => entry.text.includes('【派活系统补充回复')));
    runs = readCodexRuns(log.path);
    assert.equal(runs.length, 3);
    assert.equal(runs[2].resume, true);
    assert.match(runs[2].prompt, /经理补充/);

    const released = await runTool(world, manager, 'paihuo_release', { engineer: first.engineer });
    assert.match(released.text, /已从插件中移除/);
    assert.equal(world.stored.engineers[first.engineer], undefined);
    await assert.rejects(
      () => runTool(world, manager, 'paihuo_message', { engineer: first.engineer, message: '再来' }),
      /未知工程师会话/,
    );
  } finally {
    log.cleanup();
  }
});

test('running codex tasks accept queued manager messages', async () => {
  const log = beginCodexLog();
  try {
    const world = createWorld({ config: { engineerBackend: 'codex', worktree: false } });
    const manager = await boot(world);
    await enterMode(world, manager);

    const result = await runDispatch(world, manager, {
      title: '追加任务',
      brief: '执行任务。PAIHUO_FAKE_DELAY_MS=250',
    });
    await waitFor(() => readCodexRuns(log.path).length >= 1);
    const sent = await runTool(world, manager, 'paihuo_message', {
      engineer: result.engineer,
      message: '补充要求：只改 README。',
      mode: 'queue',
    });
    assert.equal(sent.mode, 'queue');
    await waitFor(() => world.stored.tasks[result.task_id]?.status === 'done', 8000);
    const runs = readCodexRuns(log.path);
    assert.equal(runs.length, 2);
    assert.equal(runs[1].resume, true);
    assert.match(runs[1].prompt, /补充要求：只改 README/);
  } finally {
    log.cleanup();
  }
});

test('codex model catalog is read from codex debug models', () => {
  const runtime = {
    config: {
      codexCommand: process.execPath,
      codexCommandArgs: [FAKE_CODEX],
    },
    logger: { warn() {} },
  };
  const result = listCodexModels(runtime, true);
  assert.equal(result.error, null);
  assert.deepEqual(result.models.map((model) => model.id), ['gpt-test-codex', 'gpt-text-only']);
  assert.equal(result.models[0].name, 'GPT Test Codex');
  assert.deepEqual(result.models[0].reasoningLevels.map((level) => level.effort), ['low', 'medium', 'high']);
  assert.equal(result.models[0].defaultReasoningLevel, 'medium');
  assert.deepEqual(result.models[0].inputModalities, ['text', 'image']);
  assert.deepEqual(result.models[1].inputModalities, ['text']);
});

test('codex mode fails cleanly when the CLI is missing', async () => {
  const world = createWorld({ codex: false, config: { engineerBackend: 'codex' } });
  const manager = await boot(world);
  await enterMode(world, manager);

  await assert.rejects(
    () => runDispatch(world, manager, { title: '任务', brief: '执行。' }),
    /Codex CLI|无法执行/,
  );
  assert.equal(Object.keys(world.stored.tasks).length, 0);
});

test('failed codex runs become failed tasks with diagnostics', async () => {
  const log = beginCodexLog();
  try {
    const world = createWorld({ config: { engineerBackend: 'codex', worktree: false } });
    const manager = await boot(world);
    await enterMode(world, manager);

    const result = await runDispatch(world, manager, {
      title: '失败任务',
      brief: '执行。PAIHUO_FAKE_FAIL',
    });
    await waitFor(() => world.stored.tasks[result.task_id]?.status === 'failed');
    const report = world.prompts.find(
      (entry) => entry.sessionId === manager.id && entry.text.includes('【派活系统回报'),
    );
    assert.ok(report);
    assert.match(report.text, /fake codex failure/);
    assert.equal(world.stored.engineers[result.engineer].status, 'idle');
  } finally {
    log.cleanup();
  }
});

test('cancelling a codex task kills the CLI process and keeps it cancelled', async () => {
  const log = beginCodexLog();
  try {
    const world = createWorld({ config: { engineerBackend: 'codex', worktree: false } });
    const manager = await boot(world);
    await enterMode(world, manager);

    const result = await runDispatch(world, manager, {
      title: '取消任务',
      brief: '执行。PAIHUO_FAKE_HANG',
    });
    await waitFor(() => readCodexRuns(log.path).length >= 1);
    const cancelled = await runTool(world, manager, 'paihuo_cancel', { task_id: result.task_id });
    assert.equal(cancelled.task_id, result.task_id);
    assert.equal(world.stored.tasks[result.task_id].status, 'cancelled');
    assert.equal(world.stored.engineers[result.engineer].status, 'idle');
    await settle(300);
    assert.equal(world.stored.tasks[result.task_id].status, 'cancelled');
    assert.ok(!world.prompts.some((entry) => entry.text.includes('【派活系统回报')));
  } finally {
    log.cleanup();
  }
});

test('codex mode runs in an isolated git worktree and reports its branch', async () => {
  const log = beginCodexLog();
  const root = mkdtempSync(join(tmpdir(), 'paihuo-codex-'));
  const repo = join(root, 'repo');
  const git = (args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  try {
    mkdirSync(repo);
    git(['init']);
    git(['config', 'user.email', 'paihuo@example.com']);
    git(['config', 'user.name', 'Paihuo Test']);
    git(['config', 'core.autocrlf', 'false']);
    writeFileSync(join(repo, 'README.md'), 'hello\n');
    git(['add', '-A']);
    git(['commit', '-m', 'init']);
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();

    const world = createWorld({ cwd: repo, config: { engineerBackend: 'codex', worktree: true } });
    const manager = await boot(world);
    await enterMode(world, manager);
    const result = await runDispatch(world, manager, {
      title: 'worktree 任务',
      brief: '检查 worktree。PAIHUO_FAKE_DELAY_MS=100',
      base_branch: branch,
    });
    await waitFor(() => readCodexRuns(log.path).length >= 1);
    const run = readCodexRuns(log.path)[0];
    assert.match(run.cwd.replaceAll('\\', '/'), /\.paihuo-worktrees\//);
    assert.equal(existsSync(run.cwd), true);
    assert.ok(world.stored.tasks[result.task_id].worktree);
    assert.match(world.stored.tasks[result.task_id].worktree.branch, /^paihuo\/t1/);

    await waitFor(() => world.stored.tasks[result.task_id]?.status === 'done', 8000);
    assert.match(world.stored.tasks[result.task_id].report.branch, /^paihuo\/t1/);
  } finally {
    log.cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test('codex mode uses a codex CLI engineer for integration merges', async () => {
  const log = beginCodexLog();
  try {
    const world = createWorld({ config: { worktree: false } });
    const manager = await boot(world);
    await enterMode(world, manager);

    const result = await runDispatch(world, manager, { title: '来源任务', brief: '执行来源任务。' });
    const engineer = world.agents.get(result.engineer);
    world.append(engineer.session, 'turn/start', { turn: 1 });
    await runTool(world, engineer, 'paihuo_report', {
      task_id: result.task_id,
      outcome: 'success',
      summary: '完成',
      branch: 'paihuo/fake',
    });
    world.append(engineer.session, 'turn/end', { turn: 1, reason: { kind: 'completed' } });
    await settle(80);
    assert.equal(world.stored.tasks[result.task_id].status, 'done');

    // 运行中切换后端：新派发的合并任务应使用 Codex CLI。
    world.config.engineerBackend = 'codex';
    world.emit('loader/volatile-update');
    await settle(20);

    const integrated = await runTool(world, manager, 'paihuo_integrate', {
      task_id: result.task_id,
      target_branch: 'main',
    });
    assert.equal(integrated.status, 'running');
    await waitFor(() => readCodexRuns(log.path).length >= 1);
    const prompt = readCodexRuns(log.path)[0].prompt;
    assert.match(prompt, /git merge --no-ff paihuo\/fake/);
    assert.match(prompt, /最终回答/);
    assert.doesNotMatch(prompt, /paihuo_report/);
    await waitFor(() => world.stored.tasks[integrated.task_id]?.status === 'done', 8000);
  } finally {
    log.cleanup();
  }
});

test('idle session engineers report back after a manager follow-up', async () => {
  const world = createWorld({ config: { worktree: false } });
  const manager = await boot(world);
  await enterMode(world, manager);

  const dispatched = await runDispatch(world, manager, { title: '任务 A', brief: '执行任务 A。' });
  const engineer = world.agents.get(dispatched.engineer);
  world.append(engineer.session, 'turn/start', { turn: 1 });
  world.append(engineer.session, 'turn/end', { turn: 1, reason: { kind: 'completed' } });
  await settle(80);
  assert.equal(world.stored.tasks[dispatched.task_id].status, 'done');
  assert.equal(world.stored.engineers[dispatched.engineer].activeTaskId, undefined);

  // 任务结束后经理追加一条消息：这一轮没有任务号，工程师无法调用 paihuo_report，
  // 插件必须在回合结束时把回复送回经理，否则经理会一直以为对方还在干活。
  const sent = await runTool(world, manager, 'paihuo_message', {
    engineer: dispatched.engineer,
    message: '坐下动画不生效，请复现并修掉。',
  });
  assert.match(sent.text, /已用 queue 方式/);
  assert.ok(world.stored.engineers[dispatched.engineer].supplement, 'supplement must be tracked');

  engineer.session.deriveMessages = () => [
    { role: 'assistant', content: [{ type: 'text', text: '已定位：走位 tween 结束前进入 sit，行走帧把坐姿覆盖了；已修。' }] },
  ];
  world.append(engineer.session, 'turn/start', { turn: 2 });
  world.append(engineer.session, 'user/message', {
    content: [{ type: 'text', text: '【经理补充】\n坐下动画不生效，请复现并修掉。' }],
    source: { kind: 'user', rpcId: 'rpc-supplement' },
    role: 'user',
  });
  await settle(20);
  world.append(engineer.session, 'turn/end', { turn: 2, reason: { kind: 'completed' } });
  await settle(100);

  const reply = world.prompts.find(
    (entry) => entry.sessionId === manager.id && entry.text.includes('【派活系统补充回复'),
  );
  assert.ok(reply, 'manager must receive the supplement reply');
  assert.match(reply.text, /行走帧把坐姿覆盖/);
  assert.equal(world.stored.engineers[dispatched.engineer].supplement, undefined);
});

test('a supplement queued behind a task still reports back', async () => {
  const world = createWorld({ config: { worktree: false } });
  const manager = await boot(world);
  await enterMode(world, manager);

  const dispatched = await runDispatch(world, manager, { title: '任务 A', brief: '执行任务 A。' });
  const engineer = world.agents.get(dispatched.engineer);
  world.append(engineer.session, 'turn/start', { turn: 1 });

  // 任务还在跑时经理追加一条消息：它排在任务之后，会另起一轮。
  const sent = await runTool(world, manager, 'paihuo_message', {
    engineer: dispatched.engineer,
    message: '合并前先把单测补齐。',
    mode: 'queue',
  });
  assert.match(sent.text, /已用 queue 方式/);

  world.append(engineer.session, 'turn/end', { turn: 1, reason: { kind: 'completed' } });
  await settle(80);
  assert.equal(world.stored.tasks[dispatched.task_id].status, 'done');

  // activeTaskId 可能在补充轮开始时还没清掉：必须按回合号判断，而不是按它。
  engineer.session.deriveMessages = () => [
    { role: 'assistant', content: [{ type: 'text', text: '单测已补齐，任务 A 的改动可以合并。' }] },
  ];
  world.append(engineer.session, 'turn/start', { turn: 2 });
  world.append(engineer.session, 'user/message', {
    content: [{ type: 'text', text: '【经理补充】\n合并前先把单测补齐。' }],
    source: { kind: 'user', rpcId: 'rpc-queued-supplement' },
    role: 'user',
  });
  await settle(20);
  world.append(engineer.session, 'turn/end', { turn: 2, reason: { kind: 'completed' } });
  await settle(100);

  const reply = world.prompts.find(
    (entry) => entry.sessionId === manager.id && entry.text.includes('单测已补齐'),
  );
  assert.ok(reply, 'the queued follow-up must report back too');
  assert.match(reply.text, /【派活系统补充回复/);
});

test('manager reactions to engineer reports are relayed to the bound IM chat', async () => {
  const world = createWorld({ config: { worktree: false } });
  const manager = await boot(world);
  await enterMode(world, manager);

  const relayed = [];
  const originalGet = world.ctx.get;
  world.ctx.get = (name) => (name === 'dshIm'
    ? {
      async describeConversation(sessionId) {
        return { channel: 'qq', botId: 'bot_1', conversationKey: `c2c:${sessionId === manager.id ? 'OPENID' : 'OTHER'}` };
      },
      async send(botId, target, text, options) {
        relayed.push({ botId, target, text, options });
        return { sent: true };
      },
    }
    : originalGet.call(world.ctx, name));

  world.append(manager.session, 'turn/start', { turn: 4 });
  world.append(manager.session, 'user/message', {
    content: [{ type: 'text', text: '【派活系统回报｜不是用户消息】\n任务 #t1「任务 A」已完成。' }],
    source: { kind: 'user', rpcId: 'rpc-report' },
    role: 'user',
  });
  // 中间的工具调用与最终回复：只有这一轮最后一个助手文本会被补发。
  world.append(manager.session, 'assistant/message', {
    turn: 4,
    step: 1,
    message: { role: 'assistant', content: [{ type: 'text', text: '我先看一下报告。' }] },
  });
  world.append(manager.session, 'tool/call', { turn: 4, step: 2, name: 'paihuo_todo', callId: 'call-todo' });
  world.append(manager.session, 'assistant/message', {
    turn: 4,
    step: 3,
    message: { role: 'assistant', content: [{ type: 'text', text: '已合并 main，`4f99693`，接下来录屏。' }] },
  });
  world.append(manager.session, 'turn/end', { turn: 4, reason: { kind: 'completed' } });
  await settle(100);

  assert.equal(relayed.length, 1, 'the report-driven turn must be relayed once');
  assert.equal(relayed[0].botId, 'bot_1');
  assert.deepEqual(relayed[0].target, { kind: 'user', route: { userOpenId: 'OPENID' } });
  assert.match(relayed[0].text, /【派活 · 经理】/);
  assert.match(relayed[0].text, /接下来录屏/);
  assert.doesNotMatch(relayed[0].text, /我先看一下报告/);

  // 别的插件（记忆整理等）注入的回合不补发，避免把内部工作刷到聊天里。
  world.append(manager.session, 'turn/start', { turn: 5 });
  world.append(manager.session, 'user/message', {
    content: [{ type: 'text', text: '[meow-memory-dream] 记忆整理任务' }],
    source: { kind: 'plugin:meow-memory' },
    role: 'user',
  });
  world.append(manager.session, 'turn/end', { turn: 5, reason: { kind: 'completed' } });
  await settle(80);
  assert.equal(relayed.length, 1);
});

/** 经理在聊天里发一条带图用户消息。 */
function appendUserImage(world, manager, image, turn = 1, text = '按这张图改。') {
  world.append(manager.session, 'turn/start', { turn });
  world.append(manager.session, 'user/message', {
    content: [{ type: 'text', text }, { type: 'image', attachment: image }],
    source: { kind: 'user', rpcId: `rpc-image-${turn}` },
    role: 'user',
  });
}

test('session engineers receive the images the user sent to the manager', async () => {
  const world = createWorld({ config: { worktree: false } });
  const manager = await boot(world);
  await enterMode(world, manager);
  const image = world.writeImage(PNG_BYTES, { name: 'screenshot.png' });
  appendUserImage(world, manager, image);

  const dispatched = await runDispatch(world, manager, { title: '按图改布局', brief: '按用户发来的截图调整布局。' });
  assert.match(dispatched.text, /图片：随任务附上 1 张/);

  const prompt = world.prompts.find((entry) => entry.sessionId === dispatched.engineer);
  assert.ok(prompt, 'engineer must receive the task');
  const block = prompt.content.find((entry) => entry.type === 'image');
  assert.ok(block, 'the image block must be forwarded with the task');
  assert.equal(block.attachment.attachmentId, image.attachmentId);
  assert.equal(block.encodedBytes, image.bytes);
  assert.match(prompt.text, /按用户发来的截图调整布局/);

  // 任务台账里也记住了这次转发的图片。
  const task = world.stored.tasks[dispatched.task_id];
  assert.equal(task.images.length, 1);
  assert.equal(task.images[0].attachmentId, image.attachmentId);
});

test('dispatch accepts images:"none" to skip forwarding', async () => {
  const world = createWorld({ config: { worktree: false } });
  const manager = await boot(world);
  await enterMode(world, manager);
  appendUserImage(world, manager, world.writeImage(PNG_BYTES));

  const dispatched = await runDispatch(world, manager, {
    title: '与图片无关的任务',
    brief: '整理 README。',
    images: 'none',
  });
  assert.doesNotMatch(dispatched.text, /图片：/);
  const prompt = world.prompts.find((entry) => entry.sessionId === dispatched.engineer);
  assert.ok(prompt);
  assert.equal(prompt.content.some((entry) => entry.type === 'image'), false);
  assert.equal(world.stored.tasks[dispatched.task_id].images, undefined);
});

test('stale images from older turns are not forwarded', async () => {
  const world = createWorld({ config: { worktree: false } });
  const manager = await boot(world);
  await enterMode(world, manager);
  world.append(manager.session, 'turn/start', { turn: 1 });
  world.append(manager.session, 'user/message', {
    content: [{ type: 'image', attachment: world.writeImage(PNG_BYTES) }],
    source: { kind: 'user', rpcId: 'rpc-old-image' },
    role: 'user',
  });
  world.append(manager.session, 'turn/end', { turn: 1, reason: { kind: 'completed' } });

  // 几轮纯文本对话之后才派发：旧图不再转发。
  world.append(manager.session, 'turn/start', { turn: 9 });
  world.append(manager.session, 'user/message', {
    content: [{ type: 'text', text: '现在做别的事。' }],
    source: { kind: 'user', rpcId: 'rpc-later' },
    role: 'user',
  });
  const dispatched = await runDispatch(world, manager, { title: '新任务', brief: '与新任务无关的工作。' });
  assert.doesNotMatch(dispatched.text, /图片：随任务附上/);
  // 回执提示有旧图没转，经理可以显式取回。
  assert.match(dispatched.text, /1 张较早的用户图片未随任务转发/);
  let prompt = world.prompts.find((entry) => entry.sessionId === dispatched.engineer);
  assert.ok(prompt);
  assert.equal(prompt.content.some((entry) => entry.type === 'image'), false);

  // 经理确认这张图就是要用的：images:"latest" 忽略窗口。
  await runTool(world, manager, 'paihuo_cancel', { task_id: dispatched.task_id });
  const forced = await runDispatch(world, manager, {
    title: '按旧图改',
    brief: '按用户之前发的截图调整。',
    images: 'latest',
  });
  assert.match(forced.text, /图片：随任务附上 1 张/);
  prompt = world.prompts.find((entry) => entry.sessionId === forced.engineer && entry.content.some((part) => part.type === 'image'));
  assert.ok(prompt, 'latest must forward the older image');
});

test('a text-only engineer model still runs the task, with an explicit note', async () => {
  const world = createWorld({ config: { worktree: false } });
  const manager = await boot(world);
  await enterMode(world, manager);
  appendUserImage(world, manager, world.writeImage(PNG_BYTES));

  // 模拟 DSH：工程师模型不接受图片输入。
  const originalPrompt = world.ctx.sessionController.prompt;
  world.ctx.sessionController.prompt = async (request, signal) => {
    if (Array.isArray(request.content) && request.content.some((part) => part.type === 'image')) {
      const error = new Error('Model "test-model" does not support image input.');
      error.code = 'session/attachment-invalid';
      throw error;
    }
    return originalPrompt(request, signal);
  };

  const dispatched = await runDispatch(world, manager, { title: '按图改', brief: '按截图调整按钮位置。' });
  assert.match(dispatched.text, /图片：1 张未能随任务送达/);

  const prompts = world.prompts.filter((entry) => entry.sessionId === dispatched.engineer);
  assert.equal(prompts.length, 1, 'only the text-only retry should land');
  assert.equal(prompts[0].content.some((entry) => entry.type === 'image'), false);
  assert.match(prompts[0].text, /按截图调整按钮位置/);
  assert.match(prompts[0].text, /图片没有送达/);
  assert.ok(world.stored.tasks[dispatched.task_id].imageFallback);
});

test('codex engineers receive user images through codex exec -i', async () => {
  const log = beginCodexLog();
  try {
    const world = createWorld({ config: { engineerBackend: 'codex', worktree: false } });
    const manager = await boot(world);
    await enterMode(world, manager);
    appendUserImage(world, manager, world.writeImage(PNG_BYTES));

    const dispatched = await runDispatch(world, manager, { title: '按图修样式', brief: '按截图修样式。' });
    assert.match(dispatched.text, /图片：随任务附上 1 张/);

    await waitFor(() => readCodexRuns(log.path).length >= 1);
    const run = readCodexRuns(log.path)[0];
    assert.ok(run.args.includes('-i'), 'codex exec must be called with -i');
    assert.equal(run.images.length, 1);
    assert.equal(run.images[0].exists, true, 'the image file must exist while codex runs');
    assert.equal(run.images[0].bytes, PNG_BYTES.byteLength);
    assert.match(run.images[0].path, /\.png$/);
    assert.match(run.prompt, /派活任务 #t1/);

    await waitFor(() => world.stored.tasks[dispatched.task_id]?.status === 'done');
  } finally {
    log.cleanup();
  }
});

test('codex models without image support still run the task, with a note', async () => {
  const log = beginCodexLog();
  try {
    const world = createWorld({
      config: { engineerBackend: 'codex', worktree: false, codexModel: 'gpt-text-only' },
    });
    const manager = await boot(world);
    await enterMode(world, manager);
    appendUserImage(world, manager, world.writeImage(PNG_BYTES));

    const dispatched = await runDispatch(world, manager, { title: '按图修样式', brief: '按截图修样式。' });
    assert.match(dispatched.text, /图片：1 张未能随任务送达/);

    await waitFor(() => readCodexRuns(log.path).length >= 1);
    const run = readCodexRuns(log.path)[0];
    assert.equal(run.args.includes('-i'), false, 'text-only codex model must not receive images');
    assert.equal(run.images.length, 0);
    assert.match(run.prompt, /图片没有送达/);
    await waitFor(() => world.stored.tasks[dispatched.task_id]?.status === 'done');
  } finally {
    log.cleanup();
  }
});

test('codex model image support is unknown when the catalog is unavailable', async () => {
  const runtime = { config: { codexCommand: 'paihuo-missing-codex-command' }, logger: { warn() {} } };
  assert.equal(await codexModelSupportsImages(runtime, 'gpt-6-luna'), undefined);
  assert.equal(await codexModelSupportsImages({}, null), undefined);
});
