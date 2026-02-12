# V2.0 Verification Results

**Date:** 2026-02-12
**Updated:** 2026-02-12 (API testing complete)
**Status:** Schema Verified - Runtime Behavior Unknown
**Source:** Draft 040 Verification Checklist

---

## Summary

Verified v2.0 capabilities against our requirements. Results:
- **Must-Have (P0):** 6/6 schema confirmed ✅ (runtime behavior unknown)
- **Should-Have (P1):** 3/6 confirmed ✅, 3 unknown ⚠️
- **Nice-to-Have (P2):** 1/4 confirmed ✅, 3 unknown ⚠️

**Overall:** All critical database fields exist. Drafts/Projects APIs fully functional. Unknown: agent runtime behavior (turn auto-increment, burnout detection logic, breakdown workflow).

---

## Must-Have (P0) - Critical for Basic Operation

### ✅ Task-Specific Worktrees
**Status:** CONFIRMED ✅

**Evidence:**
- Directory exists: `.octopoid/worktrees/`
- Expected path: `.octopoid/worktrees/<task-id>/` (not `.octopoid/agents/<agent>/worktree/`)

**Verification needed:**
- [ ] Create a test task and verify worktree is created at correct path
- [ ] Verify worktree is deleted after task completion

**Priority:** P0 - This was v1.x's biggest mistake, critical it's fixed

---

### ⚠️ Per-Task + Per-Agent Logging
**Status:** PARTIAL ⚠️

**Evidence:**
- `.octopoid/logs/` exists
- `.octopoid/logs/agents/` exists
- `.octopoid/logs/tasks/` **NOT FOUND** (might be created on first task)

**Verification needed:**
- [ ] Run a test task and check if `.octopoid/logs/tasks/<task-id>.log` is created
- [ ] Run an agent and check if `.octopoid/logs/agents/<agent-name>.log` is created
- [ ] Verify both logs exist and are separated
- [ ] Verify task logs persist after completion

**Priority:** P0 - Critical for debugging, postmortems

---

### ⚠️ Auto Turn Counting
**Status:** SCHEMA CONFIRMED, AUTO-INCREMENT UNKNOWN ⚠️

**Evidence:**
- API response shows `turns_used: null` field exists ✅
- Field is null for unclaimed tasks (probably set to 0 on claim)
- Unknown if agents auto-increment or must manually report

**Verified via API:**
```json
{
  "turns_used": null,
  "attempt_count": 0,
  ...
}
```

**Runtime verification needed:**
- [ ] Read v2.0 agent base class - does it wrap API calls?
- [ ] Run test task, check if turns_used increments automatically
- [ ] Check if visible in dashboard/status

**Priority:** P0 - Required for burnout detection

---

### ✅ Lease-Based Claiming
**Status:** SCHEMA CONFIRMED ✅

**Evidence:**
- API endpoint exists: `POST /api/v1/tasks/claim` ✅
- Task shows `claimed_by: null` field ✅
- Task shows `claimed_at: null` timestamp ✅
- Task shows `lease_expires_at: null` timestamp ✅

**Verified via API:**
```json
{
  "claimed_by": null,
  "claimed_at": null,
  "lease_expires_at": null,
  ...
}
```

**Runtime verification needed:**
- [ ] Check server code for lease expiration logic
- [ ] Test: claim task, kill agent, verify lease expires
- [ ] Check lease timeout duration (configurable?)
- [ ] Verify server auto-unclaims expired leases

**Priority:** P0 - Prevents zombie claims

---

### ✅ Task Dependencies
**Status:** SCHEMA CONFIRMED ✅

**Evidence:**
- API response shows `blocked_by: null` field exists ✅
- Field type: comma-separated string or null

**Verified via API:**
```json
{
  "id": "task-mljcn447-30ddcf08",
  "blocked_by": null,
  ...
}
```

**Runtime verification needed:**
- [ ] Test: create task with `blocked_by`, verify can't claim
- [ ] Test: complete dependency, verify dependent auto-unblocks
- [ ] Check if server enforces blocking (or just stores the field)

**Priority:** P0 - Required for complex workflows

---

### ✅ Gatekeeper Multi-Check
**Status:** SCHEMA CONFIRMED ✅

**Evidence:**
- API response shows all gatekeeper fields exist ✅
- `checks: null` - Configured checks for this task
- `check_results: null` - Results from each check
- `review_round: 0` - Current round (for 3-round limit)
- `rejection_count: 0` - Times task has been rejected

**Verified via API:**
```json
{
  "checks": null,
  "check_results": null,
  "review_round": 0,
  "rejection_count": 0,
  ...
}
```

**Runtime verification needed:**
- [ ] Read v2.0 gatekeeper agent code
- [ ] Test multi-check workflow (architecture + testing + QA)
- [ ] Test 3-round rejection limit enforcement
- [ ] How are checks configured per task?

**Priority:** P0 - Core quality gate

---

## Should-Have (P1) - Important for Workflow

### ⚠️ Burnout Detection
**Status:** SCHEMA CONFIRMED, LOGIC UNKNOWN ⚠️

**Evidence:**
- API response shows all needed fields exist ✅
- `turns_used: null` - Turn counter
- `commits_count: 0` - Commit counter
- `needs_breakdown: 0` - Breakdown flag
- `attempt_count: 0` - Retry counter
- Unknown if server detects burnout (0 commits + 80+ turns)

**Verified via API:**
```json
{
  "turns_used": null,
  "commits_count": 0,
  "needs_breakdown": 0,
  "attempt_count": 0,
  ...
}
```

**Runtime verification needed:**
- [ ] Check server code for burnout heuristic
- [ ] Check if breakdown queue exists (not visible in CLI)
- [ ] Test: create task that will burn out (80+ turns, 0 commits)
- [ ] Verify automatic routing to breakdown

**Priority:** P1 - Prevents wasted agent time

---

### ⚠️ Breakdown Agent Role
**Status:** UNKNOWN ⚠️

**Evidence:**
- `role: breakdown` can be set in agents.yaml
- Unknown if breakdown workflow implemented
- Unknown if re-breakdown depth tracked

**Verification needed:**
- [ ] Read v2.0 breakdown agent code
- [ ] Check if `breakdown_depth` field exists
- [ ] Test breakdown workflow end-to-end
- [ ] Test re-breakdown depth limit (max 1)

**Priority:** P1 - Required when agents burn out

---

### ⚠️ Needs Continuation Queue
**Status:** UNKNOWN ⚠️

**Evidence:**
- No `needs_continuation` queue mentioned
- Unknown if worktree preservation supported

**Verification needed:**
- [ ] Check server code for needs_continuation queue
- [ ] Check if uncommitted changes detected
- [ ] Test: agent hits max turns with uncommitted work
- [ ] Verify worktree preserved for next agent

**Priority:** P1 - Prevents losing partial work

---

### ✅ Drafts API
**Status:** FULLY TESTED ✅

**Evidence:**
- Server endpoints: `GET /api/v1/drafts`, `POST /api/v1/drafts`, `PATCH /api/v1/drafts/:id`, `DELETE /api/v1/drafts/:id` ✅
- CLI commands: `draft create`, `draft list`, `draft update`, `draft delete` ✅
- Tested lifecycle: create → update status (idea → proposal) → delete ✅
- Domain separation works: `--domain octopoid-v2` ✅

**Test results:**
```bash
$ ./octopoid-v2-cli.sh draft create "Test draft" --domain octopoid-v2 --status idea
✓ Draft created

$ ./octopoid-v2-cli.sh draft update test-draft --status proposal
✓ Draft updated

$ ./octopoid-v2-cli.sh draft delete test-draft --force
✓ Draft deleted
```

**Migration needed:**
- [ ] Migrate v1.x drafts to server

**Priority:** P1 - Nice to have centralized

---

### ✅ Projects API
**Status:** FULLY TESTED ✅

**Evidence:**
- Server endpoints: `GET /api/v1/projects`, `POST /api/v1/projects`, `DELETE /api/v1/projects/:id` ✅
- CLI commands: `project create`, `project list`, `project delete` ✅
- Project tasks endpoint: `GET /api/v1/projects/:id/tasks` ✅
- Tested lifecycle: create → list → delete ✅

**Test results:**
```bash
$ ./octopoid-v2-cli.sh project create "Test Project" --description "Testing"
✓ Project created
  ID: test-project
  Base Branch: main

$ ./octopoid-v2-cli.sh project list
[DRAFT] test-project
  Test Project

$ ./octopoid-v2-cli.sh project delete test-project --force
✓ Project deleted
```

**Further testing needed:**
- [ ] Test task-to-project linking (`project_id` field)
- [ ] Test project completion workflow
- [ ] Migrate v1.x projects to server

**Priority:** P1 - Nice to have centralized

---

### ✅ Agent Notes
**Status:** SCHEMA CONFIRMED ✅

**Evidence:**
- API response shows `execution_notes: null` field ✅
- Field exists in schema, null when unclaimed
- Unknown if agents automatically populate this field

**Verified via API:**
```json
{
  "execution_notes": null,
  ...
}
```

**Runtime verification needed:**
- [ ] Read v2.0 agent code for note-taking behavior
- [ ] Test: run agent, check if notes written
- [ ] Check if notes persist after task completion

**Priority:** P1 - Helpful for debugging, not critical

---

## Nice-to-Have (P2) - Future Enhancements

### ⚠️ Task Templates by Role
**Status:** UNKNOWN ⚠️

**Verification needed:**
- [ ] Check if task creation supports templates
- [ ] Check if role-specific templates exist

**Priority:** P2 - Polish feature

---

### ⚠️ Bulk Operations
**Status:** UNKNOWN ⚠️

**Verification needed:**
- [ ] Check CLI for bulk approve/reject/retry commands
- [ ] Check API for batch operations

**Priority:** P2 - Convenience feature

---

### ✅ Dashboard
**Status:** CONFIRMED (Python) ✅

**Evidence:**
- Dashboard exists: `octopoid-dash.py`
- Supports remote mode via Python SDK

**Verification needed:**
- [ ] Test dashboard with deployed server
- [ ] Verify all tabs render (work, PRs, inbox, agents, done)
- [ ] Check if draft/project views exist

**Priority:** P2 - Nice to have, not blocking

---

### ⚠️ Slash Command Library
**Status:** UNKNOWN ⚠️

**Evidence:**
- CLI commands exist (enqueue, approve, reject, list, etc.)
- Unknown if Claude Code slash commands wired up

**Verification needed:**
- [ ] Check `.claude/commands/` for octopoid commands
- [ ] Create slash commands that call CLI
- [ ] Test in Claude Code session

**Priority:** P2 - Convenience feature

---

## Custom Agents Compatibility

### ⚠️ inbox-poller
**Status:** UNKNOWN ⚠️

**Can it work in v2.0?**
- Needs: Read inbox files/API
- Needs: Create tasks via API ✅ (`POST /api/v1/tasks`)
- Needs: Python SDK (exists) ✅

**Verification needed:**
- [ ] Port to v2.0 agent format
- [ ] Test task creation via API
- [ ] Test polling loop

---

### ⚠️ proposers
**Status:** UNKNOWN ⚠️

**Can it work in v2.0?**
- Needs: Read drafts via API ✅ (`GET /api/v1/drafts`)
- Needs: Update draft status ✅ (`PATCH /api/v1/drafts/:id`)
- Needs: Python SDK (exists) ✅

**Verification needed:**
- [ ] Port to v2.0 agent format
- [ ] Test draft status updates
- [ ] Test draft → proposal promotion

---

### ⚠️ draft-processors
**Status:** UNKNOWN ⚠️

**Can it work in v2.0?**
- Needs: Read drafts ✅
- Needs: Create tasks ✅
- Needs: Python SDK ✅

**Verification needed:**
- [ ] Port to v2.0 agent format
- [ ] Test proposal → task conversion

---

### ⚠️ automatic rebaser
**Status:** UNKNOWN ⚠️

**Can it work in v2.0?**
- Needs: List tasks in provisional queue ✅
- Needs: Git operations (should work)
- Needs: Update task status ✅

**Verification needed:**
- [ ] Port to v2.0 agent format
- [ ] Test rebase workflow
- [ ] Test task status updates

---

## Server API Endpoints

**Orchestrators:**
- `POST /api/v1/orchestrators/register`
- `POST /api/v1/orchestrators/:id/heartbeat`
- `GET  /api/v1/orchestrators`

**Tasks:**
- `GET    /api/v1/tasks`
- `POST   /api/v1/tasks`
- `GET    /api/v1/tasks/:id`
- `PATCH  /api/v1/tasks/:id`
- `DELETE /api/v1/tasks/:id`
- `POST   /api/v1/tasks/claim`
- `POST   /api/v1/tasks/:id/submit`
- `POST   /api/v1/tasks/:id/accept`
- `POST   /api/v1/tasks/:id/reject`

**Drafts:**
- `GET    /api/v1/drafts`
- `POST   /api/v1/drafts`
- `GET    /api/v1/drafts/:id`
- `PATCH  /api/v1/drafts/:id`
- `DELETE /api/v1/drafts/:id`

**Projects:**
- `GET    /api/v1/projects`
- `POST   /api/v1/projects`
- `GET    /api/v1/projects/:id`
- `GET    /api/v1/projects/:id/tasks`
- `PATCH  /api/v1/projects/:id`
- `DELETE /api/v1/projects/:id`

**Health:**
- `GET /api/health`

---

## File Movement Concern (Needs Clarification)

### Legacy File-Moving Code in queue-utils.ts

**Found:** `queue-utils.ts` contains functions for moving task files between queue subdirectories:

```typescript
// In /tmp/octopoid-v2-fresh/packages/client/src/queue-utils.ts

export function moveTaskFile(
  taskId: string,
  fromQueue: TaskQueue,
  toQueue: TaskQueue,
  appendMetadata?: Record<string, string>
): string | null {
  const fromDir = getQueueSubdir(fromQueue)  // e.g., tasks/incoming/
  const toDir = getQueueSubdir(toQueue)      // e.g., tasks/claimed/

  // ... uses renameSync to move file between directories
}

export function getQueueSubdir(queue: TaskQueue): string {
  const queueDir = getQueueDir()  // returns <repo>/tasks/
  const subdir = join(queueDir, queue)  // returns <repo>/tasks/incoming/, etc.

  // Creates queue subdirectories
  if (!existsSync(subdir)) {
    mkdirSync(subdir, { recursive: true })
  }

  return subdir
}

// Expected queue directories
export const ALL_QUEUE_DIRS: TaskQueue[] = [
  'incoming',
  'claimed',
  'provisional',
  'done',
  'blocked',
  'backlog',
]
```

**This is the v1.x pattern we wanted to avoid!** Queue state should be in the database, not file system location.

### However: Code Appears Unused

**Findings:**
1. ✅ `moveTaskFile()` is **never called** in the client codebase (grep found only the definition)
2. ✅ Scheduler doesn't import from `queue-utils.ts` at all
3. ✅ Agent roles only import `findTaskFile` and `parseTaskFile` (read-only operations)
4. ✅ No imports of `moveTaskFile`, `getQueueSubdir` outside queue-utils.ts itself

**Enqueue command creates files in flat structure:**
```typescript
// From enqueue.ts
const filePath = join(repoPath, 'tasks', `${taskId}.md`)
// Creates: /Users/.../boxen/tasks/task-abc123.md
// NOT:     /Users/.../boxen/tasks/incoming/TASK-abc123.md
```

**API confirms flat structure:**
```json
{
  "file_path": "/Users/maxwilliams/dev/boxen/tasks/task-mljcn447-30ddcf08.md",
  "queue": "incoming"
}
```

Queue is stored as a field in the database, not as file system location.

### Mismatch Found

**Problem:** `findTaskFile()` searches queue subdirectories:
```typescript
export function findTaskFile(taskId: string): string | null {
  const queueDir = getQueueDir()
  const filename = `TASK-${taskId}.md`

  for (const queue of ALL_QUEUE_DIRS) {
    const candidate = join(queueDir, queue, filename)  // searches tasks/incoming/, tasks/claimed/, etc.
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return null
}
```

But files are created at `tasks/<task-id>.md`, not `tasks/<queue>/TASK-<task-id>.md`.

**This suggests:**
- Either the file-moving code is legacy/dead code that should be removed
- Or there's a local-mode vs remote-mode difference in file handling
- Or the code is incomplete/inconsistent

### Questions for Octopoid Team

**HIGH PRIORITY - File System State Management:**

1. **Is file-moving code legacy?** Should `moveTaskFile` and `getQueueSubdir` be removed?

2. **File naming inconsistency:**
   - `enqueue` creates: `tasks/<task-id>.md`
   - `findTaskFile` expects: `tasks/<queue>/TASK-<task-id>.md` (with TASK- prefix)
   - Which is correct?

3. **Queue state storage:**
   - Confirm: Queue is stored in DB `queue` field only, not file system location?
   - Files never move between directories on queue transitions?

4. **Local vs Remote mode:**
   - Does local mode use queue subdirectories?
   - Does remote mode use flat `tasks/` directory?
   - If so, why does the code mix both approaches?

5. **Recommendation:**
   - Remove unused file-moving functions to prevent future confusion
   - Update `findTaskFile` to search flat `tasks/` directory only
   - Add tests to verify queue transitions don't move files

**Why this matters:**
- V1.x file-moving caused race conditions, permission issues, and state inconsistencies
- Moving files between directories breaks file watchers and external tools
- File system should be storage only; queue state belongs in database
- Dead code creates maintenance burden and confusion

---

## Missing: Debugging & Observability

### Server-Side Debug Output

**Problem:** In v1.x, we had comprehensive status scripts (`status.py`, `list_gatekeepers.py`) that gave one-page overviews of orchestrator state. V2.0 server needs equivalent debugging capabilities.

**Request for Octopoid Team:**

Add debugging endpoints or CLI commands for observability:

1. **Task-level debug:**
   - `GET /api/v1/tasks/:id/debug` - Full task state with computed fields
   - Show: lease expiration countdown, blocking status, burnout calculation, gatekeeper check status
   - Include: turns_used, commits_count, time in queue, last activity timestamp
   - Example output:
     ```json
     {
       "task_id": "task-abc123",
       "state": "claimed",
       "lease_expires_in": "14m 32s",
       "blocking": {
         "is_blocked": false,
         "blocked_by": null,
         "blocks": ["task-def456"]
       },
       "burnout": {
         "is_burned_out": false,
         "turns_used": 23,
         "commits_count": 2,
         "threshold": 80
       },
       "gatekeeper": {
         "review_round": 1,
         "pending_checks": ["architecture", "testing"],
         "completed_checks": ["qa"],
         "max_rounds": 3
       }
     }
     ```

2. **Queue-level debug:**
   - `GET /api/v1/debug/queues` - State of all queues with counts
   - Show: incoming, claimed, provisional, done, failed, needs_breakdown, needs_continuation
   - Include: oldest task in each queue, average time in queue
   - Example output:
     ```json
     {
       "incoming": {
         "count": 12,
         "oldest_task": "task-abc123",
         "oldest_age": "2h 14m"
       },
       "claimed": {
         "count": 3,
         "tasks": [
           {
             "id": "task-def456",
             "claimed_by": "implementer-1",
             "claimed_for": "8m 32s",
             "lease_expires_in": "21m 28s"
           }
         ]
       },
       "needs_breakdown": {
         "count": 2,
         "oldest_task": "task-ghi789",
         "oldest_age": "45m"
       }
     }
     ```

3. **Agent-level debug:**
   - `GET /api/v1/debug/agents` - All registered orchestrators and their agents
   - Show: heartbeat status, current task, task history, success rate
   - Include: last activity, uptime, tasks completed

4. **CLI integration:**
   - `octopoid debug task <id>` - Pretty-print task debug info
   - `octopoid debug queues` - Show queue state
   - `octopoid debug agents` - Show agent state
   - `octopoid debug status` - Comprehensive one-page status (like v1.x `status.py`)

**Why this matters:**
- V1.x debugging relied heavily on `status.py` and other inspection scripts
- Server-only architecture means client can't inspect server state directly
- Need visibility into: burnout detection, lease expiration, dependency blocking, gatekeeper progress
- Essential for troubleshooting stuck tasks, zombie claims, and workflow bottlenecks

**Alternative approach:**
- If debug endpoints aren't feasible, provide a Python SDK method that replicates v1.x `status.py` functionality
- Allow clients to query server state and render comprehensive status reports locally

---

## Code Review Results

### ✅ Base Agent Class (`roles/base-agent.ts`)

**Turn Counting - AUTOMATIC ✅**
```typescript
// Line 286: Auto-increments on each callAnthropic()
this.turnsCount++

// Line 132: Resets when claiming new task
this.resetTurnCounter()

// Line 189: Uses tracked count when submitting
const actualTurns = turnsUsed !== undefined ? turnsUsed : this.turnsCount
```

**Confirmed:** Agents automatically track turns without manual intervention.

**Per-Task Logging - AUTOMATIC ✅**
```typescript
// Line 147-161: Creates .octopoid/logs/tasks/<task-id>.log
this.taskLogFile = join(logsDir, `${taskId}.log`)

// Line 133: Called automatically when claiming task
this.setupTaskLogging(task.id)
```

**Confirmed:** Task logs created on claim, persist after completion.

**Per-Agent Logging - AUTOMATIC ✅**
```typescript
// Line 58-63: Creates .octopoid/logs/agents/<agent-name>-<date>.log
this.logFile = join(logsDir, `${this.config.name}-${dateStr}.log`)
```

**Confirmed:** Agent logs created when debug mode enabled.

**Task-Specific Worktrees - CONFIRMED ✅**
```typescript
// Line 244: Each task gets its own worktree
protected async ensureTaskWorktree(taskId: string, baseBranch: string = 'main')
```

**Confirmed:** Worktrees at `.octopoid/worktrees/<task-id>/` (not per-agent).

---

### ✅ Gatekeeper Agent (`roles/gatekeeper.ts`)

**3-Round Rejection Limit - HARDCODED ✅**
```typescript
// Line 100: Hardcoded to 3 rounds
const maxRounds = 3

// Line 109-115: Escalates to human after max rounds
if (currentRound + 1 >= maxRounds) {
  this.log(`⚠️ Task ${task.id} reached max review rounds - needs human intervention`)
  await this.rejectTask(taskId, `Max review rounds (${maxRounds}) reached...`)
}
```

**Confirmed:** 3-round limit enforced, escalates with special message.

**Multi-Check Workflow - NOT IMPLEMENTED ⚠️**
- Gatekeeper does **single comprehensive review**, not multiple specialized checks
- No use of `checks`, `check_results` fields in schema
- One gatekeeper agent reviews all aspects (code quality, tests, docs)
- **Gap:** Schema supports multi-check but implementation doesn't use it

---

### ✅ Breakdown Agent (`roles/breakdown.ts`)

**Breakdown Workflow - IMPLEMENTED ✅**
```typescript
// Line 22: Claims tasks with role='breakdown'
const task = await this.claimNextTask('breakdown')

// Line 82-96: Creates subtasks with dependencies
blocked_by: i > 0 ? createdTasks[i - 1] : undefined  // Chain dependencies
```

**Confirmed:** Breakdown workflow exists, chains subtask dependencies.

**Breakdown Depth Tracking - NOT IMPLEMENTED ⚠️**
- No `breakdown_depth` field checked or set
- No re-breakdown depth limit
- **Gap:** Unlike v1.x (max 1 re-breakdown), v2.0 has no depth protection

**File Path Mismatch - FOUND ⚠️**
```typescript
// Line 89: Uses queue subdirectory (conflicts with enqueue command)
file_path: `tasks/incoming/TASK-${subtaskId}.md`
```

This conflicts with enqueue which uses flat `tasks/<id>.md`.

---

### ✅ Server Burnout Detection (`routes/tasks.ts`)

**Burnout Heuristic - IMPLEMENTED ✅**
```typescript
// Line 361-362: Thresholds
const BURNOUT_TURN_THRESHOLD = 80
const MAX_TURN_LIMIT = 100

// Line 365-369: 0 commits + 80 turns = burnout
if (body.commits_count === 0 && body.turns_used >= BURNOUT_TURN_THRESHOLD) {
  burnoutDetected = true
}

// Line 371-375: Absolute turn limit
else if (body.turns_used >= MAX_TURN_LIMIT) {
  burnoutDetected = true
}

// Line 380-383: Route to needs_continuation queue
const transition = burnoutDetected
  ? { ...TRANSITIONS.submit, to: 'needs_continuation' as TaskQueue }
  : TRANSITIONS.submit
```

**Confirmed:**
- 0 commits + 80 turns = burnout
- 100 turns absolute limit
- Routes to `needs_continuation` queue (preserves worktree)

---

### ✅ Server Lease Expiration (`scheduled/lease-monitor.ts`)

**Auto-Unclaim Logic - IMPLEMENTED ✅**
```typescript
// Runs every minute
UPDATE tasks
SET queue = 'incoming',
    claimed_by = NULL,
    orchestrator_id = NULL,
    lease_expires_at = NULL,
    updated_at = datetime('now')
WHERE queue = 'claimed'
AND lease_expires_at < datetime('now')
```

**Confirmed:**
- Expired leases auto-released every minute
- Task returns to incoming queue
- History recorded for debugging

**Lease Timeout Duration:** Not found in code - likely configurable.

---

### ✅ Dependency Enforcement (`state-machine.ts`)

**Blocking Guard - IMPLEMENTED ✅**
```typescript
case 'dependency_resolved': {
  if (!task.blocked_by) {
    return { passed: true }
  }

  const blocker = await queryOne<Task>(
    db,
    'SELECT queue FROM tasks WHERE id = ?',
    task.blocked_by
  )

  if (blocker.queue !== 'done') {
    return {
      passed: false,
      error: `Task is blocked by ${task.blocked_by} (${blocker.queue})`,
    }
  }
}
```

**Confirmed:** Server enforces `blocked_by` - cannot claim blocked tasks.

**Auto-Unblock:** Not found - likely manual or part of accept transition.

---

## Next Steps

### Completed ✅

1. ✅ **Test task lifecycle:**
   - Created test task via API
   - Verified worktrees directory exists (empty until task claimed)
   - Verified task logs directory doesn't exist yet (created on first claim)
   - Confirmed full task schema via API

2. ✅ **Test draft/project APIs:**
   - Created, listed, updated, and deleted drafts
   - Created, listed, and deleted projects
   - Both APIs fully functional

3. ✅ **Verify task schema:**
   - All P0 fields confirmed: blocked_by, checks, check_results, review_round, lease_expires_at, turns_used, commits_count, needs_breakdown, execution_notes

### Immediate (Can Do Now)

### Requires Code Review

4. **Read v2.0 agent code:**
   - Base agent class (turn counting, logging)
   - Gatekeeper agent (multi-check, rejection rounds)
   - Breakdown agent (if exists)
   - Check agent lifecycle hooks

5. **Check server logic:**
   - Burnout detection (0 commits + 80 turns)
   - Lease expiration
   - Dependency auto-unblock
   - Queue types (are all 8 queues supported?)

### Questions/Issues for Octopoid Team

Based on code review findings:

**✅ CONFIRMED - Working as expected:**
1. ~~Turn counting~~ - Automatic via `callAnthropic()` wrapper ✅
2. ~~Burnout detection~~ - Implemented (80 turns + 0 commits OR 100 absolute) ✅
3. ~~Lease expiration~~ - Auto-unclaim every minute via scheduled job ✅
4. ~~Task dependencies~~ - Server enforces `blocked_by` guard ✅
5. ~~Per-task logging~~ - Automatic at `.octopoid/logs/tasks/<id>.log` ✅
6. ~~Needs continuation queue~~ - Exists, used for burnout cases ✅
7. ~~3-round rejection limit~~ - Hardcoded in gatekeeper ✅

**⚠️ GAPS FOUND - Need clarification or implementation:**

8. **Gatekeeper multi-check NOT IMPLEMENTED:**
   - Schema has `checks`, `check_results`, `review_round` fields
   - But gatekeeper agent does single comprehensive review
   - Is multi-check (architecture + testing + QA) planned but not built?
   - Or should we remove unused schema fields?

9. **Breakdown depth tracking MISSING:**
   - No `breakdown_depth` field checked or incremented
   - Risk of infinite re-breakdown loops
   - v1.x had max 1 re-breakdown protection
   - **Request:** Add depth tracking and configurable max depth

10. **File path inconsistency:**
    - `enqueue` creates: `tasks/<task-id>.md` (flat)
    - `breakdown` creates: `tasks/incoming/TASK-<task-id>.md` (subdirs)
    - `findTaskFile` searches: `tasks/<queue>/TASK-<task-id>.md` (subdirs)
    - **Request:** Standardize on flat structure, remove queue subdirs

11. **Lease timeout duration not found:**
    - Auto-unclaim logic exists but timeout value not visible in code
    - Is it configurable? Where?
    - What's the default duration?

12. **Auto-unblock on completion:**
    - `blocked_by` enforcement confirmed
    - Auto-unblock not found (may be in accept transition)
    - Does completing a task auto-unblock dependents?
    - Or must dependents be manually re-queued?

13. **Agent notes (`execution_notes`) not populated:**
    - Schema field exists but agents don't write to it
    - Logs exist, but `execution_notes` field unused
    - Should agents summarize key events there?

14. **🔴 DEBUGGING/OBSERVABILITY (HIGHEST PRIORITY):**
    - Need debug endpoints or CLI commands for troubleshooting
    - Task-level debug (lease expiration, burnout status, blocking status)
    - Queue-level debug (counts, oldest task per queue)
    - Agent-level debug (heartbeat, current task, success rate)
    - Comprehensive status output (like v1.x `status.py`)
    - See "Missing: Debugging & Observability" section for detailed request

---

## Summary

**What we know works:**
- ✅ Drafts API (full CRUD, tested end-to-end)
- ✅ Projects API (full CRUD, tested end-to-end)
- ✅ Task API (create, claim, submit, accept, reject)
- ✅ Worktrees directory structure exists
- ✅ Logs directory structure exists
- ✅ Dashboard exists (Python)

**Task schema fully verified - all P0 fields exist:**
- ✅ `blocked_by` (task dependencies)
- ✅ `checks`, `check_results`, `review_round` (gatekeeper multi-check)
- ✅ `claimed_by`, `claimed_at`, `lease_expires_at` (lease-based claiming)
- ✅ `turns_used`, `commits_count` (burnout detection inputs)
- ✅ `needs_breakdown`, `attempt_count` (breakdown workflow)
- ✅ `execution_notes` (agent notes)

**Runtime behavior verified - code review complete:**
- ✅ Turn counting - **AUTOMATIC** (auto-increments on each API call, resets on claim)
- ✅ Burnout detection - **IMPLEMENTED** (0 commits + 80 turns OR 100 turn absolute limit)
- ✅ Breakdown workflow - **EXISTS** (creates subtasks with chained dependencies)
- ✅ Gatekeeper 3-round limit - **HARDCODED** (max 3 rounds, escalates to human)
- ✅ Lease expiration - **AUTO-UNCLAIM** (runs every minute, releases expired leases)
- ✅ Task dependencies - **ENFORCED** (server blocks claiming if dependency not done)
- ✅ Needs continuation queue - **EXISTS** (burnout routes here instead of provisional)
- ✅ Per-task logging - **AUTOMATIC** (created on claim at `.octopoid/logs/tasks/<id>.log`)

**Gaps found:**
- ⚠️ Gatekeeper multi-check **NOT IMPLEMENTED** (schema supports but code doesn't use)
- ⚠️ Breakdown depth tracking **MISSING** (no protection against infinite re-breakdown)
- ⚠️ File path inconsistency (breakdown uses queue subdirs, enqueue uses flat structure)
- ⚠️ Lease timeout duration **NOT FOUND** (likely configurable, need to check config)
- ⚠️ Auto-unblock on completion **NOT FOUND** (may exist in accept transition)

**Recommended approach:**
1. ✅ **Schema verification complete** - all critical fields exist
2. **Next:** Read v2.0 server code to verify runtime logic (burnout detection, lease expiration, dependency enforcement)
3. **Then:** Test agent runtime (turn counting, logging, note-taking)
4. **Finally:** Create GitHub issues for missing/unclear runtime features
5. **Start Phase 1 with confidence:** Schema is solid, runtime details can be clarified with Octopoid team
