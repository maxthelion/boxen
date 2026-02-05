# [TASK-dashboard-agent-sorting] Improve Dashboard Agent View Sorting and Colors

ROLE: implement
PRIORITY: P3
BRANCH: main
CREATED: 2026-02-04T06:25:00Z
CREATED_BY: human

## Problem

The dashboard agent list is displayed in YAML file order, which mixes RUNNING and PAUSED agents together. This makes it hard to quickly see which agents are active.

## Current Behavior

Agents displayed in order from agents.yaml:
```
inbox-poller    IDLE
curator         PAUSED
impl-agent-1    IDLE
backlog-groomer PAUSED
test-checker    PAUSED
architect       RUNNING
plan-reader     PAUSED
impl-agent-2    RUNNING
review-agent    RUNNING
```

## Desired Behavior

1. **Sort agents by status**: RUNNING at top, then IDLE, then PAUSED at bottom
2. **Brighter green for RUNNING**: Make active agents more visually prominent

## Acceptance Criteria

- [x] RUNNING agents appear at the top of the agent list
- [x] IDLE agents appear in the middle
- [x] PAUSED agents appear at the bottom
- [x] RUNNING status uses a brighter/more prominent green color
- [x] Within each status group, agents can remain in original order

## Completion Notes

**STATUS: COMPLETE**
**COMPLETED_AT: 2026-02-04T20:38:00Z**
**COMPLETED_BY: impl-agent-1**

### Implementation Details

The feature was already implemented in the `orchestrator` submodule:

1. **Sorting** (lines 120-128, 159, 401):
   - `get_agent_status_key()` returns: RUNNING=0, IDLE=1, PAUSED=2
   - Both `get_all_agents()` and `get_demo_agents()` sort by this key

2. **BOLD for RUNNING** (lines 624-627):
   - `curses.A_BOLD` attribute is added when `agent.running` is True
   - Combined with `curses.COLOR_GREEN` provides maximum terminal brightness

### Why No PR

The changes were already present in the orchestrator submodule (a separate repository). No code changes were needed in the boxen repository itself.
