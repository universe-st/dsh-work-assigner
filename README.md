# 派活（dsh-paihuo）

给 DeepSeek Harness 增加「经理—工程师」模式：当前会话当**经理**，只负责沟通、拆解、派发与验收；真正干活的是插件自动创建的**工程师**会话。

**[English](README.en.md)** | 简体中文

- **经理不阻塞**：派发工具立即返回，本轮直接结束，用户可以接着说下一个需求。
- **经理不动手**：预制预设只挂只读工具，插件再用工具守卫兜底；改文件、跑构建一律交给工程师。
- **工程师并行**：受工位、单工程师排队、全局串行资源三层约束，前端测试不会互抢浏览器。
- **独立 worktree**：每个工程师一个分支，改动隔离；验收后用 `paihuo_integrate` 合回基线分支并跑测试。
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
8. 多步骤工作先用 `paihuo_todo` 建**待办**，开始/暂停/恢复/完成都通过同一个工具维护；右上角「待办」入口展示当前清单。

用户**不要**在工程师会话里对话；那是执行现场，点开只能看进度。

### 问题表与待办

- **问题表**：经理会话右上角的 💬 图标，红圈数字是 `userQuestions` 投影里仍未回答的问题数。弹窗按提问批次分组，可选预设选项、填写自定义答案或跳过；提交后由 Host 把回答作为 `answer_to_pending_question` 用户消息送回经理会话。仍在等待前台回答（`open`）的问题可以直接打开 DSH 自带的问答面板。
- **待办**：经理会话右上角的 🗒️ 图标，数字是未完成待办数。经理通过 `paihuo_todo` 维护；状态为 `pending`（待办）、`in_progress`（进行中）、`paused`（暂停）、`completed`（已完成）。面板是只读的，按状态分组，已完成项可折叠。待办按经理会话隔离，页面刷新与插件重载后保留；`/paihuo off` 后入口隐藏，再进入经理模式仍可见。

### worktree 规则

- **建（默认）**：会改代码/文档、多个工程师并行改同一批文件、需要独立跑构建测试。
- **不建（需给 `worktree_reason`）**：只读分析、必须读取主工作区未提交改动、必须在主工作区跑集成测试或部署。
- `config.worktree=false` 是总开关；创建失败会写进派发回执，不再静默退回。

### 工程师怎么工作

工程师会话带 `👷` 前缀，收到一条自包含的任务消息（目标、目录、验收、测试要求），在权限范围内执行，结束时**必须**调用 `paihuo_report` 汇报结果。有独立 worktree 时，只在自己的 worktree 目录里操作，改动只提交到自己的分支。

## 工具

经理（仅经理会话可见）：

| 工具 | 说明 |
|---|---|
| `paihuo_dispatch` | 派发任务；支持 `engineer`、`project_path`、`model`、`worktree`、`base_branch`、`priority:"urgent"`、`resources:["browser"]` |
| `paihuo_engineers` | 名下工程师与状态 |
| `paihuo_tasks` / `paihuo_task` | 任务台账 / 单任务详情 |
| `paihuo_message` | 给工程师追加消息；`mode:"steer"` 立即插入当前轮 |
| `paihuo_cancel` | 取消排队或运行中的任务 |
| `paihuo_integrate` | 派工程师把已完成任务的分支合入目标分支，处理冲突并跑测试 |
| `paihuo_release` | 把空闲的工程师会话恢复成普通会话 |
| `paihuo_todo` | 维护经理待办：`action: add/update/start/pause/resume/complete/remove/clear/list`；只对经理可见 |

经理预设还保留了 `ask_user_question`，并使用 `mode: timed` / `timeout: 1`；内置 `todo_write` 已从经理预设移除（每轮清空且没有暂停，改由 `paihuo_todo` 承担）。

工程师：`paihuo_report`（`outcome: success | failed | blocked`，可附 `branch` / `commit`）。

## 配置

| 字段 | 默认 | 含义 |
|---|---|---|
| `engineerModels` | `[]` | 可选工程师模型（`provider/model` + 适用范围），空 = 与经理同模型 |
| `workstationsPerProject` / `totalWorkstations` | `2` / `4` | 单项目 / 全局同时运行的工程师上限 |
| `maxEngineerQueue` | `6` | 单工程师排队上限，满了拒绝新任务 |
| `worktree` | `true` | 每个工程师一个 git worktree 与分支 |
| `serializedResources` | `['browser']` | 全局串行资源，同一资源同时只跑一个任务 |
| `engineerPermission` | `null` | 经理权限为 `custom` 时工程师用的兜底预设 |
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
```

## 权限

- 工程师默认沿用与经理同名的预设（`permissionPresets`）。
- 经理为 `danger-full-access`：可派发到任何**存在**的项目目录。
- 经理为 `workspace-write` / `read-only`：只能派发到经理工作目录之内。
- 经理不能向权限更高的工程师派发；必要时自动把工程师降到经理的预设。

## 开发与测试

```powershell
npm test    # 46 个用例：纯策略、状态、待办状态机、投影、配置、提示段/回报、Remote 声明 + 模拟 Host 集成 + 客户端装配/语法
```

`test/harness.mjs` 搭了一个只含本插件所需服务面的假 Host，覆盖派发建工程师、任务提示词、回报唤醒经理、工位排队与释放、经理工具守卫、权限路径拦截等。

## 已知限制

- 工程师会话被手动归档/删除时，相关任务会失败并回报经理。
- 工程师忘调 `paihuo_report` 时，用最后一条 assistant 回复兜底并标注「未显式报告」。
- worktree 只在 git 仓库生效；创建失败会退回项目目录并告警。
- 经理工具面按白名单收窄（只读 + `paihuo_*`），Profile 级 MCP 工具（如浏览器）不会进入经理 prompt；守卫仍兜底拒绝白名单之外的调用，包括作用域安装之后才注册的工具。
- 经理提示段保持静态（不含实时工位数/工程师清单/待办数），避免每一步重装配 system prompt 时击穿整段上下文缓存；实时状态用 `paihuo_engineers` / `paihuo_tasks` 查询。
- 问题表只展示 timed `ask_user_question` 产生的问题；预设改为 timed 之前的历史问题不会进入投影。`timeout: -1` 的 open 问题需要在 DSH 自带的问答面板里回答，问题表弹窗只提供打开入口。
- 待办面板当前只读，写入只走经理工具；每个经理会话最多 100 项，超限时自动清理最旧的已完成项。待办存在插件状态里，不写入会话日志，因此不会产生可重放的 `todo/write` 事件。
- 待办 Remote 依赖 DSH 的 `typert` 与 Web 客户端；不可用时工具仍工作，只是右上角面板显示不可用。

## 许可证

[MIT](LICENSE) © 2026 universe-st
