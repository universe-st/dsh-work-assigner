/**
 * 「派活」浏览器半区：Settings → 派活 与「插件 → dsh-paihuo」行配置页。
 *
 * 配置页以选项为主：工位用下拉、模型从实际可路由模型里挑、串行资源用开关，
 * 尽量减少自由文本，避免用户面对一堆内部字段名。
 */

window.__ModuleLoader__.load({
  id: 'dsh-paihuo',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;

    const NS = 'paihuo';
    const ENTRY_ID = 'paihuo';
    const CONFIG_KEY = 'dsh-paihuo#paihuo';
    const REMOTE_PACKAGE = 'dsh-paihuo';
    const REMOTE_METHOD_ID = `${REMOTE_PACKAGE}#paihuo/todos`;
    const REMOTE_CODEX_SESSIONS_METHOD_ID = `${REMOTE_PACKAGE}#paihuo/codexSessions`;
    const REMOTE_CODEX_TRANSCRIPT_METHOD_ID = `${REMOTE_PACKAGE}#paihuo/codexTranscript`;
    const REMOTE_CODEX_MODELS_METHOD_ID = `${REMOTE_PACKAGE}#paihuo/codexModels`;
    const REMOTE_TOOLS_METHOD_ID = `${REMOTE_PACKAGE}#paihuo/tools`;
    const REMOTE_ACTIVITY_METHOD_ID = `${REMOTE_PACKAGE}#paihuo/activity`;

    const zh = {
      'settings.title': '派活',
      'settings.summary': '经理/工程师模式、后端、工位、模型与 worktree 配置',
      'config.intro': '经理负责沟通与派发，执行者负责执行。这里限制执行者的来源、规模、模型和隔离方式。',
      'config.section.staffing': '工位与并发',
      'config.section.backend': '执行者后端',
      'config.backend': '执行任务的工程师由谁提供',
      'config.backend.session': '会话工程师（默认，可复用、可追加消息）',
      'config.backend.codex': 'Codex CLI（同一会话可复用、可追加消息）',
      'config.backend.hint': 'Codex 模式直接调用本机 codex 命令；请先确认 codex --version 可用并已登录。',
      'config.codexCommand': 'Codex 命令',
      'config.codexCommand.placeholder': 'codex',
      'config.codexCommand.hint': '默认从 PATH 找 codex；也可以填绝对路径。',
      'config.codexModel': 'Codex 模型（可选）',
      'config.codexModel.placeholder': '留空使用 Codex 原生默认',
      'config.codexModel.native': 'Codex 原生默认',
      'config.codexModel.hint': '列表来自 codex debug models；只显示可选模型。',
      'config.codexModel.loading': '正在读取 Codex 支持的模型…',
      'config.codexModel.failed': '读不到 Codex 模型列表（{error}），可以手动输入模型 id。',
      'config.codexModel.refresh': '刷新列表',
      'config.codexReasoningEffort': '思考强度',
      'config.codexReasoningEffort.default': '模型默认',
      'config.codexReasoningEffort.hint': '由所选模型支持的档位决定；留空使用模型默认。',
      'config.codexReasoningEffort.unsupported': '当前模型没有可配置的思考强度；会使用模型默认。',
      'config.codexSandbox': 'Codex 沙箱',
      'config.codexSandbox.read-only': '只读',
      'config.codexSandbox.workspace-write': '工作区可写',
      'config.codexSandbox.danger-full-access': '完全权限',
      'config.codexBypassApprovals': '跳过 Codex 审批与沙箱（--dangerously-bypass-approvals-and-sandbox）',
      'config.codexSkipGitRepoCheck': '允许在非 git 目录运行 Codex',
      'config.codexTranscriptOutput': '在 Codex 会话菜单中记录命令输出',
      'config.section.models': '工程师模型',
      'config.section.tools': '经理工具放行',
      'config.tools.lead': '经理默认只有只读工具、记忆工具（memory_*）与 IM 工具（dsh_im_*）。这里可以额外放行第三方工具（例如某个 MCP），或关掉不想给经理用的默认工具。',
      'config.tools.button': '打开工具清单',
      'config.tools.summary': '额外放行 {extra} 个，禁用 {denied} 个',
      'config.tools.hint': '改动保存后立刻对已有的经理会话生效；派活工具（paihuo_*）始终可用。',
      'tools.title': '经理工具放行',
      'tools.subtitle': '勾选的工具经理才能看到和调用；派活工具始终可用。',
      'tools.search': '搜索工具名',
      'tools.group.readonly': '只读白名单',
      'tools.group.memory': '记忆（memory_*）',
      'tools.group.im': 'IM（dsh_im_*）',
      'tools.group.other': '第三方 / 其它',
      'tools.group.paihuo': '派活（始终可用）',
      'tools.loading': '正在读取工具清单…',
      'tools.unavailable': '工具清单不可用（Remote 未就绪），请稍后重试。',
      'tools.empty': '没有匹配的工具。',
      'tools.defaults': '恢复默认',
      'tools.save': '保存并关闭',
      'tools.count': '已放行 {allow} / {total}',
      'tools.locked': '不可关闭',
      'common.cancel': '取消',
      'config.section.advanced': '高级',
      'config.workstations': '每个项目同时最多',
      'config.total': '所有项目同时最多',
      'config.queue': '每个工程师排队上限',
      'config.worktree': '每个工程师使用独立 git worktree',
      'config.section.testing': '前端测试',
      'config.browser': '浏览器类任务全局串行（同一时间只跑一个）',
      'config.browser.hint': '避免多个工程师抢同一个浏览器。',
      'config.models.lead': '留空表示工程师使用经理当前的模型。',
      'config.models.codexHint': 'Codex 模式下执行者模型由 codexModel 或 Codex 原生配置决定，这里的列表不生效。',
      'codex.title': 'Codex 子代理',
      'codex.subtitle': '{count} 个会话 · {running} 个运行中',
      'codex.badgeAria': 'Codex 子代理，{count} 个运行中',
      'codex.badgeAriaEmpty': 'Codex 子代理',
      'codex.empty': '还没有 Codex 工程师；派发任务后这里会显示会话内容。',
      'codex.loading': '正在读取 Codex 会话…',
      'codex.loadFailed': '读取 Codex 会话失败',
      'codex.unavailable': 'Codex 会话面板不可用：{error}',
      'codex.refresh': '刷新',
      'codex.transcriptEmpty': '这个会话还没有可显示的内容。',
      'codex.task': '任务 #{task}',
      'codex.managerMessage': '经理补充',
      'codex.command': '命令',
      'codex.output': '输出',
      'codex.exitCode': '退出码 {code}',
      'codex.model': '模型 {model}',
      'codex.worktree': '分支 {branch}',
      'codex.session': '会话 {id}',
      'codex.status.running': '运行中',
      'codex.status.idle': '空闲',
      'codex.noSelection': '从左侧选择一个 Codex 会话。',
      'codex.lastUpdated': '更新于 {time}',
      'codex.hint': '只读；内容来自本插件捕获的 Codex CLI 事件。',
      'codex.streaming': 'Codex 正在执行…',
      'codex.jumpBottom': '回到最新',
      'config.models.pick': '选择一个模型…',
      'config.models.add': '添加',
      'config.models.manual': '模型 ID（provider/model）',
      'config.models.empty': '还没有添加模型。',
      'config.models.note': '适合什么任务（可选）',
      'config.models.catalogFailed': '读不到模型列表，可以手动输入模型 ID。',
      'config.remove': '移除',
      'config.permission': '兜底权限预设',
      'config.permission.default': '跟随目录默认',
      'config.permission.hint': '只在经理权限是「自定义」时用到。',
      'config.save': '保存',
      'config.saving': '保存中…',
      'config.saved': '已保存',
      'config.failed': '保存失败（可能被并发修改），请重试',
      'config.invalid': '请检查数字选项',
      'config.unavailable': '当前 profile 没有为「派活」提供可编辑的配置。',
      'config.loading': '正在读取配置…',
      'report.title': '派活回报',
      'report.notUser': '系统消息 · 不是用户发言',
      'todo.noticeTitle': '待办更新提示...',
      'common.close': '关闭',
      'common.refresh': '刷新',
      'question.title': '问题表',
      'question.subtitle': '回答后经理会继续处理对应任务',
      'question.subtitleEmpty': '当前没有待回答的问题',
      'question.empty': '当前没有待回答的问题。',
      'question.badgeAria': '问题表，{count} 个待回答',
      'question.badgeAriaEmpty': '问题表，没有待回答的问题',
      'question.call': '问题组 {index}',
      'question.group': '第 {index} 组',
      'question.waitingOpen': '该问题仍在等待前台回答。可以打开问答面板，或稍候自动转为待回答。',
      'question.reveal': '打开问答面板',
      'question.revealFailed': '无法打开前台问答面板，请稍后重试。',
      'question.submit': '提交回答',
      'question.submitting': '提交中…',
      'question.skip': '跳过',
      'question.unskip': '取消跳过',
      'question.skipped': '已跳过',
      'question.custom': '自定义回答',
      'question.customPlaceholder': '输入你的回答…',
      'question.answerRequired': '还有问题没有回答；请选择、输入或跳过。',
      'question.submitted': '已提交，经理会继续处理。',
      'question.closed': '该问题已结束或已由其他端回答。',
      'question.failed': '回答提交失败',
      'question.unavailable': '当前客户端无法提交回答。',
      'question.multiHint': '可多选',
      'question.noOptions': '没有预设选项，请直接填写回答。',
      'question.open': '等待前台回答',
      'question.continued': '待回答',
      'todo.title': '待办事项',
      'todo.subtitle': '{count} 项未完成',
      'todo.subtitleEmpty': '当前没有未完成待办',
      'todo.badgeAria': '待办，{count} 项未完成',
      'todo.badgeAriaEmpty': '待办，没有未完成项',
      'todo.empty': '还没有待办。经理会在对话中主动添加。',
      'todo.loading': '正在读取待办…',
      'todo.pending': '待办',
      'todo.inProgress': '进行中',
      'todo.paused': '暂停',
      'todo.completed': '已完成',
      'todo.completedCount': '已完成 {count} 项',
      'todo.refresh': '刷新',
      'todo.hint': '待办由经理在对话中维护；此面板只读。',
      'todo.unavailable': '待办面板不可用：{error}',
      'todo.updated': '更新于 {time}',
      'todo.note': '备注：{note}',
      'todo.loadFailed': '读取待办失败',
    };

    const en = {
      'settings.title': 'Dispatch',
      'settings.summary': 'Manager/engineer mode, backend, workstations, models, and worktrees',
      'config.intro': 'The manager talks and delegates; executors run the work. These settings bound the executor source, pool, models, and isolation.',
      'config.section.staffing': 'Workstations and concurrency',
      'config.section.backend': 'Executor backend',
      'config.backend': 'Who provides the engineers that run tasks',
      'config.backend.session': 'Session engineer (default; reusable, accepts messages)',
      'config.backend.codex': 'Codex CLI (same session reusable, accepts messages)',
      'config.backend.hint': 'Codex mode calls the local codex command directly; make sure codex --version works and you are logged in.',
      'config.codexCommand': 'Codex command',
      'config.codexCommand.placeholder': 'codex',
      'config.codexCommand.hint': 'Defaults to codex on PATH; an absolute path also works.',
      'config.codexModel': 'Codex model (optional)',
      'config.codexModel.placeholder': 'Leave empty for Codex native default',
      'config.codexModel.native': 'Codex native default',
      'config.codexModel.hint': 'The list comes from codex debug models and only shows selectable models.',
      'config.codexModel.loading': 'Loading models supported by Codex…',
      'config.codexModel.failed': 'Could not read the Codex model list ({error}); enter a model id manually.',
      'config.codexModel.refresh': 'Refresh list',
      'config.codexReasoningEffort': 'Reasoning effort',
      'config.codexReasoningEffort.default': 'Model default',
      'config.codexReasoningEffort.hint': 'Driven by the selected model’s supported levels; empty uses the model default.',
      'config.codexReasoningEffort.unsupported': 'This model has no configurable reasoning effort; the model default is used.',
      'config.codexSandbox': 'Codex sandbox',
      'config.codexSandbox.read-only': 'Read-only',
      'config.codexSandbox.workspace-write': 'Workspace write',
      'config.codexSandbox.danger-full-access': 'Full access',
      'config.codexBypassApprovals': 'Bypass Codex approvals and sandbox (--dangerously-bypass-approvals-and-sandbox)',
      'config.codexSkipGitRepoCheck': 'Allow Codex outside a git repository',
      'config.codexTranscriptOutput': 'Record command output in the Codex session menu',
      'config.section.models': 'Engineer models',
      'config.section.tools': 'Manager tools',
      'config.tools.lead': 'The manager sees read-only tools, memory tools (memory_*) and IM tools (dsh_im_*) by default. Allow third-party tools here (for example an MCP tool), or disable defaults you do not want it to use.',
      'config.tools.button': 'Open tool list',
      'config.tools.summary': '{extra} extra allowed, {denied} disabled',
      'config.tools.hint': 'Saved changes apply to existing manager sessions immediately; paihuo_* tools are always available.',
      'tools.title': 'Manager tools',
      'tools.subtitle': 'Only checked tools are visible to the manager; paihuo tools are always available.',
      'tools.search': 'Search tool name',
      'tools.group.readonly': 'Read-only whitelist',
      'tools.group.memory': 'Memory (memory_*)',
      'tools.group.im': 'IM (dsh_im_*)',
      'tools.group.other': 'Third-party / other',
      'tools.group.paihuo': 'Paihuo (always on)',
      'tools.loading': 'Loading tool list…',
      'tools.unavailable': 'Tool list is unavailable (remote not ready); try again later.',
      'tools.empty': 'No matching tools.',
      'tools.defaults': 'Restore defaults',
      'tools.save': 'Save and close',
      'tools.count': '{allow} of {total} allowed',
      'tools.locked': 'always on',
      'common.cancel': 'Cancel',
      'config.section.advanced': 'Advanced',
      'config.workstations': 'Concurrent engineers per project',
      'config.total': 'Concurrent engineers overall',
      'config.queue': 'Queue limit per engineer',
      'config.worktree': 'Give each engineer its own git worktree',
      'config.section.testing': 'Frontend testing',
      'config.browser': 'Serialize browser tasks (one at a time)',
      'config.browser.hint': 'Keeps engineers from fighting over one browser.',
      'config.models.lead': 'Empty means engineers use the manager’s current model.',
      'config.models.codexHint': 'In Codex mode the executor model comes from codexModel or Codex native config; this list has no effect.',
      'codex.title': 'Codex subagents',
      'codex.subtitle': '{count} sessions · {running} running',
      'codex.badgeAria': 'Codex subagents, {count} running',
      'codex.badgeAriaEmpty': 'Codex subagents',
      'codex.empty': 'No Codex engineers yet. Dispatch a task and its session content appears here.',
      'codex.loading': 'Loading Codex sessions…',
      'codex.loadFailed': 'Could not load Codex sessions',
      'codex.unavailable': 'Codex session panel unavailable: {error}',
      'codex.refresh': 'Refresh',
      'codex.transcriptEmpty': 'No content to show for this session yet.',
      'codex.task': 'Task #{task}',
      'codex.managerMessage': 'Manager note',
      'codex.command': 'Command',
      'codex.output': 'Output',
      'codex.exitCode': 'Exit code {code}',
      'codex.model': 'Model {model}',
      'codex.worktree': 'Branch {branch}',
      'codex.session': 'Session {id}',
      'codex.status.running': 'Running',
      'codex.status.idle': 'Idle',
      'codex.noSelection': 'Select a Codex session on the left.',
      'codex.lastUpdated': 'Updated {time}',
      'codex.hint': 'Read-only; content comes from Codex CLI events captured by this plugin.',
      'codex.streaming': 'Codex is running…',
      'codex.jumpBottom': 'Jump to latest',
      'config.models.pick': 'Pick a model…',
      'config.models.add': 'Add',
      'config.models.manual': 'Model id (provider/model)',
      'config.models.empty': 'No models added yet.',
      'config.models.note': 'When to use it (optional)',
      'config.models.catalogFailed': 'The model list is unavailable; enter a model id manually.',
      'config.remove': 'Remove',
      'config.permission': 'Fallback permission preset',
      'config.permission.default': 'Follow the deployment default',
      'config.permission.hint': 'Used only when the manager preset is custom.',
      'config.save': 'Save',
      'config.saving': 'Saving…',
      'config.saved': 'Saved',
      'config.failed': 'Save failed (possibly a concurrent edit); retry',
      'config.invalid': 'Check the numeric choices',
      'config.unavailable': 'This profile serves no editable configuration for Paihuo.',
      'config.loading': 'Loading configuration…',
      'report.title': 'Dispatch report',
      'report.notUser': 'System message · not from the user',
      'todo.noticeTitle': 'Todo update required...',
      'common.close': 'Close',
      'common.refresh': 'Refresh',
      'question.title': 'Question inbox',
      'question.subtitle': 'The manager continues the related task after you answer',
      'question.subtitleEmpty': 'No questions waiting',
      'question.empty': 'No questions waiting for an answer.',
      'question.badgeAria': 'Question inbox, {count} waiting',
      'question.badgeAriaEmpty': 'Question inbox, no waiting questions',
      'question.call': 'Question set {index}',
      'question.group': 'Set {index}',
      'question.waitingOpen': 'This question is still waiting in the foreground. Open the question panel, or wait a moment for it to become answerable here.',
      'question.reveal': 'Open question panel',
      'question.revealFailed': 'Could not open the foreground question panel; try again shortly.',
      'question.submit': 'Submit answers',
      'question.submitting': 'Submitting…',
      'question.skip': 'Skip',
      'question.unskip': 'Unskip',
      'question.skipped': 'Skipped',
      'question.custom': 'Custom answer',
      'question.customPlaceholder': 'Type your answer…',
      'question.answerRequired': 'Some questions are unanswered; choose, type, or skip them.',
      'question.submitted': 'Submitted; the manager will continue.',
      'question.closed': 'This question is already closed or was answered elsewhere.',
      'question.failed': 'Could not submit the answer',
      'question.unavailable': 'This client cannot submit answers right now.',
      'question.multiHint': 'Select any',
      'question.noOptions': 'No preset options; type an answer.',
      'question.open': 'Waiting in foreground',
      'question.continued': 'Waiting for answer',
      'todo.title': 'Todos',
      'todo.subtitle': '{count} open',
      'todo.subtitleEmpty': 'No open todos',
      'todo.badgeAria': 'Todos, {count} open',
      'todo.badgeAriaEmpty': 'Todos, no open items',
      'todo.empty': 'No todos yet. The manager adds them during the conversation.',
      'todo.loading': 'Loading todos…',
      'todo.pending': 'To do',
      'todo.inProgress': 'In progress',
      'todo.paused': 'Paused',
      'todo.completed': 'Completed',
      'todo.completedCount': '{count} completed',
      'todo.refresh': 'Refresh',
      'todo.hint': 'The manager maintains this list in the conversation; this panel is read-only.',
      'todo.unavailable': 'Todo panel unavailable: {error}',
      'todo.updated': 'Updated {time}',
      'todo.note': 'Note: {note}',
      'todo.loadFailed': 'Could not load todos',
    };

    const CSS = `
.PH_cfg { display: flex; flex-direction: column; gap: 18px; max-width: 620px; color: var(--dsw-alias-label-primary); }
.PH_cfgIntro { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.PH_cfgSection { display: flex; flex-direction: column; gap: 10px; padding-top: 14px; border-top: 1px solid var(--dsw-alias-border-l1); }
.PH_cfgSectionTitle { margin: 0; font-size: 13px; font-weight: 600; line-height: 20px; }
.PH_cfgRow { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.PH_cfgLabel { font-size: 13px; font-weight: 500; line-height: 20px; }
.PH_cfgHint { margin: 0; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 17px; }
.PH_cfgGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
.PH_cfgInput, .PH_cfgSelect {
  box-sizing: border-box;
  width: 100%;
  height: 32px;
  padding: 0 9px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
}
.PH_cfgSelect { padding-right: 6px; }
.PH_cfgInput:focus-visible, .PH_cfgSelect:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}
.PH_cfgCheck { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; line-height: 20px; }
.PH_cfgCheck input { accent-color: var(--dsw-alias-state-business-primary); width: 15px; height: 15px; flex: none; }
.PH_cfgLine { display: flex; align-items: center; gap: 8px; }
.PH_cfgLine .PH_cfgSelect, .PH_cfgLine .PH_cfgInput { flex: 1 1 auto; min-width: 0; }
.PH_cfgGhost {
  box-sizing: border-box;
  flex: none;
  height: 30px;
  padding: 0 11px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
  cursor: pointer;
}
.PH_cfgGhost:hover:not(:disabled) { background: var(--dsw-alias-button-floating-fill); color: var(--dsw-alias-label-primary); }
.PH_cfgGhost:disabled { opacity: .5; cursor: default; }
.PH_cfgModels { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.PH_cfgModel { display: flex; align-items: center; gap: 8px; min-width: 0; }
.PH_cfgModelName {
  flex: none;
  max-width: 210px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.PH_cfgModelNote { flex: 1 1 auto; min-width: 0; }
.PH_cfgActions { display: flex; align-items: center; gap: 10px; padding-top: 4px; }
.PH_cfgSave {
  box-sizing: border-box;
  height: 30px;
  padding: 0 16px;
  border: none;
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-state-business-primary);
  color: var(--dsw-alias-label-inverse, #fff);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.PH_cfgSave:disabled { opacity: .55; cursor: default; }
.PH_toolsSearch { width: 100%; box-sizing: border-box; margin: 0 0 10px; }
.PH_toolGroup { margin: 0 0 14px; }
.PH_toolGroupTitle {
  margin: 0 0 6px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 16px;
  font-weight: 600;
  text-transform: none;
}
.PH_toolRow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 4px;
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
}
.PH_toolRow:hover { background: var(--dsw-alias-bg-layer-1); }
.PH_toolName { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.PH_toolLocked { flex: none; color: var(--dsw-alias-label-tertiary); font-size: 10px; line-height: 16px; }
.PH_cfgSave:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}
.PH_cfgStatus { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.PH_cfgStatus[data-kind="ok"] { color: var(--dsw-alias-state-success-primary); }
.PH_cfgStatus[data-kind="error"] { color: var(--dsw-alias-state-error-primary); }

.PH_report {
  box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l1);
  border-left: 3px solid var(--dsw-alias-state-business-primary);
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-base);
  margin: 6px 0;
  overflow: hidden;
}
.PH_reportHead {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  text-align: left;
  cursor: pointer;
}
.PH_reportHead:hover { background: var(--dsw-alias-button-floating-fill); }
.PH_reportHead:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -2px;
}
.PH_reportIcon { flex: none; font-size: 14px; line-height: 1; }
.PH_reportTitles { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1 1 auto; }
.PH_reportTitle { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.PH_reportMeta { color: var(--dsw-alias-label-tertiary); font-size: 11px; line-height: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.PH_reportChevron { flex: none; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.PH_reportBody {
  margin: 0;
  padding: 0 12px 10px 30px;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 待办强制核对：只显示一条紧凑提示，不展开提醒正文。 */
.PH_todoNotice {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-left: 3px solid var(--dsw-alias-state-business-primary);
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
}
.PH_todoNoticeIcon { flex: none; font-size: 14px; line-height: 1; }
.PH_todoNoticeTitle {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

/* 会话列表行：经理=蓝底，工程师=黄底（按角色投影着色）。
   未选中用浅色，选中的当前会话用深色。 */
[data-row-key][data-paihuo-role="manager"] {
  background: #dbeafe !important;
  box-shadow: inset 3px 0 0 #93c5fd;
}
[data-row-key][data-paihuo-role="manager"] span {
  color: #1e3a8a !important;
}
[data-row-key][data-paihuo-role="engineer"] {
  background: #fef3c7 !important;
  box-shadow: inset 3px 0 0 #fbbf24;
}
[data-row-key][data-paihuo-role="engineer"] span {
  color: #713f12 !important;
}
[data-row-key][data-paihuo-role="manager"][aria-selected="true"] {
  background: #1d4ed8 !important;
  box-shadow: inset 3px 0 0 #ffffff;
}
[data-row-key][data-paihuo-role="manager"][aria-selected="true"] span {
  color: #ffffff !important;
}
[data-row-key][data-paihuo-role="engineer"][aria-selected="true"] {
  background: #eab308 !important;
  box-shadow: inset 3px 0 0 #111111;
}
[data-row-key][data-paihuo-role="engineer"][aria-selected="true"] span {
  color: #111111 !important;
}
[data-row-key][data-paihuo-role]:hover {
  filter: brightness(0.98);
}

/* 经理名下有工程师在跑：左侧状态位换成旋转的 LOADING 环。
   环心的实心背景与行底色一致，用来盖住原来的状态点；选中行改为白色环。 */
[data-row-key][data-paihuo-role="manager"][data-paihuo-working="true"] > span:first-child {
  position: relative;
}
[data-row-key][data-paihuo-role="manager"][data-paihuo-working="true"] > span:first-child::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  box-sizing: border-box;
  width: 14px;
  height: 14px;
  margin: -7px 0 0 -7px;
  border: 2px solid #93c5fd;
  border-top-color: #1d4ed8;
  border-right-color: #1d4ed8;
  border-radius: 50%;
  background: #dbeafe;
  animation: PH_rowLoadingSpin .85s linear infinite;
  will-change: transform;
}
[data-row-key][data-paihuo-role="manager"][aria-selected="true"][data-paihuo-working="true"] > span:first-child::after {
  border-color: rgba(255, 255, 255, .55);
  border-top-color: #ffffff;
  border-right-color: #ffffff;
  background: #1d4ed8;
}
@keyframes PH_rowLoadingSpin {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  [data-row-key][data-paihuo-role="manager"][data-paihuo-working="true"] > span:first-child::after {
    animation-duration: 2.4s;
  }
}

/* 会话标题栏右上角入口 */
.PH_headerBtn {
  position: relative;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
  font: inherit;
}
.PH_headerBtn:hover { background: var(--dsw-alias-button-floating-fill); color: var(--dsw-alias-label-primary); }
.PH_headerBtn:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}
.PH_headerIcon { font-size: 15px; line-height: 1; }
.PH_headerBadge {
  position: absolute;
  top: -3px;
  right: -4px;
  box-sizing: border-box;
  min-width: 15px;
  height: 15px;
  padding: 0 4px;
  border-radius: 999px;
  color: #fff;
  font-size: 10px;
  line-height: 15px;
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 0 0 1.5px var(--dsw-alias-bg-base);
}
.PH_headerBadgeQuestion { background: #dc2626; }
.PH_headerBadgeTodo { background: var(--dsw-alias-state-business-primary); }

/* 通用模态 */
.PH_overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.38);
}
.PH_modal {
  box-sizing: border-box;
  width: min(620px, 100%);
  max-height: min(84vh, 860px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 14px;
  background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-base));
  color: var(--dsw-alias-label-primary);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.28);
}
.PH_modal:focus { outline: none; }
.PH_modalHead {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 13px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.PH_modalTitles { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.PH_modalTitle { margin: 0; font-size: 17px; line-height: 24px; font-weight: 650; }
.PH_modalSub { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.PH_modalClose {
  flex: none;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}
.PH_modalClose:hover { background: var(--dsw-alias-button-floating-fill); color: var(--dsw-alias-label-primary); }
.PH_modalBody { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 16px 18px; }
.PH_modalFoot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  padding: 11px 18px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
}
.PH_modalFoot .PH_muted { flex: 1 1 auto; min-width: 0; }
.PH_muted { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.PH_error {
  margin: 0 0 10px;
  padding: 7px 10px;
  border: 1px solid var(--dsw-alias-state-error-primary);
  border-radius: var(--dsw-radius-sm);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 9%, transparent);
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
}
.PH_notice {
  margin: 0 0 10px;
  padding: 7px 10px;
  border: 1px solid var(--dsw-alias-state-success-primary);
  border-radius: var(--dsw-radius-sm);
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 9%, transparent);
  color: var(--dsw-alias-state-success-primary);
  font-size: 12px;
  line-height: 18px;
}
.PH_btn {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
  white-space: nowrap;
}
.PH_btn:hover:not(:disabled) { background: var(--dsw-alias-button-floating-fill); }
.PH_btn:disabled { opacity: 0.5; cursor: default; }
.PH_btn:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}
.PH_btnPrimary {
  border-color: var(--dsw-alias-state-business-primary);
  background: var(--dsw-alias-state-business-primary);
  color: var(--dsw-alias-label-inverse, #fff);
  font-weight: 500;
}
.PH_btnPrimary:hover:not(:disabled) { filter: brightness(1.05); background: var(--dsw-alias-state-business-primary); }
.PH_btnGhost { border-color: transparent; color: var(--dsw-alias-label-secondary); }
.PH_textInput {
  box-sizing: border-box;
  width: 100%;
  min-height: 32px;
  padding: 6px 9px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
}
.PH_textInput:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}

/* 问题表 */
.PH_qList { display: flex; flex-direction: column; gap: 12px; }
.PH_qCall {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-bg-base);
}
.PH_qCallHead { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.PH_qCallTitle { font-size: 12px; font-weight: 600; line-height: 18px; }
.PH_qState {
  flex: none;
  border-radius: 999px;
  padding: 0 7px;
  font-size: 10px;
  line-height: 16px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-2);
}
.PH_qStateOpen { color: var(--dsw-alias-state-warn-primary, #b45309); }
.PH_warn {
  margin: 0;
  padding: 7px 10px;
  border: 1px solid var(--dsw-alias-state-warn-primary, #f59e0b);
  border-radius: var(--dsw-radius-sm);
  color: var(--dsw-alias-state-warn-primary, #b45309);
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #f59e0b) 8%, transparent);
  font-size: 12px;
  line-height: 18px;
}
.PH_question { display: flex; flex-direction: column; gap: 7px; }
.PH_qTitle { font-size: 13px; font-weight: 600; line-height: 20px; }
.PH_qHint { color: var(--dsw-alias-label-tertiary); font-size: 11px; line-height: 16px; }
.PH_qDetail {
  margin: 0;
  padding: 8px 10px;
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
  word-break: break-word;
}
.PH_options { display: flex; flex-direction: column; gap: 5px; }
.PH_option {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 6px 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
  font-size: 12px;
  line-height: 18px;
}
.PH_option:hover { background: var(--dsw-alias-button-floating-fill); }
.PH_option input { margin: 2px 0 0; accent-color: var(--dsw-alias-state-business-primary); flex: none; }
.PH_optionMain { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.PH_optionDesc { color: var(--dsw-alias-label-tertiary); font-size: 11px; line-height: 16px; }
.PH_qActions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.PH_qSkip {
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
  padding: 2px 4px;
}
.PH_qSkip:hover { color: var(--dsw-alias-label-primary); }
.PH_qSkipped { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.PH_qFooter { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }

/* 待办 */
.PH_todoSection { display: flex; flex-direction: column; gap: 6px; }
.PH_todoSection + .PH_todoSection { margin-top: 14px; }
.PH_todoSectionTitle {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
}
.PH_todoRow {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-base);
}
.PH_todoDot {
  flex: none;
  width: 8px;
  height: 8px;
  margin-top: 5px;
  border-radius: 999px;
  background: var(--dsw-alias-label-tertiary);
}
.PH_todoDotPending { background: var(--dsw-alias-label-tertiary); }
.PH_todoDotInProgress { background: var(--dsw-alias-state-business-primary); }
.PH_todoDotPaused { background: var(--dsw-alias-state-warn-primary, #f59e0b); }
.PH_todoDotCompleted { background: var(--dsw-alias-state-success-primary); }
.PH_todoMain { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
.PH_todoContent { font-size: 13px; line-height: 19px; word-break: break-word; }
.PH_todoCompletedText { color: var(--dsw-alias-label-tertiary); text-decoration: line-through; }
.PH_todoMeta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}
.PH_todoId { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.PH_todoNote { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; white-space: pre-wrap; }
.PH_todoCompleted { margin-top: 14px; }
.PH_todoCompleted summary { cursor: pointer; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.PH_todoCompleted[open] summary { margin-bottom: 6px; }
.PH_todoCompleted .PH_todoRow + .PH_todoRow { margin-top: 6px; }
.PH_modalEmpty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 140px;
  color: var(--dsw-alias-label-secondary);
  text-align: center;
  font-size: 13px;
  line-height: 20px;
}
.PH_modalEmptyGlyph { font-size: 24px; line-height: 1; opacity: 0.75; }
.PH_codexLayout {
  display: grid;
  grid-template-columns: minmax(180px, 260px) minmax(0, 1fr);
  gap: 14px;
  min-height: 320px;
}
.PH_codexList {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 58vh;
  overflow: auto;
  padding-right: 2px;
}
.PH_codexSession {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-base);
  color: inherit;
  text-align: left;
  font: inherit;
  cursor: pointer;
}
.PH_codexSession:hover { background: var(--dsw-alias-button-floating-fill); }
.PH_codexSessionActive { border-color: var(--dsw-alias-state-business-primary); }
.PH_codexSessionHead { display: flex; align-items: center; gap: 6px; min-width: 0; }
.PH_codexStatus {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--dsw-alias-label-tertiary);
}
.PH_codexStatusRunning { background: var(--dsw-alias-state-success-primary); box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.18); }
.PH_codexId {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 18px;
}
.PH_codexMeta {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.PH_codexTranscriptWrap {
  position: relative;
  min-width: 0;
  min-height: 260px;
}
.PH_codexTranscript {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 260px;
  max-height: 58vh;
  overflow: auto;
  padding-right: 4px;
  padding-top: 2px;
}
.PH_codexEntry {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 7px 9px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-base);
}
.PH_codexEntryUser { border-color: var(--dsw-alias-state-business-primary); }
.PH_codexEntryError { border-color: var(--dsw-alias-state-error-primary, #ef4444); }
.PH_codexEntryHead {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}
.PH_codexEntryLabel { font-weight: 600; color: var(--dsw-alias-label-secondary); }
.PH_codexEntryText { font-size: 13px; line-height: 19px; white-space: pre-wrap; word-break: break-word; }
.PH_codexMd {
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-primary);
  overflow-wrap: anywhere;
}
.PH_codexMd > :first-child { margin-top: 0; }
.PH_codexMd > :last-child { margin-bottom: 0; }
.PH_mdParagraph { margin: 0 0 8px; white-space: pre-wrap; }
.PH_mdHeading { margin: 12px 0 6px; line-height: 1.35; font-weight: 650; }
.PH_mdH1 { font-size: 19px; }
.PH_mdH2 { font-size: 17px; }
.PH_mdH3 { font-size: 15px; }
.PH_mdH4, .PH_mdH5, .PH_mdH6 { font-size: 13px; }
.PH_mdList { margin: 4px 0 8px; padding-left: 22px; }
.PH_mdList li { margin: 2px 0; }
.PH_mdListItemNested { list-style: circle; color: var(--dsw-alias-label-secondary); }
.PH_mdInlineCode {
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-l1);
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.PH_mdCode {
  position: relative;
  margin: 6px 0 10px;
  padding: 8px 10px;
  max-height: 280px;
  overflow: auto;
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-l1);
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
  word-break: break-word;
}
.PH_mdCode code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.PH_mdCodeLang {
  position: absolute;
  top: 4px;
  right: 8px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.PH_mdQuote {
  margin: 6px 0 10px;
  padding: 2px 10px;
  border-left: 3px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary);
}
.PH_mdHr { margin: 12px 0; border: 0; border-top: 1px solid var(--dsw-alias-border-l1); }
.PH_mdLink { color: var(--dsw-alias-state-business-primary); text-decoration: none; }
.PH_mdLink:hover { text-decoration: underline; }
.PH_mdTableWrap { margin: 6px 0 10px; overflow: auto; }
.PH_mdTable { border-collapse: collapse; min-width: 100%; font-size: 12px; line-height: 18px; }
.PH_mdTable th, .PH_mdTable td {
  padding: 4px 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  text-align: left;
  vertical-align: top;
}
.PH_mdTable th { background: var(--dsw-alias-bg-l1); font-weight: 600; }
.PH_codexCommandSummary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  min-width: 0;
  cursor: pointer;
  list-style: none;
}
.PH_codexCommandSummary::-webkit-details-marker { display: none; }
.PH_codexCommandSummary::before {
  content: '▸';
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
}
.PH_codexEntryCommand[open] > .PH_codexCommandSummary::before { content: '▾'; }
.PH_codexCommandSummaryText {
  min-width: 0;
  flex: 1 1 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.PH_codexCommandMeta {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  white-space: nowrap;
}
.PH_codexCommandMeta .PH_muted { white-space: nowrap; }
.PH_codexCommandBody { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
.PH_codexStreaming {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 4px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}
.PH_codexStreamingDots {
  color: var(--dsw-alias-state-business-primary);
  font-size: 8px;
  letter-spacing: 2px;
  animation: PH_codexPulse 1.2s ease-in-out infinite;
}
@keyframes PH_codexPulse {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 1; }
}
.PH_codexJumpBottom {
  position: absolute;
  right: 8px;
  bottom: 8px;
  z-index: 2;
  width: 28px;
  height: 28px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-secondary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}
.PH_codexJumpBottom:hover { background: var(--dsw-alias-button-floating-fill); }
.PH_codexCommand {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 17px;
  white-space: pre-wrap;
  word-break: break-word;
}
.PH_codexOutput {
  margin: 0;
  padding: 6px 8px;
  max-height: 180px;
  overflow: auto;
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-l1);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 16px;
  white-space: pre-wrap;
  word-break: break-word;
}
.PH_codexOutput summary { cursor: pointer; color: var(--dsw-alias-label-secondary); }
.PH_codexOutput pre {
  margin: 4px 0 0;
  font: inherit;
  white-space: pre-wrap;
  word-break: break-word;
}
@media (max-width: 720px) {
  .PH_codexLayout { grid-template-columns: minmax(0, 1fr); }
  .PH_codexList { max-height: 34vh; }
  .PH_codexTranscript { max-height: 40vh; }
  .PH_codexTranscriptWrap { min-height: 0; }
}
@media (max-width: 640px) {
  .PH_overlay { padding: 10px; }
  .PH_modal { max-height: 92vh; border-radius: 12px; }
  .PH_modalHead, .PH_modalBody, .PH_modalFoot { padding-left: 13px; padding-right: 13px; }
}
`;

    // ── 配置页 ───────────────────────────────────────────────────────────
    function useConfigForm(ctx) {
      const [controller, setController] = React.useState(null);
      const [snapshot, setSnapshot] = React.useState(null);
      const [missing, setMissing] = React.useState(false);
      React.useEffect(() => {
        const forms = ctx.get?.('configForms') ?? ctx.configForms;
        if (!forms || typeof forms.get !== 'function') {
          setMissing(true);
          return () => {};
        }
        const handle = forms.get(ENTRY_ID);
        setController(handle);
        const read = () => setSnapshot(handle.getSnapshot());
        read();
        const off = handle.subscribe?.(read);
        return () => {
          off?.();
        };
      }, []);
      return { controller, snapshot, missing };
    }

    function useModelCatalog(ctx) {
      const [state, setState] = React.useState({ status: 'loading', models: [] });
      React.useEffect(() => {
        let alive = true;
        const remote = ctx.get?.('remote.session');
        if (!remote || typeof remote.modelCatalog !== 'function') {
          setState({ status: 'unavailable', models: [] });
          return () => {};
        }
        Promise.resolve(remote.modelCatalog()).then((result) => {
          if (!alive) return;
          if (result === undefined || result === null || result.ok !== true) {
            setState({ status: 'unavailable', models: [] });
            return;
          }
          const models = [];
          for (const group of result.value?.groups ?? []) {
            for (const model of group.models ?? []) {
              models.push({
                key: `${group.id}/${model.id}`,
                provider: group.id,
                model: model.id,
                label: `${model.name ?? model.id} · ${group.name ?? group.id}`,
              });
            }
          }
          setState({ status: 'ready', models });
        }, () => {
          if (alive) setState({ status: 'unavailable', models: [] });
        });
        return () => {
          alive = false;
        };
      }, []);
      return state;
    }

    function useCodexModelCatalog(codexApi, enabled) {
      const [state, setState] = React.useState({ status: 'idle', models: [], error: null });
      const [nonce, setNonce] = React.useState(0);
      React.useEffect(() => {
        if (!enabled) {
          setState({ status: 'idle', models: [], error: null });
          return () => {};
        }
        if (!codexApi || typeof codexApi.models !== 'function') {
          setState({ status: 'unavailable', models: [], error: null });
          return () => {};
        }
        let alive = true;
        Promise.resolve(codexApi.models(nonce > 0)).then((result) => {
          if (!alive) return;
          const models = Array.isArray(result?.models) ? result.models : [];
          if (models.length === 0) {
            setState({
              status: 'unavailable',
              models: [],
              error: typeof result?.error === 'string' ? result.error : null,
            });
            return;
          }
          setState({
            status: 'ready',
            models,
            error: typeof result?.error === 'string' ? result.error : null,
          });
        }, (error) => {
          if (alive) setState({ status: 'unavailable', models: [], error: errorText(error) });
        });
        return () => {
          alive = false;
        };
      }, [codexApi, enabled, nonce]);
      return { ...state, reload: () => setNonce((value) => value + 1) };
    }

    function usePermissionCatalog(ctx) {
      const [options, setOptions] = React.useState([]);
      React.useEffect(() => {
        let alive = true;
        const remote = ctx.get?.('remote.permissionPresets');
        if (!remote || typeof remote.catalog !== 'function') return () => {};
        Promise.resolve(remote.catalog()).then((result) => {
          if (!alive || result === undefined || result === null || result.ok !== true) return;
          setOptions(result.value?.options ?? []);
        }, () => {});
        return () => {
          alive = false;
        };
      }, []);
      return options;
    }

    function toDraft(value) {
      const resources = Array.isArray(value.serializedResources) ? value.serializedResources : [];
      return {
        engineerBackend: value.engineerBackend === 'codex' ? 'codex' : 'session',
        codexCommand: typeof value.codexCommand === 'string' && value.codexCommand.trim() !== ''
          ? value.codexCommand
          : 'codex',
        codexModel: typeof value.codexModel === 'string' ? value.codexModel : '',
        codexReasoningEffort: typeof value.codexReasoningEffort === 'string' ? value.codexReasoningEffort : '',
        codexSandbox: ['read-only', 'workspace-write', 'danger-full-access'].includes(value.codexSandbox)
          ? value.codexSandbox
          : 'workspace-write',
        codexBypassApprovals: value.codexBypassApprovals === true,
        codexSkipGitRepoCheck: value.codexSkipGitRepoCheck !== false,
        codexTranscriptOutput: value.codexTranscriptOutput !== false,
        workstationsPerProject: String(value.workstationsPerProject ?? 2),
        totalWorkstations: String(value.totalWorkstations ?? 4),
        maxEngineerQueue: String(value.maxEngineerQueue ?? 6),
        worktree: value.worktree !== false,
        browserSerial: resources.includes('browser'),
        otherResources: resources.filter((entry) => entry !== 'browser'),
        models: (Array.isArray(value.engineerModels) ? value.engineerModels : [])
          .map((entry) => ({
            provider: entry.provider,
            model: entry.model,
            description: entry.description ?? '',
          })),
        engineerPermission: typeof value.engineerPermission === 'string' ? value.engineerPermission : '',
        extraTools: Array.isArray(value.managerExtraTools) ? value.managerExtraTools.filter((entry) => typeof entry === 'string') : [],
        deniedTools: Array.isArray(value.managerDeniedTools) ? value.managerDeniedTools.filter((entry) => typeof entry === 'string') : [],
      };
    }

    function buildOps(draft) {
      const positive = (key) => {
        const number = Number(draft[key]);
        if (!Number.isInteger(number) || number < 1) throw new Error('invalid-number');
        return number;
      };
      const resources = [...draft.otherResources];
      if (draft.browserSerial && !resources.includes('browser')) resources.push('browser');
      return [
        {
          op: 'set',
          path: ['engineerBackend'],
          value: draft.engineerBackend === 'codex' ? 'codex' : 'session',
        },
        {
          op: 'set',
          path: ['codexCommand'],
          value: String(draft.codexCommand ?? '').trim() || 'codex',
        },
        {
          op: 'set',
          path: ['codexModel'],
          value: String(draft.codexModel ?? '').trim() === '' ? null : String(draft.codexModel).trim(),
        },
        {
          op: 'set',
          path: ['codexReasoningEffort'],
          value: String(draft.codexReasoningEffort ?? '').trim() === ''
            ? null
            : String(draft.codexReasoningEffort).trim(),
        },
        { op: 'set', path: ['codexSandbox'], value: draft.codexSandbox },
        { op: 'set', path: ['codexBypassApprovals'], value: Boolean(draft.codexBypassApprovals) },
        { op: 'set', path: ['codexSkipGitRepoCheck'], value: Boolean(draft.codexSkipGitRepoCheck) },
        { op: 'set', path: ['codexTranscriptOutput'], value: Boolean(draft.codexTranscriptOutput) },
        { op: 'set', path: ['workstationsPerProject'], value: positive('workstationsPerProject') },
        { op: 'set', path: ['totalWorkstations'], value: positive('totalWorkstations') },
        { op: 'set', path: ['maxEngineerQueue'], value: positive('maxEngineerQueue') },
        { op: 'set', path: ['worktree'], value: Boolean(draft.worktree) },
        { op: 'set', path: ['serializedResources'], value: resources },
        {
          op: 'set',
          path: ['engineerModels'],
          value: draft.models.map((entry) => ({
            provider: entry.provider,
            model: entry.model,
            description: String(entry.description ?? '').trim(),
          })),
        },
        draft.engineerPermission === ''
          ? { op: 'unset', path: ['engineerPermission'] }
          : { op: 'set', path: ['engineerPermission'], value: draft.engineerPermission },
        { op: 'set', path: ['managerExtraTools'], value: [...draft.extraTools] },
        { op: 'set', path: ['managerDeniedTools'], value: [...draft.deniedTools] },
      ].filter((op) => op !== undefined);
    }

    function parseManualModel(text) {
      const value = String(text ?? '').trim();
      const slash = value.indexOf('/');
      if (slash <= 0 || slash === value.length - 1) return undefined;
      return { provider: value.slice(0, slash).trim(), model: value.slice(slash + 1).trim(), label: value };
    }

    const TOOL_GROUP_ORDER = ['readonly', 'memory', 'im', 'other', 'paihuo'];

    /**
     * 经理工具放行：独立窗口列出全部工具（含第三方），勾选即放行。
     * 默认族（只读/记忆/IM）取消勾选会写进 managerDeniedTools；
     * 其它工具勾选会写进 managerExtraTools；派活工具锁定不可关。
     */
    function ToolAccessDialog(props) {
      const { t, toolsApi, onClose, onConfirm } = props;
      const [state, setState] = React.useState({ status: 'loading', tools: [], error: null });
      const [query, setQuery] = React.useState('');
      const [selected, setSelected] = React.useState(null);

      React.useEffect(() => {
        let alive = true;
        if (!toolsApi || typeof toolsApi.catalog !== 'function') {
          setState({ status: 'unavailable', tools: [], error: null });
          return () => {};
        }
        toolsApi.catalog().then((value) => {
          if (!alive) return;
          const tools = (Array.isArray(value?.tools) ? value.tools : [])
            .filter((tool) => tool && typeof tool.name === 'string');
          setState({ status: 'ready', tools, error: null });
          setSelected(new Set(tools
            .filter((tool) => tool.allowed === true || tool.locked === true)
            .map((tool) => tool.name)));
        }, (error) => {
          if (alive) setState({ status: 'error', tools: [], error: errorText(error) });
        });
        return () => {
          alive = false;
        };
      }, [toolsApi]);

      const tools = state.tools;
      const needle = query.trim().toLowerCase();
      const visible = needle === '' ? tools : tools.filter((tool) => tool.name.toLowerCase().includes(needle));
      const grouped = TOOL_GROUP_ORDER
        .map((group) => ({ group, items: visible.filter((tool) => tool.group === group) }))
        .filter((entry) => entry.items.length > 0);
      const checked = selected ?? new Set();
      const allowedCount = tools.filter((tool) => tool.locked === true || checked.has(tool.name)).length;
      const toggle = (name) => {
        setSelected((current) => {
          const next = new Set(current ?? []);
          if (next.has(name)) next.delete(name);
          else next.add(name);
          return next;
        });
      };
      const restoreDefaults = () => {
        setSelected(new Set(tools
          .filter((tool) => tool.group !== 'other' || tool.locked === true)
          .map((tool) => tool.name)));
      };
      const confirm = () => {
        const extra = [];
        const denied = [];
        for (const tool of tools) {
          if (tool.locked === true || tool.group === 'paihuo') continue;
          if (checked.has(tool.name)) {
            if (tool.group === 'other') extra.push(tool.name);
          } else if (tool.group !== 'other') {
            denied.push(tool.name);
          }
        }
        onConfirm?.({ extra, denied });
      };

      const footer = [
        h('button', {
          key: 'defaults',
          type: 'button',
          className: 'PH_cfgGhost',
          disabled: state.status !== 'ready',
          onClick: restoreDefaults,
        }, t('tools.defaults')),
        h('span', { key: 'count', className: 'PH_muted' }, t('tools.count', { allow: allowedCount, total: tools.length })),
        h('button', { key: 'cancel', type: 'button', className: 'PH_cfgGhost', onClick: onClose }, t('common.cancel')),
        h('button', {
          key: 'save',
          type: 'button',
          className: 'PH_cfgSave',
          disabled: state.status !== 'ready',
          onClick: confirm,
        }, t('tools.save')),
      ];

      return h(ModalShell, {
        title: t('tools.title'),
        subtitle: t('tools.subtitle'),
        onClose,
        t,
        footer,
      }, [
        h('input', {
          key: 'search',
          className: 'PH_cfgInput PH_toolsSearch',
          type: 'text',
          value: query,
          placeholder: t('tools.search'),
          'aria-label': t('tools.search'),
          onChange: (event) => setQuery(event.currentTarget.value),
        }),
        state.status === 'loading' ? h('p', { key: 'loading', className: 'PH_cfgHint' }, t('tools.loading')) : null,
        state.status === 'unavailable' || state.status === 'error'
          ? h('p', { key: 'error', className: 'PH_error' }, state.error || t('tools.unavailable'))
          : null,
        state.status === 'ready' && visible.length === 0
          ? h('p', { key: 'empty', className: 'PH_cfgHint' }, t('tools.empty'))
          : null,
        ...grouped.map(({ group, items }) => h('section', { key: group, className: 'PH_toolGroup' }, [
          h('h4', { key: 'head', className: 'PH_toolGroupTitle' }, t(`tools.group.${group}`)),
          ...items.map((tool) => h('label', { key: tool.name, className: 'PH_toolRow' }, [
            h('input', {
              type: 'checkbox',
              checked: tool.locked === true || checked.has(tool.name),
              disabled: tool.locked === true,
              onChange: () => toggle(tool.name),
            }),
            h('code', { className: 'PH_toolName' }, tool.name),
            tool.locked === true ? h('span', { key: 'locked', className: 'PH_toolLocked' }, t('tools.locked')) : null,
          ])),
        ])),
      ]);
    }

    function ConfigPage(props) {
      const { ctx, t, view, codexApi, toolsApi } = props;
      const { controller, snapshot, missing } = useConfigForm(ctx);
      const catalog = useModelCatalog(ctx);
      const permissionOptions = usePermissionCatalog(ctx);
      const [draft, setDraft] = React.useState(null);
      const [status, setStatus] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const [pick, setPick] = React.useState('');
      const [manual, setManual] = React.useState('');
      const [toolDialog, setToolDialog] = React.useState(false);
      const codexCatalog = useCodexModelCatalog(codexApi, draft?.engineerBackend === 'codex');

      React.useEffect(() => {
        if (snapshot !== null && snapshot.status === 'ready' && snapshot.value !== undefined) {
          setDraft(toDraft(snapshot.value));
        }
      }, [snapshot?.revision, snapshot?.status]);

      if (view === 'summary') return t('settings.summary');
      if (missing || (snapshot !== null && snapshot.status === 'unavailable')) {
        return h('p', { className: 'PH_cfgHint' }, t('config.unavailable'));
      }
      if (controller === null || snapshot === null || draft === null) {
        return h('p', { className: 'PH_cfgHint' }, t('config.loading'));
      }

      const editable = snapshot.writable !== false && !busy;
      const codexModels = Array.isArray(codexCatalog.models) ? codexCatalog.models : [];
      const codexModelChoices = [...codexModels];
      if (draft.codexModel !== '' && !codexModelChoices.some((model) => model.id === draft.codexModel)) {
        codexModelChoices.unshift({ id: draft.codexModel, name: draft.codexModel, description: '' });
      }
      const selectedCodexModel = codexModelChoices.find((model) => model.id === draft.codexModel);
      const codexReasoningLevels = Array.isArray(selectedCodexModel?.reasoningLevels)
        ? selectedCodexModel.reasoningLevels
        : [];
      const codexReasoningChoices = [...codexReasoningLevels];
      if (draft.codexReasoningEffort !== ''
        && !codexReasoningChoices.some((level) => level.effort === draft.codexReasoningEffort)) {
        codexReasoningChoices.unshift({ effort: draft.codexReasoningEffort, description: '' });
      }
      const set = (patch) => {
        setDraft((current) => ({ ...current, ...patch }));
        setStatus(null);
      };

      const addModel = (entry) => {
        if (entry === undefined) return;
        if (draft.models.some((model) => model.provider === entry.provider && model.model === entry.model)) return;
        set({ models: [...draft.models, { provider: entry.provider, model: entry.model, description: '' }] });
        setPick('');
        setManual('');
      };

      const saveDraft = (nextDraft, after) => {
        setBusy(true);
        setStatus(null);
        let ops;
        try {
          ops = buildOps(nextDraft);
        } catch (error) {
          setBusy(false);
          setStatus({
            kind: 'error',
            text: error instanceof Error && error.message === 'invalid-number'
              ? t('config.invalid')
              : String(error?.message ?? error),
          });
          return;
        }
        Promise.resolve(controller.mutate(ops)).then((accepted) => {
          setBusy(false);
          setStatus(accepted === false
            ? { kind: 'error', text: t('config.failed') }
            : { kind: 'ok', text: t('config.saved') });
          if (accepted !== false) after?.();
        }, () => {
          setBusy(false);
          setStatus({ kind: 'error', text: t('config.failed') });
        });
      };

      const save = () => saveDraft(draft);
      const saveToolSelection = (patch) => {
        const next = { ...draft, extraTools: patch.extra, deniedTools: patch.denied };
        setDraft(next);
        saveDraft(next, () => setToolDialog(false));
      };

      const numberOptions = (max, current) => {
        const values = new Set();
        for (let index = 1; index <= max; index += 1) values.add(String(index));
        values.add(String(Number(current) || 1));
        return [...values].sort((left, right) => Number(left) - Number(right));
      };

      const numberField = (key, labelKey, max) => h('div', { className: 'PH_cfgRow', key }, [
        h('label', { className: 'PH_cfgLabel', htmlFor: `PH_cfg_${key}` }, t(labelKey)),
        h('select', {
          id: `PH_cfg_${key}`,
          className: 'PH_cfgSelect',
          value: draft[key],
          disabled: !editable,
          onChange: (event) => set({ [key]: event.currentTarget.value }),
        }, numberOptions(max, draft[key]).map((value) => h('option', { key: value, value }, value))),
      ]);

      const noteOf = (entry) => (typeof entry.description === 'string' ? entry.description : '');
      const permissionChoices = [...permissionOptions];
      if (draft.engineerPermission !== '' && !permissionChoices.some((option) => option.value === draft.engineerPermission)) {
        permissionChoices.push({ value: draft.engineerPermission, name: draft.engineerPermission });
      }

      return h('div', { className: 'PH_cfg' }, [
        h('p', { key: 'intro', className: 'PH_cfgIntro' }, t('config.intro')),

        h('section', { key: 'backend', className: 'PH_cfgSection' }, [
          h('h4', { key: 'title', className: 'PH_cfgSectionTitle' }, t('config.section.backend')),
          h('div', { key: 'row', className: 'PH_cfgRow' }, [
            h('label', { key: 'label', className: 'PH_cfgLabel', htmlFor: 'PH_cfg_backend' }, t('config.backend')),
            h('select', {
              key: 'select',
              id: 'PH_cfg_backend',
              className: 'PH_cfgSelect',
              value: draft.engineerBackend,
              disabled: !editable,
              onChange: (event) => set({ engineerBackend: event.currentTarget.value }),
            }, [
              h('option', { key: 'session', value: 'session' }, t('config.backend.session')),
              h('option', { key: 'codex', value: 'codex' }, t('config.backend.codex')),
            ]),
            h('p', { key: 'hint', className: 'PH_cfgHint' }, t('config.backend.hint')),
          ]),
          draft.engineerBackend === 'codex'
            ? h(React.Fragment, null, [
              h('div', { key: 'command', className: 'PH_cfgRow' }, [
                h('label', { key: 'label', className: 'PH_cfgLabel', htmlFor: 'PH_cfg_codexCommand' }, t('config.codexCommand')),
                h('input', {
                  key: 'input',
                  id: 'PH_cfg_codexCommand',
                  className: 'PH_cfgInput',
                  type: 'text',
                  value: draft.codexCommand,
                  disabled: !editable,
                  placeholder: t('config.codexCommand.placeholder'),
                  onChange: (event) => set({ codexCommand: event.currentTarget.value }),
                }),
                h('p', { key: 'hint', className: 'PH_cfgHint' }, t('config.codexCommand.hint')),
              ]),
              h('div', { key: 'model', className: 'PH_cfgRow' }, [
                h('label', { key: 'label', className: 'PH_cfgLabel', htmlFor: 'PH_cfg_codexModel' }, t('config.codexModel')),
                codexCatalog.status === 'ready'
                  ? h('select', {
                    key: 'select',
                    id: 'PH_cfg_codexModel',
                    className: 'PH_cfgSelect',
                    value: draft.codexModel,
                    disabled: !editable,
                    onChange: (event) => {
                      const id = event.currentTarget.value;
                      const model = codexModelChoices.find((entry) => entry.id === id);
                      const keepEffort = draft.codexReasoningEffort === ''
                        || model === undefined
                        || !Array.isArray(model.reasoningLevels)
                        || model.reasoningLevels.some((level) => level.effort === draft.codexReasoningEffort);
                      set({
                        codexModel: id,
                        ...(keepEffort ? {} : { codexReasoningEffort: '' }),
                      });
                    },
                  }, [
                    h('option', { key: '', value: '' }, t('config.codexModel.native')),
                    ...codexModelChoices.map((model) => h('option', {
                      key: model.id,
                      value: model.id,
                      title: model.description ?? '',
                    }, `${model.name}（${model.id}）`)),
                  ])
                  : h('input', {
                    key: 'input',
                    id: 'PH_cfg_codexModel',
                    className: 'PH_cfgInput',
                    type: 'text',
                    value: draft.codexModel,
                    disabled: !editable,
                    placeholder: t('config.codexModel.placeholder'),
                    onChange: (event) => set({ codexModel: event.currentTarget.value }),
                  }),
                h('div', { key: 'actions', className: 'PH_cfgLine' }, [
                  h('p', { key: 'hint', className: 'PH_cfgHint' }, codexCatalog.status === 'ready'
                    ? t('config.codexModel.hint')
                    : (codexCatalog.status === 'loading' || codexCatalog.status === 'idle'
                      ? t('config.codexModel.loading')
                      : t('config.codexModel.failed', { error: codexCatalog.error ?? '' }))),
                  h('button', {
                    key: 'reload',
                    type: 'button',
                    className: 'PH_cfgGhost',
                    disabled: !editable,
                    onClick: () => codexCatalog.reload(),
                  }, t('config.codexModel.refresh')),
                ]),
                selectedCodexModel?.description
                  ? h('p', { key: 'description', className: 'PH_cfgHint' }, selectedCodexModel.description)
                  : null,
              ]),
              h('div', { key: 'effort', className: 'PH_cfgRow' }, [
                h('label', { key: 'label', className: 'PH_cfgLabel', htmlFor: 'PH_cfg_codexReasoningEffort' }, t('config.codexReasoningEffort')),
                codexReasoningChoices.length > 0
                  ? h('select', {
                    key: 'select',
                    id: 'PH_cfg_codexReasoningEffort',
                    className: 'PH_cfgSelect',
                    value: draft.codexReasoningEffort,
                    disabled: !editable,
                    onChange: (event) => set({ codexReasoningEffort: event.currentTarget.value }),
                  }, [
                    h('option', { key: '', value: '' }, selectedCodexModel?.defaultReasoningLevel
                      ? `${t('config.codexReasoningEffort.default')}（${selectedCodexModel.defaultReasoningLevel}）`
                      : t('config.codexReasoningEffort.default')),
                    ...codexReasoningChoices.map((level) => h('option', {
                      key: level.effort,
                      value: level.effort,
                      title: level.description ?? '',
                    }, level.description === '' ? level.effort : `${level.effort} — ${level.description}`)),
                  ])
                  : (selectedCodexModel !== undefined && codexCatalog.status === 'ready'
                    ? h('span', { key: 'unsupported', className: 'PH_cfgHint' }, t('config.codexReasoningEffort.unsupported'))
                    : h('input', {
                      key: 'input',
                      id: 'PH_cfg_codexReasoningEffort',
                      className: 'PH_cfgInput',
                      type: 'text',
                      value: draft.codexReasoningEffort,
                      disabled: !editable,
                      placeholder: 'low / medium / high / xhigh / max',
                      onChange: (event) => set({ codexReasoningEffort: event.currentTarget.value }),
                    })),
                h('p', { key: 'hint', className: 'PH_cfgHint' }, t('config.codexReasoningEffort.hint')),
              ]),
              h('div', { key: 'sandbox', className: 'PH_cfgRow' }, [
                h('label', { key: 'label', className: 'PH_cfgLabel', htmlFor: 'PH_cfg_codexSandbox' }, t('config.codexSandbox')),
                h('select', {
                  key: 'select',
                  id: 'PH_cfg_codexSandbox',
                  className: 'PH_cfgSelect',
                  value: draft.codexSandbox,
                  disabled: !editable || draft.codexBypassApprovals,
                  onChange: (event) => set({ codexSandbox: event.currentTarget.value }),
                }, [
                  h('option', { key: 'read-only', value: 'read-only' }, t('config.codexSandbox.read-only')),
                  h('option', { key: 'workspace-write', value: 'workspace-write' }, t('config.codexSandbox.workspace-write')),
                  h('option', { key: 'danger-full-access', value: 'danger-full-access' }, t('config.codexSandbox.danger-full-access')),
                ]),
              ]),
              h('label', { key: 'bypass', className: 'PH_cfgCheck' }, [
                h('input', {
                  type: 'checkbox',
                  checked: Boolean(draft.codexBypassApprovals),
                  disabled: !editable,
                  onChange: (event) => set({ codexBypassApprovals: event.currentTarget.checked }),
                }),
                h('span', null, t('config.codexBypassApprovals')),
              ]),
              h('label', { key: 'skipGit', className: 'PH_cfgCheck' }, [
                h('input', {
                  type: 'checkbox',
                  checked: Boolean(draft.codexSkipGitRepoCheck),
                  disabled: !editable,
                  onChange: (event) => set({ codexSkipGitRepoCheck: event.currentTarget.checked }),
                }),
                h('span', null, t('config.codexSkipGitRepoCheck')),
              ]),
              h('label', { key: 'transcript', className: 'PH_cfgCheck' }, [
                h('input', {
                  type: 'checkbox',
                  checked: Boolean(draft.codexTranscriptOutput),
                  disabled: !editable,
                  onChange: (event) => set({ codexTranscriptOutput: event.currentTarget.checked }),
                }),
                h('span', null, t('config.codexTranscriptOutput')),
              ]),
            ])
            : null,
        ]),

        h('section', { key: 'staffing', className: 'PH_cfgSection' }, [
          h('h4', { key: 'title', className: 'PH_cfgSectionTitle' }, t('config.section.staffing')),
          h('div', { key: 'grid', className: 'PH_cfgGrid' }, [
            numberField('workstationsPerProject', 'config.workstations', 6),
            numberField('totalWorkstations', 'config.total', 12),
            numberField('maxEngineerQueue', 'config.queue', 10),
          ]),
          h('label', { key: 'worktree', className: 'PH_cfgCheck' }, [
            h('input', {
              type: 'checkbox',
              checked: Boolean(draft.worktree),
              disabled: !editable,
              onChange: (event) => set({ worktree: event.currentTarget.checked }),
            }),
            h('span', null, t('config.worktree')),
          ]),
        ]),

        h('section', { key: 'testing', className: 'PH_cfgSection' }, [
          h('h4', { key: 'title', className: 'PH_cfgSectionTitle' }, t('config.section.testing')),
          h('label', { key: 'check', className: 'PH_cfgCheck' }, [
            h('input', {
              type: 'checkbox',
              checked: Boolean(draft.browserSerial),
              disabled: !editable,
              onChange: (event) => set({ browserSerial: event.currentTarget.checked }),
            }),
            h('span', null, t('config.browser')),
          ]),
          h('p', { key: 'hint', className: 'PH_cfgHint' }, t('config.browser.hint')),
          draft.otherResources.length === 0
            ? null
            : h('p', { key: 'others', className: 'PH_cfgHint' }, `其它串行资源：${draft.otherResources.join('、')}`),
        ]),

        h('section', { key: 'models', className: 'PH_cfgSection' }, [
          h('h4', { key: 'title', className: 'PH_cfgSectionTitle' }, t('config.section.models')),
          h('p', { key: 'lead', className: 'PH_cfgHint' }, t('config.models.lead')),
          draft.engineerBackend === 'codex'
            ? h('p', { key: 'codexHint', className: 'PH_cfgHint' }, t('config.models.codexHint'))
            : null,
          catalog.status === 'ready'
            ? h('div', { key: 'picker', className: 'PH_cfgLine' }, [
              h('select', {
                key: 'select',
                className: 'PH_cfgSelect',
                value: pick,
                disabled: !editable,
                'aria-label': t('config.models.pick'),
                onChange: (event) => setPick(event.currentTarget.value),
              }, [
                h('option', { key: '', value: '' }, t('config.models.pick')),
                ...catalog.models.map((entry) => h('option', { key: entry.key, value: entry.key }, entry.label)),
              ]),
              h('button', {
                key: 'add',
                type: 'button',
                className: 'PH_cfgGhost',
                disabled: !editable || pick === '',
                onClick: () => {
                  const entry = catalog.models.find((model) => model.key === pick);
                  addModel(entry);
                },
              }, t('config.models.add')),
            ])
            : h('div', { key: 'manual', className: 'PH_cfgLine' }, [
              h('input', {
                key: 'input',
                className: 'PH_cfgInput',
                type: 'text',
                value: manual,
                disabled: !editable,
                placeholder: t('config.models.manual'),
                'aria-label': t('config.models.manual'),
                onChange: (event) => setManual(event.currentTarget.value),
                onKeyDown: (event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  addModel(parseManualModel(manual));
                },
              }),
              h('button', {
                key: 'add',
                type: 'button',
                className: 'PH_cfgGhost',
                disabled: !editable || parseManualModel(manual) === undefined,
                onClick: () => addModel(parseManualModel(manual)),
              }, t('config.models.add')),
            ]),
          catalog.status === 'unavailable'
            ? h('p', { key: 'failed', className: 'PH_cfgHint' }, t('config.models.catalogFailed'))
            : null,
          draft.models.length === 0
            ? h('p', { key: 'empty', className: 'PH_cfgHint' }, t('config.models.empty'))
            : h('ul', { key: 'list', className: 'PH_cfgModels' }, draft.models.map((entry, index) => h('li', {
              key: `${entry.provider}/${entry.model}`,
              className: 'PH_cfgModel',
            }, [
              h('code', { key: 'name', className: 'PH_cfgModelName', title: `${entry.provider}/${entry.model}` }, `${entry.provider}/${entry.model}`),
              h('input', {
                key: 'note',
                className: 'PH_cfgInput PH_cfgModelNote',
                type: 'text',
                value: noteOf(entry),
                disabled: !editable,
                placeholder: t('config.models.note'),
                'aria-label': `${t('config.models.note')} ${entry.provider}/${entry.model}`,
                onChange: (event) => {
                  const description = event.currentTarget.value;
                  set({
                    models: draft.models.map((model,
                      position) => (position === index ? { ...model, description } : model)),
                  });
                },
              }),
              h('button', {
                key: 'remove',
                type: 'button',
                className: 'PH_cfgGhost',
                disabled: !editable,
                onClick: () => set({ models: draft.models.filter((_model, position) => position !== index) }),
              }, t('config.remove')),
            ]))),
        ]),

        h('section', { key: 'tools', className: 'PH_cfgSection' }, [
          h('h4', { key: 'title', className: 'PH_cfgSectionTitle' }, t('config.section.tools')),
          h('p', { key: 'lead', className: 'PH_cfgHint' }, t('config.tools.lead')),
          h('div', { key: 'line', className: 'PH_cfgLine' }, [
            h('button', {
              key: 'open',
              type: 'button',
              className: 'PH_cfgGhost',
              disabled: !editable,
              onClick: () => setToolDialog(true),
            }, t('config.tools.button')),
            h('span', { key: 'summary', className: 'PH_cfgHint' }, t('config.tools.summary', {
              extra: draft.extraTools.length,
              denied: draft.deniedTools.length,
            })),
          ]),
          h('p', { key: 'hint', className: 'PH_cfgHint' }, t('config.tools.hint')),
        ]),

        h('section', { key: 'advanced', className: 'PH_cfgSection' }, [
          h('h4', { key: 'title', className: 'PH_cfgSectionTitle' }, t('config.section.advanced')),
          h('div', { key: 'row', className: 'PH_cfgRow' }, [
            h('label', { key: 'label', className: 'PH_cfgLabel', htmlFor: 'PH_cfg_permission' }, t('config.permission')),
            h('select', {
              key: 'select',
              id: 'PH_cfg_permission',
              className: 'PH_cfgSelect',
              value: draft.engineerPermission,
              disabled: !editable,
              onChange: (event) => set({ engineerPermission: event.currentTarget.value }),
            }, [
              h('option', { key: '', value: '' }, t('config.permission.default')),
              ...permissionChoices.map((option) => h('option', { key: option.value, value: option.value }, option.name ?? option.value)),
            ]),
            h('p', { key: 'hint', className: 'PH_cfgHint' }, t('config.permission.hint')),
          ]),
        ]),

        toolDialog
          ? h(ToolAccessDialog, {
            key: 'toolDialog',
            t,
            toolsApi,
            onClose: () => setToolDialog(false),
            onConfirm: saveToolSelection,
          })
          : null,

        h('div', { key: 'actions', className: 'PH_cfgActions' }, [
          h('button', {
            key: 'save',
            type: 'button',
            className: 'PH_cfgSave',
            disabled: !editable,
            onClick: save,
          }, busy ? t('config.saving') : t('config.save')),
          status === null
            ? null
            : h('span', { key: 'status', className: 'PH_cfgStatus', 'data-kind': status.kind, role: 'status' }, status.text),
        ]),
      ]);
    }

    // ── 经理右上角：问题表 / 待办 / Codex 会话 ───────────────────────────
    const remoteCodec = (typeSymbol) => ({
      mode: 'strict',
      typeSymbol,
      create: () => ({ parse: (value) => value }),
    });

    // 与 lib/remote.js 的 MANIFEST 保持一致；两边各一份，测试会校验 id。
    const PAIHUO_CONTRIBUTION = {
      package: REMOTE_PACKAGE,
      descriptors: [
        {
          id: REMOTE_METHOD_ID,
          service: 'paihuo',
          namespace: 'paihuo',
          method: 'todos',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'payload',
            wire: 'payload',
            source: 'json',
            codec: remoteCodec(`${REMOTE_PACKAGE}#todosPayload`),
          }],
          result: remoteCodec(`${REMOTE_PACKAGE}#todosResult`),
        },
        {
          id: REMOTE_ACTIVITY_METHOD_ID,
          service: 'paihuo',
          namespace: 'paihuo',
          method: 'activity',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'payload',
            wire: 'payload',
            source: 'json',
            codec: remoteCodec(`${REMOTE_PACKAGE}#activityPayload`),
          }],
          result: remoteCodec(`${REMOTE_PACKAGE}#activityResult`),
        },
        {
          id: REMOTE_CODEX_SESSIONS_METHOD_ID,
          service: 'paihuo',
          namespace: 'paihuo',
          method: 'codexSessions',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'payload',
            wire: 'payload',
            source: 'json',
            codec: remoteCodec(`${REMOTE_PACKAGE}#codexSessionsPayload`),
          }],
          result: remoteCodec(`${REMOTE_PACKAGE}#codexSessionsResult`),
        },
        {
          id: REMOTE_CODEX_TRANSCRIPT_METHOD_ID,
          service: 'paihuo',
          namespace: 'paihuo',
          method: 'codexTranscript',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'payload',
            wire: 'payload',
            source: 'json',
            codec: remoteCodec(`${REMOTE_PACKAGE}#codexTranscriptPayload`),
          }],
          result: remoteCodec(`${REMOTE_PACKAGE}#codexTranscriptResult`),
        },
        {
          id: REMOTE_CODEX_MODELS_METHOD_ID,
          service: 'paihuo',
          namespace: 'paihuo',
          method: 'codexModels',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'payload',
            wire: 'payload',
            source: 'json',
            codec: remoteCodec(`${REMOTE_PACKAGE}#codexModelsPayload`),
          }],
          result: remoteCodec(`${REMOTE_PACKAGE}#codexModelsResult`),
        },
        {
          id: REMOTE_TOOLS_METHOD_ID,
          service: 'paihuo',
          namespace: 'paihuo',
          method: 'tools',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'payload',
            wire: 'payload',
            source: 'json',
            codec: remoteCodec(`${REMOTE_PACKAGE}#toolsPayload`),
          }],
          result: remoteCodec(`${REMOTE_PACKAGE}#toolsResult`),
        },
      ],
    };

    /** 懒挂载只读 Remote；失败后允许下一次轮询重试。 */
    function createRemoteApi(ctx) {
      let mounting = null;
      const ensure = () => {
        if (mounting !== null) return mounting;
        mounting = Promise.resolve().then(() => {
          const remote = ctx.remote ?? ctx.get?.('remote');
          if (!remote || typeof remote.$mount !== 'function') throw new Error('remote-unavailable');
          return remote.$mount(PAIHUO_CONTRIBUTION);
        }).then(() => {
          const namespace = ctx.get?.('remote.paihuo') ?? ctx.remote?.paihuo;
          if (!namespace || typeof namespace.todos !== 'function') throw new Error('paihuo-remote-unavailable');
          return namespace;
        });
        mounting.catch(() => {
          mounting = null;
        });
        return mounting;
      };
      return { ensure };
    }

    function createToolsApi(ctx, remoteApi) {
      return {
        async catalog(managerId) {
          const namespace = await remoteApi.ensure();
          if (typeof namespace.tools !== 'function') throw new Error('paihuo-tools-unavailable');
          const result = await namespace.tools({ managerId });
          if (result === undefined || result === null || result.ok !== true) {
            throw new Error(result?.error?.message ?? 'paihuo-tools-failed');
          }
          return result.value ?? { tools: [] };
        },
      };
    }

    function createTodoApi(ctx, remoteApi) {
      return {
        async load(managerId) {
          const namespace = await remoteApi.ensure();
          const result = await namespace.todos({ managerId });
          if (result === undefined || result === null || result.ok !== true) {
            throw new Error(result?.error?.message ?? 'todo-load-failed');
          }
          return result.value ?? { todos: [], counts: {} };
        },
      };
    }

    function createCodexApi(ctx, remoteApi) {
      const unwrap = (result, fallback) => {
        if (result === undefined || result === null || result.ok !== true) {
          throw new Error(result?.error?.message ?? fallback);
        }
        return result.value;
      };
      return {
        async sessions(managerId) {
          const namespace = await remoteApi.ensure();
          if (typeof namespace.codexSessions !== 'function') throw new Error('codex-remote-unavailable');
          return unwrap(await namespace.codexSessions({ managerId }), 'codex-sessions-failed');
        },
        async transcript(managerId, engineerId) {
          const namespace = await remoteApi.ensure();
          if (typeof namespace.codexTranscript !== 'function') throw new Error('codex-remote-unavailable');
          return unwrap(
            await namespace.codexTranscript({ managerId, engineerId }),
            'codex-transcript-failed',
          );
        },
        async models(force = false) {
          const namespace = await remoteApi.ensure();
          if (typeof namespace.codexModels !== 'function') throw new Error('codex-remote-unavailable');
          return unwrap(await namespace.codexModels({ force }), 'codex-models-failed');
        },
      };
    }

    function createActivityApi(ctx, remoteApi) {
      return {
        async load() {
          const namespace = await remoteApi.ensure();
          if (typeof namespace.activity !== 'function') throw new Error('activity-remote-unavailable');
          const result = await namespace.activity({});
          if (result === undefined || result === null || result.ok !== true) {
            throw new Error(result?.error?.message ?? 'activity-load-failed');
          }
          return result.value ?? { managers: [] };
        },
      };
    }

    /**
     * 轻量活动状态：只在会话列表里存在经理行时轮询 Host。
     *
     * 采用「订阅者驱动」而不是常驻定时器：侧栏收起、没有经理会话时完全停止；
     * 页面隐藏时降频，重新可见时立即补一次。
     */
    function createActivityStore(api) {
      const listeners = new Set();
      let managers = new Map();
      let timer = 0;
      let active = false;
      let inFlight = false;
      let disposed = false;

      const notify = () => {
        for (const listener of [...listeners]) {
          try {
            listener();
          } catch {
            /* 单个订阅者失败不影响其它行 */
          }
        }
      };
      const schedule = (delay) => {
        if (disposed || !active || timer !== 0) return;
        timer = setTimeout(() => {
          timer = 0;
          void refresh();
        }, delay);
      };
      const replace = (value) => {
        const next = new Map();
        for (const entry of Array.isArray(value?.managers) ? value.managers : []) {
          if (entry === null || entry === undefined) continue;
          const managerId = String(entry.managerId ?? '');
          const runningEngineers = Number(entry.runningEngineers) || 0;
          if (managerId === '' || runningEngineers <= 0) continue;
          next.set(managerId, {
            managerId,
            runningEngineers,
            sessionEngineers: Number(entry.sessionEngineers) || 0,
            codexEngineers: Number(entry.codexEngineers) || 0,
          });
        }
        const changed = next.size !== managers.size
          || [...next.keys()].some((key) => managers.get(key)?.runningEngineers !== next.get(key).runningEngineers);
        managers = next;
        if (changed) notify();
      };
      const refresh = async () => {
        if (disposed || inFlight) return;
        inFlight = true;
        let delay = 2000;
        try {
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
            delay = 8000;
          } else {
            replace(await api.load());
          }
        } catch {
          // Remote 还没挂载或 Host 暂时不可用：退避重试，不打断列表渲染。
          delay = 10000;
        } finally {
          inFlight = false;
          schedule(delay);
        }
      };
      const onVisibility = () => {
        if (disposed || !active) return;
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        if (timer !== 0) {
          clearTimeout(timer);
          timer = 0;
        }
        schedule(0);
      };

      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisibility);
      }

      return {
        countFor(managerId) {
          if (typeof managerId !== 'string' || managerId === '') return 0;
          return managers.get(managerId)?.runningEngineers ?? 0;
        },
        /** 会话列表出现/移除经理行时启停轮询。 */
        setActive(next) {
          if (disposed || active === next) return;
          active = next;
          if (active) {
            schedule(0);
            return;
          }
          if (timer !== 0) {
            clearTimeout(timer);
            timer = 0;
          }
        },
        subscribe(listener) {
          if (typeof listener !== 'function') return () => {};
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        dispose() {
          disposed = true;
          active = false;
          if (timer !== 0) clearTimeout(timer);
          timer = 0;
          listeners.clear();
          if (typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', onVisibility);
          }
        },
      };
    }

    /** 经理会话判定：预设、命令投影、标题前缀三者任一即可。 */
    function isManagerSummary(summary) {
      const values = summary?.projectionValues;
      if (values?.agentPreset === 'paihuo' || values?.paihuo?.role === 'manager') return true;
      return String(summary?.displayTitle ?? '').startsWith('👔');
    }

    function errorText(error) {
      if (error instanceof Error) return error.message;
      return String(error ?? '');
    }

    function formatUpdated(value) {
      const date = new Date(Number(value) || 0);
      if (!Number.isFinite(date.getTime())) return '';
      const pad = (number) => String(number).padStart(2, '0');
      return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    function ModalShell(props) {
      const { title, subtitle, onClose, t, children, footer } = props;
      const panelRef = React.useRef(null);
      const onCloseRef = React.useRef(onClose);
      onCloseRef.current = onClose;
      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          onCloseRef.current?.();
        };
        document.addEventListener('keydown', onKey);
        const previous = document.activeElement;
        try {
          panelRef.current?.focus?.();
        } catch { /* ignore */ }
        return () => {
          document.removeEventListener('keydown', onKey);
          try {
            if (previous !== null && typeof previous.focus === 'function') previous.focus();
          } catch { /* ignore */ }
        };
      }, []);
      if (typeof document === 'undefined') return null;
      return ReactDOM.createPortal(h('div', {
        className: 'PH_overlay',
        role: 'presentation',
        onMouseDown: (event) => {
          if (event.target === event.currentTarget) onClose?.();
        },
      }, h('div', {
        className: 'PH_modal',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': title,
        tabIndex: -1,
        ref: panelRef,
      }, [
        h('div', { key: 'head', className: 'PH_modalHead' }, [
          h('div', { key: 'titles', className: 'PH_modalTitles' }, [
            h('h2', { key: 'title', className: 'PH_modalTitle' }, title),
            subtitle === undefined || subtitle === '' ? null : h('p', { key: 'sub', className: 'PH_modalSub' }, subtitle),
          ]),
          h('button', {
            key: 'close',
            type: 'button',
            className: 'PH_modalClose',
            'aria-label': t('common.close'),
            title: t('common.close'),
            onClick: () => onClose?.(),
          }, '×'),
        ]),
        h('div', { key: 'body', className: 'PH_modalBody' }, children),
        footer === undefined || footer === null ? null : h('div', { key: 'foot', className: 'PH_modalFoot' }, footer),
      ])), document.body);
    }

    const EMPTY_QUESTION_DRAFT = Object.freeze({ selected: [], custom: '', skipped: false });

    function QuestionField(props) {
      const { question, draft, disabled, scope, t, onChange, onSkip } = props;
      const current = draft ?? EMPTY_QUESTION_DRAFT;
      const options = Array.isArray(question.options) ? question.options : [];
      const multi = question.multiSelect === true;
      const selectedValues = Array.isArray(current.selected) ? current.selected : [];
      const name = `${scope}-${question.id}-${multi ? 'multi' : 'single'}`;
      const toggleOption = (label) => {
        if (disabled) return;
        if (multi) {
          const selected = selectedValues.includes(label)
            ? selectedValues.filter((entry) => entry !== label)
            : [...selectedValues, label];
          onChange({ selected, skipped: false });
          return;
        }
        onChange({ selected: [label], custom: '', skipped: false });
      };
      const changeCustom = (value) => {
        if (disabled) return;
        onChange({
          custom: value,
          ...(multi ? {} : { selected: [] }),
          skipped: false,
        });
      };
      return h('div', { className: 'PH_question' }, [
        h('div', { key: 'qtitle', className: 'PH_qTitle' }, [
          question.header === undefined || question.header === '' ? null : `${question.header} · `,
          question.question,
          multi ? h('span', { key: 'multi', className: 'PH_qHint' }, `（${t('question.multiHint')}）`) : null,
        ]),
        question.detail === undefined || question.detail === '' ? null : h('div', {
          key: 'detail',
          className: 'PH_qDetail',
        }, question.detail),
        current.skipped
          ? h('div', { key: 'skipped', className: 'PH_qActions' }, [
            h('span', { key: 'label', className: 'PH_qSkipped' }, t('question.skipped')),
            disabled ? null : h('button', {
              key: 'unskip',
              type: 'button',
              className: 'PH_qSkip',
              onClick: () => onSkip(false),
            }, t('question.unskip')),
          ])
          : h(React.Fragment, { key: 'body' }, [
            options.length === 0
              ? h('p', { key: 'noOptions', className: 'PH_qHint' }, t('question.noOptions'))
              : h('div', { key: 'options', className: 'PH_options' }, options.map((option) => h('label', {
                key: option.label,
                className: 'PH_option',
              }, [
                h('input', {
                  key: 'input',
                  type: multi ? 'checkbox' : 'radio',
                  name,
                  checked: selectedValues.includes(option.label),
                  disabled,
                  onChange: () => toggleOption(option.label),
                }),
                h('span', { key: 'main', className: 'PH_optionMain' }, [
                  h('span', { key: 'label' }, option.label),
                  option.description === undefined || option.description === ''
                    ? null
                    : h('span', { key: 'desc', className: 'PH_optionDesc' }, option.description),
                ]),
              ]))),
            h('input', {
              key: 'custom',
              className: 'PH_textInput',
              type: 'text',
              value: current.custom,
              disabled,
              placeholder: t('question.customPlaceholder'),
              'aria-label': t('question.custom'),
              onChange: (event) => changeCustom(event.currentTarget.value),
            }),
            disabled ? null : h('div', { key: 'actions', className: 'PH_qActions' }, [
              h('button', {
                key: 'skip',
                type: 'button',
                className: 'PH_qSkip',
                onClick: () => onSkip(true),
              }, t('question.skip')),
            ]),
          ]),
      ]);
    }

    function QuestionCallCard(props) {
      const { call, index, sessionId, ctx, t, onClose } = props;
      const questions = Array.isArray(call.questions) ? call.questions : [];
      const [draft, setDraft] = React.useState({});
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState(null);
      const [notice, setNotice] = React.useState(null);
      const isOpen = call.state !== 'continued';

      const draftOf = (questionId) => draft[questionId] ?? EMPTY_QUESTION_DRAFT;
      const updateDraft = (questionId, patch) => {
        setDraft((current) => ({
          ...current,
          [questionId]: { ...EMPTY_QUESTION_DRAFT, ...(current[questionId] ?? {}), ...patch },
        }));
        setError(null);
        setNotice(null);
      };

      const reveal = () => {
        let shown = false;
        try {
          const panels = ctx.get?.('userQuestionPanels');
          shown = panels !== undefined && panels !== null && typeof panels.reveal === 'function'
            ? panels.reveal(sessionId, call.callId)
            : false;
        } catch {
          shown = false;
        }
        if (!shown) {
          setError(t('question.revealFailed'));
          return;
        }
        onClose?.();
      };

      const submit = async () => {
        const answers = [];
        for (const question of questions) {
          const current = draftOf(question.id);
          if (current.skipped) {
            answers.push({ id: question.id, selected: [] });
            continue;
          }
          const custom = String(current.custom ?? '').trim();
          const selected = Array.isArray(current.selected) ? current.selected : [];
          if (question.multiSelect === true) {
            if (selected.length === 0 && custom === '') {
              setError(t('question.answerRequired'));
              return;
            }
            answers.push({
              id: question.id,
              selected,
              ...(custom === '' ? {} : { custom }),
            });
          } else if (custom !== '') {
            answers.push({ id: question.id, selected: [], custom });
          } else if (selected.length > 0) {
            answers.push({ id: question.id, selected: [selected[0]] });
          } else {
            setError(t('question.answerRequired'));
            return;
          }
        }

        setBusy(true);
        setError(null);
        setNotice(null);
        try {
          const remote = ctx.remote?.userQuestions ?? ctx.get?.('remote.userQuestions');
          if (!remote || typeof remote.answer !== 'function') throw new Error(t('question.unavailable'));
          const result = await remote.answer(sessionId, call.callId, { answers });
          if (result === undefined || result === null || result.ok !== true) {
            throw new Error(result?.error?.message ?? t('question.failed'));
          }
          if (result.value === false) {
            setNotice(t('question.closed'));
            return;
          }
          setNotice(t('question.submitted'));
        } catch (submitError) {
          setError(errorText(submitError) || t('question.failed'));
        } finally {
          setBusy(false);
        }
      };

      return h('div', { className: 'PH_qCall' }, [
        h('div', { key: 'head', className: 'PH_qCallHead' }, [
          h('span', { key: 'title', className: 'PH_qCallTitle' }, t('question.group', { index: index + 1 })),
          h('span', {
            key: 'state',
            className: isOpen ? 'PH_qState PH_qStateOpen' : 'PH_qState',
          }, isOpen ? t('question.open') : t('question.continued')),
        ]),
        error === null ? null : h('p', { key: 'error', className: 'PH_error', role: 'alert' }, error),
        notice === null ? null : h('p', { key: 'notice', className: 'PH_notice', role: 'status' }, notice),
        isOpen ? h('p', { key: 'warn', className: 'PH_warn' }, t('question.waitingOpen')) : null,
        isOpen ? h('div', { key: 'reveal', className: 'PH_qFooter' }, [
          h('button', {
            key: 'open',
            type: 'button',
            className: 'PH_btn',
            onClick: reveal,
          }, t('question.reveal')),
        ]) : null,
        ...questions.map((question) => h(QuestionField, {
          key: question.id,
          question,
          scope: call.callId,
          draft: draftOf(question.id),
          disabled: isOpen || busy,
          t,
          onChange: (patch) => updateDraft(question.id, patch),
          onSkip: (skipped) => updateDraft(question.id, {
            skipped,
            ...(skipped ? { selected: [], custom: '' } : {}),
          }),
        })),
        isOpen ? null : h('div', { key: 'footer', className: 'PH_qFooter' }, [
          h('button', {
            key: 'submit',
            type: 'button',
            className: 'PH_btn PH_btnPrimary',
            disabled: busy,
            onClick: () => { void submit(); },
          }, busy ? t('question.submitting') : t('question.submit')),
        ]),
      ]);
    }

    function QuestionTableAction(props) {
      const { sessionId, useSessions, useProjection, ctx, t } = props;
      const manager = useSessions((state) => isManagerSummary(state.byId?.[sessionId]));
      const projection = useProjection('userQuestions');
      const [open, setOpen] = React.useState(false);

      React.useEffect(() => {
        if (!manager) setOpen(false);
      }, [manager]);

      if (!manager) return null;
      const active = (Array.isArray(projection?.active) ? projection.active : [])
        .filter((call) => call !== null && typeof call === 'object'
          && typeof call.callId === 'string'
          && Array.isArray(call.questions) && call.questions.length > 0);
      const count = active.reduce((total, call) => total + call.questions.length, 0);
      const label = count > 0
        ? t('question.badgeAria', { count })
        : t('question.badgeAriaEmpty');

      return h(React.Fragment, null, [
        h('button', {
          key: 'trigger',
          type: 'button',
          className: 'PH_headerBtn',
          'aria-label': label,
          'aria-haspopup': 'dialog',
          'aria-expanded': open,
          title: label,
          onClick: () => setOpen((value) => !value),
        }, [
          h('span', { key: 'icon', className: 'PH_headerIcon', 'aria-hidden': true }, '💬'),
          count > 0
            ? h('span', {
              key: 'badge',
              className: 'PH_headerBadge PH_headerBadgeQuestion',
              'aria-hidden': true,
            }, count > 99 ? '99+' : String(count))
            : null,
        ]),
        open ? h(QuestionModal, {
          key: 'modal',
          active,
          sessionId,
          ctx,
          t,
          onClose: () => setOpen(false),
        }) : null,
      ]);
    }

    function QuestionModal(props) {
      const { active, sessionId, ctx, t, onClose } = props;
      return h(ModalShell, {
        title: t('question.title'),
        subtitle: active.length === 0 ? t('question.subtitleEmpty') : t('question.subtitle'),
        onClose,
        t,
      }, active.length === 0
        ? h('div', { className: 'PH_modalEmpty' }, [
          h('span', { key: 'glyph', className: 'PH_modalEmptyGlyph', 'aria-hidden': true }, '💬'),
          h('p', { key: 'text', className: 'PH_muted' }, t('question.empty')),
        ])
        : h('div', { className: 'PH_qList' }, active.map((call, index) => h(QuestionCallCard, {
          key: call.callId,
          call,
          index,
          sessionId,
          ctx,
          t,
          onClose,
        }))));
    }

    const TODO_STATUS_ORDER = [
      ['in_progress', 'todo.inProgress', 'InProgress'],
      ['pending', 'todo.pending', 'Pending'],
      ['paused', 'todo.paused', 'Paused'],
    ];

    function TodoRow(props) {
      const { todo, t } = props;
      const suffix = todo.status === 'in_progress'
        ? 'InProgress'
        : todo.status === 'completed' ? 'Completed' : todo.status === 'paused' ? 'Paused' : 'Pending';
      return h('div', { className: 'PH_todoRow' }, [
        h('span', {
          key: 'dot',
          className: `PH_todoDot PH_todoDot${suffix}`,
          'aria-hidden': true,
        }),
        h('div', { key: 'main', className: 'PH_todoMain' }, [
          h('div', {
            key: 'content',
            className: todo.status === 'completed'
              ? 'PH_todoContent PH_todoCompletedText'
              : 'PH_todoContent',
          }, todo.content),
          todo.note === undefined || todo.note === ''
            ? null
            : h('div', { key: 'note', className: 'PH_todoNote' }, t('todo.note', { note: todo.note })),
          h('div', { key: 'meta', className: 'PH_todoMeta' }, [
            h('span', { key: 'id', className: 'PH_todoId' }, todo.id),
            h('span', { key: 'time' }, t('todo.updated', { time: formatUpdated(todo.updatedAt) })),
          ]),
        ]),
      ]);
    }

    function TodoModalBody(props) {
      const { data, error, t } = props;
      const todos = Array.isArray(data?.todos) ? data.todos : [];
      if (todos.length === 0) {
        if (data === null && error !== null) {
          return h('p', { className: 'PH_error', role: 'alert' }, error);
        }
        return h(React.Fragment, null, [
          error === null ? null : h('p', { key: 'error', className: 'PH_error', role: 'alert' }, error),
          h('div', { key: 'empty', className: 'PH_modalEmpty' }, [
            h('span', { key: 'glyph', className: 'PH_modalEmptyGlyph', 'aria-hidden': true }, '🗒️'),
            h('p', {
              key: 'text',
              className: 'PH_muted',
            }, data === null ? t('todo.loading') : t('todo.empty')),
          ]),
        ]);
      }
      const groups = { pending: [], in_progress: [], paused: [], completed: [] };
      for (const todo of todos) {
        if (groups[todo.status] !== undefined) groups[todo.status].push(todo);
      }
      const sections = TODO_STATUS_ORDER
        .filter(([status]) => groups[status].length > 0)
        .map(([status, labelKey]) => h('section', { key: status, className: 'PH_todoSection' }, [
          h('h3', { key: 'title', className: 'PH_todoSectionTitle' }, [
            t(labelKey),
            h('span', { key: 'count', className: 'PH_muted' }, ` ${groups[status].length}`),
          ]),
          ...groups[status].map((todo) => h(TodoRow, { key: todo.id, todo, t })),
        ]));
      const completed = groups.completed.length > 0
        ? h('details', { key: 'completed', className: 'PH_todoCompleted' }, [
          h('summary', { key: 'sum' }, t('todo.completedCount', { count: groups.completed.length })),
          ...groups.completed.map((todo) => h(TodoRow, { key: todo.id, todo, t })),
        ])
        : null;
      return h(React.Fragment, null, [
        error === null ? null : h('p', { key: 'error', className: 'PH_error', role: 'alert' }, error),
        ...sections,
        completed,
      ]);
    }

    function TodoModal(props) {
      const { data, error, t, onClose, onRefresh } = props;
      const counts = data?.counts ?? {};
      const openCount = Number.isFinite(counts.open) ? counts.open : 0;
      return h(ModalShell, {
        title: t('todo.title'),
        subtitle: openCount > 0 ? t('todo.subtitle', { count: openCount }) : t('todo.subtitleEmpty'),
        onClose,
        t,
        footer: [
          h('span', { key: 'hint', className: 'PH_muted' }, t('todo.hint')),
          h('button', {
            key: 'refresh',
            type: 'button',
            className: 'PH_btn PH_btnGhost',
            onClick: onRefresh,
          }, t('todo.refresh')),
        ],
      }, h(TodoModalBody, { data, error, t }));
    }

    function TodoListAction(props) {
      const { sessionId, useSessions, api, t } = props;
      const manager = useSessions((state) => isManagerSummary(state.byId?.[sessionId]));
      const [open, setOpen] = React.useState(false);
      const [data, setData] = React.useState(null);
      const [error, setError] = React.useState(null);
      const [refresh, setRefresh] = React.useState(0);

      React.useEffect(() => {
        if (!manager) setOpen(false);
      }, [manager]);

      React.useEffect(() => {
        if (!manager) return undefined;
        let cancelled = false;
        let timer = 0;
        const tick = async () => {
          if (cancelled) return;
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
            timer = setTimeout(tick, open ? 4000 : 6000);
            return;
          }
          try {
            const value = await api.load(sessionId);
            if (!cancelled) {
              setData(value);
              setError(null);
            }
          } catch (loadError) {
            if (!cancelled) setError(errorText(loadError) || t('todo.loadFailed'));
          }
          if (!cancelled) timer = setTimeout(tick, open ? 2000 : 3000);
        };
        void tick();
        return () => {
          cancelled = true;
          clearTimeout(timer);
        };
      }, [manager, sessionId, open, refresh, api]);

      if (!manager) return null;
      const counts = data?.counts ?? {};
      const openCount = Number.isFinite(counts.open) ? counts.open : 0;
      const label = openCount > 0
        ? t('todo.badgeAria', { count: openCount })
        : t('todo.badgeAriaEmpty');

      return h(React.Fragment, null, [
        h('button', {
          key: 'trigger',
          type: 'button',
          className: 'PH_headerBtn',
          'aria-label': label,
          'aria-haspopup': 'dialog',
          'aria-expanded': open,
          title: label,
          onClick: () => setOpen((value) => !value),
        }, [
          h('span', { key: 'icon', className: 'PH_headerIcon', 'aria-hidden': true }, '🗒️'),
          openCount > 0
            ? h('span', {
              key: 'badge',
              className: 'PH_headerBadge PH_headerBadgeTodo',
              'aria-hidden': true,
            }, openCount > 99 ? '99+' : String(openCount))
            : null,
        ]),
        open ? h(TodoModal, {
          key: 'modal',
          data,
          error,
          t,
          onClose: () => setOpen(false),
          onRefresh: () => setRefresh((value) => value + 1),
        }) : null,
      ]);
    }

    // ── Codex 子代理菜单 ─────────────────────────────────────────────────
    function safeMarkdownHref(value) {
      const href = String(value ?? '').trim();
      return /^(https?:\/\/|mailto:)/i.test(href) ? href : null;
    }

    function markdownInline(text, prefix) {
      const source = String(text ?? '');
      const nodes = [];
      const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|(?<![\w])__[^_\n]+__(?![\w])|~~[^~\n]+~~|\[[^\]\n]+\]\([^()\s]+\)|\*[^*\n]+\*|(?<![\w])_[^_\n]+_(?![\w]))/g;
      let last = 0;
      let index = 0;
      let match = pattern.exec(source);
      while (match !== null) {
        if (match.index > last) nodes.push(source.slice(last, match.index));
        const token = match[0];
        const key = `${prefix}-${index}`;
        index += 1;
        if (token.startsWith('`') && token.endsWith('`')) {
          nodes.push(h('code', { key, className: 'PH_mdInlineCode' }, token.slice(1, -1)));
        } else if ((token.startsWith('**') && token.endsWith('**'))
          || (token.startsWith('__') && token.endsWith('__'))) {
          nodes.push(h('strong', { key }, markdownInline(token.slice(2, -2), key)));
        } else if (token.startsWith('~~') && token.endsWith('~~')) {
          nodes.push(h('del', { key }, markdownInline(token.slice(2, -2), key)));
        } else if (token.startsWith('[')) {
          const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
          const href = link === null ? null : safeMarkdownHref(link[2]);
          if (href === null) {
            nodes.push(token);
          } else {
            nodes.push(h('a', {
              key,
              href,
              target: '_blank',
              rel: 'noreferrer',
              className: 'PH_mdLink',
            }, markdownInline(link[1], key)));
          }
        } else if ((token.startsWith('*') && token.endsWith('*'))
          || (token.startsWith('_') && token.endsWith('_'))) {
          nodes.push(h('em', { key }, markdownInline(token.slice(1, -1), key)));
        } else {
          nodes.push(token);
        }
        last = match.index + token.length;
        match = pattern.exec(source);
      }
      if (last < source.length) nodes.push(source.slice(last));
      return nodes;
    }

    function markdownTableCells(line) {
      let text = String(line ?? '').trim();
      if (text.startsWith('|')) text = text.slice(1);
      if (text.endsWith('|')) text = text.slice(0, -1);
      return text.split('|').map((cell) => cell.trim());
    }

    function markdownTableSeparator(line) {
      const cells = markdownTableCells(line);
      return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
    }

    function markdownListMatch(line) {
      const match = /^(\s*)([-+*]|\d+[.)])\s+(.*)$/.exec(line);
      if (match === null) return null;
      return {
        indent: match[1].replace(/\t/g, '  ').length,
        ordered: /^\d/.test(match[2]),
        text: match[3],
      };
    }

    function markdownList(items, prefix) {
      const baseIndent = items.length > 0 ? items[0].indent : 0;
      const ordered = items.length > 0 ? items[0].ordered : false;
      return h(ordered ? 'ol' : 'ul', { key: prefix, className: 'PH_mdList' },
        items.map((item, index) => h('li', {
          key: `${prefix}-${index}`,
          className: item.indent > baseIndent ? 'PH_mdListItemNested' : undefined,
          style: item.indent > baseIndent
            ? { marginLeft: `${Math.min(28, (item.indent - baseIndent) * 4)}px` }
            : undefined,
        }, markdownInline(item.text, `${prefix}-${index}`))));
    }

    function markdownBlocks(text, prefix = 'md') {
      const source = String(text ?? '').replace(/\r\n?/g, '\n');
      const lines = source.split('\n');
      const nodes = [];
      let index = 0;
      let block = 0;
      while (index < lines.length) {
        const line = lines[index];
        if (line.trim() === '') {
          index += 1;
          continue;
        }
        const key = `${prefix}-${block}`;
        block += 1;

        const fence = /^\s*```(.*)$/.exec(line);
        if (fence !== null) {
          const language = fence[1].trim();
          const code = [];
          index += 1;
          while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
            code.push(lines[index]);
            index += 1;
          }
          if (index < lines.length) index += 1;
          nodes.push(h('pre', { key, className: 'PH_mdCode' }, [
            language === '' ? null : h('span', { key: 'lang', className: 'PH_mdCodeLang' }, language),
            h('code', { key: 'code' }, code.join('\n')),
          ]));
          continue;
        }

        const heading = /^(#{1,6})\s+(.*)$/.exec(line);
        if (heading !== null) {
          const level = heading[1].length;
          nodes.push(h(`h${level}`, {
            key,
            className: `PH_mdHeading PH_mdH${level}`,
          }, markdownInline(heading[2], key)));
          index += 1;
          continue;
        }

        if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
          nodes.push(h('hr', { key, className: 'PH_mdHr' }));
          index += 1;
          continue;
        }

        if (line.includes('|') && index + 1 < lines.length && markdownTableSeparator(lines[index + 1])) {
          const header = markdownTableCells(line);
          index += 2;
          const rows = [];
          while (index < lines.length && lines[index].includes('|') && lines[index].trim() !== '') {
            rows.push(markdownTableCells(lines[index]));
            index += 1;
          }
          const head = h('thead', { key: 'head' }, h('tr', null, header.map((cell, cellIndex) => h('th', {
            key: `h-${cellIndex}`,
          }, markdownInline(cell, `${key}-h-${cellIndex}`)))));
          const body = h('tbody', { key: 'body' }, rows.map((row, rowIndex) => h('tr', {
            key: `r-${rowIndex}`,
          }, row.map((cell, cellIndex) => h('td', {
            key: `c-${cellIndex}`,
          }, markdownInline(cell, `${key}-r-${rowIndex}-${cellIndex}`))))));
          nodes.push(h('div', { key, className: 'PH_mdTableWrap' }, h('table', { className: 'PH_mdTable' }, [head, body])));
          continue;
        }

        if (/^\s*>\s?/.test(line)) {
          const quote = [];
          while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
            quote.push(lines[index].replace(/^\s*>\s?/, ''));
            index += 1;
          }
          nodes.push(h('blockquote', { key, className: 'PH_mdQuote' },
            markdownBlocks(quote.join('\n'), `${key}-q`)));
          continue;
        }

        const firstList = markdownListMatch(line);
        if (firstList !== null) {
          const items = [];
          while (index < lines.length) {
            const item = markdownListMatch(lines[index]);
            if (item === null) break;
            items.push(item);
            index += 1;
          }
          nodes.push(markdownList(items, key));
          continue;
        }

        const paragraph = [];
        while (index < lines.length) {
          const current = lines[index];
          if (current.trim() === '') break;
          if (paragraph.length > 0 && (/^\s*```/.test(current)
            || /^(#{1,6})\s+/.test(current)
            || /^\s*>\s?/.test(current)
            || markdownListMatch(current) !== null
            || /^\s*([-*_])(\s*\1){2,}\s*$/.test(current))) {
            break;
          }
          paragraph.push(current);
          index += 1;
        }
        nodes.push(h('p', { key, className: 'PH_mdParagraph' }, markdownInline(paragraph.join('\n'), key)));
      }
      return nodes;
    }

    function MarkdownBody(props) {
      const { text, className } = props;
      const nodes = React.useMemo(() => markdownBlocks(text), [text]);
      return h('div', { className: `PH_codexMd${className === undefined ? '' : ` ${className}`}` }, nodes);
    }

    function useRevealedText(text, animate) {
      const source = String(text ?? '');
      const [count, setCount] = React.useState(animate ? 0 : source.length);
      React.useEffect(() => {
        if (!animate) {
          setCount(source.length);
          return undefined;
        }
        if (count >= source.length) return undefined;
        const step = Math.max(3, Math.ceil(source.length / 40));
        const timer = setTimeout(() => {
          setCount((value) => Math.min(source.length, value + step));
        }, 28);
        return () => clearTimeout(timer);
      }, [animate, source, count]);
      return animate ? source.slice(0, Math.min(count, source.length)) : source;
    }

    function codexCommandSummary(entry) {
      const command = String(entry?.command ?? entry?.text ?? '').replace(/\s+/g, ' ').trim();
      if (command === '') return '命令';
      return command.length > 110 ? `${command.slice(0, 109)}…` : command;
    }

    function codexEntryLabel(entry, t) {
      if (entry.kind === 'user') {
        const label = typeof entry.label === 'string' ? entry.label : '';
        if (label.startsWith('任务 #')) {
          return t('codex.task', { task: label.slice('任务 #'.length) });
        }
        return label === '' ? t('codex.managerMessage') : label;
      }
      if (entry.kind === 'assistant') return 'Codex';
      if (entry.kind === 'command') return t('codex.command');
      if (entry.kind === 'error') return 'ERROR';
      return '·';
    }

    function CodexEntryRow(props) {
      const { entry, t, animate } = props;
      const kind = entry.kind === 'user' ? 'User' : entry.kind === 'error' ? 'Error' : '';
      const output = typeof entry.output === 'string' ? entry.output : '';
      const text = useRevealedText(
        entry.text ?? '',
        animate === true && entry.kind === 'assistant',
      );

      if (entry.kind === 'command') {
        const command = entry.command ?? entry.text ?? '';
        return h('details', {
          className: `PH_codexEntry PH_codexEntryCommand${kind === '' ? '' : ` PH_codexEntry${kind}`}`,
        }, [
          h('summary', { key: 'summary', className: 'PH_codexCommandSummary' }, [
            h('span', {
              key: 'cmd',
              className: 'PH_codexCommandSummaryText',
              title: String(entry.command ?? entry.text ?? ''),
            }, `$ ${codexCommandSummary(entry)}`),
            h('span', { key: 'meta', className: 'PH_codexCommandMeta' }, [
              typeof entry.exitCode === 'number'
                ? h('span', { key: 'exit', className: 'PH_muted' }, t('codex.exitCode', { code: entry.exitCode }))
                : null,
              h('span', { key: 'time', className: 'PH_muted' }, formatUpdated(entry.at)),
            ]),
          ]),
          h('div', { key: 'body', className: 'PH_codexCommandBody' }, [
            command === ''
              ? null
              : h('pre', { key: 'command', className: 'PH_codexCommand' }, command),
            output === ''
              ? null
              : h('pre', { key: 'output', className: 'PH_codexOutput' }, output),
          ]),
        ]);
      }

      return h('div', { className: `PH_codexEntry${kind === '' ? '' : ` PH_codexEntry${kind}`}` }, [
        h('div', { key: 'head', className: 'PH_codexEntryHead' }, [
          h('span', { key: 'label', className: 'PH_codexEntryLabel' }, codexEntryLabel(entry, t)),
          typeof entry.exitCode === 'number'
            ? h('span', { key: 'exit' }, t('codex.exitCode', { code: entry.exitCode }))
            : null,
          h('span', { key: 'time', className: 'PH_muted' }, formatUpdated(entry.at)),
        ]),
        entry.kind === 'user' || entry.kind === 'assistant'
          ? h(MarkdownBody, { key: 'text', text })
          : (entry.text !== ''
            ? h('div', { key: 'text', className: 'PH_codexEntryText' }, entry.text)
            : null),
      ]);
    }

    function CodexModal(props) {
      const { sessions, listError, managerId, api, t, onClose, onRefresh } = props;
      const [selectedId, setSelectedId] = React.useState(null);
      const [transcript, setTranscript] = React.useState(null);
      const [transcriptError, setTranscriptError] = React.useState(null);
      const [refresh, setRefresh] = React.useState(0);
      const [atBottom, setAtBottom] = React.useState(true);
      const transcriptRef = React.useRef(null);
      const atBottomRef = React.useRef(true);
      const initialScrollRef = React.useRef(false);
      const initialIdsRef = React.useRef(new Set());
      const initializedIdsRef = React.useRef(false);

      const selected = sessions.find((entry) => entry.engineerId === selectedId) ?? null;
      const selectedRunning = selected !== null && selected.status === 'running';

      React.useEffect(() => {
        if (sessions.length === 0) {
          setSelectedId(null);
          setTranscript(null);
          return;
        }
        if (selectedId === null || !sessions.some((entry) => entry.engineerId === selectedId)) {
          const preferred = sessions.find((entry) => entry.status === 'running') ?? sessions[0];
          setSelectedId(preferred.engineerId);
        }
      }, [sessions, selectedId]);

      React.useEffect(() => {
        initialScrollRef.current = false;
        initializedIdsRef.current = false;
        initialIdsRef.current = new Set();
        atBottomRef.current = true;
        setAtBottom(true);
      }, [selectedId]);

      React.useEffect(() => {
        if (selectedId === null) {
          setTranscript(null);
          return undefined;
        }
        let cancelled = false;
        let timer = 0;
        const tick = async () => {
          if (cancelled) return;
          try {
            const value = await api.transcript(managerId, selectedId);
            if (!cancelled) {
              if (!initializedIdsRef.current) {
                for (const entry of value?.entries ?? []) initialIdsRef.current.add(entry.id);
                initializedIdsRef.current = true;
              }
              setTranscript(value);
              setTranscriptError(null);
            }
          } catch (loadError) {
            if (!cancelled) setTranscriptError(errorText(loadError) || t('codex.loadFailed'));
          }
          if (!cancelled) timer = setTimeout(tick, selectedRunning ? 500 : 1000);
        };
        void tick();
        return () => {
          cancelled = true;
          clearTimeout(timer);
        };
      }, [selectedId, selectedRunning, refresh, managerId, api]);

      const entries = Array.isArray(transcript?.entries) ? transcript.entries : [];

      React.useEffect(() => {
        const element = transcriptRef.current;
        if (element === null) return;
        if (!initialScrollRef.current) {
          element.scrollTop = 0;
          initialScrollRef.current = true;
          const bottom = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
          atBottomRef.current = bottom;
          setAtBottom(bottom);
          return;
        }
        if (atBottomRef.current) element.scrollTop = element.scrollHeight;
      }, [transcript]);

      React.useEffect(() => {
        if (selectedId === null) return undefined;
        const timer = setInterval(() => {
          const element = transcriptRef.current;
          if (element !== null && atBottomRef.current) element.scrollTop = element.scrollHeight;
        }, 120);
        return () => clearInterval(timer);
      }, [selectedId]);

      const onTranscriptScroll = () => {
        const element = transcriptRef.current;
        if (element === null) return;
        const bottom = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
        atBottomRef.current = bottom;
        setAtBottom(bottom);
      };

      const jumpToBottom = () => {
        const element = transcriptRef.current;
        if (element !== null) element.scrollTop = element.scrollHeight;
        atBottomRef.current = true;
        setAtBottom(true);
      };

      const running = sessions.filter((entry) => entry.status === 'running').length;
      const subtitle = sessions.length === 0
        ? t('codex.empty')
        : t('codex.subtitle', { count: sessions.length, running });

      return h(ModalShell, {
        title: t('codex.title'),
        subtitle,
        onClose,
        t,
        footer: [
          h('span', { key: 'hint', className: 'PH_muted' }, t('codex.hint')),
          h('button', {
            key: 'refresh',
            type: 'button',
            className: 'PH_btn PH_btnGhost',
            onClick: () => {
              setRefresh((value) => value + 1);
              onRefresh?.();
            },
          }, t('codex.refresh')),
        ],
      }, [
        listError !== null
          ? h('p', { key: 'listError', className: 'PH_error', role: 'alert' }, t('codex.unavailable', { error: listError }))
          : null,
        sessions.length === 0
          ? h('div', { key: 'empty', className: 'PH_modalEmpty' }, [
            h('span', { key: 'glyph', className: 'PH_modalEmptyGlyph', 'aria-hidden': true }, '🤖'),
            h('p', { key: 'text', className: 'PH_muted' }, t('codex.empty')),
          ])
          : h('div', { key: 'layout', className: 'PH_codexLayout' }, [
            h('div', { key: 'list', className: 'PH_codexList' }, sessions.map((session) => h('button', {
              key: session.engineerId,
              type: 'button',
              className: `PH_codexSession${session.engineerId === selectedId ? ' PH_codexSessionActive' : ''}`,
              onClick: () => {
                setTranscript(null);
                setTranscriptError(null);
                setSelectedId(session.engineerId);
              },
            }, [
              h('div', { key: 'head', className: 'PH_codexSessionHead' }, [
                h('span', {
                  key: 'dot',
                  className: `PH_codexStatus${session.status === 'running' ? ' PH_codexStatusRunning' : ''}`,
                  'aria-hidden': true,
                }),
                h('span', { key: 'id', className: 'PH_codexId', title: session.engineerId }, session.engineerId),
                h('span', { key: 'status', className: 'PH_muted' }, session.status === 'running' ? t('codex.status.running') : t('codex.status.idle')),
              ]),
              h('div', { key: 'task', className: 'PH_codexMeta' }, session.activeTaskId === null
                ? (session.sessionId === null ? t('codex.session', { id: '—' }) : t('codex.session', { id: session.sessionId }))
                : `#${session.activeTaskId} ${session.activeTaskTitle ?? ''}`),
              h('div', { key: 'meta', className: 'PH_codexMeta' }, [
                session.model === null ? 'Codex' : t('codex.model', { model: session.model }),
                session.worktreeBranch === null ? '' : ` · ${t('codex.worktree', { branch: session.worktreeBranch })}`,
                ` · ${t('codex.lastUpdated', { time: formatUpdated(session.updatedAt) })}`,
              ]),
            ]))),
            h('div', { key: 'transcriptPane', className: 'PH_codexTranscriptWrap' }, [
              h('div', {
                key: 'transcript',
                className: 'PH_codexTranscript',
                ref: transcriptRef,
                onScroll: onTranscriptScroll,
              }, [
                transcriptError !== null
                  ? h('p', { key: 'error', className: 'PH_error', role: 'alert' }, transcriptError)
                  : null,
                selected === null
                  ? h('p', { key: 'none', className: 'PH_muted' }, t('codex.noSelection'))
                  : null,
                selected !== null && transcript !== null && entries.length === 0
                  ? h('p', { key: 'empty', className: 'PH_muted' }, t('codex.transcriptEmpty'))
                  : null,
                ...entries.map((entry) => h(CodexEntryRow, {
                  key: entry.id,
                  entry,
                  t,
                  animate: entry.kind === 'assistant' && !initialIdsRef.current.has(entry.id),
                })),
                selectedRunning
                  ? h('div', { key: 'streaming', className: 'PH_codexStreaming' }, [
                    h('span', { key: 'dots', className: 'PH_codexStreamingDots', 'aria-hidden': true }, '● ● ●'),
                    h('span', { key: 'text' }, t('codex.streaming')),
                  ])
                  : null,
              ]),
              atBottom ? null : h('button', {
                key: 'jump',
                type: 'button',
                className: 'PH_codexJumpBottom',
                title: t('codex.jumpBottom'),
                'aria-label': t('codex.jumpBottom'),
                onClick: jumpToBottom,
              }, '↓'),
            ]),
          ]),
      ]);
    }

    function CodexMenuAction(props) {
      const { sessionId, useSessions, api, t } = props;
      const manager = useSessions((state) => isManagerSummary(state.byId?.[sessionId]));
      const [open, setOpen] = React.useState(false);
      const [data, setData] = React.useState(null);
      const [error, setError] = React.useState(null);
      const [refresh, setRefresh] = React.useState(0);

      React.useEffect(() => {
        if (!manager) setOpen(false);
      }, [manager]);

      React.useEffect(() => {
        if (!manager) return undefined;
        let cancelled = false;
        let timer = 0;
        const tick = async () => {
          if (cancelled) return;
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
            timer = setTimeout(tick, open ? 5000 : 8000);
            return;
          }
          try {
            const value = await api.sessions(sessionId);
            if (!cancelled) {
              setData(value);
              setError(null);
            }
          } catch (loadError) {
            if (!cancelled) setError(errorText(loadError) || t('codex.loadFailed'));
          }
          if (!cancelled) timer = setTimeout(tick, open ? 2000 : 5000);
        };
        void tick();
        return () => {
          cancelled = true;
          clearTimeout(timer);
        };
      }, [manager, sessionId, open, refresh, api]);

      if (!manager) return null;
      if (data === null && error === null) return null;
      const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
      if (data !== null && data.enabled !== true && sessions.length === 0) return null;
      const running = sessions.filter((entry) => entry.status === 'running').length;
      const label = running > 0
        ? t('codex.badgeAria', { count: running })
        : t('codex.badgeAriaEmpty');

      return h(React.Fragment, null, [
        h('button', {
          key: 'trigger',
          type: 'button',
          className: 'PH_headerBtn',
          'aria-label': label,
          'aria-haspopup': 'dialog',
          'aria-expanded': open,
          title: label,
          onClick: () => setOpen((value) => !value),
        }, [
          h('span', { key: 'icon', className: 'PH_headerIcon', 'aria-hidden': true }, '🤖'),
          running > 0
            ? h('span', {
              key: 'badge',
              className: 'PH_headerBadge PH_headerBadgeTodo',
              'aria-hidden': true,
            }, running > 99 ? '99+' : String(running))
            : null,
        ]),
        open ? h(CodexModal, {
          key: 'modal',
          sessions,
          listError: error,
          managerId: sessionId,
          api,
          t,
          onClose: () => setOpen(false),
          onRefresh: () => setRefresh((value) => value + 1),
        }) : null,
      ]);
    }

    // ── 派活回报卡片 ─────────────────────────────────────────────────────
    const REPORT_START = '【派活系统回报';
    const REPORT_END = '【派活系统回报结束】';
    const TODO_NOTICE_START = '【派活系统提醒';
    const TODO_NOTICE_END = '【派活系统提醒结束】';

    function messageText(message) {
      const content = Array.isArray(message?.content) ? message.content : [];
      return content
        .filter((block) => block?.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('\n')
        .trim();
    }

    /** 消息体：`user/message` 的 data 本身就是消息；兼容 `{ message }` 形态。 */
    function reportMessageOf(event) {
      const data = event?.data;
      if (data === undefined || data === null) return undefined;
      if (Array.isArray(data.content)) return data;
      if (data.message !== undefined && Array.isArray(data.message?.content)) return data.message;
      return undefined;
    }

    function parseReport(event) {
      const message = reportMessageOf(event);
      const text = messageText(message);
      if (!text.startsWith(REPORT_START)) return undefined;
      const lines = text.split('\n');
      const end = lines.findIndex((line) => line.trim() === REPORT_END);
      const head = lines.slice(1, end === -1 ? lines.length : end).filter((line) => line.trim() !== '');
      const title = head[0] ?? '派活回报';
      const metaLine = head.find((line) => line.startsWith('- 工程师：'));
      const body = head.slice(1).join('\n').trim();
      return {
        title,
        meta: metaLine === undefined ? '' : metaLine.replace('- 工程师：', '').trim(),
        body,
      };
    }

    /**
     * 待办强制核对提醒只匹配一次，渲染成“待办更新提示...”卡片；
     * 正文（list/complete/update 的具体要求）不展示，避免把系统提醒
     * 当成普通用户消息刷屏。
     */
    function parseTodoNotice(event) {
      const message = reportMessageOf(event);
      const text = messageText(message);
      if (!text.startsWith(TODO_NOTICE_START)) return undefined;
      if (!text.includes(TODO_NOTICE_END)) return undefined;
      return {};
    }

    const paihuoTodoNoticeDefinition = {
      kind: 'paihuo-todo-notice',
      target: 'chat',
      match: (event) => {
        if (event?.type !== 'user/message') return null;
        if (parseTodoNotice(event) === undefined) return null;
        const message = reportMessageOf(event);
        return {
          id: message?.id ?? `paihuo-todo-notice-${event.seq}`,
          role: 'start',
          exclusive: true,
        };
      },
      start: (_context, match) => parseTodoNotice(match.event),
      update: (context) => context.state,
      buildViewNode: (context) => {
        const start = context.start ?? context.matches[0];
        if (start === undefined) return null;
        const data = context.state ?? parseTodoNotice(start.event);
        if (data === undefined) return null;
        return {
          key: context.key,
          kind: 'paihuo-todo-notice',
          id: context.id,
          target: 'chat',
          anchorSeq: start.event.seq,
          location: start.location,
          visibility: 'visible',
          data,
        };
      },
    };

    const paihuoReportDefinition = {
      kind: 'paihuo-report',
      target: 'chat',
      match: (event) => {
        if (event?.type !== 'user/message') return null;
        if (parseReport(event) === undefined) return null;
        const message = reportMessageOf(event);
        return {
          id: message?.id ?? `paihuo-report-${event.seq}`,
          role: 'start',
          exclusive: true,
        };
      },
      start: (_context, match) => parseReport(match.event),
      update: (context) => context.state,
      buildViewNode: (context) => {
        const start = context.start ?? context.matches[0];
        if (start === undefined) return null;
        const data = context.state ?? parseReport(start.event);
        if (data === undefined) return null;
        return {
          key: context.key,
          kind: 'paihuo-report',
          id: context.id,
          target: 'chat',
          anchorSeq: start.event.seq,
          location: start.location,
          visibility: 'visible',
          data,
        };
      },
    };

    function PaihuoReportRow(props) {
      const { node, t } = props;
      const [open, setOpen] = React.useState(false);
      const data = node?.data ?? node?.node?.data ?? {};
      const body = typeof data.body === 'string' ? data.body : '';
      return h('div', { className: 'PH_report', 'data-plugin': 'dsh-paihuo' }, [
        h('button', {
          key: 'head',
          type: 'button',
          className: 'PH_reportHead',
          'aria-expanded': open,
          title: t('report.notUser'),
          onClick: () => setOpen((value) => !value),
        }, [
          h('span', { key: 'icon', className: 'PH_reportIcon', 'aria-hidden': true }, '📋'),
          h('span', { key: 'titles', className: 'PH_reportTitles' }, [
            h('span', { key: 'title', className: 'PH_reportTitle' }, data.title ?? t('report.title')),
            h('span', { key: 'meta', className: 'PH_reportMeta' }, data.meta || t('report.notUser')),
          ]),
          h('span', { key: 'chevron', className: 'PH_reportChevron', 'aria-hidden': true }, open ? '▾' : '▸'),
        ]),
        open && body !== ''
          ? h('pre', { key: 'body', className: 'PH_reportBody' }, body)
          : null,
      ]);
    }

    function PaihuoTodoNoticeRow(props) {
      const { t } = props;
      const title = t('todo.noticeTitle');
      return h('div', {
        className: 'PH_todoNotice',
        'data-plugin': 'dsh-paihuo',
        role: 'status',
        title,
      }, [
        h('span', { key: 'icon', className: 'PH_todoNoticeIcon', 'aria-hidden': true }, '🗒️'),
        h('span', { key: 'title', className: 'PH_todoNoticeTitle' }, title),
      ]);
    }

    /**
     * 给会话列表的每一行标上角色：经理=manager，工程师=engineer。
     * 依据是角色投影（paihuo.role）与 agentPreset，不依赖标题里的 emoji。
     * 经理名下有工程师在跑时再标上 data-paihuo-working，CSS 据此画 LOADING。
     */
    function installRowColors(ctx, activity) {
      const sessions = ctx.get('sessions');
      let frame = 0;
      let managerVisible = false;
      const apply = () => {
        const byId = sessions?.list?.getSnapshot?.()?.byId ?? {};
        let hasManager = false;
        for (const element of document.querySelectorAll('[data-row-key^="session:"]')) {
          const sessionId = element.getAttribute('data-row-key')?.slice('session:'.length) ?? '';
          const values = byId[sessionId]?.projectionValues ?? {};
          let role = null;
          if (values.agentPreset === 'paihuo' || values.paihuo?.role === 'manager') role = 'manager';
          else if (values.paihuo?.role === 'engineer') role = 'engineer';
          // 缩略标题兜底：投影还没到达时按标题前缀判断。
          if (role === null) {
            const text = String(element.textContent ?? '').trimStart();
            if (text.startsWith('👔')) role = 'manager';
            else if (text.startsWith('👷')) role = 'engineer';
          }
          if (role === null) element.removeAttribute('data-paihuo-role');
          else if (element.getAttribute('data-paihuo-role') !== role) element.setAttribute('data-paihuo-role', role);

          // 经理名下有工程师在跑：给行加标记，CSS 在左侧状态位画旋转 LOADING。
          const manager = role === 'manager';
          if (manager) hasManager = true;
          const running = manager ? activity.countFor(sessionId) : 0;
          if (running > 0) {
            if (element.getAttribute('data-paihuo-working') !== 'true') {
              element.setAttribute('data-paihuo-working', 'true');
            }
            const count = String(running);
            if (element.getAttribute('data-paihuo-working-count') !== count) {
              element.setAttribute('data-paihuo-working-count', count);
            }
          } else {
            element.removeAttribute('data-paihuo-working');
            element.removeAttribute('data-paihuo-working-count');
          }
        }
        if (managerVisible !== hasManager) {
          managerVisible = hasManager;
          activity.setActive(hasManager);
        }
      };
      const schedule = () => {
        if (frame !== 0) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          apply();
        });
      };
      const dispose = typeof sessions?.list?.subscribe === 'function' ? sessions.list.subscribe(schedule) : undefined;
      const unsubscribeActivity = activity.subscribe(schedule);
      const observer = new MutationObserver(schedule);
      observer.observe(document.body, { childList: true, subtree: true });
      apply();
      return () => {
        if (typeof dispose === 'function') dispose();
        unsubscribeActivity();
        observer.disconnect();
        if (frame !== 0) cancelAnimationFrame(frame);
      };
    }

    const inject = ['slots', 'locale', 'uiConversation', 'remote'];

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'paihuo: dictionaries');
      const t = ctx.locale.bind(NS);
      const remoteApi = createRemoteApi(ctx);
      const todoApi = createTodoApi(ctx, remoteApi);
      const codexApi = createCodexApi(ctx, remoteApi);
      const toolsApi = createToolsApi(ctx, remoteApi);
      const activity = createActivityStore(createActivityApi(ctx, remoteApi));

      ctx.effect(() => {
        if (typeof document === 'undefined') return () => {};
        const style = document.createElement('style');
        style.setAttribute('data-plugin', 'dsh-paihuo');
        style.textContent = CSS;
        document.head.appendChild(style);
        return () => {
          style.remove();
        };
      }, 'paihuo: styles');

      ctx.effect(() => () => activity.dispose(), 'paihuo: engineer activity');

      // 会话列表行着色（经理蓝底白字 / 工程师黄底黑字）与经理 LOADING 动画。
      ctx.effect(() => installRowColors(ctx, activity), 'paihuo: session row colors');

      // 经理会话右上角：问题表（复用 userQuestions 投影）与待办（Remote 轮询）。
      ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
        name: 'conversation.session.header.utilities',
        id: 'paihuo-questions',
        order: 30,
        locale: NS,
        inject: () => ({ ctx }),
      }, QuestionTableAction));
      ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
        name: 'conversation.session.header.utilities',
        id: 'paihuo-todos',
        order: 31,
        locale: NS,
        inject: () => ({ api: todoApi }),
      }, TodoListAction));
      ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
        name: 'conversation.session.header.utilities',
        id: 'paihuo-codex',
        order: 32,
        locale: NS,
        inject: () => ({ api: codexApi }),
      }, CodexMenuAction));

      // 派活回报：独占匹配带标记的用户消息，渲染成可折叠卡片。
      // 注意 buildViewNode 必须显式 visibility:"visible"，Chat 只渲染 visible 节点。
      ctx.effect(
        () => ctx.uiConversation.events.register(paihuoReportDefinition),
        'paihuo: report definition',
      );
      ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
        name: 'conversation.chat.node',
        key: 'paihuo-report',
        locale: NS,
      }, (props) => h(PaihuoReportRow, { ...props, t })));

      // 待办强制核对：只显示“待办更新提示...”紧凑卡片，不展开正文。
      ctx.effect(
        () => ctx.uiConversation.events.register(paihuoTodoNoticeDefinition),
        'paihuo: todo notice definition',
      );
      ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
        name: 'conversation.chat.node',
        key: 'paihuo-todo-notice',
        locale: NS,
      }, (props) => h(PaihuoTodoNoticeRow, { ...props, t })));

      // Settings → 派活：独立配置页。
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: ENTRY_ID,
        order: 90,
        locale: NS,
        label: () => t('settings.title'),
      }, (props) => h(ConfigPage, { ...props, ctx, t, codexApi, toolsApi })));

      // 插件页 → dsh-paihuo 的 paihuo 行：Configure 打开同一个表单。
      ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
        name: 'plugins.row.config',
        key: CONFIG_KEY,
        locale: NS,
      }, (props) => h(ConfigPage, { ...props, ctx, t, codexApi, toolsApi })));
    }

    return { inject, apply };
  },
});
