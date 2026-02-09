# [TASK-a05fb38e] Add git lifecycle to draft-processor prompt

ROLE: orchestrator_impl
PRIORITY: P1
BRANCH: main
CREATED: 2026-02-09T10:35:17.952258
CREATED_BY: human
CHECKS: gk-testing-octopoid

## Context
The draft-processor agent (role: proposer) has a prompt that tells it to move files 
(mv from drafts to archive), create new files, and run shell scripts — but has ZERO git instructions. 
When it runs, the scheduler creates a worktree, the agent makes file changes, but those changes are 
never committed or pushed. They silently disappear.

The proposer role class itself has no post-run git lifecycle (unlike orchestrator_impl which has 
branch creation, commit counting, and self-merge).

This is a concrete bug — the agent would do real work that is lost.

Reference: project-management/drafts/octopoid/030-2026-02-09-role-model-review.md (Investigation Findings section)

## Acceptance Criteria
- [ ] draft-processor prompt (.orchestrator/prompts/draft-processor.md) updated with git instructions
- [ ] Agent told to create a branch (e.g. tooling/draft-processing-<timestamp>) before making changes
- [ ] Agent told to commit all file changes (archive moves, new proposed-task files, processing summaries)
- [ ] Agent told to push the branch to origin
- [ ] Commit message format specified (e.g. "chore: process drafts - archive X, propose Y")
- [ ] Instructions are clear about what to do if there are no changes (skip commit/push)
- [ ] Orchestrator tests still pass: cd orchestrator && ./venv/bin/python -m pytest tests/ -v

CLAIMED_BY: orch-impl-1
CLAIMED_AT: 2026-02-09T10:35:20.588062

ACCEPTED_AT: 2026-02-09T10:40:16.414267
ACCEPTED_BY: self-merge
