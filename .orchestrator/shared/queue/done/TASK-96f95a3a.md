# [TASK-96f95a3a] Add scheduler startup check for venv install path

ROLE: orchestrator_impl
PRIORITY: P2
BRANCH: main
CREATED: 2026-02-07T10:43:26.500204
CREATED_BY: human

## Context
The scheduler loads orchestrator code via an editable pip install. If an agent runs pip install -e . in its worktree, it silently hijacks the shared venv to load code from the wrong directory. This caused a crash loop with "no such table: tasks".

Add a check at the start of run_scheduler() that verifies orchestrator.__file__ resolves to the main orchestrator/ submodule (not an agent worktree). If hijacked, log an error and exit immediately with a clear message like:
"FATAL: orchestrator module loaded from agent worktree: {path}. Run pip install -e . from orchestrator/ to fix."

This is a guard rail — the prompt already forbids agents from running pip install, but defense in depth.

## Acceptance Criteria
- [ ] Scheduler checks orchestrator.__file__ on startup
- [ ] If path contains "agents/" or "worktree", logs FATAL and exits non-zero
- [ ] Test covers the guard (mock orchestrator.__file__ to a worktree path)
- [ ] Normal startup (correct path) is unaffected

CLAIMED_BY: orch-impl-1
CLAIMED_AT: 2026-02-07T11:00:55.071586

SUBMITTED_AT: 2026-02-07T11:04:28.093423
COMMITS_COUNT: 0
TURNS_USED: 200

ACCEPTED_AT: 2026-02-07T11:15:09.093231
ACCEPTED_BY: human
