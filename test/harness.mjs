/**
 * 集成测试用的极简 Host 世界：只实现「派活」插件实际调用的服务面，
 * 让 apply() / 命令 / 工具 / 调度 / 回报 走同一条真实代码路径。
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function messageText(content) {
  return (content ?? [])
    .filter((block) => block?.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

export function createWorld(options = {}) {
  const world = {
    config: options.config ?? {},
    cwd: options.cwd ?? PROJECT,
    managerSandbox: options.managerSandbox ?? 'danger-full-access',
    managerPreset: options.managerPreset ?? 'danger-full-access',
    sessions: new Map(),
    agents: new Map(),
    commands: new Map(),
    sections: [],
    restrictions: [],
    guards: [],
    toolDefs: new Map(),
    prompts: [],
    presets: [],
    handlers: new Map(),
    stored: undefined,
    projection: undefined,
    seq: 0,
  };

  const services = {};

  const makeChild = (name) => ({
    ...ctx,
    [name]: services[name],
  });

  const ctx = {
    logger: { warn() {}, info() {}, debug() {}, error() {} },
    get(name) {
      return services[name];
    },
    inject(deps, callback) {
      if (deps.every((name) => services[name] !== undefined)) callback(makeChild(deps[0]));
    },
    effect(execute) {
      return execute();
    },
    on(name, handler) {
      const list = world.handlers.get(name) ?? [];
      list.push(handler);
      world.handlers.set(name, list);
      return () => {
        world.handlers.set(name, (world.handlers.get(name) ?? []).filter((entry) => entry !== handler));
      };
    },
  };

  const emit = (name, ...args) => {
    for (const handler of world.handlers.get(name) ?? []) handler(...args);
  };

  const append = (session, type, data) => {
    world.seq += 1;
    const event = { type, seq: world.seq, time: Date.now(), data };
    session.events.push(event);
    session.seq = event.seq;
    emit('session/event', session, event);
    return event;
  };

  const ensureSession = (id) => {
    let session = world.sessions.get(id);
    if (session === undefined) {
      session = {
        id,
        header: { version: 1, id, createdAt: 0, cwd: world.cwd, isSeeded: false },
        title: '',
        events: [],
        seq: 0,
        requestHeader: () => ({ config: { provider: 'test-provider', model: 'test-model' } }),
        deriveMessages: () => [{ role: 'assistant', content: [{ type: 'text', text: '测试完成：一切正常。' }] }],
      };
      world.sessions.set(id, session);
    }
    return session;
  };

  const ensureAgent = (id) => {
    let agent = world.agents.get(id);
    if (agent === undefined) {
      const session = ensureSession(id);
      const agentCtx = {
        systemPrompt: {
          section(section) {
            const entry = { agentId: id, ...section };
            world.sections.push(entry);
            return () => {
              world.sections = world.sections.filter((item) => item !== entry);
            };
          },
        },
        tools: {
          register(definition) {
            world.toolDefs.set(definition.name, definition);
            return () => {
              world.toolDefs.delete(definition.name);
            };
          },
          restrict(filter) {
            const entry = { agentId: id, ...filter };
            world.restrictions.push(entry);
            return () => {
              world.restrictions = world.restrictions.filter((item) => item !== entry);
            };
          },
          guard(guard) {
            const entry = { agentId: id, guard };
            world.guards.push(entry);
            return () => {
              world.guards = world.guards.filter((item) => item !== entry);
            };
          },
        },
        on(name, handler) {
          const entry = { agentId: id, name, handler };
          const list = world.handlers.get(name) ?? [];
          list.push(handler);
          world.handlers.set(name, list);
          return () => {
            world.handlers.set(name, (world.handlers.get(name) ?? []).filter((item) => item !== handler));
          };
        },
        effect(execute) {
          return execute();
        },
      };
      agent = { id, session, ctx: agentCtx };
      world.agents.set(id, agent);
    }
    return agent;
  };

  let agentSeq = 0;

  services.sessionController = {
    async create() {
      agentSeq += 1;
      const sessionId = `session-engineer-${agentSeq}`;
      ensureSession(sessionId);
      return { sessionId };
    },
    async rename({ sessionId, title }) {
      const session = ensureSession(sessionId);
      session.title = title;
      append(session, 'session/title', { title, messageSeqs: [], source: { kind: 'user' } });
      return { title, seq: session.seq };
    },
    async resolveAgent(sessionId) {
      const agent = ensureAgent(sessionId);
      if (agent.announced !== true) {
        agent.announced = true;
        emit('agent/created', { agent, source: 'startup' });
      }
      return { agent };
    },
    async prompt(request) {
      world.prompts.push({
        sessionId: request.sessionId,
        mode: request.mode,
        text: messageText(request.content),
      });
      return { accepted: true };
    },
    cancel() {
      return { accepted: true };
    },
    async list() {
      return {
        items: [...world.sessions.values()].map((session) => ({
          sessionId: session.id,
          running: false,
          blank: false,
          updatedAt: 0,
          agentAvailable: world.agents.has(session.id),
          cwd: session.header.cwd,
        })),
      };
    },
    async inspect(sessionId) {
      const session = ensureSession(sessionId);
      return { meta: session.header, inheritedEventCount: 0, events: session.events };
    },
    async modelCatalog() {
      return { default: { provider: 'test-provider', model: 'test-model' } };
    },
  };

  services.sessions = {
    get: (id) => world.sessions.get(id),
  };

  services.agents = {
    get: (id) => world.agents.get(id),
    list: () => [...world.agents.values()],
  };

  services.commands = {
    register(definition) {
      world.commands.set(definition.name, definition);
      return () => {
        world.commands.delete(definition.name);
      };
    },
    async execute(agent, line, attachments = [], signal = new AbortController().signal) {
      const match = /^\/([\w-]+)(?:\s+([\s\S]*))?$/.exec(String(line).trim());
      if (match === null) return undefined;
      const definition = world.commands.get(match[1]);
      if (definition === undefined) return undefined;
      const commandId = `cmd-${world.seq + 1}`;
      append(agent.session, 'command/run', { commandId, name: match[1], args: match[2] ?? '' });
      let result;
      try {
        result = await definition.handler({
          commandId,
          agent,
          rawInput: match[2] ?? '',
          attachments,
          signal,
        });
      } catch (error) {
        result = { kind: 'error', text: error instanceof Error ? error.message : String(error) };
      }
      append(agent.session, 'command/done', {
        commandId,
        kind: result?.kind === 'success' ? 'success' : 'error',
        text: result?.text,
      });
      return { commandId, result };
    },
  };

  // 模拟 Host 的工具面：预设工具（祖先层）+ profile 级 MCP 工具。
  const hostToolNames = [
    'read',
    'glob',
    'grep',
    'web_search',
    'web_fetch',
    'ask_user_question',
    'todo_write',
    'session_search',
    'write',
    'edit',
    'pwsh',
    'bash',
    'mcp__playwright__browser_click',
    'mcp__playwright__browser_navigate',
    'working_directory',
    'load_workspace_dependencies',
    // 记忆插件（meow-memory）的整族工具：只读写记忆库，不进工作区。
    'memory_search',
    'memory_read',
    'memory_project',
    'memory_find_similar',
    'memory_remember',
    'memory_update',
    'memory_dream',
    'memory_home',
    // 插件以后新增的记忆工具：按 `memory_` 前缀放行，不该又要改白名单。
    'memory_topic',
  ];
  services.tools = {
    schemas: () => hostToolNames.map((name) => ({ name })),
    view: () => ({ restrictableNames: new Set(hostToolNames) }),
  };
  services.systemPrompt = { section: () => () => {} };

  services.sessionTitle = {
    get(session) {
      return session.title === '' ? undefined : { title: session.title, eventSeq: 0, updatedAt: 0 };
    },
    rename(session, title) {
      session.title = title;
      append(session, 'session/title', { title, messageSeqs: [], source: { kind: 'user' } });
      return { title };
    },
    async refresh(session) {
      const title = '测试会话';
      session.title = title;
      append(session, 'session/title', { title, messageSeqs: [], source: { kind: 'provider' } });
      return { title, eventSeq: session.seq, updatedAt: Date.now() };
    },
  };

  services.sandboxPolicy = {
    resolve({ session }) {
      const mode = world.sessionSandbox.get(session.id) ?? (session.id === 'session-manager' ? world.managerSandbox : 'workspace-write');
      return { mode, workspaceRoot: world.cwd };
    },
  };

  world.sessionSandbox = new Map();

  services.permissionPresets = {
    current: () => world.managerPreset,
    resolve(name) {
      return { sandbox: name === 'danger-full-access' ? 'danger-full-access' : name === 'read-only' ? 'read-only' : 'workspace-write' };
    },
    set(session, name) {
      world.presets.push({ sessionId: session.id, name });
      world.sessionSandbox.set(session.id, name === 'danger-full-access' ? 'danger-full-access' : name === 'read-only' ? 'read-only' : 'workspace-write');
    },
    catalog() {
      return { defaultPreset: 'workspace-write', options: [] };
    },
  };

  services.workingDirectory = {
    get: (session) => session.header.cwd ?? world.cwd,
  };

  services.workspaceRegistry = {
    async resolveByPath() {
      return undefined;
    },
    async create(path, title) {
      return { id: `workspace-${path.length}`, path, title };
    },
  };

  services.storageDomain = {
    async open(spec) {
      world.stored = spec.global.initial;
      return {
        global: {
          get: () => world.stored,
          async set(value) {
            world.stored = value;
          },
        },
        async close() {},
      };
    },
  };

  services.sessionProjections = {
    register(definition) {
      world.projection = definition;
      return () => {
        world.projection = undefined;
      };
    },
    stateOf(session) {
      if (world.projection === undefined) return undefined;
      let state = world.projection.init();
      for (const event of session.events) state = world.projection.apply(state, event);
      return state;
    },
  };

  services.agentPresets = {
    async resolve() {
      return { id: 'standard' };
    },
    async select(agent, id) {
      agent.session.header.agentPreset = id;
      return id;
    },
  };

  world.ctx = ctx;
  for (const [name, service] of Object.entries(services)) {
    if (ctx[name] === undefined) ctx[name] = service;
  }
  world.ensureAgent = ensureAgent;
  world.ensureSession = ensureSession;
  world.append = append;
  world.emit = emit;
  world.projectionState = (session) => services.sessionProjections.stateOf(session);
  world.manager = () => ensureAgent('session-manager');
  return world;
}

export function settle(ms = 12) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { PROJECT };
