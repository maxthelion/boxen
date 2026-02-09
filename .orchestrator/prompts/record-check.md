# Record QA Check Result with Screenshots

Record the result of a QA gatekeeper check with optional screenshots.

## Usage

After completing your visual QA review via Playwright, use this skill to:
1. Save screenshots to persistent storage
2. Record check result in the database with screenshot references

## Workflow

### Step 1: Take screenshots during review

Use Playwright MCP to navigate and capture screenshots during your review:

```
Take a screenshot showing the initial state
Take a screenshot showing the bug (e.g., missing center line)
Take a screenshot showing the panel in 3D view
```

### Step 2: Save screenshots to persistent directory

Create the screenshots directory if it doesn't exist:

```bash
mkdir -p .orchestrator/agents/gk-qa/screenshots/TASK-{task_id}
```

Save each screenshot with a descriptive name:

```bash
# Playwright screenshots are stored in temp directories
# Copy them to the persistent location
cp /path/to/playwright/screenshot-1.png .orchestrator/agents/gk-qa/screenshots/TASK-{task_id}/01-initial-state.png
cp /path/to/playwright/screenshot-2.png .orchestrator/agents/gk-qa/screenshots/TASK-{task_id}/02-bug-visible.png
```

Naming convention:
- Use numeric prefixes for ordering: `01-`, `02-`, `03-`
- Use descriptive names: `initial-state`, `bug-visible`, `after-click`
- Use `.png` extension

### Step 3: Record check result

Use the Python function to record the result in the database:

```python
from orchestrator import db

task_id = "TASK-251e9f63"
check_name = "qa"
status = "fail"  # or "pass"
summary = "Center line not visible in 2D sketch view"

screenshots = [
    ".orchestrator/agents/gk-qa/screenshots/TASK-251e9f63/01-initial-state.png",
    ".orchestrator/agents/gk-qa/screenshots/TASK-251e9f63/02-bug-visible.png",
]

db.record_check_result(
    task_id=task_id,
    check_name=check_name,
    status=status,
    summary=summary,
    screenshots=screenshots,
)
```

**Important:**
- Screenshot paths must be relative to the repo root
- Paths must start with `.orchestrator/agents/gk-qa/screenshots/`
- Task ID must match the directory name

### Step 4: Verify result

Check that the result was recorded:

```python
from orchestrator import db

task = db.get_task("TASK-251e9f63")
check_results = task.get("check_results", {})
qa_result = check_results.get("qa", {})

print(f"Status: {qa_result.get('status')}")
print(f"Summary: {qa_result.get('summary')}")
print(f"Screenshots: {qa_result.get('screenshots')}")
```

## Screenshot Requirements

- **Format:** PNG (preferred) or JPEG
- **Location:** `.orchestrator/agents/gk-qa/screenshots/TASK-{task_id}/`
- **Naming:** `{number}-{description}.png` (e.g., `01-initial-state.png`)
- **Paths:** Relative to repo root (e.g., `.orchestrator/agents/gk-qa/screenshots/TASK-abc123/01-foo.png`)

## Example: Failed QA Check with Screenshots

```python
from orchestrator import db
import shutil
from pathlib import Path

task_id = "TASK-abc123"
check_name = "qa"

# 1. Create screenshots directory
screenshots_dir = Path(f".orchestrator/agents/gk-qa/screenshots/TASK-{task_id}")
screenshots_dir.mkdir(parents=True, exist_ok=True)

# 2. Copy Playwright screenshots to persistent location
# (Assume Playwright saved to /tmp/playwright-screenshots/)
shutil.copy(
    "/tmp/playwright-screenshots/screenshot-1.png",
    screenshots_dir / "01-box-renders.png",
)
shutil.copy(
    "/tmp/playwright-screenshots/screenshot-2.png",
    screenshots_dir / "02-center-line-missing.png",
)
shutil.copy(
    "/tmp/playwright-screenshots/screenshot-3.png",
    screenshots_dir / "03-3d-view-looks-normal.png",
)

# 3. Record check result with screenshot paths
db.record_check_result(
    task_id=task_id,
    check_name=check_name,
    status="fail",
    summary="Center line not visible in 2D sketch view after fillet operation",
    screenshots=[
        f".orchestrator/agents/gk-qa/screenshots/TASK-{task_id}/01-box-renders.png",
        f".orchestrator/agents/gk-qa/screenshots/TASK-{task_id}/02-center-line-missing.png",
        f".orchestrator/agents/gk-qa/screenshots/TASK-{task_id}/03-3d-view-looks-normal.png",
    ],
)
```

## Example: Passed QA Check (No Screenshots Needed)

```python
from orchestrator import db

db.record_check_result(
    task_id="TASK-xyz789",
    check_name="qa",
    status="pass",
    summary="Box renders correctly, all features visible in 2D and 3D views",
)
```

## What Happens Next

When a task is rejected with screenshots:

1. **Scheduler calls `review_reject_task()`** with aggregated feedback
2. **Feedback includes screenshot paths** from `get_check_feedback()`
3. **Task file updated** with rejection notice + screenshot references
4. **Implementer sees screenshots** when they re-claim the task
5. **Implementer can view images** using Read tool in Claude Code

## Cleanup Policy

Screenshots are stored permanently until the task is completed. Future enhancement: archive or delete screenshots when tasks move to `done` queue.
