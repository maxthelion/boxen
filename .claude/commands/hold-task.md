# /hold-task - Park Task in Escalated

Park a task in the escalated queue so the scheduler ignores it. Use this when a task needs human attention or should be held for later.

## Usage

```
/hold-task <task-id>
```

## What It Does

1. Finds the task file in any queue directory
2. Moves the file to `escalated/`
3. Updates DB state:
   - `queue` → escalated
   - `claimed_by` → NULL
   - `checks` → NULL
   - `check_results` → NULL
4. Records a history event

## Implementation

```python
import sys
sys.path.insert(0, "orchestrator")
from orchestrator.queue_utils import hold_task

result = hold_task("$ARGUMENTS")
print(f"Task {result['task_id']} held: {result['old_path']} → {result['new_path']}")
```

## When to Use

- A task needs human review before agents should work on it
- You want to temporarily remove a task from the queue without deleting it
- A task is causing problems and needs to be parked while you investigate
- You want to hold a task for a future release

## Releasing a Held Task

To release a held task back to incoming, use `/reset-task`:

```
/reset-task <task-id>
```

## Related Commands

- `/reset-task` - Reset a task to incoming with clean state
- `/queue-status` - See all queues including escalated
- `/orchestrator-status` - Full system overview
