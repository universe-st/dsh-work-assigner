import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');

function createReact() {
  const noop = () => {};
  return {
    createElement: (...args) => ({ args }),
    Fragment: 'Fragment',
    useState: (value) => [typeof value === 'function' ? value() : value, noop],
    useEffect: noop,
    useRef: (value) => ({ current: value }),
    useMemo: (factory) => factory(),
    useCallback: (fn) => fn,
  };
}

function createRow(attributes) {
  const values = new Map(Object.entries(attributes));
  return {
    textContent: '👔 经理',
    getAttribute(name) {
      return values.has(name) ? values.get(name) : null;
    },
    setAttribute(name, value) {
      values.set(name, String(value));
    },
    removeAttribute(name) {
      values.delete(name);
    },
  };
}

test('manager rows pick up the host activity count and mark themselves as working', async () => {
  let loaded;
  const row = createRow({ 'data-row-key': 'session:m1' });
  const document = {
    body: {},
    visibilityState: 'visible',
    activeElement: null,
    querySelectorAll: () => [row],
    createElement: () => ({ setAttribute() {}, remove() {}, style: {} }),
    head: { appendChild() {} },
    addEventListener() {},
    removeEventListener() {},
  };
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (callback) => callback(),
    cancelAnimationFrame: () => {},
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    document,
    window: {
      __ModuleLoader__: {
        load(definition) {
          loaded = definition;
        },
      },
    },
  };
  vm.runInNewContext(source, sandbox, { filename: 'client.js' });
  assert.ok(loaded);

  const module = loaded.factory((name) => {
    if (name === 'react') return createReact();
    if (name === 'react-dom') return { createPortal: (node) => node };
    throw new Error(`unexpected require: ${name}`);
  });

  const cleanups = [];
  const ctx = {
    effect(execute) {
      const cleanup = execute();
      if (typeof cleanup === 'function') cleanups.push(cleanup);
      return cleanup;
    },
    get(name) {
      if (name === 'sessions') {
        return {
          list: {
            getSnapshot: () => ({
              byId: {
                m1: { projectionValues: { agentPreset: 'paihuo', paihuo: { role: 'manager' } } },
              },
            }),
            subscribe: () => () => {},
          },
        };
      }
      if (name === 'remote.paihuo') {
        return {
          todos: async () => ({ ok: true, value: { todos: [], counts: {} } }),
          activity: async () => ({
            ok: true,
            value: {
              managers: [{
                managerId: 'm1',
                runningEngineers: 2,
                sessionEngineers: 1,
                codexEngineers: 1,
              }],
            },
          }),
        };
      }
      return undefined;
    },
    locale: {
      register() {
        return () => {};
      },
      bind() {
        return (key) => key;
      },
    },
    slots: {
      inject(_name, callback) {
        return callback();
      },
      register() {
        return () => {};
      },
    },
    uiConversation: {
      events: {
        register() {
          return () => {};
        },
      },
    },
    remote: {
      $mount() {
        return Promise.resolve();
      },
    },
  };

  try {
    assert.doesNotThrow(() => module.apply(ctx));
    // 让首个 activity 轮询与随后的 requestAnimationFrame 完成。
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(row.getAttribute('data-paihuo-role'), 'manager');
    assert.equal(row.getAttribute('data-paihuo-working'), 'true');
    assert.equal(row.getAttribute('data-paihuo-working-count'), '2');
  } finally {
    while (cleanups.length > 0) cleanups.pop()();
  }
});
