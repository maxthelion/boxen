# SQLite Implementation: Open Questions & Decisions

## 1. Agent Metrics Reporting

**Question:** How do agents report `turns_used`, `commits_count`, etc.?

**Decision:** Wrapper script captures metrics, not the agent itself.

The agent runs inside a wrapper that:
1. Counts API turns (already possible via `--max-turns`)
2. Counts commits before/after: `git rev-list --count HEAD`
3. Checks for uncommitted changes: `git status --porcelain`
4. Runs typecheck/tests if configured

```python
# In orchestrator/agent_runner.py

def run_agent(agent_name: str, task_id: str):
    worktree = get_worktree(agent_name)

    # Snapshot before
    commits_before = git_commit_count(worktree)

    # Run agent
    result = subprocess.run([
        'claude', '-p', prompt,
        '--max-turns', '50',
        '--allowedTools', 'Read,Write,Edit,...'
    ], capture_output=True, cwd=worktree)

    # Snapshot after
    commits_after = git_commit_count(worktree)

    # Extract turns from claude output (if available) or estimate
    turns_used = parse_turns_from_output(result.stderr) or 50

    # Submit completion with metrics
    db.submit_completion(agent_name, task_id, {
        'commits': commits_after - commits_before,
        'turns_used': turns_used,
        'max_turns': 50,
        'exit_code': result.returncode,
        'has_uncommitted': has_uncommitted_changes(worktree),
    })
```

**Implementation:** Modify `orchestrator/agent_runner.py` to capture these metrics.

---

## 2. Plan Document Format

**Question:** What structure must planning tasks output for curator to parse?

**Decision:** Markdown with structured sections and a parseable micro-task table.

```markdown
# Plan: {TASK-ID}

## Root Cause
{Free text analysis}

## Code Path
{Free text with file:line references}

## Micro-Tasks

<!-- MICROTASKS START -->
| ID | Description | Files | Depends |
|----|-------------|-------|---------|
| a | Write failing test for X | src/foo.test.ts | - |
| b | Fix X in module Y | src/foo.ts | a |
| c | Add edge case tests | src/foo.test.ts | b |
<!-- MICROTASKS END -->

## Task Details

### Task a: Write failing test for X

**Files:** src/foo.test.ts

**Code:**
```typescript
// Exact code to write
```

### Task b: Fix X in module Y
...
```

**Parsing logic:**

```python
def parse_plan_document(path: str) -> Plan:
    content = read_file(path)

    # Extract micro-task table between markers
    table_match = re.search(
        r'<!-- MICROTASKS START -->\n(.*?)\n<!-- MICROTASKS END -->',
        content, re.DOTALL
    )

    if not table_match:
        raise PlanParseError("No micro-task table found")

    tasks = parse_markdown_table(table_match.group(1))

    # Extract code snippets for each task
    for task in tasks:
        section = extract_section(content, f"### Task {task.id}")
        task.code_snippet = extract_code_block(section)
        task.files = extract_files_line(section)

    return Plan(tasks=tasks)
```

**Validation:** Curator rejects planning task if:
- No `<!-- MICROTASKS -->` markers
- Table has no rows
- Task sections missing for table entries

---

## 3. Where to Implement

**Question:** In `orchestrator/` submodule (octopoid) or local fork?

**Decision:** Implement in local `.orchestrator/` first, then upstream to octopoid.

**Rationale:**
- Faster iteration without submodule commit dance
- Can test with real boxen tasks
- Octopoid can remain stable for other projects
- Once proven, extract and upstream

**Approach:**
1. Create `.orchestrator/lib/db.py` locally (outside submodule)
2. Modify local copies of queue_utils, agent_runner
3. Keep submodule for reference but don't use it
4. After stable, PR changes to octopoid

**Directory structure during development:**
```
.orchestrator/
├── lib/                    # NEW: Local Python modules
│   ├── db.py              # SQLite operations
│   ├── curator.py         # Curator logic
│   └── plan_parser.py     # Plan document parsing
├── state.db               # SQLite database
├── shared/
│   └── tasks/             # All task files
└── agents/
```

---

## 4. Dashboard/Scripts Updates

**Question:** How do scripts query DB instead of filesystem?

**Decision:** Python scripts with SQLite queries, shell wrappers for convenience.

**New scripts:**

```bash
# .orchestrator/scripts/db-status.py
#!/usr/bin/env python3
import sqlite3
import json

db = sqlite3.connect('.orchestrator/state.db')
db.row_factory = sqlite3.Row

# Queue counts
counts = db.execute('''
    SELECT queue, COUNT(*) as count
    FROM tasks
    GROUP BY queue
''').fetchall()

print("=== TASK STATUS ===\n")
print("  ".join(f"{r['queue'].title()}: {r['count']}" for r in counts))

# Incoming details
incoming = db.execute('''
    SELECT id, priority, complexity
    FROM tasks
    WHERE queue = 'incoming'
    ORDER BY priority, created_at
''').fetchall()

if incoming:
    print("\nINCOMING:")
    for t in incoming:
        print(f"  [{t['priority']}] {t['id']} ({t['complexity']})")

# ... similar for other queues
```

**Shell wrapper:**
```bash
# .orchestrator/scripts/task-status.sh
#!/bin/bash
python3 "$(dirname "$0")/db-status.py" "$@"
```

**Migration:** Keep old filesystem scripts during transition, add `--db` flag to switch.

---

## 5. Testing the Migration

**Question:** How to test without breaking running system?

**Decision:** Shadow mode - DB runs alongside filesystem, compare results.

**Phase 1: Shadow writes**
```python
def claim_task(agent_name, task_id):
    # Old behavior (filesystem)
    move_file(task_path, 'claimed/')

    # New behavior (DB) - shadow write
    if DB_SHADOW_MODE:
        db.update_task(task_id, queue='claimed', claimed_by=agent_name)

        # Verify consistency
        fs_state = get_filesystem_state(task_id)
        db_state = db.get_task(task_id)
        if fs_state != db_state:
            log_inconsistency(task_id, fs_state, db_state)
```

**Phase 2: DB primary with filesystem backup**
```python
def claim_task(agent_name, task_id):
    # New behavior (DB) - primary
    db.update_task(task_id, queue='claimed', claimed_by=agent_name)

    # Old behavior (filesystem) - backup/compatibility
    if FILESYSTEM_BACKUP:
        move_file(task_path, 'claimed/')
```

**Phase 3: DB only**
- Remove filesystem moves
- Single `tasks/` directory
- Scripts query DB only

**Test suite:**
```python
# tests/test_db_operations.py
def test_claim_is_atomic():
    """Two agents can't claim same task."""

def test_provisional_requires_metrics():
    """Can't submit without commits_count."""

def test_blocked_auto_promotes():
    """Completing blocker promotes blocked task."""

def test_planning_escalation():
    """High complexity + 2 failures = planning task."""
```

---

## 6. Curator Scheduling

**Question:** New agent or enhancement? How often?

**Decision:** New lightweight agent, runs every 30 seconds.

**Rationale:**
- Separate from existing curator (which manages task creation)
- Validation should be fast and frequent
- Doesn't need worktree or heavy setup

**Configuration in agents.yaml:**
```yaml
agents:
  - name: validator
    role: validator          # New role
    interval_seconds: 30     # Frequent checks
    lightweight: true        # No worktree needed
```

**Implementation:**
```python
# orchestrator/roles/validator.py

class ValidatorAgent:
    """Lightweight agent that validates provisional completions."""

    def run(self):
        # 1. Check provisional tasks
        for task in db.get_tasks(queue='provisional'):
            self.validate(task)

        # 2. Check stuck claimed tasks (>1 hour)
        for task in db.get_stuck_tasks(hours=1):
            self.reset_stuck(task)

        # 3. Process completed planning tasks
        for task in db.get_tasks(queue='done', role='plan'):
            if not db.has_generated_microtasks(task.id):
                self.generate_microtasks(task)

    def validate(self, task):
        result = run_validation_checks(task)

        if result.passed:
            db.accept_completion(task.id)
        elif should_escalate(task, result):
            db.escalate_to_planning(task.id)
        else:
            db.reject_completion(task.id, result.reasons)
```

**Note:** Rename existing "curator" to "task-creator" or "pm-agent" to avoid confusion.

---

## 7. needs_continuation Handling

**Question:** Drop entirely or migrate to DB flag?

**Decision:** Drop it. The provisional + planning flow replaces it.

**Current behavior:**
- Agent hits max turns with uncommitted work
- Task moves to `needs_continuation/`
- Same or another agent resumes

**Problems:**
- Stale tasks accumulate
- No validation that continuation is useful
- Agents often re-explore from scratch anyway

**New behavior:**
- Agent submits as `provisional` with metrics
- Curator sees `turns_used ≈ max_turns` + `commits = 0`
- Triggers planning escalation instead of blind retry
- Planning task produces micro-tasks sized for single runs

**Migration:**
```python
def migrate_needs_continuation():
    for task_file in glob('needs_continuation/*.md'):
        task_id = extract_task_id(task_file)

        # Move to incoming with high attempt_count
        db.insert_task(
            id=task_id,
            queue='incoming',
            attempt_count=2,  # Will trigger planning on next failure
            file_path=move_to_tasks_dir(task_file),
        )

    # Remove needs_continuation directory
    rmdir('needs_continuation/')
```

---

## 8. SKIP_PR / BLOCKED_BY Handling

**Question:** Keep parsing from markdown or move to DB?

**Decision:** Hybrid - parse on ingest, store in DB, DB is authoritative.

**On task creation/import:**
```python
def ingest_task(file_path: str):
    content = read_file(file_path)
    metadata = parse_frontmatter(content)

    db.insert_task(
        id=metadata.get('id') or generate_id(),
        file_path=file_path,
        priority=metadata.get('PRIORITY', 'P2'),
        complexity=metadata.get('COMPLEXITY'),
        role=metadata.get('ROLE', 'implement'),
        branch=metadata.get('BRANCH', 'main'),
        skip_pr=metadata.get('SKIP_PR', False),
        blocked_by=metadata.get('BLOCKED_BY'),  # Stored in DB
    )
```

**DB is authoritative:**
- Once ingested, DB fields are truth
- Markdown file is for human readability / agent context
- Changes to DB don't update markdown (one-way sync)

**Blocked task handling:**
```python
def check_blocked_tasks():
    """Promote tasks whose blockers are done."""

    blocked = db.execute('''
        SELECT t.id, t.blocked_by
        FROM tasks t
        WHERE t.queue = 'blocked'
          AND t.blocked_by IS NOT NULL
    ''').fetchall()

    for task in blocked:
        blocker = db.get_task(task['blocked_by'])
        if blocker and blocker['queue'] == 'done':
            db.update_task(task['id'],
                queue='incoming',
                blocked_by=None
            )
            log(f"Promoted {task['id']} - blocker {blocker['id']} done")
```

**SKIP_PR handling:**
```python
def on_task_complete(task_id: str):
    task = db.get_task(task_id)

    if task['skip_pr']:
        # Merge directly to branch
        merge_to_branch(task['branch'])
    else:
        # Create PR
        create_pull_request(task)
```

---

## Summary of Decisions

| Question | Decision |
|----------|----------|
| Agent metrics | Wrapper captures, not agent |
| Plan format | Markdown with `<!-- MICROTASKS -->` markers |
| Where to implement | Local first, upstream later |
| Scripts | Python + SQLite, shell wrappers |
| Testing migration | Shadow mode, then flip |
| Curator scheduling | New `validator` agent, 30s interval |
| needs_continuation | Drop, replaced by planning flow |
| SKIP_PR/BLOCKED_BY | Parse on ingest, DB authoritative |

## Implementation Order

1. **DB schema + basic operations** (claim, submit, validate)
2. **Ingest existing tasks** (populate DB from filesystem)
3. **Shadow mode** (DB writes alongside filesystem)
4. **Validator agent** (check provisional, escalate)
5. **Planning task support** (parse plans, generate micro-tasks)
6. **Flip to DB primary** (stop filesystem moves)
7. **Cleanup** (remove old directories, update scripts)
