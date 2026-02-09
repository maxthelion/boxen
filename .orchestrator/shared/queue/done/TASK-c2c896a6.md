# [TASK-c2c896a6] Fix draft-processor to commit and push its work

ROLE: orchestrator_impl
PRIORITY: P1
BRANCH: main
CREATED: 2026-02-09T11:12:10.612754
CREATED_BY: human
CHECKS: gk-testing-octopoid

## Context
The draft-processor agent processes stale drafts (archives them, creates proposed-task files, sends inbox messages) but fails to commit and push its changes. It creates a feature branch but never follows through with git add/commit/push, so all file changes are lost when the worktree is cleaned up.

## Root Cause
The draft-processor is a proposer role. The git lifecycle (branch creation, commit, push) is documented in its prompt at .orchestrator/prompts/draft-processor.md under "## Git Lifecycle", but the agent doesn't reliably follow through. On its first real run (2026-02-09), it:
1. Created branch tooling/draft-processing-20260209-110000 ✓
2. Archived 13 drafts, created 8 proposed-task files, sent inbox message ✓
3. Never ran git add/commit/push ✗

The human had to manually commit the changes.

## Investigation Needed
1. Read the draft-processor prompt (.orchestrator/prompts/draft-processor.md) — the git lifecycle section is already there
2. Check if the proposer role class (orchestrator/orchestrator/roles/proposer.py) has any git support that could be leveraged
3. Determine why the agent skipped the commit/push step — is the prompt not clear enough, or is there a structural issue?

## Possible Fixes
1. **Improve prompt clarity**: Make the git lifecycle instructions more imperative and position them as the LAST step (currently they're in the middle of the doc)
2. **Add a post-run hook**: In the scheduler or proposer role, check if the worktree has uncommitted changes after the agent finishes and auto-commit/push
3. **Add git lifecycle to the proposer role class**: Similar to how orchestrator_impl has _try_merge_to_main(), give proposer a _commit_and_push() method

Option 3 is preferred — it makes the behavior reliable regardless of prompt quality.

## Acceptance Criteria
- [ ] After draft-processor runs and makes file changes, those changes are committed and pushed to a feature branch
- [ ] If no changes were made, no branch/commit/push happens
- [ ] The commit message is descriptive (e.g., "chore: process drafts - archive N, propose M tasks")
- [ ] The branch is pushed to origin so it can be reviewed/merged
- [ ] Tests verify the commit/push behavior
- [ ] Other proposer agents are not affected (this can be draft-processor-specific or opt-in via config)

## Acceptance Criteria
- [ ] After draft-processor runs and makes file changes, those changes are committed and pushed to a feature branch
- [ ] If no changes were made, no branch/commit/push happens
- [ ] The commit message is descriptive (e.g., "chore: process drafts - archive N, propose M tasks")
- [ ] The branch is pushed to origin so it can be reviewed/merged
- [ ] Tests verify the commit/push behavior
- [ ] Other proposer agents are not affected (this can be draft-processor-specific or opt-in via config)

CLAIMED_BY: orch-impl-1
CLAIMED_AT: 2026-02-09T11:18:28.413983

SUBMITTED_AT: 2026-02-09T11:24:00.565826
COMMITS_COUNT: 1
TURNS_USED: 44

ACCEPTED_AT: 2026-02-09T11:35:31.708740
ACCEPTED_BY: human
