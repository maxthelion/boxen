# /kill-agent - Kill and Clean Up Agent

Kill a specific agent and clean up its state.

## Usage

```
/kill-agent <agent-name>
```

## Examples

```
/kill-agent impl-agent-1
/kill-agent impl-agent-2
/kill-agent review-agent
```

## What It Does

1. Kills the Claude process for the agent
2. Removes task marker (`current_task.json`)
3. Removes the worktree
4. Resets `state.json` (running=false, pid=null)
5. Removes `status.json`

## Script

Run:
```bash
./orchestrator/scripts/kill-agent.sh $ARGUMENTS
```

## When to Use

- Agent is stuck in a crash loop
- Agent is working on wrong task
- Need to manually intervene on a task
- Debugging agent issues

## After Killing

The agent's claimed task remains in `claimed/` queue. You may want to:
- Move it back to `incoming/` for retry
- Move it to `failed/` if it's problematic
- Decompose it into smaller tasks

## Related Commands

- `/kill-all-agents` - Kill all agents at once
- `/pause-agent` - Pause without killing (gentler)
- `/agent-status` - Check agent states
