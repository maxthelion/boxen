# /approve-task - Approve and Merge Task

Approve a provisional task: merge its PR, move it to done, clean up.

**Argument:** `$ARGUMENTS` (task ID prefix or PR number, e.g. `971e8e18` or `53`)

## Steps

### 1. Check task role

Look up the task in the DB to determine routing:
```bash
.orchestrator/venv/bin/python -c "
import sys; sys.path.insert(0, 'orchestrator')
from orchestrator.db import get_task
t = get_task('ARGUMENT')
if t: print(f'id={t[\"id\"]} role={t[\"role\"]} queue={t[\"queue\"]}')
else: print('NOT FOUND')
"
```

### 2. Run the appropriate approval script

**If `role=orchestrator_impl`:**
```bash
.orchestrator/venv/bin/python .orchestrator/scripts/approve_orchestrator_task.py <task-id>
```

**Otherwise (regular task):**
```bash
.orchestrator/venv/bin/python orchestrator/scripts/approve_task.py <task-id-or-pr-number>
```

Both scripts handle: DB update, file move, PR merge, and error reporting.

### 3. Report result

Show:
- Task ID and title
- PR number and merge status (or "submodule updated" for orchestrator tasks)
- Whether dependent tasks were unblocked
