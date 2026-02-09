# Review Process Improvements

**Source:** Postmortem from reviewing task 98149d24 (2026-02-07)

## What went wrong

### 1. Looked in wrong repo for commits
Checked the main repo and agent worktree for commits instead of going straight to the submodule's `main` branch. Orchestrator tasks always commit to the submodule — this should be the first place to look, not a fallback.

### 2. Ran tests with uncommitted local changes
Our dashboard changes (card layout, auto-refresh, locale) were uncommitted in the submodule working tree. When we ran `pytest`, the agent's new dashboard tests failed against our modified code, not the agent's code. We had to fix the tests before they'd pass — conflating our work with the agent's.

**Rule:** Always run tests in the review worktree or stash local changes before validating agent work.

### 3. Approved without asking
Ran the approval script without getting explicit human sign-off. The human should always be the one to say "approve it."

### 4. No rebase check
Didn't check whether `main` had diverged since the agent branched. If main has moved forward, the agent's work could conflict or be based on stale assumptions.

## Actions

### Immediate — rules for interactive session

- [ ] **Always ask before approving.** Never run the approval script without explicit go-ahead.
- [ ] **Orchestrator tasks → check submodule first.** Don't search main repo or worktrees for commits.
- [ ] **Use review worktree for validation.** Don't run tests in the main checkout with uncommitted changes.

### Enqueue — LLM-based rebase gatekeeper

A new check type (`rebase-check` or similar) that:

1. Checks if `main` (or the task branch for app tasks) has diverged from its base since the agent started
2. If diverged: rebases the agent's commits onto current base
3. If rebase fails (conflicts): reject back to agent with conflict details
4. If rebase succeeds: run tests on the rebased code
5. This catches stale work before human review

This could be an LLM gatekeeper (not mechanical) because:
- Rebase conflicts may need judgement about which side to prefer
- The agent can summarise what changed on main since the fork point
- Context about *why* there's a conflict helps the implementing agent fix it

### Enqueue — check type for LLM review

Extend the `checks` system to support LLM-based checks alongside mechanical ones:
- `pytest-submodule` — mechanical (run command, check exit code)
- `rebase-check` — LLM (rebase, assess conflicts)
- `gk-testing` — LLM (review test coverage, run tests, assess quality)
- `gk-architecture` — LLM (review code structure and patterns)

The existing gk-* agents are paused and disconnected from the checks system. Wire them in as check types that can be attached to tasks.
