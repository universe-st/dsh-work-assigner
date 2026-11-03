import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveConfig } from '../lib/config.js';

test('defaults are complete and frozen', () => {
  const config = resolveConfig(undefined);
  assert.equal(config.workstationsPerProject, 2);
  assert.equal(config.totalWorkstations, 4);
  assert.equal(config.worktree, true);
  assert.deepEqual(config.serializedResources, ['browser']);
  assert.deepEqual(config.engineerModels, []);
  assert.ok(Object.isFrozen(config));
});

test('unknown keys fail loudly', () => {
  assert.throws(() => resolveConfig({ nope: 1 }), /未知字段 nope/);
});

test('numbers must be positive integers', () => {
  assert.throws(() => resolveConfig({ totalWorkstations: 0 }), /totalWorkstations/);
  assert.throws(() => resolveConfig({ workstationsPerProject: 1.5 }), /workstationsPerProject/);
});

test('engineer models are normalized', () => {
  const config = resolveConfig({
    engineerModels: [{ provider: 'p', model: 'm', description: ' 长上下文 ' }],
  });
  assert.deepEqual(config.engineerModels, [{ provider: 'p', model: 'm', description: ' 长上下文 ' }]);
  assert.throws(() => resolveConfig({ engineerModels: [{ provider: 'p' }] }), /model/);
  assert.throws(() => resolveConfig({ engineerModels: [{ provider: 'p', model: 'm', extra: 1 }] }), /未知字段 extra/);
});

test('serialized resources are unique and validated', () => {
  const config = resolveConfig({ serializedResources: ['Browser', 'browser', 'db'] });
  assert.deepEqual(config.serializedResources, ['browser', 'db']);
  assert.throws(() => resolveConfig({ serializedResources: ['!bad'] }), /资源名/);
});
