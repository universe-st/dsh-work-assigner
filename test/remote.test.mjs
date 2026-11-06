import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  MANIFEST,
  PaihuoRemote,
  REMOTE_CODEX_MODELS_DESCRIPTOR,
  REMOTE_CODEX_MODELS_METHOD_ID,
  REMOTE_CODEX_SESSIONS_DESCRIPTOR,
  REMOTE_CODEX_SESSIONS_METHOD_ID,
  REMOTE_CODEX_TRANSCRIPT_DESCRIPTOR,
  REMOTE_CODEX_TRANSCRIPT_METHOD_ID,
  REMOTE_DESCRIPTOR,
  REMOTE_METHOD_ID,
} from '../lib/remote.js';

test('host manifest exposes the read-only todos, codex sessions and models methods', () => {
  assert.equal(MANIFEST.package, 'dsh-paihuo');
  assert.equal(MANIFEST.face, 'host');
  assert.equal(MANIFEST.invocations.length, 4);
  const byId = new Map(MANIFEST.invocations.map((invocation) => [invocation.id, invocation]));

  const todos = byId.get(REMOTE_METHOD_ID);
  assert.ok(todos);
  assert.equal(todos.service, 'paihuo');
  assert.equal(todos.namespace, 'paihuo');
  assert.equal(todos.method, 'todos');
  assert.equal(todos.invocation.kind, 'direct');
  assert.equal(todos.parameters.length, 1);
  assert.equal(todos.parameters[0].source, 'json');
  assert.equal(todos.result.create().parse({ todos: [], counts: {
    pending: 0, inProgress: 0, paused: 0, completed: 0, open: 0,
  } }).todos.length, 0);

  const sessions = byId.get(REMOTE_CODEX_SESSIONS_METHOD_ID);
  assert.ok(sessions);
  assert.equal(sessions.method, 'codexSessions');
  assert.equal(sessions.result.create().parse({ enabled: false, sessions: [] }).sessions.length, 0);

  const transcript = byId.get(REMOTE_CODEX_TRANSCRIPT_METHOD_ID);
  assert.ok(transcript);
  assert.equal(transcript.method, 'codexTranscript');
  assert.deepEqual(transcript.result.create().parse({ session: null, entries: [], truncated: false }), {
    session: null, entries: [], truncated: false,
  });

  const models = byId.get(REMOTE_CODEX_MODELS_METHOD_ID);
  assert.ok(models);
  assert.equal(models.method, 'codexModels');
  assert.deepEqual(models.result.create().parse({
    models: [{
      id: 'gpt-test',
      name: 'GPT Test',
      description: '',
      reasoningLevels: [{ effort: 'low', description: 'fast' }],
      defaultReasoningLevel: 'low',
    }],
    error: null,
  }).models[0].id, 'gpt-test');

  assert.deepEqual(REMOTE_DESCRIPTOR, {
    id: REMOTE_METHOD_ID,
    service: 'paihuo',
    namespace: 'paihuo',
    method: 'todos',
  });
  assert.deepEqual(REMOTE_CODEX_SESSIONS_DESCRIPTOR, {
    id: REMOTE_CODEX_SESSIONS_METHOD_ID,
    service: 'paihuo',
    namespace: 'paihuo',
    method: 'codexSessions',
  });
  assert.deepEqual(REMOTE_CODEX_TRANSCRIPT_DESCRIPTOR, {
    id: REMOTE_CODEX_TRANSCRIPT_METHOD_ID,
    service: 'paihuo',
    namespace: 'paihuo',
    method: 'codexTranscript',
  });
  assert.deepEqual(REMOTE_CODEX_MODELS_DESCRIPTOR, {
    id: REMOTE_CODEX_MODELS_METHOD_ID,
    service: 'paihuo',
    namespace: 'paihuo',
    method: 'codexModels',
  });
  assert.equal(typeof PaihuoRemote.prototype.todos, 'function');
  assert.equal(typeof PaihuoRemote.prototype.codexSessions, 'function');
  assert.equal(typeof PaihuoRemote.prototype.codexTranscript, 'function');
  assert.equal(typeof PaihuoRemote.prototype.codexModels, 'function');
});

test('client contribution and header slots stay wired to the same ids', () => {
  const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
  assert.match(source, /paihuo\/todos/);
  assert.match(source, /paihuo\/codexSessions/);
  assert.match(source, /paihuo\/codexTranscript/);
  assert.match(source, /paihuo\/codexModels/);
  assert.match(source, /REMOTE_METHOD_ID/);
  assert.match(source, /conversation\.session\.header\.utilities/);
  assert.match(source, /paihuo-questions/);
  assert.match(source, /paihuo-todos/);
  assert.match(source, /paihuo-codex/);
  assert.match(source, /userQuestions/);
  assert.match(source, /userQuestionPanels/);
});
