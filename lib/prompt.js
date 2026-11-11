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
  const resources = Array.isArray(runtime.config.serializedResources)
    ? runtime.config.serializedResources
    : [];
  const codex = runtime.config.engineerBackend === 'codex';

  const modelLines = codex
    ? ['- 当前是 Codex 模式：执行者通过本机 `codex` CLI 运行；模型由 `codexModel`、思考强度由 `codexReasoningEffort` 或 Codex 原生配置决定，`engineerModels` 与按任务 `model` 的 provider/model 形式都不适用。']
    : (models.length === 0
      ? ['- 未配置工程师模型：派发时不指定 model，工程师使用你当前的模型。']
      : models.map((entry) => `- ${entry.provider}/${entry.model}：${entry.description || '通用任务'}`));
  const resourceLine = resources.length === 0
    ? '- 当前未配置串行资源；同一共享环境上的任务只能自行排好先后。'
    : `- 当前可用串行资源：${resources.join('、')}。共享环境（测试、发布、数据库）上的操作要声明对应资源；同一环境上的发布/部署与验证、造数不能并行。`;

  return [
    '## 派活模式 · 经理',
    '你当前是「经理」会话。你负责与用户确认需求、拆解任务、派发、验收与交付；你不亲自执行任务，也不能修改任何文件或代码。',
    '',
    '### 工作方式',
    '1. 用户每次提出需求时，先用 1–3 句总结目标与验收条件（这就是「简单分析、总结」），然后**必须**调用 `paihuo_dispatch` 把任务派发出去，不要自己动手。',
    '2. 派发工具会立即返回任务号与工程师状态，**不会阻塞本轮**；你随后用一两句话告诉用户：派给了谁、已开工还是排队。',
    '3. 派发后用户可以继续在本会话提新需求，你也可以继续派发。',
    '4. 你只能看到只读工具（read/glob/grep/web/skill 等）、记忆工具（memory_*）、IM 工具（`dsh_im_*`：把图片/文件发回聊天、读群历史）与派活工具；改文件、跑命令这类写入工具对你不可见，也不要尝试绕过。',
    '   - 记忆工具只读写记忆库，不改工作区，所以不算「动手」：用户的决策、纠正随时可以用 `memory_remember` / `memory_update` 记下来；收到记忆整理（dream）任务时照常用 `memory_remember` / `memory_update` / `memory_dream` 落库，正常回复即可。',
    '   - IM 工具只在用户从聊天里发起的那一轮可用：用户要图片/文件时用 `dsh_im_return_file` 登记路径，渠道会在本轮结束后上传；登记后只说「已准备发送」，不要说已经发出。从 DSH Web 发起的回合没有 IM 上传通道，工具会明确报错，这时让用户到聊天里再要一次。',
    '   - 用户可以在 设置 → 派活 →「经理工具放行」里额外放行工具（含第三方 MCP）或关掉默认工具；放行后你就能看到并调用。工具确实不存在时直接说没这个能力，不要假装调用过。',
    '5. 你可以用 `skill` 工具查看当前可用技能并阅读其说明；读技能只是查资料，不算执行任务。写任务书时把相关技能的关键步骤、交付格式与验收标准写进去，让工程师按技能执行。',
    '',
    ...(codex
      ? [
        '### Codex 工程师（当前后端）',
        '- 派发会启动本机 `codex exec`；同一工程师再次派发或追加消息时，会用 `codex exec resume` 续接同一 Codex 会话。',
        '- 可以复用：传 `engineer` 或 `reuse: "auto"`；开发与测试仍然必须用不同的工程师。',
        '- Codex 的最终回答就是本轮回报；`paihuo_integrate` 在 Codex 模式下也交给 Codex 工程师。',
        '- 模型、沙箱与审批由插件的 `codexModel` / `codexSandbox` / `codexBypassApprovals` 和 Codex 原生配置决定，不受你的权限预设自动降级。',
        '- 运行中的任务可以用 `paihuo_message`：`queue` 在当前轮结束后送达；`steer` 会中断当前轮，再用同一会话续接这条消息。',
        '',
      ]
      : []),
    '### 待办与提问',
    '- 需求包含多个步骤、需要持续跟进，或同时有多个工程师任务时，先用 `paihuo_todo` 建待办（`action: "add"`，`items` 可一次添加多项）。开始做一项时用 `start`，等待工程师/用户时用 `pause`，继续用 `resume`，完成后 `complete`，不再需要时 `remove`。待办显示在会话右上角，不需要在回复里重复整份清单。',
    '- 需要用户确认、选择或补充信息时用 `ask_user_question`。问题默认 1 秒后转入会话右上角的「问题表」，本轮不会长时间阻塞；用户回答后你会收到一条 `answer_to_pending_question` 用户消息，按它继续原任务。只有没有答案就绝对不能继续时才传 `timeout: -1`。',
    '- 一次把相关的问题批量问完，避免逐条追问。待办统一用 `paihuo_todo`，不要用 `todo_write`（经理预设已移除）。',
    '- 每轮结束前如果没有查看/修改待办，系统会注入一条【派活系统提醒】强制核对；收到后先 `paihuo_todo({ "action": "list" })`，对照 `paihuo_tasks` / `paihuo_engineers` 的真实状态修正，再结束本轮。',
    '',
    '### 派发决策',
    ...(codex
      ? ['- **默认新建 Codex 工程师**。同一条工作线的后续可以传 `engineer` 或 `reuse: "auto"` 复用已有会话；`paihuo_engineers` 可以查会话 id。']
      : ['- **默认新建工程师**。任务与之前的任务关系不大、或属于新的工作方向时，一律新建；只有明确是同一条工作线的后续（同一批文件/同一功能的延续）才用 `paihuo_engineers` 查到会话 id 后复用（`engineer` 参数），或用 `reuse: "auto"`。']),
    '- **开发与测试必须用不同的工程师**：验证/测试任务永远新建工程师（`reuse: "new"` 或不传 engineer），不能复用刚写代码的那一个。',
    '- 任务描述（`brief`）要写清：目标、涉及文件/目录、验收标准、需要运行的测试、不要做什么。工程师看不到本会话，必须自包含。',
    '- `brief` 里不要出现「用户已核实、之前、昨天、刚才」这类指代会话的词。工程师没有本会话的上文，只能把它们当成事实，而它无法验证；把承前信息改写成设备/代码/数据库当下的客观状态，判据是工程师能用一条命令或一次查询自己确认。历史只有在构成约束时才写，并且写成「现状 + 不要做什么」，不要写成叙事。',
    '- 用户在聊天里发的图片会随任务自动转给工程师（默认取本轮或最近两轮用户消息里的图片，两种后端都支持）；图片与这次任务无关时传 `images: "none"`；确实要用更早的旧图时传 `images: "latest"`。',
    '- 任务涉及专门技能（文档/表格/幻灯片、插件开发、某个领域流程等）时，先用 `skill` 读对应说明，再把关键步骤与产物要求写进 `brief`。',
    ...(codex
      ? ['- 关联/紧急任务用 `priority: "urgent"`；已经在跑的 Codex 任务要补充信息时用 `paihuo_message`（`queue` 排到当前轮之后，`steer` 中断当前轮后续接）。']
      : ['- 关联任务（有后续影响）、紧急任务用 `priority: "urgent"`，它会插到该工程师队列最前；已经在跑的任务要补充信息时用 `paihuo_message`（`mode: "steer"` 立即送达）。']),
    ...(resources.includes('browser')
      ? ['- 前端/浏览器测试类任务必须带 `resources: ["browser"]`；该资源全局串行，避免争抢浏览器。']
      : []),
    resourceLine,
    '',
    '### worktree（隔离工作区）',
    codex
      ? `- 插件配置的默认值是 ${runtime.config.worktree ? '「建」' : '「不建」'}。**新建 Codex 工程师**时会创建独立 git worktree；复用已有 Codex 工程师时沿用它的工作目录，worktree 参数无效。`
      : `- 插件配置的默认值是 ${runtime.config.worktree ? '「建」' : '「不建」'}。**新建**工程师时 worktree 参数决定是否给它独立 git worktree；复用已有工程师时该参数无效，任务沿用其现有工作目录，派发回执会写明实际工作区。`,
    '- **需要建（默认，`worktree: true`）**：任务会改代码/文档；多个工程师可能并行改同一批文件；需要独立跑构建/测试而不污染主工作区。默认就应该建，不要因为「文件不重叠」就关掉。',
    '- **新建时可以不建（`worktree: false`，必须同时给 `worktree_reason`）**：只读分析、出报告、不改任何文件；必须读取主工作区里未提交的改动；必须在主工作区跑依赖当前未提交状态的集成测试或部署。复用工程师时不需要该参数。',
    '- 关掉 worktree 时把理由写进 `worktree_reason`（会显示在派发回执里，用户能看到）；没有正当理由就给 `worktree_reason: "只读分析，不写文件"` 这类真实原因，不要为了省事关闭。',
    '',
    '### 工位与容量',
    `- 单项目工位上限 ${runtime.config.workstationsPerProject}，全局工位上限 ${runtime.config.totalWorkstations}；工位不足时任务自动排队，空出后由系统自动开工并回报。`,
    '- 当前占用、排队位置与工程师状态用 `paihuo_engineers` / `paihuo_tasks` 查询；`paihuo_dispatch` 的回执里也会给出该任务的排队位置。',
    '- 工程师此刻在做什么、卡在什么命令上：用 `paihuo_transcript` 看它最近的对话与工具调用（传 `engineer` 或 `task_id`）。用户问进度而还没收到回报时，先看这里再回答，不要凭空猜测。',
    '- 排队时不需要轮询；工程师完成会主动回报到你这里。',
    '',
    '### 工程师模型',
    ...modelLines,
    '',
    '### 完成与交付',
    codex
      ? '- Codex 工程师完成后，你会收到以「【派活系统回报｜不是用户消息】」开头、以「【派活系统回报结束】」结尾的消息。它由插件注入，**不是用户发言**：不要把它当成用户的新要求，也不要回复“收到”，直接按报告内容决定下一步。'
      : '- 工程师完成后，你会收到以「【派活系统回报｜不是用户消息】」开头、以「【派活系统回报结束】」结尾的消息。它由插件注入，**不是用户发言**：不要把它当成用户的新要求，也不要回复“收到”，直接按报告内容决定下一步。',
    '- 报告里包含结果、变更文件、测试与阻塞；执行者在独立分支上完成时会附上分支与提交哈希。',
    '- 验收：先看报告与分支。需要合并时调用 `paihuo_integrate({ "task_id": "tN" })`，它会派一个执行者在主工作区把该分支合入**用户下发任务时所处的分支**（即任务基线分支），合并后回报。用户指定了别的分支就用 `target_branch`。',
    '- 也可以先派发验证/测试任务给另一位执行者，再交付；交付就是你的回复文本，不需要工具。',
    '- 需要取消时用 `paihuo_cancel`；任务细节用 `paihuo_task` 查看。',
    ...(codex
      ? ['- Codex 工程师空闲时可以用 `paihuo_release({ "engineer": "codex-…" })` 从插件中释放；Codex 原生会话文件不会被删除。']
      : ['- 用户说某个工程师会话不再需要、要恢复成普通会话时，用 `paihuo_release({ "engineer": "session-…" })`；该会话必须空闲（没有运行中或排队任务）。']),
    '',
    '### 权限',
    ...(codex
      ? [
        '- Codex 的审批与沙箱由插件的 `codexSandbox` / `codexBypassApprovals` 和 Codex 原生配置决定；插件不会把你的权限预设自动应用到 Codex，也不会自动降级。',
        '- 你仍然不能派发到工作目录之外的目录（除非你是完全权限）；Codex 自身能写到哪里由这些配置负责。',
      ]
      : [
        '- 工程师默认继承你的权限预设；你不能向权限更高的会话派发任务。',
        '- 你是「完全权限」时可以派发到任何与当前项目相关的目录（以用户声明为准）；只有「工作区内修改」时只能派发到你的工作目录之内。',
      ]),
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
    '- 只读/验证任务没有代码改动时不要创建空提交；没有改动就不填 `branch`/`commit`。',
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
      '- 你在主工作区工作：不要提交、切换分支或 push，除非任务说明里明确要求；改动留在工作区并写清改了哪些文件。',
      '- 只读/验证任务没有代码改动时不要创建空提交；没有改动就不填 `branch`/`commit`。',
    );
  }
  return lines.join('\n');
}

/**
 * Codex 工程师的任务消息。Codex 没有 DSH 会话，也没有 `paihuo_report` 工具；
 * 最终回答就是本轮回报。同一工程师后续的补充/任务会用 resume 续接。
 *
 * @param {object} task 任务记录。
 * @param {object} engineer 工程师记录。
 * @returns {string} 任务全文。
 */
export function buildCodexTaskPrompt(task, engineer) {
  const worktree = engineer?.worktree ?? task.worktree ?? null;
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
    '- 直接使用你的文件、终端与测试工具完成任务。',
    '- 同一会话可能收到后续任务或补充消息；每次都以最新的任务说明为准，必要时结合之前的会话上下文。',
    '- 完整执行任务，不要向用户提问（用户不在这个执行现场）；遇到阻塞就在最终回答里如实说明。',
    '- 只修改任务指定的项目/工作目录内的文件，不要改动任务目录之外的内容。',
  );
  if (worktree !== null && worktree !== undefined) {
    lines.push(
      `- **你只能在这个工作目录（你的独立 worktree：${worktree.path}）内操作**：不要 cd 到主工作区、不要读写主工作区或其它 worktree 里的文件。`,
      `- 完成前把改动提交到你的分支：\`git add -A && git commit -m "<简述>"\`（分支 ${worktree.branch}）。`,
      '- 只在该分支上提交：不要切分支、不要合并、不要 push。经理会在验收后统一合并。',
    );
  } else {
    lines.push(
      '- 你在主工作区工作：不要提交、切换分支或 push，除非任务说明里明确要求；改动留在工作区并写清改了哪些文件。',
    );
  }
  lines.push(
    '',
    '## 最终回答（这就是回报）',
    '- 用与任务说明相同的语言，简要说明：结果、改动过的文件、运行过的测试、阻塞或未完成项。',
    '- 如果无法完成，如实说明失败/阻塞原因和已尝试的做法；不要编造成功。',
  );
  return lines.join('\n');
}
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
  const codex = task.backend === 'codex';
  const worktree = engineer?.worktree ?? task.worktree ?? null;
  const outcome = task.status === 'done' ? '已完成' : (task.status === 'blocked' ? '被阻塞' : '失败');
  const executor = codex
    ? `Codex 工程师 ${task.engineerId ?? '（未知）'}${worktree ? `（分支 ${worktree.branch}）` : ''}`
    : `${engineer?.sessionId ?? task.engineerId ?? '（未知）'}${worktree ? `（分支 ${worktree.branch}）` : ''}`;
  const lines = [
    '【派活系统回报｜不是用户消息】',
    `任务 #${task.taskId}「${task.title}」${outcome}。`,
    `- 工程师：${executor}`,
    `- 项目：${projectName(task.projectPath)}`,
  ];
  if (codex) lines.push(`- 后端：Codex 工程师（CLI）${task.codexSessionId ? `｜会话 ${task.codexSessionId}` : ''}`);
  if (report !== undefined) {
    lines.push(`- 结果：${report.outcome}${!codex && report.unreported ? '（工程师未显式调用报告工具，摘要为最后一条回复摘录）' : ''}`);
    lines.push(`- 摘要：${shorten(report.summary, REPORT_SUMMARY_CHARS) || '（无）'}`);
    if (Array.isArray(report.changes) && report.changes.length > 0) {
      const shown = report.changes.slice(0, REPORT_CHANGE_ITEMS).map((entry) => shorten(entry, REPORT_CHANGE_CHARS));
      const extra = report.changes.length - shown.length;
      lines.push(`- 改动：${shown.join('、')}${extra > 0 ? `…等 ${report.changes.length} 项` : ''}`);
    }
    if (report.tests !== undefined && report.tests !== '') lines.push(`- 测试：${shorten(report.tests, REPORT_DETAIL_CHARS)}`);
    if (report.branch !== undefined && report.branch !== '') lines.push(`- 分支：${report.branch}`);
    if (report.commit !== undefined && report.commit !== '') lines.push(`- 提交：${report.commit}`);
    const sourceBranch = worktree?.branch ?? report.branch ?? null;
    const targetBranch = task.baseBranch ?? null;
    if (task.integration !== undefined) {
      if (task.status === 'done') {
        lines.push(`- 合并结果：${task.integration.branch} → ${task.integration.target}（已合入，无需再合并）`);
      }
    } else if (
      task.status === 'done'
      && sourceBranch !== null && sourceBranch !== ''
      && targetBranch !== null && targetBranch !== ''
      && sourceBranch !== targetBranch
    ) {
      lines.push(`- 目标分支：${targetBranch}（验收后用 paihuo_integrate 合并）`);
    }
    if (report.blockers !== undefined && report.blockers !== '') lines.push(`- 阻塞：${shorten(report.blockers, REPORT_DETAIL_CHARS)}`);
    if (report.reason !== undefined && report.reason !== '') lines.push(`- 结束原因：${report.reason}`);
    lines.push(`- 完整报告：需要细节时调用 \`paihuo_task({ "task_id": "${task.taskId}" })\`。`);
  } else {
    lines.push('- 结果：没有收到结构化报告。');
  }
  lines.push('', '请决定：派发验证/测试任务，或直接向用户交付。', '【派活系统回报结束】');
  return lines.join('\n');
}

/**
 * 空闲 Codex 工程师对经理补充消息的回复。不是任务回报，不写任务台账。
 *
 * @param {object} engineer 工程师记录。
 * @param {string} summary 回复摘要。
 * @returns {string} 消息文本。
 */
export function buildCodexSupplementMessage(engineer, summary) {
  return [
    '【派活系统补充回复｜不是用户消息】',
    `Codex 工程师 ${engineer?.sessionId ?? '（未知）'} 对经理补充的回复：`,
    shorten(summary, REPORT_SUMMARY_CHARS) || '（无内容）',
    '【派活系统补充回复结束】',
  ].join('\n');
}

/**
 * 空闲会话工程师对经理补充消息的回复。
 *
 * 与 Codex 补充回复同形：补充消息不属于任何任务，但工程师做完之后经理必须
 * 知道结果，否则经理会一直以为对方还在干活。
 *
 * @param {object} engineer 工程师记录。
 * @param {string} summary 回复摘要（可能是空字符串）。
 * @param {string} [reason] 回合结束原因（completed / error 等）。
 * @returns {string} 消息文本。
 */
export function buildSessionSupplementMessage(engineer, summary, reason) {
  const worktree = engineer?.worktree ?? null;
  const lines = [
    '【派活系统补充回复｜不是用户消息】',
    `工程师 ${engineer?.sessionId ?? '（未知）'} 对经理补充的回复${worktree ? `（分支 ${worktree.branch}）` : ''}：`,
    shorten(summary, REPORT_SUMMARY_CHARS) || '（没有可提取的最终回复）',
  ];
  if (reason !== undefined && reason !== '' && reason !== 'completed') {
    lines.push(`- 结束原因：${reason}`);
  }
  lines.push('【派活系统补充回复结束】');
  return lines.join('\n');
}

/**
 * 经理轮次结束前缺少待办核对时的强制提醒。
 *
 * 这是“响应后”的追加强制步骤：第一次回复已经发出，这里要求经理在同一轮内
 * 再查看并修正待办；不是用户的新需求。
 *
 * @returns {string} 提醒文本。
 */
export function buildTodoCheckReminder() {
  return [
    '【派活系统提醒｜不是用户消息】',
    '你在本轮结束前没有查看或修改待办清单。待办必须与真实现状一致，请现在：',
    '1. 调用 `paihuo_todo({ "action": "list" })` 查看当前清单；',
    '2. 已完成/不再需要的项标记 `complete` 或 `remove`；新增工作用 `add`，范围变化用 `update`；',
    '3. 需要时先用 `paihuo_tasks` / `paihuo_engineers` 对照真实任务与工程师状态，再决定标记；',
    '4. 清单已经准确时，简短说明「待办已核对」即可。',
    '这是本轮结束前的强制核对，不要跳过，也不要把它当成用户的新需求。',
    '【派活系统提醒结束】',
  ].join('\n');
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
  const codex = runtime.config.engineerBackend === 'codex';
  let backendLine = '后端：会话工程师。';
  if (codex) {
    const cli = runtime.codexCli;
    const stateText = cli === undefined ? '未检测' : (cli.ok === true && cli.canResume === true ? '可用' : '不可用');
    backendLine = `后端：Codex 工程师（CLI ${runtime.config.codexCommand}，${stateText}；模型 ${runtime.config.codexModel ?? '原生默认'}；思考强度 ${runtime.config.codexReasoningEffort ?? '模型默认'}；沙箱 ${runtime.config.codexSandbox}）。`;
  }
  const codexEngineers = engineers.filter((entry) => entry.backend === 'codex').length;
  return [
    `当前角色：${label}。`,
    backendLine,
    `工位：全局 ${runningCount(state.tasks)}/${runtime.config.totalWorkstations}，单项目上限 ${runtime.config.workstationsPerProject}。`,
    `本会话工程师 ${engineers.length} 名${codex ? `（其中 Codex 工程师 ${codexEngineers} 个，可复用）` : ''}，未完成任务 ${pending.length} 个，未完成待办 ${openTodos} 项。`,
    `状态存储：${runtime.persistence?.mode === 'domain' ? '持久化' : '仅内存（重启后队列丢失）'}`,
    role === ROLE_NONE ? '用 /paihuo on 进入派活模式。' : '',
  ].filter(Boolean).join('\n');
}
