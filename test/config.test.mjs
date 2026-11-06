import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveConfig } from '../lib/config.js';

test('defaults are complete and frozen', () => {
  const config = resolveConfig(undefined);
  assert.equal(config.engineerBackend, 'session');
  assert.equal(config.codexCommand, 'codex');
  assert.deepEqual(config.codexCommandArgs, []);
  assert.equal(config.codexModel, null);
  assert.equal(config.codexReasoningEffort, null);
  assert.equal(config.codexSandbox, 'workspace-write');
  assert.equal(config.codexBypassApprovals, false);
  assert.equal(config.workstationsPerProject, 2);
  assert.equal(config.totalWorkstations, 4);
  assert.equal(config.worktree, true);
  assert.deepEqual(config.serializedResources, ['browser']);
  assert.deepEqual(config.engineerModels, []);
  assert.ok(Object.isFrozen(config));
});

test('codex backend is validated and normalized', () => {
  const config = resolveConfig({
    engineerBackend: 'codex',
    codexCommand: '  my-codex  ',
    codexCommandArgs: ['--profile', 'test'],
    codexModel: ' gpt-5-codex ',
    codexReasoningEffort: 'xhigh',
    codexSandbox: 'danger-full-access',
    codexBypassApprovals: true,
  });
  assert.equal(config.engineerBackend, 'codex');
  assert.equal(config.codexCommand, 'my-codex');
  assert.deepEqual(config.codexCommandArgs, ['--profile', 'test']);
  assert.equal(config.codexModel, 'gpt-5-codex');
  assert.equal(config.codexReasoningEffort, 'xhigh');
  assert.equal(resolveConfig({ codexReasoningEffort: '' }).codexReasoningEffort, null);
  assert.throws(() => resolveConfig({ codexReasoningEffort: 'bad effort' }), /codexReasoningEffort/);
  assert.equal(config.codexSandbox, 'danger-full-access');
  assert.equal(config.codexBypassApprovals, true);
  assert.equal(resolveConfig({ codexModel: '' }).codexModel, null);
  assert.throws(() => resolveConfig({ engineerBackend: 'nope' }), /engineerBackend/);
  assert.throws(() => resolveConfig({ codexCommand: '   ' }), /codexCommand/);
  assert.throws(() => resolveConfig({ codexCommandArgs: ['x', 1] }), /codexCommandArgs/);
  assert.throws(() => resolveConfig({ codexModel: 'bad model' }), /codexModel/);
  assert.throws(() => resolveConfig({ codexSandbox: 'nope' }), /codexSandbox/);
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
