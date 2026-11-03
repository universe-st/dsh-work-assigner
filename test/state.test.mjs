import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createEmptyState,
  createStateStore,
  hydrateState,
  nextTaskId,
  pruneTasks,
} from '../lib/state.js';

function task(overrides) {
  return {
    taskId: 't1',
    managerId: 'm1',
    engineerId: null,
    title: '任务',
    brief: '说明',
    projectPath: 'C:\\work\\demo',
    projectKey: 'c:\\work\\demo',
    model: null,
    priority: 'normal',
    resources: [],
    useWorktree: false,
    status: 'queued',
    createdAt: 1,
    ...overrides,
  };
}

test('empty state validates', () => {
  const state = createEmptyState();
  const hydrated = hydrateState(state);
  assert.equal(hydrated.recovered, false);
  assert.deepEqual(hydrated.state, state);
});

test('corrupt state falls back instead of throwing', () => {
  const hydrated = hydrateState({ version: 99 });
  assert.equal(hydrated.recovered, true);
  assert.deepEqual(hydrated.state, createEmptyState());
});

test('task ids are monotonic', () => {
  const state = createEmptyState();
  assert.equal(nextTaskId(state), 't1');
  assert.equal(nextTaskId(state), 't2');
  assert.equal(state.nextSeq, 3);
});

test('pruneTasks keeps recent finals and repairs engineer references', () => {
  const state = createEmptyState();
  state.tasks.t1 = task({ taskId: 't1', status: 'done', endedAt: 1 });
  state.tasks.t2 = task({ taskId: 't2', status: 'done', endedAt: 2 });
  state.tasks.t3 = task({ taskId: 't3', status: 'running', endedAt: 3 });
  state.engineers.e1 = {
    sessionId: 'e1',
    managerId: 'm1',
    projectPath: 'C:\\work\\demo',
    projectKey: 'c:\\work\\demo',
    model: null,
    worktree: null,
    status: 'idle',
    queue: ['t1', 't3'],
    activeTaskId: 't1',
    createdAt: 1,
  };
  const removed = pruneTasks(state, 2);
  assert.deepEqual(removed, ['t1']);
  assert.equal(state.tasks.t1, undefined);
  assert.deepEqual(state.engineers.e1.queue, ['t3']);
  assert.equal(state.engineers.e1.activeTaskId, undefined);
});

test('state store serializes writes', async () => {
  const writes = [];
  const store = createStateStore(createEmptyState(), async (snapshot) => {
    writes.push(snapshot.version);
  });
  store.get().nextSeq = 5;
  await store.save();
  await store.save();
  assert.deepEqual(writes, [1, 1]);
  assert.equal(store.get().nextSeq, 5);
});
