# /fast-task - Create Fast-Track Task

Create a task that skips QA review and auto-merges after the sanity checker approves. Uses the `fast` flow instead of `default`.

## Usage

```
/fast-task "Fix typo in panel labels"
```

## When to Use

Use `/fast-task` instead of `/enqueue` for:
- Small, low-risk changes (typos, config tweaks, simple bug fixes)
- Tooling and infrastructure work
- Changes where human review isn't needed

Use `/enqueue` for anything that needs QA review or human approval.

## Flow Comparison

| Step | `/enqueue` (default) | `/fast-task` (fast) |
|------|---------------------|---------------------|
| Implementation | Yes | Yes |
| Push + Tests + PR | Yes | Yes |
| Sanity check | Yes | Yes |
| QA review | Yes | **Skipped** |
| Human approval | Yes | **Skipped** |
| Auto-merge | No | **Yes** (after sanity check) |

## Implementation

Create the task with `create_task()`, then override the flow to `fast` via the SDK:

```python
from orchestrator.tasks import create_task
from orchestrator.queue_utils import get_sdk

task_path = create_task(
    title="Fix typo in panel labels",
    role="implement",
    priority="P2",
    context="...",
    acceptance_criteria=["..."],
)

# Extract task ID from filename
task_id = task_path.stem.replace("TASK-", "")

# Override flow from default to fast
sdk = get_sdk()
sdk.tasks.update(task_id, flow="fast")
```

## Interactive Mode

When run without arguments, ask for:

1. **Title** - Brief, descriptive title
2. **Priority** - How urgent (default P2 for fast tasks):
   - `P1` - High
   - `P2` - Normal (default)
   - `P3` - Low
3. **Context** - Background and motivation
4. **Acceptance Criteria** - Specific requirements

Role is always `implement` for fast tasks.

## After Creation

The task will be:
1. Registered on the server with `flow=fast`
2. Claimed by an implementer on next scheduler tick
3. After implementation: push, test, create PR
4. Sanity checker reviews automatically
5. If sanity check passes: **auto-merged** (no human review)
6. If sanity check fails: returned to incoming for another attempt

Check status with `/queue-status`.
