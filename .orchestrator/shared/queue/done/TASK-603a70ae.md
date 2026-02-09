# [TASK-603a70ae] Enhance PR review workflow with gatekeeper summaries and visual verification

ROLE: implement
PRIORITY: P2
BRANCH: main
CREATED: 2026-02-07T09:40:05.449257
CREATED_BY: human

## Context
The /preview-pr slash command exists at .claude/commands/preview-pr.md and handles checkout + dev server. Enhance it into a full review workflow that incorporates gatekeeper review output.

The gatekeeper system (now implemented) runs architecture, testing, and QA reviewers on provisional tasks. Their output should feed into the human review step.

The enhanced review flow should:
1. Check gatekeeper review summaries (architecture, testing, QA pass/fail + reasons)
2. Check out the branch in the review worktree (.orchestrator/agents/review-worktree/)
3. Start dev server on port 5176
4. Summarize user-facing functionality that can be tested
5. Generate starting state via share link serialization (scripts/generate-share-link.ts)
6. Walk through test scenarios with the user

See project-management/drafts/visual-pr-review-command.md for the original /review-pr proposal.
See project-management/drafts/workflow-improvements-action-plan.md Action C for context.

## Acceptance Criteria
- [ ] /preview-pr (or new /review-pr) shows gatekeeper review summaries before visual review
- [ ] Gatekeeper pass/fail status and reasons are displayed clearly
- [ ] Share link generation is used to set up starting state for test scenarios
- [ ] User-facing functionality is summarized with suggested test steps
- [ ] Works with the review worktree and dev server on port 5176
- [ ] Slash command file is updated at .claude/commands/

CLAIMED_BY: impl-agent-1
CLAIMED_AT: 2026-02-07T09:40:23.566884

SUBMITTED_AT: 2026-02-07T09:43:10.734574
COMMITS_COUNT: 1
TURNS_USED: 100

ACCEPTED_AT: 2026-02-07T12:07:35.001357
ACCEPTED_BY: human
