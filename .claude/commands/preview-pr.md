# /preview-pr — Preview a PR in the Browser

Check out a PR branch in the review worktree, show gatekeeper review summaries, start a dev server, and walk through test scenarios.

**Argument:** `$ARGUMENTS` (PR number, e.g. `48`)

## Steps

### 1. Get PR details

```bash
gh pr view $ARGUMENTS --json number,headRefName,title,body,additions,deletions,changedFiles,files
```

Read the PR description to understand what changed and what needs testing. Note the PR number and branch name for later steps.

### 2. Show gatekeeper review summaries

Before starting visual review, check for automated gatekeeper review results. These provide architecture, testing, and QA assessments.

#### 2a. Check PR-level gatekeeper checks

Look for gatekeeper results in the PR tracking directory:

```bash
ls .orchestrator/shared/prs/PR-$ARGUMENTS/checks/ 2>/dev/null
```

If check files exist (markdown format), read each one and display a summary table:

| Check | Status | Summary |
|-------|--------|---------|
| lint | pass/fail | One-line summary |
| tests | pass/fail | One-line summary |
| style | pass/fail | One-line summary |
| architecture | pass/fail | One-line summary |

Also read the PR meta for overall status:

```bash
cat .orchestrator/shared/prs/PR-$ARGUMENTS/meta.json 2>/dev/null
```

#### 2b. Check task-level gatekeeper reviews

Find the task ID associated with this PR by checking the DB or task files:

```bash
.orchestrator/venv/bin/python -c "
import sys; sys.path.insert(0, 'orchestrator')
from orchestrator.db import list_tasks
tasks = list_tasks()
for t in tasks:
    if t.get('pr_number') == $ARGUMENTS:
        task_id = t['id']
        print(f'TASK_ID={task_id}')
        break
" 2>/dev/null
```

If a task ID is found, check for task-level review results:

```bash
ls .orchestrator/shared/reviews/TASK-{task_id}/checks/ 2>/dev/null
```

Each check file is JSON with `status`, `summary`, and `details` fields. Display them:

```
## Gatekeeper Reviews

### Architecture Review
**Status:** PASSED
**Summary:** Architecture changes are well-structured
**Details:** (show if present)

### Testing Review
**Status:** FAILED
**Summary:** Missing edge case tests for panel resizing
**Details:** (show if present — this is important context for the human reviewer)

### QA Review
**Status:** PASSED
**Summary:** Feature is testable in browser with basic preset
**Details:** (show if present — may include suggested test scenarios)
```

**If any checks failed**, highlight this prominently before proceeding to visual review. The human reviewer should know what the automated reviewers flagged.

**If no gatekeeper results exist**, note this: "No automated gatekeeper reviews found for this PR."

### 3. Check out the branch in the review worktree

```bash
cd /Users/maxwilliams/dev/boxen/.orchestrator/agents/review-worktree
git fetch origin <branch-name>
git checkout FETCH_HEAD
```

If the worktree has uncommitted changes, stash them first (`git stash`).

If the worktree doesn't exist, recreate it:
```bash
git worktree add --detach .orchestrator/agents/review-worktree HEAD
cd .orchestrator/agents/review-worktree && npm install
```

### 4. Start the dev server

Kill any existing dev server on the target port, then start a new one:

```bash
lsof -ti:5176 | xargs kill 2>/dev/null
```

Then start Vite on port 5176 (run in background):

```bash
npx vite --port 5176
```

Wait for the server to be ready.

### 5. Generate starting state via share link

Based on the PR description and any QA gatekeeper suggestions, determine the best starting configuration for testing. For example:

- 2D editing features: need a panel selected and "Edit in 2D" — generate a basic box URL
- Subdivision features: generate a subdivided or grid box
- Edge/face operations: generate a box with open faces or extensions
- If the QA gatekeeper suggested specific scenarios, use those

Use the share link generator with `--base-url http://localhost:5176`:

```bash
npx tsx --import ./scripts/register-lz-compat.mjs scripts/generate-share-link.ts <preset> --base-url http://localhost:5176
```

Or with custom JSON:

```bash
npx tsx --import ./scripts/register-lz-compat.mjs scripts/generate-share-link.ts --json '<json>' --base-url http://localhost:5176
```

Available presets: `basic`, `subdivided-x`, `subdivided-z`, `grid-2x2`, `grid-3x3`

If no specific state is needed, just provide the plain URL.

### 6. Summarize and walk through test scenarios

Present a structured review summary to the user:

```
## PR Review: <title>

### Gatekeeper Summary
<table from step 2 — pass/fail for each check with one-line summaries>
<highlight any failures with details>

### What Changed
<brief description of the changes based on PR body and diff stats>

### User-Facing Functionality to Test
<bullet list of testable behaviors derived from:
 1. PR acceptance criteria or description
 2. QA gatekeeper suggestions (if available)
 3. Changed files analysis (components = visual changes, engine = logic changes)>

### Test Scenarios
For each user-facing change, provide a numbered scenario:

1. **<Scenario name>**
   - Starting state: <URL with share link or "default">
   - Steps: <what to click/interact with>
   - Expected: <what should happen>

2. **<Scenario name>**
   - Starting state: ...
   - Steps: ...
   - Expected: ...

### Dev Server
- URL: http://localhost:5176 (or with share link)
- Stop server: `lsof -ti:5176 | xargs kill`

### Verdict Options
After testing, you can:
- `/approve-task <task-id>` — merge the PR and move task to done
- `/reject-task <task-id> "<feedback>"` — reject with feedback for the implementer
- Comment on the PR directly: `gh pr comment $ARGUMENTS --body "<comment>"`
```

### 7. Interactive walkthrough (optional)

If the user wants to walk through scenarios together, use Playwright MCP to:
1. Navigate to the starting URL
2. Take screenshots at each step
3. Verify expected outcomes visually
4. Report any issues found

This is especially valuable for:
- Visual/UI changes (opacity, sizing, positioning)
- Interaction changes (click targets, drag behavior)
- Edge cases that only manifest visually (z-ordering, overlaps)
