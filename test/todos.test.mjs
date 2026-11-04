import assert from 'node:assert/strict';
import { test } from 'node:test';

import { apply } from '../lib/index.js';
import {
  MAX_TODOS,
  addTodoItems,
  countsOf,
  createTodos,
  removeTodoItem,
  transitionTodo,
  updateTodoItem,
} from '../lib/todos.js';
import { createEmptyState } from '../lib/state.js';
import { createWorld, settle } from './harness.mjs';

async function bootManager(world) {
  apply(world.ctx, world.config);
  await settle();
  const manager = world.ensureAgent('session-manager');
  const execution = await world.ctx.commands.execute(manager, '/paihuo on', []);
  assert.equal(execution.result.kind, 'success', execution.result.text);
  return manager;
}

function runTodo(world, manager, args) {
  const definition = world.toolDefs.get('paihuo_todo');
  assert.ok(definition, 'manager tools should register paihuo_todo');
  return definition.execute(args, {
    agent: manager,
    callId: 'call-todo',
    signal: new AbortController().signal,
  });
}

test('manager todo tool adds, transitions, updates and removes items', async () => {
  const world = createWorld();
  const manager = await bootManager(world);

  const added = await runTodo(world, manager, {
    action: 'add',
    items: [
      { content: '  设计问题表  ', note: '先看投影结构' },
      { content: '实现待办面板', status: 'in_progress' },
    ],
  });
  assert.equal(added.shape, 'todos');
  assert.deepEqual(added.counts, {
    pending: 1, inProgress: 1, paused: 0, completed: 0, open: 2,
  });
  assert.deepEqual(added.todos.map((todo) => todo.id), ['td1', 'td2']);
  assert.equal(added.todos[0].content, '设计问题表');
  assert.deepEqual(world.stored.todos[manager.id].map((todo) => todo.status), ['pending', 'in_progress']);

  const paused = await runTodo(world, manager, { action: 'pause', id: 'td2' });
  assert.equal(paused.todos.find((todo) => todo.id === 'td2').status, 'paused');
  assert.equal(paused.counts.paused, 1);
  assert.equal(paused.counts.inProgress, 0);

  const resumed = await runTodo(world, manager, { action: 'resume', id: 'td2' });
  assert.equal(resumed.todos.find((todo) => todo.id === 'td2').status, 'in_progress');

  const updated = await runTodo(world, manager, {
    action: 'update',
    id: 'td1',
    content: '设计问题表（含角标）',
    note: '',
  });
  const td1 = updated.todos.find((todo) => todo.id === 'td1');
  assert.equal(td1.content, '设计问题表（含角标）');
  assert.equal(td1.note, undefined);

  const completed = await runTodo(world, manager, { action: 'complete', id: 'td2' });
  assert.equal(completed.counts.completed, 1);
  assert.equal(completed.counts.open, 1);

  const removed = await runTodo(world, manager, { action: 'remove', id: 'td2' });
  assert.equal(removed.todos.some((todo) => todo.id === 'td2'), false);
  assert.equal(removed.counts.completed, 0);

  const listed = await runTodo(world, manager, { action: 'list' });
  assert.equal(listed.todos.length, 1);
  assert.equal(listed.todos[0].id, 'td1');

  const cleared = await runTodo(world, manager, { action: 'clear' });
  assert.deepEqual(cleared.todos, []);
  assert.deepEqual(world.stored.todos[manager.id], []);
});

test('todo tool rejects non-managers and invalid arguments', async () => {
  const world = createWorld();
  const manager = await bootManager(world);
  const definition = world.toolDefs.get('paihuo_todo');

  const engineer = world.ensureAgent('session-not-manager');
  await assert.rejects(
    () => definition.execute({ action: 'list' }, {
      agent: engineer,
      callId: 'call-todo-engineer',
      signal: new AbortController().signal,
    }),
    /只有「派活」经理/,
  );

  await assert.rejects(() => runTodo(world, manager, { action: 'add', items: [] }), /非空数组/);
  await assert.rejects(() => runTodo(world, manager, { action: 'pause', id: 'td99' }), /待办不存在/);
  await runTodo(world, manager, { action: 'add', items: [{ content: '可更新项' }] });
  await assert.rejects(() => runTodo(world, manager, { action: 'update', id: 'td1' }), /至少需要/);
  await assert.rejects(() => runTodo(world, manager, { action: 'nope' }), /未知的待办操作/);
});

test('todo transitions are idempotent and completed items are terminal', () => {
  const state = createEmptyState();
  const { list } = addTodoItems(state, 'm', [{ content: 'A' }]);
  const id = list[0].id;

  assert.equal(transitionTodo(state, 'm', 'start', id).status, 'in_progress');
  assert.equal(transitionTodo(state, 'm', 'start', id).status, 'in_progress');
  assert.equal(transitionTodo(state, 'm', 'pause', id).status, 'paused');
  assert.equal(transitionTodo(state, 'm', 'pause', id).status, 'paused');
  assert.equal(transitionTodo(state, 'm', 'resume', id).status, 'in_progress');
  assert.equal(transitionTodo(state, 'm', 'complete', id).status, 'completed');
  assert.equal(transitionTodo(state, 'm', 'complete', id).status, 'completed');
  assert.throws(() => transitionTodo(state, 'm', 'start', id), /不能执行 start/);

  updateTodoItem(state, 'm', { id, content: 'A2' });
  assert.equal(state.todos.m[0].content, 'A2');
  removeTodoItem(state, 'm', id);
  assert.deepEqual(state.todos.m, []);
});

function seedTodos(state, managerId, status) {
  state.todos[managerId] = Array.from({ length: MAX_TODOS }, (_, index) => ({
    id: `seed${index}`,
    content: `${status}-${index}`,
    status,
    createdAt: index,
    updatedAt: index,
  }));
  state.nextTodoSeq = MAX_TODOS + 1;
}

test('todo additions prune oldest completed items and respect the cap', () => {
  const state = createEmptyState();
  seedTodos(state, 'm', 'completed');
  // 全部是 completed：自动清理最旧的几条，给新项腾出空间。
  const { list } = addTodoItems(state, 'm', [{ content: 'new' }]);
  assert.equal(list.length, MAX_TODOS);
  assert.equal(list.some((todo) => todo.content === 'completed-0'), false);
  assert.equal(list.at(-1).content, 'new');

  const full = createEmptyState();
  seedTodos(full, 'm', 'pending');
  assert.throws(() => addTodoItems(full, 'm', [{ content: 'overflow' }]), /待办已满/);
});

test('todo counts are stable for empty and mixed lists', () => {
  assert.deepEqual(countsOf([]), { pending: 0, inProgress: 0, paused: 0, completed: 0, open: 0 });
  const todos = [
    { status: 'pending' }, { status: 'in_progress' }, { status: 'paused' }, { status: 'completed' },
  ];
  assert.deepEqual(countsOf(todos), {
    pending: 1, inProgress: 1, paused: 1, completed: 1, open: 3,
  });
});

test('createTodos listFor returns detached copies', async () => {
  const world = createWorld();
  const manager = await bootManager(world);
  await runTodo(world, manager, { action: 'add', items: [{ content: 'X' }] });
  const runtime = {
    store: { get: () => world.stored },
    ready: async () => {},
    roleOf: () => 'manager',
  };
  const list = createTodos(runtime).listFor(manager.id).todos;
  assert.equal(list[0].content, 'X');
  list[0].content = 'mutated';
  assert.equal(world.stored.todos[manager.id][0].content, 'X');
});
