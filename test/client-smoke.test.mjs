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

test('client factory registers settings, report cards and manager header slots', () => {
  let loaded;
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    document: {
      body: {},
      activeElement: null,
      querySelectorAll: () => [],
      createElement: () => ({ setAttribute() {}, remove() {}, style: {} }),
      head: { appendChild() {} },
      addEventListener() {},
      removeEventListener() {},
    },
    window: {
      __ModuleLoader__: {
        load(definition) {
          loaded = definition;
        },
      },
    },
  };
  vm.runInNewContext(source, sandbox, { filename: 'client.js' });
  assert.ok(loaded, 'bundle should register a module loader factory');
  assert.equal(loaded.id, 'dsh-paihuo');

  const factory = loaded.factory;
  const react = createReact();
  const module = factory((name) => {
    if (name === 'react') return react;
    if (name === 'react-dom') return { createPortal: (node) => node };
    throw new Error(`unexpected require: ${name}`);
  });

  assert.deepEqual(Array.from(module.inject), ['slots', 'locale', 'uiConversation', 'remote']);

  const registrations = [];
  const effects = [];
  const ctx = {
    effect(execute) {
      effects.push(execute);
      return execute();
    },
    get() {
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
      register(meta) {
        registrations.push(meta);
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

  assert.doesNotThrow(() => module.apply(ctx));
  assert.ok(effects.length >= 3);
  const ids = registrations.map((entry) => entry.id ?? entry.key ?? entry.name);
  assert.ok(ids.includes('paihuo-questions'));
  assert.ok(ids.includes('paihuo-todos'));
  assert.ok(ids.includes('paihuo-report'));
  assert.ok(ids.includes('paihuo'));
});
