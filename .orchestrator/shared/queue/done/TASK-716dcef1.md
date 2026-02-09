# [TASK-716dcef1] Dashboard: completed work tab

ROLE: orchestrator_impl
PRIORITY: P2
BRANCH: main
CREATED: 2026-02-09T11:11:56.320976
CREATED_BY: human
CHECKS: gk-testing-octopoid

## Context
Add a fifth tab to the Octopoid dashboard showing recently completed work.

## Current State
- Dashboard has 4 tabs: Work (W/1), PRs (P/2), Inbox (I/3), Agents (A/4)
- TAB_WORK=0, TAB_PRS=1, TAB_INBOX=2, TAB_AGENTS=3
- TAB_NAMES and TAB_KEYS arrays define tab bar
- Work Board dropped its DONE column — completed work has no visibility in the dashboard
- reports._gather_work() already fetches done tasks (queue='done', filtered to <24h)

## Key Files
- Dashboard: orchestrator/octopoid-dash.py
- Data layer: orchestrator/orchestrator/reports.py
- Tests: orchestrator/tests/test_dashboard.py
- DB: orchestrator/orchestrator/db.py (task_history table)

## Requirements

### 1. New tab: Done (D/5)
- Add TAB_DONE=4
- Key binding: D or 5
- Tab name: "Done"
- Update TAB_NAMES, TAB_KEYS arrays
- Wire into handle_input() tab switching

### 2. Completed work list
- Show tasks completed in the last 7 days (not just 24h like the work board's done filter)
- Query: use db.list_tasks() filtering for queue='done', sorted by most recent first
- If reports._gather_work() doesn't provide enough history, add a _gather_done_tasks() function in reports.py

### 3. Per-task display
Each row should show:
- Task ID (8 chars) with ORCH badge if orchestrator role
- Title
- Completed timestamp + age (e.g., "2h ago", "1d ago")
- Turns used / turn limit
- Commit count
- Merge method: "self-merge" vs "human" vs "manual" (from accepted_by field in DB)
- Agent name

### 4. Layout
- Scrollable list with j/k navigation (reuse cursor pattern from PRs tab)
- One task per row, compact format
- Header row with column labels
- Footer showing total count and time range

### 5. Include failed/recycled
- Show recycled tasks with a distinct indicator (e.g., ♻ symbol)
- Show failed tasks if any (red text)
- Successful completions in green

## Acceptance Criteria
- [ ] New "Done" tab accessible via D or 5 key
- [ ] Shows tasks completed in last 7 days, most recent first
- [ ] Each entry shows: ID, title, age, turns, commits, merge method, agent
- [ ] j/k navigation works for scrolling
- [ ] Recycled and failed tasks are visually distinct
- [ ] Tests added for tab rendering and data display
- [ ] Works in both live and demo modes (add demo done data)

## Acceptance Criteria
- [ ] New "Done" tab accessible via D or 5 key
- [ ] Shows tasks completed in last 7 days, most recent first
- [ ] Each entry shows: ID, title, age, turns, commits, merge method, agent
- [ ] j/k navigation works for scrolling
- [ ] Recycled and failed tasks are visually distinct
- [ ] Tests added for tab rendering and data display
- [ ] Works in both live and demo modes (add demo done data)

CLAIMED_BY: orch-impl-1
CLAIMED_AT: 2026-02-09T11:24:10.560917

SUBMITTED_AT: 2026-02-09T11:31:19.256679
COMMITS_COUNT: 1
TURNS_USED: 56

ACCEPTED_AT: 2026-02-09T11:43:53.720765
ACCEPTED_BY: human
