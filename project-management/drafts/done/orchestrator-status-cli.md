# Draft: Orchestrator Status CLI Command

## Summary

Add an `orchestrator status` command that shows a unified view of system state - queue, agents, and current work - in one place.

## Problem

Currently understanding "what's happening" requires checking multiple places:
- `ls .orchestrator/shared/queue/*/` for task queues
- `cat .orchestrator/agents/*/state.json` for agent running state
- `cat .orchestrator/agents/*/status.json` for task progress
- `cat .orchestrator/agents/*/current_task.json` for task assignments
- Dashboard (if running) for visual view

This is tedious and error-prone. A single command would help.

## Proposed Solution

```bash
python orchestrator/orchestrator/status.py
# or
./orchestrator/scripts/status.sh
```

### Output Format

```
ORCHESTRATOR STATUS                           12:05:32

QUEUE
  Incoming: 2    Claimed: 1    Done: 15    Failed: 3

INCOMING
  [P1] TASK-fix-fillet-all-corners         L  implement
  [P2] TASK-improve-instructions           M  implement

CLAIMED
  [P1] TASK-safe-area-test                 S  implement  → impl-agent-2 (45%)

AGENTS
  impl-agent-1    idle        last run: 2m ago
  impl-agent-2    working     TASK-safe-area-test (45%) "Writing tests"
  review-agent    idle        last run: 5m ago
  architect       paused

RECENT ACTIVITY (last 10 min)
  11:58  impl-agent-2 claimed TASK-safe-area-test
  11:55  impl-agent-1 completed TASK-foo → PR #42
  11:52  TASK-bar moved to failed (timeout)
```

### Features

1. **Queue summary** - counts per queue
2. **Incoming tasks** - priority, complexity, role
3. **Claimed tasks** - which agent, progress %
4. **Agent status** - running/idle/paused, current task, last activity
5. **Recent activity** - last N events (from logs)

### Options

```bash
orchestrator status              # Default view
orchestrator status --json       # JSON output for scripting
orchestrator status --watch      # Refresh every 5s
orchestrator status --agents     # Just agents
orchestrator status --queue      # Just queue
```

## Implementation Notes

- Read from existing files (no new state storage needed)
- Could be Python (reuse existing utils) or bash script
- Should work without dashboard running
- Fast - no network calls, just file reads

## Questions

1. Python script or bash script?
2. Add as slash command too (`/status`)?
3. Include log tailing in `--watch` mode?

## Effort Estimate

Small - mostly reading existing files and formatting output.
