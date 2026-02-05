# /project-status - Show Project Status

Show detailed status of a project including all its tasks.

## Usage

```
/project-status [project-id]
```

## Without Argument

Lists all active projects with summary:

```
Active Projects:

| Project | Title | Tasks | Status |
|---------|-------|-------|--------|
| PROJ-abc123 | Fillet all corners | 3/5 done | active |
| PROJ-def456 | Add undo support | 0/6 done | active |
```

## With Project ID

Shows detailed status:

```
Project: PROJ-abc123
Title: Fillet all corners
Status: active
Branch: feature/abc123
Base: main

Tasks (5 total):
  ✓ TASK-001: Define testing strategy (done)
  ✓ TASK-002: Add schema types (done)
  ✓ TASK-003: Implement eligibility (done)
  ○ TASK-004: Wire to panel outline (in progress)
  · TASK-005: Add integration tests (blocked by 004)

Progress: 3/5 tasks complete (60%)
```

## Implementation

```python
from orchestrator.orchestrator.queue_utils import (
    list_projects,
    get_project_status,
)

# List all active projects
projects = list_projects(status="active")

# Or get specific project
status = get_project_status("PROJ-abc123")
# Returns:
# {
#   "project": {...},
#   "task_count": 5,
#   "tasks_by_queue": {"done": 3, "claimed": 1, "incoming": 1},
#   "blocked_count": 1,
#   "tasks": [...]
# }
```

## Status Icons

- ✓ done - Task completed
- ○ claimed/in progress - Being worked on
- · incoming - Ready to start
- ⊘ blocked - Waiting on dependencies
- ✗ failed - Task failed

## Related Commands

- `/queue-status` - Show overall queue status
- `/send-to-queue` - Create new project/task
- `/agent-status` - Show agent states
