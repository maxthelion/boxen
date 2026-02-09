# Status Script Improvements

**Source:** Postmortem from agent that went off-rails investigating task e3f4d10f, plus review of TASK-78d13276 output.

## Problem

The status script is the single entry point for all orchestrator investigation (per `.claude/rules/orchestration.md`). When it gives misleading or incomplete information, agents lose their footing and fall back to manual investigation — which is where things go wrong.

## Issues Identified

### 1. Orchestrator tasks show misleading worktree state

The worktree section reports commits/diffs for the main repo only. For `orchestrator_impl` tasks, the real work happens on the `main` branch inside the `orchestrator/` submodule. This means:

- "0 commits ahead of main" when there are actually commits in the submodule
- Unstaged changes show the submodule ref diff, not the actual code changes
- No visibility into what the orchestrator specialist agent actually did

**Fix:** When a worktree is assigned to an `orchestrator_impl` task, also check `orchestrator/` submodule state within that worktree — show the submodule branch, commit count, and recent commit messages.

### 2. Task titles not shown in queue listing

The queue section shows task IDs but not titles/subjects. This makes it hard to quickly scan what's in the queue without cross-referencing elsewhere. For example:

```
P2 78d13276  78d13276  (orchestrator_impl)
```

vs what would be more useful:

```
P2 78d13276  Fix broken view-task script  (orchestrator_impl)
```

**Fix:** Include the task title in the queue listing. The title is available via `queue_utils.get_task_by_id()` (now that the view-task fix lands).

### 3. Provisional tasks not clearly distinguished from incoming

Both incoming and provisional tasks are listed but a quick scan can conflate them. Provisional means "agent finished, awaiting human review" — this is actionable for the PM. Incoming means "waiting to be claimed" — not actionable yet.

**Fix:** Add a visual indicator or count summary that highlights how many tasks are awaiting human review. Something like:

```
  awaiting review: 2 provisional tasks
```

### 4. No per-task detail command referenced

When the status overview isn't enough, the agent needs to drill into a specific task. The status script doesn't mention how to do this. The view-task script exists but wasn't discoverable.

**Fix:** Add a footer to the status output:

```
For task details: python orchestrator/scripts/view-task <task-id>
```

## Priority

These are all small changes to `.orchestrator/scripts/status.py`. Could be a single `orchestrator_impl` task or done directly on main since it's a project-management script.
