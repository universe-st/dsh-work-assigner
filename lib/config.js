/**
 * 插件配置：手写校验（与 `@deepseek-ai/dsh-plan-mode` 的做法一致），
 * 避免把配置声明绑死在某一个 Schema 运行时上。未知字段直接报错。
 *
 * 根节点是 Schemastery volatile：Loader 可能把一个 Volatile 引用交给 apply，
 * 这里先取当前值再校验。
 */

import { isVolatile } from '@deepseek-ai/cosmokit';

import { BACKENDS, BACKEND_SESSION } from './wire.js';

const DEFAULTS = Object.freeze({
  /** 工程师执行后端：session = DSH 工程师会话；codex = 本机 Codex CLI。 */
  engineerBackend: BACKEND_SESSION,
  /** Codex CLI 可执行文件/命令。 */
  codexCommand: 'codex',
  /** 传给 Codex 可执行文件的前置参数（包装器/测试用）。 */
  codexCommandArgs: [],
  /** Codex 模型 id；null = 使用 Codex 原生默认。 */
  codexModel: null,
  /** Codex 思考强度（model_reasoning_effort）；null = 使用模型默认。 */
  codexReasoningEffort: null,
  /** Codex 首轮执行的沙箱。 */
  codexSandbox: 'workspace-write',
  /** 是否使用 --dangerously-bypass-approvals-and-sandbox。 */
  codexBypassApprovals: false,
  /** 非 git 目录也允许执行。 */
  codexSkipGitRepoCheck: true,
  /** 是否把 Codex 命令的聚合输出写进会话转录。 */
  codexTranscriptOutput: true,
  /** 可供经理选择的工程师模型：[{ provider, model, description }]。空 = 与经理相同。 */
  engineerModels: [],
  /** 单个项目同时运行的工程师工位数。 */
  workstationsPerProject: 2,
  /** 所有项目合计的同时运行工位数。 */
  totalWorkstations: 4,
  /** 是否为工程师创建独立 git worktree。 */
  worktree: true,
  /** 全局串行资源（同一资源同时最多 1 个运行任务），例如 browser。 */
  serializedResources: ['browser'],
  /** 单个工程师排队上限。 */
  maxEngineerQueue: 6,
  /** 经理权限预设为 custom 时的兜底预设名；null = 使用目录默认预设。 */
  engineerPermission: null,
  /** 经理对派活回报的反应是否补发到 IM（需要 dsh-im ≥5.9，且会话是 IM 会话）。 */
  imRelay: true,
  /** 覆盖经理提示词段（字符串）。 */
  managerSection: null,
  /** 覆盖工程师提示词段（字符串）。 */
  engineerSection: null,
});

const RESOURCE_PATTERN = /^[a-z][a-z0-9_-]*$/i;
const CODEX_SANDBOXES = ['read-only', 'workspace-write', 'danger-full-access'];
const CODEX_NAME_PATTERN = /^[A-Za-z0-9._:/-]+$/;

function fail(message) {
  throw new Error(`[paihuo] 配置错误：${message}`);
}

function positiveInteger(value, key) {
  if (!Number.isInteger(value) || value < 1) fail(`${key} 必须是 ≥1 的整数`);
  return value;
}

function parseModelEntry(entry, index) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    fail(`engineerModels[${index}] 必须是对象`);
  }
  const allowed = new Set(['provider', 'model', 'description']);
  for (const key of Object.keys(entry)) {
    if (!allowed.has(key)) fail(`engineerModels[${index}] 含未知字段 ${key}`);
  }
  const provider = typeof entry.provider === 'string' ? entry.provider.trim() : '';
  const model = typeof entry.model === 'string' ? entry.model.trim() : '';
  if (provider === '') fail(`engineerModels[${index}].provider 不能为空`);
  if (model === '') fail(`engineerModels[${index}].model 不能为空`);
  const description = entry.description === undefined || entry.description === null
    ? ''
    : String(entry.description);
  return Object.freeze({ provider, model, description });
}

/**
 * 校验并冻结插件配置。
 *
 * @param {unknown} raw Loader 行里的 config。
 * @returns 完整配置。
 */
export function resolveConfig(raw) {
  const unwrapped = isVolatile(raw) ? raw.get() : raw;
  const input = unwrapped === undefined || unwrapped === null ? {} : unwrapped;
  if (typeof input !== 'object' || Array.isArray(input)) fail('config 必须是对象');

  const known = new Set(Object.keys(DEFAULTS));
  for (const key of Object.keys(input)) {
    if (!known.has(key)) fail(`未知字段 ${key}（可用：${[...known].join(', ')}）`);
  }

  const merged = { ...DEFAULTS, ...input };

  const engineerBackend = merged.engineerBackend;
  if (!BACKENDS.includes(engineerBackend)) {
    fail(`engineerBackend 必须是 ${BACKENDS.join(' / ')}`);
  }

  const codexCommand = typeof merged.codexCommand === 'string' ? merged.codexCommand.trim() : '';
  if (codexCommand === '') fail('codexCommand 必须是非空字符串');

  const codexCommandArgs = merged.codexCommandArgs === undefined || merged.codexCommandArgs === null
    ? []
    : merged.codexCommandArgs;
  if (!Array.isArray(codexCommandArgs) || codexCommandArgs.some((entry) => typeof entry !== 'string')) {
    fail('codexCommandArgs 必须是字符串数组');
  }

  let codexModel = merged.codexModel === undefined || merged.codexModel === null
    ? null
    : String(merged.codexModel).trim();
  if (codexModel === '') codexModel = null;
  if (codexModel !== null && !CODEX_NAME_PATTERN.test(codexModel)) {
    fail('codexModel 含不支持的字符（只允许字母、数字、._:/-）');
  }

  const rawEffort = merged.codexReasoningEffort;
  const codexReasoningEffort = rawEffort === undefined || rawEffort === null || rawEffort === ''
    ? null
    : String(rawEffort).trim().toLowerCase();
  if (codexReasoningEffort !== null && !/^[a-z][a-z0-9_-]*$/i.test(codexReasoningEffort)) {
    fail('codexReasoningEffort 必须是模型支持的档位名（如 low / medium / high / xhigh / max）或 null');
  }

  if (!CODEX_SANDBOXES.includes(merged.codexSandbox)) {
    fail(`codexSandbox 必须是 ${CODEX_SANDBOXES.join(' / ')}`);
  }
  for (const key of ['codexBypassApprovals', 'codexSkipGitRepoCheck', 'codexTranscriptOutput', 'imRelay']) {
    if (typeof merged[key] !== 'boolean') fail(`${key} 必须是布尔值`);
  }

  const engineerModels = merged.engineerModels === undefined || merged.engineerModels === null
    ? []
    : merged.engineerModels;
  if (!Array.isArray(engineerModels)) fail('engineerModels 必须是数组');

  const serializedResources = merged.serializedResources === undefined || merged.serializedResources === null
    ? DEFAULTS.serializedResources
    : merged.serializedResources;
  if (!Array.isArray(serializedResources)) fail('serializedResources 必须是字符串数组');
  const resources = [];
  for (const entry of serializedResources) {
    if (typeof entry !== 'string' || !RESOURCE_PATTERN.test(entry.trim())) {
      fail('serializedResources 的每一项必须是字母开头的资源名（如 browser）');
    }
    const value = entry.trim().toLowerCase();
    if (!resources.includes(value)) resources.push(value);
  }

  if (typeof merged.worktree !== 'boolean') fail('worktree 必须是布尔值');

  const engineerPermission = merged.engineerPermission;
  if (engineerPermission !== null && (typeof engineerPermission !== 'string' || engineerPermission.trim() === '')) {
    fail('engineerPermission 必须是非空字符串或 null');
  }

  for (const key of ['managerSection', 'engineerSection']) {
    const value = merged[key];
    if (value !== null && typeof value !== 'string') fail(`${key} 必须是字符串或 null`);
  }

  return Object.freeze({
    engineerBackend,
    codexCommand,
    codexCommandArgs: Object.freeze([...codexCommandArgs]),
    codexModel,
    codexReasoningEffort,
    codexSandbox: merged.codexSandbox,
    codexBypassApprovals: merged.codexBypassApprovals,
    codexSkipGitRepoCheck: merged.codexSkipGitRepoCheck,
    codexTranscriptOutput: merged.codexTranscriptOutput,
    engineerModels: Object.freeze(engineerModels.map(parseModelEntry)),
    workstationsPerProject: positiveInteger(merged.workstationsPerProject, 'workstationsPerProject'),
    totalWorkstations: positiveInteger(merged.totalWorkstations, 'totalWorkstations'),
    worktree: merged.worktree,
    serializedResources: Object.freeze(resources),
    maxEngineerQueue: positiveInteger(merged.maxEngineerQueue, 'maxEngineerQueue'),
    engineerPermission: engineerPermission === null ? null : engineerPermission.trim(),
    imRelay: merged.imRelay,
    managerSection: merged.managerSection,
    engineerSection: merged.engineerSection,
  });
}

export { DEFAULTS as CONFIG_DEFAULTS };
