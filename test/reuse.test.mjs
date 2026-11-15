/**
 * 会话复用策略：同类型、同项目、时间窗内活跃的工程师会话直接复用；
 * 开发 / 测试 / 通用三类会话互不串用；测试任务可以排进正在跑的测试会话队列。
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { apply } from '../lib/index.js';
import { createWorld, settle } from './harness.mjs';

async function boot(world) {
  apply(world.ctx, world.config);
  await settle();
  const manager = world.ensureAgent('session-manager');
  const execution = await world.ctx.commands.execute(manager, '/paihuo on', []);
  assert.equal(execution.result.kind, 'success', execution.result.text);
  return manager;
}

function runDispatch(world, manager, args) {
  const definition = world.toolDefs.get('paihuo_dispatch');
  assert.ok(definition, 'manager tools should be registered');
  return definition.execute(args, {
    agent: manager,
    callId: 'call-dispatch',
    signal: new AbortController().signal,
  });
}

/** 让某个会话工程师跑完一轮，任务结算为 done、工程师回到空闲。 */
async function completeTurn(world, engineerId, turn = 1) {
  const engineer = world.agents.get(engineerId);
  assert.ok(engineer, `engineer ${engineerId} should exist`);
  world.append(engineer.session, 'turn/start', { turn });
  world.append(engineer.session, 'turn/end', { turn, reason: { kind: 'completed' } });
  await settle(60);
}

function engineerIds(world) {
  return Object.keys(world.stored.engineers);
}

test('同项目、同类型的活跃会话会被复用，而不是每次新建', async () => {
  const world = createWorld({ config: { worktree: false } });
  const manager = await boot(world);

  const first = await runDispatch(world, manager, { title: '实现登录页', brief: '把登录页的样式改完。' });
  assert.equal(first.status, 'running');
  await completeTurn(world, first.engineer);
  assert.equal(world.stored.tasks[first.task_id].status, 'done');

  const active = world.stored.engineers[first.engineer].lastActiveAt;
  assert.ok(Number.isInteger(active), 'turn events must stamp lastActiveAt');

  const second = await runDispatch(world, manager, { title: '补上验证码逻辑', brief: '在登录页里补验证码。' });
  assert.equal(second.engineer, first.engineer, '同项目同类任务应复用旧会话');
  assert.equal(second.status, 'running');
  assert.equal(world.stored.tasks[second.task_id].engineerReused, true);
  assert.equal(world.stored.tasks[second.task_id].kind, 'dev');
  assert.deepEqual(engineerIds(world), [first.engineer]);
  assert.match(second.text, /会话复用/);
  assert.match(second.text, /省去重新加载上下文/);
});

test('测试任务不会复用刚写代码的开发会话', async () => {
  const world = createWorld({ config: { worktree: false } });
  const manager = await boot(world);

  const dev = await runDispatch(world, manager, { title: '实现导出功能', brief: '加一个导出按钮。' });
  await completeTurn(world, dev.engineer);

  const check = await runDispatch(world, manager, { title: '测试导出功能', brief: '验证导出按钮可用。' });
  assert.notEqual(check.engineer, dev.engineer, '测试任务必须用另一个会话');
  assert.equal(world.stored.tasks[check.task_id].kind, 'test');
  assert.equal(world.stored.tasks[check.task_id].engineerReused, undefined);
  assert.deepEqual(engineerIds(world).sort(), [dev.engineer, check.engineer].sort());
});

test('测试任务可以排进正在跑的测试会话队列', async () => {
  const world = createWorld({ config: { worktree: false } });
  const manager = await boot(world);

  const first = await runDispatch(world, manager, { title: '测试登录流程', brief: '验证登录。', kind: 'test' });
  assert.equal(first.status, 'running');

  const second = await runDispatch(world, manager, { title: '测试注册流程', brief: '验证注册。', kind: 'test' });
  assert.equal(second.engineer, first.engineer, '测试任务应排进已有的测试会话');
  assert.equal(second.status, 'queued');
  assert.equal(world.stored.tasks[second.task_id].reuseQueued, true);
  assert.deepEqual(world.stored.engineers[first.engineer].queue, [second.task_id]);
  assert.match(second.text, /排进/);

  // 第一轮结束 → 队列里的第二个测试任务自动开工，仍然是同一个会话。
  await completeTurn(world, first.engineer);
  assert.equal(world.stored.tasks[second.task_id].status, 'running');
  assert.equal(world.stored.tasks[second.task_id].engineerId, first.engineer);
});

test('超过复用时间窗的会话不再复用，回执写明原因', async () => {
  const world = createWorld({ config: { worktree: false } });
  const manager = await boot(world);

  const first = await runDispatch(world, manager, { title: '实现搜索框', brief: '加搜索框。' });
  await completeTurn(world, first.engineer);

  // 把时钟往前拨 4 小时（默认时间窗 3 小时）：那条会话就算「很久没动」了。
  const realNow = Date.now;
  let second;
  try {
    Date.now = () => realNow() + 4 * 60 * 60_000;
    second = await runDispatch(world, manager, { title: '实现筛选器', brief: '加筛选器。' });
  } finally {
    Date.now = realNow;
  }

  assert.notEqual(second.engineer, first.engineer);
  const task = world.stored.tasks[second.task_id];
  assert.equal(task.forceNew, true);
  assert.match(task.reuseMissReason, /没有活跃过/);
  assert.match(second.text, /会话复用：无/);
});

test('工作区模式对不上时不复用，并说明原因', async () => {
  const world = createWorld({ config: { worktree: false } });
  const manager = await boot(world);

  // 配置默认不建 worktree，但任务显式要 worktree：实际仍落在主工作区。
  const first = await runDispatch(world, manager, { title: '实现导出', brief: '加导出。', worktree: true });
  await completeTurn(world, first.engineer);
  assert.equal(world.stored.engineers[first.engineer].worktree, null);

  const second = await runDispatch(world, manager, { title: '实现导入', brief: '加导入。', worktree: true });
  assert.notEqual(second.engineer, first.engineer);
  assert.match(world.stored.tasks[second.task_id].reuseMissReason, /工作区模式对不上/);
});

test('reuse="new" 强制新建，时间窗配 0 时不再限制', async () => {
  const world = createWorld({ config: { worktree: false } });
  const manager = await boot(world);

  const first = await runDispatch(world, manager, { title: '实现深色主题', brief: '加深色主题。' });
  await completeTurn(world, first.engineer);

  const forced = await runDispatch(world, manager, {
    title: '实现浅色主题',
    brief: '加浅色主题。',
    reuse: 'new',
  });
  assert.notEqual(forced.engineer, first.engineer);

  // 时间窗为 0 = 不限：把两个会话都做成很久没动，仍然复用。
  const relaxed = createWorld({ config: { worktree: false, reuseActiveMinutes: 0 } });
  const managerRelaxed = await boot(relaxed);
  const a = await runDispatch(relaxed, managerRelaxed, { title: '实现日历', brief: '加日历。' });
  await completeTurn(relaxed, a.engineer);
  relaxed.stored.engineers[a.engineer].lastActiveAt = Date.now() - 30 * 24 * 60 * 60_000;
  const b = await runDispatch(relaxed, managerRelaxed, { title: '实现日程提醒', brief: '加提醒。' });
  assert.equal(b.engineer, a.engineer);
});

test('通用任务复用通用会话，不与开发会话串用', async () => {
  const world = createWorld({ config: { worktree: false } });
  const manager = await boot(world);

  const dev = await runDispatch(world, manager, { title: '实现报表', brief: '加报表页。' });
  await completeTurn(world, dev.engineer);

  const firstGeneral = await runDispatch(world, manager, { title: '整理 README 结构', brief: '调研后给出目录建议。' });
  assert.equal(world.stored.tasks[firstGeneral.task_id].kind, 'general');
  assert.notEqual(firstGeneral.engineer, dev.engineer, '通用任务不能占用开发会话');
  await completeTurn(world, firstGeneral.engineer);

  const secondGeneral = await runDispatch(world, manager, { title: '整理 CHANGELOG', brief: '汇总最近的版本说明。' });
  assert.equal(secondGeneral.engineer, firstGeneral.engineer, '同类通用任务应复用');
});

test('kind 按标题与任务书推断：标题优先，标题无信号时看正文', async () => {
  const world = createWorld({ config: { worktree: false } });
  const manager = await boot(world);

  const cases = [
    { args: { title: '测试 t3 的修复', brief: '跑一遍用例。' }, kind: 'test' },
    { args: { title: '实现导出按钮', brief: '跑测试确认。' }, kind: 'dev' },
    { args: { title: '补上缓存层', brief: '新增一层缓存。' }, kind: 'dev' },
    { args: { title: '周报', brief: '汇总本周进展，不写代码。' }, kind: 'general' },
    { args: { title: '看看这个', brief: '回归验证一下登录页。' }, kind: 'test' },
  ];
  for (const entry of cases) {
    const result = await runDispatch(world, manager, { ...entry.args, reuse: 'new' });
    assert.equal(world.stored.tasks[result.task_id].kind, entry.kind, JSON.stringify(entry.args));
  }
});

test('paihuo_engineers 展示类型与最近活跃时间', async () => {
  const world = createWorld({ config: { worktree: false } });
  const manager = await boot(world);
  const dispatched = await runDispatch(world, manager, { title: '实现搜索建议', brief: '加联想词。' });

  const definition = world.toolDefs.get('paihuo_engineers');
  const listed = await definition.execute({}, {
    agent: manager,
    callId: 'call-engineers',
    signal: new AbortController().signal,
  });
  const row = listed.engineers.find((entry) => entry.session_id === dispatched.engineer);
  assert.ok(row, 'Engineer should be listed');
  assert.equal(row.kind, 'dev');
  assert.ok(Number.isInteger(row.last_active_at));
  assert.match(listed.text, /开发｜/);
  assert.match(listed.text, /最近活跃/);
});
