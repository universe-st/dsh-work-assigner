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
