# /agent-status - Show Agent State

Display the status of all configured agents.

## Instructions

Run the list agents script and display the output:

```bash
orchestrator/venv/bin/python .orchestrator/scripts/list_agents.py
```

Show the full output to the user. If they ask about a specific agent, explain the columns:

- **STATUS**: `idle` (waiting), `RUNNING` (active), `paused` (disabled in config)
- **LAST ACTIVE**: time since last heartbeat or run
- **TASK**: current task ID if running

## Related Commands

- `/queue-status` - Show task queue
- `/pause-agent` - Pause/resume an agent
- `/add-agent` - Add new agent
- `/orchestrator-status` - Full system overview
