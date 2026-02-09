# [TASK-90acf0f6] Implement push-then-pull self-merge for main repo commits

ROLE: orchestrator_impl
PRIORITY: P1
BRANCH: main
CREATED: 2026-02-09T10:09:20.126058
CREATED_BY: human
CHECKS: gk-testing-octopoid

## Context
The orchestrator_impl self-merge for main repo commits currently cherry-picks into the local checkout, which fails if the human has uncommitted work. Instead, the self-merge should push to origin and ff-merge there, never touching the human's working tree.

Current flow (broken when main checkout is dirty):
1. Agent rebases tooling/<task-id> onto main in worktree
2. Cherry-pick into main checkout -> FAILS if dirty

Desired flow:
1. Agent rebases tooling/<task-id> onto origin/main in worktree
2. Push rebased branch to origin
3. git push origin tooling/<task-id>:main (ff-only, since rebased)
4. Send notification via /send-to-inbox: "merged, run git pull"
5. Accept in DB

The submodule path already pushes to origin (no conflict risk). The main repo path needs the same treatment.

See draft: project-management/drafts/octopoid/027-2026-02-09-self-merge-main-repo.md (Dirty Working Tree Problem section)

## Acceptance Criteria
- [ ] Main repo self-merge pushes to origin instead of cherry-picking into local checkout
- [ ] git push origin tooling/<task-id>:main --ff-only used for the merge
- [ ] If ff-only push fails (main has diverged), rebase and retry
- [ ] On success, send notification to human inbox: "TASK-xxx merged to main, run git pull"
- [ ] On failure, fall back to submit_completion() as today
- [ ] Human working tree is never touched during self-merge
- [ ] Tests cover the push-to-origin flow (mock subprocess calls)

CLAIMED_BY: orch-impl-1
CLAIMED_AT: 2026-02-09T10:09:24.016716

SUBMITTED_AT: 2026-02-09T10:15:22.096807
COMMITS_COUNT: 1
TURNS_USED: 34

ACCEPTED_AT: 2026-02-09T10:39:50.347008
ACCEPTED_BY: manual-push-to-origin
