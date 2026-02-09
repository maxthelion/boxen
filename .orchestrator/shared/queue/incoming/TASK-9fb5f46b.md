# [TASK-9fb5f46b] Build gk-testing-octopoid: rebase + pytest gatekeeper for orchestrator tasks

ROLE: orchestrator_impl
PRIORITY: P1
BRANCH: main
CREATED: 2026-02-07T17:07:30.303538
CREATED_BY: human
CHECKS: pytest-submodule

## Context

Build an LLM-based testing gatekeeper specifically for orchestrator (Octopoid) tasks. A separate `gk-testing-app` agent will handle app tasks later — this one only handles `orchestrator_impl` tasks.

The mechanical check_runner (Phase 2) exists and can run pytest-submodule via cherry-pick. But it doesn't handle:
- Branch divergence (agent's work based on stale `main`)
- Rebase conflicts (needs judgement to reject with useful context)
- Summarising test failures for the implementing agent

## Critical: submodule indirection

Orchestrator tasks do NOT work on branches in the main Boxen repo. The work lives **inside the `orchestrator/` submodule**:

- The implementing agent's worktree is at `.orchestrator/agents/<agent>/worktree/`
- Inside that worktree, the submodule is at `orchestrator/`
- The agent's commits are on a local copy of the `main` branch **inside the submodule**
- The base to rebase onto is `origin/main` **in the submodule repo** (github.com/maxthelion/octopoid)
- The main repo branch is irrelevant for testing

This means all git operations (fetch, rebase, log) happen inside the submodule path, not the main repo.

## What gk-testing-octopoid does

When a provisional `orchestrator_impl` task has `checks=['gk-testing-octopoid']`:

1. **Find the agent's submodule commits**: Look in `.orchestrator/agents/<claimed_by>/worktree/orchestrator/` and find commits ahead of `origin/main`

2. **Set up review worktree submodule**: In `.orchestrator/agents/review-worktree/orchestrator/`:
   - Fetch `origin/main`
   - Reset to `origin/main` (clean base)
   - Add the agent's submodule as a remote and fetch

3. **Rebase**: Rebase the agent's commits onto current `origin/main`:
   - If rebase succeeds → continue to step 4
   - If rebase fails (conflicts) → abort rebase, reject back to agent with:
     - Which files conflicted
     - What changed on `main` since the agent forked (git log of new commits)
     - Suggestion of what the agent needs to update

4. **Run pytest**: `pytest tests/ -v --tb=short` in the review worktree submodule:
   - If tests pass → mark check as passed
   - If tests fail → reject back to agent with:
     - Plain language summary of what failed
     - Whether failures are likely from the agent's changes vs pre-existing
     - Which files/functions to investigate

5. **Record result**: Use `db.record_check_result()` to persist pass/fail with summary

## Integration

- Register `gk-testing-octopoid` as a valid check type in the checks system
- This runs as a separate agent role (not inside check_runner)
- Update default checks for `orchestrator_impl` tasks to `checks=['gk-testing-octopoid']`
- Results flow through the same `check_results` DB field as mechanical checks
- Dashboard CHECKS column shows tasks waiting for this check
- On pass: task moves from CHECKS → IN REVIEW for human approval

## Key constraints

- Must run in the review worktree's submodule, never modify the agent's worktree
- Must abort and clean up on failure (no leftover rebase state in review worktree)
- The venv for running pytest is at `.orchestrator/venv/` (shared)

## Acceptance Criteria
- [ ] `gk-testing-octopoid` check type is registered and attachable to tasks via the checks field
- [ ] Agent finds commits in the submodule (not the main repo)
- [ ] Rebases onto current `origin/main` inside the submodule before running tests
- [ ] Rebase conflicts are detected, aborted cleanly, and task is rejected with conflict details
- [ ] pytest runs on rebased code in the review worktree's submodule
- [ ] Test failures are rejected with a summary explaining what went wrong
- [ ] Test passes mark the check as passed — task moves from CHECKS to IN REVIEW on dashboard
- [ ] Does not modify the implementing agent's worktree or branch
- [ ] Default checks for new `orchestrator_impl` tasks updated to include `gk-testing-octopoid`
- [ ] Orchestrator tests pass (pytest in submodule)

CLAIMED_BY: orch-impl-1
CLAIMED_AT: 2026-02-07T17:07:33.516983

## Review Feedback (rejection #1)

Task spec replaced: renamed to gk-testing-octopoid with explicit submodule handling. Re-creating with correct spec.

REVIEW_REJECTED_AT: 2026-02-07T17:15:18.739892
REVIEW_REJECTED_BY: human
