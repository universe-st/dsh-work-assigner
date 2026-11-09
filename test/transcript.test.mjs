import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createCodexTranscripts } from '../lib/codexTranscripts.js';

function fakeRuntime() {
  const state = {
    engineers: {
      'codex-t1': {
        sessionId: 'codex-t1',
        managerId: 'm1',
        projectPath: 'D:\\Workspace\\proj',
        projectKey: 'd:\\workspace\\proj',
        backend: 'codex',
        codexSessionId: 'thread-1',
        codexModel: 'gpt-5-codex',
        status: 'running',
        activeTaskId: 't1',
        queue: [],
        model: null,
        worktree: { path: 'D:\\Workspace\\.paihuo-worktrees\\proj-t1', branch: 'paihuo/t1' },
        createdAt: 1,
      },
      'codex-t2': {
        sessionId: 'codex-t2',
        managerId: 'm2',
        projectPath: 'D:\\Workspace\\other',
        projectKey: 'd:\\workspace\\other',
        backend: 'codex',
        status: 'idle',
        queue: [],
        model: null,
        worktree: null,
        createdAt: 2,
      },
    },
    tasks: {
      t1: { taskId: 't1', title: '任务一', status: 'running' },
    },
  };
  return {
    config: { codexTranscriptOutput: true, codexModel: null },
    store: { get: () => state },
    logger: { warn() {} },
  };
}

test('codex transcripts record readable messages, commands and errors', () => {
  const runtime = fakeRuntime();
  const ui = createCodexTranscripts(runtime);
  const engineer = runtime.store.get().engineers['codex-t1'];

  ui.recordUser(engineer, '把 README 改好。', '任务 #t1');
  ui.recordAssistant(engineer, '我先看看 README。');
  const commandId = ui.startCommand(engineer, 'Get-Content README.md');
  ui.finishCommand(engineer, commandId, { output: 'hello\n', exitCode: 0, status: 'completed' });
  ui.recordError(engineer, '一个无害的错误事件');

  const sessions = ui.sessions('m1');
  assert.equal(sessions.enabled, true);
  assert.equal(sessions.sessions.length, 1);
  assert.equal(sessions.sessions[0].engineerId, 'codex-t1');
  assert.equal(sessions.sessions[0].sessionId, 'thread-1');
  assert.equal(sessions.sessions[0].model, 'gpt-5-codex');
  assert.equal(sessions.sessions[0].entryCount, 4);

  const transcript = ui.transcript('m1', 'codex-t1');
  assert.equal(transcript.session.engineerId, 'codex-t1');
  assert.equal(transcript.entries[0].kind, 'user');
  assert.equal(transcript.entries[0].label, '任务 #t1');
  assert.equal(transcript.entries[1].kind, 'assistant');
  assert.equal(transcript.entries[2].kind, 'command');
  assert.equal(transcript.entries[2].output, 'hello\n');
  assert.equal(transcript.entries[3].kind, 'error');

  // 跨经理/非 Codex 工程师不泄露转录。
  assert.deepEqual(ui.transcript('m2', 'codex-t1'), { session: null, entries: [] });
  assert.deepEqual(ui.sessions('m2').sessions.length, 1);
  assert.equal(ui.sessions('m2').sessions[0].engineerId, 'codex-t2');
});

test('codex transcript can omit command output and keeps every entry in full', () => {
  const runtime = fakeRuntime();
  runtime.config.codexTranscriptOutput = false;
  const ui = createCodexTranscripts(runtime);
  const engineer = runtime.store.get().engineers['codex-t1'];

  const commandId = ui.startCommand(engineer, 'echo secret');
  ui.finishCommand(engineer, commandId, { output: 'TOP_SECRET', exitCode: 0, status: 'completed' });
  assert.equal(ui.transcript('m1', 'codex-t1').entries[0].output, undefined);

  // 不再按条数截断：300 条消息全部保留，最近的一条仍在末尾。
  for (let index = 0; index < 300; index += 1) {
    ui.recordAssistant(engineer, `message ${index}`);
  }
  const transcript = ui.transcript('m1', 'codex-t1');
  assert.equal(transcript.entries.length, 301);
  assert.equal(transcript.truncated, undefined);
  assert.match(transcript.entries[transcript.entries.length - 1].text, /message 299/);

  // 不再按字符数截断：超长回复与命令输出原样保留。
  runtime.config.codexTranscriptOutput = true;
  const longText = 'x'.repeat(20_000);
  ui.recordAssistant(engineer, longText);
  const longCommandId = ui.startCommand(engineer, 'run big');
  const longOutput = 'y'.repeat(100_000);
  ui.finishCommand(engineer, longCommandId, { output: longOutput, exitCode: 0, status: 'completed' });
  const latest = ui.transcript('m1', 'codex-t1').entries;
  assert.equal(latest[latest.length - 2].text, longText);
  assert.equal(latest[latest.length - 1].output, longOutput);
});

test('codex transcript persists through a table and deletes on release', async () => {
  const runtime = fakeRuntime();
  const records = new Map();
  const table = {
    entries: () => [...records.entries()][Symbol.iterator](),
    get: (key) => records.get(key),
    put: async (key, value) => {
      records.set(key, value);
    },
    delete: async (key) => records.delete(key),
  };
  const ui = createCodexTranscripts(runtime);
  ui.load(table);
  const engineer = runtime.store.get().engineers['codex-t1'];
  ui.recordAssistant(engineer, '持久化内容');
  await ui.flush();
  assert.ok(records.has('codex-t1'));

  const reloaded = createCodexTranscripts(runtime);
  reloaded.load(table);
  assert.equal(reloaded.transcript('m1', 'codex-t1').entries[0].text, '持久化内容');

  ui.delete('codex-t1');
  assert.equal(records.has('codex-t1'), false);
  assert.equal(ui.transcript('m1', 'codex-t1').entries.length, 0);
});

test('legacy transcripts drop the old truncated flag on load', () => {
  const runtime = fakeRuntime();
  const records = new Map([['codex-t1', {
    engineerId: 'codex-t1',
    sessionId: 'thread-1',
    model: 'gpt-5-codex',
    updatedAt: 7,
    entryCount: 1,
    truncated: true,
    entries: [{ id: 'e1', kind: 'assistant', label: 'Codex', text: '旧记录', at: 7 }],
  }]]);
  const table = {
    entries: () => [...records.entries()][Symbol.iterator](),
    get: (key) => records.get(key),
    put: async () => {},
    delete: async () => {},
  };
  const ui = createCodexTranscripts(runtime);
  ui.load(table);
  const transcript = ui.transcript('m1', 'codex-t1');
  assert.equal(transcript.entries.length, 1);
  assert.equal(transcript.entries[0].text, '旧记录');
  assert.equal(transcript.truncated, undefined);
});
