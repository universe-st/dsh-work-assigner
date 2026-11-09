import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isEngineerWorking, managerActivity } from '../lib/activity.js';

function engineer(overrides = {}) {
  return {
    sessionId: 'e1',
    managerId: 'm1',
    status: 'idle',
    queue: [],
    backend: 'session',
    createdAt: 0,
    ...overrides,
  };
}

function state(engineers) {
  return { engineers: Object.fromEntries(engineers.map((entry) => [entry.sessionId, entry])) };
}

test('idle engineers are not counted', () => {
  assert.equal(isEngineerWorking({}, engineer()), false);
  assert.deepEqual(managerActivity(state([engineer()]), {}), { managers: [] });
});

test('running tasks count as working and group by manager', () => {
  const activity = managerActivity(state([
    engineer({ sessionId: 'e1', managerId: 'm1', status: 'running' }),
    engineer({ sessionId: 'e2', managerId: 'm1', status: 'running' }),
    engineer({ sessionId: 'e3', managerId: 'm2', status: 'running' }),
  ]), {});
  const byId = new Map(activity.managers.map((entry) => [entry.managerId, entry]));
  assert.equal(byId.get('m1').runningEngineers, 2);
  assert.equal(byId.get('m1').sessionEngineers, 2);
  assert.equal(byId.get('m1').codexEngineers, 0);
  assert.equal(byId.get('m2').runningEngineers, 1);
});

test('a session engineer sitting in an active turn counts even while idle', () => {
  const target = engineer({ status: 'idle' });
  const runtime = { currentTurn: new Map([['e1', 4]]) };
  assert.equal(isEngineerWorking(runtime, target), true);
  assert.equal(managerActivity(state([target]), runtime).managers[0].runningEngineers, 1);
});

test('a bound supplement turn counts as working', () => {
  const target = engineer({ status: 'idle', supplement: { at: 1, turn: 7 } });
  assert.equal(isEngineerWorking({}, target), true);
});

test('a Codex supplement run counts as codex work', () => {
  const target = engineer({ status: 'idle', backend: 'codex' });
  const runtime = { runs: new Map([['supplement:e1', { cancel() {} }]]) };
  assert.equal(isEngineerWorking(runtime, target), true);
  const activity = managerActivity(state([target]), runtime);
  assert.equal(activity.managers[0].codexEngineers, 1);
  assert.equal(activity.managers[0].sessionEngineers, 0);
});

test('engineers without a manager id are ignored', () => {
  assert.deepEqual(managerActivity(state([
    engineer({ managerId: '' }),
  ]), {}), { managers: [] });
});
