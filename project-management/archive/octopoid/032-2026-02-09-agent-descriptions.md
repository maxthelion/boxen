---
**Processed:** 2026-02-09
**Mode:** human-guided
**Actions taken:**
- Agent inventory table and per-agent file proposal folded into draft 031 (Holistic PM Review, section 9)
- Per-agent config files added to 031 next steps
- Description + invoked_by fields added to 031 next steps
**Outstanding items:** none — all content merged into 031
---

# Agent Descriptions for Dashboard

**Status:** Archived (merged into 031)
**Captured:** 2026-02-09

## Raw

> Give agents descriptions which can be used in the dashboard. Include things like its core goal. What it is invoked by. Also create a summary table/diagram of them.

## Idea

Each agent in `agents.yaml` currently has a name, role, and focus — but no human-readable description of what it actually does. The dashboard shows agent names and statuses but gives no context to help understand the system at a glance.

Add a `description` field (short sentence) and an `invoked_by` field to each agent definition. The dashboard can display these in tooltips, an "About" panel, or inline next to agent status.

## Current Agent Inventory

| Agent | Role | Focus | Goal | Invoked By |
|-------|------|-------|------|-----------|
| inbox-poller | proposer | inbox_triage | Reads files dropped in `agent-inbox/`, creates proposals | Pre-check: files exist in `agent-inbox/` |
| draft-processor | proposer | draft_processing | Archives stale drafts (>3 days), extracts proposed tasks, sends inbox summaries | Pre-check: drafts older than 3 days exist |
| curator | curator | — | Scores and promotes/defers proposals | Pre-check: active proposals exist (paused) |
| impl-agent-1 | implementer | — | Claims and implements app tasks (creates branches, writes code, opens PRs) | Pre-check: tasks in incoming/needs_continuation |
| impl-agent-2 | implementer | — | Second implementer for parallelism | Same as impl-agent-1 (paused) |
| orch-impl-1 | orchestrator_impl | — | Implements orchestrator/tooling tasks in the submodule, self-merges when tests pass | Pre-check: incoming tasks with role=orchestrator_impl |
| breakdown-agent | breakdown | — | Breaks down complex tasks into subtasks with dependencies | Pre-check: tasks in `breakdown/` queue |
| recycler | recycler | — | Detects burned-out tasks (0 commits, high turns) and recycles them for re-breakdown | Runs periodically (lightweight, 60s) |
| review-agent | reviewer | — | Reviews open PRs for code quality | Pre-check: open PRs exist (paused) |
| pr-coordinator | pr_coordinator | — | Coordinates PR lifecycle (merge, close, follow-up) | Pre-check: open PRs exist (paused) |
| gk-architecture | gatekeeper | architecture | Reviews task diffs for architectural quality | Dispatched by scheduler for pending architecture checks (paused) |
| gk-testing | gatekeeper | testing | Reviews task diffs for test coverage and quality | Dispatched by scheduler for pending testing checks (paused) |
| gk-qa | gatekeeper | qa | Visually QA-checks deployments using Playwright | Dispatched by scheduler for pending qa checks |
| backlog-groomer | proposer | backlog_grooming | Suggests task ordering and priority adjustments | Daily interval (paused) |
| test-checker | proposer | test_quality | Identifies gaps in test coverage | Daily interval (paused) |
| architect | proposer | code_structure | Reviews codebase architecture and suggests improvements | 5-minute interval (paused) |
| plan-reader | proposer | project_plans | Reads plan documents and suggests tasks to implement them | Daily interval (paused) |

## Agent Lifecycle Diagram

```
                    ┌─────────────┐
                    │   HUMAN     │
                    │  /enqueue   │
                    └──────┬──────┘
                           │
                           ▼
  ┌──────────┐      ┌─────────────┐      ┌──────────────┐
  │ inbox-   │─────▶│  incoming/  │◀─────│ breakdown-   │
  │ poller   │      │             │      │ agent        │
  └──────────┘      └──────┬──────┘      └──────▲───────┘
  ┌──────────┐             │                    │
  │ draft-   │             │              ┌─────┴──────┐
  │ processor│             │              │ breakdown/ │
  └──────────┘             │              └────────────┘
                           │ claim
                    ┌──────▼──────┐
                    │  impl-1/2   │──── orch-impl-1
                    │  (claimed)  │     (submodule work)
                    └──────┬──────┘
                           │ submit
                    ┌──────▼──────┐
                    │ provisional │
                    └──────┬──────┘
                           │ assign checks
                    ┌──────▼──────┐
                    │ gk-qa/arch/ │
                    │ gk-testing  │
                    └──────┬──────┘
                           │
                 ┌─────────┴─────────┐
                 │                   │
          pass ──▼──           fail──▼──
          │  human  │          │ reject │
          │  review │          │→ back  │
          └────┬────┘          │  to    │
               │               │incoming│
          ┌────▼────┐          └────────┘
          │  done/  │
          └─────────┘
                           ┌──────────┐
           (meanwhile)     │ recycler │ ← watches for burned-out tasks
                           └──────────┘
```

## Proposed Schema Change

Add to `agents.yaml`:

```yaml
agents:
- name: impl-agent-1
  role: implementer
  description: "Claims and implements app tasks — writes code, runs tests, opens PRs"
  invoked_by: "Pre-check: tasks exist in incoming/ or needs_continuation/"
  ...
```

The dashboard reads `description` and `invoked_by` from config and displays them alongside status.

## Open Questions

- Should descriptions be in `agents.yaml` or a separate reference file?
- Should the dashboard show the diagram, or just the table?
- Include invocation trigger details (pre_check commands) or keep it human-readable?

## Possible Next Steps

- Add `description` and `invoked_by` fields to all agents in `agents.yaml`
- Update dashboard to display descriptions (tooltip or inline)
- Add an "About" tab or help overlay showing the full agent table
