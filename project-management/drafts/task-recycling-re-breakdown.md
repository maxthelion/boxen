# Task Recycling: Re-Breakdown for Oversized Tasks

## Problem

When a project is broken down into tasks and sent through the orchestrator, some tasks turn out to be too large for a single agent session. The symptom: an agent uses all 50 turns and produces 0 commits. The task ends up in `provisional` with `COMMITS_COUNT: 0, TURNS_USED: 50`.

**Current behavior:**
- `accept_all.py` blindly accepts everything in provisional, including 0-commit tasks
- The validator role does check for 0 commits, but `accept_all.py` bypasses it
- The existing escalation path (reject → retry 3x → create planning task) is slow and doesn't preserve project context well
- When a task is retried as-is, it's likely to fail again — the task is too large, not broken wrong

**What we need:**
- Detect "burned out" tasks at acceptance time
- Route them back through breakdown with full project context
- Ensure the re-breakdown only covers remaining work, not work already completed

## Design

### Part 1: Detection in `accept_all.py`

Enhance the acceptance script to flag 0-commit tasks instead of silently accepting them.

**Changes to `accept_all.py`:**

```python
def main():
    tasks = list_tasks("provisional")

    normal_tasks = []
    burned_tasks = []

    for task in tasks:
        commits = task.get("commits_count", 0)
        turns = task.get("turns_used", 0)

        if commits == 0 and turns >= 40:  # burned out
            burned_tasks.append(task)
        else:
            normal_tasks.append(task)

    # Accept normal tasks
    for task in normal_tasks:
        accept_completion(task["path"], validator="manual-accept")

    # Report burned tasks
    if burned_tasks:
        print(f"\n⚠ {len(burned_tasks)} task(s) burned out (0 commits, max turns):")
        for task in burned_tasks:
            project_id = task.get("project_id", "none")
            print(f"  {task['id']}: {task.get('title', '?')} (project: {project_id})")
        print(f"\nOptions:")
        print(f"  python accept_all.py --force          # Accept anyway")
        print(f"  python accept_all.py --recycle         # Send to re-breakdown")
```

Add `--force` flag to accept everything, `--recycle` flag to automatically invoke `recycle_to_breakdown()` for each burned task.

### Part 2: `recycle_to_breakdown()` — Building Rich Context

New function in `queue_utils.py`. The key challenge: the re-breakdown agent needs to know exactly what's done and what's remaining so it doesn't duplicate work.

**Context sources:**

| Source | What it tells us |
|--------|-----------------|
| Project metadata | Title, description, branch |
| Sibling tasks (via `get_project_tasks()`) | What was planned, what succeeded, what failed |
| Git diff on feature branch | What code actually changed — the ground truth |
| The failed task's description | What was supposed to happen |

**Function signature:**

```python
def recycle_to_breakdown(
    task_path: Path,
    reason: str = "too_large",
) -> dict:
    """Recycle a failed task back to the breakdown queue.

    Builds rich context from project state and creates a new
    breakdown task that only covers remaining work.
    """
```

**What it does:**

1. Parse the original task to get `project_id`, `branch`, content
2. Call `get_project_tasks(project_id)` to get all sibling tasks
3. Build a "completed work" summary from tasks in `done` queue
4. Build a "failed task" section with the original description
5. Create a new breakdown task in the `breakdown` queue with all this context
6. Move the original task to a `recycled` queue state (so it's not retried as-is)
7. Block any tasks that depended on the failed task until re-breakdown completes

### Part 3: Breakdown Agent Gets the Feature Branch

This is the key insight. Instead of the breakdown agent exploring from `main`, it should check out the project's feature branch in its worktree. That way it can:

- Run `git diff main...HEAD` to see exactly what's been committed
- Read the actual code changes to understand what's done
- Run tests to see what's passing/failing
- Identify the precise delta of remaining work

**How it works today:**

The breakdown role (`roles/breakdown.py`) claims tasks from the `breakdown` queue. When the scheduler spawns it, it creates a worktree based on `base_branch` from the agent config (defaults to `main`). The breakdown agent currently has no awareness of feature branches.

**Proposed change to `roles/breakdown.py`:**

When the breakdown task has a `BRANCH` field (which project tasks do), the breakdown agent should:

1. Check out that branch in its worktree (or create the worktree on that branch)
2. In Phase 1 (exploration), run `git log main..HEAD --oneline` and `git diff main...HEAD --stat` to capture what's already been committed
3. Include the diff summary in the exploration findings
4. Pass this to Phase 2 (decomposition) as "already completed work"

**Implementation options for the worktree:**

**Option A: Breakdown agent checks out the branch itself**

In `breakdown.py`, after claiming the task:

```python
branch = task.get("branch")
if branch and branch != "main":
    subprocess.run(["git", "fetch", "origin", branch], cwd=self.worktree)
    subprocess.run(["git", "checkout", branch], cwd=self.worktree)
```

Simple, but modifies the agent's existing worktree.

**Option B: Scheduler creates worktree on the right branch** (preferred)

The scheduler already reads task info when spawning agents. For breakdown agents, it could:

1. Peek at the next breakdown task to get its `BRANCH` field
2. Pass that branch to `ensure_worktree()` instead of the default `main`
3. The agent starts already on the right branch

Cleaner — the scheduler already handles worktree setup and it keeps branch management out of the role code.

**Option C: Breakdown agent gets read-only access to the branch**

Create a temporary worktree just for reading the branch state, separate from the agent's working worktree. More complex, probably not needed for v1.

**Decision: Option B.** Agent turns are expensive — don't waste them on git operations the scheduler can handle for free. The scheduler already manages worktree setup for all agents, so peeking at the task's branch is a small addition. See Decision 5 below.

### Part 4: Re-Breakdown Prompt

The breakdown task content for a recycled task should look like this:

```markdown
# Re-Breakdown: [Original Task Title]

## ⚠ This is a RE-BREAKDOWN of a task that was too large

An agent attempted this task and used all 50 turns without producing
any commits. The task needs to be split into smaller pieces.

## Project Context

**Project:** PROJ-dca27809 — Fix share link serialization
**Branch:** feature/dca27809

## Completed Tasks (DO NOT recreate)

These tasks have been completed and their work is already committed
to the feature branch:

1. ✅ TASK-a0051d93: Add serialization round-trip tests (1 commit)
2. ✅ TASK-7fc656ad: Extend SerializedState interface (1 commit)
3. ✅ TASK-c338e19e: Implement serializePanelOperations (1 commit)
4. ✅ TASK-4174ca03: Implement deserializePanelOperations (2 commits)
5. ✅ TASK-9596b473: Wire into serializeProject/deserializeProject (2 commits)
6. ✅ TASK-8b3118b5: Restore panel operations in syncStoreToEngine (2 commits)

## Failed Task

**TASK-9a69e916:** Verify tests pass and add edge case coverage
- Used 50 turns, 0 commits
- Agent could not complete within turn limit

### Original Description

[full task content pasted here]

## Instructions

You are re-breaking-down a single failed task from an existing project.

1. **Check out the feature branch** and examine what's already committed
2. Run `git diff main...HEAD --stat` to see the full change set
3. Run existing tests to see current pass/fail state
4. Based on what's actually done vs what the failed task required,
   identify the SPECIFIC remaining work
5. Break ONLY the remaining work into 2-4 tasks, each <20 turns
6. Do NOT create tasks for work that's already committed

The completed tasks above are a guide, but the branch is the
source of truth for what's actually done.
```

### Part 5: Handling Dependencies

When a task is recycled, any tasks that were `BLOCKED_BY` the failed task need to be handled:

- The new subtasks from re-breakdown should inherit the failed task's role in the dependency chain
- Tasks blocked by the failed task should be blocked by the **last** new subtask instead
- The `approve_breakdown()` function already handles dependency wiring — we just need to pass the blocked task IDs through

**Implementation:** Add an optional `replaces_task_id` field to the breakdown task. When `approve_breakdown()` creates subtasks, it checks if the breakdown was a replacement. If so, it finds tasks that were blocked by the original and re-wires them to depend on the last new subtask.

## File Changes Summary

| File | Change | Size |
|------|--------|------|
| `scripts/accept_all.py` | Add burned-task detection, `--force` and `--recycle` flags | S |
| `queue_utils.py` | Add `recycle_to_breakdown()` function | M |
| `roles/breakdown.py` | Include git diff in exploration prompt (branch checkout handled by scheduler) | S |
| `scheduler.py` | Peek at breakdown task's BRANCH field, create worktree on that branch | M |
| `queue_utils.py` | Update `approve_breakdown()` to handle `replaces_task_id` dependency rewiring | S |
| `config.py` | Add `recycled` to known queue states (if needed) | S |
| `db.py` | Add `recycled` queue state support (if needed) | S |

## Implementation Order

1. **accept_all.py detection** — Immediate value, just stops us blindly accepting bad tasks
2. **recycle_to_breakdown()** — The context-building function
3. **breakdown.py branch checkout** — Gives the breakdown agent the feature branch
4. **Re-breakdown prompt** — The enriched prompt with completed work + diff
5. **Dependency rewiring** — Handles the blocked-by chain

Steps 1-2 can be done independently. Steps 3-4 are closely related. Step 5 can come last.

## Decisions

### 1. Recycler agent: yes. Breakdown agent in scheduler: not yet.

**Decision:** Create a dedicated `recycler` agent that polls the `provisional` queue for burned-out tasks, builds rich re-breakdown context, and creates new breakdown tasks. The main breakdown agent stays manual — breakdowns need human review before approval, and the recycler's job is narrow and well-defined.

**Flow:** `recycler detects burned task` → `creates re-breakdown task in breakdown queue` → `human triggers breakdown agent manually` → `human reviews and approves breakdown` → `new subtasks enter incoming`

See `docs/octopoid-operating-notes.md` for full rationale.

### 2. Two-tier detection: immediate + cumulative

**Decision:** Use a simple heuristic with two catch points to avoid wasting compute on blind alleys.

**Catch 1 — Immediate (recycler agent):** `commits == 0 && turns >= 40` on the first attempt. Don't retry — recycle straight to re-breakdown. This is the "obviously too large" case. No point burning another 50 turns on the same task.

**Catch 2 — Cumulative (validator enhancement):** Task has been attempted 3+ times regardless of commit count. Maybe it partially commits each time but never finishes, or keeps hitting different errors. Either way it's not converging — recycle it.

The existing validator already has a 3-strike rule (`max_attempts_before_planning`), but currently it escalates to `create_planning_task()` which asks an implementer to write a plan doc. For project tasks, this should route to `recycle_to_breakdown()` instead — which provides the feature branch diff and completed sibling context that the planning path lacks.

**Combined effect:** Worst case is 1 wasted session (50 turns) for the obvious case, or 3 sessions for the subtle case. Without this, burned-out tasks retry forever or get blindly accepted.

**Implementation:**
- Recycler agent handles Catch 1 (polls provisional queue)
- Validator's existing `_escalate_task()` updated for Catch 2: when task has a `project_id`, call `recycle_to_breakdown()` instead of `escalate_to_planning()`

### 3. Re-breakdown turn limits: same as regular breakdown

**Decision:** Keep 15+5=20 turns for re-breakdown. Even though the scope is narrower, the agent needs to check out the branch, run tests, read the diff, and understand what's remaining. Don't optimize prematurely.

### 4. Cap re-breakdown at one level

**Decision:** A task can only be re-broken-down once. If a subtask from a re-breakdown also burns out, escalate to human — don't recurse.

**Implementation:** Add a `re_breakdown_depth` field (or similar) to tasks created by `recycle_to_breakdown()`. The recycler checks this before recycling: if `depth >= 1`, skip recycling and flag for human attention instead. This prevents infinite loops and signals that the work needs human judgement to scope correctly.

### 5. Scheduler creates worktrees on the right branch (Option B)

**Decision:** Use Option B from Part 3 — the scheduler peeks at the breakdown task's `BRANCH` field and creates the worktree on that branch. Don't waste agent turns on git checkout.

**Rationale:** Agent turns are expensive. The scheduler already handles worktree setup for all agents. Having the breakdown agent spend turns on `git fetch` + `git checkout` is wasteful when the scheduler can do it for free before the agent starts.

**Implementation:** In `scheduler.py`, when spawning a breakdown agent:
1. Peek at the next task in the breakdown queue to get its `BRANCH` field
2. Pass that branch to `ensure_worktree()` instead of the default `main`
3. Agent starts already on the correct branch with full commit history available
