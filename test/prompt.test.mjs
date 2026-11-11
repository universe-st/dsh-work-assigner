import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildCodexTaskPrompt, buildManagerSection, buildReportMessage, buildTodoCheckReminder } from '../lib/prompt.js';

function fakeRuntime() {
  return {
    config: {
      managerSection: null,
      engineerSection: null,
      engineerModels: [],
      worktree: true,
      workstationsPerProject: 2,
      totalWorkstations: 4,
      serializedResources: ['browser', 'env127'],
    },
    store: {
      get: () => ({
        tasks: {
          t1: { taskId: 't1', managerId: 'm', status: 'running', title: '任务一' },
        },
        engineers: {
          e1: {
            sessionId: 'session-e1',
            managerId: 'm',
            projectPath: 'D:\\Workspace\\proj',
            status: 'running',
            activeTaskId: 't1',
            queue: [],
            model: null,
            worktree: null,
          },
        },
      }),
    },
  };
}

test('manager prompt section is static while task state changes', () => {
  const runtime = fakeRuntime();
  const first = buildManagerSection(runtime);

  // 模拟派发并开工后的下一步：任务与工程师都变了，但提示段必须一字节不差，
  // 否则整段 system prompt 会变，DSH 每一步重装配时就会丢掉全部前缀缓存。
  runtime.store.get = () => ({
    tasks: {
      t1: { taskId: 't1', managerId: 'm', status: 'done', title: '任务一' },
      t2: { taskId: 't2', managerId: 'm', status: 'queued', title: '任务二' },
    },
    engineers: {
      e1: {
        sessionId: 'session-e1',
        managerId: 'm',
        projectPath: 'D:\\Workspace\\proj',
        status: 'idle',
        queue: ['t2'],
        model: null,
        worktree: { path: 'D:\\Workspace\\.paihuo-worktrees\\proj-t2', branch: 'paihuo/t2', baseCommit: 'abc123' },
      },
    },
  });
  const second = buildManagerSection(runtime);

  assert.equal(second, first);
  assert.doesNotMatch(first, /当前运行/);
  assert.doesNotMatch(first, /在册工程师/);
  // 问题表与待办提示必须是静态文本，不能随实时待办/问题数变化。
  assert.match(first, /paihuo_todo/);
  assert.match(first, /ask_user_question/);
  assert.match(first, /问题表/);
  assert.match(first, /不要用 `todo_write`/);
  assert.match(first, /env127/);
  assert.match(first, /共享环境/);
  assert.match(first, /强制核对/);
  // 任务书不得把经理会话的对话事件写进去：工程师没有上文，会把「用户已核实」当成既定事实。
  assert.match(first, /不要出现「用户已核实/);
  assert.match(first, /一条命令或一次查询/);
  assert.match(first, /现状 \+ 不要做什么/);
});

test('completion report is compact and points at paihuo_task', () => {
  const task = {
    taskId: 't7',
    title: '长报告',
    status: 'done',
    projectPath: 'D:\\Workspace\\proj',
    baseBranch: 'main',
    report: {
      outcome: 'success',
      summary: '摘'.repeat(5000),
      changes: Array.from({ length: 20 }, (_, index) => `signage-frontend/src/views/very-long-file-${index}.vue`),
      tests: '测'.repeat(3000),
      blockers: '阻'.repeat(3000),
    },
  };
  const text = buildReportMessage(task, { sessionId: 'session-e1', worktree: { branch: 'paihuo/t7' } });

  // 回报会永久留在经理上下文里，必须保持紧凑（修复前最长 9k 字符）。
  assert.ok(text.length < 2200, `report too long: ${text.length}`);
  assert.match(text, /paihuo_task/);
  assert.match(text, /"task_id": "t7"/);
  assert.match(text, /等 20 项/);
});

test('report does not suggest integrating a main-workspace commit', () => {
  const task = {
    taskId: 't8',
    title: '部署验证',
    status: 'done',
    projectPath: 'D:\\Workspace\\proj',
    baseBranch: 'master',
    report: { outcome: 'success', summary: '已完成', branch: 'master' },
  };
  const text = buildReportMessage(task, { sessionId: 'session-e1', worktree: null });
  assert.doesNotMatch(text, /paihuo_integrate/);
  assert.doesNotMatch(text, /验收后用/);
});

test('integration report says the branch is already merged', () => {
  const task = {
    taskId: 't9',
    title: '合并 paihuo/t9 → master',
    status: 'done',
    projectPath: 'D:\\Workspace\\proj',
    baseBranch: 'master',
    integration: { sourceTaskId: 't7', branch: 'paihuo/t7', target: 'master' },
    report: { outcome: 'success', summary: '合并完成', branch: 'master' },
  };
  const text = buildReportMessage(task, { sessionId: 'session-e2', worktree: null });
  assert.match(text, /已合入/);
  assert.doesNotMatch(text, /验收后用/);
  assert.doesNotMatch(text, /目标分支：master（验收后/);
});

test('codex task prompt asks for a final answer instead of paihuo_report', () => {
  const task = {
    taskId: 't11',
    title: 'Codex 任务',
    projectPath: 'D:\\Workspace\\proj',
    baseBranch: 'main',
    brief: '改 README。',
  };
  const engineer = {
    sessionId: 'codex-run-1',
    worktree: { path: 'D:\\Workspace\\.paihuo-worktrees\\proj-t11', branch: 'paihuo/t11', baseCommit: 'abc' },
  };
  const text = buildCodexTaskPrompt(task, engineer);
  assert.match(text, /派活任务 #t11/);
  assert.match(text, /最终回答/);
  assert.match(text, /git add -A && git commit/);
  assert.doesNotMatch(text, /必须调用 `paihuo_report`/);
  assert.doesNotMatch(text, /paihuo_report/);
  // Codex 没有任何 paihuo 工具，也不认识「派活」；任务书里提到专用工具只会制造干扰。
  assert.doesNotMatch(text, /paihuo_/);
  assert.doesNotMatch(text, /DSH 专用工具/);
});

test('codex report keeps the client card contract and skips unreported wording', () => {
  const task = {
    taskId: 't12',
    title: 'Codex 任务',
    status: 'done',
    backend: 'codex',
    engineerId: 'codex-t12',
    codexSessionId: 'fake-thread-1',
    projectPath: 'D:\\Workspace\\proj',
    baseBranch: 'main',
    worktree: { path: 'D:\\Workspace\\.paihuo-worktrees\\proj-t12', branch: 'paihuo/t12' },
    report: { outcome: 'success', summary: '完成。', branch: 'paihuo/t12' },
  };
  const text = buildReportMessage(task, undefined);
  assert.match(text, /- 工程师：Codex 工程师 codex-t12/);
  assert.match(text, /- 后端：Codex 工程师（CLI）/);
  assert.doesNotMatch(text, /未显式调用报告工具/);
  assert.match(text, /paihuo_integrate/);
});

test('todo check reminder tells the manager to list and reconcile', () => {
  const text = buildTodoCheckReminder();
  assert.match(text, /不是用户消息/);
  assert.match(text, /paihuo_todo/);
  assert.match(text, /action": "list/);
  assert.match(text, /paihuo_tasks/);
  assert.match(text, /paihuo_engineers/);
  assert.match(text, /强制核对/);
});
