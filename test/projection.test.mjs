import assert from 'node:assert/strict';
import { test } from 'node:test';

import { paihuoProjection, parseCommandArgs } from '../lib/projection.js';

function run(state, event) {
  return paihuoProjection.apply(state, event);
}

test('parseCommandArgs covers the documented forms', () => {
  assert.deepEqual(parseCommandArgs(''), { kind: 'on', force: false, taskId: '' });
  assert.equal(parseCommandArgs('on').kind, 'on');
  assert.deepEqual(parseCommandArgs('off'), { kind: 'off', force: false, taskId: '' });
  assert.equal(parseCommandArgs('off force').force, true);
  assert.equal(parseCommandArgs('status').kind, 'status');
  assert.deepEqual(parseCommandArgs('engineer t7'), { kind: 'engineer', force: false, taskId: 't7' });
  assert.equal(parseCommandArgs('nope').kind, 'unknown');
});

test('projection commits the role only after a successful command', () => {
  let state = paihuoProjection.init();
  state = run(state, { type: 'command/run', data: { name: 'paihuo', args: 'on', commandId: 'c1' } });
  assert.equal(state.role, 'none');
  state = run(state, { type: 'command/done', data: { commandId: 'c1', kind: 'success' } });
  assert.equal(state.role, 'manager');
  assert.equal(state.running, null);
});

test('failed or unrelated commands keep the current role', () => {
  let state = { role: 'manager', running: null };
  state = run(state, { type: 'command/run', data: { name: 'paihuo', args: 'off', commandId: 'c2' } });
  state = run(state, { type: 'command/done', data: { commandId: 'c2', kind: 'error' } });
  assert.equal(state.role, 'manager');
  state = run(state, { type: 'command/run', data: { name: 'plan', args: 'off', commandId: 'c3' } });
  assert.equal(state.running, null);
  state = run(state, { type: 'command/done', data: { commandId: 'c3', kind: 'success' } });
  assert.equal(state.role, 'manager');
});

test('status keeps the role and engineer sets it', () => {
  let state = { role: 'none', running: null };
  state = run(state, { type: 'command/run', data: { name: 'paihuo', args: 'status', commandId: 'c4' } });
  state = run(state, { type: 'command/done', data: { commandId: 'c4', kind: 'success' } });
  assert.equal(state.role, 'none');

  state = run(state, { type: 'command/run', data: { name: 'paihuo', args: 'engineer t1', commandId: 'c5' } });
  state = run(state, { type: 'command/done', data: { commandId: 'c5', kind: 'success' } });
  assert.equal(state.role, 'engineer');

  state = run(state, { type: 'command/run', data: { name: 'paihuo', args: 'off', commandId: 'c6' } });
  state = run(state, { type: 'command/done', data: { commandId: 'c6', kind: 'success' } });
  assert.equal(state.role, 'none');
});

test('in-session preset switches are folded for role detection', () => {
  let state = paihuoProjection.init();
  assert.equal(state.preset, null);
  state = run(state, { type: 'agent-preset/selected', data: { agentPreset: 'paihuo' } });
  assert.equal(state.preset, 'paihuo');
  state = run(state, { type: 'agent-preset/selected', data: { agentPreset: 'standard' } });
  assert.equal(state.preset, 'standard');
  assert.equal(state.role, 'none');
});

test('wire view exports only the role', () => {
  assert.deepEqual(paihuoProjection.wire.view({ role: 'manager', running: null }), { role: 'manager' });
  assert.equal(paihuoProjection.wire.viewSchema.safeParse({ role: 'engineer' }).success, true);
  assert.equal(paihuoProjection.wire.viewSchema.safeParse({ role: 'nope' }).success, false);
});
