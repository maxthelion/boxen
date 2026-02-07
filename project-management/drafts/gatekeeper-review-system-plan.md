# Gatekeeper Review System: Implementation Plan

**Source:** Actions D1 and D2 from [workflow-improvements-action-plan.md](workflow-improvements-action-plan.md)
**Design:** [orchestrator-review-rejection-workflow.md](orchestrator-review-rejection-workflow.md), [interactive-claude-and-gatekeeper-workflow.md](interactive-claude-and-gatekeeper-workflow.md)

## Overview

Add an automated gatekeeper review stage to the orchestrator that intercepts tasks at the `provisional` stage. Three specialized reviewers (architecture, testing, QA) evaluate the work, and if any fail, the task is automatically rejected back to the implementer with structured feedback. After 3 rejections, the task escalates to human attention.

## Current State Analysis

### What exists

- **Gatekeeper roles** (`roles/gatekeeper.py`, `roles/gatekeeper_coordinator.py`) — these are PR-oriented (operate on GitHub PRs). They will be repurposed/rewritten for task-level review.
- **PR utilities** (`pr_utils.py`) — check tracking, diff fetching, result recording. Some can be reused for branch-diff-based review.
- **`reject_completion()`** in `queue_utils.py` / `db.py` — moves provisional to incoming, increments `attempt_count`. This is for *validation* rejections (no commits), not *review* rejections (bad code).
- **`reject_task()`** in `queue_utils.py` (line 574) — agent-initiated rejection to a permanent `rejected` queue. Different purpose.
- **Validator role** (`roles/validator.py`) — lightweight agent that processes provisional tasks (accept/reject based on commit count). The gatekeeper must run *after* the validator accepts (has commits) but *before* human approval.

### What needs to change

The current flow is:
```
claimed -> provisional -> [validator: has commits?] -> done (+ unblock dependents)
```

The new flow is:
```
claimed -> provisional -> [validator: has commits?] -> review_pending -> [gatekeepers: code quality?] -> approved (+ PR + human merge)
                                                                              |
                                                                              v (if any fail)
                                                                          claimed (with review feedback)
                                                                              |
                                                                              v (after 3 rejections)
                                                                          escalated (human attention)
```

## Task Breakdown

### Task 1: DB Schema Migration (v3 to v4)

**Role:** implement
**Priority:** P1
**Depends on:** (none)

Add new columns to the `tasks` table and a new `review_pending` queue status.

#### Changes to `orchestrator/orchestrator/db.py`

1. Bump `SCHEMA_VERSION` from 3 to 4
2. Add migration in `migrate_schema()` for `current < 4`:
   - Add `rejection_count INTEGER DEFAULT 0` to tasks table
   - Add `pr_number INTEGER` to tasks table
   - Add `pr_url TEXT` to tasks table
3. Update `init_schema()` to include the new columns in the CREATE TABLE statement

#### What the columns track

| Column | Purpose |
|--------|---------|
| `rejection_count` | Number of times gatekeepers have rejected this task (distinct from `attempt_count` which tracks validation rejections) |
| `pr_number` | GitHub PR number associated with this task's branch |
| `pr_url` | GitHub PR URL |

#### Success criteria

- `SCHEMA_VERSION` is 4
- Running `migrate_schema()` on a v3 database adds the three new columns without error
- Running `migrate_schema()` on a fresh database creates tables with the new columns
- `get_task()` returns dicts with `rejection_count`, `pr_number`, `pr_url` keys
- Existing tests still pass (`cd orchestrator && ./venv/bin/python -m pytest tests/ -v`)

#### Test plan

- Test that `migrate_schema()` from v3 to v4 adds columns without data loss
- Test that `init_schema()` creates tables with new columns
- Test round-trip: create task, read it back, verify `rejection_count` defaults to 0 and `pr_number`/`pr_url` default to `None`

---

### Task 2: Review Rejection Function in queue_utils

**Role:** implement
**Priority:** P1
**Depends on:** Task 1

Add a `review_reject_task()` function that handles gatekeeper rejections differently from validation rejections.

#### Changes to `orchestrator/orchestrator/queue_utils.py`

1. New function `review_reject_task()`:

```python
def review_reject_task(
    task_path: Path | str,
    feedback: str,
    rejected_by: str | None = None,
    max_rejections: int = 3,
) -> tuple[Path, str]:
    """Reject a provisional/review_pending task with review feedback.

    Increments rejection_count. If count >= max_rejections, escalates
    to human attention instead of cycling back to the implementer.

    Returns:
        Tuple of (new_path, action) where action is 'rejected' or 'escalated'
    """
```

2. The function should:
   - Read current `rejection_count` from DB
   - If `rejection_count + 1 >= max_rejections`: escalate to human (write message, move to provisional for human review, set a flag)
   - Otherwise: increment `rejection_count`, write feedback to task file under `## Review Feedback (rejection #N)`, move task back to `incoming` queue, clear `claimed_by`/`claimed_at`
   - Log history event: `'review_rejected'` with details

3. New function `get_review_feedback()`:
   - Read `## Review Feedback` sections from a task file
   - Return as string for injection into implementer prompt

4. Update `_db_task_to_file_format()` to include `rejection_count`, `pr_number`, `pr_url` in the returned dict

#### Changes to `orchestrator/orchestrator/db.py`

1. New function `review_reject_completion()`:

```python
def review_reject_completion(
    task_id: str,
    reason: str,
    reviewer: str | None = None,
) -> dict[str, Any] | None:
    """Reject a task after gatekeeper review.

    Increments rejection_count (not attempt_count).
    Moves task back to incoming for re-implementation.
    """
```

This is distinct from `reject_completion()` which increments `attempt_count` (used by the validator for no-commit rejections).

#### Success criteria

- `review_reject_task()` increments `rejection_count` in DB
- `review_reject_task()` appends `## Review Feedback` section to the task markdown file
- After 3 rejections, the task is escalated (message written, task stays in provisional for human)
- `get_review_feedback()` returns feedback text from the task file
- `rejection_count` and `attempt_count` are independent counters
- Existing tests still pass

#### Test plan

- Test `review_reject_task()` increments `rejection_count` from 0 to 1
- Test `review_reject_task()` writes feedback to task file with correct heading
- Test that calling `review_reject_task()` 3 times triggers escalation on the third call
- Test that `rejection_count` is independent of `attempt_count`
- Test `get_review_feedback()` extracts feedback from task file

---

### Task 3: Implementer Prompt Enhancement for Review Feedback

**Role:** implement
**Priority:** P1
**Depends on:** Task 2

When an implementer picks up a task that has been review-rejected, inject the review feedback into the prompt so the agent knows what to fix.

#### Changes to `orchestrator/orchestrator/roles/implementer.py`

1. After loading task content, check for `## Review Feedback` sections
2. If present, add a prominent section to the prompt:

```python
review_feedback = get_review_feedback(task_id)
if review_feedback:
    feedback_section = f"""
## REVIEW FEEDBACK (IMPORTANT)

This task was previously implemented but rejected by automated reviewers.
Fix the issues described below. Do NOT start from scratch — work on the
existing branch and make targeted fixes.

{review_feedback}
"""
```

3. When a rejected task is re-claimed, the implementer should check out the *existing* branch (not create a new one). Check `task.get('branch')` — if it's an `agent/` branch, use that.

#### Changes to `orchestrator/orchestrator/queue_utils.py`

1. Update `claim_task()` to prioritize tasks with `rejection_count > 0` (before fresh tasks at the same priority level)

#### Success criteria

- When a task with `rejection_count > 0` is claimed, the implementer's prompt includes the `## REVIEW FEEDBACK` section
- Rejected tasks are claimed before fresh tasks (priority bump)
- The implementer checks out the existing branch rather than creating a new one
- Existing tests still pass

#### Test plan

- Test that `claim_task()` returns rejected tasks before fresh tasks at the same priority level
- Test that the implementer prompt includes review feedback when `rejection_count > 0`
- Integration test: create task, submit, review-reject with feedback, re-claim — verify feedback appears

---

### Task 4: Gatekeeper Review Coordinator

**Role:** implement
**Priority:** P1
**Depends on:** Task 2

Rewrite the gatekeeper coordinator to operate on tasks in the `provisional` queue rather than GitHub PRs.

#### New file: `orchestrator/orchestrator/review_utils.py`

Review tracking utilities (parallel to `pr_utils.py` but for task-level review):

- `get_review_dir(task_id)` — returns `.orchestrator/shared/reviews/TASK-{id}/`
- `init_task_review(task_id, task_info)` — creates tracking metadata
- `load_review_meta(task_id)` — loads review state
- `save_review_meta(task_id, meta)` — saves review state
- `record_review_result(task_id, check_name, status, summary, details)` — records a single check result
- `all_reviews_complete(task_id)` — checks if all required checks have a final status
- `all_reviews_passed(task_id)` — returns `(passed, failed_checks)`
- `get_review_feedback(task_id)` — aggregates feedback from failed checks
- `get_task_branch_diff(task_id, base_branch)` — gets the diff between task branch and base

#### Changes to `orchestrator/orchestrator/scheduler.py`

1. New function `process_gatekeeper_reviews()`:

```python
def process_gatekeeper_reviews() -> None:
    """Process provisional tasks that need gatekeeper review.

    For each provisional task with commits (validated but not yet reviewed):
    1. Check if gatekeeper checks are already in progress
    2. If not, initialize check tracking
    3. If all checks complete, apply pass/fail decision
    """
```

2. Add call in `run_scheduler()` after `process_auto_accept_tasks()`

#### Success criteria

- Provisional tasks with commits automatically get gatekeeper review initialized
- Review tracking is stored in `.orchestrator/shared/reviews/TASK-{id}/`
- When all checks pass, the task moves to `done` and a PR is created
- When any check fails, the task is review-rejected with aggregated feedback
- The system handles existing provisional tasks gracefully (no double-initialization)
- Config controls which checks are required

#### Test plan

- Test `init_task_review()` creates correct directory structure and metadata
- Test `all_reviews_complete()` returns False when pending, True when all done
- Test `all_reviews_passed()` correctly identifies failed checks
- Test `process_gatekeeper_reviews()` initializes review for new provisional tasks
- Test `process_gatekeeper_reviews()` accepts tasks when all checks pass
- Test `process_gatekeeper_reviews()` rejects tasks when any check fails
- Test idempotency: calling twice doesn't double-initialize

---

### Task 5: Gatekeeper Agent Roles (Architecture, Testing, QA)

**Role:** implement
**Priority:** P1
**Depends on:** Task 4

Create three gatekeeper agent instances that each review tasks from their specialized perspective.

#### Changes to `orchestrator/orchestrator/roles/gatekeeper.py`

Rewrite to operate on task reviews instead of PR reviews:

1. Read `REVIEW_TASK_ID` and `REVIEW_CHECK_NAME` from environment
2. Get the branch diff using `git diff {base_branch}...{task_branch}`
3. Build a prompt based on the focus area
4. Invoke Claude with read-only tools
5. Record result using `review_utils.record_review_result()`

#### New prompt files in `.orchestrator/prompts/`

**`gatekeeper-architecture.md`:**
- Unnecessary complexity? Over-engineered solutions?
- Code duplication? Existing utilities that could be reused?
- Boundary violations? (engine vs store, components vs utils)
- Naming and organization consistency?

**`gatekeeper-testing.md`:**
- Tests testing the right thing? User-visible outcomes, not internals?
- Tests cheating? Manually constructing state instead of calling production code?
- Coverage gaps? Edge cases missing?
- Test isolation?

**`gatekeeper-qa.md`:**
- Is this testable in the browser?
- What starting state? (share link presets)
- What operations to perform?
- What should we see? Expected visual/behavioral outcome

#### Changes to `.orchestrator/agents.yaml`

Add three gatekeeper agents (paused initially):

```yaml
- name: gk-architecture
  role: gatekeeper
  focus: architecture
  interval_seconds: 120
  paused: true
- name: gk-testing
  role: gatekeeper
  focus: testing
  interval_seconds: 120
  paused: true
- name: gk-qa
  role: gatekeeper
  focus: qa
  interval_seconds: 120
  paused: true
```

#### Success criteria

- Three gatekeeper agents defined in `agents.yaml` (paused by default)
- Each gatekeeper loads its focus-specific prompt
- Gatekeepers invoke Claude with read-only tools to review the branch diff
- Each gatekeeper records its result via `review_utils.record_review_result()`
- Domain-specific prompts encode the project's existing quality standards

#### Test plan

- Test that `GatekeeperRole` reads `REVIEW_TASK_ID` and `REVIEW_CHECK_NAME` from environment
- Test that the gatekeeper builds a prompt including the branch diff and focus-specific instructions
- Test that `record_review_result()` creates the correct file in the review tracking directory

---

### Task 6: Scheduler Integration and Backpressure

**Role:** implement
**Priority:** P1
**Depends on:** Task 4, Task 5

Wire everything together in the scheduler so gatekeepers are spawned when needed.

#### Changes to `orchestrator/orchestrator/scheduler.py`

1. In `run_scheduler()`, after `process_auto_accept_tasks()`, call `process_gatekeeper_reviews()`
2. When spawning gatekeeper agents, set `REVIEW_TASK_ID` and `REVIEW_CHECK_NAME` in the environment
3. Find provisional tasks needing review, spawn appropriate gatekeeper agents

#### Changes to `orchestrator/orchestrator/backpressure.py`

1. Add `check_gatekeeper_backpressure()` function
2. Add `"gatekeeper": check_gatekeeper_backpressure` to `ROLE_CHECKS`

#### Success criteria

- Scheduler spawns gatekeeper agents only when there are pending reviews
- Each gatekeeper agent receives the correct environment variables
- Multiple gatekeeper agents can run in parallel for different checks on the same task
- Gatekeepers don't re-run checks that already have results
- Full cycle works: implement → provisional → gatekeeper review → accept/reject

#### Test plan

- Integration test: full cycle from task creation through gatekeeper review to acceptance
- Integration test: full cycle ending in rejection with feedback
- Test that gatekeepers don't spawn when there are no pending reviews
- Test that multiple gatekeepers can run in parallel without conflicts

---

### Task 7: PR Approval & Merge Pipeline

**Role:** implement
**Priority:** P2
**Depends on:** Task 4

When a task passes gatekeeper review (or is manually approved by a human), automate the merge and cleanup.

#### New function in `orchestrator/orchestrator/queue_utils.py`

```python
def approve_and_merge(
    task_path: Path | str,
    approver: str = "human",
) -> dict[str, Any]:
    """Approve a task: merge its PR, clean up branch, move to done.

    Steps:
    1. Accept the task (move to done, unblock dependents)
    2. Merge the PR via `gh pr merge --merge` (preserve commit history)
    3. Delete the remote branch
    4. Clean up worktree branch reference

    Returns:
        Dict with {action, pr_merged, branch_deleted}
    """
```

#### New script: `.orchestrator/scripts/approve_task.py`

```python
"""Approve a task by ID or PR number.

Usage:
    .orchestrator/venv/bin/python .orchestrator/scripts/approve_task.py <task-id-or-pr-number>
"""
```

The script should:
1. Look up the task (by task ID prefix or PR number)
2. Call `approve_and_merge()`
3. Report what happened

#### New slash command: `.claude/commands/approve-task.md`

```
/approve-task <task-id or PR number>
```

Approves a provisional task: merges PR, deletes branch, moves task to done.

#### Success criteria

- `/approve-task 53` merges PR #53, deletes the remote branch, moves the task to done
- `/approve-task a6f7f4cf` works with task IDs too
- Dependent tasks are unblocked after approval
- If merge fails (conflicts), reports the error without moving to done
- Agent worktree is cleaned up

#### Test plan

- Test that `approve_and_merge()` calls `accept_completion()` + `gh pr merge`
- Test error handling when PR has merge conflicts
- Test that dependent tasks are unblocked

---

### Task 8: `/reject-task` Slash Command

**Role:** implement
**Priority:** P2
**Depends on:** Task 2

Add a manual rejection command for the interactive session.

#### New file: `.claude/commands/reject-task.md`

```
/reject-task <task-id> "<feedback>"
```

Rejects a provisional task with review feedback. The task is sent back to the implementer with the feedback in their prompt.

#### Success criteria

- `/reject-task abc12345 "Fix the duplicate code in SketchView2D"` rejects the task
- The feedback appears in the task's `## Review Feedback` section
- The task moves back to incoming queue

---

## Dependency Graph

```
Task 1 (DB schema)
    |
    v
Task 2 (review_reject_task)
    |
    +--------+---------+---------+
    |        |         |         |
    v        v         v         v
Task 3    Task 4    Task 7    Task 8
(impl     (coordinator) (approve  (/reject-task)
prompt)      |        & merge)
             v
          Task 5
          (gatekeeper agents)
             |
             v
          Task 6
          (scheduler integration)
```

## Risks and Edge Cases

### Risk 1: Existing provisional tasks

There are currently 8+ tasks in the provisional queue. When the gatekeeper system is enabled, it will try to review all of them. **Mitigation:** add a `gatekeeper_enabled_after` timestamp in config. Tasks submitted before that timestamp go through the old flow.

### Risk 2: Gatekeeper agents consume too many turns

Each gatekeeper invokes Claude with a large diff. If the diff is huge (1000+ lines), this could be expensive. **Mitigation:** truncate diff to 50,000 chars. Add a config option `max_diff_size` to skip review for very large diffs.

### Risk 3: Review feedback is too vague for the implementer

If the gatekeeper says "code quality is poor" without specifics, the implementer will struggle. **Mitigation:** the gatekeeper prompts explicitly require file paths and line numbers.

### Risk 4: Infinite rejection loops

Even with the 3-rejection limit, an implementer might make the same mistake 3 times if the feedback isn't actionable. **Mitigation:** escalation sends a message to `.orchestrator/messages/` for human attention.

### Risk 5: Race condition between validator and gatekeepers

The validator and recycler both process provisional tasks. If both run simultaneously, they might conflict. **Mitigation:** the validator should only process tasks that don't have active gatekeeper reviews.

### Risk 6: Branch state after rejection

When a task is review-rejected, the implementer needs to work on the *same branch* with existing commits. The current implementer always creates a new branch. **Mitigation:** Task 3 addresses this — detect `rejection_count > 0` and check out the existing branch.

## Configuration

```yaml
gatekeeper:
  enabled: true
  required_checks:
    - architecture
    - testing
    - qa
  max_rejections: 3
  max_diff_size: 50000
  skip_if_auto_accept: true
```

The system starts with `enabled: false` and is turned on once all components are implemented and tested.
