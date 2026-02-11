# Task Files: Single Directory, DB-Driven State

**Status:** Idea
**Captured:** 2026-02-11
**Depends On:** Entity storage groundwork (drafts 031, tasks e11a484b, 58e22e70, 74275260)

## Raw

> "after this work completes, I think we should change things so that no files are in the queue directory, or at least there is no movement around directories for tasks. They can reference a tasks directory in project management"

## Idea

Complete the entity storage migration for tasks: stop moving task files between queue directories, store them in a single location like `project-management/tasks/`, and track all lifecycle state purely in the database.

## Current State (The Problem)

Task files physically move between directories as they transition through the queue:

```
.orchestrator/shared/queue/
  incoming/TASK-abc123.md       (queue='incoming')
  claimed/TASK-abc123.md        (queue='claimed')
  provisional/TASK-abc123.md    (queue='provisional')
  done/TASK-abc123.md          (queue='done')
  failed/TASK-abc123.md        (queue='failed')
```

**Issues:**
1. **File path changes constantly** - every queue transition requires `mv` + DB update
2. **Two sources of truth** - DB `queue` column AND file location must agree
3. **Complexity** - every queue operation touches filesystem + DB
4. **Hard to debug** - "where is task abc123?" requires checking 7+ directories
5. **Orphan risk** - file move succeeds but DB update fails → orphan file
6. **Race conditions** - scheduler globs directories, but files can move mid-read

## Target State

**One directory. DB is source of truth.**

```
project-management/tasks/
  TASK-abc123.md              (queue tracked in DB only)
  TASK-def456.md
  TASK-ghi789.md
```

**Or keep in orchestrator directory:**

```
.orchestrator/shared/tasks/
  TASK-abc123.md
  TASK-def456.md
```

The file **never moves**. Queue state lives purely in the database.

## How It Works

### File Creation

```python
def create_task(title, role, ...):
    task_id = generate_id()
    file_path = f"project-management/tasks/TASK-{task_id}.md"

    # Write file ONCE
    write_task_file(file_path, title, role, ...)

    # Insert DB row with file_path
    db.execute("""
        INSERT INTO tasks (id, file_path, queue, ...)
        VALUES (?, ?, 'incoming', ...)
    """, (task_id, file_path, ...))

    return task_id
```

The `file_path` is stored in the DB and **never changes**.

### Queue Transitions

```python
def claim_task(task_id, agent_name):
    # NO file move, just DB update
    db.execute("""
        UPDATE tasks
        SET queue='claimed', claimed_by=?, claimed_at=?
        WHERE id=?
    """, (agent_name, now(), task_id))
```

No `mv`, no directory scanning, no "where did the file go?"

### Finding Tasks

**Scheduler:**
```python
# Old way: glob directories
tasks = glob(".orchestrator/shared/queue/incoming/*.md")

# New way: query DB
tasks = db.execute("""
    SELECT id, file_path FROM tasks WHERE queue='incoming'
""").fetchall()

for task in tasks:
    content = read_file(task['file_path'])
```

**Human lookup:**
```bash
# Old way: search 7 directories
find .orchestrator/shared/queue -name "TASK-abc123.md"

# New way: query DB for file path
sqlite3 .orchestrator/state.db "SELECT file_path FROM tasks WHERE id='abc123'"
# Output: project-management/tasks/TASK-abc123.md
```

## Migration Strategy

### Phase 1: Add `file_path` Column

```sql
ALTER TABLE tasks ADD COLUMN file_path TEXT;
```

Backfill existing tasks with current file locations.

### Phase 2: Update Queue Operations

**Stop moving files.** Update all queue transition functions:

```python
def move_task_to_claimed(task):
    # Old: mv file + update DB
    old_path = f".orchestrator/shared/queue/incoming/TASK-{task.id}.md"
    new_path = f".orchestrator/shared/queue/claimed/TASK-{task.id}.md"
    shutil.move(old_path, new_path)
    db.update_task_queue(task.id, 'claimed')

    # New: update DB only
    db.update_task_queue(task.id, 'claimed')
    # file_path stays unchanged in DB
```

### Phase 3: Consolidate Files

**One-time migration:**

```python
# Move all task files to single directory
for queue in ['incoming', 'claimed', 'provisional', 'done', 'failed', ...]:
    files = glob(f".orchestrator/shared/queue/{queue}/TASK-*.md")
    for file in files:
        task_id = extract_id(file)
        new_path = f"project-management/tasks/{basename(file)}"
        shutil.move(file, new_path)
        db.execute("UPDATE tasks SET file_path=? WHERE id=?", (new_path, task_id))
```

After migration:
- All files in `project-management/tasks/` (or `.orchestrator/shared/tasks/`)
- Old queue directories empty (can delete)
- All code queries DB for file_path

### Phase 4: Update All Consumers

**Scripts and tools:**
- Status script: reads file_path from DB
- Task creation: writes to tasks/ directory
- Skill commands: query DB, not glob directories
- Agent prompts: reference tasks/ directory

### Phase 5: Archive/Cleanup

For completed tasks, optionally:
- Keep in `project-management/tasks/` (queryable history)
- Move to `project-management/archive/tasks/YYYY-MM/` (organized by month)
- Update DB file_path if moved

## Benefits

### 1. Single Source of Truth
- DB `queue` column IS the queue
- No "file says X, DB says Y" inconsistencies
- No orphan files (file exists with no DB row, or vice versa)

### 2. Simpler Operations
- Queue transition = single DB UPDATE
- No file I/O during state changes
- Fewer error cases (file move can fail in ways DB updates can't)

### 3. Easier Debugging
- "Where is task abc123?" → query DB once
- File path never changes, so logs/notes stay valid
- Can add DB index on file_path for fast lookups

### 4. Better Atomic Operations
- DB transaction covers all state changes
- No partial state (file moved but DB not updated)
- Rollback is simple (revert DB transaction)

### 5. Flexible Archival
- Tasks can stay in place indefinitely (no mandatory moves)
- Archive by month/year/project via file_path update
- Keep task history queryable without moving files

### 6. Consistent Model
After this migration, ALL entities follow the same pattern:

| Entity | Content File | Status |
|--------|-------------|--------|
| Task | `project-management/tasks/TASK-<id>.md` | `tasks.queue` |
| Draft | `project-management/drafts/<domain>/<slug>.md` | `drafts.status` |
| Project | `project-management/projects/<slug>.md` | `projects.status` |

One rule: **file for content, DB for state**.

## Implementation Checklist

- [ ] **Phase 1: Schema**
  - [ ] Add `file_path` column to tasks table
  - [ ] Backfill existing tasks with current paths
  - [ ] Add index on file_path for lookups

- [ ] **Phase 2: Update Queue Operations**
  - [ ] Remove file moves from claim_task()
  - [ ] Remove file moves from submit_completion()
  - [ ] Remove file moves from accept_completion()
  - [ ] Remove file moves from fail_task()
  - [ ] Remove file moves from reset_task()
  - [ ] Remove file moves from all queue utils

- [ ] **Phase 3: Consolidate Files**
  - [ ] Create project-management/tasks/ directory
  - [ ] Move all task files from queue/* to tasks/
  - [ ] Update DB file_path for all tasks
  - [ ] Delete empty queue directories

- [ ] **Phase 4: Update Consumers**
  - [ ] Status script: query DB for file_path
  - [ ] create_task.py: write to tasks/ directory
  - [ ] Skill commands: use DB lookups
  - [ ] Agent prompts: reference tasks/ directory
  - [ ] Scheduler: query DB, not glob

- [ ] **Phase 5: Tests**
  - [ ] Test task creation writes to tasks/
  - [ ] Test queue transitions don't move files
  - [ ] Test DB queries find tasks by queue
  - [ ] All existing tests still pass

## Open Questions

1. **Where to store task files?**
   - Option A: `project-management/tasks/` (visible in project management area)
   - Option B: `.orchestrator/shared/tasks/` (keeps orchestrator files together)
   - Recommendation: A (aligns with drafts, projects, makes tasks more visible)

2. **Archive strategy?**
   - Keep all tasks in tasks/ forever (simple, queryable)?
   - Move done tasks to archive/tasks/YYYY-MM/ (organized)?
   - Recommendation: Keep in place, archive optional

3. **Backward compatibility?**
   - Support old queue directory reads during migration?
   - Recommendation: No, clean cutover after migration script runs

4. **Error handling?**
   - What if file_path in DB points to missing file?
   - Recommendation: Treat as error, log, skip (file was deleted manually)

## Dependencies

**Prerequisite:** Entity storage groundwork tasks must complete first:
- ✅ TASK-e11a484b: Drafts table (merged)
- 🔄 TASK-58e22e70: /draft-idea DB integration (in progress)
- ⏸️ TASK-74275260: Projects directory (queued)

This work builds on the same pattern: file for content, DB for state.

## Effort Estimate

- **Phase 1-2:** 2-3 days (schema + queue operations)
- **Phase 3:** 1 day (file consolidation migration)
- **Phase 4:** 2-3 days (update consumers)
- **Phase 5:** 1-2 days (tests)

**Total: ~1-1.5 weeks**

## Risk Assessment

**Low risk.** This is a **simplification** - removing file moves is safer than adding them. The migration script is idempotent (can re-run safely).

**Rollback:** Keep old queue directories archived for 1 week. If issues arise, revert DB and move files back.

## Success Metrics

- **Zero file moves** during queue transitions (measure via strace or audit log)
- **No orphan files** (all files in tasks/ have DB rows, all DB rows have files)
- **Queue queries use DB only** (no glob() calls in hot paths)
- **Simpler code** (fewer lines in queue_utils.py after removing move logic)

## Related Drafts

- **031-entity-storage-model.md**: Defines the overall pattern (file for content, DB for state)
- This draft completes the tasks portion of that vision
