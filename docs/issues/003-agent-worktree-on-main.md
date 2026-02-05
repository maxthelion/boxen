# Issue 003: Agent Worktrees Should Not Checkout Main

**Date Reported:** 2026-02-05
**Status:** Open
**Component:** Orchestrator

## Description

Agent worktrees are checking out `main` directly instead of working on detached branches. This blocks the main repo from checking out main and violates the principle that agents should work in isolation.

### Steps to Reproduce

1. Start the orchestrator with a breakdown-agent
2. Observe the breakdown-agent worktree is on `main`
3. Try to `git checkout main` in the main repo
4. Fails with: `fatal: 'main' is already checked out at '...breakdown-agent/worktree'`

### Expected Behavior

Agent worktrees should:
- Start on a detached HEAD or agent-specific branch
- Never checkout `main` directly
- Only work on feature branches created for their tasks

### Actual Behavior

The breakdown-agent worktree is checked out on `main`, blocking checkout of main in other locations.

## Technical Analysis

When agent worktrees are created, they should either:
1. Be created with `--detach` flag
2. Checkout an agent-specific branch (e.g., `agent/breakdown-agent/workspace`)
3. Immediately checkout the task's feature branch when claiming work

The current implementation likely creates the worktree on main and expects the agent to switch branches, but if no task is claimed or the agent is idle, it remains on main.

## Recommended Fixes

**Option A: Detached HEAD on creation**
```bash
git worktree add --detach .orchestrator/agents/{name}/worktree
```

**Option B: Agent-specific branch**
```bash
git worktree add -b agent/{name}/workspace .orchestrator/agents/{name}/worktree main
```

**Option C: Checkout task branch before any work**
Ensure agents always checkout their task's feature branch immediately when claiming, and switch to a detached HEAD when idle.

## Affected Code

- `orchestrator/orchestrator/scheduler.py` - worktree creation
- Agent role scripts that may assume they're on a branch

## Impact

- Blocks `git checkout main` in main repo
- Could lead to accidental commits to main
- Violates isolation principle for agents
