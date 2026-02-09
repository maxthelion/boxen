# [TASK-fb4fca67] Dashboard: task detail view on Work Board

ROLE: orchestrator_impl
PRIORITY: P2
BRANCH: main
CREATED: 2026-02-09T11:11:36.644133
CREATED_BY: human
CHECKS: gk-testing-octopoid

## Context
Add a task detail view to the Octopoid dashboard Work Board tab.

## Current State
- Work Board (TAB_WORK=0) renders task cards in 4 columns (QUEUED, IN PROGRESS, CHECKS, IN REVIEW)
- Cards show ID, title, and progress bar but no way to drill into details
- Agents tab already has a master-detail pattern (agent list + detail pane) — use it as a reference
- Cursor navigation exists for Agents (agent_cursor) and PRs (pr_cursor) tabs but NOT for Work tab
- work_cursor field exists in DashboardState but is unused

## Key Files
- Dashboard: orchestrator/octopoid-dash.py (1,189 lines)
- Data layer: orchestrator/orchestrator/reports.py
- Tests: orchestrator/tests/test_dashboard.py (606 lines)

## Requirements

### 1. Arrow key navigation on Work Board
- Arrow keys (j/k or ↑/↓) highlight task cards across all columns
- Navigation order: left-to-right across columns, top-to-bottom within columns
- Highlighted card: text turns yellow (use Colors.WARNING=5 for yellow)
- Use the existing work_cursor field in DashboardState
- Wire into _move_cursor() and handle_input() following the Agents/PRs tab pattern

### 2. Task detail view (Enter to open)
- Pressing Enter on a highlighted task opens a detail pane
- Detail view should show:
  - Task ID, title, role, priority, branch
  - Agent (claimed_by), status/queue
  - Turn progress: turns_used / turn_limit with progress bar
  - Commit count (both main repo and submodule if orchestrator_impl)
  - Created timestamp, age
  - Attempt count, rejection count (if >0)
  - Blocked by (if any)
  - PR number + staging URL (if available)
  - Check results (if any gatekeeper checks)
- Layout: full-width overlay replacing the board (not a modal/popup)
- Esc closes detail view and returns to the board

### 3. Data sources
- Primary: the task dict already returned by reports._gather_work() has most fields
- All needed data is already in the report dict under work.queued/in_progress/checking/in_review
- No new DB queries needed — just render what is already gathered

## Acceptance Criteria
- [ ] j/k and arrow keys navigate task cards on Work Board with yellow highlight
- [ ] Enter opens full-width detail view for selected task
- [ ] Detail view shows all task metadata listed above
- [ ] Esc returns to board view with cursor position preserved
- [ ] Navigation wraps correctly across columns
- [ ] Tests added for cursor movement and detail view rendering
- [ ] Works in both live and demo modes

## Acceptance Criteria
- [ ] j/k and arrow keys navigate task cards on Work Board with yellow highlight
- [ ] Enter opens full-width detail view for selected task
- [ ] Detail view shows all task metadata (ID, title, role, priority, branch, agent, status, turns, commits, age, attempts, blocked_by, PR, staging URL, checks)
- [ ] Esc returns to board view with cursor position preserved
- [ ] Navigation wraps correctly across columns
- [ ] Tests added for cursor movement and detail view rendering
- [ ] Works in both live and demo modes

CLAIMED_BY: orch-impl-1
CLAIMED_AT: 2026-02-09T11:11:40.025433

ACCEPTED_AT: 2026-02-09T11:18:27.480877
ACCEPTED_BY: self-merge
