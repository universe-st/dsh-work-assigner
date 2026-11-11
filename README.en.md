# Paihuo (dsh-paihuo)

A manager–engineer mode for DeepSeek Harness: the current session becomes a **manager** that only chats, plans, dispatches and reviews, while the actual work runs in **engineer** sessions created automatically by the plugin or in local Codex CLI subagents.

English | **[简体中文](README.md)**

- **Non-blocking manager**: dispatching returns immediately and the turn ends, so the user can keep talking.
- **Forced todo check**: if a manager turn ends without viewing or changing the todo list, the plugin injects a reminder in the same turn and makes the manager `list` the todos and reconcile them with the real task state before finishing.
- **The manager never does the work**: the preset only mounts read-only tools, and a tool guard enforces it. File edits and builds always go to engineers.
- **Parallel engineers**: bounded by per-project and global workstations, per-engineer queues, and globally serialized resources (so front-end tests never fight over the browser). Main-workspace tasks (merge, deploy, docs) in the same project are mutually exclusive.
- **Isolated worktrees**: one git worktree and branch per engineer; merge back with `paihuo_integrate` after review.
- **Codex subagent mode**: switch the executor backend to `codex` and the plugin calls the local Codex CLI directly; the same Codex session can be reused and messaged. A 🤖 entry in the manager header shows each Codex subagent's session content.
- **Visible roles**: sessions are color-coded in the list (manager = blue, engineer = yellow), and reports appear as a collapsible "📋 Paihuo report" card. While any of its engineers are working, the manager row shows a spinning LOADING icon.
- **Question inbox**: manager questions become non-blocking after one second and move to a top-right inbox with a red count badge; answering in the popup resumes the manager's task.
- **Todos**: the manager maintains a persistent list with add/start/pause/resume/update/complete actions; the top-right panel shows the list and survives turns and reloads.
- **Settings page**: Settings → Paihuo, or the "Configure" action on the `paihuo` row in the plugin page. Saved changes apply immediately, no restart.

## Install

```
plugin_manager install_bundle { target: "D:\\Workspace\\myworks\\dsh-work-assigner" }
```

Refresh the page afterwards; **Paihuo mode** then shows up in the Agent preset picker for new sessions.

## Usage

| Entry | Effect |
|---|---|
| New session → Agent preset → **Paihuo mode** | Creates a manager session (recommended) |
| `/paihuo on` | Turn the current session into a manager |
| `/paihuo off` | Leave; refused while tasks are unfinished |
| `/paihuo off force` | Leave and cancel unfinished tasks |
| `/paihuo status` | Role, workstation usage, engineers and task counts |

A session created from the preset switches back to the default preset (normally `standard`) on exit; a session entered via the command only loses the manager scope. Switching presets mid-session works too.

### How the manager works

1. Summarize the goal and acceptance criteria in 1–3 sentences.
2. Call `paihuo_dispatch`, which creates a new engineer by default; reuse only for a follow-up on the same line of work. **Development and testing must use different engineers.**
3. The tool returns "started / queued at position N"; tell the user briefly and end the turn.
4. When an engineer finishes, the manager receives a message wrapped in "【Paihuo system report — not a user message】" … "【end of Paihuo report】".
5. Review the report and branch, then use `paihuo_integrate` to merge into the branch that was checked out when the task was dispatched (or `target_branch`).
6. Use `paihuo_release` to turn an engineer session back into a normal session once it is no longer needed.
7. When you need a confirmation, choice, or missing detail, use `ask_user_question`. The manager preset runs in timed mode: after one second the question moves to the top-right **question inbox**, so the manager turn does not stay blocked. Pass `timeout: -1` only when nothing can proceed without the answer.
8. For multi-step work, create **todos** with `paihuo_todo`; start/pause/resume/complete them through the same tool. The top-right todo entry shows the current list. If a turn ends without touching the todo list, the plugin injects a "【Paihuo system reminder】"; call `list`, reconcile with `paihuo_tasks` / `paihuo_engineers`, then end the turn. At most two reminders per turn.

Do **not** chat inside engineer sessions — they are the work site; open one only to watch progress.

### User images travel with the task

The manager only talks; the engineer is the one who has to match the screenshot. Images sent in chat are forwarded with the task:

- Default `images: "auto"`: images from the **current user turn or the two before it** go with the task, so a screenshot survives a round of clarification questions before dispatch.
- Pass `images: "none"` when the image is unrelated to this task (for example, the user only wanted the manager to look at it). Older images outside the window are not forwarded automatically; the receipt says how many were held back, and `images: "latest"` re-dispatches with the most recent image when it really is the relevant one.
- Session engineers receive native DSH image blocks (the same thing a user upload would produce). Codex engineers receive `codex exec -i <file>`: the plugin copies the content-addressed attachment into a temp file with a real extension and removes it when the task ends. When the Codex model catalog (`input_modalities` from `codex debug models`) says the model is text-only, images are skipped and the task still runs.
- If the engineer model does not accept image input, the task still runs: the plugin retries with the text-only task and adds a note that N images were not delivered, so the engineer can continue from text or report the blocker. The dispatch receipt and `paihuo_task` show it too.
- Only attachment references are stored in the task ledger; a queued task resolves them when it starts, so image bytes never bloat the persisted state.

### Question inbox and todos

- **Question inbox**: the 💬 entry in the manager header. The red count is the number of unanswered questions in the `userQuestions` projection. The popup groups questions by call and supports preset options, custom answers, and explicit skips; submitting sends the answer back to the manager as an `answer_to_pending_question` user message. Questions still waiting in the foreground (`open`) can be opened in the built-in question panel.
- **Todos**: the 🗒️ entry in the manager header. The count is the number of open todos. The manager maintains them with `paihuo_todo`; statuses are `pending`, `in_progress`, `paused`, and `completed`. The panel is read-only and grouped by status, with completed items collapsible. Todos are per manager session, survive page reloads and plugin reloads, and stay hidden while the session is not a manager; re-entering manager mode brings them back.
- **Forced check**: if a manager turn ends without a successful `paihuo_todo` call, the plugin uses `agent/turn-stopping` to inject a "【Paihuo system reminder】" in the same turn, asking the manager to list and reconcile the todos. At most two reminders per turn, then the turn is allowed to end with a warning. The first reply has already been sent; the follow-up appears in the same turn.

### Worktree rules

- **Create (default)**: the task edits code/docs, several engineers touch the same files, or it needs its own build/test run.
- **Skip (requires `worktree_reason`)**: read-only analysis, must read uncommitted changes in the main workspace, or must run integration tests/deploy there.
- **Reusing an engineer**: `worktree` is ignored on reuse; the task inherits that engineer's existing directory. The receipt states the actual workspace, so it no longer claims a worktree that was never created.
- **Main-workspace lock**: in one project, only one `worktree:false` task (merge, deploy, docs) runs at a time; the next one queues and the receipt names the blocking task. Worktree tasks stay parallel.
- `config.worktree=false` is the global switch. A failed creation is reported in the dispatch receipt instead of silently falling back.

### How engineers work

Engineer sessions carry a `👷` prefix and receive one self-contained task message (goal, directory, acceptance, tests). They execute within their permissions and **must** call `paihuo_report` at the end. With a worktree, they stay inside their own directory and commit only to their own branch.

An idle engineer (its last task already finished) has no task id, so it cannot call `paihuo_report` for a `paihuo_message` follow-up. The plugin reports the engineer's last reply back to the manager as a “【Paihuo supplement】” message when that turn ends, so the manager never waits on work that already finished.

### Codex subagent mode

The default executor backend is a session engineer (`engineerBackend: "session"`). Switch Settings → Paihuo → **Executor backend** to “Codex CLI”, or set `engineerBackend: "codex"`, and the plugin invokes the local `codex` command directly.

**Prerequisites**

- Codex CLI is installed and logged in: `codex --version` works and `codex exec resume --help` prints usage.
- The command defaults to `codex`; `codexCommand` can point at an absolute path or wrapper.
- Codex approvals and sandbox are controlled by `codexSandbox` / `codexBypassApprovals` and Codex native config. They do **not** inherit the manager's permission preset.
- The model can be selected in Settings from the live `codex debug models` list, or left empty for the Codex native default; `codexModel` fixes it.
- Reasoning effort is selected next to the model: choices come from that model's `supported_reasoning_levels`; empty uses the model default, and `codexReasoningEffort` fixes it.

```yaml
- id: paihuo
  name: dsh-paihuo
  config:
    engineerBackend: codex
    codexCommand: codex
    codexModel: gpt-6.1-sol        # optional; the config page reads codex debug models
    codexReasoningEffort: high     # optional; the config page lists the model's levels
    codexSandbox: workspace-write
    codexBypassApprovals: false
```

**Behavior**

- The first run uses `codex exec --json` and stores the returned `thread_id`; further tasks or messages for the same engineer use `codex exec resume <thread_id>`.
- Reuse works: pass `engineer` or `reuse: "auto"` to `paihuo_dispatch`. Development and testing still need different engineers.
- `paihuo_message` on a running task:
  - `queue`: after the current Codex turn, append another turn in the same session;
  - `steer`: terminate the current CLI process and resume the same session with the message (failure is reported if the session cannot be resumed).
- An idle Codex engineer accepts `paihuo_message` and runs a supplementary turn; the reply comes back as a “【Paihuo supplement】” message.
- `paihuo_release` removes an idle Codex engineer from the plugin; the native Codex session file remains on disk.
- Workstations, queues, `priority: "urgent"`, serialized resources, the main-workspace lock and worktrees still apply. In a worktree task, Codex must commit its changes to its branch; otherwise the task is reported as blocked.
- `paihuo_integrate` also uses a Codex engineer in this mode, merging in the main workspace and running tests.

### Using it with IM

A manager session can be bound to an IM private chat (QQ / Feishu / WeChat…). The IM plugin only echoes back the turn that started in that chat, while engineer reports and supplements are messages injected by this plugin. Without extra handling you would only see your own messages in QQ, never the manager's reaction.

Paihuo relays the final reply of those turns to the chat bound to the session:

- Scope: turns started by “【Paihuo report】” or “【Paihuo supplement】”; memory-dream and scheduled turns are not relayed, so internal work never leaks into the chat.
- Content: the manager's final reply for that turn, prefixed with `【派活 · 经理】` and sent as Markdown.
- Requires dsh-im ≥ 5.9 (which provides `describeConversation`) and a session already bound to an IM chat. Otherwise it skips silently (`imRelay: false` turns it off explicitly) and everything else keeps working.
- If dsh-im's own "deliver model answers" switch is also on, one turn may arrive twice; keep only one of the two switches.

**Images and files**: when the user asks in IM (“send me the APK”), that turn started in the chat, so the manager can register the path with dsh-im's `dsh_im_return_file` (and read group history/files with `dsh_im_group_history` / `dsh_im_group_file`); the channel uploads it after the turn. A turn started from the DSH Web UI has no IM upload path and the tool reports an explicit error — ask again from the chat. The manager surface allow- and deny-lists plus the guard now pass the whole `dsh_im_` prefix.

### 🤖 Codex subagent menu

In Codex mode, the manager header gains a 🤖 entry:

- It lists the manager's Codex engineers: running/idle, current task, model, project, worktree branch and Codex session id.
- Selecting one shows tasks/manager notes, Codex replies, commands with full output, and errors; replies are rendered as Markdown. Transcripts are never truncated: entries, text and command output are kept verbatim.
- Commands are collapsed by default; expand one to see the full command and output. A session opens at the top without clipping the first line.
- Running sessions update about every 0.5s and new replies are revealed progressively. The view follows the bottom while it is pinned there, stays put when scrolled away, and offers a “↓” button to jump back.
- The panel is read-only and offers no messaging or cancellation controls.
- Data comes from the `codex exec --json` events captured by this plugin, not Codex internal reasoning. Command output can be disabled with `codexTranscriptOutput: false`.
- After switching back to session mode, the entry remains while old Codex engineer records exist and disappears after `paihuo_release`.

## Tools

Manager (visible only in manager sessions):

| Tool | Purpose |
|---|---|
| `paihuo_dispatch` | Dispatch a task; supports `engineer`, `project_path`, `model`, `worktree`, `base_branch`, `priority:"urgent"`, `resources` (e.g. `["browser"]`, an environment name), and `images` (forward the user's recent images with the task; `"none"` disables it). In Codex mode `model` is a Codex model id |
| `paihuo_engineers` | Executors under this manager and their state; Codex engineers show their Codex session id and are reusable |
| `paihuo_tasks` / `paihuo_task` | Task ledger / single task detail; `paihuo_task` omits the brief by default, use `include_brief: true` |
| `paihuo_transcript` | Recent conversation and commands of one engineer, for judging what it is doing and whether it is stuck: session events for session engineers, CLI transcripts for Codex. Pass `engineer` or `task_id`; `limit` defaults to 12, `include_tools: false` hides tool activity |
| `paihuo_message` | Send a follow-up to an engineer; `mode:"queue"` runs after the current turn, `mode:"steer"` interrupts/inserts into it. An idle engineer's supplementary turn reports back automatically; Codex mode resumes the same session |
| `paihuo_cancel` | Cancel a queued or running task (Codex tasks terminate the CLI process) |
| `paihuo_integrate` | Dispatch an executor to merge a finished task's branch into the target branch, resolve conflicts and run tests; `notes` appends merge-specific verification scope; in Codex mode Codex performs the merge |
| `paihuo_release` | Return an idle session engineer to a normal session; Codex engineers are removed from the plugin |
| `paihuo_todo` | Maintain manager todos: `action: add/update/start/pause/resume/complete/remove/clear/list`; manager-only; a turn without a check is reminded |

The manager preset also keeps `ask_user_question` with `mode: timed` / `timeout: 1`. The built-in `todo_write` is removed from that preset (it resets every turn and has no paused state), so `paihuo_todo` owns the list.

Engineer: `paihuo_report` (`outcome: success | failed | blocked`, optionally `branch` / `commit`).

Codex mode has no `paihuo_report`: Codex's final answer is the report; the plugin records it and wakes the manager, and `paihuo_message` resumes the same session.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `engineerBackend` | `session` | Executor backend: `session` (session engineer) or `codex` (local Codex CLI) |
| `codexCommand` | `codex` | Codex CLI command/absolute path |
| `codexModel` | `null` | Codex model id; empty uses the Codex native default. The config page reads choices from `codex debug models` |
| `codexReasoningEffort` | `null` | Codex reasoning effort (`model_reasoning_effort`); empty uses the model default. The config page lists levels supported by the selected model |
| `codexSandbox` | `workspace-write` | Codex sandbox for the first run: `read-only` / `workspace-write` / `danger-full-access` |
| `codexBypassApprovals` | `false` | Use `--dangerously-bypass-approvals-and-sandbox` |
| `codexSkipGitRepoCheck` | `true` | Allow Codex outside a git repository |
| `codexTranscriptOutput` | `true` | Record command output in the 🤖 menu (full; may be disabled) |
| `engineerModels` | `[]` | Selectable engineer models (`provider/model` + scope); empty = same model as the manager; ignored in Codex mode |
| `workstationsPerProject` / `totalWorkstations` | `2` / `4` | Concurrent engineer limit per project / overall |
| `maxEngineerQueue` | `6` | Per-engineer queue limit; new tasks are rejected when full |
| `worktree` | `true` | One git worktree and branch per engineer |
| `serializedResources` | `['browser']` | Global resources held by one task at a time; add environment names such as `env127` so deploy/verify/seed tasks can serialize on that environment |
| `engineerPermission` | `null` | Fallback preset for engineers when the manager preset is `custom` (not used in Codex mode) |
| `managerExtraTools` | `[]` | Tool names allowed beyond the default families (including third-party MCP); tick them under Settings → Paihuo → “Manager tools” |
| `managerDeniedTools` | `[]` | Default tools removed from the manager surface (e.g. `web_fetch`). `paihuo_*` tools are always available |
| `imRelay` | `true` | Relay the manager's reaction to engineer reports into the IM chat bound to that session (requires dsh-im ≥ 5.9) |
| `managerSection` / `engineerSection` | `null` | Override the built-in prompt sections |

You can also edit the profile's `cordis.patch.yml` directly:

```yaml
- id: paihuo
  name: dsh-paihuo
  config:
    engineerModels:
      - provider: tokenrhythm
        model: glm-5.3
        description: Long context, good for large refactors and cross-file changes
    workstationsPerProject: 2
    totalWorkstations: 4
    worktree: true
    serializedResources:
      - browser
      - env127
```

Tasks carrying `resources: ["env127"]` serialize globally; main-workspace tasks (merge/deploy/docs) are additionally serialized per project without any extra declaration.

## Manager tools

The manager sees read-only tools, memory tools (`memory_*`) and IM tools (`dsh_im_*`) by default. Open Settings → Paihuo → “Manager tools” for a standalone window listing **every available tool** (third-party MCP included, plus the tools inherited by the current manager session); tick to allow, untick to disable:

- Unticking a default family (read-only / memory / IM) writes `managerDeniedTools`; ticking any other tool writes `managerExtraTools`.
- Paihuo tools (`paihuo_*`) are always mounted and cannot be disabled; putting them in either config field is rejected.
- Saving rebuilds existing manager scopes immediately — no new session needed; both the `tools.restrict` allow/deny lists and the tool guard follow the new config.
- Only the inherited surface is affected; tools registered inside the manager scope (`paihuo_*`) are untouched. A tool missing from the list was not registered globally or on the preset ancestors.

## Permissions

- Engineers inherit the preset with the same name as the manager's (`permissionPresets`).
- Manager on `danger-full-access`: may dispatch to any **existing** project directory.
- Manager on `workspace-write` / `read-only`: may only dispatch inside the manager's working directory.
- A manager never dispatches to an engineer with higher permissions; the engineer is downgraded to the manager's preset if needed.
- Codex mode is different: approvals and sandbox are controlled by `codexSandbox` / `codexBypassApprovals` and Codex native config, and the plugin does not downgrade them automatically. The manager's directory restriction still applies.

## Development and tests

```powershell
npm test    # 116 cases: pure policy, state, todo state machine and forced todo check, main-workspace lock, supplement reports, IM chat routing, projection, config, prompt/report, user-image forwarding (session / Codex), Remote manifest + simulated host integration + Codex CLI/menu/model catalog + user-image modality checks + client assembly/syntax/engineer activity
```

`test/harness.mjs` provides a fake host with just the services this plugin needs, covering engineer creation on dispatch, task prompts, report-driven manager wake-up, workstation queueing and release, the manager tool guard, permission path blocking, a fake Codex CLI (exec, resume, images via `-i`, failure, cancellation, worktree, model catalog), and user-image forwarding.

## Known limitations

- Manually archiving/deleting an engineer session fails its tasks and reports that to the manager.
- User images travel only with `paihuo_dispatch`; `paihuo_message` remains text-only. When the image is unrelated or the engineer model rejects image input, the task still runs and the receipt says the images were not delivered.
- If an engineer forgets `paihuo_report`, the last assistant reply is used and marked "no explicit report".
- Codex mode calls the local CLI: Codex must be installed and logged in, and the version must support `codex exec resume`; dispatch reports a clear error when it is unavailable.
- Codex `steer` is not true stdin injection: the plugin terminates the current CLI process and resumes the same session with the message; failure is reported if the session cannot be resumed.
- Codex only returns its final answer. The 🤖 menu shows the tasks/replies/commands and output captured by this plugin, not internal reasoning or full stderr. Transcripts are not truncated, so long sessions grow local storage.
- Codex's model, approvals and sandbox come from `codexModel` / `codexSandbox` / `codexBypassApprovals` and Codex native config; the plugin offers no per-task sandbox override (apart from `model` as a Codex model id) and no automatic permission downgrades.
- Codex session files remain on disk; `paihuo_release` only removes the plugin record, not the native session file.
- A Codex worktree task must commit its changes; tracked uncommitted changes at the end mark the task blocked so `paihuo_integrate` cannot merge an empty branch.
- Worktrees only apply inside git repositories; a failed creation falls back to the main workspace with a warning and still respects the main-workspace lock.
- The forced todo check relies on DSH's `agent/turn-stopping`; on older hosts it silently does nothing and the rest of the plugin keeps working.
- The check runs after the reply: the first reply has already been sent, and the follow-up check adds a short message in the same turn. After two ignored reminders the turn is allowed to end and a warning is logged. The check guarantees the manager looks and can fix the list, not that the list is necessarily correct.
- Worktrees and branches of merged tasks are not deleted automatically; clean them up manually when needed.
- The manager tool surface is narrowed to the read-only + memory (`memory_*`) + IM (`dsh_im_*`) whitelist plus `paihuo_*`, so profile-level MCP tools (e.g. browser) stay out of the manager prompt; the guard still rejects any call outside the whitelist, including tools registered after the scope is installed.
- The whole `memory_*` family from the meow-memory plugin is allowed: the memory database lives under `$DSH_HOME` and is not a workspace change, so the manager can call `memory_remember` / `memory_update` directly and idle-triggered dream consolidation actually persists.
- The manager prompt section stays static (no live workstation counts, engineer list, or todo count) so re-assembling the system prompt on every step cannot invalidate the whole context cache; use `paihuo_engineers` / `paihuo_tasks` for live state.
- The question inbox only sees questions produced by timed `ask_user_question`; questions asked before the preset switched to timed mode are not in the projection. An `open` question with `timeout: -1` must be answered in the built-in question panel; the inbox only offers to open it.
- The todo panel is read-only; writes go through the manager tool. Each manager session keeps at most 100 items and automatically drops the oldest completed items when full. Todos live in plugin state rather than the session log, so no `todo/write` replay events are produced.
- The todo Remote depends on DSH's `typert` and the Web client; without it the tool still works, but the top-right panel reports that it is unavailable.
- The engineer-activity Remote uses the same `typert` path: without it the manager row simply omits the LOADING animation; dispatching and reports are unaffected.

## License

[MIT](LICENSE) © 2026 universe-st
