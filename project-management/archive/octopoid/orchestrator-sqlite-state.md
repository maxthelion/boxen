# Draft: SQLite State Management for Orchestrator

## Problem

Current file-based state management causes issues:
- Tasks can end up in multiple queues (duplicates)
- Stale state persists after cleanup (status.json, needs_continuation)
- No atomic operations (move task + update agent state should be one transaction)
- Race conditions between agents claiming tasks
- Hard to query current state without scanning multiple directories
- **Agents mark tasks "done" without actual output** - no validation
- **Complex tasks fail repeatedly** - no escalation to planning phase

## Proposed Solution

SQLite database as **single source of truth for state**, with:
1. **Provisional completion** - agents mark "provisional", curator validates
2. **Validation workflow** - curator checks commits, tests before accepting
3. **Planning escalation** - failed tasks auto-escalate to planning phase

### Core Principle

**Files stay in one place, DB tracks all state, curator validates completion**

```
.orchestrator/
├── state.db              # SQLite database (source of truth)
├── shared/
│   └── tasks/            # ALL task markdown files (never move)
├── plans/                # Planning phase output documents
└── agents/
    └── {agent}/
        └── worktree/     # Agent working directories
```

---

## Task Lifecycle

```
                    ┌─────────────────────────────────────┐
                    │                                     │
                    ▼                                     │
┌─────────┐    ┌─────────┐    ┌─────────────┐    ┌──────┴─────┐
│ incoming│───▶│ claimed │───▶│ provisional │───▶│   done     │
└─────────┘    └─────────┘    └─────────────┘    └────────────┘
     ▲              │                │
     │              │                │ rejected
     │              ▼                ▼
     │         ┌─────────┐    ┌─────────────┐
     │         │ failed  │    │  planning   │◀── escalated
     │         └─────────┘    └─────────────┘
     │                               │
     └───────────────────────────────┘
              micro-tasks created
```

### States

| State | Description | Who transitions |
|-------|-------------|-----------------|
| `incoming` | Ready to be claimed | - |
| `claimed` | Agent working on it | Agent claims |
| `provisional` | Agent thinks it's done, awaiting validation | Agent submits |
| `done` | Validated complete | Curator accepts |
| `failed` | Unrecoverable failure | Curator rejects |
| `planning` | Needs exploration before execution | Curator escalates |
| `blocked` | Waiting on dependency | Auto (BLOCKED_BY) |

---

## Database Schema

```sql
-- Tasks table
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    queue TEXT NOT NULL DEFAULT 'incoming',
    priority TEXT DEFAULT 'P2',
    complexity TEXT,
    role TEXT,                          -- 'implement', 'test', 'review', 'plan'
    branch TEXT DEFAULT 'main',
    blocked_by TEXT,
    claimed_by TEXT,
    claimed_at DATETIME,
    submitted_at DATETIME,              -- When marked provisional
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Validation metrics (populated on provisional)
    commits_count INTEGER DEFAULT 0,
    files_changed INTEGER DEFAULT 0,
    tests_passed BOOLEAN,
    typecheck_passed BOOLEAN,
    turns_used INTEGER,
    max_turns INTEGER,

    -- Escalation tracking
    attempt_count INTEGER DEFAULT 0,    -- How many times claimed
    has_plan BOOLEAN DEFAULT FALSE,     -- Was this generated from a plan?
    plan_id TEXT,                       -- Link to planning task that created this

    FOREIGN KEY (blocked_by) REFERENCES tasks(id),
    FOREIGN KEY (plan_id) REFERENCES tasks(id)
);

-- Agents table
CREATE TABLE agents (
    name TEXT PRIMARY KEY,
    role TEXT,                          -- 'implementer', 'tester', 'reviewer', 'planner', 'curator'
    running BOOLEAN DEFAULT FALSE,
    paused BOOLEAN DEFAULT FALSE,
    pid INTEGER,
    current_task_id TEXT,
    last_run_start DATETIME,
    last_run_end DATETIME,
    consecutive_failures INTEGER DEFAULT 0,
    total_runs INTEGER DEFAULT 0,
    FOREIGN KEY (current_task_id) REFERENCES tasks(id)
);

-- Task history (audit trail)
CREATE TABLE task_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    event TEXT NOT NULL,
    agent TEXT,
    details TEXT,                       -- JSON blob with metrics, rejection reason, etc.
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id)
);

-- Plans table (output from planning tasks)
CREATE TABLE plans (
    id TEXT PRIMARY KEY,                -- e.g., "PLAN-fillet-fix"
    task_id TEXT NOT NULL,              -- The planning task that created this
    file_path TEXT NOT NULL,            -- Path to plan markdown
    status TEXT DEFAULT 'draft',        -- 'draft', 'approved', 'executing', 'complete'
    microtasks_created INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id)
);

-- Indexes for common queries
CREATE INDEX idx_tasks_queue ON tasks(queue);
CREATE INDEX idx_tasks_blocked_by ON tasks(blocked_by);
CREATE INDEX idx_tasks_claimed_by ON tasks(claimed_by);
CREATE INDEX idx_history_task ON task_history(task_id);
```

---

## Workflow Operations

### Agent Submits Completion (Provisional)

```python
def submit_completion(agent_name: str, task_id: str, metrics: dict) -> bool:
    """Agent marks task as provisionally complete. Curator will validate."""

    with db.transaction():
        task = db.get_task(task_id)
        if task.claimed_by != agent_name:
            return False

        # Record metrics from the run
        db.update_task(task_id,
            queue='provisional',
            submitted_at=now(),
            commits_count=metrics.get('commits', 0),
            files_changed=metrics.get('files_changed', 0),
            turns_used=metrics.get('turns_used', 0),
            max_turns=metrics.get('max_turns', 50),
        )

        db.update_agent(agent_name, current_task_id=None, running=False)
        db.add_history(task_id, 'submitted', agent_name, json.dumps(metrics))

    return True
```

### Curator Validates Completion

```python
def validate_completion(task_id: str) -> str:
    """Curator checks if task is actually complete. Returns action taken."""

    task = db.get_task(task_id)
    if task.queue != 'provisional':
        return 'not_provisional'

    # Run validation checks
    validation = run_validation(task)

    with db.transaction():
        if validation.passed:
            # Accept completion
            db.update_task(task_id, queue='done', completed_at=now())

            # Auto-promote blocked tasks
            promote_blocked_tasks(task_id)

            db.add_history(task_id, 'accepted', 'curator', json.dumps(validation))
            return 'accepted'

        elif should_escalate_to_planning(task, validation):
            # Task needs planning phase
            planning_task = create_planning_task(task)
            db.update_task(task_id, queue='blocked', blocked_by=planning_task.id)
            db.add_history(task_id, 'escalated_to_planning', 'curator',
                          json.dumps({'plan_task': planning_task.id}))
            return 'escalated'

        else:
            # Reject back to incoming for retry
            db.update_task(task_id,
                queue='incoming',
                claimed_by=None,
                claimed_at=None,
                submitted_at=None,
                attempt_count=task.attempt_count + 1,
            )
            db.add_history(task_id, 'rejected', 'curator',
                          json.dumps(validation.reasons))
            return 'rejected'


def run_validation(task) -> ValidationResult:
    """Check if task output is acceptable."""

    reasons = []

    # Check 1: Were commits made?
    if task.commits_count == 0:
        reasons.append('no_commits')

    # Check 2: Did agent use excessive turns without output?
    if task.turns_used and task.max_turns:
        turn_ratio = task.turns_used / task.max_turns
        if turn_ratio > 0.8 and task.commits_count == 0:
            reasons.append('exploration_exhaustion')

    # Check 3: Do tests pass? (if we ran them)
    if task.tests_passed is False:
        reasons.append('tests_failed')

    # Check 4: Does typecheck pass?
    if task.typecheck_passed is False:
        reasons.append('typecheck_failed')

    # Check 5: Is there actually a diff on the branch?
    branch_diff = check_branch_diff(task.branch)
    if not branch_diff.has_changes:
        reasons.append('no_branch_changes')

    return ValidationResult(
        passed=len(reasons) == 0,
        reasons=reasons,
    )


def should_escalate_to_planning(task, validation) -> bool:
    """Determine if task should escalate to planning phase."""

    # Already has a plan - don't re-plan
    if task.has_plan:
        return False

    # Explicit exploration exhaustion pattern
    if 'exploration_exhaustion' in validation.reasons:
        return True

    # Multiple failed attempts
    if task.attempt_count >= 2 and 'no_commits' in validation.reasons:
        return True

    # High complexity without plan
    if task.complexity in ('L', 'XL') and task.attempt_count >= 1:
        return True

    return False
```

### Planning Task Completion

```python
def complete_planning_task(task_id: str, plan_path: str) -> bool:
    """When a planning task completes, generate micro-tasks from the plan."""

    with db.transaction():
        task = db.get_task(task_id)

        # Parse the plan document
        plan = parse_plan_document(plan_path)

        # Create plan record
        plan_id = f"PLAN-{task.id.replace('TASK-', '')}"
        db.insert_plan(plan_id, task_id, plan_path)

        # Generate micro-tasks from plan
        previous_task_id = None
        for micro in plan.microtasks:
            micro_task_id = f"{task.id}-{micro.suffix}"

            db.insert_task(
                id=micro_task_id,
                file_path=create_microtask_file(micro, plan),
                queue='incoming' if not previous_task_id else 'blocked',
                priority=task.priority,
                complexity='S',  # Micro-tasks are always small
                role='implement',
                branch=task.branch,
                blocked_by=previous_task_id,
                has_plan=True,
                plan_id=plan_id,
            )

            previous_task_id = micro_task_id

        # Mark planning task complete
        db.update_task(task_id, queue='done', completed_at=now())
        db.update_plan(plan_id, status='executing', microtasks_created=len(plan.microtasks))

        # Unblock original task (now depends on micro-tasks)
        # Or: mark original as superseded

    return True
```

---

## Curator Agent

New agent role that runs validation loop:

```python
class CuratorAgent:
    """Validates provisional completions and manages task lifecycle."""

    def run(self):
        # Check provisional tasks
        provisional = db.get_tasks(queue='provisional')
        for task in provisional:
            action = validate_completion(task.id)
            log(f"Task {task.id}: {action}")

        # Check for stuck claimed tasks (agent died?)
        stuck = db.get_tasks(
            queue='claimed',
            claimed_at__lt=now() - timedelta(hours=1),
        )
        for task in stuck:
            reset_stuck_task(task.id)

        # Check completed planning tasks
        completed_plans = db.get_tasks(queue='done', role='plan')
        for task in completed_plans:
            if not db.plan_exists(task.id):
                complete_planning_task(task.id, find_plan_file(task.id))
```

---

## Migration Path

1. **Phase 1: Create DB alongside files**
   - Create state.db with schema
   - Scan existing directories to populate
   - Run both systems in parallel (DB + file moves)

2. **Phase 2: DB becomes source of truth**
   - Stop moving files between directories
   - Move all files to single `tasks/` directory
   - Update scripts to query DB

3. **Phase 3: Add provisional workflow**
   - Agents submit to provisional instead of done
   - Deploy curator agent
   - Add validation checks

4. **Phase 4: Add planning escalation**
   - Detect exploration exhaustion
   - Auto-create planning tasks
   - Generate micro-tasks from plans

---

## Queries

```sql
-- Dashboard: current state
SELECT queue, COUNT(*) as count FROM tasks GROUP BY queue;

-- Tasks ready to claim (for implementer)
SELECT * FROM tasks
WHERE queue = 'incoming'
  AND role = 'implement'
ORDER BY priority, created_at;

-- Agent workload
SELECT a.name, a.running, t.id as current_task, t.queue
FROM agents a
LEFT JOIN tasks t ON a.current_task_id = t.id;

-- Tasks that keep failing (candidates for planning)
SELECT * FROM tasks
WHERE attempt_count >= 2
  AND queue = 'incoming'
  AND has_plan = FALSE;

-- Validation failure reasons
SELECT
    json_extract(details, '$.reasons') as reasons,
    COUNT(*) as count
FROM task_history
WHERE event = 'rejected'
GROUP BY reasons;
```

---

## Benefits

1. **No false completions** - Curator validates before accepting
2. **Automatic escalation** - Failed tasks become planning tasks
3. **Metrics tracking** - Know why tasks fail (turns, commits, tests)
4. **Atomic operations** - No race conditions
5. **Queryable state** - Dashboard, analytics, debugging
6. **Audit trail** - Full history of every state change

## Effort Estimate

Medium-Large:
- Schema + basic operations: 1-2 days
- Curator agent: 1 day
- Planning escalation: 1-2 days
- Migration: 1 day
- Testing: 1-2 days
