# Project & Breakdown System

**Date:** 2026-02-05
**Status:** Draft

## Intent

**Core idea:** Separate discussion from execution. Interactive sessions are for steering (discussing, deciding, reviewing). Async agents do the actual work.

**Key workflow:**
1. Discuss something → create a draft
2. Promote draft → either a **project** (big) or **task** (small)
3. If too large → breakdown queue → dedicated agent decomposes it
4. Agents execute asynchronously while user does other things
5. User reviews results (PRs, completed work) when ready

**Why a dedicated breakdown agent:**
- Enforces consistency (same rules every time)
- Tests-first approach always applied
- Architecture considered before implementation
- Tasks right-sized for completion
- Not dependent on whoever happens to be working

## Problem

Current orchestrator treats every piece of work as a standalone task:
- One task = one branch = one PR
- Complex features require multiple coordinated tasks
- Task breakdown quality varies depending on who/when
- User waits at interactive prompt while work happens

## Goals

1. **Defer to async**: Interactive sessions for discussion/decisions, agents for execution
2. **Consistent breakdown**: Dedicated agent applies same rules every time
3. **Project coherence**: Related tasks share branch, produce single PR
4. **Right-sized tasks**: Large work gets decomposed before implementation

## Concepts

### Project

A project is a container for related tasks that together deliver a feature.

```yaml
# .orchestrator/shared/projects/PROJ-fillet-all-corners.yaml
id: PROJ-fillet-all-corners
title: "Add fillet support for all panel corners"
status: active  # draft | active | complete | abandoned
branch: feature/fillet-all-corners
base_branch: main
created: 2026-02-05T10:00:00
created_by: human

# Tasks are tracked separately, linked by project_id
```

**Project lifecycle:**
```
draft → active → (tasks complete) → ready-for-pr → complete
                                          ↓
                              PR created and merged
```

### Task (enhanced)

Tasks gain optional project linkage:

```markdown
# [TASK-abc123] Implement corner eligibility

PROJECT: PROJ-fillet-all-corners   # Links to parent project
ROLE: implement
PRIORITY: P2
BRANCH: feature/fillet-all-corners  # Inherited from project
BLOCKED_BY: TASK-xyz789             # Dependency within project
```

### Breakdown Queue

New queue for work that needs decomposition before implementation:

```
.orchestrator/shared/queue/
├── incoming/        # Ready for implementation
├── breakdown/       # Needs decomposition first  ← NEW
├── claimed/
├── provisional/
└── done/
```

## Workflow

### 1. Interactive Discussion → Draft

```
User: "Let's add fillet support for all corners"
Claude: [discusses approach, tradeoffs, scope]
Claude: "Want me to create a project draft for this?"
User: "Yes"
Claude: Creates project-management/drafts/fillet-all-corners.md
```

### 2. Promote Draft → Project or Task

```
User: "/promote fillet-all-corners"
Claude: "This looks like a multi-task effort. Create as project?"
User: "Yes"
```

Creates:
- Project record in `.orchestrator/shared/projects/`
- Feature branch `feature/fillet-all-corners`
- Initial task in `breakdown/` queue

### 3. Breakdown Agent Processes

Breakdown agent claims from `breakdown/` queue:

```
Input: Project or large task
Output:
  - Multiple right-sized tasks in incoming/
  - Dependency map (BLOCKED_BY relationships)
  - Testing task always first
```

### 4. Implementation Agents Execute

Implementer agents work through tasks in dependency order:
- All work on same branch (project branch)
- Each task = one commit or small set of commits
- No individual PRs - work accumulates on branch

### 5. Project Completion → Single PR

When all tasks done:
- PR coordinator creates single PR for project branch
- PR description aggregates all task summaries
- Review covers entire feature

## Breakdown Agent

### Role Definition

```yaml
# In agents.yaml
- name: breakdown-agent
  role: breakdown
  interval_seconds: 60
  pre_check: "ls -A .orchestrator/shared/queue/breakdown/ 2>/dev/null | grep -v .gitkeep | head -1"
  pre_check_trigger: non_empty
```

### Breakdown Rules

Codified in `.orchestrator/prompts/breakdown.md`:

```markdown
## Task Breakdown Rules

### Sizing
- Tasks should be completable in <30 Claude turns
- If unsure, err toward smaller tasks
- One clear objective per task

### Ordering
1. Testing strategy task FIRST (what to test, how)
2. Schema/type changes early (others depend on them)
3. Core logic before UI wiring
4. Integration tests after implementation

### Dependencies
- Explicitly map with BLOCKED_BY
- Minimize dependency chains (parallel where possible)
- Shared utilities identified and scheduled first

### Documentation
- Each task gets clear acceptance criteria
- Note architectural decisions
- Flag tasks needing human input

### Branch Strategy
- All tasks in project use project branch
- Note if task needs different base (rare)
```

### Breakdown Output Example

Input: "Add fillet support for all panel corners"

Output tasks:
```
TASK-001: Define testing strategy for fillet feature
  BLOCKED_BY: none

TASK-002: Add allCornerFillets schema to engine types
  BLOCKED_BY: TASK-001

TASK-003: Implement corner eligibility calculation
  BLOCKED_BY: TASK-002

TASK-004: Wire allCornerFillets to panel outline generation
  BLOCKED_BY: TASK-003

TASK-005: Create fillet tool UI palette
  BLOCKED_BY: TASK-003

TASK-006: Add integration tests for fillet application
  BLOCKED_BY: TASK-004, TASK-005
```

## Routing Logic

When work enters the system:

```
New work arrives
      ↓
Is it well-scoped? (clear, <30 turns estimated)
      ↓
  YES → incoming/ (direct to implementation)
  NO  → breakdown/ (needs decomposition)
      ↓
Is it multi-task?
      ↓
  YES → Create Project first, then breakdown
  NO  → Just breakdown into smaller tasks
```

## Integration with Current System

### Database Schema Additions

```sql
-- Projects table
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'draft',
    branch TEXT,
    base_branch TEXT DEFAULT 'main',
    created_at TEXT,
    created_by TEXT
);

-- Tasks gain project_id
ALTER TABLE tasks ADD COLUMN project_id TEXT REFERENCES projects(id);
```

### New Slash Commands

| Command | Purpose |
|---------|---------|
| `/create-project` | Create project from current discussion |
| `/promote` | Promote draft to project or task |
| `/project-status` | Show project and its tasks |
| `/send-to-queue` | Send current discussion to breakdown queue |

### File Locations

```
.orchestrator/shared/
├── projects/              # Project definitions (NEW)
│   └── PROJ-*.yaml
├── queue/
│   ├── breakdown/         # Needs decomposition (NEW)
│   └── ... existing ...
```

## Quick Wins (Implement First)

1. **`/send-to-queue` command**: Capture discussion, create task, exit interactive wait
2. **`breakdown/` queue**: New directory, manual promotion for now
3. **Project YAML format**: Define schema, manual creation initially

## Full Implementation (Later)

1. Breakdown agent with codified rules
2. Project lifecycle management
3. Automatic PR creation when project completes
4. Database schema for projects

## Open Questions

1. **Project branch creation**: Automatic on project activation, or manual?
2. **Breakdown failure**: What if breakdown agent can't decompose? Flag for human?
3. **Mid-project changes**: How to handle scope changes to active projects?
4. **Cross-project dependencies**: Tasks in different projects that depend on each other?

## Success Metrics

- Reduced time user spends waiting at interactive prompt
- More consistent task sizing (measure turn counts)
- Fewer "lying agent" incidents (better scoped = more completable)
- Single coherent PRs for features instead of PR chains
