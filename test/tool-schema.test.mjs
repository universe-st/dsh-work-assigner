import assert from 'node:assert/strict';
import { test } from 'node:test';

import { apply } from '../lib/index.js';
import { createEngineerTools } from '../lib/tools.js';
import { createWorld, settle } from './harness.mjs';

/**
 * 工具 `parameters` 会作为 function declaration 的 JSON Schema 直接发给模型提供方。
 * deepseek-account 等路由按标准 JSON Schema 严格校验：`required` 必须是字符串数组，
 * 写成 `required: true` 会被整轮拒绝（Invalid schema for function ...: true is not of type "array"）。
 * Codex/tokenrhythm 路由较宽松，所以这类错误在本地测试里不会暴露。这里做静态体检。
 */
const ALLOWED_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);

function checkSchema(node, path, problems) {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    problems.push(`${path}: 子 schema 必须是对象`);
    return;
  }

  if (node.type !== undefined && (typeof node.type !== 'string' || !ALLOWED_TYPES.has(node.type))) {
    problems.push(`${path}.type: 不认识的类型 ${JSON.stringify(node.type)}`);
  }

  if ('required' in node) {
    if (!Array.isArray(node.required)) {
      problems.push(`${path}.required: 必须是字符串数组，布尔值会被严格校验的 provider 拒绝`);
    } else {
      if (node.required.length === 0) problems.push(`${path}.required: 不能是空数组`);
      for (const name of node.required) {
        if (typeof name !== 'string') {
          problems.push(`${path}.required: 只能包含字符串，收到 ${JSON.stringify(name)}`);
        } else if (node.properties === undefined || node.properties[name] === undefined) {
          problems.push(`${path}.required: "${name}" 不在同级 properties 里`);
        }
      }
    }
  }

  if (node.properties !== undefined) {
    if (node.properties === null || typeof node.properties !== 'object' || Array.isArray(node.properties)) {
      problems.push(`${path}.properties: 必须是对象`);
    } else {
      for (const [name, child] of Object.entries(node.properties)) {
        checkSchema(child, `${path}.properties.${name}`, problems);
      }
    }
  }

  if (node.type === 'array' && node.items === undefined) {
    problems.push(`${path}: type=array 必须有 items`);
  }
  if (node.items !== undefined) {
    if (Array.isArray(node.items)) {
      problems.push(`${path}.items: 不支持元组写法（数组形式的 items）`);
    } else {
      checkSchema(node.items, `${path}.items`, problems);
    }
  }

  if (node.additionalProperties !== undefined && typeof node.additionalProperties === 'object') {
    checkSchema(node.additionalProperties, `${path}.additionalProperties`, problems);
  }

  for (const key of ['anyOf', 'oneOf', 'allOf']) {
    if (node[key] === undefined) continue;
    if (!Array.isArray(node[key]) || node[key].length === 0) {
      problems.push(`${path}.${key}: 必须是非空数组`);
      continue;
    }
    node[key].forEach((child, index) => checkSchema(child, `${path}.${key}[${index}]`, problems));
  }
}

async function bootManager(world) {
  apply(world.ctx, world.config);
  await settle();
  const manager = world.ensureAgent('session-manager');
  const execution = await world.ctx.commands.execute(manager, '/paihuo on', []);
  assert.equal(execution.result.kind, 'success', execution.result.text);
  return manager;
}

test('经理与工程师工具的 parameters 都通过严格 JSON Schema 体检', async () => {
  const world = createWorld();
  await bootManager(world);

  const definitions = [...world.toolDefs.values(), ...createEngineerTools({})];
  assert.ok(definitions.length > 0, 'should register tool definitions');

  const problems = [];
  for (const definition of definitions) {
    assert.equal(typeof definition.name, 'string');
    checkSchema(definition.parameters, `tools.${definition.name}.parameters`, problems);
  }
  assert.deepEqual(problems, []);
});

test('体检器能识别布尔 required（本次事故的写法）', () => {
  const problems = [];
  checkSchema(
    {
      type: 'object',
      properties: { action: { type: 'string', required: true } },
      required: ['action'],
    },
    'x',
    problems,
  );
  assert.equal(problems.length, 1, problems.join('\n'));
  assert.match(problems[0], /布尔值/);

  const missing = [];
  checkSchema({ type: 'object', properties: {}, required: ['action'] }, 'y', missing);
  assert.match(missing[0], /不在同级 properties/);

  const tuple = [];
  checkSchema({ type: 'array', items: [] }, 'z', tuple);
  assert.match(tuple[0], /元组写法/);
});

test('paihuo_todo 用 required 数组表达必填项，不使用布尔 required', async () => {
  const world = createWorld();
  await bootManager(world);

  const definition = world.toolDefs.get('paihuo_todo');
  assert.ok(definition, 'manager tools should register paihuo_todo');

  const { properties, required } = definition.parameters;
  assert.deepEqual(required, ['action']);
  assert.equal('required' in properties.action, false, 'action 的必填由顶层 required 表达');
  assert.deepEqual(properties.items.items.required, ['content']);
  assert.equal('required' in properties.items.items.properties.content, false);
  assert.equal(properties.items.items.properties.content.type, 'string');
});
