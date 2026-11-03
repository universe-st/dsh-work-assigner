/**
 * 插件配置：手写校验（与 `@deepseek-ai/dsh-plan-mode` 的做法一致），
 * 避免把配置声明绑死在某一个 Schema 运行时上。未知字段直接报错。
 *
 * 根节点是 Schemastery volatile：Loader 可能把一个 Volatile 引用交给 apply，
 * 这里先取当前值再校验。
 */

import { isVolatile } from '@deepseek-ai/cosmokit';

const DEFAULTS = Object.freeze({
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
  /** 覆盖经理提示词段（字符串）。 */
  managerSection: null,
  /** 覆盖工程师提示词段（字符串）。 */
  engineerSection: null,
});

const RESOURCE_PATTERN = /^[a-z][a-z0-9_-]*$/i;

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
    engineerModels: Object.freeze(engineerModels.map(parseModelEntry)),
    workstationsPerProject: positiveInteger(merged.workstationsPerProject, 'workstationsPerProject'),
    totalWorkstations: positiveInteger(merged.totalWorkstations, 'totalWorkstations'),
    worktree: merged.worktree,
    serializedResources: Object.freeze(resources),
    maxEngineerQueue: positiveInteger(merged.maxEngineerQueue, 'maxEngineerQueue'),
    engineerPermission: engineerPermission === null ? null : engineerPermission.trim(),
    managerSection: merged.managerSection,
    engineerSection: merged.engineerSection,
  });
}

export { DEFAULTS as CONFIG_DEFAULTS };
