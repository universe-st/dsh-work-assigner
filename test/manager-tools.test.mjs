import assert from 'node:assert/strict';
import { test } from 'node:test';

import { listManagerToolCatalog } from '../lib/scope.js';
import { isManagerTool, managerToolAllowed, normalizeToolNames } from '../lib/wire.js';

function runtimeWith({ extraTools = [], deniedTools = [], names = [], view = [] } = {}) {
  return {
    config: {
      managerExtraTools: extraTools,
      managerDeniedTools: deniedTools,
    },
    ctx: {
      tools: {
        schemas: () => names.map((name) => ({ name })),
        view: () => ({ restrictableNames: new Set(view) }),
      },
      get: (name) => (name === 'agents' ? { get: () => ({}) } : undefined),
    },
  };
}

test('managerToolAllowed honors defaults, extras and denials', () => {
  assert.equal(isManagerTool('read'), true);
  assert.equal(isManagerTool('memory_remember'), true);
  assert.equal(isManagerTool('dsh_im_return_file'), true);
  assert.equal(isManagerTool('pwsh'), false);

  assert.equal(managerToolAllowed('read', {}), true);
  assert.equal(managerToolAllowed('pwsh', {}), false);
  assert.equal(managerToolAllowed('pwsh', { managerExtraTools: ['pwsh'] }), true);
  assert.equal(managerToolAllowed('read', { managerDeniedTools: ['read'] }), false);
  // 派活工具走 isPaihuoTool，配置不能把它们算进 allow；能算进来也不该影响守卫。
  assert.equal(managerToolAllowed('paihuo_dispatch', { managerExtraTools: ['paihuo_dispatch'] }), false);
});

test('normalizeToolNames keeps valid, unique names only', () => {
  assert.deepEqual(normalizeToolNames([' b ', 'b', '', 'bad name', 42, 'a.b:c-d_e']), ['b', 'a.b:c-d_e']);
  assert.deepEqual(normalizeToolNames(undefined), []);
  assert.deepEqual(normalizeToolNames('read'), []);
});

test('catalog lists global, view and configured tools with groups', () => {
  const runtime = runtimeWith({
    extraTools: ['pwsh'],
    deniedTools: ['web_fetch'],
    names: ['read', 'web_fetch', 'pwsh', 'memory_remember', 'dsh_im_return_file', 'paihuo_dispatch', 'run_code'],
    view: ['skill', 'write'],
  });
  const { tools } = listManagerToolCatalog(runtime, 'manager-1');
  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  assert.equal(byName.has('run_code'), false);
  assert.equal(byName.get('read').group, 'readonly');
  assert.equal(byName.get('read').allowed, true);
  assert.equal(byName.get('web_fetch').allowed, false);
  assert.equal(byName.get('skill').group, 'readonly');
  assert.equal(byName.get('write').group, 'other');
  assert.equal(byName.get('write').allowed, false);
  assert.equal(byName.get('pwsh').allowed, true);
  assert.equal(byName.get('memory_remember').group, 'memory');
  assert.equal(byName.get('dsh_im_return_file').group, 'im');
  assert.equal(byName.get('paihuo_dispatch').group, 'paihuo');
  assert.equal(byName.get('paihuo_dispatch').locked, true);
  assert.equal(byName.get('paihuo_dispatch').allowed, true);

  // 工具被卸载后仍保留在清单里，方便把配置里的旧名字清掉。
  const stale = runtimeWith({ extraTools: ['gone_tool'], extraToolsOnly: true });
  assert.equal(listManagerToolCatalog(stale).tools.some((tool) => tool.name === 'gone_tool'), true);
});
