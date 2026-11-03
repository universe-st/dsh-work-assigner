/**
 * 模型工具面：
 * - 经理：派发、查询工程师/任务、追加消息、取消。
 * - 工程师：结构化回报。
 *
 * 工具只编排 `runtime.tasks` 上的方法，界面/命令/工具共用同一份业务逻辑。
 */

import {
  TOOL_CANCEL,
  TOOL_DISPATCH,
  TOOL_ENGINEERS,
  TOOL_INTEGRATE,
  TOOL_MESSAGE,
  TOOL_RELEASE,
  TOOL_REPORT,
  TOOL_TASK,
  TOOL_TASKS,
} from './wire.js';

const ANY_OBJECT = { type: 'object', additionalProperties: true };

function blocks(text) {
  return [{ type: 'text', text: String(text ?? '') }];
}

function result(title, lines) {
  return {
    shape: 'text',
    title,
    text: [title, ...lines.filter(Boolean)].join('\n'),
  };
}

/** 把结果渲染成人类可读文本。 */
function renderResult(_args, value) {
  if (value === null || typeof value !== 'object') return blocks(String(value ?? ''));
  const title = typeof value.title === 'string' ? value.title : '';
  const body = typeof value.text === 'string' ? value.text : JSON.stringify(value, null, 2);
  return blocks(title === '' || body.startsWith(title) ? body : `${title}\n${body}`);
}

function tool(name, description, parameters, execute) {
  return {
    name,
    description,
    parameters,
    output: { schema: ANY_OBJECT, render: renderResult },
    execute: async (args, exec) => {
      const value = await execute(args ?? {}, exec);
      return value === undefined ? { shape: 'text', title: '', text: '' } : value;
    },
  };
}

/**
 * 经理工具（注册在经理代理作用域内）。
 *
 * @param {object} runtime 插件运行时。
 * @returns {object[]} 工具定义。
 */
export function createManagerTools(runtime) {
  return [
    tool(
      TOOL_DISPATCH,
      [
        '派发任务给「工程师」会话执行。经理不自己执行任务，收到用户需求后应先简要总结，再调用本工具。',
        '工具立即返回（不阻塞本轮）：返回任务号、工程师会话、是已开工还是排队。',
        '默认每次新建工程师；只有明确相关的后续任务才用 engineer 复用，或用 reuse="auto" 自动复用。开发与测试必须用不同工程师。',
        '关联/紧急任务用 priority="urgent" 插队；前端测试任务请带 resources=["browser"]。',
      ].join('\n'),
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', description: '任务短标题（用于会话标题与台账，≤40 字）。' },
          brief: {
            type: 'string',
            description: '完整任务说明：目标、涉及文件/目录、验收标准、需要运行的测试、不要做什么。工程师看不到本会话，必须自包含。',
          },
          engineer: { type: 'string', description: '已有工程师的会话 id；省略则由系统选择或新建。' },
          reuse: {
            type: 'string',
            enum: ['auto', 'new'],
            description: '默认 new（每次新建工程师）；auto 才允许复用同项目空闲工程师。测试/验证任务不要复用被测试的工程师。',
          },
          project_path: { type: 'string', description: '项目绝对路径；默认当前会话工作目录。' },
          model: { type: 'string', description: '工程师模型，形如 provider/model；省略则与你当前模型相同。' },
          worktree: {
            type: 'boolean',
            description: [
              '是否给新建工程师独立 git worktree（复用已有工程师时无效）。默认取插件配置。',
              '建议建：任务会改代码/文档、多个工程师可能并行改同一批文件、需要独立跑构建测试。',
              '可以不建：只读分析/出报告、必须读取主工作区未提交改动、必须在主工作区跑集成测试或部署。',
            ].join(' '),
          },
          worktree_reason: {
            type: 'string',
            description: '当 worktree=false 且配置默认是建时必填：写清不建的真实原因（会显示在派发回执里）。',
          },
          base_branch: {
            type: 'string',
            description: '验收合并的目标分支；省略则自动取项目当前分支（即用户下发任务时所处的分支）。',
          },
          priority: { type: 'string', enum: ['normal', 'urgent'], description: 'urgent 插到该工程师队列最前。' },
          resources: {
            type: 'array',
            items: { type: 'string' },
            description: '需要独占的全局资源，例如 ["browser"]；同资源同时只跑一个任务。',
          },
        },
        required: ['title', 'brief'],
      },
      async (args, exec) => runtime.tasks.dispatch(exec.agent, args),
    ),
    tool(
      TOOL_ENGINEERS,
      '列出本经理名下的工程师：会话 id、项目、状态、当前任务、排队数、模型、权限与 worktree 分支。复用工程师前先查这里。',
      { type: 'object', additionalProperties: false, properties: {} },
      async (args, exec) => runtime.tasks.listEngineers(exec.agent),
    ),
    tool(
      TOOL_TASKS,
      '查看任务台账：状态、工程师、时间与结果摘要。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: {
            type: 'string',
            enum: ['queued', 'running', 'done', 'failed', 'blocked', 'cancelled', 'interrupted'],
            description: '只看某个状态。',
          },
          engineer: { type: 'string', description: '只看某个工程师会话。' },
          limit: { type: 'integer', description: '最多返回多少条（默认 20，最大 100）。' },
        },
      },
      async (args, exec) => runtime.tasks.listTasks(exec.agent, args),
    ),
    tool(
      TOOL_TASK,
      '查看单个任务的全部信息（含任务说明与工程师报告）。',
      {
        type: 'object',
        additionalProperties: false,
        properties: { task_id: { type: 'string', description: '任务号，如 t3。' } },
        required: ['task_id'],
      },
      async (args, exec) => runtime.tasks.getTask(exec.agent, args),
    ),
    tool(
      TOOL_MESSAGE,
      '给工程师追加消息：mode="queue" 排在本轮之后；mode="steer" 立即插入当前轮下一步（用于紧急补充或纠偏）。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          engineer: { type: 'string', description: '工程师会话 id。' },
          message: { type: 'string', description: '要追加的说明。' },
          mode: { type: 'string', enum: ['queue', 'steer'], description: '默认 queue。' },
        },
        required: ['engineer', 'message'],
      },
      async (args, exec) => runtime.tasks.messageEngineer(exec.agent, args),
    ),
    tool(
      TOOL_CANCEL,
      '取消一个排队中或运行中的任务。运行中的任务会停止该工程师当前轮次，并忽略随后的结束事件。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          task_id: { type: 'string', description: '任务号。' },
          reason: { type: 'string', description: '取消原因（会记入台账）。' },
        },
        required: ['task_id'],
      },
      async (args, exec) => runtime.tasks.cancelTask(exec.agent, args),
    ),
    tool(
      TOOL_INTEGRATE,
      [
        '验收合并：把一个已完成任务的分支合入目标分支（默认是用户下发任务时所处的分支）。',
        '会派一个新建工程师在主工作区执行 git merge --no-ff、解决冲突、跑测试，并回报到本会话。',
        '主工作区不干净或分支不存在时会如实报告阻塞，不会强行动手。',
      ].join('\n'),
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          task_id: { type: 'string', description: '已完成（status=done）的来源任务号，如 t3。' },
          target_branch: {
            type: 'string',
            description: '合入的目标分支；省略则用该任务的基线分支（用户下发任务时的分支）。',
          },
        },
        required: ['task_id'],
      },
      async (args, exec) => runtime.tasks.integrate(exec.agent, args),
    ),
    tool(
      TOOL_RELEASE,
      [
        '把某个空闲的工程师会话恢复成普通会话：移除工程师角色、派活工具与标题前缀，之后可当普通会话使用。',
        '用户要求「这个工程师会话不用了/恢复成普通会话」时调用；正在执行或还有排队任务时会拒绝。',
      ].join('\n'),
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          engineer: { type: 'string', description: '要恢复的工程师会话 id（可用 paihuo_engineers 查）。' },
        },
        required: ['engineer'],
      },
      async (args, exec) => runtime.tasks.releaseEngineer(exec.agent, args),
    ),
  ];
}

/** 工程师工具（注册在工程师代理作用域内）。 */
export function createEngineerTools(runtime) {
  return [
    tool(
      TOOL_REPORT,
      '向经理回报任务结果。任务结束时必须调用一次；报告后本轮结束。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          task_id: { type: 'string', description: '派发时给出的任务号，如 t3。' },
          outcome: { type: 'string', enum: ['success', 'failed', 'blocked'], description: '结果。' },
          summary: { type: 'string', description: '做了什么、结果如何（经理据此决定验收/交付）。' },
          changes: { type: 'array', items: { type: 'string' }, description: '改动过的文件或目录。' },
          tests: { type: 'string', description: '运行过的测试与结果。' },
          blockers: { type: 'string', description: '阻塞原因或未完成项。' },
          branch: { type: 'string', description: '如果在独立分支上完成，填分支名。' },
          commit: { type: 'string', description: '如果在独立分支上完成，填提交哈希。' },
        },
        required: ['task_id', 'outcome', 'summary'],
      },
      async (args, exec) => runtime.tasks.reportTask(exec.agent, args),
    ),
  ];
}

export { result as textResult };
