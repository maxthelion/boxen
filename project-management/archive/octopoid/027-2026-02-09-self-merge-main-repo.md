---
**Processed:** 2026-02-09
**Mode:** human-guided
**Actions taken:**
- Implemented via TASK-f94f3914 (self-merge for main repo commits, 632 lines, 13 tests)
- Extended approve_orchestrator_task.py to handle main repo commits (f51f55d)
- Extracted branch naming and origin-merge rules to `.claude/rules/orchestration.md`
- Enqueued TASK-90acf0f6: push-then-pull flow (dirty working tree fix)
**Outstanding items:**
- Path allowlist for auto-merge not enforced (merges any main repo commits regardless of file path)
---

# Self-Merge for Main Repo Commits

**Status:** Ready to build
**Captured:** 2026-02-09

## Raw

> "I want a role similar to orch-impl that does automerging. Perhaps it is just extended to check commits in main as well as submodule. I don't want to review pull requests for this stuff."
> "I am concerned about the agents working directly on main. We still want them working in a branch, but automatically rebasing and merging when they are done."

## Idea

Extend `orchestrator_impl` self-merge to handle main repo commits. Currently the agent works on `orch/<task-id>` in the submodule but has no equivalent branch in the main repo — so main repo files either go directly on main (unsafe) or don't get committed at all (what happened with send-to-inbox).

## Decision: Option C — commit-location-aware

Extend the existing `orchestrator_impl` role to detect where the agent made changes and merge accordingly. No new role needed.

## Design

### Feature branch for main repo work

The agent must work on a feature branch in the main repo, not directly on main. Same pattern as the submodule's `orch/<task-id>`:

- Branch name: `tooling/<task-id>` (in the main repo)
- Created at task start if the agent will write main repo files
- All main repo commits go on this branch
- Main is never touched until self-merge succeeds

### Self-merge flow (extended `_try_merge_to_main`)

After the agent finishes, detect where commits landed:

1. **Check submodule** — existing: count commits on `orch/<task-id>` vs main
2. **Check main repo** — new: count commits on `tooling/<task-id>` vs main

Then merge whichever has commits (or both):

- **Submodule only** (existing flow): rebase `orch/<task-id>` onto main → pytest → ff-merge → push
- **Main repo only** (new): rebase `tooling/<task-id>` onto main → pytest → ff-merge → push
- **Both**: merge submodule first (it has tests), then main repo

If any step fails, fall back to `submit_completion()` as today.

### What gets auto-merged

Tooling files only — low-risk, internal-facing:
- `.claude/commands/`
- `project-management/scripts/`
- `.orchestrator/prompts/`
- `.orchestrator/agents.yaml`
- `.orchestrator/shared/` configuration

NOT app code, NOT `package.json`, NOT `vite.config.ts`. Those go through the normal PR flow.

### Test gate

Pytest only (orchestrator tests). These tooling files don't affect app behavior, so vitest adds cost with no signal.

### Safety properties

- **Main is never dirty**: work happens on `tooling/<task-id>`, merge is ff-only after rebase
- **Interrupted work is safe**: stays on the feature branch, can be resumed or cleaned up
- **Multiple agents can't conflict**: each on a separate `tooling/<task-id>` branch
- **Graceful fallback**: if merge fails, task goes to provisional queue as today

## Implementation

### Changes to `orchestrator_impl.py`

1. **Branch creation**: at task start, create `tooling/<task-id>` branch in the worktree's main repo (alongside the existing `orch/<task-id>` in the submodule)
2. **Commit counting**: after agent finishes, count commits in both locations
3. **`_try_merge_to_main()`**: extend to handle main repo merges (rebase → test → ff-merge), in addition to existing submodule merges
4. **Submission logic**: if either location has commits and merge succeeds → `accept_completion()`

### Changes to scheduler (if needed)

The scheduler creates worktrees on the base branch (main). It may need to create the `tooling/<task-id>` branch in the worktree after creation, or the role can do this itself at task start.

## Dirty Working Tree Problem

The main checkout may have uncommitted human work when the agent tries to merge. Git won't cherry-pick or merge onto a dirty working tree. The submodule path doesn't have this problem because the submodule is a separate git repo — both worktrees can have `main` checked out independently. The main repo can't do this (git prevents the same branch being checked out in two worktrees).

**Options:**

1. **Push-then-pull**: Agent pushes its rebased branch to origin. Main checkout pulls when clean. The merge is deferred until the human commits or stashes their work. A notification (via /send-to-inbox) tells the human "TASK-xyz ready to merge — run `git pull` when your working tree is clean."

2. **Stash-merge-unstash**: The approve script stashes local changes, merges, then pops. Risk: stash conflicts on pop, or forgetting to pop.

3. **Fail with notification**: If the working tree is dirty, abort the merge and send a notification to the human inbox with the details. The task stays in provisional until the human runs the approve script manually.

**Decision: Option 1 (push-then-pull).** This is what origin and remotes are designed for. The agent pushes its rebased branch, then ff-merges to main on origin. The main checkout pulls when ready. The agent never touches the human's working tree. A notification tells the human to pull.

## Context

TASK-fca7e249 (send-to-inbox skill) was correctly implemented — both files exist and work. But the agent was `orchestrator_impl`, which only counts commits in the submodule. The agent wrote files to the main repo, reported 0 commits, and couldn't self-merge. A human had to investigate and manually commit the files.

This will keep happening for any task that produces tooling, commands, scripts, or prompts rather than orchestrator Python code.
