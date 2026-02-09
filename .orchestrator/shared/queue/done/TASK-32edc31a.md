# [TASK-32edc31a] Queue manipulation utility scripts

ROLE: orchestrator_impl
PRIORITY: P2
BRANCH: main
CREATED: 2026-02-07T07:55:22.088627
CREATED_BY: human

## Context
Create reusable queue manipulation scripts in orchestrator/scripts/ for common operations that are currently done with ad-hoc Python one-liners.

These scripts are run by the interactive PM session to manage the orchestrator queue. They should use the existing orchestrator API (db.py, queue_utils.py) and follow the pattern of existing scripts like status.py and accept_all.py.

All scripts should be runnable with: .orchestrator/venv/bin/python orchestrator/scripts/<script>.py

## Scripts to Create

### 1. unclaim_task.py <task-id>
Move a task from claimed back to incoming. Clear claimed_by/claimed_at in DB and task file. Move the file from claimed/ to incoming/.
Use case: agent grabbed wrong task, need to reassign.

### 2. update_task.py <task-id> [--role ROLE] [--priority PRIORITY]  
Update task metadata in both DB and task file. Support changing role and priority.
Use case: reassign task to different agent type, change priority.

### 3. move_task.py <task-id> <target-queue>
Move a task between any queues (e.g., failed -> incoming, provisional -> incoming).
Update DB queue field and move the physical file.
Use case: retry failed tasks, manually requeue work.

### 4. cancel_task.py <task-id>
Remove a task from the queue entirely. Delete from DB and move file to a cancelled/ directory (not delete, for audit trail).
Use case: task no longer needed.

### 5. approve_task.py <task-id-or-pr-number>
Accept a provisional task, merge its PR (gh pr merge --merge), delete remote branch, move task to done, unblock dependents.
Should work with either a task ID prefix or PR number.
Use case: human approves completed work.

## Patterns to Follow

- See orchestrator/scripts/status.py and .orchestrator/scripts/accept_all.py for examples
- Use sys.path.insert to find orchestrator package
- Use orchestrator.db.get_connection for DB operations
- Use orchestrator.queue_utils functions where they exist
- Print clear output about what was done
- Handle errors gracefully (task not found, wrong queue, etc.)
- Support task ID prefix matching (first 8 chars)

## Acceptance Criteria
- [ ] unclaim_task.py moves claimed task back to incoming and clears claim metadata
- [ ] update_task.py updates role and priority in both DB and task file
- [ ] move_task.py moves tasks between any queue pair
- [ ] cancel_task.py removes task from DB and archives file to cancelled/
- [ ] approve_task.py accepts task, merges PR with --merge flag, deletes remote branch
- [ ] approve_task.py works with both task ID prefix and PR number
- [ ] All scripts handle errors gracefully (task not found, wrong state, etc.)
- [ ] All scripts print clear output about what they did
- [ ] Existing orchestrator tests still pass

CLAIMED_BY: orch-impl-1
CLAIMED_AT: 2026-02-07T08:04:20.008009

SUBMITTED_AT: 2026-02-07T08:08:53.086238
COMMITS_COUNT: 0
TURNS_USED: 200

ACCEPTED_AT: 2026-02-07T09:16:05.753991
ACCEPTED_BY: human
