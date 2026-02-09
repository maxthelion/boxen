# Unblock Orchestrator Specialist Agent

## Problem

The orchestrator specialist (`orch-impl-1`) can't successfully complete tasks due to two bugs:

1. **`create_task()` character explosion** — `acceptance_criteria` typed as `list[str]` but callers pass a string. Iterating a string yields characters, producing `- [ ] F`, `- [ ] i`, `- [ ] x` etc.
2. **Agent can't work in submodule from worktree** — The worktree is a checkout of the main Boxen repo. The agent needs to work in `orchestrator/` within that worktree, but the submodule isn't initialized there and the prompt doesn't guide the agent clearly enough.

## Fixes

### Fix 1: `create_task()` in `queue_utils.py` (line 773-805)

**Root cause:** Line 777 declares `acceptance_criteria: list[str]` but callers pass a multi-line string. Line 805 does `for c in acceptance_criteria` which iterates characters.

**Fix:** Accept `str | list[str]`. If string, split on newlines and strip `- [ ]` prefixes before re-adding them.

```python
# Line 777: change type
acceptance_criteria: str | list[str],

# Line 805: handle both types
if isinstance(acceptance_criteria, str):
    lines = [line.strip() for line in acceptance_criteria.strip().splitlines() if line.strip()]
    # Strip existing checkbox prefixes
    lines = [re.sub(r'^-\s*\[[ x]\]\s*', '', line) for line in lines]
    acceptance_criteria = lines
criteria_md = "\n".join(f"- [ ] {c}" for c in acceptance_criteria)
```

### Fix 2: Orchestrator agent prompt + submodule init

**Root cause:** The worktree has `orchestrator/` as an empty or uninitialized submodule directory. The agent prompt says "all code is in the orchestrator/ submodule" but doesn't tell it how to initialize it.

**Fix:**
- Update the `orchestrator_impl` prompt to include explicit submodule init steps
- Add a setup command in the scheduler that runs `git submodule update --init` in the worktree before launching the agent

### Fix 3: Accept burned-out task, clear the way

The `960a4712` task burned out (0 commits, 200 turns). Accept it in DB so it doesn't block.

## Execution Order

1. Fix `create_task()` in submodule
2. Update orchestrator_impl prompt in scheduler
3. Add submodule init to worktree setup
4. Run tests
5. Commit in submodule, push
6. Accept burned-out task
7. Update submodule ref on main, push
8. Verify agent picks up next task
