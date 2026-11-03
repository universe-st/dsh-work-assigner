# Paihuo (dsh-paihuo)

A manager–engineer mode for DeepSeek Harness: the current session becomes a **manager** that only chats, plans, dispatches and reviews, while the actual work runs in **engineer** sessions created automatically by the plugin.

English | **[简体中文](README.md)**

- **Non-blocking manager**: dispatching returns immediately and the turn ends, so the user can keep talking.
- **The manager never does the work**: the preset only mounts read-only tools, and a tool guard enforces it. File edits and builds always go to engineers.
- **Parallel engineers**: bounded by per-project and global workstations, per-engineer queues, and globally serialized resources (so front-end tests never fight over the browser).
- **Isolated worktrees**: one git worktree and branch per engineer; merge back with `paihuo_integrate` after review.
- **Visible roles**: sessions are color-coded in the list (manager = blue, engineer = yellow), and reports appear as a collapsible "📋 Paihuo report" card.
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

Do **not** chat inside engineer sessions — they are the work site; open one only to watch progress.

### Worktree rules

- **Create (default)**: the task edits code/docs, several engineers touch the same files, or it needs its own build/test run.
- **Skip (requires `worktree_reason`)**: read-only analysis, must read uncommitted changes in the main workspace, or must run integration tests/deploy there.
- `config.worktree=false` is the global switch. A failed creation is reported in the dispatch receipt instead of silently falling back.

### How engineers work

Engineer sessions carry a `👷` prefix and receive one self-contained task message (goal, directory, acceptance, tests). They execute within their permissions and **must** call `paihuo_report` at the end. With a worktree, they stay inside their own directory and commit only to their own branch.

## Tools

Manager (visible only in manager sessions):

| Tool | Purpose |
|---|---|
| `paihuo_dispatch` | Dispatch a task; supports `engineer`, `project_path`, `model`, `worktree`, `base_branch`, `priority:"urgent"`, `resources:["browser"]` |
| `paihuo_engineers` | Engineers under this manager and their state |
| `paihuo_tasks` / `paihuo_task` | Task ledger / single task detail |
| `paihuo_message` | Send a follow-up to an engineer; `mode:"steer"` injects it into the running turn |
| `paihuo_cancel` | Cancel a queued or running task |
| `paihuo_integrate` | Dispatch an engineer to merge a finished task's branch into the target branch, resolve conflicts and run tests |
| `paihuo_release` | Return an idle engineer session to a normal session |

Engineer: `paihuo_report` (`outcome: success | failed | blocked`, optionally `branch` / `commit`).

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `engineerModels` | `[]` | Selectable engineer models (`provider/model` + scope); empty = same model as the manager |
| `workstationsPerProject` / `totalWorkstations` | `2` / `4` | Concurrent engineer limit per project / overall |
| `maxEngineerQueue` | `6` | Per-engineer queue limit; new tasks are rejected when full |
| `worktree` | `true` | One git worktree and branch per engineer |
| `serializedResources` | `['browser']` | Global resources that may be held by one task at a time |
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
```

## Permissions

- Engineers inherit the preset with the same name as the manager's (`permissionPresets`).
- Manager on `danger-full-access`: may dispatch to any **existing** project directory.
- Manager on `workspace-write` / `read-only`: may only dispatch inside the manager's working directory.
- A manager never dispatches to an engineer with higher permissions; the engineer is downgraded to the manager's preset if needed.

## Development and tests

```powershell
npm test    # 31 cases: pure policy, state, projection, config + simulated host integration
```

`test/harness.mjs` provides a fake host with just the services this plugin needs, covering engineer creation on dispatch, task prompts, report-driven manager wake-up, workstation queueing and release, the manager tool guard, and permission path blocking.

## Known limitations

- Manually archiving/deleting an engineer session fails its tasks and reports that to the manager.
- If an engineer forgets `paihuo_report`, the last assistant reply is used and marked "no explicit report".
- Worktrees only apply inside git repositories; a failed creation falls back to the project directory with a warning.
- The manager guard allows only read-only tools and `paihuo_*`; sessions entered via `/paihuo on` still list write tools, but calls to them are rejected.

## License

[MIT](LICENSE) © 2026 universe-st
