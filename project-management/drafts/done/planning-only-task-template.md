# Planning-Only Task Template

## Purpose

For complex tasks that agents struggle to complete in one run, use a two-phase approach:
1. **Planning phase**: High turn limit, output is a detailed plan (no implementation)
2. **Execution phase**: Normal turn limit, plan baked into micro-tasks

## Task Template

```markdown
# [PLAN] Investigate and Plan: {Task Title}

CREATED: {timestamp}
PRIORITY: {priority}
COMPLEXITY: L
ROLE: plan
BRANCH: {branch}
MAX_TURNS: 100

## Type

This is a **PLANNING-ONLY** task. Do NOT implement anything.

## Objective

Investigate {problem area} and produce a detailed implementation plan that can be executed by agents in subsequent micro-tasks.

## Problem Statement

{Description of what needs to be fixed/built}

## Required Output

Create a plan document at `.orchestrator/plans/PLAN-{task-id}.md` with:

### 1. Root Cause Analysis
- What is the actual problem?
- Where does it occur? (exact file:line references)
- Why does it happen?

### 2. Code Path Documentation
Document the relevant code flow with exact references:
```
file.ts:123 → function_name()
  ↓ calls
other_file.ts:456 → other_function()
  ↓ returns
...
```

### 3. Proposed Fix
- What needs to change?
- Which files need modification?
- What are the risks?

### 4. Micro-Task Breakdown
Break the work into tasks that can each be completed in <20 turns:

| Task | Description | Files | Depends On |
|------|-------------|-------|------------|
| {id}-a | {specific action} | file.ts | - |
| {id}-b | {specific action} | other.ts | {id}-a |
| {id}-c | {specific action} | test.ts | {id}-b |

### 5. Code Snippets
For each micro-task, provide the approximate code to write:

**Task {id}-a:**
```typescript
// In file.ts, around line 123
// Change this:
function example() {
  return oldBehavior();
}

// To this:
function example() {
  return newBehavior();
}
```

### 6. Test Strategy
- How to verify the fix works
- What tests to add/modify

## Success Criteria

- [ ] Plan document created at `.orchestrator/plans/PLAN-{task-id}.md`
- [ ] Root cause identified with file:line references
- [ ] Micro-tasks defined (each completable in <20 turns)
- [ ] Code snippets provided for each micro-task
- [ ] NO implementation done (no code changes, no commits)

## What NOT To Do

- Do NOT modify any source files
- Do NOT make commits
- Do NOT mark this task as blocked or waiting
- Do NOT implement the fix - ONLY plan it

## On Completion

When this planning task completes, the orchestrator will:
1. Read the plan document
2. Create micro-tasks from the breakdown
3. Queue them with proper dependencies
```

---

## Orchestrator Integration

### Detection of Need for Planning

Add to curator logic:

```python
def should_require_planning(task, completion_result):
    """Detect when a task needs planning phase first."""

    # Task completed but no commits
    if completion_result.commits == 0 and completion_result.status == 'complete':
        return True

    # Task used >80% of turns without progress
    if completion_result.turns_used > 0.8 * task.max_turns:
        if completion_result.commits == 0:
            return True

    # High complexity tasks should always plan first
    if task.complexity in ['L', 'XL'] and not task.has_plan:
        return True

    return False
```

### Auto-Creation of Planning Task

```python
def create_planning_task(original_task):
    """Create a planning-only version of a failed task."""

    return Task(
        id=f"PLAN-{original_task.id}",
        title=f"[PLAN] Investigate and Plan: {original_task.title}",
        role="plan",
        complexity="L",
        max_turns=100,
        branch=original_task.branch,
        body=PLANNING_TEMPLATE.format(
            problem=original_task.body,
            task_id=original_task.id,
        )
    )
```

### Micro-Task Generation from Plan

```python
def generate_microtasks_from_plan(plan_document):
    """Parse plan document and create executable micro-tasks."""

    # Extract micro-task table from plan
    tasks = parse_microtask_table(plan_document)

    for task in tasks:
        # Include code snippets from plan directly in task
        snippet = extract_snippet_for_task(plan_document, task.id)

        create_task(
            id=task.id,
            title=task.description,
            complexity="S",  # Micro-tasks are always small
            body=f"""
## Context
This micro-task was generated from PLAN-{plan_id}.
Read the full plan at: .orchestrator/plans/PLAN-{plan_id}.md

## Specific Action
{task.description}

## Files to Modify
{task.files}

## Code to Write
```typescript
{snippet}
```

## DO NOT EXPLORE
The planning phase already investigated this. Trust the plan and implement directly.
""",
            blocked_by=task.depends_on,
        )
```

---

## Example: Fillet Task as Planning-Only

```markdown
# [PLAN] Investigate and Plan: Fix Fillet Operation

CREATED: 2026-02-04T13:30:00Z
PRIORITY: P1
COMPLEXITY: L
ROLE: plan
BRANCH: feature/fillet-all-corners-integration-tests
MAX_TURNS: 100

## Type

This is a **PLANNING-ONLY** task. Do NOT implement anything.

## Objective

Investigate why the fillet/chamfer operation doesn't modify geometry and produce a detailed implementation plan.

## Problem Statement

The fillet operation doesn't work:
- No preview appears when corners are selected
- Clicking Apply does nothing
- The geometry doesn't change

## Required Output

Create `.orchestrator/plans/PLAN-fillet-fix.md` with:
1. Root cause analysis
2. Code path documentation
3. Proposed fix
4. Micro-task breakdown
5. Code snippets for each micro-task
6. Test strategy

## Success Criteria

- [ ] Plan document created
- [ ] Root cause identified with file:line references
- [ ] Micro-tasks defined (each <20 turns)
- [ ] Code snippets provided
- [ ] NO implementation done
```

---

## Benefits

1. **No wasted exploration** - Planning run's output is preserved
2. **Right-sized execution** - Micro-tasks fit within turn limits
3. **Explicit handoff** - Plan document is the contract between phases
4. **Diagnosable** - Can see exactly where understanding broke down
5. **Resumable** - If planning run fails, it can be resumed with partial plan
