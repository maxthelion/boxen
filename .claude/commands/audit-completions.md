# /audit-completions - Detect Failed Explorer Tasks

Find tasks marked "done" that show signs of exploration exhaustion (no actual work done).

## Usage

```
/audit-completions [--fix]
```

## What It Detects

### Red Flags

1. **No commits on branch** - Task claims "merged" but branch has no new commits
2. **No file changes** - Task completed but git diff is empty
3. **Plan incomplete** - agent's plan.md shows unchecked steps
4. **Stale plan** - plan.md references a different task (wasn't updated)
5. **Generic result** - Result section just says "Merged directly to X" with no details

### Signs of Exploration Exhaustion

- Agent spent all turns reading files
- No Write/Edit tool calls in session
- Repeated reads of same files
- Plan shows "exploring" but no implementation steps checked

## Manual Audit Process

### 1. Check Recent Done Tasks

```bash
# List recently completed tasks
ls -lt .orchestrator/shared/queue/done/ | head -10
```

### 2. For Each Task, Verify Commits

```bash
# Get branch from task file
grep "^BRANCH:" .orchestrator/shared/queue/done/TASK-xxx.md

# Check for commits after task was created
git log --oneline origin/<branch> --since="<task-created-date>" | head -5
```

### 3. Check for Actual Changes

```bash
# Compare branch to base
git diff main..origin/<branch> --stat
```

### 4. Check Agent's Plan

```bash
# Was plan updated for this task?
cat .orchestrator/agents/<agent>/plan.md

# Look for:
# - Correct task ID in title
# - Checked steps [x]
# - Progress log entries
```

## Automated Checks

Run these to find suspicious completions:

```bash
# Find tasks completed in last hour with no recent commits
for task in .orchestrator/shared/queue/done/TASK-*.md; do
  task_id=$(basename "$task" .md)
  branch=$(grep "^BRANCH:" "$task" | cut -d' ' -f2)
  completed=$(grep "^COMPLETED_AT:" "$task" | cut -d' ' -f2)

  if [ -n "$branch" ]; then
    commits=$(git log --oneline "origin/$branch" --since="1 hour ago" 2>/dev/null | wc -l)
    if [ "$commits" -eq 0 ]; then
      echo "SUSPICIOUS: $task_id - 0 commits on $branch"
    fi
  fi
done
```

## What To Do With Failed Tasks

### Option 1: Move Back to Incoming

```bash
# Remove completion markers and move back
mv .orchestrator/shared/queue/done/TASK-xxx.md .orchestrator/shared/queue/incoming/

# Edit file to remove CLAIMED_BY, CLAIMED_AT, COMPLETED_AT, Result section
```

### Option 2: Decompose the Task

If task has failed multiple times:

```
/decompose-task TASK-xxx
```

This creates micro-tasks with doc references.

### Option 3: Create Planning Task

For complex tasks that need exploration first:

```markdown
# [PLAN] Investigate: <Original Task Title>

PRIORITY: P1
COMPLEXITY: L
ROLE: plan
MAX_TURNS: 100

## Type
PLANNING-ONLY task. Do NOT implement.

## Objective
Investigate <problem> and produce detailed implementation plan.

## Required Output
Create `.orchestrator/plans/PLAN-<id>.md` with:
1. Root cause analysis (file:line references)
2. Code path documentation
3. Micro-task breakdown with code snippets

## Success Criteria
- [ ] Plan document created
- [ ] Micro-tasks defined
- [ ] NO implementation done
```

## Future: Automated Validation

With SQLite + provisional completion:

```python
def validate_completion(task_id: str) -> str:
    task = db.get_task(task_id)

    # Check 1: commits exist
    if task.commits_count == 0:
        return reject(task_id, 'no_commits')

    # Check 2: exploration exhaustion
    if task.turns_used > 40 and task.commits_count == 0:
        return escalate_to_planning(task_id)

    # Check 3: branch has actual diff
    if not branch_has_changes(task.branch):
        return reject(task_id, 'no_changes')

    return accept(task_id)
```

This would happen automatically instead of manual audits.

## Quick Reference

| Signal | Action |
|--------|--------|
| 0 commits | Move back to incoming |
| 2+ failures, 0 commits | Decompose or create planning task |
| Plan not updated | Agent didn't engage - check task clarity |
| Wrong branch | Agent confusion - simplify task |
