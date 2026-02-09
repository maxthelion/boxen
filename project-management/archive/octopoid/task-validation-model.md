# Task Validation Model

## Current State (and what's wrong)

### The lifecycle of a task

```
incoming → claimed → provisional → done
                         ↑
                    agent finishes
```

When an agent finishes, the task moves to `provisional`. Something then needs to decide: accept it (→ done) or reject it (→ back to incoming with feedback).

### Who does the deciding today?

Three different things, with overlapping and confused responsibilities:

**1. Recycler** (`roles/recycler.py`)
- **Intended purpose:** Cleanup. Detect burned-out tasks (0 commits, high turns), reconcile stale state.
- **What it actually does:** Also auto-accepts all `orchestrator_impl` tasks unconditionally. This was added as a workaround because orchestrator tasks always show 0 commits (submodule commits aren't tracked by the main repo), so the burned-out heuristic would incorrectly recycle them.
- **Problem:** It rubber-stamps orchestrator work without any quality check. The dashboard task landed with broken tests because the recycler accepted it before anyone ran `pytest`.

**2. Validator** (`roles/validator.py`)
- **Intended purpose:** Check whether provisional tasks should be accepted or recycled.
- **What it actually does:** Checks commit counts and turn usage. If 0 commits + high turns → recycle (burned out). If commits exist → accept. Also auto-accepts `orchestrator_impl` tasks (same workaround as recycler).
- **Problem:** It's a heuristic, not a quality check. "Has commits" ≠ "works correctly." It also duplicates the recycler's orchestrator_impl auto-accept.

**3. Gatekeeper** (`roles/gatekeeper.py`)
- **Intended purpose:** LLM-powered code review. Spawns Claude agents to check architecture, testing, QA.
- **What it actually does:** Currently disabled. When enabled, it would review app task PRs.
- **Problem:** It's expensive (spawns Claude agents), only designed for app PRs, and doesn't apply to orchestrator tasks (which don't have PRs).

### Summary of confusion

| Concern | Recycler | Validator | Gatekeeper |
|---------|----------|-----------|------------|
| Detect burned-out tasks | ✓ | ✓ (duplicate) | - |
| Accept tasks with commits | - | ✓ | - |
| Auto-accept orchestrator tasks | ✓ (workaround) | ✓ (workaround) | - |
| Run tests | - | - | - |
| Review code quality | - | - | ✓ (disabled) |
| Reject with feedback | - | - | ✓ (disabled) |

**Nobody runs tests.** The only quality gate is "did the agent make commits?" That's why broken code lands.

## TASK-7bafe49f (lost to premature auto-accept)

This task was scoped as a human-triggered approval script for orchestrator tasks:

1. Cherry-pick agent's submodule commit into main
2. Run `pytest`
3. If tests pass: push submodule, update ref on main, accept in DB
4. If tests fail or conflicts: report the error

The agent was working on it when the recycler auto-accepted the task prematurely (before the agent even committed). We re-queued it, the agent completed it, then the recycler auto-accepted it *again* — overwriting the task file with acceptance metadata. The task content is now gone.

A case study in the problem it was supposed to solve.

## Proposed Model

### Per-task checks

When a task is created, specify which checks it requires before human review:

```python
create_task(
    title="Rewrite dashboard",
    role="orchestrator_impl",
    checks=["pytest-submodule"],   # ← what must pass before human sees it
    ...
)
```

Possible check types:
- `pytest-submodule` — cherry-pick into main in a worktree, run pytest
- `vitest` — checkout PR branch, run vitest (future, for app tasks)
- `typecheck` — run tsc --noEmit (future)
- `build` — run npm run build (future)

No checks specified = goes straight to human review (current behaviour).

This avoids building Jenkins. Each check is a small, specific thing. We add them as needed.

### Testing gatekeeper for orchestrator tasks

A gatekeeper agent (LLM) that knows how to:

1. Pick up a provisional `orchestrator_impl` task
2. Set up the submodule in a worktree on main
3. Cherry-pick the agent's commit
4. Run `pytest`
5. **Tests pass** → mark check as passed, task is ready for human review
6. **Tests fail** → reject the task back to the agent with the test output as feedback

This is an LLM agent rather than a mechanical script because:
- It needs to find the right commit (parse worktree, git log)
- Cherry-pick conflicts require judgement (reject with useful context, not just "conflict")
- It can read the test output and summarise what went wrong for the implementing agent

### Cherry-pick to main stays human-triggered

Once the testing gatekeeper has passed the task, a human runs the approval script to land it:

```bash
.orchestrator/scripts/approve_orchestrator_task.py <task-id>
```

This does the final cherry-pick into the real main branch, pushes, and updates the submodule ref on main. The human is the final gate, but they're reviewing work that already passes tests. **The human never fixes tests** — if something is wrong, it goes back to an agent.

### Clear separation of concerns

```
Recycler    → Cleanup only.
                Stale blockers, stuck claims, dead agents.
                Never accepts or rejects tasks.

Validator   → Heuristic triage.
                Detects burned-out tasks (0 commits + high turns).
                Routes to recycle/breakdown.
                Does NOT accept tasks.

Gatekeeper  → Quality gate. Per-task checks.
                Orchestrator tasks: cherry-pick + pytest in worktree.
                App tasks (future): checkout PR + vitest.
                Passes → ready for human review.
                Fails → reject back to agent with feedback.

Human       → Final review and approval.
                Only sees tasks that have passed their checks.
                Runs approve script to land the work.
```

### Flow

```
provisional
    │
    ▼
Has checks defined?
    │
    ├── No checks → ready for human review
    │
    └── Yes → Gatekeeper runs checks
                  │
                  ├── All pass → ready for human review
                  │
                  └── Any fail → reject to agent with output
                                  (agent gets another attempt)

    ▼
Human reviews
    │
    ├── Approve → approve script → done
    │
    └── Reject → /reject-task with feedback → incoming
```

### What changes

1. **Remove auto-accept from recycler and validator.** No more `if role == "orchestrator_impl": accept`.

2. **Add `checks` field to task schema.** Comma-separated list in the DB, parsed from task file. `/enqueue` gets a checks parameter.

3. **Build the testing gatekeeper.** An agent role that processes provisional tasks with pending checks. Starts with `pytest-submodule` for orchestrator tasks.

4. **Keep the approval script.** Human-triggered, only for final landing. Doesn't fix anything — if it fails, it reports why and the task goes back.

## Implementation

### Phase 1 — Remove workarounds, add checks field
- Remove orchestrator_impl auto-accept from recycler and validator
- Add `checks` column to tasks table
- Update `create_task()` and `/enqueue` to accept checks
- Orchestrator tasks default to `checks=["pytest-submodule"]`

### Phase 2 — Testing gatekeeper for orchestrator tasks
- New gatekeeper agent (or extend existing) that handles `pytest-submodule` check
- Sets up submodule in a worktree, cherry-picks, runs tests
- Pass → marks check complete. Fail → rejects with output.
- Task stays in provisional until all checks pass

### Phase 3 — Extend to app tasks (future)
- Add `vitest` check type
- Gatekeeper checks out PR branch in review worktree, runs tests
- Same pass/reject flow
