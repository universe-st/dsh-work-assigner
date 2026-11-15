/**
 * 验收方式：
 * - self（默认）：开发自主验收，不额外派任务；
 * - independent：开发任务成功后自动派一个独立验收任务（测试池会话），结论写回原任务。
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

function tool(world, name) {
  const definition = world.toolDefs.get(name);
  assert.ok(definition, `${name} should be registered`);
  return definition;
}

function run(world, agent, name, args) {
  return tool(world, name).execute(args, {
    agent,
    callId: `call-${name}`,
    signal: new AbortController().signal,
  });
}

async function completeTurn(world, engineerId, turn = 1) {
  const engineer = world.agents.get(engineerId);
  assert.ok(engineer, `engineer ${engineerId} should exist`);
  world.append(engineer.session, 'turn/start', { turn });
  world.append(engineer.session, 'turn/end', { turn, reason: { kind: 'completed' } });
  await settle(80);
}

function acceptanceOf(world, taskId) {
  return Object.values(world.stored.tasks).find((task) => task.acceptanceOf === taskId);
}

test('独立验收：开发任务成功后自动派验收任务，通过后写回原任务', async () => {
  const world = createWorld({ config: { worktree: false, acceptance: 'independent' } });
  const manager = await boot(world);

  const dev = await run(world, manager, 'paihuo_dispatch', {
    title: '实现导出功能',
    brief: '加导出按钮，验收标准：pnpm test 通过。',
  });
  await completeTurn(world, dev.engineer);
  assert.equal(world.stored.tasks[dev.task_id].status, 'done');

  const acceptance = acceptanceOf(world, dev.task_id);
  assert.ok(acceptance, 'independent 模式必须自动派验收任务');
  assert.equal(acceptance.kind, 'test');
  assert.equal(world.stored.tasks[dev.task_id].acceptanceTaskId, acceptance.taskId);
  assert.equal(world.stored.tasks[dev.task_id].acceptanceStatus, 'pending');
  assert.notEqual(acceptance.engineerId, dev.engineer, '验收必须是独立工程师');
  assert.equal(acceptance.status, 'running');

  // 经理先收到开发回报（告知已派验收），再收到验收回报。
  const managerMessages = world.prompts.filter((entry) => entry.sessionId === manager.id).map((entry) => entry.text);
  assert.ok(managerMessages.some((text) => /独立验收：已自动派 #/.test(text)));

  const acceptancePrompt = world.prompts.find((entry) => entry.sessionId === acceptance.engineerId);
  assert.ok(acceptancePrompt, '验收工程师应收到任务书');
  assert.match(acceptancePrompt.text, /独立验收 #/);
  assert.match(acceptancePrompt.text, /不要引用执行者报告里的测试结果/);

  // 验收工程师报告通过。
  await run(world, world.agents.get(acceptance.engineerId), 'paihuo_report', {
    task_id: acceptance.taskId,
    outcome: 'success',
    summary: '逐条核对通过，pnpm test 全绿。',
  });
  await completeTurn(world, acceptance.engineerId);

  assert.equal(world.stored.tasks[acceptance.taskId].status, 'done');
  assert.equal(world.stored.tasks[dev.task_id].acceptanceStatus, 'passed');
  const acceptanceReport = world.prompts
    .filter((entry) => entry.sessionId === manager.id)
    .map((entry) => entry.text)
    .find((text) => text.includes('独立验收 #'));
  assert.ok(acceptanceReport, '验收结论必须回报给经理');
  assert.match(acceptanceReport, /验收通过/);
});

test('独立验收：不通过时把结论写回原任务，并提示不要合并', async () => {
  const world = createWorld({ config: { worktree: false, acceptance: 'independent' } });
  const manager = await boot(world);

  const dev = await run(world, manager, 'paihuo_dispatch', {
    title: '实现导入功能',
    brief: '加导入按钮。',
  });
  await completeTurn(world, dev.engineer);
  const acceptance = acceptanceOf(world, dev.task_id);
  assert.ok(acceptance);

  await run(world, world.agents.get(acceptance.engineerId), 'paihuo_report', {
    task_id: acceptance.taskId,
    outcome: 'failed',
    summary: '缺少导入失败的提示，验收标准第 2 条不满足。',
  });
  await completeTurn(world, acceptance.engineerId);

  assert.equal(world.stored.tasks[dev.task_id].acceptanceStatus, 'failed');
  const report = world.prompts
    .filter((entry) => entry.sessionId === manager.id)
    .map((entry) => entry.text)
    .find((text) => text.includes('独立验收 #'));
  assert.match(report, /验收未通过/);
  assert.match(report, /不要合并\/交付/);
});

test('开发自主验收：默认不派验收任务，也不写验收状态', async () => {
  const world = createWorld({ config: { worktree: false } });
  const manager = await boot(world);

  const dev = await run(world, manager, 'paihuo_dispatch', {
    title: '实现搜索框',
    brief: '加搜索框。',
  });
  await completeTurn(world, dev.engineer);

  assert.equal(acceptanceOf(world, dev.task_id), undefined);
  assert.equal(world.stored.tasks[dev.task_id].acceptanceTaskId, undefined);
  assert.equal(Object.keys(world.stored.engineers).length, 1, '不应因为验收多出工程师');
});

test('验收任务本身不会再派验收任务（不会无限套娃）', async () => {
  const world = createWorld({ config: { worktree: false, acceptance: 'independent' } });
  const manager = await boot(world);

  const dev = await run(world, manager, 'paihuo_dispatch', { title: '实现导出', brief: '加导出。' });
  await completeTurn(world, dev.engineer);
  const acceptance = acceptanceOf(world, dev.task_id);

  await run(world, world.agents.get(acceptance.engineerId), 'paihuo_report', {
    task_id: acceptance.taskId,
    outcome: 'success',
    summary: '通过。',
  });
  await completeTurn(world, acceptance.engineerId);

  assert.equal(acceptanceOf(world, acceptance.taskId), undefined);
  assert.equal(
    Object.values(world.stored.tasks).filter((task) => task.acceptanceOf !== undefined).length,
    1,
  );
});

test('Codex 后端同样会自动派独立验收任务', async () => {
  const world = createWorld({ config: { engineerBackend: 'codex', worktree: false, acceptance: 'independent' } });
  const manager = await boot(world);

  const started = await run(world, manager, 'paihuo_dispatch', {
    title: '实现导出功能',
    brief: '执行导出改造。PAIHUO_FAKE_DELAY_MS=20',
  });
  const waitFor = async (predicate, timeoutMs = 8000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (predicate()) return;
      await settle(25);
    }
    throw new Error('waitFor timed out');
  };
  await waitFor(() => world.stored.tasks[started.task_id]?.status === 'done');

  const acceptance = Object.values(world.stored.tasks).find((task) => task.acceptanceOf === started.task_id);
  assert.ok(acceptance, 'Codex 任务成功后也要派验收任务');
  assert.equal(acceptance.kind, 'test');
  assert.equal(acceptance.backend, 'codex');

  await waitFor(() => world.stored.tasks[acceptance.taskId]?.status === 'done');
  assert.equal(world.stored.tasks[acceptance.taskId].report.outcome, 'success');
  assert.equal(world.stored.tasks[started.task_id].acceptanceStatus, 'passed');
});
