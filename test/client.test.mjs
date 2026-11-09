import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');

test('client bundle parses as a classic script', () => {
  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /__ModuleLoader__\.load/);
});

test('client registers both manager header utilities', () => {
  assert.match(source, /id: 'paihuo-questions'/);
  assert.match(source, /id: 'paihuo-todos'/);
  assert.match(source, /name: 'conversation\.session\.header\.utilities'/);
  assert.match(source, /createTodoApi/);
  assert.match(source, /question\.badgeAria/);
  assert.match(source, /todo\.badgeAria/);
});

test('manager rows show a LOADING animation while engineers work', () => {
  assert.match(source, /REMOTE_ACTIVITY_METHOD_ID/);
  assert.match(source, /function createActivityApi/);
  assert.match(source, /function createActivityStore/);
  assert.match(source, /data-paihuo-working/);
  assert.match(source, /PH_rowLoadingSpin/);
  assert.match(source, /installRowColors\(ctx, activity\)/);
});

test('manager tool allowlist dialog is wired into the settings page', () => {
  assert.match(source, /function ToolAccessDialog/);
  assert.match(source, /createToolsApi/);
  assert.match(source, /'config\.section\.tools'/);
  assert.match(source, /'tools\.group\.other'/);
  assert.match(source, /managerExtraTools/);
  assert.match(source, /managerDeniedTools/);
});
