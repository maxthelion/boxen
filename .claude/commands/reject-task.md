# /reject-task - Reject Task with Feedback

Manually reject a provisional task with review feedback. The task goes back to the implementer with the feedback in their prompt.

## Usage

```
/reject-task <task-id> "<feedback>"
```

## What It Does

1. Looks up the task by ID (searches all queues)
2. Appends the feedback as a `## Review Feedback` section in the task file
3. Increments `rejection_count` in the DB
4. Moves the task back to the `incoming` queue for re-implementation
5. After 3 rejections, escalates to human attention instead

## Implementation

Run the `review_reject_task()` function:

```python
import sys
sys.path.insert(0, "orchestrator")
from orchestrator.queue_utils import review_reject_task, get_task_by_id

# Look up the task
task = get_task_by_id("<task-id>")
if not task:
    print("Task not found")
else:
    new_path, action = review_reject_task(
        task["path"],
        feedback="<feedback text>",
        rejected_by="human",
    )
    print(f"Task {action}: {new_path}")
```

Or via the DB directly if the file path is unknown:

```python
from orchestrator.db import get_task, review_reject_completion

task = get_task("<task-id>")
review_reject_completion(task["id"], reason="<feedback>", reviewer="human")
```

## When to Use

- After reviewing an agent's PR and finding issues
- When a task's implementation doesn't meet acceptance criteria
- When the approach is wrong and needs rework
- To send specific, actionable feedback to the implementing agent

## Related Commands

- `/approve-task` - Approve and merge instead
- `/queue-status` - See provisional tasks
- `/orchestrator-status` - Full system overview
