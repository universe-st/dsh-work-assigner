import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildManagerSection, buildReportMessage } from '../lib/prompt.js';

function fakeRuntime() {
  return {
    config: {
      managerSection: null,
      engineerSection: null,
      engineerModels: [],
      worktree: true,
      workstationsPerProject: 2,
      totalWorkstations: 4,
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
