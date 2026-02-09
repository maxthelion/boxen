# [TASK-ea99f944] Add structured project report API (reports.py)

ROLE: orchestrator_impl
PRIORITY: P2
BRANCH: main
CREATED: 2026-02-07T09:32:25.150971
CREATED_BY: human

## Context
Octopoid needs a structured report endpoint that any frontend can consume. Currently, data gathering is scattered across status.py, whats_next.py, and octopoid-dash.py — each re-queries the same sources differently.

Add orchestrator/orchestrator/reports.py with a get_project_report() function that returns a structured dict:

{
    "work": {
        "incoming": [...],      # queued tasks
        "in_progress": [...],   # claimed by agents  
        "in_review": [...],     # provisional + review_pending
        "done_today": [...],    # recently completed
    },
    "prs": [...],               # open PRs with review status
    "proposals": [...],         # human inbox items
    "messages": [...],          # pending messages from agents
    "agents": [...],            # agent status summary (name, role, status, current task, recent work, notes)
    "health": {
        "scheduler": "running",
        "idle_agents": 2,
        "queue_depth": 5,
    },
}

Each item should include enough detail to render a card (id, title, role, timestamps, PR number, agent assignment, turn count, commit count).

See project-management/drafts/dashboard-redesign.md for full design context.

Data sources to aggregate:
- DB queries via queue_utils (list_tasks for each queue)
- agents.yaml + state.json for agent status
- gh CLI for open PRs
- .orchestrator/shared/notes/ for agent notes
- .orchestrator/shared/queue/ for inbox items
- Agent log files for work log events

## Acceptance Criteria
- [ ] reports.py exists with get_project_report() returning the structured dict above
- [ ] All data sources are queried: DB tasks, agents, PRs, inbox, messages, notes
- [ ] Agent entries include: name, role, status, current_task, recent_tasks (last 5), notes
- [ ] Work items include: id, title, role, timestamps, pr_number, agent, turns, commits
- [ ] Function handles missing data gracefully (no PRs, no inbox, etc.)
- [ ] Tests cover the report structure and edge cases (empty queues, no agents)
- [ ] Existing scripts (status.py, whats_next.py) are NOT modified — this is a new module

CLAIMED_BY: orch-impl-1
CLAIMED_AT: 2026-02-07T10:39:57.721400

SUBMITTED_AT: 2026-02-07T10:48:11.774410
COMMITS_COUNT: 0
TURNS_USED: 200

ACCEPTED_AT: 2026-02-07T10:57:59.035584
ACCEPTED_BY: human
