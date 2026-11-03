import assert from 'node:assert/strict';
import { test } from 'node:test';

import { apply } from '../lib/index.js';
import { createWorld, PROJECT, settle } from './harness.mjs';

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

  // 预设作用域里的工具不受 restrict 掩码影响，真正兜底的是守卫。
  const guard = world.guards.find((entry) => entry.agentId === manager.id);
  assert.ok(guard, 'manager must install a tool guard');
  assert.equal(typeof guard.guard({ name: 'write' }), 'string');
  assert.equal(typeof guard.guard({ name: 'pwsh' }), 'string');
  assert.equal(guard.guard({ name: 'read' }), undefined);
  assert.equal(guard.guard({ name: 'skill' }), undefined);
  assert.equal(guard.guard({ name: 'paihuo_dispatch' }), undefined);

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
  const outside = 'D:\\Workspace\\myworks';
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
  const outside = 'D:\\Workspace\\myworks';
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
