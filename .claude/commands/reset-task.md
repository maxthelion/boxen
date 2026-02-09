# /reset-task - Reset Task to Incoming

Reset a task to the incoming queue with clean state. Replaces 5+ lines of manual raw SQL and file moves with a single command.

## Usage

```
/reset-task <task-id>
```

## What It Does

1. Finds the task file in any queue directory (incoming, claimed, provisional, done, failed, escalated, recycled, etc.)
2. Moves the file to `incoming/`
3. Resets DB state:
   - `queue` → incoming
   - `claimed_by` → NULL
   - `checks` → NULL
   - `check_results` → NULL
   - `rejection_count` → 0
4. Records a history event

## Implementation

```python
import sys
sys.path.insert(0, "orchestrator")
from orchestrator.queue_utils import reset_task

result = reset_task("$ARGUMENTS")
print(f"Task {result['task_id']} reset: {result['old_path']} → {result['new_path']}")
```

## When to Use

- A task is stuck in the wrong queue (e.g. provisional after a failed agent run)
- You want to re-run a task from scratch with clean state
- A task was claimed by a dead agent and needs to be recycled
- check_results or rejection_count need to be wiped

## Related Commands

- `/hold-task` - Park a task in escalated instead of resetting
- `/retry-failed` - Retry tasks specifically from the failed queue
- `/queue-status` - See all queues
- `/orchestrator-status` - Full system overview
