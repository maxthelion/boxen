# Bug Report: Task Created in DB Without File

**Type:** Bug Investigation
**Priority:** P1
**Created:** 2026-02-09
**Task:** TASK-3252c671

## Summary

Task 3252c671 was created in the database but the corresponding markdown file was never written to disk. The agent claimed the task but could not proceed because there was no file containing the task description, context, or acceptance criteria.

## Investigation Findings

### What Happened

1. Task `3252c671` was created in DB at `2026-02-09 16:34:30`
2. Database record shows file_path: `.orchestrator/shared/queue/incoming/TASK-3252c671.md`
3. **File does not exist** at that path or in any other queue directory
4. Task title in DB is just `"3252c671"` (the task ID itself) - highly suspicious
5. No files were created in incoming/ around that time (last file: Feb 9 09:01)
6. Agent `orch-impl-1` claimed the task at `16:48:02` and immediately discovered the issue
7. This is the ONLY task from the last 24 hours with this issue

### Root Cause Analysis

The `create_task()` function in `queue_utils.py` writes BOTH:
1. The markdown file (`task_path.write_text(content)` at line 1390)
2. The database record (`db.create_task(...)` at line 1395)

Possible causes for file to be missing:
1. **Direct DB insertion**: Someone/something inserted the task into DB without calling `create_task()`
2. **Exception between operations**: Code crashed after DB insert but before file write (though this order would be unusual)
3. **File deletion**: File was created then immediately deleted (no evidence of this)

The suspicious title (just the task ID) suggests improper task creation - possibly a test or debug operation that went wrong.

## Impact

- Agent claimed an unworkable task and wasted time investigating
- Task sat in claimed queue blocking other work
- No way to recover the original intent of the task

## Current Status

- Task has been marked as **failed** in the database
- Task has been **unclaimed** (cleared claimed_by field)
- Investigation notes written to `.orchestrator/shared/notes/TASK-3252c671.md`
- Agent worktree branches created but no commits made (can be cleaned up)

## Recommendations

### 1. Add Task File Validation to Scheduler (Priority: HIGH)

Before claiming a task, the scheduler should verify that the task file exists:

```python
# In scheduler.py, before claiming a task:
from orchestrator.queue_utils import find_task_file

task_file = find_task_file(task_id)
if not task_file or not task_file.exists():
    logger.error(f"Task {task_id} has DB record but file is missing")
    # Mark as failed or escalate
    db.fail_task(task_id, "Task file missing - possible DB corruption")
    continue  # Skip this task
```

### 2. Add Integrity Check Script (Priority: MEDIUM)

Create a maintenance script to detect orphaned DB records:

```bash
.orchestrator/venv/bin/python orchestrator/scripts/check-task-integrity
```

Should check:
- Tasks in DB with missing files
- Files on disk with no DB records
- Tasks with suspicious titles (matching just the ID pattern)

### 3. Investigate Task Creation History (Priority: LOW)

Check git history, logs, or recent commands around `2026-02-09 16:34:30` to determine:
- Who/what created this task
- Was it a manual DB insertion?
- Was it a failed script execution?

## Questions for Human

1. **Do you know what task 3252c671 was supposed to be?** If you created it recently, we can recreate it properly.

2. **Should I implement the validation fix?** This would prevent agents from claiming tasks with missing files.

3. **Should we audit other tasks?** Check if there are other orphaned DB records that weren't caught.

## Actions Taken by Agent

- [x] Investigated the issue thoroughly
- [x] Documented findings in notes file
- [x] Marked task as failed in database
- [x] Unclaimed the task
- [x] Created this proposal for human review

## Proposed Next Steps

If approved:
1. Implement scheduler validation to check task file exists before claiming
2. Add test coverage for this scenario
3. Create integrity check script for maintenance
4. Document in architecture.md that all task creation must go through `create_task()`
