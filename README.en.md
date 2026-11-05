# Paihuo (dsh-paihuo)

A manager–engineer mode for DeepSeek Harness: the current session becomes a **manager** that only chats, plans, dispatches and reviews, while the actual work runs in **engineer** sessions created automatically by the plugin.

English | **[简体中文](README.md)**

- **Non-blocking manager**: dispatching returns immediately and the turn ends, so the user can keep talking.
- **Forced todo check**: if a manager turn ends without viewing or changing the todo list, the plugin injects a reminder in the same turn and makes the manager `list` the todos and reconcile them with the real task state before finishing.
- **The manager never does the work**: the preset only mounts read-only tools, and a tool guard enforces it. File edits and builds always go to engineers.
- **Parallel engineers**: bounded by per-project and global workstations, per-engineer queues, and globally serialized resources (so front-end tests never fight over the browser). Main-workspace tasks (merge, deploy, docs) in the same project are mutually exclusive.
- **Isolated worktrees**: one git worktree and branch per engineer; merge back with `paihuo_integrate` after review.
- **Visible roles**: sessions are color-coded in the list (manager = blue, engineer = yellow), and reports appear as a collapsible "📋 Paihuo report" card.
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

## Tools

Manager (visible only in manager sessions):

| Tool | Purpose |
|---|---|
| `paihuo_dispatch` | Dispatch a task; supports `engineer`, `project_path`, `model`, `worktree`, `base_branch`, `priority:"urgent"`, `resources` (e.g. `["browser"]`, an environment name) |
| `paihuo_engineers` | Engineers under this manager and their state |
| `paihuo_tasks` / `paihuo_task` | Task ledger / single task detail; `paihuo_task` omits the brief by default, use `include_brief: true` |
| `paihuo_message` | Send a follow-up to an engineer; `mode:"steer"` injects it into the running turn |
| `paihuo_cancel` | Cancel a queued or running task |
| `paihuo_integrate` | Dispatch an engineer to merge a finished task's branch into the target branch, resolve conflicts and run tests; `notes` appends merge-specific verification scope |
| `paihuo_release` | Return an idle engineer session to a normal session |
| `paihuo_todo` | Maintain manager todos: `action: add/update/start/pause/resume/complete/remove/clear/list`; manager-only; a turn without a check is reminded |

The manager preset also keeps `ask_user_question` with `mode: timed` / `timeout: 1`. The built-in `todo_write` is removed from that preset (it resets every turn and has no paused state), so `paihuo_todo` owns the list.

Engineer: `paihuo_report` (`outcome: success | failed | blocked`, optionally `branch` / `commit`).

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `engineerModels` | `[]` | Selectable engineer models (`provider/model` + scope); empty = same model as the manager |
| `workstationsPerProject` / `totalWorkstations` | `2` / `4` | Concurrent engineer limit per project / overall |
| `maxEngineerQueue` | `6` | Per-engineer queue limit; new tasks are rejected when full |
| `worktree` | `true` | One git worktree and branch per engineer |
| `serializedResources` | `['browser']` | Global resources held by one task at a time; add environment names such as `env127` so deploy/verify/seed tasks can serialize on that environment |
| `engineerPermission` | `null` | Fallback preset for engineers when the manager preset is `custom` |
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

## Permissions

- Engineers inherit the preset with the same name as the manager's (`permissionPresets`).
- Manager on `danger-full-access`: may dispatch to any **existing** project directory.
- Manager on `workspace-write` / `read-only`: may only dispatch inside the manager's working directory.
- A manager never dispatches to an engineer with higher permissions; the engineer is downgraded to the manager's preset if needed.

## Development and tests

```powershell
npm test    # 58 cases: pure policy, state, todo state machine and forced todo check, main-workspace lock, projection, config, prompt/report, Remote manifest + simulated host integration + client assembly/syntax
```

`test/harness.mjs` provides a fake host with just the services this plugin needs, covering engineer creation on dispatch, task prompts, report-driven manager wake-up, workstation queueing and release, the manager tool guard, and permission path blocking.

## Known limitations

- Manually archiving/deleting an engineer session fails its tasks and reports that to the manager.
- If an engineer forgets `paihuo_report`, the last assistant reply is used and marked "no explicit report".
- Worktrees only apply inside git repositories; a failed creation falls back to the main workspace with a warning and still respects the main-workspace lock.
- The forced todo check relies on DSH's `agent/turn-stopping`; on older hosts it silently does nothing and the rest of the plugin keeps working.
- The check runs after the reply: the first reply has already been sent, and the follow-up check adds a short message in the same turn. After two ignored reminders the turn is allowed to end and a warning is logged. The check guarantees the manager looks and can fix the list, not that the list is necessarily correct.
- Worktrees and branches of merged tasks are not deleted automatically; clean them up manually when needed.
- The manager tool surface is narrowed to the read-only whitelist plus `paihuo_*`, so profile-level MCP tools (e.g. browser) stay out of the manager prompt; the guard still rejects any call outside the whitelist, including tools registered after the scope is installed.
- The manager prompt section stays static (no live workstation counts, engineer list, or todo count) so re-assembling the system prompt on every step cannot invalidate the whole context cache; use `paihuo_engineers` / `paihuo_tasks` for live state.
- The question inbox only sees questions produced by timed `ask_user_question`; questions asked before the preset switched to timed mode are not in the projection. An `open` question with `timeout: -1` must be answered in the built-in question panel; the inbox only offers to open it.
- The todo panel is read-only; writes go through the manager tool. Each manager session keeps at most 100 items and automatically drops the oldest completed items when full. Todos live in plugin state rather than the session log, so no `todo/write` replay events are produced.
- The todo Remote depends on DSH's `typert` and the Web client; without it the tool still works, but the top-right panel reports that it is unavailable.

## License

[MIT](LICENSE) © 2026 universe-st
