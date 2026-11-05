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

    const zh = {
      'settings.title': '派活',
      'settings.summary': '经理/工程师模式、工位、模型与 worktree 配置',
      'config.intro': '经理负责沟通与派发，工程师负责执行。这里限制工程师池的规模、模型和隔离方式。',
      'config.section.staffing': '工位与并发',
      'config.section.models': '工程师模型',
      'config.section.advanced': '高级',
      'config.workstations': '每个项目同时最多',
      'config.total': '所有项目同时最多',
      'config.queue': '每个工程师排队上限',
      'config.worktree': '每个工程师使用独立 git worktree',
      'config.section.testing': '前端测试',
      'config.browser': '浏览器类任务全局串行（同一时间只跑一个）',
      'config.browser.hint': '避免多个工程师抢同一个浏览器。',
      'config.models.lead': '留空表示工程师使用经理当前的模型。',
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
      'settings.summary': 'Manager/engineer mode, workstations, models, and worktrees',
      'config.intro': 'The manager talks and delegates; engineers execute. These settings bound the engineer pool, its models, and its isolation.',
      'config.section.staffing': 'Workstations and concurrency',
      'config.section.models': 'Engineer models',
      'config.section.advanced': 'Advanced',
      'config.workstations': 'Concurrent engineers per project',
      'config.total': 'Concurrent engineers overall',
      'config.queue': 'Queue limit per engineer',
      'config.worktree': 'Give each engineer its own git worktree',
      'config.section.testing': 'Frontend testing',
      'config.browser': 'Serialize browser tasks (one at a time)',
      'config.browser.hint': 'Keeps engineers from fighting over one browser.',
      'config.models.lead': 'Empty means engineers use the manager’s current model.',
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
      ];
    }

    function parseManualModel(text) {
      const value = String(text ?? '').trim();
      const slash = value.indexOf('/');
      if (slash <= 0 || slash === value.length - 1) return undefined;
      return { provider: value.slice(0, slash).trim(), model: value.slice(slash + 1).trim(), label: value };
    }

    function ConfigPage(props) {
      const { ctx, t, view } = props;
      const { controller, snapshot, missing } = useConfigForm(ctx);
      const catalog = useModelCatalog(ctx);
      const permissionOptions = usePermissionCatalog(ctx);
      const [draft, setDraft] = React.useState(null);
      const [status, setStatus] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const [pick, setPick] = React.useState('');
      const [manual, setManual] = React.useState('');

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

      const save = () => {
        setBusy(true);
        setStatus(null);
        let ops;
        try {
          ops = buildOps(draft);
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
        }, () => {
          setBusy(false);
          setStatus({ kind: 'error', text: t('config.failed') });
        });
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

    // ── 经理右上角：问题表 / 待办 ─────────────────────────────────────────
    const remoteCodec = (typeSymbol) => ({
      mode: 'strict',
      typeSymbol,
      create: () => ({ parse: (value) => value }),
    });

    // 与 lib/remote.js 的 MANIFEST 保持一致；两边各一份，测试会校验 id。
    const TODO_CONTRIBUTION = {
      package: REMOTE_PACKAGE,
      descriptors: [{
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
      }],
    };

    /** 懒挂载待办 Remote；失败后允许下一次轮询重试。 */
    function createTodoApi(ctx) {
      let mounting = null;
      const ensure = () => {
        if (mounting !== null) return mounting;
        mounting = Promise.resolve().then(() => {
          const remote = ctx.remote ?? ctx.get?.('remote');
          if (!remote || typeof remote.$mount !== 'function') throw new Error('remote-unavailable');
          return remote.$mount(TODO_CONTRIBUTION);
        }).then(() => {
          const namespace = ctx.get?.('remote.paihuo') ?? ctx.remote?.paihuo;
          if (!namespace || typeof namespace.todos !== 'function') throw new Error('todo-remote-unavailable');
          return namespace;
        });
        mounting.catch(() => {
          mounting = null;
        });
        return mounting;
      };
      return {
        async load(managerId) {
          const namespace = await ensure();
          const result = await namespace.todos({ managerId });
          if (result === undefined || result === null || result.ok !== true) {
            throw new Error(result?.error?.message ?? 'todo-load-failed');
          }
          return result.value ?? { todos: [], counts: {} };
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
     */
    function installRowColors(ctx) {
      const sessions = ctx.get('sessions');
      let frame = 0;
      const apply = () => {
        const byId = sessions?.list?.getSnapshot?.()?.byId ?? {};
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
      const observer = new MutationObserver(schedule);
      observer.observe(document.body, { childList: true, subtree: true });
      apply();
      return () => {
        if (typeof dispose === 'function') dispose();
        observer.disconnect();
        if (frame !== 0) cancelAnimationFrame(frame);
      };
    }

    const inject = ['slots', 'locale', 'uiConversation', 'remote'];

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'paihuo: dictionaries');
      const t = ctx.locale.bind(NS);
      const todoApi = createTodoApi(ctx);

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

      // 会话列表行着色（经理蓝底白字 / 工程师黄底黑字）。
      ctx.effect(() => installRowColors(ctx), 'paihuo: session row colors');

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
      }, (props) => h(ConfigPage, { ...props, ctx, t })));

      // 插件页 → dsh-paihuo 的 paihuo 行：Configure 打开同一个表单。
      ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
        name: 'plugins.row.config',
        key: CONFIG_KEY,
        locale: NS,
      }, (props) => h(ConfigPage, { ...props, ctx, t })));
    }

    return { inject, apply };
  },
});
