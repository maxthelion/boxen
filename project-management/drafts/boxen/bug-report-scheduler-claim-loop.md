# Bug Report: Scheduler Claim Loop — Tasks Repeatedly Claimed, Agents Produce Nothing

**Date:** 2026-02-25
**Scope:** boxen scheduler + server claim coordination
**Severity:** High — tasks stuck in claim/fail cycle, blocking all lower-priority work

## Symptoms

1. **Tasks claimed repeatedly without progress.** TASK-1a7ef1c2 was claimed 3 times (14:10, 15:35, 15:50). Each time the agent burned through 150+ tool calls without making a single commit or writing result.json. The lease expired, the scheduler marked it failed, then immediately reclaimed it on the next tick.

2. **Server shows 0 claimed while agents are running.** The `tasks.list(queue='claimed')` API returns 0 even when a `claude -p` process is actively running. The server's `lease_expires_at` goes to `None` after a short period, even though the agent process is alive and working.

3. **P1 tasks block P2 tasks indefinitely.** Because `max_instances: 1` and the scheduler always picks highest priority first, the failing P1 task (1a7ef1c2) is reclaimed on every tick, preventing 3 unblocked P2 tasks from ever being picked up.

4. **Orphan agent processes.** When the server marks a task as failed (lease expired), the agent process (claude -p) keeps running. PID 90300 ran for 85+ minutes with 341 tool calls after its task was already failed on the server. No mechanism kills the orphan.

5. **TASK-65dbf123 has result.json `outcome: done` but is in failed queue.** The task completed successfully in a previous orchestrator version (old `.orchestrator/` layout) and wrote result.json. But the new scheduler re-claimed it 3 times because it doesn't check for existing results before claiming.

## Root Causes

### 0. PRIMARY: Stale PIDs in running_pids.json block pool capacity

**This is the main blocker.** `check_and_update_finished_agents` in the scheduler doesn't clean up PIDs for agents whose tasks are already in a terminal state (done/failed). When the handler sees `outcome=done but queue=done`, it returns `False` ("nothing to do"), and the scheduler interprets `False` as "keep PID for retry". The PID stays in `running_pids.json` forever.

```json
// .octopoid/runtime/agents/implementer/running_pids.json
// 3 dead PIDs (tasks already done) + 1 alive PID = 4 entries
// max_instances=1, pool thinks 4 are running → BLOCKED
{
  "65970": {"task_id": "e663c1de", ...},  // DEAD, task=done
  "57255": {"task_id": "71882470", ...},  // DEAD, task=done
  "70169": {"task_id": "ddbcbda1", ...},  // DEAD, task=done
  "98320": {"task_id": "1a7ef1c2", ...}   // ALIVE
}
```

Guard log every tick:
```
Agent implementer: BLOCKED by guard_pool_capacity: at_capacity (1/1)
```

**Fix:** When `check_and_update_finished_agents` finds a dead PID whose task is already in a terminal state, it must remove the PID from `running_pids.json` regardless of the handler's return value. The process IS dead — keeping it "for retry" serves no purpose.

### 1. No backoff on failed tasks

When a task fails (lease expires, agent produces nothing), the scheduler resets it to `incoming` and immediately reclaims it on the next tick. There is no:
- Attempt counter check ("stop after N attempts")
- Cooldown period ("wait 30min before retrying")
- Demotion ("after 2 failures, lower priority to P3")

The task log shows the pattern:
```
[2026-02-25T14:10:53] CLAIMED attempt=0
[2026-02-25T15:35:31] CLAIMED attempt=1
[2026-02-25T15:50:xx] CLAIMED attempt=2
```

### 2. Lease expiry doesn't kill the agent process

The scheduler spawns `claude -p` as a subprocess but doesn't track or kill it when the lease expires. The lease mechanism is server-side only — the local process has no awareness of the lease.

### 3. Server claim state is ephemeral

`tasks.list(queue='claimed')` returns 0 even during active work. The `lease_expires_at` field goes to `None`. This may be a server-side issue where the lease cleanup job moves tasks out of claimed before the agent finishes. Or the scheduler's `--once` mode doesn't persist the claim correctly.

### 4. No check for existing results before reclaiming

The scheduler creates a new worktree and prompt for each claim attempt. If a previous attempt left `result.json` with `outcome: done`, the scheduler ignores it and starts fresh. This caused 65dbf123 to be reclaimed 3 times despite having completed work.

### 5. Priority starvation

With `max_instances: 1`, a repeatedly-failing P1 task prevents all P2 tasks from being claimed. The scheduler always picks the highest-priority available task, so the P1 task wins every tick, fails, and wins again.

## Evidence

```
# Task log for 1a7ef1c2 — 3 claims, 0 completions
[2026-02-25T14:09:57] CREATED
[2026-02-25T14:10:53] CLAIMED attempt=0
[2026-02-25T15:35:31] CLAIMED attempt=1
# Third claim at ~15:50 (from ps output)

# Tool counter: 341 tool uses, 0 commits, no result.json
wc -c tool_counter → 341

# Server state while agent running:
queue: failed  (not claimed!)
lease_expires_at: None

# Orphan process still alive after task failed:
PID 90300  Ss  elapsed=11:23  RSS=200MB

# 65dbf123 result.json exists from old run:
{"outcome": "done", "notes": "Implemented edge path crossing validation..."}
# But task is in failed queue, re-claimed 3 times
```

## Proposed Fixes

### 1. Attempt limit with backoff
After N failed attempts (e.g. 3), move the task to a `stuck` queue or demote priority. Don't keep reclaiming indefinitely. The `attempt_count` field already exists on tasks.

### 2. Kill agent on lease expiry
The scheduler should track spawned PIDs and send SIGTERM when the lease expires (or when the task is moved to failed). Alternatively, pass a timeout flag to `claude -p` so it self-terminates.

### 3. Check for existing result before claiming
Before creating a new worktree/prompt, check if `result.json` already exists in the task runtime directory. If outcome is `done`, submit the completion instead of reclaiming.

### 4. Priority fairness / starvation prevention
After a task fails N times, temporarily skip it and try the next available task. Or implement round-robin within a priority level.

### 5. Persist claim state on server
Investigate why `tasks.list(queue='claimed')` returns 0 during active work. The server should show the task as claimed for the full lease duration.

## Impact

- 3 colour-wiring tasks (P2) have been in incoming for 2+ hours, unblocked but never claimed
- 1a7ef1c2 (corner overlap) has consumed 3 agent sessions × 150 tool calls = 450+ API calls with zero output
- 65dbf123 (path crossing) has been re-run 3 times despite having a valid result
- Manual intervention required to kill orphans and manage queue

## Related

- `project-management/postmortems/2026-02-25-interaction-manager-push-pull.md` — earlier postmortem about agents producing passing tests without fixing bugs (similar "agent burns turns without progress" pattern)
- Existing `attempt_count` and `BURNED_OUT_TURN_THRESHOLD` in queue_utils — recycling system exists but may not be wired into the v2 scheduler
