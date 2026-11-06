# 派活（dsh-paihuo）

给 DeepSeek Harness 增加「经理—工程师」模式：当前会话当**经理**，只负责沟通、拆解、派发与验收；真正干活的是插件自动创建的**工程师**会话，或直接调用的本机 Codex CLI 子代理。

**[English](README.en.md)** | 简体中文

- **经理不阻塞**：派发工具立即返回，本轮直接结束，用户可以接着说下一个需求。
- **待办强制核对**：每轮结束前若没有查看/修改待办，系统会在同一轮内强制提醒经理先 `list`、对照真实任务状态修正，再结束；避免回复用户时清单已经过期。
- **经理不动手**：预制预设只挂只读工具，插件再用工具守卫兜底；改文件、跑构建一律交给工程师。
- **工程师并行**：受工位、单工程师排队、全局串行资源三层约束，前端测试不会互抢浏览器；同一项目的主工作区任务（合并、发布、改文档）自动互斥。
- **独立 worktree**：每个工程师一个分支，改动隔离；验收后用 `paihuo_integrate` 合回基线分支并跑测试。
- **Codex 子代理模式**：把执行者后端切换为 `codex` 后，插件直接调用本机 Codex CLI 执行任务；同一 Codex 会话可以复用、追加消息。经理会话右上角有 🤖 入口，可查看每个 Codex 子代理的会话内容。
- **角色可见**：会话列表按角色着色（经理蓝底白字、工程师黄底黑字），回报在聊天里显示为「📋 派活回报」卡片。
- **问题表**：经理提问默认 1 秒后转入右上角「问题表」，红圈数字是待回答的问题数；用户点开弹窗回答，经理继续处理该任务。
- **待办事项**：经理用 `paihuo_todo` 添加/开始/暂停/恢复/修改/完成待办，入口与进度显示在会话右上角，跨轮次与刷新保留。
- **配置页**：Settings → 派活，或插件页 `paihuo` 行的「配置」，保存即生效，无需重启。

## 安装

```
plugin_manager install_bundle { target: "D:\\Workspace\\myworks\\dsh-work-assigner" }
```

装好后刷新页面，新会话的「Agent 预设」里会出现**派活模式**。

## 使用

| 入口 | 作用 |
|---|---|
| 新会话 → Agent 预设 → **派活模式** | 直接创建经理会话（推荐） |
| `/paihuo on` | 把当前会话切换为经理 |
| `/paihuo off` | 退出；有未完成任务会被拒绝 |
| `/paihuo off force` | 强制退出并取消未完成任务 |
| `/paihuo status` | 查看角色、工位占用、工程师与任务数 |

由预设创建的会话，`/paihuo off` 会切回默认预设（默认 `standard`）；用命令进入的会话只移除经理作用域。会话中途切预设同样生效。

### 经理怎么工作

1. 用 1–3 句总结目标与验收条件。
2. 调用 `paihuo_dispatch` 派发，默认每次新建工程师；同一条工作线的后续才复用。**开发与测试必须用不同工程师**。
3. 工具返回「已开工 / 排队第 N 位」，简短告知用户即可，本轮结束。
4. 工程师完成后，经理收到以「【派活系统回报｜不是用户消息】」开头、以「【派活系统回报结束】」结尾的消息。
5. 验收报告与分支，需要合并时用 `paihuo_integrate` 合入用户下发任务时所处的分支（或 `target_branch`）。
6. 某个工程师不再需要时，用 `paihuo_release` 把它恢复成普通会话。
7. 需要用户确认/选择/补充信息时用 `ask_user_question`。经理预设是 timed 模式，默认 1 秒后把问题转入右上角**问题表**，经理本轮不被长时间阻塞；只有没有答案就绝不能继续时才传 `timeout: -1`。
8. 多步骤工作先用 `paihuo_todo` 建**待办**，开始/暂停/恢复/完成都通过同一个工具维护；右上角「待办」入口展示当前清单。每轮结束前若没有查看/修改待办，系统会注入 `【派活系统提醒】`，收到后先 `list`、对照 `paihuo_tasks` / `paihuo_engineers` 修正，再结束本轮。最多提醒 2 次，避免死循环。

用户**不要**在工程师会话里对话；那是执行现场，点开只能看进度。

### 问题表与待办

- **问题表**：经理会话右上角的 💬 图标，红圈数字是 `userQuestions` 投影里仍未回答的问题数。弹窗按提问批次分组，可选预设选项、填写自定义答案或跳过；提交后由 Host 把回答作为 `answer_to_pending_question` 用户消息送回经理会话。仍在等待前台回答（`open`）的问题可以直接打开 DSH 自带的问答面板。
- **待办**：经理会话右上角的 🗒️ 图标，数字是未完成待办数。经理通过 `paihuo_todo` 维护；状态为 `pending`（待办）、`in_progress`（进行中）、`paused`（暂停）、`completed`（已完成）。面板是只读的，按状态分组，已完成项可折叠。待办按经理会话隔离，页面刷新与插件重载后保留；`/paihuo off` 后入口隐藏，再进入经理模式仍可见。
- **强制核对**：每个经理轮次结束前，如果本轮没有一次成功的 `paihuo_todo` 调用，插件会通过 `agent/turn-stopping` 在同一轮内注入 `【派活系统提醒】`，要求经理先 `list`、再按真实任务状态更新；最多提醒 2 次，之后放行并记录 warning。第一次回复已经发出，核对后的补充回复会追加在同一轮里。

### worktree 规则

- **建（默认）**：会改代码/文档、多个工程师并行改同一批文件、需要独立跑构建测试。
- **不建（需给 `worktree_reason`）**：只读分析、必须读取主工作区未提交改动、必须在主工作区跑集成测试或部署。
- **复用工程师**：`worktree` 参数对复用无效，任务沿用该工程师现有工作目录；回执会写明实际是独立 worktree 还是主工作区，不会再出现“回执说建了 worktree、实际在主工作区”的误报。
- **主工作区互斥**：同一项目里 `worktree=false` 的任务（合并、发布、改文档）同一时刻只跑一个；第二个排队并在回执里说明被哪个任务占用。独立 worktree 任务不受影响，仍可并行。
- `config.worktree=false` 是总开关；创建失败会写进派发回执，不再静默退回。

### 工程师怎么工作

工程师会话带 `👷` 前缀，收到一条自包含的任务消息（目标、目录、验收、测试要求），在权限范围内执行，结束时**必须**调用 `paihuo_report` 汇报结果。有独立 worktree 时，只在自己的 worktree 目录里操作，改动只提交到自己的分支。

空闲工程师（上一个任务已经结束）收到 `paihuo_message` 时没有任务号，调不了 `paihuo_report`；插件会在这一轮结束时把最后一条回复以「【派活系统补充回复】」回报给经理，不会出现“经理一直在等、工程师其实早就干完了”。

### Codex 子代理模式

默认执行后端是会话工程师（`engineerBackend: "session"`）。把 Settings → 派活 → **执行者后端**切到「Codex CLI」，或直接配置 `engineerBackend: "codex"`，插件就会直接调用本机 `codex` 命令执行任务。

**前置条件**

- 本机安装并登录 Codex CLI：`codex --version` 可用，`codex exec resume --help` 能正常输出。
- 默认命令是 `codex`；也可以用 `codexCommand` 指定绝对路径或包装器。
- Codex 的审批与沙箱由本插件的 `codexSandbox` / `codexBypassApprovals` 和 Codex 原生配置决定，**不会**自动继承经理的权限预设。
- 模型可以在配置页从 `codex debug models` 当前返回的列表里选择，也可以留空使用 Codex 原生默认；`codexModel` 用于固定。
- 思考强度同样在配置页选择：列表来自所选模型的 `supported_reasoning_levels`，留空使用模型默认；`codexReasoningEffort` 用于固定。

```yaml
- id: paihuo
  name: dsh-paihuo
  config:
    engineerBackend: codex
    codexCommand: codex
    codexModel: gpt-6.1-sol    # 可留空；配置页会从 codex debug models 读取
    codexReasoningEffort: high # 可留空；配置页按模型支持的档位显示
    codexSandbox: workspace-write
    codexBypassApprovals: false
```

**行为**

- 首轮执行 `codex exec --json`，保存返回的 `thread_id`；同一工程师再次派发或追加消息时用 `codex exec resume <thread_id>` 续接同一 Codex 会话。
- 可以复用：`paihuo_dispatch` 传 `engineer` 或 `reuse: "auto"`；开发与测试仍然必须用不同工程师。
- 运行中的任务可以用 `paihuo_message`：
  - `queue`：当前 Codex 轮次结束后，在同一会话里追加一轮；
  - `steer`：中断当前 CLI 进程，然后用同一会话续接这条消息（若会话无法恢复会报告失败）。
- 空闲 Codex 工程师收到 `paihuo_message` 时直接续接一轮；回复以「【派活系统补充回复】」回到经理会话。
- `paihuo_release` 可以把空闲 Codex 工程师移出插件；Codex 原生会话文件仍保留在磁盘。
- 工位、排队、`priority: "urgent"`、串行资源、主工作区互斥、worktree 仍然生效。worktree 任务完成后 Codex 必须把改动提交到自己的分支，否则任务会报告阻塞。
- `paihuo_integrate` 在 Codex 模式下也交给 Codex 工程师，在主工作区合并并跑测试。

### 和 IM 一起用

经理会话可以绑到 IM 私聊（QQ / 飞书 / 微信…）。IM 插件只回传「从聊天里发起的那一轮」，而工程师汇报、补充回复是派活插件注入的消息；不处理的话，你在 QQ 里只能看到自己说的话，看不到经理的反应。

派活会把这类回合的最终回复补发到该会话绑定的聊天：

- 触发范围：由「【派活系统回报】」或「【派活系统补充回复】」引起的回合；记忆整理（dream）、定时任务等其它注入回合不会补发，避免把内部工作刷进聊天。
- 发送内容：经理这一轮的最终回复，前面加 `【派活 · 经理】` 标记，按 Markdown 发送。
- 依赖 dsh-im ≥ 5.9（提供 `describeConversation`）且该会话已经绑定 IM 聊天；不满足时静默跳过（`imRelay: false` 可显式关闭），其它功能不受影响。
- 如果同时打开 dsh-im 自己的「投递模型回答」，同一轮回复可能收到两条；两个开关选一个即可。

### 🤖 Codex 子代理菜单

Codex 模式下，经理会话右上角会出现 🤖 入口：

- 列出该经理名下所有 Codex 工程师：运行中/空闲、当前任务、模型、项目、worktree 分支、Codex session id。
- 点选会话后显示任务/经理补充、Codex 回复、命令与截断输出、错误；回复按 Markdown 渲染。
- 命令默认折叠，展开后看完整命令和输出；打开会话时从顶部开始，不截断首行。
- 运行中的会话约每 0.5 秒更新；新回复会渐进呈现。视图停在底部时自动跟随，滚离底部后保持位置，并可用「↓」回到最新。
- 只读展示，不提供发送消息或取消操作。
- 数据来自插件捕获的 `codex exec --json` 事件，不包含 Codex 内部推理；命令输出可通过 `codexTranscriptOutput: false` 关闭。
- 切换回会话模式后，如果还有旧 Codex 工程师记录，入口仍保留，便于查看；`paihuo_release` 后消失。

## 工具

经理（仅经理会话可见）：

| 工具 | 说明 |
|---|---|
| `paihuo_dispatch` | 派发任务；支持 `engineer`、`project_path`、`model`、`worktree`、`base_branch`、`priority:"urgent"`、`resources`（如 `["browser"]`、环境名）。Codex 模式下 `model` 是 Codex 模型 id |
| `paihuo_engineers` | 名下执行者与状态；Codex 工程师会显示 Codex session id，可复用 |
| `paihuo_tasks` / `paihuo_task` | 任务台账 / 单任务详情；`paihuo_task` 默认省略任务说明，`include_brief: true` 才返回 |
| `paihuo_message` | 给工程师追加消息；`mode:"queue"` 排到当前轮之后，`mode:"steer"` 中断/插入当前轮。空闲工程师的补充轮结束后会自动回报；Codex 模式下通过 resume 续接 |
| `paihuo_cancel` | 取消排队或运行中的任务（Codex 任务会终止 CLI 进程） |
| `paihuo_integrate` | 派执行者把已完成任务的分支合入目标分支，处理冲突并跑测试；`notes` 可写本次合并的额外核验/测试范围；Codex 模式下由 Codex 执行 |
| `paihuo_release` | 把空闲的会话工程师恢复成普通会话；Codex 工程师会被移出插件 |
| `paihuo_todo` | 维护经理待办：`action: add/update/start/pause/resume/complete/remove/clear/list`；只对经理可见；每轮未核对会被系统提醒 |

经理预设还保留了 `ask_user_question`，并使用 `mode: timed` / `timeout: 1`；内置 `todo_write` 已从经理预设移除（每轮清空且没有暂停，改由 `paihuo_todo` 承担）。

工程师：`paihuo_report`（`outcome: success | failed | blocked`，可附 `branch` / `commit`）。

Codex 模式没有 `paihuo_report`：Codex 的最终回答就是本轮报告，插件负责写入台账并唤醒经理；追加消息通过 `codex exec resume` 续接。

## 配置

| 字段 | 默认 | 含义 |
|---|---|---|
| `engineerBackend` | `session` | 执行者后端：`session`（会话工程师）或 `codex`（本机 Codex CLI） |
| `codexCommand` | `codex` | Codex CLI 命令/绝对路径 |
| `codexModel` | `null` | Codex 模型 id；留空使用 Codex 原生默认。配置页从 `codex debug models` 读取可选列表 |
| `codexReasoningEffort` | `null` | Codex 思考强度（`model_reasoning_effort`）；留空使用模型默认。配置页按所选模型支持的档位显示 |
| `codexSandbox` | `workspace-write` | Codex 首轮沙箱：`read-only` / `workspace-write` / `danger-full-access` |
| `codexBypassApprovals` | `false` | 使用 `--dangerously-bypass-approvals-and-sandbox` |
| `codexSkipGitRepoCheck` | `true` | 非 git 目录也允许运行 Codex |
| `codexTranscriptOutput` | `true` | 在 🤖 菜单里记录命令输出（截断；可关闭） |
| `engineerModels` | `[]` | 可选工程师模型（`provider/model` + 适用范围），空 = 与经理同模型；Codex 模式下不生效 |
| `workstationsPerProject` / `totalWorkstations` | `2` / `4` | 单项目 / 全局同时运行的工程师上限 |
| `maxEngineerQueue` | `6` | 单工程师排队上限，满了拒绝新任务 |
| `worktree` | `true` | 每个工程师一个 git worktree 与分支 |
| `serializedResources` | `['browser']` | 全局串行资源，同一资源同时只跑一个任务；可加入 `env127` 之类的共享环境名，发布/验证/造数任务带上同名 `resources` 即可互斥 |
| `engineerPermission` | `null` | 经理权限为 `custom` 时工程师用的兜底预设（Codex 模式不适用） |
| `imRelay` | `true` | 把经理对工程师汇报的反应补发到该会话绑定的 IM 聊天（需要 dsh-im ≥ 5.9） |
| `managerSection` / `engineerSection` | `null` | 覆盖内置提示词段 |

也可以直接写 profile 的 `cordis.patch.yml`：

```yaml
- id: paihuo
  name: dsh-paihuo
  config:
    engineerModels:
      - provider: tokenrhythm
        model: glm-5.3
        description: 长上下文，适合大型重构与跨文件改动
    workstationsPerProject: 2
    totalWorkstations: 4
    worktree: true
    serializedResources:
      - browser
      - env127
```

带 `resources: ["env127"]` 的发布、验证、造数任务会全局互斥；主工作区任务（合并/发布/改文档）另有按项目的自动互斥，不需要额外声明。

## 权限

- 工程师默认沿用与经理同名的预设（`permissionPresets`）。
- 经理为 `danger-full-access`：可派发到任何**存在**的项目目录。
- 经理为 `workspace-write` / `read-only`：只能派发到经理工作目录之内。
- 经理不能向权限更高的工程师派发；必要时自动把工程师降到经理的预设。
- Codex 模式例外：Codex 的审批与沙箱由 `codexSandbox` / `codexBypassApprovals` 和 Codex 原生配置决定，插件不会自动降级；经理的目录限制仍然生效。

## 开发与测试

```powershell
npm test    # 81 个用例：纯策略、状态、待办状态机与强制核对、主工作区互斥、补充消息回报、IM 会话路由、投影、配置、提示段/回报、Remote 声明 + 模拟 Host 集成 + Codex CLI/菜单/模型目录 + 客户端装配/语法
```

`test/harness.mjs` 搭了一个只含本插件所需服务面的假 Host，覆盖派发建工程师、任务提示词、回报唤醒经理、工位排队与释放、经理工具守卫、权限路径拦截，以及假的 Codex CLI（执行、resume、失败、取消、worktree、模型目录）。

## 已知限制

- 工程师会话被手动归档/删除时，相关任务会失败并回报经理。
- 工程师忘调 `paihuo_report` 时，用最后一条 assistant 回复兜底并标注「未显式报告」。
- 空闲工程师的补充轮如果恰好在插件重载期间结束，回复拿不到：对账时会清掉记录并回报一条「未能读取最终回复」，需要你到工程师会话里确认。
- Codex 模式直接调用本机 CLI：需要已安装并登录 Codex，且版本支持 `codex exec resume`；CLI 不可用时派发会给出明确错误。
- Codex 的 `steer` 不是真正的 stdin 中途注入：插件会终止当前 CLI 进程，再用同一会话续接消息；若会话无法恢复会报告失败。
- Codex 只把最终回答交回父会话；🤖 菜单只展示插件捕获的任务/回复/命令摘要，不包含内部推理、完整 stderr 或未截断输出。
- Codex 的模型、审批与沙箱由 `codexModel` / `codexSandbox` / `codexBypassApprovals` 和 Codex 原生配置决定；插件不提供按任务覆盖（`model` 传 Codex 模型 id 除外），也不做权限自动降级。
- Codex 会话文件会保留在磁盘；`paihuo_release` 只移除插件记录，不删除原生会话文件。
- Codex 在 worktree 里完成任务后必须提交改动；结束时仍有未提交的已跟踪改动会把任务标为阻塞，避免 `paihuo_integrate` 合入空分支。
- worktree 只在 git 仓库生效；创建失败会退回主工作区并告警；退回时仍受主工作区互斥约束。
- 待办强制核对依赖 DSH 的 `agent/turn-stopping`：旧 Host 没有该事件时不会提醒，其余功能正常。
- 强制核对发生在回复之后：第一次回复已经发出，提醒后的核对会在同一轮追加一条简短回复；连续忽略提醒最多 2 次后放行并记录 warning。核对只保证经理看到并有机会修正，不保证内容一定正确。
- 合并任务的 worktree 与分支目前不会自动删除；需要时手动清理。
- 经理工具面按白名单收窄（只读 + 记忆工具 + `paihuo_*`），Profile 级 MCP 工具（如浏览器）不会进入经理 prompt；守卫仍兜底拒绝白名单之外的调用，包括作用域安装之后才注册的工具。
- 记忆插件（meow-memory 的 `memory_*`）整族放行：记忆库在 `$DSH_HOME` 下，不属于工作区改动，所以经理可以直接 `memory_remember` / `memory_update`，空闲触发的记忆整理（dream）也能真正落库。
- 经理提示段保持静态（不含实时工位数/工程师清单/待办数），避免每一步重装配 system prompt 时击穿整段上下文缓存；实时状态用 `paihuo_engineers` / `paihuo_tasks` 查询。
- 问题表只展示 timed `ask_user_question` 产生的问题；预设改为 timed 之前的历史问题不会进入投影。`timeout: -1` 的 open 问题需要在 DSH 自带的问答面板里回答，问题表弹窗只提供打开入口。
- 待办面板当前只读，写入只走经理工具；每个经理会话最多 100 项，超限时自动清理最旧的已完成项。待办存在插件状态里，不写入会话日志，因此不会产生可重放的 `todo/write` 事件。
- 待办 Remote 依赖 DSH 的 `typert` 与 Web 客户端；不可用时工具仍工作，只是右上角面板显示不可用。

## 许可证

[MIT](LICENSE) © 2026 universe-st
