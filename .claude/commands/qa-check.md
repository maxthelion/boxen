# /qa-check - Run Visual QA on a Task

Run a visual QA check against a task's staging deployment using Playwright MCP.

**Argument:** `$ARGUMENTS` (task ID, e.g. `971e8e18`)

## Steps

### 1. Look up the task

```bash
.orchestrator/venv/bin/python -c "
import sys; sys.path.insert(0, 'orchestrator')
from orchestrator.db import get_task
t = get_task('$ARGUMENTS')
if t:
    print(f'TASK_ID={t[\"id\"]}')
    print(f'TITLE={t.get(\"file_path\", \"\")}')
    print(f'QUEUE={t[\"queue\"]}')
    print(f'STAGING_URL={t.get(\"staging_url\") or \"NONE\"}')
    print(f'PR_NUMBER={t.get(\"pr_number\") or \"NONE\"}')
    print(f'PR_URL={t.get(\"pr_url\") or \"NONE\"}')
else:
    print('NOT FOUND')
"
```

If the task is not found, stop and report: "Task $ARGUMENTS not found in DB."

### 2. Read the task description and acceptance criteria

Read the task's markdown file to understand:
- What feature was implemented
- The acceptance criteria to verify
- Any context about expected behavior

```bash
cat $(ls .orchestrator/shared/queue/*/TASK-$ARGUMENTS*.md 2>/dev/null | head -1)
```

Extract and display the acceptance criteria so the human can see what will be tested.

### 3. Check for staging URL

The task's `staging_url` field contains the Cloudflare Pages branch preview URL (e.g., `https://agent-f737dc48.boxen-8f6.pages.dev`).

**If staging_url is available:** Use it directly.

**If staging_url is missing but pr_number exists:** Try to find the URL from the PR:
```bash
gh pr view <pr_number> --json comments --jq '.comments[].body' | grep -o 'https://[a-zA-Z0-9._-]*\.pages\.dev' | head -1
```

**If no staging URL can be found:** Check if there's a local dev server approach:
1. Ask the user if they want to use a local dev server instead
2. If yes, check out the branch in the review worktree and start a dev server on port 5176
3. Use `http://localhost:5176` as the base URL

If no URL is available at all, report: "No staging URL available. The task's PR may not have a Cloudflare Pages deployment yet."

### 4. Choose starting state

Based on the task description, decide what starting state best exercises the feature. Generate a state URL using the share link script:

```bash
# Available presets:
# basic          — plain box with finger joints
# subdivided-x   — box split on X axis
# subdivided-z   — box split on Z axis
# grid-2x2       — 2x2 grid of compartments
# grid-3x3       — 3x3 grid of compartments

npx tsx --import ./scripts/register-lz-compat.mjs scripts/generate-share-link.ts <preset>
```

**Choosing the right preset:**
- **Subdivision features**: `grid-2x2` or `subdivided-x`
- **Edge operations / finger joints**: `basic`
- **Cutouts / 2D editing**: `subdivided-x` or `grid-2x2`
- **General features**: `basic`

The script outputs a full URL like `http://localhost:5173/?p=...`. Extract the `?p=` parameter and append it to the staging URL:
`<staging_url>/?p=<compressed_state>`

### 5. Predict the outcome

Before interacting, write down what success looks like:

> "The task says '[feature description].' Starting from [preset], I expect to see [expected visual state]. After [interaction], I expect [expected result]. I will look for [specific visual indicators]."

Share this prediction with the user so they can confirm or adjust before proceeding.

### 6. Navigate and screenshot initial state

Use Playwright MCP tools to navigate and capture the starting state:

1. `browser_navigate` — Go to the staging URL with state parameter
2. Wait for the app to load (the 3D viewport should render)
3. `browser_take_screenshot` — Capture the initial state
4. Verify the initial state loaded correctly (box visible, correct configuration)

If the page fails to load, times out, or shows an error, note: "Staging deployment not accessible or failed to load."

### 7. Interact and verify acceptance criteria

Go through each acceptance criterion from the task:

For each criterion:
1. `browser_snapshot` — Get current DOM state to identify interactive elements
2. Perform the interaction (`browser_click`, `browser_type`, `browser_press_key`)
3. `browser_take_screenshot` — Capture the result
4. Compare to your prediction — does it match?
5. Report pass/fail for this criterion with a specific observation

If any criterion cannot be completed (button missing, operation has no effect, error appears), note the specific failure and continue testing remaining criteria.

**Ask the human about ambiguous cases.** If something looks wrong but you're not sure, show the screenshot and ask rather than guessing.

### 8. Check three evaluation dimensions

#### A. Does It Work?
- Can each acceptance criterion be completed through the UI?
- Does each interaction produce the expected visual result?
- Are there error messages, console errors, or broken UI states?

#### B. Is It Intuitive?
- Can you discover how to use the feature from the UI alone?
- Are there hover states, tooltips, or visual cues?
- Does the operation provide preview feedback before committing?
- Rate discoverability: **Obvious** / **Findable** / **Hidden** / **Broken**

#### C. Any Unexpected Results?
- Rotate the 3D view — do all panels look correct from every angle?
- Check for z-fighting, gaps, misaligned joints
- Did unmodified panels change unexpectedly?
- Check for visual artifacts (missing geometry, inverted normals, overlapping panels)

### 9. Present the QA report

Display the structured report inline for the user to review:

```
## QA Visual Verification Report

**Task:** [task ID] — [task title]
**Staging URL:** [URL tested]
**Starting State:** [preset used]
**Verdict:** PASS / FAIL

### A. Functional Correctness
- [ ] Criterion 1: [pass/fail] — [observation with screenshot reference]
- [ ] Criterion 2: [pass/fail] — [observation with screenshot reference]
- [ ] Criterion N: [pass/fail] — [observation with screenshot reference]

### B. Discoverability
**Rating:** [Obvious / Findable / Hidden / Broken]
**Notes:** [specific observations about UX]

### C. Unexpected Results
**Geometry Issues:** [none / list specific issues]
**Visual Artifacts:** [none / list specific issues]
**Side Effects:** [none / list specific issues]

### Screenshots
[Reference screenshots taken during the review]

### Summary
[1-2 sentence overall assessment]
```

### 10. Offer next actions

After presenting the report, offer the user these options:

- **If PASS:** `/approve-task $ARGUMENTS` to merge and complete
- **If FAIL:** `/reject-task $ARGUMENTS "<summary of failures>"` to send back for rework
- **Retest:** Run `/qa-check $ARGUMENTS` again after fixes are deployed
- **Record result:** Use `/record-check` to formally record the QA result if this is a gatekeeper check

## Playwright MCP Tools Reference

| Tool | Purpose |
|------|---------|
| `browser_navigate` | Navigate to a URL |
| `browser_snapshot` | Get accessibility tree / DOM snapshot |
| `browser_take_screenshot` | Capture visual state for analysis |
| `browser_click` | Click an element (by coordinates or selector) |
| `browser_type` | Type text into a focused element |
| `browser_press_key` | Press a keyboard key (Enter, Escape, Tab, etc.) |
| `browser_evaluate` | Execute JavaScript in the browser console |

**Tips:**
- Use `browser_snapshot` before clicking to find the right element
- Take screenshots after every significant interaction
- If the 3D viewport doesn't respond to clicks, try keyboard shortcuts instead
