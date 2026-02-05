# /kill-all-agents - Kill All Agents

Kill all agents and clean up the system.

## Usage

```
/kill-all-agents
```

## What It Does

1. Kills all Claude agent processes
2. For each agent:
   - Removes task marker
   - Removes worktree
   - Resets state.json
   - Removes status.json
3. Prunes git worktrees
4. **Moves all claimed tasks back to incoming queue**

## Script

Run:
```bash
./orchestrator/scripts/kill-all-agents.sh
```

## When to Use

- System is in bad state
- Multiple agents stuck
- Need clean slate
- Before maintenance/updates
- Debugging orchestrator issues

## After Running

- All agents are stopped
- Previously claimed tasks are back in `incoming/`
- Agents will restart on next scheduler tick (unless system is paused)

## To Prevent Restart

Pause the system first:
```
/pause-system
/kill-all-agents
```

## Related Commands

- `/kill-agent <name>` - Kill specific agent
- `/pause-system` - Pause scheduler
- `/agent-status` - Check agent states
