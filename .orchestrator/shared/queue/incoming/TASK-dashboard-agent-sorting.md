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

## Implementation

In `orchestrator/octopoid-dash.py`:

### 1. Sort agents by status

```python
def get_all_agents() -> list[AgentState]:
    agents = []
    # ... existing code to build agents list ...

    # Sort: RUNNING first, then IDLE, then PAUSED
    status_order = {'RUNNING': 0, 'IDLE': 1, 'PAUSED': 2}
    agents.sort(key=lambda a: status_order.get(a.status, 3))

    return agents
```

### 2. Brighter green for RUNNING status

Find where the status color is set (likely using Rich styling) and change RUNNING from the current green to a brighter variant:

```python
# Current (dim green)
status_style = "green" if status == "RUNNING" else ...

# Change to (bright green)
status_style = "bright_green" if status == "RUNNING" else ...
```

Or use Rich's color syntax:
```python
status_style = "bold green" if status == "RUNNING" else ...
status_style = "#00ff00" if status == "RUNNING" else ...  # alternative  # Bright green hex
```

## Acceptance Criteria

- [ ] RUNNING agents appear at the top of the agent list
- [ ] IDLE agents appear in the middle
- [ ] PAUSED agents appear at the bottom
- [ ] RUNNING status uses a brighter/more prominent green color
- [ ] Within each status group, agents can remain in original order

## Files to Modify

- `orchestrator/octopoid-dash.py` - `get_all_agents()` function and status styling
