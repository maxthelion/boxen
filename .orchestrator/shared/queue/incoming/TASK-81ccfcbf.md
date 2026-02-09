# [TASK-81ccfcbf] Build /qa-check slash command for manual QA invocation

ROLE: orchestrator_impl
PRIORITY: P2
BRANCH: main
CREATED: 2026-02-09T12:07:21.098716
CREATED_BY: human
PROJECT: 44c3913a
BLOCKED_BY: 4a4c04ab
CHECKS: gk-testing-octopoid

## Context
Create a /qa-check <task-id> slash command that runs QA visually on a task's staging deployment.

1. Look up the task by ID, read staging_url from DB
2. Read task description and acceptance criteria
3. Load QA prompt from .orchestrator/prompts/gatekeeper-qa.md
4. Navigate to staging URL with appropriate share link state
5. Run through QA evaluation (works, intuitive, unexpected results)
6. Produce structured QA report

Implementation: create .claude/commands/qa-check.md. Receives $ARGUMENTS (task ID). Works in interactive sessions. Uses Playwright MCP tools.

Key details:
- staging_url on task record in DB (populated by reports._gather_prs())
- Share link: npx tsx --import ./scripts/register-lz-compat.mjs scripts/generate-share-link.ts <preset>
- Adapt QA prompt for interactive use (show screenshots inline, ask human on ambiguous cases)

## Acceptance Criteria
- [ ] .claude/commands/qa-check.md exists and is invocable as /qa-check <task-id>
- [ ] Looks up staging_url from DB for given task
- [ ] Navigates to staging URL with share link state via Playwright MCP
- [ ] Takes screenshots and evaluates against acceptance criteria
- [ ] Produces structured QA report (pass/fail, observations, screenshots)
