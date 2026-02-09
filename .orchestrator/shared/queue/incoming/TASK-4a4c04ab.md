# [TASK-4a4c04ab] Write QA agent prompt for visual staging verification

ROLE: orchestrator_impl
PRIORITY: P2
BRANCH: main
CREATED: 2026-02-09T12:07:21.068478
CREATED_BY: human
PROJECT: 44c3913a
CHECKS: gk-testing-octopoid

## Context
Write the QA agent prompt at .orchestrator/prompts/gatekeeper-qa.md (or update the existing one).

Read the full spec in project-management/drafts/boxen/026-2026-02-09-staging-qa-agent.md.

The prompt must cover three evaluation dimensions:

A. Does it work? — Navigate to staging URL with share link state, follow acceptance criteria step by step, screenshot and verify after each step.

B. Is it intuitive? — Approach as first-time user, note confusion points, rate discoverability.

C. Any unexpected results? — Rotate 3D view, check unmodified panels, look for z-fighting/gaps/misalignment.

Workflow: read task → get staging_url → choose share link preset → generate state URL via generate-share-link.ts → navigate → predict outcome → screenshot → interact → screenshot → write structured report.

Reference Playwright MCP tools: browser_navigate, browser_snapshot, browser_take_screenshot, browser_click, browser_type, browser_press_key, browser_evaluate.

## Acceptance Criteria
- [ ] Prompt file exists at .orchestrator/prompts/gatekeeper-qa.md
- [ ] Covers all three evaluation dimensions (works, intuitive, unexpected)
- [ ] References share link generation for state setup
- [ ] References Playwright MCP tools by name
- [ ] Includes structured report template (pass/fail, screenshots, geometry, UX)

CLAIMED_BY: orch-impl-1
CLAIMED_AT: 2026-02-09T12:07:33.387219
