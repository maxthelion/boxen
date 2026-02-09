# Plan: Breakdown Queue & Projects

**Date:** 2026-02-05
**Status:** Draft
**Source:** [project-breakdown-system.md](../project-management/drafts/project-breakdown-system.md)

## Goal

Enable throwing work to agents asynchronously by implementing:
1. **Projects** - containers for multi-task features (single branch, single PR)
2. **Breakdown queue** - where large work goes for decomposition
3. **Breakdown agent** - dedicated role that decomposes work consistently

## Scope

**In scope:**
- Database schema for projects
- `breakdown` queue status
- Breakdown agent role and rules
- `/send-to-queue` command (quick win for async handoff)
- `/project-status` command
- Project → task linking

**Out of scope (for now):**
- Messaging system
- Recommendation consolidation
- Auditor agents

## Phase 1: Database Schema

### 1.1 Add projects table

```sql
CREATE TABLE projects (
    id TEXT PRIMARY KEY,              -- PROJ-xxx
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'draft',      -- draft | active | complete | abandoned
    branch TEXT,                      -- feature/xxx
    base_branch TEXT DEFAULT 'main',
    created_at TEXT,
    created_by TEXT,                  -- 'human' or agent name
    completed_at TEXT
);
```

### 1.2 Add project_id to tasks

```sql
ALTER TABLE tasks ADD COLUMN project_id TEXT REFERENCES projects(id);
```

### 1.3 Add breakdown queue status

The existing `queue` column already supports arbitrary values. Add `'breakdown'` as valid status.

Update `db.py`:
- `list_tasks(queue='breakdown')`
- `claim_task()` to support breakdown role

### Files to modify:
- `orchestrator/orchestrator/db.py` - schema changes, new functions
- `orchestrator/orchestrator/migrate.py` - migration for existing DBs

## Phase 2: Project Management

### 2.1 Create project functions in db.py

```python
def create_project(
    project_id: str,
    title: str,
    description: str = None,
    base_branch: str = 'main',
    created_by: str = 'human'
) -> dict:
    """Create a new project."""

def get_project(project_id: str) -> dict | None:
    """Get project by ID."""

def list_projects(status: str = None) -> list[dict]:
    """List projects, optionally filtered by status."""

def update_project(project_id: str, **kwargs) -> dict:
    """Update project fields."""

def get_project_tasks(project_id: str) -> list[dict]:
    """Get all tasks belonging to a project."""

def activate_project(project_id: str) -> dict:
    """Activate project: create branch, set status to active."""
```

### 2.2 Project file format (for visibility)

```
.orchestrator/shared/projects/PROJ-fillet-all-corners.yaml
```

```yaml
id: PROJ-fillet-all-corners
title: "Add fillet support for all panel corners"
description: |
  Enable users to apply fillets to any eligible corner,
  not just the 4 main corners.
status: active
branch: feature/fillet-all-corners
base_branch: main
created_at: 2026-02-05T10:00:00
created_by: human
```

### Files to modify:
- `orchestrator/orchestrator/db.py` - project CRUD
- `orchestrator/orchestrator/queue_utils.py` - project helpers

## Phase 3: Breakdown Agent

### 3.1 Agent configuration

Add to `agents.yaml`:

```yaml
- name: breakdown-agent
  role: breakdown
  interval_seconds: 60
  pre_check: "python -c \"from orchestrator.orchestrator.db import count_tasks; print(count_tasks('breakdown'))\""
  pre_check_trigger: non_empty
```

### 3.2 Breakdown rules prompt

Create `.orchestrator/prompts/breakdown.md`:

```markdown
# Breakdown Agent Rules

You decompose large tasks and projects into right-sized implementation tasks.

## Sizing Rules
- Tasks should be completable in <30 Claude turns
- One clear objective per task
- If unsure, err toward smaller

## Ordering Rules
1. Testing strategy task FIRST
2. Schema/type changes early (others depend on them)
3. Core logic before UI wiring
4. Integration tests after implementation

## Output Format
For each task, specify:
- Clear title
- Acceptance criteria (checkboxes)
- BLOCKED_BY dependencies
- Estimated complexity (S/M/L)

## Dependencies
- Use BLOCKED_BY for sequential work
- Parallelize where possible
- Identify shared utilities needed by multiple tasks
```

### 3.3 Breakdown role implementation

Create `orchestrator/orchestrator/roles/breakdown.py`:

```python
class BreakdownRole(BaseRole):
    """Decomposes projects and large tasks into implementation tasks."""

    def run(self):
        # 1. Claim from breakdown queue
        task = claim_task(role_filter='breakdown')
        if not task:
            return 0

        # 2. Check if it's a project or standalone task
        project_id = task.get('project_id')

        # 3. Load breakdown rules from prompts
        rules = load_prompt('breakdown.md')

        # 4. Run Claude to decompose
        subtasks = self.decompose(task, rules)

        # 5. Create tasks in incoming queue
        for subtask in subtasks:
            create_task(
                task_id=generate_task_id(),
                title=subtask['title'],
                project_id=project_id,
                branch=task.get('branch'),
                blocked_by=subtask.get('blocked_by'),
                priority=task.get('priority', 'P2'),
            )

        # 6. Mark original as complete
        complete_task(task['file_path'], f"Decomposed into {len(subtasks)} tasks")

        return 0
```

### Files to create:
- `orchestrator/orchestrator/roles/breakdown.py`
- `.orchestrator/prompts/breakdown.md`

### Files to modify:
- `orchestrator/orchestrator/scheduler.py` - register breakdown role
- `.orchestrator/agents.yaml` - add breakdown-agent

## Phase 4: Slash Commands

### 4.1 /send-to-queue

Quick win: capture current discussion and create task for async processing.

Create `.claude/commands/send-to-queue.md`:

```markdown
# /send-to-queue - Send Work to Agents

Capture the current discussion and create a task for async processing.

## Usage
/send-to-queue [title]

## Behavior
1. Summarize the current discussion context
2. Ask: "Is this a project (multi-task) or single task?"
3. If project: create in breakdown queue
4. If task: create in incoming queue (or breakdown if large)
5. Confirm creation and exit interactive wait

## Example
User: "Let's add undo support to the editor"
[discussion about approach]
User: /send-to-queue "Add undo support"
→ Creates PROJ-add-undo-support in breakdown queue
→ "Created project. Breakdown agent will decompose. You can check status with /project-status"
```

### 4.2 /project-status

Create `.claude/commands/project-status.md`:

```markdown
# /project-status - Show Project Status

## Usage
/project-status [project-id]

## Without argument
Shows all active projects with task counts.

## With argument
Shows detailed status:
- Project metadata
- All tasks with status
- Dependency graph
- Blockers
```

### Files to create:
- `.claude/commands/send-to-queue.md`
- `.claude/commands/project-status.md`

## Phase 5: Integration

### 5.1 Task creation with project linking

Update `queue_utils.create_task()`:

```python
def create_task(
    # ... existing params ...
    project_id: str = None,  # NEW
):
    # ... existing logic ...

    if project_id:
        # Inherit branch from project
        project = get_project(project_id)
        if project and not branch:
            branch = project.get('branch')
```

### 5.2 Project completion detection

When all tasks in a project are done:

```python
def check_project_completion(project_id: str):
    tasks = get_project_tasks(project_id)
    if all(t['queue'] == 'done' for t in tasks):
        update_project(project_id, status='ready-for-pr')
        # Notify or auto-create PR
```

### 5.3 PR creation for projects

Update PR coordinator to handle projects:
- Aggregate all task descriptions
- Create single PR for project branch
- Link to all tasks in description

## Implementation Order

| Order | Item | Effort | Enables |
|-------|------|--------|---------|
| 1 | DB schema (projects table, project_id) | S | Everything else |
| 2 | Project CRUD functions | S | Project management |
| 3 | `/send-to-queue` command | M | Async handoff (quick win) |
| 4 | Breakdown queue status | S | Breakdown agent |
| 5 | Breakdown role implementation | M | Automatic decomposition |
| 6 | Breakdown rules prompt | S | Consistent decomposition |
| 7 | `/project-status` command | S | Visibility |
| 8 | Project completion detection | S | PR creation |
| 9 | PR coordinator updates | M | Single PR per project |

## Testing

### Unit tests
- Project CRUD operations
- Task-project linking
- Breakdown queue claiming

### Integration tests
- Create project → breakdown → tasks created
- Task completion → project status update
- Project completion → PR creation

### Manual verification
- `/send-to-queue` creates correct structure
- Breakdown agent produces sensible decomposition
- `/project-status` shows accurate state

## Rollback

If issues arise:
1. Projects table is additive (doesn't break existing)
2. `breakdown` queue status is just a value (tasks can be moved to `incoming`)
3. Breakdown agent can be paused
4. `/send-to-queue` can fall back to creating simple tasks

## Success Criteria

- [ ] Can create project from interactive discussion with `/send-to-queue`
- [ ] Breakdown agent decomposes projects into tasks
- [ ] Tasks inherit branch from project
- [ ] Dependencies respected (BLOCKED_BY)
- [ ] Project completion triggers PR creation
- [ ] User doesn't wait at prompt for implementation
