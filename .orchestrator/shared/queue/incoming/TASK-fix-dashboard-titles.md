# [TASK-fix-dashboard-titles] Fix Task Title Parsing in Dashboard

ROLE: implement
PRIORITY: P3
BRANCH: main
CREATED: 2026-02-04T06:15:00Z
CREATED_BY: human

## Problem

The octopoid dashboard (`orchestrator/octopoid-dash.py`) incorrectly parses task titles from markdown files. Instead of showing the title from the first heading, it shows random text from inside the file.

**Expected:** `[P1] Implement PR Review Coordinator`
**Actual:** `[P1] [TASK-review-pr{N}] Review PR #{N}: {title}`

## Current Code

In `get_tasks_by_status()` around line 136:

```python
for line in content.split("\n"):
    if line.startswith("# "):
        title = line[2:].strip()
```

This grabs the first `# ` line, but the format is `# [TASK-ID] Title`, so it includes the task ID bracket.

## Expected Behavior

Parse the title correctly from the standard task format:
```markdown
# [TASK-xxx] Actual Title Here
```

Should display as: `[P1] Actual Title Here`

## Proposed Fix

```python
for line in content.split("\n"):
    if line.startswith("# [TASK-"):
        # Extract title after the [TASK-xxx] prefix
        match = re.match(r"# \[TASK-[^\]]+\] (.+)", line)
        if match:
            title = match.group(1).strip()
        else:
            title = line[2:].strip()
        break
    elif line.startswith("# "):
        title = line[2:].strip()
        break
```

## Acceptance Criteria

- [ ] Task titles display correctly in dashboard (without TASK-ID prefix)
- [ ] Handles both `# [TASK-xxx] Title` and plain `# Title` formats
- [ ] Title truncation still works for long titles

## Files to Modify

- `orchestrator/octopoid-dash.py` - `get_tasks_by_status()` function
