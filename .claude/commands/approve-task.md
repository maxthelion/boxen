# /approve-task - Approve and Merge Task

Approve a provisional task: merge its PR, move it to done, clean up.

**Argument:** Task ID prefix or PR number (e.g. `971e8e18` or `53`)

## Steps

### 1. Identify the task

If the argument looks like a PR number (all digits), look up the PR:
```bash
gh pr view <number> --json number,title,headRefName,state
```
Extract the task ID from the branch name (format: `agent/<task-id>-<timestamp>`).

If the argument is a task ID, find the matching PR:
```bash
gh pr list --state open --json number,title,headRefName --jq '.[] | select(.headRefName | contains("<task-id>"))'
```

Also look up the task in the DB:
```bash
.orchestrator/venv/bin/python -c "
import sys; sys.path.insert(0, 'orchestrator')
from orchestrator.db import get_connection
with get_connection() as conn:
    rows = conn.execute(\"SELECT id, role, queue FROM tasks WHERE id LIKE '<task-id>%'\").fetchall()
    for r in rows: print(f'id={r[0]} role={r[1]} queue={r[2]}')
"
```

### 2. Route by task role

**If `role=orchestrator_impl`:** Run the orchestrator approval script:
```bash
.orchestrator/venv/bin/python .orchestrator/scripts/approve_orchestrator_task.py <task-id>
```
This handles the full flow: push submodule, update ref on main, commit, push, accept in DB. Skip to step 5.

**If regular task:** Continue to step 3.

### 3. Merge the PR (regular tasks only)

```bash
gh pr merge <number> --merge --delete-branch
```

### 4. Accept the task in the DB (regular tasks only)

```bash
.orchestrator/venv/bin/python -c "
import sys; sys.path.insert(0, 'orchestrator')
from orchestrator.queue_utils import accept_completion
from orchestrator.config import get_queue_dir

task_id = '<task-id>'
for subdir in ['provisional', 'incoming', 'claimed']:
    task_file = get_queue_dir() / subdir / f'TASK-{task_id}.md'
    if task_file.exists():
        accept_completion(str(task_file), validator='human')
        print(f'Task {task_id} moved to done')
        break
else:
    print(f'Task file not found for {task_id}')
"
```

### 5. Report result

Show:
- Task ID and title
- PR number and merge status (or "submodule updated" for orchestrator tasks)
- Whether dependent tasks were unblocked
