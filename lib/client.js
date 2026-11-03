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
    const h = React.createElement;

    const NS = 'paihuo';
    const ENTRY_ID = 'paihuo';
    const CONFIG_KEY = 'dsh-paihuo#paihuo';

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

    // ── 派活回报卡片 ─────────────────────────────────────────────────────
    const REPORT_START = '【派活系统回报';
    const REPORT_END = '【派活系统回报结束】';

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

    const inject = ['slots', 'locale', 'uiConversation'];

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'paihuo: dictionaries');
      const t = ctx.locale.bind(NS);

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
