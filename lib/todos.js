/**
 * 经理会话的持久待办。
 *
 * 待办不写入会话日志：DSH 的会话格式只接受已知事件类型，第三方插件新增
 * 事件会在重开时被拒绝。因此状态放在插件自己的 `storageDomain`，浏览器
 * 通过 `lib/remote.js` 的只读方法轮询；经理工具是唯一写入方。
 */

import { ROLE_MANAGER } from './wire.js';

/** 每个经理最多保留的待办条数；超限时优先清理最旧的已完成项。 */
export const MAX_TODOS = 100;
const MAX_CONTENT = 200;
const MAX_NOTE = 500;

const STATUS_LABELS = Object.freeze({
  pending: '待办',
  in_progress: '进行中',
  paused: '暂停',
  completed: '已完成',
});

function now() {
  return Date.now();
}

function roleOf(runtime, agent) {
  try {
    return runtime.roleOf(agent);
  } catch {
    return 'none';
  }
}

function requireManager(runtime, agent) {
  if (agent === undefined || agent === null) throw new Error('该工具需要一个发起会话');
  if (roleOf(runtime, agent) !== ROLE_MANAGER) {
    throw new Error('只有「派活」经理可以维护待办；先用 /paihuo on 进入派活模式');
  }
}

function normalized(value, field, max) {
  if (typeof value !== 'string') throw new Error(`${field} 必须是字符串`);
  const text = value.trim();
  if (text === '') throw new Error(`${field} 不能为空`);
  if (text.length > max) throw new Error(`${field} 不能超过 ${max} 个字符`);
  return text;
}

function optionalNote(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error('note 必须是字符串');
  const text = value.trim();
  if (text.length > MAX_NOTE) throw new Error(`note 不能超过 ${MAX_NOTE} 个字符`);
  return text === '' ? undefined : text;
}

/** 把状态数组算成前端/模型都用的计数。 */
export function countsOf(todos) {
  const counts = { pending: 0, inProgress: 0, paused: 0, completed: 0, open: 0 };
  for (const todo of Array.isArray(todos) ? todos : []) {
    if (todo?.status === 'pending') counts.pending += 1;
    else if (todo?.status === 'in_progress') counts.inProgress += 1;
    else if (todo?.status === 'paused') counts.paused += 1;
    else if (todo?.status === 'completed') counts.completed += 1;
  }
  counts.open = counts.pending + counts.inProgress + counts.paused;
  return counts;
}

/** 只返回可序列化的副本，避免调用方修改 store 内部对象。 */
export function copyTodo(todo) {
  if (todo === undefined || todo === null) return undefined;
  return {
    id: todo.id,
    content: todo.content,
    status: todo.status,
    ...(todo.note === undefined ? {} : { note: todo.note }),
    createdAt: todo.createdAt,
    updatedAt: todo.updatedAt,
  };
}

function listOf(state, managerId) {
  const list = state.todos?.[managerId];
  return Array.isArray(list) ? list : [];
}

function ensureList(state, managerId) {
  if (state.todos === undefined || state.todos === null) state.todos = {};
  if (!Array.isArray(state.todos[managerId])) state.todos[managerId] = [];
  return state.todos[managerId];
}

function nextId(state) {
  const seq = Number.isSafeInteger(state.nextTodoSeq) && state.nextTodoSeq > 0
    ? state.nextTodoSeq
    : 1;
  state.nextTodoSeq = seq + 1;
  return `td${seq}`;
}

/** 为新增项腾出空间：只清理最旧的已完成项。 */
function makeRoom(list, incoming) {
  if (list.length + incoming <= MAX_TODOS) return list;
  const excess = list.length + incoming - MAX_TODOS;
  const completed = list
    .filter((todo) => todo.status === 'completed')
    .sort((left, right) => (left.updatedAt ?? 0) - (right.updatedAt ?? 0))
    .slice(0, excess);
  const remaining = list.filter((todo) => !completed.some((entry) => entry.id === todo.id));
  if (remaining.length + incoming > MAX_TODOS) {
    throw new Error(`待办已满（上限 ${MAX_TODOS}），请先完成或删除一些待办`);
  }
  return remaining;
}

function findTodo(list, id) {
  const key = typeof id === 'string' ? id.trim() : '';
  if (key === '') throw new Error('id 不能为空');
  const todo = list.find((entry) => entry.id === key);
  if (todo === undefined) {
    const known = list.length === 0 ? '（当前没有待办）' : list.map((entry) => entry.id).join('、');
    throw new Error(`待办不存在：${key}。当前：${known}`);
  }
  return todo;
}

function touch(todo) {
  todo.updatedAt = Math.max(now(), todo.updatedAt ?? 0);
}

/** 添加一批待办；`status` 只允许 pending / in_progress。 */
export function addTodoItems(state, managerId, items) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('items 必须是非空数组');
  const prepared = items.map((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`items[${index}] 必须是对象`);
    }
    const content = normalized(item.content, `items[${index}].content`, MAX_CONTENT);
    const status = item.status === undefined ? 'pending' : item.status;
    if (status !== 'pending' && status !== 'in_progress') {
      throw new Error(`items[${index}].status 只能是 pending 或 in_progress`);
    }
    return {
      content,
      status,
      ...(item.note === undefined ? {} : { note: optionalNote(item.note) }),
    };
  });

  let list = ensureList(state, managerId);
  list = makeRoom(list, prepared.length);
  state.todos[managerId] = list;

  const timestamp = now();
  const added = prepared.map((item) => {
    const todo = {
      id: nextId(state),
      content: item.content,
      status: item.status,
      ...(item.note === undefined ? {} : { note: item.note }),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    list.push(todo);
    return todo;
  });
  return { list, added };
}

/** 修改内容/备注，不改变状态。至少提供一个字段。 */
export function updateTodoItem(state, managerId, args) {
  const list = ensureList(state, managerId);
  const todo = findTodo(list, args.id);
  const hasContent = args.content !== undefined;
  const hasNote = args.note !== undefined;
  if (!hasContent && !hasNote) throw new Error('update 至少需要 content 或 note');
  if (hasContent) todo.content = normalized(args.content, 'content', MAX_CONTENT);
  if (hasNote) {
    const note = optionalNote(args.note);
    if (note === undefined) delete todo.note;
    else todo.note = note;
  }
  touch(todo);
  return todo;
}

const TRANSITIONS = Object.freeze({
  start: { from: new Set(['pending', 'paused']), to: 'in_progress' },
  pause: { from: new Set(['pending', 'in_progress']), to: 'paused' },
  resume: { from: new Set(['paused']), to: 'in_progress' },
  complete: { from: new Set(['pending', 'in_progress', 'paused']), to: 'completed' },
});

/** 状态转移；已处于目标状态时幂等返回。 */
export function transitionTodo(state, managerId, action, id) {
  const list = ensureList(state, managerId);
  const todo = findTodo(list, id);
  const transition = TRANSITIONS[action];
  if (transition === undefined) throw new Error(`未知的待办操作：${action}`);
  if (todo.status === transition.to) return todo;
  if (!transition.from.has(todo.status)) {
    throw new Error(`待办 ${todo.id} 当前状态是 ${STATUS_LABELS[todo.status] ?? todo.status}，不能执行 ${action}`);
  }
  todo.status = transition.to;
  touch(todo);
  return todo;
}

/** 删除一条待办。 */
export function removeTodoItem(state, managerId, id) {
  const list = ensureList(state, managerId);
  const todo = findTodo(list, id);
  state.todos[managerId] = list.filter((entry) => entry.id !== todo.id);
  return todo;
}

/** 清空本经理的全部待办。 */
export function clearTodoItems(state, managerId) {
  if (state.todos === undefined || state.todos === null) state.todos = {};
  const removed = listOf(state, managerId).length;
  state.todos[managerId] = [];
  return removed;
}

function renderText(todos) {
  const counts = countsOf(todos);
  const header = `待办（进行中 ${counts.inProgress}，待办 ${counts.pending}，暂停 ${counts.paused}，已完成 ${counts.completed}）：`;
  if (todos.length === 0) return `${header}\n（空）`;
  return [
    header,
    ...todos.map((todo) => {
      const note = todo.note === undefined ? '' : `（备注：${todo.note}）`;
      return `- [${STATUS_LABELS[todo.status] ?? todo.status}] ${todo.id} ${todo.content}${note}`;
    }),
  ].join('\n');
}

function resultOf(todos) {
  const counts = countsOf(todos);
  return {
    shape: 'todos',
    title: `待办（${counts.open} 项未完成）`,
    todos: todos.map(copyTodo),
    counts,
    text: renderText(todos),
  };
}

/**
 * 创建待办运行器。
 *
 * @param {object} runtime 插件运行时。
 * @returns 对外操作集合。
 */
export function createTodos(runtime) {
  const listFor = (managerId) => {
    const state = runtime.store.get();
    const todos = listOf(state, managerId).map(copyTodo);
    return { todos, counts: countsOf(todos) };
  };

  const mutate = async (agent, args = {}) => {
    requireManager(runtime, agent);
    await runtime.ready();
    const state = runtime.store.get();
    const managerId = agent.id;
    const action = String(args.action ?? '').trim();
    if (action === '') throw new Error('action 不能为空');

    if (action === 'list') {
      return resultOf(listOf(state, managerId));
    }

    if (action === 'add') {
      const { list } = addTodoItems(state, managerId, args.items);
      await runtime.store.save();
      return resultOf(list);
    }

    if (action === 'update') {
      updateTodoItem(state, managerId, args);
      await runtime.store.save();
      return resultOf(listOf(state, managerId));
    }

    if (action === 'start' || action === 'pause' || action === 'resume' || action === 'complete') {
      transitionTodo(state, managerId, action, args.id);
      await runtime.store.save();
      return resultOf(listOf(state, managerId));
    }

    if (action === 'remove') {
      removeTodoItem(state, managerId, args.id);
      await runtime.store.save();
      return resultOf(listOf(state, managerId));
    }

    if (action === 'clear') {
      clearTodoItems(state, managerId);
      await runtime.store.save();
      return resultOf([]);
    }

    throw new Error(`未知的待办操作：${action}。可用：add/update/start/pause/resume/complete/remove/clear/list`);
  };

  return {
    listFor,
    mutate: (agent, args) => mutate(agent, args),
  };
}
