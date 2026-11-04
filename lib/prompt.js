/**
 * 提示词与消息文本：经理/工程师系统提示段、派发任务消息、回报消息。
 */

import { basename } from 'node:path';

import { runningCount, shorten } from './policy.js';
import { ROLE_ENGINEER, ROLE_MANAGER, ROLE_NONE } from './wire.js';

function projectName(path) {
  const value = String(path ?? '');
  if (value === '') return '';
  const name = basename(value);
  return name === '' ? value : name;
}

/**
 * 经理的提示段。整段必须是静态文本。
 *
 * DSH 每一步都会重新装配 system prompt；只要这里出现实时状态（工位占用、
 * 未完成任务数、工程师清单），派发、开工、排队推进与回报都会改变提示词，
 * 使本次请求的整段上下文缓存（DeepSeek 的 prompt_cache_hit_tokens）失效。
 * 实测这类会话的缓存命中率会从 ~99% 掉到 ~30%，并显著推高 token 消耗。
 * 实时状态一律通过 `paihuo_engineers` / `paihuo_tasks` 查询。
 *
 * @param {object} runtime 插件运行时。
 * @returns {string} 提示段文本。
 */
export function buildManagerSection(runtime) {
  if (typeof runtime.config.managerSection === 'string') return runtime.config.managerSection;
  const models = runtime.config.engineerModels;

  const modelLines = models.length === 0
    ? '- 未配置工程师模型：派发时不指定 model，工程师使用你当前的模型。'
    : models.map((entry) => `- ${entry.provider}/${entry.model}：${entry.description || '通用任务'}`).join('\n');

  return [
    '## 派活模式 · 经理',
    '你当前是「经理」会话。你负责与用户确认需求、拆解任务、派发、验收与交付；你不亲自执行任务，也不能修改任何文件或代码。',
    '',
    '### 工作方式',
    '1. 用户每次提出需求时，先用 1–3 句总结目标与验收条件（这就是「简单分析、总结」），然后**必须**调用 `paihuo_dispatch` 把任务派发出去，不要自己动手。',
    '2. 派发工具会立即返回任务号与工程师状态，**不会阻塞本轮**；你随后用一两句话告诉用户：派给了谁、已开工还是排队。',
    '3. 派发后用户可以继续在本会话提新需求，你也可以继续派发。',
    '4. 你只能看到只读工具（read/glob/grep/web/skill 等）与派活工具；写入类工具对你不可见，也不要尝试绕过。',
    '5. 你可以用 `skill` 工具查看当前可用技能并阅读其说明；读技能只是查资料，不算执行任务。写任务书时把相关技能的关键步骤、交付格式与验收标准写进去，让工程师按技能执行。',
    '',
    '### 待办与提问',
    '- 需求包含多个步骤、需要持续跟进，或同时有多个工程师任务时，先用 `paihuo_todo` 建待办（`action: "add"`，`items` 可一次添加多项）。开始做一项时用 `start`，等待工程师/用户时用 `pause`，继续用 `resume`，完成后 `complete`，不再需要时 `remove`。待办显示在会话右上角，不需要在回复里重复整份清单。',
    '- 需要用户确认、选择或补充信息时用 `ask_user_question`。问题默认 1 秒后转入会话右上角的「问题表」，本轮不会长时间阻塞；用户回答后你会收到一条 `answer_to_pending_question` 用户消息，按它继续原任务。只有没有答案就绝对不能继续时才传 `timeout: -1`。',
    '- 一次把相关的问题批量问完，避免逐条追问。待办统一用 `paihuo_todo`，不要用 `todo_write`（经理预设已移除）。',
    '',
    '### 派发决策',
    '- **默认新建工程师**。任务与之前的任务关系不大、或属于新的工作方向时，一律新建；只有明确是同一条工作线的后续（同一批文件/同一功能的延续）才用 `paihuo_engineers` 查到会话 id 后复用（`engineer` 参数），或用 `reuse: "auto"`。',
    '- **开发与测试必须用不同的工程师**：验证/测试任务永远新建工程师（`reuse: "new"` 或不传 engineer），不能复用刚写代码的那一个。',
    '- 任务描述（`brief`）要写清：目标、涉及文件/目录、验收标准、需要运行的测试、不要做什么。工程师看不到本会话，必须自包含。',
    '- 任务涉及专门技能（文档/表格/幻灯片、插件开发、某个领域流程等）时，先用 `skill` 读对应说明，再把关键步骤与产物要求写进 `brief`。',
    '- 关联任务（有后续影响）、紧急任务用 `priority: "urgent"`，它会插到该工程师队列最前；已经在跑的任务要补充信息时用 `paihuo_message`（`mode: "steer"` 立即送达）。',
    '- 前端/浏览器测试类任务必须带 `resources: ["browser"]`；该资源全局串行，避免争抢浏览器。',
    '',
    '### worktree（隔离工作区）',
    `- 插件配置的默认值是 ${runtime.config.worktree ? '「建」' : '「不建」'}。**新建**工程师时 worktree 参数决定是否给它独立 git worktree；复用已有工程师时该参数无效（沿用其现有工作目录）。`,
    '- **需要建（默认，`worktree: true`）**：任务会改代码/文档；多个工程师可能并行改同一批文件；需要独立跑构建/测试而不污染主工作区。默认就应该建，不要因为「文件不重叠」就关掉。',
    '- **可以不建（`worktree: false`，必须同时给 `worktree_reason`）**：只读分析、出报告、不改任何文件；必须读取主工作区里未提交的改动；必须在主工作区跑依赖当前未提交状态的集成测试或部署。',
    '- 关掉 worktree 时把理由写进 `worktree_reason`（会显示在派发回执里，用户能看到）；没有正当理由就给 `worktree_reason: "只读分析，不写文件"` 这类真实原因，不要为了省事关闭。',
    '',
    '### 工位与容量',
    `- 单项目工位上限 ${runtime.config.workstationsPerProject}，全局工位上限 ${runtime.config.totalWorkstations}；工位不足时任务自动排队，空出后由系统自动开工并回报。`,
    '- 当前占用、排队位置与工程师状态用 `paihuo_engineers` / `paihuo_tasks` 查询；`paihuo_dispatch` 的回执里也会给出该任务的排队位置。',
    '- 排队时不需要轮询；工程师完成会主动回报到你这里。',
    '',
    '### 工程师模型',
    modelLines,
    '',
    '### 完成与交付',
    '- 工程师完成后，你会收到以「【派活系统回报｜不是用户消息】」开头、以「【派活系统回报结束】」结尾的消息。它由插件注入，**不是用户发言**：不要把它当成用户的新要求，也不要回复“收到”，直接按报告内容决定下一步。',
    '- 报告里包含结果、变更文件、测试与阻塞；工程师在独立分支上完成时会附上分支与提交哈希。',
    '- 验收：先看报告与分支。需要合并时调用 `paihuo_integrate({ "task_id": "tN" })`，它会派一个工程师在主工作区把该分支合入**用户下发任务时所处的分支**（即任务基线分支），合并后回报。用户指定了别的分支就用 `target_branch`。',
    '- 也可以先派发验证/测试任务给另一位工程师，再交付；交付就是你的回复文本，不需要工具。',
    '- 需要取消时用 `paihuo_cancel`；任务细节用 `paihuo_task` 查看。',
    '- 用户说某个工程师会话不再需要、要恢复成普通会话时，用 `paihuo_release({ "engineer": "session-…" })`；该会话必须空闲（没有运行中或排队任务）。',
    '',
    '### 权限',
    '- 工程师默认继承你的权限预设；你不能向权限更高的会话派发任务。',
    '- 你是「完全权限」时可以派发到任何与当前项目相关的目录（以用户声明为准）；只有「工作区内修改」时只能派发到你的工作目录之内。',
    '',
    '始终用用户使用的语言回复，保持简短。',
  ].join('\n');
}

/** 工程师的提示段（每个工程师会话固定相同）。 */
export function buildEngineerSection(runtime) {
  if (typeof runtime.config.engineerSection === 'string') return runtime.config.engineerSection;
  return [
    '## 派活模式 · 工程师',
    '你是经理派出的「工程师」会话，独立执行任务并汇报结果。任务全文在下一条用户消息里。',
    '',
    '- 完整执行任务：阅读代码、修改、运行测试，直到满足验收条件；不要向用户提问（用户不在这个会话里），遇到阻塞就写进报告。',
    '- 只修改任务指定的项目/工作目录内的文件；不要改动本插件或其它会话。',
    '- 任务给了独立 worktree 时，**只能在自己的 worktree 目录里操作**：不要 cd 到主工作区、不要读写主工作区或其它工程师 worktree 的文件。',
    '- 若任务给了独立分支：完成后提交到该分支，报告里写 `branch` 与 `commit`；不要合并、不要切分支、不要 push。',
    '- 结束时**必须**调用一次 `paihuo_report`，填写 `task_id`、`outcome`、`summary`、`changes`、`tests`、`blockers`。',
    '- 报告后本轮结束；不要调用派活工具（那是经理的工具）。',
  ].join('\n');
}

/**
 * 派发任务消息（作为工程师会话的用户消息）。
 *
 * @param {object} task 任务记录。
 * @param {object} engineer 工程师记录。
 * @returns {string} 任务全文。
 */
export function buildTaskPrompt(task, engineer) {
  const worktree = engineer.worktree;
  const lines = [
    `【派活任务 #${task.taskId}】${task.title}`,
    '',
    `- 项目目录：${task.projectPath}`,
    `- 工作目录：${worktree === null || worktree === undefined ? task.projectPath : worktree.path}`,
  ];
  if (worktree !== null && worktree !== undefined) {
    lines.push(`- Git 分支：${worktree.branch}（基线 ${worktree.baseCommit ?? 'HEAD'}，来自 ${task.baseBranch ?? 'HEAD'}）`);
  } else if (task.baseBranch !== null && task.baseBranch !== undefined) {
    lines.push(`- 工作分支：${task.baseBranch}（主工作区，直接在它上面工作）`);
  }
  lines.push(
    '',
    '## 任务说明',
    task.brief,
    '',
    '## 交付要求',
    `- 完成后调用 paihuo_report({ "task_id": "${task.taskId}", "outcome": "success", ... })。`,
    '- 如果无法完成，如实写 outcome（failed/blocked）、阻塞原因和已尝试的做法。',
    '- 报告里列出改动文件与运行过的测试，方便经理验收。',
  );
  if (worktree !== null && worktree !== undefined) {
    lines.push(
      `- **你只能在这个工作目录（你的独立 worktree：${worktree.path}）内操作**：不要 cd 到主工作区、不要读写主工作区或其它工程师 worktree 里的文件。`,
      `- 完成前把改动提交到你的分支：\`git add -A && git commit -m "<简述>"\`（分支 ${worktree.branch}）。`,
      '- 只在你的分支上提交：不要切分支、不要合并、不要 push。经理会在验收后统一合并。',
      '- 在报告里填写 `branch`（分支名）与 `commit`（提交哈希）。',
    );
  } else {
    lines.push(
      '- 你在主工作区工作：不要提交或切换分支，除非任务说明里明确要求；改动留在工作区并写清改了哪些文件。',
    );
  }
  return lines.join('\n');
}

/** 回报里的摘要与明细上限：只放摘要，完整报告留在台账里按需查询。 */
const REPORT_SUMMARY_CHARS = 600;
const REPORT_DETAIL_CHARS = 240;
const REPORT_CHANGE_ITEMS = 6;
const REPORT_CHANGE_CHARS = 60;

/**
 * 经理收到的完成回报。首尾标记供客户端渲染成可折叠卡片，也提醒模型这不是用户消息。
 *
 * 回报会永久留在经理上下文里并在后续每一步重发，所以只放摘要（约 600 字），
 * 细节（完整测试输出、长改动清单）用 `paihuo_task` 按需读取。
 */
export function buildReportMessage(task, engineer) {
  const report = task.report;
  const outcome = task.status === 'done' ? '已完成' : (task.status === 'blocked' ? '被阻塞' : '失败');
  const lines = [
    '【派活系统回报｜不是用户消息】',
    `任务 #${task.taskId}「${task.title}」${outcome}。`,
    `- 工程师：${engineer?.sessionId ?? task.engineerId ?? '（未知）'}${engineer?.worktree ? `（分支 ${engineer.worktree.branch}）` : ''}`,
    `- 项目：${projectName(task.projectPath)}`,
  ];
  if (report !== undefined) {
    lines.push(`- 结果：${report.outcome}${report.unreported ? '（工程师未显式调用报告工具，摘要为最后一条回复摘录）' : ''}`);
    lines.push(`- 摘要：${shorten(report.summary, REPORT_SUMMARY_CHARS) || '（无）'}`);
    if (Array.isArray(report.changes) && report.changes.length > 0) {
      const shown = report.changes.slice(0, REPORT_CHANGE_ITEMS).map((entry) => shorten(entry, REPORT_CHANGE_CHARS));
      const extra = report.changes.length - shown.length;
      lines.push(`- 改动：${shown.join('、')}${extra > 0 ? `…等 ${report.changes.length} 项` : ''}`);
    }
    if (report.tests !== undefined && report.tests !== '') lines.push(`- 测试：${shorten(report.tests, REPORT_DETAIL_CHARS)}`);
    if (report.branch !== undefined && report.branch !== '') lines.push(`- 分支：${report.branch}`);
    if (report.commit !== undefined && report.commit !== '') lines.push(`- 提交：${report.commit}`);
    if (task.baseBranch !== null && task.baseBranch !== undefined) lines.push(`- 目标分支：${task.baseBranch}（验收后用 paihuo_integrate 合并）`);
    if (report.blockers !== undefined && report.blockers !== '') lines.push(`- 阻塞：${shorten(report.blockers, REPORT_DETAIL_CHARS)}`);
    if (report.reason !== undefined && report.reason !== '') lines.push(`- 结束原因：${report.reason}`);
    lines.push(`- 完整报告：需要细节时调用 \`paihuo_task({ "task_id": "${task.taskId}" })\`。`);
  } else {
    lines.push('- 结果：没有收到结构化报告。');
  }
  lines.push('', '请决定：派发验证/测试任务，或直接向用户交付。', '【派活系统回报结束】');
  return lines.join('\n');
}

/** `/paihuo status` 的文本。 */
export function buildStatusText(runtime, agent, role) {
  const state = runtime.store.get();
  const managerId = agent.id;
  const engineers = Object.values(state.engineers).filter((entry) => entry.managerId === managerId);
  const tasks = Object.values(state.tasks).filter((task) => task.managerId === managerId);
  const pending = tasks.filter((task) => task.status === 'queued' || task.status === 'running');
  const todos = Array.isArray(state.todos?.[managerId]) ? state.todos[managerId] : [];
  const openTodos = todos.filter((todo) => todo.status !== 'completed').length;
  const label = role === ROLE_MANAGER ? '经理' : role === ROLE_ENGINEER ? '工程师' : '普通会话';
  return [
    `当前角色：${label}。`,
    `工位：全局 ${runningCount(state.tasks)}/${runtime.config.totalWorkstations}，单项目上限 ${runtime.config.workstationsPerProject}。`,
    `本会话工程师 ${engineers.length} 名，未完成任务 ${pending.length} 个，未完成待办 ${openTodos} 项。`,
    `状态存储：${runtime.persistence?.mode === 'domain' ? '持久化' : '仅内存（重启后队列丢失）'}`,
    role === ROLE_NONE ? '用 /paihuo on 进入派活模式。' : '',
  ].filter(Boolean).join('\n');
}
