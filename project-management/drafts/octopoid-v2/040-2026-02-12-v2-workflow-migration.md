# V2 Workflow Migration - Requirements & Strategy

**Status:** Active Planning
**Created:** 2026-02-12
**Last Updated:** 2026-02-12

---

## Executive Summary

We've completed the v2.0 technical migration (server deployed, client configured). Now we need to map our highly refined v1.x workflow onto v2.0's architecture. This document defines:

1. **Strategic changes** - Agent roles, workflow lanes, entity migration
2. **Technical requirements** - What v2.0 must provide or allow us to extend
3. **Gap analysis** - What to verify exists vs what we need to request/build

**Goal:** Maintain v1.x workflow sophistication while leveraging v2.0's client-server architecture.

---

## Context

**V2.0 Migration Complete:**
- ✅ Server deployed to Cloudflare Workers
- ✅ Client configured in remote mode
- ✅ Basic task system working
- ✅ API key configured

**V1.x Workflow We Want to Preserve:**
- Multiple agent roles (orchestrator_impl, implement, breakdown, review, QA)
- Custom approval flows (product vs infra)
- Draft and project management integrated into task system
- Custom agents (inbox-poller, proposers, draft-processors)
- Burnout detection and automatic breakdown
- Turn counting and resource tracking

---

## Part 1: Strategic Changes

### 1. Agent Role Simplification

**V1.x had:**
- `orchestrator_impl` - for working on local Octopoid submodule *(no longer needed)*
- `implement` - for product (Boxen) work
- `breakdown` - for task decomposition
- `review` - gatekeepers for code review
- `qa` - visual/functional testing

**V2.0 needs:**
- **Remove** `orchestrator_impl` - no longer maintaining local Octopoid fork
- **Keep** `implement` but split into two lanes:
  - **Product agents** - Boxen features and fixes (full QA/PR/review flow)
  - **Infra agents** - Testing, refactoring, tooling (streamlined auto-merge)
- **Keep** `breakdown` - task decomposition when agents burn out
- **Keep** `review` - gatekeepers for code quality
- **Re-evaluate** `qa` - is this built into v2.0 or still custom?

### 2. Workflow Lanes

#### Product Agent Flow (Full Process)

```
incoming → claimed (implement) → dev work → rebase → submit_completion
  → provisional → gatekeeper review (up to 3 rounds) → create PR
  → human review → approve/merge → done
```

**Steps:**
1. Agent claims task, creates feature branch
2. Implements changes, commits to branch
3. Rebases onto main (automatic rebaser or manual)
4. Submits completion (`submit_completion()`)
5. Moves to provisional queue
6. **Gatekeeper agents review** (architecture, testing, QA checks)
   - Up to **3 rejection rounds** per check
   - Feedback provided on each rejection
   - After 3 rejections: escalate to human
7. If all checks pass: create PR
8. Human reviews PR
9. Human approves: merges to main, marks task done

**Why full process:** Product changes affect user-facing behavior. Need thorough validation.

#### Infra Agent Flow (Streamlined)

```
incoming → claimed (implement) → dev work → rebase → auto-approve → done
```

**Steps:**
1. Agent claims task, creates feature branch
2. Implements changes (tests, refactoring, tooling)
3. Rebases onto main
4. **Auto-approves if:**
   - All tests pass
   - Changes are in whitelisted paths (`.claude/`, `project-management/scripts/`, test files)
   - No merge conflicts
   - Diff size < threshold (e.g., 500 lines)
5. Merges to main, marks task done

**Why streamlined:** Infra changes are low-risk, well-tested, don't affect end users.

### 3. Entity Migration to Server

#### Drafts

**V1.x:**
- Markdown files in `project-management/drafts/{boxen,octopoid}/`
- Status tracked in `.orchestrator/state.db` (local SQLite)
- `register_existing_drafts.py` syncs files → DB

**V2.0 needs:**
- Markdown files **stay in git** (`project-management/drafts/`)
- Status tracked in **server database** (Cloudflare D1)
- Draft lifecycle: `idea` → `stale` (>3 days) → `proposal` or `archived`
- API endpoints: `GET /drafts`, `POST /drafts`, `PATCH /drafts/:id`
- Domain separation: boxen vs octopoid vs future projects

**Questions:**
- Does v2.0 have draft API built-in?
- Schema: files + DB status, or pure DB?
- How handle domain separation?

#### Projects

**V1.x:**
- Multi-task initiatives in `.orchestrator/state.db`
- Breakdown tree (parent task → child tasks)
- Project status dashboard

**V2.0 needs:**
- Project entity in server database
- Task hierarchy preserved (`task.project_id`)
- Project status tracking (`planning` → `active` → `complete`)
- API: `GET /projects`, `POST /projects`, `PATCH /projects/:id`

**Questions:**
- Does v2.0 support projects?
- Task hierarchies natively supported?
- Dashboard shows project progress?

---

## Part 2: Technical Foundation

### 4. Agent Worktree Model ⚠️ CRITICAL

**V1.x mistake (agent-specific):**
```
.orchestrator/agents/
├── impl-agent-1/worktree/  # ❌ Worktree per agent
├── impl-agent-2/worktree/  # ❌ Agents can't work in parallel
```

**V2.0 requirement (task-specific):**
```
.octopoid/tasks/
├── abc12345/worktree/  # ✅ Worktree per task
└── def67890/worktree/  # ✅ Ephemeral, deleted after completion
```

**Why critical:**
- Multiple agents can work different tasks in parallel
- Worktree lifecycle = task lifecycle (ephemeral, clean)
- No cleanup of stale agent worktrees
- Clearer debugging (task-centric, not agent-centric)

**Verification:**
- [ ] Check if v2.0 uses `.octopoid/tasks/<task-id>/worktree/`
- [ ] Verify worktrees are deleted after task completion

### 5. Logging Architecture ⚠️ CRITICAL

**V1.x requirement (both needed):**
```
.orchestrator/logs/
├── tasks/
│   ├── TASK-abc123.log  # Per-task log (all turns, all attempts)
│   └── TASK-def456.log
└── agents/
    ├── impl-agent-1.log  # Per-agent log (all tasks worked)
    └── breakdown-agent.log
```

**Why both:**
- **Task logs:** Debugging specific task failures (complete execution history)
- **Agent logs:** Debugging agent behavior (cross-task patterns)

**Requirements:**
- [ ] Per-task logs: `.octopoid/logs/tasks/<task-id>.log`
- [ ] Per-agent logs: `.octopoid/logs/agents/<agent-name>.log`
- [ ] Both must exist and be clearly separated
- [ ] Task logs survive completion (for postmortem analysis)

**Verification:**
- [ ] Check if v2.0 creates both log types
- [ ] Verify logs persist after task/agent completion

### 6. Turn Counting ⚠️ CRITICAL

**Metric:** `tasks.turns_used` (number of Claude API calls)

**Why critical:**
- **Burnout detection:** 0 commits + 80+ turns = breakdown needed
- **Cost tracking:** Agent efficiency measurement
- **Task estimation:** Predict future task complexity
- **Debugging:** High turns without commits = stuck agent

**Requirements:**
- [ ] Every agent invocation auto-increments turns_used
- [ ] Stored in task record (persisted to DB)
- [ ] Visible in status reports
- [ ] Used for burnout heuristic

**Verification:**
- [ ] Does v2.0 track turns_used automatically?
- [ ] Or must agents manually report it?
- [ ] Is it visible in dashboard/API?

### 7. Agent Notes

**Expected behavior:**
- Agents write execution notes during work
- Notes include: approach taken, obstacles, decisions made
- Notes survive task completion (debugging aid)

**Questions:**
- [ ] Does v2.0 support agent notes?
- [ ] Where stored: in task file or separate?
- [ ] Are agents actually writing them?

---

## Part 3: Task System Requirements

### 8. Task Lifecycle & Queues

**Queue types needed:**
```
incoming/          # New tasks (agents claim from here)
claimed/           # Tasks being worked
provisional/       # Awaiting gatekeeper review
done/              # Completed
failed/            # Failed execution (can retry)
needs_continuation/ # Partial work (uncommitted changes, resume later)
breakdown/         # Needs decomposition
recycled/          # Burned-out tasks (sent to breakdown)
```

**Lifecycle flow:**
```
incoming → claimed → provisional → done
                  ↓
              failed (can retry to incoming)
                  ↓
              recycled (if burned out: 0 commits + 80+ turns)
                  ↓
              breakdown (re-decompose into subtasks)
```

**Critical requirements:**
- [ ] Task claiming with **leases** (auto-expire, prevent zombie claims)
- [ ] Task dependencies (`blocked_by` field, auto-unblock when dependency completes)
- [ ] Task metadata: title, role, priority, branch, project_id, blocked_by
- [ ] Task history/audit trail (state transitions)

### 9. Burnout Detection & Breakdown

**Heuristic:** `0 commits + ≥80 turns = burned out`

**Workflow:**
1. Agent burns out → task moved to `recycled` queue
2. Recycled task automatically moved to `breakdown` queue
3. Breakdown agent claims from breakdown queue
4. Agent explores codebase, reads original task
5. Agent creates breakdown document with subtasks
6. **Human reviews and approves breakdown**
7. Subtasks created and enqueued
8. Original task marked as completed-via-breakdown

**Re-breakdown limits:**
- Max depth: **1 level** (can re-break a task once)
- After depth 1: escalate to human (task too complex for auto-breakdown)

**Requirements:**
- [ ] Automatic burnout detection (0 commits + 80+ turns)
- [ ] Auto-route to breakdown queue
- [ ] Breakdown agent role supported
- [ ] Re-breakdown depth tracking (prevent infinite loops)
- [ ] Depth limit enforcement

**Questions:**
- [ ] Is breakdown role in v2.0?
- [ ] Does v2.0 track `breakdown_depth`?
- [ ] Extension points if not built-in?

### 10. Needs Continuation Queue

**Purpose:** Resume partial work when agent hits turn limit without completing

**Workflow:**
1. Agent hits max turns with uncommitted changes
2. Task moved to `needs_continuation` queue
3. **Worktree preserved** (not deleted)
4. Next implementer claims task
5. Agent resumes from existing worktree (not fresh clone)
6. Continues work until complete or burns out

**Requirements:**
- [ ] Detect uncommitted changes when hitting turn limit
- [ ] Preserve worktree for continuation tasks
- [ ] Next agent resumes from preserved worktree

**Questions:**
- [ ] Does v2.0 support needs_continuation queue?
- [ ] How detect uncommitted changes?
- [ ] Worktree preservation logic?

---

## Part 4: Gatekeeper System

### 11. Multi-Check Review Workflow

**Purpose:** Automated code review before merging

**Gatekeeper agents:**
- `gk-architecture` - Review architectural concerns
- `gk-testing` - Review test coverage and quality
- `gk-qa` - Review user-facing functionality (product lane only)

**Process:**
1. Task reaches provisional queue
2. Gatekeeper agents run checks (architecture, testing, QA)
3. Each check produces: `approve`, `reject`, or `skip`
4. Task needs **all required checks** to pass
5. **Rejection handling:**
   - Agent provides feedback on rejection
   - Task returns to implementer for fixes
   - Rejection counter increments
   - After **3 rejections**: escalate to human

**Database schema needed:**
```sql
-- Tasks table additions
tasks.checks TEXT           -- comma-separated: "architecture,testing,qa"
tasks.check_results TEXT    -- JSON: {"architecture": "approved", ...}
tasks.rejection_count INTEGER
tasks.review_round INTEGER  -- current review round (max 3)

-- Reviews table
CREATE TABLE reviews (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    reviewer TEXT,          -- agent name or "human"
    check_name TEXT,        -- "architecture", "testing", "qa"
    verdict TEXT,           -- "approved", "rejected", "skipped"
    feedback TEXT,
    reviewed_at TIMESTAMP
);
```

**Requirements:**
- [ ] Gatekeeper agent role
- [ ] Multi-check support (task requires N checks)
- [ ] Per-task, per-check verdicts tracked
- [ ] Rejection limit (max 3 rounds → escalate)
- [ ] Feedback loop (rejected tasks get feedback, return to implementer)
- [ ] Multiple gatekeepers can run in parallel

**Questions:**
- [ ] Does v2.0 gatekeeper.ts support multi-check?
- [ ] How configure check names? (per-task or global)
- [ ] Is rejection_count tracked?
- [ ] Can multiple gatekeepers run in parallel?

**Verification:**
- [ ] Check v2.0 gatekeeper.ts implementation
- [ ] Test multi-check workflow
- [ ] Test rejection limit enforcement

---

## Part 5: Custom Agents

### 12. Custom Agent Re-evaluation

We built several custom agents in v1.x. Need to decide: **upstream to Octopoid core** or **keep domain-specific**?

#### inbox-poller

**What it does:** Checks user's "inbox" (external system or file) for tasks, creates Octopoid tasks automatically

**Options:**
- **Core:** If other users would benefit (poll GitHub issues, Jira, email)
- **Domain-specific:** If inbox format is unique to our workflow

**Decision:** TBD

#### proposers

**What it does:** Monitors drafts with status=idea, promotes promising ideas to status=proposal with more detail

**Options:**
- **Core:** Draft lifecycle (idea → proposal → task) could be built-in
- **Domain-specific:** If our draft criteria are unique

**Decision:** TBD

#### draft-processors

**What it does:** Takes drafts with status=proposal, converts to actionable tasks (enqueues)

**Options:**
- **Core:** Draft-to-task conversion could be core workflow
- **Domain-specific:** If task creation logic is highly customized

**Decision:** TBD

#### Other Custom Agents
- **Explorer auditors** - Detect failed explorer tasks
- **Queue management** - Rebalance queues, detect stuck tasks
- **Recommendation consolidator** - Merge overlapping recommendations
- **Automatic rebaser** - Rebase stale branches

**For each:** Decide core contribution vs domain-specific implementation.

---

## Part 6: Slash Commands

### 13. Command Surface Area

Commands should use `octo:` prefix for discoverability.

#### Task Management

| Command | Purpose |
|---------|---------|
| `octo:create-task` | Create new task (interactive or scripted) |
| `octo:approve` | Approve and merge task |
| `octo:reject` | Reject task with feedback |
| `octo:reset-task` | Reset task to incoming queue |
| `octo:hold` | Park task in escalated queue |
| `octo:retry-failed` | Retry tasks from failed queue |
| `octo:breakdown` | Request task breakdown |
| `octo:qa` | Run visual QA check on task |

#### Status & Monitoring

| Command | Purpose |
|---------|---------|
| `octo:status` | Comprehensive system status |
| `octo:queue` | Queue state (incoming, claimed, provisional, etc.) |
| `octo:agents` | Agent states and activity |
| `octo:today` | Today's activity summary |
| `octo:next` | Surface actionable items |

#### Agent Management

| Command | Purpose |
|---------|---------|
| `octo:pause-agent` | Pause/resume specific agent |
| `octo:pause` | Pause/resume entire system |
| `octo:add-agent` | Add new agent to configuration |

**Questions:**
- [ ] Which commands exist in v2.0?
- [ ] Which need to be built?
- [ ] API mapping (slash command → SDK → CLI)?

---

## Part 7: Open Questions

### Lane Detection

**How mark task as "product" vs "infra" for different flows?**

Options:
1. **Task metadata tag:** `category: product` vs `category: infra`
2. **Path-based heuristic:** Changes in `src/` = product, `.claude/` = infra
3. **Explicit queues:** `incoming-product/`, `incoming-infra/`
4. **Agent tags:** Product agents only claim product-tagged tasks

**Recommendation:** Start with task metadata tag, add path heuristic as validation

### Auto-Approve Safety

**What guardrails prevent infra agents from auto-merging risky changes?**

Guards needed:
1. **Path whitelist:** Only auto-approve if all changes in safe paths
2. **Test requirement:** All tests must pass
3. **Diff size limit:** Flag for review if >500 lines changed
4. **Merge conflict check:** Never auto-approve if conflicts exist
5. **Branch staleness:** Reject if base branch moved significantly

### Draft/Project Schema

**If extending v2.0 server, what's the approach?**

Options:
1. **PR to maxthelion/octopoid-server:** Contribute drafts/projects to core
2. **Fork and maintain custom server:** Own deployment, own schema
3. **Hybrid:** Core entities upstream, custom extensions in fork

**Recommendation:** Try to upstream core entities (drafts, projects). Keep custom agents domain-specific.

### Migration Path

**How port v1.x custom agents to v2.0?**

V1.x agents:
- Python scripts running in scheduler loop
- Direct file/DB access via `orchestrator.queue_utils`
- Monolithic agent config

V2.0 agents:
- TypeScript/JavaScript (or Python via SDK)
- API-based (no direct file access)
- Per-agent config files?

**Questions:**
- [ ] What's v2.0 agent API surface?
- [ ] Can we use Python for custom agents?
- [ ] Extension points for custom roles?

---

## Part 8: Verification Checklist

### Verify V2.0 Has These Features

**Must-Have (P0):**
- [ ] Task-specific worktrees (`.octopoid/tasks/<id>/worktree/`)
- [ ] Per-task + per-agent logging (both exist, separate)
- [ ] Auto turn counting (agents don't manually track)
- [ ] Lease-based claiming (prevent zombie claims)
- [ ] Task dependencies (blocked_by, auto-unblock)
- [ ] Gatekeeper multi-check (N checks, 3 rejection rounds)

**Should-Have (P1):**
- [ ] Burnout detection (0 commits + 80+ turns → breakdown)
- [ ] Breakdown agent role (with re-breakdown depth limits)
- [ ] Needs continuation queue (preserve worktree, resume work)
- [ ] Drafts API (GET/POST/PATCH endpoints)
- [ ] Projects API (GET/POST/PATCH endpoints)
- [ ] Agent notes (execution notes storage)

**Nice-to-Have (P2):**
- [ ] Task templates by role
- [ ] Bulk operations (approve all, retry all)
- [ ] Dashboard with project/draft views
- [ ] Slash command library

### Verify V1.x Custom Agents Still Work

- [ ] inbox-poller (can poll external sources, create tasks via API)
- [ ] proposers (can read drafts, update status via API)
- [ ] draft-processors (can convert proposals to tasks via API)
- [ ] automatic rebaser (can rebase branches, update task status)

---

## Part 9: Implementation Phases

### Phase 1: Core Workflow (Product + Infra Lanes)

**Goal:** Basic task execution with lane separation

1. **Configure v2.0 agents:**
   ```yaml
   # .octopoid/agents.yaml
   agents:
     - name: product-impl-1
       role: implement
       tags: [product]
       model: sonnet
       max_concurrent: 1

     - name: infra-impl-1
       role: implement
       tags: [infra]
       model: sonnet
       max_concurrent: 1

     - name: breakdown-1
       role: breakdown
       model: sonnet
       max_concurrent: 1

     - name: gatekeeper-1
       role: review
       model: opus
       max_concurrent: 1
   ```

2. **Verify technical foundation:**
   - Task-specific worktrees exist
   - Per-task and per-agent logs created
   - Turn counting automatic
   - Dependencies work (blocked_by)

3. **Implement lane routing:**
   - Add task metadata: `category: product|infra`
   - Configure agents to filter by category
   - Test product vs infra flows

4. **Configure auto-approve for infra:**
   - Path whitelist: `.claude/`, `project-management/scripts/`, test files
   - Test pass requirement
   - Diff size check
   - Test with sample infra task

5. **Test with real tasks:**
   - Product: "Add chamfer operation to Boxen UI"
   - Infra: "Refactor fingerJoints.ts for readability"

### Phase 2: Entity Migration (Drafts + Projects)

**Goal:** Drafts and projects tracked in server DB

1. **Verify v2.0 support:**
   - Check if drafts API exists
   - Check if projects API exists
   - Review schema design

2. **If missing, extend server:**
   - Design draft schema (see section 3)
   - Add API endpoints (`GET /drafts`, `POST /drafts`, `PATCH /drafts/:id`)
   - Test draft lifecycle (create, stale detection, archive)

3. **Migrate local data:**
   - Export v1.x drafts to server
   - Export v1.x projects to server
   - Verify data integrity

4. **Update local commands:**
   - `/draft-idea` syncs to server
   - `/process-draft` updates server status
   - Project commands use server API

### Phase 3: Gatekeeper & Burnout

**Goal:** Automated quality gates and breakdown workflow

1. **Configure gatekeeper agents:**
   - Enable gk-architecture, gk-testing, gk-qa
   - Set required checks per lane (product vs infra)
   - Test multi-check workflow
   - Test 3-round rejection limit

2. **Configure burnout detection:**
   - Verify 80-turn threshold
   - Test automatic routing to breakdown queue
   - Configure breakdown agent
   - Test re-breakdown depth limit

3. **Test full cycle:**
   - Create task that will burn out
   - Verify automatic breakdown
   - Approve breakdown
   - Verify subtasks created

### Phase 4: Custom Agents

**Goal:** Port or upstream custom agents

1. **Inventory custom agents:**
   - List all v1.x custom agents
   - Document purpose, value, frequency

2. **Decide per agent:**
   - Upstream candidate? (useful to all Octopoid users)
   - Domain-specific? (Boxen-specific logic)
   - Deprecate? (no longer needed in v2.0)

3. **Port domain-specific agents:**
   - inbox-poller → v2.0 format
   - proposers → v2.0 format
   - draft-processors → v2.0 format
   - automatic rebaser → v2.0 format

4. **Upstream core candidates:**
   - Draft proposal for maxthelion/octopoid
   - Submit PR with implementation
   - Document extension points

### Phase 5: Final Migration

**Goal:** Fully replace v1.x with v2.0

1. **Run parallel for 1 week:**
   - v1.x finishes existing queue
   - v2.0 receives new tasks
   - Monitor both systems

2. **Snapshot v1.x final state:**
   - Archive `.orchestrator/` to `.orchestrator-v1-final/`
   - Export final DB state
   - Document learnings

3. **Decommission v1.x:**
   - Stop v1.x scheduler
   - Remove v1.x cron jobs
   - Archive v1.x code

4. **Finalize v2.0:**
   - All agents running
   - Dashboard operational
   - Slash commands working
   - Documentation complete

---

## Success Criteria

**Migration complete when:**

- ✅ Product tasks go through full QA + PR + review flow
- ✅ Infra tasks auto-merge when tests pass (path whitelist + test pass)
- ✅ Drafts and projects tracked in server database (accessible from any machine)
- ✅ Burnout detection works (0 commits + 80 turns → breakdown queue)
- ✅ Gatekeeper multi-check enforced (3 rejection rounds → escalate)
- ✅ Custom agents either upstreamed or running as v2.0 agents
- ✅ No loss of workflow sophistication from v1.x → v2.0

---

## Risks & Mitigations

### Risk 1: V2.0 Missing Core Features

**Risk:** Drafts/projects/breakdowns not in v2.0 core → need custom extension

**Mitigation:**
- Phase 1 first (verify core task workflow works)
- Phase 2 evaluates entity support
- If missing, we can extend (client-server architecture allows this)

### Risk 2: Agent API Differences

**Risk:** V1.x agent code doesn't port cleanly to v2.0

**Mitigation:**
- Read v2.0 agent API docs first
- Start with simplest custom agent (inbox-poller)
- Build adapter layer if needed (v1.x API → v2.0 API)

### Risk 3: Auto-Approve Bugs

**Risk:** Infra agent auto-merges breaking changes if whitelist wrong

**Mitigation:**
- Start with very strict whitelist
- Require 100% test pass (no skips)
- Add diff size limit (e.g., 500 lines)
- Monitor for 1 week before trusting fully

### Risk 4: Migration Complexity

**Risk:** Running two systems in parallel is operationally complex

**Mitigation:**
- Short parallel period (1 week max)
- Clear queue separation (v1.x finishes old, v2.0 gets new)
- Automated health checks for both systems
- Rollback plan if v2.0 fails

---

## Document Status

**Status:** Active planning - comprehensive requirements defined

**Next Actions:**
1. Walk through verification checklist (what exists in v2.0?)
2. Identify gaps (what to request from Octopoid team?)
3. Start Phase 1 (core workflow with lane separation)

**Questions for Octopoid Team:** See Part 7 (Open Questions) - we'll consolidate these into GitHub issues as we verify v2.0 capabilities.
