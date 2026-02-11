# Queue Management Agent

**Status:** In Progress
**Captured:** 2026-02-09
**Category:** Octopoid

## Raw

> an agent for managing the queue system. is invoked by scheduler if common failure patterns exist, or there is esccalation. tries to resolve the issue and highlights problems. Rationale, it's very annoying to be babysitting this

## Idea

Create a dedicated agent role that monitors the queue system for common failure patterns and automatically resolves them when possible. Invoked by the scheduler when it detects issues like:

- File-vs-DB sync mismatches (files in one queue, DB says another)
- Stale error messages on retried tasks
- Tasks stuck in claimed state with no active agent
- Orphan files (on disk but not in DB)
- Tasks with missing or corrupted data

The agent would act as an automated "operator" that handles routine maintenance tasks that currently require human intervention.

## Context

The orchestrator has developed several recurring failure patterns that require manual intervention:

1. **File-vs-DB sync**: Files move between queue directories but the DB queue column doesn't update, causing tasks to appear stuck
2. **Stale errors on retry**: `retry_task()` doesn't clear old error messages, confusing agents when they re-claim
3. **Zombie claims**: Tasks show as "claimed" in DB but no agent is actually working on them
4. **Orphan files**: Task files created manually or left behind by crashes, exist on disk but not in DB

Each of these has happened multiple times today (2026-02-09) and required manual SQL updates or file edits to resolve.

## Benefits

- **Reduces human babysitting**: Operator doesn't need to constantly check `/orchestrator-status` and manually fix stuck tasks
- **Faster recovery**: Issues detected and resolved within one scheduler tick instead of waiting for human notice
- **Prevents cascading failures**: File-vs-DB sync issues can block entire queues if not caught early
- **Learning opportunity**: Agent notes document what patterns it detected and how it resolved them, building institutional knowledge

## Agent Design

### Trigger Conditions

Scheduler invokes queue-manager agent when:

1. **Scheduled health check**: Every N minutes (e.g., every 30 minutes)
2. **File-DB mismatch detected**: During queue scan, file location doesn't match DB queue column
3. **Task escalation**: Task moves to escalated queue (3+ rejections, burnout, etc.)
4. **Orphan file detected**: File exists in queue directory but not in DB
5. **Zombie claim detected**: Task claimed for >2 hours with no agent activity

### Agent Capabilities

The agent can:

1. **Diagnose**: Scan all queues, compare file locations to DB state, check for orphans, detect stale claims
2. **Sync file-DB state**: Update DB queue column to match actual file location (using proper side effects)
3. **Clean stale errors**: Remove FAILED_AT sections from retried tasks
4. **Register orphans**: Add orphan files to DB or move to a quarantine directory
5. **Release zombie claims**: Clear claimed_by/claimed_at for stale claims
6. **Escalate unsolvable issues**: Write summary to human inbox when it can't fix automatically

### Agent Output

For each invocation, agent writes:

- **Notes file**: What it found, what it fixed, what it escalated
- **Human inbox message** (if needed): Issues that require human decision
- **Metrics**: Count of issues fixed, by type

## Open Questions

1. **How aggressive should auto-fix be?** Should it fix everything it can, or ask permission for risky fixes?
2. **What counts as a "zombie claim"?** 2 hours? 4 hours? Different threshold for different roles?
3. **Should it handle task creation bugs?** E.g., tasks with invalid role, missing required fields
4. **Integration with existing retry/reset commands?** Should it use the same functions, or have its own?
5. **Monitoring/alerting?** Should repeated failures of the same type trigger an alert to the human?

## Possible Next Steps

### Phase 1: Read-Only Diagnostics
- Create queue-manager role with diagnostic-only prompt
- Agent scans queues, compares to DB, writes report to notes
- No fixes, just detection and reporting
- Validates that detection logic catches real issues

### Phase 2: Safe Auto-Fixes
- Add file-DB sync fix (update_task_queue or direct SQL)
- Add stale error cleanup (sed to remove FAILED_AT sections)
- Add orphan file registration
- Still escalates anything risky (zombie claims, corrupted data)

### Phase 3: Aggressive Auto-Fixes
- Release zombie claims after threshold exceeded
- Handle task creation bugs (fix malformed task files)
- Retry tasks that failed with transient errors (DB schema issues, network timeouts)

### Phase 4: Learning & Prevention
- Track patterns: which failure types are most common?
- Suggest code fixes: "File-DB sync happens in X places, should we add a guard?"
- Update agent prompts to avoid triggering known failure modes

## Related Work

- TASK-fad87bf8 adds file-DB sync fix to `check_and_update_finished_agents()` - queue-manager could invoke this proactively
- Postmortem 2026-02-09-schema-migration-never-ran documents a failure that queue-manager could have detected (tasks failing with same error repeatedly)
- `/retry-failed` command is manual version of one queue-manager capability

## Example Scenario

**Before queue-manager:**
1. Task file moves to needs_continuation/ but DB says claimed
2. Human notices 35 minutes later via dashboard ("why is this in-progress?")
3. Human runs SQL: `UPDATE tasks SET queue='needs_continuation'`
4. Task now visible to scheduler

**With queue-manager:**
1. Task file moves to needs_continuation/ but DB says claimed
2. Scheduler detects mismatch 30 seconds later (next tick)
3. Invokes queue-manager agent
4. Agent diagnoses: "File in needs_continuation/, DB says claimed, agent finished 1 minute ago"
5. Agent fixes: Updates DB queue to match file location
6. Agent writes notes: "Fixed file-DB sync for TASK-abc123"
7. Task now visible to scheduler in <1 minute

## Success Criteria

If this works, we should see:

- Zero manual SQL updates for file-DB sync issues
- Zero manual sed commands for stale error cleanup
- Orphan files detected and handled within minutes, not days
- Human can ignore `/orchestrator-status` for longer periods without things getting stuck
- Queue-manager notes provide diagnostic history when debugging new issues

## Risk: Agent Makes Things Worse

If queue-manager is too aggressive or has bugs, it could:

- Create more file-DB mismatches instead of fixing them
- Delete important error messages
- Break tasks that were actually working correctly
- Thrash the queue (move tasks back and forth)

**Mitigation:**
- Start with read-only diagnostics phase (no fixes, just reports)
- Add comprehensive logging to notes file
- Gate each auto-fix behind a confidence check
- Human can pause queue-manager role if it misbehaves
- Rollback mechanism: queue-manager keeps backup of what it changes
