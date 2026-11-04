import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { MANIFEST, PaihuoRemote, REMOTE_DESCRIPTOR, REMOTE_METHOD_ID } from '../lib/remote.js';

test('host manifest exposes the read-only todos method', () => {
  assert.equal(MANIFEST.package, 'dsh-paihuo');
  assert.equal(MANIFEST.face, 'host');
  assert.equal(MANIFEST.invocations.length, 1);
  const [invocation] = MANIFEST.invocations;
  assert.equal(invocation.id, REMOTE_METHOD_ID);
  assert.equal(invocation.service, 'paihuo');
  assert.equal(invocation.namespace, 'paihuo');
  assert.equal(invocation.method, 'todos');
  assert.equal(invocation.invocation.kind, 'direct');
  assert.equal(invocation.parameters.length, 1);
  assert.equal(invocation.parameters[0].source, 'json');
  assert.equal(invocation.result.create().parse({ todos: [], counts: {
    pending: 0, inProgress: 0, paused: 0, completed: 0, open: 0,
  } }).todos.length, 0);
  assert.deepEqual(REMOTE_DESCRIPTOR, {
    id: REMOTE_METHOD_ID,
    service: 'paihuo',
    namespace: 'paihuo',
    method: 'todos',
  });
  assert.equal(typeof PaihuoRemote.prototype.todos, 'function');
});

test('client contribution and header slots stay wired to the same ids', () => {
  const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
  assert.match(source, /paihuo\/todos/);
  assert.match(source, /REMOTE_METHOD_ID/);
  assert.match(source, /conversation\.session\.header\.utilities/);
  assert.match(source, /paihuo-questions/);
  assert.match(source, /paihuo-todos/);
  assert.match(source, /userQuestions/);
  assert.match(source, /userQuestionPanels/);
});
