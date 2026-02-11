# Queue Health Scenarios Playbook

This playbook documents known queue health issues with proven remediation steps.

**Purpose:** When the queue manager agent encounters an issue, it should:
1. Look up the scenario in this playbook
2. Apply the documented fix
3. If the scenario is novel, investigate, document it here, and escalate

**Last Updated:** 2026-02-11

---

## Scenario 1: Orphan File (File Exists, Not in DB)

**Last Seen:** 2026-02-11 (initial documentation)

### Symptoms
- Task file `TASK-<id>.md` exists in a queue directory
- No database record exists for that task_id
- File's mtime is >5 minutes old (to avoid race conditions)

### Root Cause
- Task was created by direct file write without using `create_task()`
- Database record was deleted but file wasn't
- Migration or restoration went wrong

### Remediation Steps
1. Parse task file to extract metadata (title, role, priority, etc.)
2. Call `db.create_task()` to register it in the database
3. Log: `[orphan-fix] Registered {id} from {queue}/TASK-{id}.md (created {age} ago)`

### Edge Cases
- **If file can't be parsed:** Move to `.orchestrator/quarantine/` and escalate
- **If DB insert fails:** Escalate with error message

### Prevention
- Always use `create_task()` from `orchestrator.queue_utils`
- Never manually create task files
- Add validation to detect orphans early

### Code Reference
- `diagnose_queue_health.py::detect_orphan_files()`
- `diagnose_queue_health.py::fix_orphan_file()`

---

## Scenario 2: File-DB Queue Mismatch

**Last Seen:** 2026-02-11 (initial documentation)

### Symptoms
- Task exists in database with `queue='X'`
- Task file is in queue directory `Y` where Y ≠ X
- File's mtime is >5 minutes old

### Root Cause
- Task was moved between queues using file operations instead of proper functions
- Race condition between file move and DB update
- Script failure between file move and DB update

### Remediation Steps
1. Verify file actually exists in the queue directory
2. Call `db.update_task_queue(task_id, file_queue)` to sync DB to file location
3. Log: `[file-db-sync] Task {id}: DB said '{db_queue}', file in '{file_queue}' -> updated DB to '{file_queue}'`

### Edge Cases
- **If file doesn't exist:** Log escalation, don't modify DB
- **If both file and DB are wrong:** Escalate (needs human judgment)
- **Recent moves (<5 min):** Skip to avoid interfering with in-progress operations

### Prevention
- Always use proper functions (`transition_task_state()`, etc.)
- Never manually move task files
- Ensure atomic file-DB operations where possible

### Code Reference
- `diagnose_queue_health.py::detect_file_db_mismatches()`
- `diagnose_queue_health.py::fix_file_db_mismatch()`

---

## Scenario 3: Zombie Claim

**Last Seen:** 2026-02-11 (initial documentation)

### Symptoms
- Task has `queue='claimed'` and `claimed_by='agent-name'`
- Task's `claimed_at` timestamp is >2 hours ago
- Agent's `last_active` timestamp is >1 hour ago (or no state file exists)

### Root Cause
- Agent crashed or was killed without releasing claim
- Agent is stuck in long-running operation
- Agent's state file was deleted

### Remediation Steps
**⚠️ ESCALATE ONLY - DO NOT AUTO-FIX**

1. Log escalation: `[escalate] Task {id}: zombie claim (claimed {hours}h ago by {agent}, agent inactive {hours}h)`
2. Write detailed report to notes file
3. Wait for human review

**Why not auto-fix:**
- Agent might be doing long-running work (tests, builds)
- Releasing claim could cause duplicate work
- Killing agent could lose work in progress

**Human Actions (not agent):**
- Check if agent is actually running: `ps aux | grep <agent>`
- Review agent's recent commits/work
- Decide to: release claim, kill agent, or wait longer

### Edge Cases
- **Agent just became active:** Refresh state and recheck
- **Multiple zombie claims by same agent:** Likely agent failure, escalate all

### Prevention
- Implement agent heartbeat mechanism
- Add claim timeout with automatic release
- Improve agent crash recovery

### Code Reference
- `diagnose_queue_health.py::detect_zombie_claims()`
- `diagnose_queue_health.py::escalate_zombie_claims()`

---

## Scenario 4: Stale Error Message in Retried Task

**Last Seen:** 2026-02-11 (initial documentation)

### Symptoms
- Task has `attempt_count > 0` (has been retried)
- Task is in `incoming` or `claimed` queue (not in `failed`)
- Task file still contains `## FAILED_AT` section

### Root Cause
- Task was retried but the FAILED_AT section wasn't cleaned up
- Retry mechanism didn't call the cleanup function
- Manual retry without using proper tooling

### Remediation Steps
1. Verify task is actually retried (`attempt_count > 0`)
2. Verify task is not in `failed` queue
3. Remove the `## FAILED_AT` section from the file
4. Log: `[stale-error] Removed stale FAILED_AT from {id} (failed {date}, retried)`

### Edge Cases
- **Only remove FAILED_AT sections:** Preserve review feedback sections
- **Don't touch tasks in failed queue:** They're supposed to have FAILED_AT
- **Multiple FAILED_AT sections:** Should not happen, but remove all if found

### Prevention
- Always use `retry_failed()` function which includes cleanup
- Add automated cleanup to retry workflow
- Validate task state after retry

### Code Reference
- `diagnose_queue_health.py::detect_stale_errors()`
- `diagnose_queue_health.py::fix_stale_errors()`

---

## Template: Adding New Scenarios

When you encounter a novel scenario, document it using this template:

```markdown
## Scenario N: [Descriptive Name]

**Last Seen:** YYYY-MM-DD

### Symptoms
- Bullet list of observable symptoms
- Include specific conditions that identify this scenario
- Include timing/threshold information if relevant

### Root Cause
- Explain why this happens
- Include known triggering conditions
- Note if root cause is partially unknown

### Remediation Steps
[If auto-fixable:]
1. Step-by-step fix procedure
2. Include exact function calls
3. Include log message format

[If escalation needed:]
**⚠️ ESCALATE ONLY - DO NOT AUTO-FIX**
1. What to log
2. What information to gather
3. What human should review

### Edge Cases
- **Edge case 1:** How to handle
- **Edge case 2:** How to handle

### Prevention
- Changes that would prevent this scenario
- Validation that could catch it earlier
- Process improvements

### Code Reference
- Relevant function names and file paths
- Related diagnostic code
```

After documenting a new scenario:
1. Update this playbook file
2. Escalate to human for review
3. Update queue-manager.md if workflow changes needed
4. Add tests if new detection/remediation code was written

---

## Playbook Maintenance

**When to update:**
- New scenario discovered and validated
- Remediation steps change
- New edge cases identified
- Prevention measures implemented

**Review schedule:**
- Review after each novel scenario
- Quarterly review of all scenarios
- Update "Last Seen" dates to track frequency

**Testing:**
- Each scenario should have corresponding test cases
- Verify remediation steps actually work
- Test edge cases explicitly
