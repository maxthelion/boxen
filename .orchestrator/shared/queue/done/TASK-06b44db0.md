# [TASK-06b44db0] Implement Gatekeeper Review System (D1 + D2)

ROLE: orchestrator_impl
PRIORITY: P1
BRANCH: main
CREATED: 2026-02-07T07:41:34.321722
CREATED_BY: human

## Context
Implement the automated gatekeeper review stage for the orchestrator. The full plan is at project-management/drafts/gatekeeper-review-system-plan.md. The specialist agents note is at project-management/drafts/orchestrator-specialist-agents.md.

This is orchestrator infrastructure work (Python, in the orchestrator/ submodule). It is NOT Boxen app code.

Key references:
- Design: project-management/drafts/orchestrator-review-rejection-workflow.md
- Broader context: project-management/drafts/interactive-claude-and-gatekeeper-workflow.md

Add an automated gatekeeper review stage that intercepts tasks at the provisional stage. Three reviewers (architecture, testing, QA) evaluate the work. If any fail, the task is rejected back to the implementer with feedback. After 3 rejections, escalate to human.

Implementation Tasks (in dependency order):

1. DB Schema Migration (v3 to v4) - Add rejection_count, pr_number, pr_url columns. Bump SCHEMA_VERSION. File: orchestrator/orchestrator/db.py

2. Review Rejection Function - New review_reject_task() in queue_utils, review_reject_completion() in db.py, get_review_feedback(). Escalate after 3 rejections.

3. Implementer Prompt Enhancement - Inject review feedback when rejection_count > 0. Reuse existing branch. Prioritize rejected tasks in claim_task().

4. Review Coordinator - New review_utils.py module. Review state in .orchestrator/shared/reviews/TASK-{id}/. New process_gatekeeper_reviews() in scheduler.

5. Gatekeeper Agent Roles - Rewrite roles/gatekeeper.py for task-branch-diff review. Read REVIEW_TASK_ID and REVIEW_CHECK_NAME from env. Add 3 agents to agents.yaml (paused). New prompts (placeholder content -- PM will draft real ones).

6. Scheduler Integration - Wire process_gatekeeper_reviews() into run_scheduler(). Gatekeeper backpressure in backpressure.py.

7. PR Approval and Merge Pipeline - New approve_and_merge() in queue_utils (gh pr merge --merge). New script approve_task.py. New slash command /approve-task.

8. /reject-task Slash Command - Manual rejection for interactive session.

Important notes:
- All work is in the orchestrator/ submodule (branch: sqlite-model)
- Run tests: cd orchestrator && ./venv/bin/python -m pytest tests/ -v
- After code changes: pip install -e . in venv
- Commit in submodule first, then update submodule ref in main

## Acceptance Criteria
- [ ] DB schema migrated to v4 with rejection_count, pr_number, pr_url columns
- [ ] review_reject_task() works: increments count, appends feedback, moves to incoming
- [ ] 3-rejection escalation triggers correctly
- [ ] Implementer prompt includes review feedback for rejected tasks
- [ ] Review tracking in .orchestrator/shared/reviews/TASK-{id}/
- [ ] Gatekeeper agents can review branch diffs and record pass/fail
- [ ] Scheduler spawns gatekeepers when provisional tasks need review
- [ ] /approve-task merges PR and cleans up
- [ ] /reject-task manually rejects with feedback
- [ ] All existing orchestrator tests still pass
- [ ] New tests cover each component

CLAIMED_BY: impl-agent-1
CLAIMED_AT: 2026-02-07T07:41:43.095047

CLAIMED_BY: orch-impl-1
CLAIMED_AT: 2026-02-07T07:55:11.508389

SUBMITTED_AT: 2026-02-07T08:04:13.062955
COMMITS_COUNT: 1
TURNS_USED: 200

ACCEPTED_AT: 2026-02-07T09:16:05.748544
ACCEPTED_BY: human
