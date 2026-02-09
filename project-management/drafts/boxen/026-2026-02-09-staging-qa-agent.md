# Staging QA Agent

**Status:** Idea
**Captured:** 2026-02-09

## Raw

> "Think about whether we can get a qa agent going that checks against an instance running on cloudflare. Consider: what we already have in terms of qa agents, how it gets the staging_url, what state it sends in the initial p serialized get parameter, what instructions it should be given in terms of: being able to do the thing described (does it work), is it intuitive, and are there any unexpected results. Essentially, it should imagine what the initial and end state should be, and visually scrutinize the result to make sure that happens. It should look for violated geometry etc."

## Idea

A QA agent that uses Playwright MCP to navigate to a Cloudflare Pages staging deployment, interact with the app as a user would, and visually verify that the feature works correctly, looks right, and doesn't produce unexpected geometry.

The agent is multimodal — it can take screenshots and analyze them. This is the core capability: it doesn't need programmatic geometry validators. It can **look at the result** and judge whether panels are aligned, joints make sense, operations produced the expected visual outcome, and nothing looks broken.

## What Already Exists

| Piece | Status | Location |
|-------|--------|----------|
| `staging_url` on tasks | Built | `orchestrator/orchestrator/db.py` (schema v9) |
| Cloudflare URL extraction | Built | `orchestrator/orchestrator/reports.py` (`_extract_staging_url`) |
| Share link generation | Built | `scripts/generate-share-link.ts` (5 presets + JSON spec) |
| Playwright MCP | Available | Already used in interactive sessions (`.playwright-mcp/`) |
| `gk-qa` agent definition | Defined, paused | `.orchestrator/agents.yaml` |
| QA gatekeeper prompt | Written | `.orchestrator/prompts/gatekeeper-qa.md` |
| Geometry validators | Built (client-side) | `src/engine/validators/` |
| Visual testing plan | Draft | `project-management/drafts/boxen/playwright-visual-testing-plan.md` |

## How It Would Work

### 1. Trigger

When an app task reaches provisional (PR exists, staging deployed), the QA agent is dispatched.

### 2. Get the staging URL

Read `staging_url` from the task record in the DB. This is the Cloudflare Pages branch preview URL (e.g. `https://agent-f737dc48.boxen-8f6.pages.dev`). Already populated by `_gather_prs()`.

### 3. Construct initial state via `?p=` parameter

The agent reads the task description to understand what feature was built. Based on this, it decides what starting state to use:

- **For subdivision features**: start with `grid-2x2` or `basic` preset
- **For edge operations**: start with a box that has open faces or existing extensions
- **For cutouts/2D editing**: start with a subdivided box showing panels

The agent generates the state URL using:
```bash
npx tsx --import ./scripts/register-lz-compat.mjs scripts/generate-share-link.ts <preset>
# or with custom JSON:
npx tsx --import ./scripts/register-lz-compat.mjs scripts/generate-share-link.ts --json '{...}'
```

Then navigates to: `<staging_url>/?p=<compressed_state>`

### 4. Imagine expected outcome

Before interacting, the agent should form a mental model:

> "The task says 'add snap system to 2D editor.' Starting from a basic box, I'll open the 2D editor on a panel. I expect to see snap indicators when I draw near edges or points. The drawn path should snap to those positions. After applying, the panel outline should incorporate the snapped path."

This is the key step — the agent predicts what success looks like **before** testing.

### 5. Interact and scrutinize

Using Playwright MCP:

1. **Screenshot the initial state** — does it look right? Any rendering artifacts?
2. **Perform the user actions** described in the task's acceptance criteria
3. **Screenshot after each action** — does the result match expectations?
4. **Check for violated geometry:**
   - Are panels aligned? No gaps between panels that should meet?
   - Do finger joints look regular and evenly spaced?
   - Are slots visible where dividers meet faces?
   - Do cross-lap joints interlock correctly?
   - Are there any extrusions where there should be holes (or vice versa)?
   - Are panel outlines closed and rectilinear (no diagonal segments)?
5. **Check intuitiveness:**
   - Was the UI discoverable? Could the agent figure out how to trigger the feature?
   - Were there confusing states or dead ends?
   - Did feedback (hover states, previews, selection highlights) make sense?
6. **Check for unexpected results:**
   - Did other panels change when only one should have?
   - Did the operation affect the wrong axis?
   - Are there any visual glitches (z-fighting, overlapping geometry, missing faces)?

### 6. Report

Write a structured QA report:
- **Pass/Fail** with confidence level
- **Screenshots** annotated with observations
- **Geometry concerns** (specific panels, specific issues)
- **UX observations** (confusing interactions, missing feedback)
- **Comparison** of expected vs actual outcome

## What Instructions the Agent Needs

The prompt should cover three evaluation dimensions:

### A. Does it work?

> Navigate to the staging URL with appropriate starting state. Follow the acceptance criteria step by step. After each step, screenshot and verify the visible result matches what the criteria describe. If any criterion cannot be completed (button missing, operation has no effect, error appears), fail immediately and report which criterion failed and why.

### B. Is it intuitive?

> Approach the feature as a first-time user. Don't read the implementation code — only read the task description's user-facing summary. Can you discover how to use the feature from the UI alone? Note any points where you were confused, where you had to guess, or where the UI gave no feedback. Rate discoverability: obvious / findable / hidden / broken.

### C. Any unexpected results?

> After completing the main interaction, inspect the broader state:
> - Rotate the 3D view. Do all panels look correct from every angle?
> - Check panels that weren't part of the operation — did they change?
> - Open the SVG export if available — does it look correct?
> - Check the 2D editor for panels that were modified — are outlines clean?
> - Look for: z-fighting (flickering faces), gaps between panels, misaligned joints, panels extending beyond the assembly boundary, holes that look like extrusions.

## Open Questions

- **Can Playwright MCP run in a background agent?** It's currently used in interactive sessions. Need to verify it works when spawned by the scheduler in a worktree context.
- **How does the agent get Playwright MCP?** The MCP server config is per-session. Agents would need it configured in their environment.
- **Screenshot comparison**: Should the agent do pure visual judgment (multimodal), or also run programmatic checks (e.g., inject a script that calls ComprehensiveValidator in the browser console)?
- **State generation**: For complex features, the agent might need custom JSON specs rather than presets. Should the task description include a suggested share link state?
- **Baseline**: Does the agent compare against a "before" state (screenshot the staging URL without the feature branch), or just judge the result in isolation?
- **Turn budget**: Visual QA with multiple screenshots could be expensive. What's a reasonable turn budget? 15-20 turns?

## Risks

- **Playwright MCP availability**: The biggest unknown. If agents can't access Playwright MCP, this whole approach doesn't work. Fallback: use `curl` + screenshot service, but much less interactive.
- **Cloudflare deployment timing**: The staging URL might not be ready when the agent runs (deployment still in progress). Need a retry/wait mechanism.
- **Multimodal judgment quality**: Claude can analyze screenshots but may miss subtle geometry issues that a human would catch. Consider this a first-pass filter, not a replacement for human review.
- **State serialization coverage**: Not all features can be set up via share links. Some require interaction (e.g., selecting a panel, entering a mode). The agent would need to click through the UI for those.

## Possible Next Steps

1. **Verify Playwright MCP works in agent context** — spawn a test agent with MCP configured, have it navigate to a URL and screenshot. This is the blocker.
2. **Write the QA agent prompt** — expand the three evaluation dimensions into a concrete prompt, referencing the share link generation scripts.
3. **Wire staging_url into the dispatch flow** — when a task has a staging_url and reaches provisional, trigger QA check.
4. **Start with manual invocation** — a `/qa-check <task-id>` command that runs the QA flow interactively before automating it.
5. **Consider programmatic validation**: the agent could run `browser_evaluate` to call geometry validators in the browser console, getting structured pass/fail data alongside visual judgment.
