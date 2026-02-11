# Octopoid Project Management Requirements

**Date:** 2026-02-11
**Purpose:** Define project management structure and features Boxen needs from Octopoid v2.0
**Context:** Preparing feedback for Octopoid team based on Boxen's current v1.x workflow

---

## Executive Summary

This document specifies the project management capabilities Boxen requires from Octopoid. These requirements are based on our current v1.x workflow and represent features we need either:
1. Built into Octopoid core (preferred)
2. Documented as extension points for custom implementation

**Out of scope for now:**
- Postmortems (will add back later as separate feature)
- Inboxes (defer to later iteration)

---

## 1. Drafts System

### Current v1.x Implementation

**Directory structure:**
```
project-management/drafts/
├── boxen/          # App feature ideas, bug analyses, UI/UX improvements
└── octopoid/       # Orchestrator improvements, workflow proposals
```

**Purpose:** Capture rough ideas, design docs, and proposals before they become tasks. Drafts are:
- Lightweight (markdown files)
- Low barrier to entry (any idea worth considering)
- Domain-separated (boxen vs octopoid work)
- Processable (can be promoted to tasks, archived, or rejected)

**Lifecycle:**
1. **Created** - New idea captured in draft
2. **Stale** (>3 days old) - Draft-processor agent reviews and either:
   - Promotes to tasks
   - Archives as completed
   - Requests clarification
3. **Archived** - Moved to `project-management/archive/{boxen,octopoid}/`

**v1.x Agent:** `draft-processor` (proposer role, 12h interval, checks for drafts >3 days old)

### v2.0 Requirements

**Essential:**
- [ ] Draft storage location (file-based or DB-based?)
- [ ] Draft metadata (created, status, category/domain)
- [ ] Draft lifecycle states (draft, stale, archived)
- [ ] Agent role for processing stale drafts
- [ ] Commands: `/draft-idea`, `/drafts-list`, `/process-draft`

**Questions for Octopoid team:**
1. Should drafts be markdown files or database records?
2. If files: does Octopoid manage the directory structure?
3. If DB: what schema for draft storage?
4. How do we handle domain separation (boxen vs octopoid vs future projects)?

**Migration note:** v1.x recently merged proposals into drafts. All proposal functionality now flows through the drafts system.

---

## 2. Projects System

### Current v1.x Implementation

**Directory structure:**
```
.orchestrator/shared/projects/
├── PROJECT-abc123.md
└── PROJECT-def456.md
```

**Purpose:** Track multi-task initiatives with:
- Title and description
- Child tasks (dependencies)
- Status (planning, active, blocked, complete)
- Notes and context

**Database schema (SQLite):**
```sql
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'planning',
    created_at TIMESTAMP,
    completed_at TIMESTAMP
);
```

**Task linking:**
- Tasks reference `project_id` in metadata
- Project files list child task IDs
- Breakdowns can create tasks under a project

**v1.x Usage:**
- Used for large features requiring multiple subtasks
- Provides context for related work
- Allows tracking overall project progress
- Currently lightweight (not heavily used in practice)

### v2.0 Requirements

**Essential:**
- [ ] Project entity (DB record or file)
- [ ] Project metadata (title, description, status, created/completed)
- [ ] Task-to-project relationship (task.project_id)
- [ ] List tasks by project
- [ ] Project status tracking (planning → active → complete)
- [ ] Commands: `/create-project`, `/list-projects`, `/project-status`

**Optional (nice-to-have):**
- [ ] Project dependencies (project A blocks project B)
- [ ] Project milestones
- [ ] Project templates

**Questions for Octopoid team:**
1. Does v2.0 already have project support?
2. If so, what's the API surface?
3. If not, is this planned or should we implement it ourselves?

---

## 3. Tasks System

### Current v1.x Implementation

**File format:** Markdown files with frontmatter
```markdown
# [TASK-abc123] Fix authentication bug

ROLE: implement
PRIORITY: P1
BRANCH: main
PROJECT_ID: PROJECT-auth-refactor
BLOCKED_BY: TASK-xyz789

## Context
[Background and motivation]

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Notes
[Agent notes during execution - currently NOT implemented]
```

**Queue directories:**
```
.orchestrator/shared/queue/
├── incoming/          # New tasks (agents claim from here)
├── claimed/           # Tasks being worked
├── provisional/       # Awaiting review
├── done/              # Completed
├── failed/            # Failed execution
├── needs_continuation/  # Partial work (uncommitted changes)
├── breakdown/         # Needs decomposition
└── recycled/          # Burned-out tasks (0 commits, high turns)
```

**Database (SQLite):**
```sql
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    file_path TEXT,
    title TEXT,
    role TEXT,
    priority TEXT,
    queue TEXT,
    branch TEXT,
    project_id TEXT,
    blocked_by TEXT,  -- comma-separated task IDs
    claimed_by TEXT,  -- orchestrator_id
    claimed_at TIMESTAMP,
    created_at TIMESTAMP,
    completed_at TIMESTAMP,
    turns_used INTEGER,  -- CRITICAL: track AI turns spent
    commits_count INTEGER,
    pr_number INTEGER,
    pr_url TEXT,
    staging_url TEXT,
    rejection_count INTEGER,
    checks TEXT,  -- gatekeeper check names
    check_results TEXT  -- gatekeeper verdicts
);
```

**Lifecycle:**
```
incoming → claimed → provisional → done
                  ↓
              failed (can retry to incoming)
                  ↓
              recycled (if burned out: 0 commits + 80+ turns)
                  ↓
              breakdown (re-decompose into subtasks)
```

### v2.0 Requirements

**Essential (API layer):**
- [ ] Task creation via API (not file manipulation)
- [ ] Task state transitions via API (queue changes)
- [ ] Task claiming with leases (auto-expire, prevent zombie claims)
- [ ] Task metadata (title, role, priority, branch, project_id, blocked_by)
- [ ] Task dependencies (blocked_by field, auto-unblock when dependency completes)
- [ ] Task history/audit trail (state transitions)

**Essential (agent workflow):**
- [ ] Agent claims task from API (receives task content + metadata)
- [ ] Agent works in task-specific worktree (`.octopoid/tasks/<task-id>/worktree/`)
- [ ] Agent reports progress (turns used, commits count, status updates)
- [ ] Agent submits completion (moves to provisional queue)
- [ ] Gatekeeper reviews and accepts/rejects
- [ ] On acceptance: task → done, dependent tasks unblocked

**Critical agent behavior (must match v1.x baseline):**
- [ ] **Turn counting**: Track and report turns_used (number of Claude API calls)
- [ ] **Agent notes**: Agents write execution notes to task file or separate notes storage
- [ ] **Worktree model**: Task-specific worktrees (NOT agent-specific)
  - v1.x mistake: `.orchestrator/agents/<agent-name>/worktree/` (agent-specific)
  - v2.0 fix: `.octopoid/tasks/<task-id>/worktree/` (task-specific, ephemeral)
- [ ] **Logging**:
  - Per-task logs: `.octopoid/logs/tasks/<task-id>.log`
  - Per-agent logs: `.octopoid/logs/agents/<agent-name>.log`
  - Both must exist and be clearly separated

**Burnout detection:**
- [ ] Detect burned-out tasks (0 commits + 80+ turns threshold)
- [ ] Automatically move to breakdown queue for re-decomposition
- [ ] Limit re-breakdown depth (max 1 level, then escalate to human)

**Needs continuation queue:**
- [ ] Detect tasks with uncommitted changes when agent hits max turns
- [ ] Move to needs_continuation queue (preserve worktree)
- [ ] Next implementer resumes from existing worktree (not fresh clone)

**Optional (nice-to-have):**
- [ ] Task templates (by role: implement, test, review, etc.)
- [ ] Bulk operations (retry all failed, accept all provisional)
- [ ] Task search/filter (by role, priority, project, status)

**Questions for Octopoid team:**
1. Does v2.0 track turns_used per task? (CRITICAL for burnout detection)
2. Is needs_continuation queue supported? (Resume partial work)
3. Is task-specific worktree model implemented? (Not agent-specific)
4. Are per-task logs separate from agent logs?
5. Do agents write notes during execution? (Where stored: task file vs separate?)
6. How are dependencies (blocked_by) handled? (Auto-unblock on completion?)

---

## 4. Breakdowns System

### Current v1.x Implementation

**Purpose:** Decompose complex tasks into subtasks when:
1. Agent burns out (0 commits, 80+ turns) — **primary use case**
2. Human manually requests breakdown (`/decompose-task`)
3. Task is marked as "needs breakdown" at creation

**Directory structure:**
```
.orchestrator/shared/breakdowns/
└── breakdown-YYYYMMDD-HHMMSS.md
```

**Breakdown file format:**
```markdown
# Breakdown: Original Task Title

**Branch:** feature/abc123
**Created:** 2026-02-05T14:30:00
**Status:** pending | approved | rejected
**Re-breakdown depth:** 0 | 1

## Exploration Findings
[Agent's investigation of why original task failed]

## Subtasks

### Subtask 1: [Title] (~X turns)
**Dependencies:** None | TASK-xyz789
**Priority:** P1
[Description, files, acceptance criteria]

### Subtask 2: [Title] (~Y turns)
...
```

**Workflow:**
1. Agent burns out → task moved to breakdown queue
2. Breakdown agent claims breakdown request
3. Agent explores codebase, reads original task
4. Agent creates breakdown document with subtasks
5. Human reviews and approves breakdown
6. Subtasks created and enqueued
7. Original task marked as completed (split into subtasks)

**Re-breakdown limits:**
- Max depth: 1 (can re-break a task once)
- After depth 1: escalate to human (task too complex for auto-breakdown)

**v1.x Agent:** `breakdown-agent` (breakdown role, 60s interval, claims from breakdown queue)

### v2.0 Requirements

**Essential:**
- [ ] Breakdown queue (tasks awaiting decomposition)
- [ ] Breakdown agent role (explores codebase, creates subtasks)
- [ ] Breakdown document storage (file or DB record)
- [ ] Breakdown approval workflow (human gate)
- [ ] Auto-enqueue subtasks after approval
- [ ] Mark original task as completed-via-breakdown
- [ ] Preserve context chain (subtasks link back to parent)

**Burnout integration:**
- [ ] Automatic breakdown trigger (0 commits + 80+ turns)
- [ ] Re-breakdown depth tracking (prevent infinite loops)
- [ ] Depth limit enforcement (max 1 re-breakdown)

**Questions for Octopoid team:**
1. Is breakdown role supported in v2.0?
2. If not, what extension points exist for custom roles?
3. How should breakdowns be stored? (files vs DB records)
4. Can tasks track breakdown_depth metadata?

---

## 5. Gatekeeper System

### Current v1.x Implementation

**Purpose:** Automated code review before merging

**Agents (all paused in v1.x):**
- `gk-architecture` - Review architectural concerns
- `gk-testing` - Review test coverage and quality
- `gk-qa` - Review user-facing functionality

**Process:**
1. Task reaches provisional queue
2. Gatekeeper agents run checks (architecture, testing, QA)
3. Each check produces: approve, reject, or skip
4. Task needs all required checks to pass
5. After max_rejections (3), task escalates to human

**Database schema:**
```sql
-- Tasks table
tasks.checks TEXT  -- comma-separated check names (e.g., "architecture,testing,qa")
tasks.check_results TEXT  -- JSON: {"architecture": "approved", "testing": "rejected", ...}
tasks.rejection_count INTEGER  -- increments on reject, caps at max_rejections

-- Reviews table
CREATE TABLE reviews (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    reviewer TEXT,  -- agent name or "human"
    check_name TEXT,  -- "architecture", "testing", "qa"
    verdict TEXT,  -- "approved", "rejected", "skipped"
    feedback TEXT,
    reviewed_at TIMESTAMP
);
```

**v1.x Status:** Partially implemented
- Gatekeeper role exists in Python
- Database schema exists
- Agents are paused (not actively running)
- Manual fallback: `/approve-task`, `/reject-task`

### v2.0 Requirements

**Essential:**
- [ ] Gatekeeper agent role (exists in v2.0 - saw gatekeeper.ts with 225 lines)
- [ ] Multi-check support (task requires N checks: architecture, testing, QA)
- [ ] Check results tracking (per-task, per-check verdicts)
- [ ] Rejection limit (max 3 rejections → escalate)
- [ ] Feedback loop (rejected tasks get feedback, return to implementer)

**Questions for Octopoid team:**
1. Does v2.0 gatekeeper.ts support multi-check workflow?
2. How are check names configured? (per-task or global config)
3. Is rejection_count tracked?
4. Can multiple gatekeeper agents run in parallel (architecture + testing + QA)?

**Verification needed:**
- Check if v2.0 gatekeeper.ts has multi-check support (not just single approve/reject)
- Check if rejection limits are implemented

---

## 6. Additional Baseline Requirements

These are features v1.x has that v2.0 must support or provide extension points for:

### Agent Worktree Model ⚠️

**v1.x mistake (agent-specific):**
```
.orchestrator/agents/
├── impl-agent-1/worktree/  # ❌ Worktree per agent
├── impl-agent-2/worktree/  # ❌ Multiple agents share nothing
```

**v2.0 requirement (task-specific):**
```
.octopoid/tasks/
├── abc12345/worktree/  # ✅ Worktree per task
└── def67890/worktree/  # ✅ Ephemeral, deleted after completion
```

**Why:** Task-specific worktrees allow:
- Multiple agents can work different tasks in parallel
- Worktree lifecycle = task lifecycle (ephemeral)
- No cleanup of stale agent worktrees
- Clearer debugging (task-centric, not agent-centric)

### Logging Architecture ⚠️

**v1.x recently added (Feb 2026):**
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
- **Task logs:** Debugging specific task failures (all execution history)
- **Agent logs:** Debugging agent behavior (cross-task patterns)

**Requirements:**
- [ ] Per-task logs (`.octopoid/logs/tasks/<task-id>.log`)
- [ ] Per-agent logs (`.octopoid/logs/agents/<agent-name>.log`)
- [ ] Both must exist and be clearly separated
- [ ] Task logs survive task completion (for postmortem analysis)

### Turn Counting ⚠️

**Critical metric:** `tasks.turns_used` (number of Claude API calls)

**Why critical:**
- Burnout detection (0 commits + 80+ turns = breakdown needed)
- Cost tracking (agent efficiency)
- Task estimation (predict future task complexity)
- Debugging (high turns without commits = stuck agent)

**Requirements:**
- [ ] Every agent invocation increments turns_used
- [ ] Stored in task record (persisted to DB)
- [ ] Visible in status reports
- [ ] Used for burnout heuristic

**Question:** Does v2.0 track turns_used automatically or must agents report it?

### Agent Notes ⚠️

**Current status:** Prompts mention notes, but agents don't write them

**Expected behavior:**
- Agents write execution notes during work
- Notes include: approach taken, obstacles, decisions
- Notes survive task completion (debugging aid)

**Questions:**
- Are agents actually writing notes in v1.x? (needs verification)
- Where stored: in task file or separate notes directory?
- Does v2.0 support agent notes?

**Verification needed:**
```bash
# Check if any agent has written notes
find .orchestrator/agents -name "notes.md" -exec cat {} \;
find .orchestrator/shared/notes -type f
```

---

## 7. Slash Commands

### Overview

Octopoid should provide slash commands for all major operations. Commands should use `octo:` prefix for clarity and discoverability.

**Namespacing rationale:**
- Clear separation from app-specific commands
- Easy discovery (`/octo:<tab>` shows all orchestrator commands)
- Future-proof (can add `test:`, `deploy:` namespaces later)
- Clean API mapping (`/octo:create-task` → `octo.tasks.create()` → `octopoid task create`)

### Task Management Commands

| v2.0 Command | v1.x Reference | Purpose |
|--------------|----------------|---------|
| `octo:create-task` | `/enqueue`, `/create-task` | Create new task (interactive or scripted) |
| `octo:approve` | `/approve-task` | Approve and merge task |
| `octo:reject` | `/reject-task` | Reject task with feedback |
| `octo:reset-task` | `/reset-task` | Reset task to incoming queue |
| `octo:hold` | `/hold-task` | Park task in escalated queue |
| `octo:retry-failed` | `/retry-failed` | Retry tasks from failed queue |
| `octo:breakdown` | `/decompose-task` | Request task breakdown |
| `octo:qa` | `/qa-check` | Run visual QA check on task |
| `octo:record-check` | `/record-check` | Record gatekeeper check result |

**Implementation notes:**
- `octo:create-task` should support both interactive mode (prompts for details) and scripted mode (all args provided)
- `octo:approve` should handle both regular tasks and orchestrator-specific tasks (if that distinction remains in v2.0)
- `octo:reject` should append feedback to task and increment rejection counter
- `octo:retry-failed` should support selecting specific tasks or retrying all

### Status & Monitoring Commands

| v2.0 Command | v1.x Reference | Purpose |
|--------------|----------------|---------|
| `octo:status` | `/orchestrator-status` | Comprehensive system status |
| `octo:queue` | `/queue-status` | Queue state (incoming, claimed, provisional, etc.) |
| `octo:agents` | `/agent-status` | Agent states and activity |
| `octo:today` | `/today` | Today's activity summary |
| `octo:next` | `/whats-next` | Surface actionable items |
| `octo:audit` | `/audit-completions` | Audit task completions for issues |

**Implementation notes:**
- `octo:status` should be the comprehensive "everything at a glance" view (like v1.x status.py script)
- `octo:queue` should show counts and task lists per queue
- `octo:agents` should show agent state, current task, last run time
- `octo:today` should aggregate activity: tasks completed, commits made, PRs merged
- `octo:next` should surface: PRs awaiting review, tasks awaiting approval, inbox items

### Agent Management Commands

| v2.0 Command | v1.x Reference | Purpose |
|--------------|----------------|---------|
| `octo:add-agent` | `/add-agent` | Add new agent to configuration |
| `octo:pause-agent` | `/pause-agent` | Pause/resume specific agent |
| `octo:pause` | `/pause-system` | Pause/resume entire system |
| `octo:kill-agent` | `/kill-agent` | Kill specific agent process |
| `octo:kill-all` | `/kill-all-agents` | Kill all agent processes |

**Implementation notes:**
- `octo:pause-agent` should toggle paused state in config
- `octo:pause` should set global pause flag (scheduler exits immediately)
- `octo:kill-agent` and `octo:kill-all` may not be needed if v2.0 agents are ephemeral (API-driven, no persistent processes)

**Question:** Does v2.0 have persistent agent processes that need killing, or are agents ephemeral (spawn, work, exit)?

### Configuration Commands

| v2.0 Command | v1.x Reference | Purpose |
|--------------|----------------|---------|
| `octo:tune-intervals` | `/tune-intervals` | Adjust agent wake intervals |
| `octo:tune-limits` | `/tune-backpressure` | Adjust queue limits |

**Implementation notes:**
- `octo:tune-intervals` edits agent config (interval_seconds field)
- `octo:tune-limits` edits queue config (max_incoming, max_claimed, max_open_prs)
- Both should validate new values before applying

### Command-to-API Mapping

Commands should map cleanly to SDK and CLI:

```
Slash Command          TypeScript SDK                  CLI
─────────────────────  ──────────────────────────────  ─────────────────────────────
/octo:create-task      octo.tasks.create()             octopoid task create
/octo:approve          octo.tasks.approve()            octopoid task approve
/octo:queue            octo.queue.status()             octopoid queue status
/octo:status           octo.status.comprehensive()     octopoid status
/octo:agents           octo.agents.list()              octopoid agents list
/octo:pause            octo.system.pause()             octopoid pause
```

### Commands to Deprecate

These v1.x commands should likely be removed or consolidated in v2.0:

| v1.x Command | Reason | v2.0 Replacement |
|--------------|--------|------------------|
| `/check-orchestrator-task` | Specific to v1.x submodule complexity | Fold into `octo:approve` or remove |
| `/kill-agent`, `/kill-all-agents` | If v2.0 agents are ephemeral | Remove (no processes to kill) |
| `/audit-completions` | Specific to v1.x explorer agent bug | Remove if not needed |

### Missing from v2.0 (Need Implementation)

If these features are planned, commands will be needed:

- `octo:project-create` - Create new project
- `octo:project-status` - Show project progress
- `octo:breakdown-approve` - Approve breakdown
- `octo:breakdown-reject` - Reject breakdown
- `octo:draft` - Create draft (covered in section 1)
- `octo:drafts` - List drafts (covered in section 1)
- `octo:process-draft` - Process draft (covered in section 1)

---

## 8. CLAUDE Configuration File

### Interactive Session Role Definition

**v1.x Implementation:**

Boxen uses a gitignored `CLAUDE.local.md` file that is symlinked to the version-controlled source:

```bash
# Symlink (gitignored)
CLAUDE.local.md → project-management/claude-interactive-role.md
```

This allows:
- Version-controlled session configuration (`claude-interactive-role.md` is committed)
- Immediate effect when editing source (symlink stays valid)
- Project-specific Claude Code behavior (PM role, workflow rules, etc.)

**File structure:**
```markdown
<!-- CLAUDE.local.md is a symlink to this file. -->
<!-- Editing this file directly updates the Claude Code interactive session config. -->

# Interactive Session Role: Project Manager

You are a project manager for Boxen...

## What You Know
- How to operate Octopoid (the orchestrator)
- Slash commands: /queue-status, /agent-status, /enqueue...
...
```

### v2.0 Requirements

When Octopoid initializes a project, it should:

1. **Create the source file:**
   ```
   project-management/claude-interactive-role.md
   ```

2. **Populate with Octopoid template:**
   ```markdown
   <!-- CLAUDE.local.md should be a symlink to this file. -->
   <!-- To activate: ln -s project-management/claude-interactive-role.md CLAUDE.local.md -->
   <!-- DO NOT edit CLAUDE.local.md directly - edit this file instead. -->
   <!-- Changes here automatically apply to Claude Code sessions via the symlink. -->

   # Interactive Session Role: Project Manager

   You are a project manager for this project. You help move the project along
   but do not write code directly. Instead, you plan work, create tasks for
   agents, and review their output.

   ## What You Know

   - How to operate Octopoid (the orchestrator)
   - The project management directory (`project-management/`)
   - Slash commands: `octo:create-task`, `octo:queue`, `octo:status`, etc.
   - Run `/list-skills` to show all available commands

   ## Default Behavior

   - Proactively offer work that can be done with the user
   - When asked to do work, default to planning it in a draft, then enqueue for an agent
   - Focus on creating tasks that can be performed by another agent

   [Additional sections: Queue Operations, Creating Tasks, Reviewing Work, etc.]
   ```

3. **Print setup instructions:**
   ```
   Created project-management/claude-interactive-role.md

   To activate Claude Code integration, create a symlink:
     ln -s project-management/claude-interactive-role.md CLAUDE.local.md

   (Windows: copy the file instead, but note you'll need to sync changes manually)

   Add to .gitignore if not already present:
     echo "CLAUDE.local.md" >> .gitignore
   ```

### Rationale

**Why create source file but not symlink?**
- Less invasive (don't touch root-level files)
- User might not want PM role (different workflow)
- User might already have CLAUDE.local.md
- User chooses when to activate (opt-in)
- Platform compatibility (Windows doesn't support symlinks well)

**Why in project-management/?**
- Centralized with other PM tooling
- Visible in version control
- Discoverable alongside drafts, projects, tasks
- Clear that it's part of project management infrastructure

**Why instructions header?**
- Shows user how to activate
- Explains the symlink relationship
- Prevents confusion about which file to edit

### Questions for Octopoid Team

1. Should `octopoid init` create this file automatically? (We think yes)
2. Should there be a template library? (PM role, solo developer role, etc.)
3. Should `octopoid init` check if file already exists and skip/merge?
4. Should the template be customizable during init? (e.g., `octopoid init --role pm`)

---

## 9. Migration Priorities

### Must-Have (v2.0 launch blockers)

1. **Task API** - Create, claim, update, complete tasks via REST API
2. **Lease-based claiming** - Prevent zombie claims (auto-expire leases)
3. **Task-specific worktrees** - Fix v1.x agent-specific mistake
4. **Turn counting** - Track turns_used per task
5. **Logging separation** - Per-task and per-agent logs
6. **Dependencies** - blocked_by field, auto-unblock
7. **Gatekeeper role** - Code review before merge

### Should-Have (v2.0 post-launch)

8. **Breakdowns** - Decompose burned-out tasks
9. **Needs continuation** - Resume partial work
10. **Agent notes** - Execution notes in task records
11. **Projects** - Multi-task grouping
12. **Drafts** - Idea → task promotion workflow

### Nice-to-Have (future iterations)

13. **Proposal system** - (currently merged into drafts)
14. **Postmortems** - Process failure analysis (separate system for now)
15. **Inboxes** - Human review queue (defer for now)

---

## 10. Open Questions for Octopoid Team

### Critical (must answer before migration)

1. **Turn counting:** Does v2.0 automatically track turns_used or must agents report it?
2. **Worktree model:** Does v2.0 use task-specific worktrees? (not agent-specific)
3. **Logging:** Are per-task and per-agent logs both supported and separated?
4. **Gatekeeper:** Does v2.0 gatekeeper support multi-check workflow?
5. **Dependencies:** Does v2.0 auto-unblock tasks when dependencies complete?

### Important (affects workflow design)

6. **Breakdowns:** Is breakdown role supported? If not, what extension points exist?
7. **Needs continuation:** Is this queue type supported?
8. **Agent notes:** Where do agents write execution notes? (task file vs separate storage)
9. **Burnout detection:** Does v2.0 have auto-breakdown on burnout?
10. **Projects:** Does v2.0 support project entities?

### Nice-to-know (planning future work)

11. **Drafts storage:** Should drafts be files or DB records?
12. **Domain separation:** How to separate boxen vs octopoid drafts?
13. **Task templates:** Does v2.0 support role-based task templates?
14. **Bulk operations:** Does v2.0 API support bulk accept/reject/retry?

---

## 11. Next Steps

1. **Verify v1.x baseline:**
   - [ ] Check if agents are writing notes (find .orchestrator -name "notes.md")
   - [ ] Check if turn counting works (review task records in DB)
   - [ ] Confirm per-task logs exist (recent addition, needs verification)

2. **Review v2.0 code:**
   - [ ] Read gatekeeper.ts - does it support multi-check workflow?
   - [ ] Read base-agent.ts - does it track turns?
   - [ ] Read queue-utils.ts - what queue types exist?
   - [ ] Read git-utils.ts - task-specific or agent-specific worktrees?

3. **Prepare feedback for Octopoid team:**
   - [ ] Answer open questions from v2.0 code review
   - [ ] Create GitHub issues for missing features
   - [ ] Propose extension points for custom roles (breakdown, etc.)

4. **Plan Boxen-specific extensions:**
   - Features v2.0 won't have that we'll implement ourselves
   - Custom scripts, commands, workflows
   - Integration with Boxen app development

---

## Appendix: v1.x Feature Usage

### Heavily Used
- Tasks (incoming, claimed, provisional, done queues)
- Agent claiming and execution
- Manual approval/rejection (`/approve-task`, `/reject-task`)
- Status reporting (`/orchestrator-status`)
- Turn counting (burnout detection)

### Moderately Used
- Breakdowns (for burned-out tasks)
- Drafts (idea capture)
- Dependencies (blocked_by field)
- Review worktree (human PR review)

### Lightly Used
- Projects (grouping multi-task initiatives)
- Gatekeepers (all paused, manual review instead)
- Proposals (recently merged into drafts)
- Needs continuation (exists but rarely populated)

### Not Used
- Agent notes (prompts mention it, agents don't write them)
- Queue manager (auto-fix queue health - paused)
- Curator (proposal curation - paused)

---

**Document Status:** Draft for review
**Feedback to:** Octopoid team
**Next Action:** Review v2.0 code to answer open questions
