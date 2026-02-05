# Draft: Task Decomposition System

## Problem

Large tasks cause agents to hit max turns without completing. Currently requires manual intervention to break down and coordinate subtasks.

## Proposed Solution

### 1. Rejection for Complexity

Implementers can reject tasks that are too large:

```markdown
REJECTED_AT: 2026-02-04T12:30:00Z
REJECTION_REASON: too_complex
REJECTED_BY: impl-agent-1

## Rejection Details
Task requires multiple distinct changes that should be separate commits:
1. Remove UI component
2. Rewrite detection algorithm
3. Fix eligibility rules
4. Fix operation logic
5. Add integration tests

Recommend breaking into 5 sequential subtasks.
```

### 2. Curator Handles Decomposition

When curator sees a `too_complex` rejection:

**Option A: Curator breaks it down directly**
- Curator reads the rejection details
- Creates subtasks with NEXT_TASK links
- Moves first subtask to incoming

**Option B: Delegate to task-breaker agent**
- Curator creates a meta-task for decomposition
- Task-breaker agent analyzes and creates subtasks
- Curator reviews and approves the breakdown

### 3. Linked Subtasks

Subtasks reference the next one in sequence:

```markdown
# Part 1: Remove ALL CORNERS Button

CREATED: 2026-02-04T12:00:00Z
PRIORITY: P1
COMPLEXITY: S
ROLE: implement
BRANCH: feature/fillet-fix
SKIP_PR: true
PARENT_TASK: TASK-fix-fillet-all-corners
SEQUENCE: 1 of 5
NEXT_TASK: TASK-fillet-2-fix-corner-detection

## Task
...
```

### 4. Automatic Promotion

When a subtask completes, the system:

1. Checks for `NEXT_TASK` field
2. If present, moves that task from `blocked/` to `incoming/`
3. Curator doesn't need to manually promote

```python
def complete_task(task_path, result):
    # ... existing completion logic ...

    task = parse_task(task_path)
    if task.get("next_task"):
        next_task_path = find_task(task["next_task"])
        if next_task_path and is_in_blocked_queue(next_task_path):
            move_to_incoming(next_task_path)
            log(f"Auto-promoted {task['next_task']}")
```

### 5. Blocked Queue

New queue directory for tasks waiting on dependencies:

```
.orchestrator/shared/queue/
├── incoming/      # Ready to claim
├── claimed/       # Being worked on
├── blocked/       # Waiting for NEXT_TASK promotion
├── done/
└── failed/
```

### 6. Task Metadata

New fields:

| Field | Description |
|-------|-------------|
| `PARENT_TASK` | Original task this was broken from |
| `SEQUENCE` | Position in sequence (e.g., "2 of 5") |
| `NEXT_TASK` | Task ID to promote when this completes |
| `BLOCKED_BY` | Task ID that must complete first (alternative to NEXT_TASK) |

### 7. Curator Workflow

```
1. Implementer rejects task as too_complex
   └── Task moves to rejected/ with details

2. Curator picks up rejected task
   ├── Analyzes rejection reason
   ├── Creates subtask chain (NEXT_TASK links)
   ├── Moves first subtask to incoming/
   └── Moves remaining subtasks to blocked/

3. Subtasks execute sequentially
   └── Each completion auto-promotes the next

4. Final subtask
   ├── Creates PR to main (no SKIP_PR)
   └── Marks parent task as complete
```

## Alternative: BLOCKED_BY Instead of NEXT_TASK

Instead of forward references (NEXT_TASK), use backward references (BLOCKED_BY):

```markdown
BLOCKED_BY: TASK-fillet-1-remove-all-corners-button
```

Scheduler checks before claiming:
```python
def can_claim(task):
    blocked_by = task.get("blocked_by")
    if blocked_by:
        blocker = find_task(blocked_by)
        if blocker and not is_complete(blocker):
            return False  # Still blocked
    return True
```

**Pros:** All tasks can be in incoming/, scheduler handles ordering
**Cons:** Need to check completion status on every claim attempt

## Questions

1. NEXT_TASK (push) vs BLOCKED_BY (pull) - which is simpler?
2. Should task-breaker be a separate agent or curator capability?
3. How to handle failures mid-chain? (Task 3 fails, tasks 4-5 are blocked)
4. Should subtasks share a branch or each get their own?

## Implementation Estimate

- Add `blocked/` queue directory: trivial
- Add NEXT_TASK auto-promotion: small
- Add BLOCKED_BY checking in scheduler: small
- Add too_complex rejection handling: small
- Task-breaker agent: medium (optional)
