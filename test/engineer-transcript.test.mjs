import assert from 'node:assert/strict';
import { test } from 'node:test';

import { apply } from '../lib/index.js';
import {
  argumentDigest,
  readEngineerTranscript,
  transcriptEntriesFromEvents,
  normalizeTranscriptLimit,
} from '../lib/engineerTranscripts.js';
import { createWorld, settle } from './harness.mjs';

function event(type, data) {
  return { type, seq: 1, time: 0, data };
}

function textBlock(text) {
  return { type: 'text', text };
}

function fakeSessionRuntime(events) {
  return {
    ctx: {
      sessions: { get: () => ({ events }) },
      get: () => undefined,
    },
  };
}

const SESSION_ENGINEER = { sessionId: 'session-engineer-1', managerId: 'm1', backend: 'session', status: 'running' };

test('session events become readable transcript entries', () => {
  const entries = transcriptEntriesFromEvents([
    event('turn/start', { turn: 1 }),
    event('user/message', {
      role: 'user',
      content: [textBlock('【派活任务 #t1】任务 A\n\n## 任务说明\n执行任务 A。')],
      source: { kind: 'user' },
    }),
    event('assistant/message', {
      turn: 1,
      step: 1,
      message: { role: 'assistant', content: [textBlock('我先看看仓库结构。'), { type: 'reasoning', text: '内部推理' }] },
    }),
    event('tool/call', { turn: 1, step: 2, callId: 'c1', name: 'pwsh', arguments: '{"command":"npm test"}' }),
    event('tool/result', {
      turn: 1,
      step: 2,
      message: { role: 'tool', toolCallId: 'c1', content: [textBlock('所有测试通过')], isError: false },
    }),
    event('tool/call', { turn: 1, step: 3, callId: 'c2', name: 'read', arguments: '{"path":"lib/index.js"}' }),
    event('tool/result', {
      turn: 1,
      step: 3,
      message: { role: 'tool', toolCallId: 'c2', content: [textBlock('ENOENT')], isError: true },
      error: { name: 'FsError', code: 'FS_NOT_FOUND' },
    }),
    event('assistant/message', {
      turn: 1,
      step: 4,
      interrupted: true,
      message: { role: 'assistant', content: [textBlock('被打断的半句')] },
    }),
  ]);

  assert.equal(entries.length, 5);
  assert.deepEqual(entries[0], { kind: 'user', label: '任务书', text: '【派活任务 #t1】任务 A\n\n## 任务说明\n执行任务 A。' });
  assert.equal(entries[1].kind, 'assistant');
  assert.equal(entries[1].text, '我先看看仓库结构。');
  assert.deepEqual(entries[2], { kind: 'tool', label: 'pwsh', text: 'npm test' });
  assert.equal(entries[3].kind, 'tool');
  assert.equal(entries[3].text, 'lib/index.js');
  // 成功的工具结果不进来，失败的才留一行。
  assert.equal(entries.length, 5);
  assert.equal(entries[4].kind, 'error');
  assert.equal(entries[4].text, 'ENOENT');
});

test('manager messages and assistant text are labelled for the manager', () => {
  const entries = transcriptEntriesFromEvents([
    event('user/message', { role: 'user', content: [textBlock('【经理补充】\n请先跑测试')], source: { kind: 'user' } }),
    event('user/message', { role: 'user', content: [textBlock('【派活系统提醒】...')], source: { kind: 'plugin' } }),
    event('assistant/message', { turn: 2, step: 1, message: { role: 'assistant', content: [textBlock('收到')] } }),
  ]);
  assert.deepEqual(entries.map((entry) => entry.label), ['经理补充', '派活系统', '工程师']);
});

test('argumentDigest prefers commands and paths, and tolerates unparsable arguments', () => {
  assert.equal(argumentDigest('{"path":"D:/x.js"}'), 'D:/x.js');
  assert.equal(argumentDigest({ command: 'Get-ChildItem  -Recurse' }), 'Get-ChildItem -Recurse');
  assert.equal(argumentDigest('not json'), 'not json');
  assert.equal(argumentDigest(''), '');
  assert.equal(argumentDigest(undefined), '');
});

test('transcript entries are clipped so a huge message does not flood the manager', () => {
  const long = 'x'.repeat(5000);
  const entries = transcriptEntriesFromEvents([
    event('assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content: [textBlock(long)] } }),
  ]);
  assert.ok(entries[0].text.length < long.length);
  assert.match(entries[0].text, /…$/);
});

test('normalizeTranscriptLimit keeps a sane window', () => {
  assert.equal(normalizeTranscriptLimit(undefined), 12);
  assert.equal(normalizeTranscriptLimit(0), 12);
  assert.equal(normalizeTranscriptLimit(-5), 12);
  assert.equal(normalizeTranscriptLimit('7'), 7);
  assert.equal(normalizeTranscriptLimit(1000), 40);
});

test('readEngineerTranscript takes the tail and can hide tool activity', async () => {
  const events = [];
  for (let index = 0; index < 6; index += 1) {
    events.push(event('assistant/message', {
      turn: 1,
      step: index,
      message: { role: 'assistant', content: [textBlock(`第 ${index} 步`)] },
    }));
    events.push(event('tool/call', { turn: 1, step: index, callId: `c${index}`, name: 'pwsh', arguments: '{"command":"npm test"}' }));
  }
  const runtime = fakeSessionRuntime(events);
  const tail = await readEngineerTranscript(runtime, SESSION_ENGINEER, { limit: 3 });
  assert.equal(tail.total, 12);
  // 事件按序是 a0、工具0、a1、工具1…，取尾三条就是工具4、a5、工具5。
  assert.deepEqual(tail.entries.map((entry) => entry.text), ['npm test', '第 5 步', 'npm test']);

  const speechOnly = await readEngineerTranscript(runtime, SESSION_ENGINEER, { limit: 3, includeTools: false });
  assert.equal(speechOnly.total, 6);
  assert.deepEqual(speechOnly.entries.map((entry) => entry.text), ['第 3 步', '第 4 步', '第 5 步']);
});

test('readEngineerTranscript reads the codex transcript for Codex engineers', async () => {
  const runtime = {
    ctx: { sessions: { get: () => undefined }, get: () => undefined },
    codexUi: {
      transcript: (managerId, engineerId) => ({ 
        session: { engineerId },
        entries: [
          { kind: 'user', label: '任务 #t1', text: '把 README 改好。' },
          { kind: 'assistant', label: 'Codex', text: '我先看看 README。' },
          { kind: 'command', label: '命令', text: 'Get-Content README.md', command: 'Get-Content README.md', exitCode: 0, output: 'hello' },
          { kind: 'error', text: '一个错误事件' },
        ],
      }),
    },
  };
  const engineer = { sessionId: 'codex-t1', managerId: 'm1', backend: 'codex', status: 'running' };
  const result = await readEngineerTranscript(runtime, engineer, { limit: 10 });
  assert.equal(result.total, 4);
  assert.deepEqual(result.entries.map((entry) => entry.kind), ['user', 'assistant', 'tool', 'error']);
  assert.equal(result.entries[2].text, 'Get-Content README.md（exit 0）');
  // 命令输出不随转录返回，经理看的是「跑了什么」，不是输出全文。
  assert.doesNotMatch(JSON.stringify(result.entries), /hello/);
});

test('paihuo_transcript exposes a running engineer conversation to its manager', async () => {
  const world = createWorld({ config: { worktree: false } });
  apply(world.ctx, world.config);
  await settle();
  const manager = world.ensureAgent('session-manager');
  const entered = await world.ctx.commands.execute(manager, '/paihuo on', []);
  assert.equal(entered.result.kind, 'success', entered.result.text);

  const dispatched = await world.toolDefs.get('paihuo_dispatch').execute(
    { title: '任务 A', brief: '执行任务 A。' },
    { agent: manager, callId: 'call-dispatch', signal: new AbortController().signal },
  );
  assert.equal(dispatched.task_id, 't1');
  const engineer = world.agents.get(dispatched.engineer);
  assert.ok(engineer, 'dispatch must create the engineer agent');

  world.append(engineer.session, 'turn/start', { turn: 1 });
  world.append(engineer.session, 'user/message', {
    role: 'user',
    content: [textBlock('【派活任务 #t1】任务 A\n\n## 任务说明\n执行任务 A。')],
    source: { kind: 'user' },
  });
  world.append(engineer.session, 'assistant/message', {
    turn: 1,
    step: 1,
    message: { role: 'assistant', content: [textBlock('我先看一下 lib 目录。')] },
  });
  world.append(engineer.session, 'tool/call', {
    turn: 1,
    step: 2,
    callId: 'call-1',
    name: 'pwsh',
    arguments: '{"command":"npm test"}',
  });

  const tool = world.toolDefs.get('paihuo_transcript');
  assert.ok(tool, 'paihuo_transcript must be registered for the manager');
  const view = await tool.execute(
    { task_id: 't1' },
    { agent: manager, callId: 'call-transcript', signal: new AbortController().signal },
  );
  assert.equal(view.engineer_id, dispatched.engineer);
  assert.equal(view.backend, 'session');
  assert.equal(view.working, true);
  assert.match(view.text, /我先看一下 lib 目录/);
  assert.match(view.text, /工具 pwsh：npm test/);
  assert.match(view.text, /当前任务：#t1「任务 A」/);

  const speechOnly = await tool.execute(
    { engineer: dispatched.engineer, include_tools: false },
    { agent: manager, callId: 'call-transcript-2', signal: new AbortController().signal },
  );
  assert.doesNotMatch(speechOnly.text, /npm test/);
  assert.match(speechOnly.text, /我先看一下 lib 目录/);

  // 工程师正忙时派到同一工程师的任务会排队：按任务查看必须说明看到的是别的对话。
  const queued = await world.toolDefs.get('paihuo_dispatch').execute(
    { title: '任务 B', brief: '执行任务 B。', engineer: dispatched.engineer },
    { agent: manager, callId: 'call-dispatch-2', signal: new AbortController().signal },
  );
  assert.equal(queued.status, 'queued');
  const queuedView = await tool.execute(
    { task_id: queued.task_id },
    { agent: manager, callId: 'call-transcript-queued', signal: new AbortController().signal },
  );
  assert.match(queuedView.text, /任务 #t2 当前是 queued/);

  // 跨经理访问被拒绝。
  const other = world.ensureAgent('session-other');
  await world.ctx.commands.execute(other, '/paihuo on', []);
  await assert.rejects(
    () => tool.execute(
      { task_id: 't1' },
      { agent: other, callId: 'call-transcript-3', signal: new AbortController().signal },
    ),
    /不属于当前经理/,
  );
});
