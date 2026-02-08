# Worktree Rules for Orchestration

**Status:** Draft
**Created:** 2026-02-08

## Problem

The orchestrator uses git worktrees to give agents isolated environments. But the rules are implicit and inconsistent across roles. The review worktree is shared with no concurrency control. There's no ephemeral worktree pattern for one-off operations. The gatekeeper, rebaser, and human review workflows all need code access but have different isolation requirements.

## Current State

### Per-Agent Persistent Worktrees

Each agent (implementer, orch-impl, breakdown) gets one persistent worktree at `.orchestrator/agents/{name}/worktree/`. It's created once and reused across tasks. Between tasks, `_reset_worktree()` cleans it: detach HEAD, `git clean -fd`, reset to `origin/main`.

**Implication:** Old branch refs (like `orch/<task-id>`) persist in the git object store even after the agent moves to a new task. The working directory is clean but history remains.

### Shared Review Worktree

`.orchestrator/agents/review-worktree/` is used by:
- **check_runner** — cherry-picks/rebases agent commits, runs pytest
- **gatekeeper** — Claude-based review, runs commands via prompt instructions
- **human review** — interactive `/check-orchestrator-task` and `/preview-pr`

There is no concurrency control. If two roles try to use it simultaneously, they corrupt each other's state.

### Submodule Isolation

Orchestrator_impl agents have a submodule at `worktree/orchestrator/` with its own git object store (separate from the main checkout). Commits in the agent's submodule are invisible from the main checkout's submodule and vice versa. The `orch/<task-id>` branches are never pushed to origin — they only exist locally in the agent's submodule.

## Rules

### Rule 1: One persistent worktree per agent, never shared

An agent's worktree at `.orchestrator/agents/{name}/worktree/` belongs exclusively to that agent. No other process should `checkout`, `reset`, or modify the working directory while the agent might be running.

**Safe:** Reading refs with `git log`, `git diff`, `git show` (these don't touch the working directory).
**Unsafe:** `git checkout`, `git reset`, `git clean`, running tests, modifying files.

### Rule 2: Read-only access to any worktree is always safe

`git log main..orch/<task-id>`, `git diff main..orch/<task-id>`, and `git show <ref>` work on the object store, not the working directory. These can be run against any worktree's submodule at any time, even while the agent is active.

### Rule 3: The review worktree needs a lock

The review worktree is shared infrastructure. Any process that modifies it (checkout, cherry-pick, test execution) must acquire an exclusive lock first. Proposed mechanism: a lockfile at `.orchestrator/agents/review-worktree/.review-lock` with PID and timestamp. If stale (>10 minutes), force-acquire.

Roles that need the lock: check_runner, gatekeeper, rebaser, human review scripts.

### Rule 4: Prefer ephemeral worktrees for one-off operations

For operations that need code access but aren't tied to a long-running agent (human review, rebasing, one-off test runs), create a throwaway worktree:

```bash
# Create from a ref without touching any existing worktree
git worktree add --detach /tmp/orch-review-<task-id> <ref>
# ... do work ...
git worktree remove /tmp/orch-review-<task-id>
```

For submodule work, the throwaway worktree must be created from the agent's submodule (since orch/ branches are local to it):

```bash
cd .orchestrator/agents/orch-impl-1/worktree/orchestrator
git worktree add --detach /tmp/orch-review-<task-id> orch/<task-id>
# Run tests in /tmp/orch-review-<task-id>
git worktree remove /tmp/orch-review-<task-id>
```

This avoids contention on the shared review worktree entirely.

### Rule 5: Push orch/ branches to origin

Currently `orch/<task-id>` branches are local to the agent's submodule object store. This makes them invisible from any other worktree or clone. The agent should push these branches to origin after committing:

```bash
git push origin orch/<task-id>
```

This enables:
- Review worktree can fetch the branch without adding the agent's repo as a remote
- Ephemeral worktrees can access the code
- Multiple reviewers can access the same work
- Branches survive if the agent's worktree is deleted

Clean up after approval: `git push origin --delete orch/<task-id>`.

### Rule 6: Submodule init is required per-worktree

Each git worktree has independent submodule state. Creating a new worktree does not automatically initialise submodules. Any process that needs submodule access must run:

```bash
git submodule update --init orchestrator
```

The scheduler already does this for agent worktrees. Ephemeral worktrees and the review worktree need it too.

### Rule 7: Reset between uses, not between reads

After a process finishes modifying the review worktree (running tests, cherry-picking), it should reset to a clean state:

```bash
git checkout --detach HEAD
git clean -fd
git reset --hard origin/main
```

Read-only operations (git log, git diff) don't need cleanup.

## Role-Specific Worktree Access

| Role | Has own worktree | Uses review worktree | Needs code access | Safe to run concurrently |
|------|-----------------|---------------------|-------------------|------------------------|
| Implementer | Yes (exclusive) | No | Yes (own) | Yes — isolated |
| Orch-impl | Yes (exclusive) | No | Yes (own submodule) | Yes — isolated |
| Check runner | No | Yes (with lock) | Yes (tests) | No — needs lock |
| Gatekeeper | No | Yes (with lock) | Yes (review + tests) | No — needs lock |
| Rebaser | No | Ephemeral preferred | Yes (rebase + tests) | Yes if ephemeral |
| Human review | No | Ephemeral preferred | Yes (review + tests) | Yes if ephemeral |
| Breakdown | Yes (exclusive) | No | Yes (read previous work) | Yes — isolated |
| Validator | No | No | No (DB only) | Yes |
| Coordinator | No | No | No (metadata only) | Yes |

## Migration

1. **Add lock to review worktree** — implement in check_runner and gatekeeper roles
2. **Push orch/ branches** — update orchestrator_impl agent prompt/role to push after commit
3. **Add ephemeral worktree helper** — utility function in `git_utils.py` for creating/cleaning throwaway worktrees
4. **Update `/check-orchestrator-task`** — use ephemeral worktree for test phase
5. **Design rebaser** — ephemeral worktree per rebase operation, not shared review worktree
