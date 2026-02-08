# /check-orchestrator-task - Review an Orchestrator Task

Review an orchestrator_impl task's work: check what changed in both the main boxen repo and the octopoid submodule, run tests, and assess readiness to merge.

**Argument:** `$ARGUMENTS` (task ID prefix, e.g. `cde4e596`)

## Steps

### 1. Look up the task

```bash
.orchestrator/venv/bin/python -c "
import sys; sys.path.insert(0, 'orchestrator')
from orchestrator.db import get_task
t = get_task('ARGUMENT')
if t: print(f'id={t[\"id\"]}\nrole={t[\"role\"]}\nqueue={t[\"queue\"]}\nclaimed_by={t[\"claimed_by\"]}\nturns={t[\"turns_used\"]}\ncommits={t[\"commits_count\"]}')
else: print('NOT FOUND')
"
```

Read the task file to understand what was requested:
```bash
# Check provisional first, then other queues
ls .orchestrator/shared/queue/provisional/TASK-ARGUMENT*.md 2>/dev/null || \
ls .orchestrator/shared/queue/*/TASK-ARGUMENT*.md 2>/dev/null
```

### 2. Find the agent's work

Orchestrator_impl agents work inside the `orchestrator/` submodule in their worktree, on a branch called `orch/<task-id>`.

Find the worktree with the branch:
```bash
# Check orch-impl-1 worktree (primary orchestrator agent)
cd .orchestrator/agents/orch-impl-1/worktree/orchestrator && \
  git log main..orch/<task-id> --oneline 2>/dev/null

# If not there, check other agent worktrees
```

### 3. Review submodule changes (octopoid)

Show what the agent changed in the orchestrator codebase:
```bash
cd .orchestrator/agents/orch-impl-1/worktree/orchestrator && \
  git diff main..orch/<task-id>
```

Read the changed files to understand the implementation.

### 4. Review boxen changes

Check if the agent also made changes to the main boxen repo (outside `orchestrator/`):
```bash
cd .orchestrator/agents/orch-impl-1/worktree && \
  git diff main --stat
```

### 5. Run orchestrator tests

Run pytest from the agent's worktree submodule against the feature branch:
```bash
cd .orchestrator/agents/orch-impl-1/worktree/orchestrator && \
  git checkout orch/<task-id> && \
  ./venv/bin/python -m pytest tests/ -v 2>&1
```

If the worktree doesn't have a venv, use the main one:
```bash
cd .orchestrator/agents/orch-impl-1/worktree/orchestrator && \
  git checkout orch/<task-id> && \
  /Users/maxwilliams/dev/boxen/.orchestrator/venv/bin/python -m pytest tests/ -v 2>&1
```

### 6. Present findings

Summarize:
- **What the task asked for** (from the task file)
- **What was changed** (files modified, approach taken)
- **Test results** (pass/fail, any failures)
- **Assessment** (ready to merge, needs work, or reject)

Then offer actions:
- `/approve-task <task-id>` — merge into both systems
- `/reject-task <task-id> "feedback"` — send back for rework
