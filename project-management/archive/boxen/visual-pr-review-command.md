# Visual PR Review Command

**Source:** PR #48 review gap (2026-02-06) — code review missed visual/UX issues that only show up in the browser.

## Problem

The built-in `/review` skill is code-only: reads the diff, checks logic, runs tests. For UI features (2D editor tools, 3D rendering, palette UX), this misses:

- Whether visual elements are actually visible at the right opacity/size
- Whether interactions feel responsive (snap threshold, transitions)
- Whether the UX is discoverable (legend toggles, indicator sizing)
- Whether zoom/pan/resize affect the feature
- Edge cases that only manifest visually (overlapping guides, z-ordering)

## Proposed: `/review-pr` Custom Command

A custom `.claude/commands/review-pr.md` that extends code review with visual verification.

### Steps

1. **Code review** (same as built-in):
   - `gh pr view` + `gh pr diff`
   - Analyze correctness, conventions, test coverage
   - Check acceptance criteria against diff

2. **Visual verification** (new):
   - Check out the PR branch in the review worktree
   - Start dev server on a non-conflicting port (5174+)
   - Use Playwright MCP to navigate to the relevant view
   - Take screenshots of the feature in action
   - Walk through each acceptance criterion visually
   - Check edge cases (zoom in/out, different panel sizes, tool switching)

3. **Report**:
   - Code issues (same as before)
   - Visual issues with screenshots as evidence
   - UX observations (discoverability, responsiveness, polish)
   - Verdict: merge / merge with fixes / needs rework

### When to skip visual review

Not every PR needs browser verification. Skip for:
- Pure logic/engine changes with no visual component
- Test-only PRs
- Config/tooling changes
- Documentation

The command could auto-detect this from the changed files — if nothing in `src/components/` changed, skip the visual step.

### Review worktree setup

The review worktree at `.orchestrator/agents/review-worktree/` already exists with `node_modules`. The command would:

```bash
cd .orchestrator/agents/review-worktree
git fetch origin <pr-branch>
git checkout FETCH_HEAD
npm run dev -- --port 5174
```

Then use Playwright MCP to interact and screenshot.

### Share link integration

For features that need specific state (e.g., a subdivided box, a panel with cutouts), generate a share link with `scripts/generate-share-link.ts` and navigate directly. This avoids clicking through setup in the review.

## Complexity

Small. It's a prompt file that orchestrates existing tools (gh CLI, review worktree, Playwright MCP, share link scripts). No new code needed — just a well-structured command prompt.
