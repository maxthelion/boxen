# Worktree Rules

## Agent Worktrees Are Exclusive

An agent's worktree at `.orchestrator/agents/{name}/worktree/` belongs exclusively to that agent. No other process should checkout, reset, or modify files while the agent might be running.

**Safe:** `git log`, `git diff`, `git show` (read-only object store operations).
**Unsafe:** `git checkout`, `git reset`, `git clean`, running tests, modifying files.

## Review Worktree Is for Humans

`.orchestrator/agents/review-worktree/` is reserved for interactive human review sessions. Automated agents should use their own worktrees, not the shared review worktree.

After modifying the review worktree (running tests, cherry-picking), reset it:
```bash
git checkout --detach HEAD
git clean -fd
git reset --hard origin/main
```

Read-only operations don't need cleanup.

## Submodule Init Is Required Per-Worktree

Each git worktree has independent submodule state. Any process that needs submodule access in a worktree must run:
```bash
git submodule update --init orchestrator
```

The scheduler handles this for agent worktrees. The review worktree and any ephemeral worktrees need it manually.
