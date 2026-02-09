# Plan: Orchestrator Submodule Feature Branches

**Status:** Draft
**Created:** 2026-02-07
**Triggered by:** Postmortem — false rejection of submodule commits; agents bypassing approval gate by pushing directly to shared branch

## Problem

All orchestrator_impl agents push commits to the same `sqlite-model` branch. This causes:

1. **Commits from different tasks bleed together.** When agent pushes for task A, task B's commits go to origin too.
2. **No approval gate.** Code lands on the shared branch before the approve script runs.
3. **Review confusion.** Reviewers can't tell which commits belong to which task.
4. **Separate git object stores.** Worktree and main submodules have different object stores, making commit lookup unreliable.

## Solution

Merge `sqlite-model` into `main` and switch orchestrator_impl agents to feature branches, mirroring how regular app tasks work.

### One-Time Migration

1. Merge `sqlite-model` → `main` in the orchestrator submodule
2. Push `main` to origin
3. Update the submodule ref in the parent Boxen repo
4. Delete the `sqlite-model` branch (or leave as archive)

### Workflow Changes

**Before (current):**
```
Agent claims task → works on sqlite-model → pushes to origin/sqlite-model → approve script cherry-picks (often finds 0 new commits because agent already pushed)
```

**After:**
```
Agent claims task → scheduler creates orch/<task-id> branch off main → agent works on feature branch → approve script merges feature branch into main → push main
```

### Code Changes Required

#### 1. Scheduler — branch creation for orchestrator_impl tasks

Currently the scheduler assumes orchestrator_impl agents work on `sqlite-model`. Update to:
- Create a feature branch `orch/<task-id>` off `main` in the worktree submodule
- Set the submodule to this branch before launching the agent

**Files:** `orchestrator/scheduler.py` (the worktree/submodule setup section)

#### 2. Approve script — merge instead of cherry-pick

Currently `approve_orch.py`:
- Fetches from agent worktree submodule
- Cherry-picks commits onto local sqlite-model
- Pushes sqlite-model

Update to:
- Fetch the agent's feature branch
- Merge (or fast-forward) into main
- Push main

**Files:** `orchestrator/approve_orch.py`

#### 3. gk-testing-octopoid check — rebase onto main

Currently `check_runner.py` rebases onto `origin/sqlite-model`. Update to:
- Rebase onto `origin/main`
- Run tests on rebased code

**Files:** `orchestrator/roles/check_runner.py`

#### 4. Review script — compare against main

Currently `review_orch.py` compares against `origin/sqlite-model`. Update to:
- Compare against `origin/main`

**Files:** `orchestrator/review_orch.py`

#### 5. Remove all `sqlite-model` references

Grep for `sqlite-model` and `SUBMODULE_BRANCH` across the codebase and update to `main`.

**Files:** Multiple — grep will identify all.

#### 6. Agent prompt — no changes needed

The orchestrator_impl agent prompt doesn't reference branch names directly. The scheduler sets up the environment.

### Acceptance Criteria

- [ ] `sqlite-model` merged into `main` in orchestrator submodule
- [ ] Scheduler creates `orch/<task-id>` feature branches in the worktree submodule
- [ ] Approve script merges feature branch into `main` (not cherry-pick onto sqlite-model)
- [ ] gk-testing-octopoid check rebases onto `origin/main`
- [ ] Review script compares against `origin/main`
- [ ] No remaining `sqlite-model` references in orchestrator code (except historical/docs)
- [ ] Agent commits stay isolated on their feature branch until approved
- [ ] Two concurrent orchestrator tasks don't interfere with each other's branches
- [ ] All orchestrator tests pass

### Risks

- **Migration timing:** Need to ensure no orchestrator_impl tasks are in-flight when we merge and switch. Pause orch-impl-1 first.
- **Existing provisional tasks:** Tasks like 70d0c33e reference commits on sqlite-model. Approve these before migrating.
- **Single agent limitation:** Currently only orch-impl-1 exists. With feature branches, we could safely run multiple orchestrator agents in parallel (future benefit).

### Sequence

1. Approve remaining provisional orchestrator tasks (70d0c33e)
2. Pause orch-impl-1
3. Merge sqlite-model → main, push
4. Implement the code changes (scheduler, approve, check, review scripts)
5. Test with a small task
6. Resume orch-impl-1
