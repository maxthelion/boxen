# [TASK-fix-stale-agent-states] Fix Stale Agent State Detection

ROLE: implement
PRIORITY: P2
BRANCH: main
CREATED: 2026-02-04T06:20:00Z
CREATED_BY: human

## Problem

When an agent process finishes, its state file (`state.json`) shows `"running": true` until the next scheduler tick runs `check_and_update_finished_agents()`. If no scheduler tick runs, the dashboard shows agents as RUNNING when they've actually finished.

This causes confusion when viewing the dashboard - agents appear stuck when they're actually idle.

## Current Behavior

1. Agent finishes, writes exit code to file
2. State file still shows `running: true`
3. Dashboard reads state file, shows RUNNING
4. Only when scheduler runs does it detect the dead process and update state

## Proposed Solutions

### Option A: Dashboard checks process liveness

Update `octopoid-dash.py` to verify PID is actually running:

```python
def get_all_agents() -> list[AgentState]:
    for config in load_agents_config():
        state = load_agent_state(name) or {}

        # Verify process is actually running
        running = state.get("running", False)
        pid = state.get("pid")
        if running and pid:
            running = is_process_running(pid)

        agents.append(AgentState(
            ...
            running=running,
            ...
        ))
```

### Option B: Scheduler updates states more frequently

Run `check_and_update_finished_agents()` independently of the main scheduler tick, perhaps via a separate lightweight process or more frequent polling.

### Option C: Agent updates own state on exit

Have the agent role's `run()` method update its state file to `running: false` before exiting. Currently the agent writes an exit code file but doesn't update state.json.

**Recommended: Option A + C combined**
- Dashboard verifies liveness (immediate fix for display)
- Agent updates own state on exit (proper fix at source)

## Implementation

### For Option A (dashboard fix):

In `octopoid-dash.py`, add:

```python
def is_process_running(pid: int) -> bool:
    """Check if a process is running."""
    try:
        os.kill(pid, 0)
        return True
    except (OSError, ProcessLookupError):
        return False
```

And use it in `get_all_agents()`.

### For Option C (agent fix):

In `orchestrator/orchestrator/roles/base.py`, update the base role to set `running: false` in a `finally` block or `atexit` handler.

## Acceptance Criteria

- [ ] Dashboard shows correct RUNNING/IDLE status for agents
- [ ] Dead processes show as IDLE immediately, not on next scheduler tick
- [ ] No race conditions between agent exit and state update

## Files to Modify

- `orchestrator/octopoid-dash.py` - add process liveness check
- `orchestrator/orchestrator/roles/base.py` - update state on exit
- `orchestrator/orchestrator/state_utils.py` - helper functions if needed
