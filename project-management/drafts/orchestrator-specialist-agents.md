# Specialist Agents for Orchestrator Work

**Context:** The gatekeeper review system plan (and future orchestrator improvements) requires changes to the orchestrator's own code — `db.py`, `queue_utils.py`, `scheduler.py`, agent roles, etc. Regular Boxen implementer agents shouldn't be doing this work because:

1. **They don't know the orchestrator internals.** Implementer prompts are oriented toward the Boxen app (React, Three.js, engine). They'd be working blind on Python code with a different architecture.
2. **They could break the system they're running on.** An implementer modifying `scheduler.py` incorrectly could take down the orchestrator mid-run.
3. **Different test suite.** Orchestrator tests run with `cd orchestrator && ./venv/bin/python -m pytest tests/ -v`, not `npm run test`.
4. **Different commit workflow.** Orchestrator changes are committed in the submodule first, then the submodule reference is updated in main.

## Proposal: Add Orchestrator Specialist Role

A new agent role (`orchestrator-specialist` or `orch-impl`) with:

### Prompt differences from regular implementer

- **Context:** Knows the orchestrator codebase structure (`orchestrator/orchestrator/`), the DB schema, queue lifecycle, scheduler loop, agent roles, backpressure system.
- **Testing:** Runs `cd orchestrator && ./venv/bin/python -m pytest tests/ -v` instead of `npm run test`.
- **Commit workflow:** Commits in the orchestrator submodule, not the main repo. Understands the submodule branch (`sqlite-model`).
- **Safety:** Extra caution around scheduler.py and db.py changes — always run tests before committing. Never modify the running DB directly.
- **No Boxen domain knowledge needed.** Doesn't need to know about Three.js, panels, finger joints, etc.

### Agent configuration

```yaml
- name: orch-impl-1
  role: orchestrator-specialist
  interval_seconds: 300
  paused: true  # Enable when orchestrator tasks are queued
```

### Task routing

Tasks with orchestrator-specific work should be tagged so the scheduler routes them to the specialist:
- Option A: Use `role: orchestrator-specialist` on the task itself
- Option B: Use a `domain: orchestrator` tag and have the scheduler match agent role to task domain

Option A is simpler and consistent with how `breakdown` and `explorer` roles already work.

### What tasks go to the specialist

- All tasks from the gatekeeper review system plan (Tasks 1–8)
- Future orchestrator improvements (new roles, scheduler changes, DB migrations)
- Queue utility changes
- Status script improvements

### What stays with regular implementers

- Boxen app features (components, engine, store)
- Tests for Boxen functionality
- Documentation and plans (interactive session)

## Implementation

1. Create `.orchestrator/prompts/orchestrator-specialist.md` with the specialized prompt
2. Add agent entry to `.orchestrator/agents.yaml`
3. When enqueuing orchestrator tasks, use `role: orchestrator-specialist`
4. The specialist's worktree needs the orchestrator venv set up (`cd orchestrator && python -m venv venv && pip install -e .`)

## Separation from Gatekeepers

The orchestrator specialist and the gatekeeper agents are completely independent concerns:

- **Orchestrator specialist** — works on orchestrator Python code (db.py, scheduler.py, queue_utils.py). Knows the submodule, the venv, the DB schema. Builds and maintains the orchestrator infrastructure, including the gatekeeper system itself.
- **Gatekeepers** (architecture, testing, QA) — review Boxen app code (React, Three.js, engine). They reference CLAUDE.md rules, engine-vs-store boundaries, test-first philosophy. They don't need to know anything about the orchestrator internals.

The specialist builds the house; the gatekeepers inspect what goes in it.

The gatekeeper prompts (`gatekeeper-architecture.md`, etc.) should be drafted by the interactive session since they encode our project-specific quality standards — not by the specialist.

## Open questions

- Do we need more than one specialist agent, or is one enough? Orchestrator tasks are typically sequential (schema migration before queue changes before scheduler changes).
