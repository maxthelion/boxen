# [TASK-fix-worktree-reset] Reset Worktree After Task Completion

ROLE: implement
PRIORITY: P2
BRANCH: main
CREATED: 2026-02-04T06:10:00Z
CREATED_BY: human

## Problem

After an implementer completes a task and creates a PR, the worktree remains on the agent's feature branch. On the next run, `_check_for_continuation_work()` detects the branch has commits ahead of main and thinks there's WIP, causing the agent to resume a completed task instead of picking up new work.

## Current Behavior

1. Implementer claims task, creates branch `agent/{task_id}-{timestamp}`
2. Implementer completes work, pushes, creates/updates PR
3. Task moved to `done/` queue
4. **Worktree stays on agent branch**
5. Next run: `has_commits_ahead_of_base()` returns true
6. Agent tries to resume the already-completed task

## Expected Behavior

After completing a task:
1. Worktree should be reset to a clean state
2. Agent branch should be deleted locally (remote branch stays for PR)
3. Next run picks up new tasks from the queue

## Proposed Fix

In `orchestrator/orchestrator/roles/implementer.py`, after successfully completing a task in `_handle_implementation_result()`:

```python
# After complete_task() succeeds:
try:
    # Detach HEAD and delete local branch
    run_git(["checkout", "--detach", "HEAD"], cwd=self.worktree)
    run_git(["branch", "-D", branch_name], cwd=self.worktree, check=False)
    self.log(f"Reset worktree after completing task")
except Exception as e:
    self.log(f"Warning: Failed to reset worktree: {e}")
```

Also add to `git_utils.py`:

```python
def reset_worktree_after_task(worktree_path: Path, branch_name: str) -> None:
    """Reset worktree to detached state after task completion."""
    run_git(["checkout", "--detach", "HEAD"], cwd=worktree_path)
    run_git(["branch", "-D", branch_name], cwd=worktree_path, check=False)
```

## Additional Consideration

The `_check_for_continuation_work()` method should also verify the task isn't already in `done/` queue before resuming:

```python
if task_id:
    # Check if task is already done
    task = find_task_by_id(task_id)
    if task and "done" in str(task.get("path", "")):
        # Task already completed, don't resume
        return None
    # ... rest of continuation check
```

## Acceptance Criteria

- [ ] After successful PR creation, worktree is detached from agent branch
- [ ] Local agent branch is deleted after task completion
- [ ] Agent picks up new tasks on subsequent runs
- [ ] Continuation check skips tasks already in done queue
- [ ] No errors if branch deletion fails (branch might not exist)

## Files to Modify

- `orchestrator/orchestrator/roles/implementer.py`
- `orchestrator/orchestrator/git_utils.py` (optional helper)
