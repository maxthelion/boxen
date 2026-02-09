# Postmortem: Duplicate Task Wasted 25 Agent Turns

**Date:** 2026-02-08
**Tasks:** TASK-53f8ac62 (original), TASK-80e957b6 (duplicate)
**Severity:** Wasted effort (25 turns), no user-facing impact

## Summary

Two identical tasks ("Add staging_url field to tasks and display on dashboard") were created 3 minutes apart. The first completed successfully via self-merge. The second was claimed 12 seconds after the first merged, found nothing to do, burned 25 turns, and went to provisional with 0 commits. A human had to investigate and manually accept it.

## Timeline

1. 15:37:52 — TASK-53f8ac62 created (staging_url task)
2. 15:40:34 — TASK-80e957b6 created (identical staging_url task)
3. ~15:48:16 — TASK-53f8ac62 self-merges successfully (commit 1af90d0)
4. 15:48:28 — TASK-80e957b6 claimed by orch-impl-1 (12 seconds after first task merged)
5. 15:51:14 — TASK-80e957b6 submitted with 0 commits, 25 turns → provisional queue
6. Later — Human investigates, finds work already done, accepts manually

## Root Cause

### Immediate: Human created the same task twice

The interactive PM session created the task via `/enqueue` twice in the same session, likely during a context window that was getting long (previous conversation ran out of context and was continued). The second creation happened before the first task had completed.

### Structural: No duplicate detection at enqueue time

`create_task()` does not check whether an existing task with the same title or similar content already exists. There is no deduplication gate — every `/enqueue` call creates a new task unconditionally.

### Misleading: Agent found nothing to do but still used 25 turns

The agent was dropped into a worktree where the feature already existed. It likely explored the codebase, verified the feature was working, and then submitted with 0 commits. 25 turns is a lot for "nothing to do" — the agent didn't have a fast path for detecting that the work was already complete.

## What the actual fix requires

Two independent improvements:

### 1. Duplicate detection at enqueue time

Before creating a task, check for existing tasks with similar titles in incoming/claimed/provisional queues. Warn the human if a likely duplicate exists.

```python
def check_for_duplicates(title: str) -> list:
    """Return tasks with similar titles in active queues."""
    # Exact match or high similarity (e.g., Levenshtein, token overlap)
    ...
```

### 2. Early exit when work is already done

The agent's prompt could include a step: "Before starting work, check if the acceptance criteria are already met. If they are, report this and exit immediately." This would turn a 25-turn waste into a 2-turn detection.

## Lessons

### 1. Context loss causes duplicate work

When a conversation is continued from a previous context, the PM session loses memory of tasks it already created. This will keep happening unless there's a mechanical check.

### 2. The system handled the duplicate gracefully — but slowly

The 0-commits → provisional → human review path worked correctly. No data was corrupted, no bad merges happened. But the detection was manual and took human investigation time. An automated "this work already exists" check would have caught it immediately.

## Remediation

### 1. Add "already done?" check to agent prompts (DONE)

Added to both `orchestrator_impl.py` and `implementer.py` role prompts: before starting work, check if acceptance criteria are already met. If so, write "ALREADY_DONE" to notes and stop immediately. Should reduce wasted turns from 25 to ~3.

### 2. Surface reason in task metadata (TODO)

When a task goes to provisional with 0 commits, the system should capture WHY from the agent's notes. If the agent wrote "ALREADY_DONE", the task status/notes should say so — not just "0 commits, 25 turns" which requires detective work to interpret. The status script and dashboard should show this.
