# Entity Storage Model

**Status:** Discussion
**Captured:** 2026-02-09

## End State

Everything in the system follows one pattern: **file for content, DB for status.** Files don't move. Lifecycle transitions happen in the DB.

```
Entity      Content                                        Status
─────────   ────────────────────────────────────────────   ──────────────
Task        .orchestrator/shared/queue/TASK-<id>.md        tasks table
Draft       project-management/drafts/<domain>/<slug>.md   drafts table
Project     project-management/projects/<slug>.md          projects table
Agent       .orchestrator/agents/<name>.yaml               agents table
```

Files describe **what** something is. The DB tracks **where it is in its lifecycle.** No directory-based status. No file moves.

## Current State vs End State

### Tasks (partially there)

**Now:** Files move between `incoming/`, `claimed/`, `provisional/`, `done/`. The DB `queue` column mirrors the directory. Both must agree.

**End state:** Files stay in one directory. `queue` column is the only source of truth for lifecycle. File path is stored in DB at creation, never changes.

**Gap:** Queue directory structure is load-bearing — scheduler, agents, and scripts all glob directories to find files. Migration needs all consumers updated.

### Drafts (not started)

**Now:** Files in `project-management/drafts/{boxen|octopoid}/`. No DB tracking. Status is a text field in the markdown header. "Archiving" means `mv` to `archive/`. Proposals, recommendations, and proposed-tasks are separate concepts in separate directories — all doing the same thing.

**End state:** `drafts` table tracks lifecycle. File stays put forever. Proposals, recommendations, and agent suggestions are all just drafts with `author=<agent>`. One review flow for everything.

**Schema:**

```sql
CREATE TABLE drafts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'idea',    -- idea | discussion | proposed | approved | archived | rejected
    author TEXT NOT NULL,          -- 'human', 'draft-processor', agent name, etc.
    domain TEXT,                   -- 'boxen' | 'octopoid' | NULL
    file_path TEXT,                -- stays in one place forever
    created_at TEXT,
    updated_at TEXT,
    linked_task_id TEXT,           -- if this draft became a task
    linked_project_id TEXT,        -- if this draft became a project
    tags TEXT                      -- comma-separated
);
```

**What this replaces:**

| Current | Becomes |
|---|---|
| `proposals/active/` with own lifecycle | Drafts with `author=<agent>`, `status='proposed'` |
| `proposed-tasks/` (dead end) | Drafts with `author='draft-processor'`, `status='proposed'` |
| `agent-recommendations/` | Drafts with `author=<agent>` |
| `mv file archive/` | `UPDATE drafts SET status='archived'` |
| Status field in markdown header | DB `status` column |

### Projects (DB exists, no content files)

**Now:** `projects` table exists with status tracking (`draft->active->ready-for-pr->complete`). Tasks link via `project_id`. But no content files — project description is just a DB text field. 2 orphan YAML files in `.orchestrator/shared/projects/`.

**End state:** Each project has a markdown file at `project-management/projects/<slug>.md` with goal, context, and notes. DB tracks status and links tasks. `/create-project` writes file + DB row together.

**Gap:** Small. Just need the directory, the slash command, and visibility in status script.

### Agents (monolith YAML, no DB)

**Now:** All 17 agents in a single `agents.yaml`. Mixes static config (name, role) with dynamic state (paused, interval, last_run).

**End state:** Each agent has its own file at `.orchestrator/agents/<name>.yaml` (static config). Dynamic state (paused, interval, current_task) lives in DB.

**Gap:** Scheduler reads `agents.yaml` — needs to scan directory instead. Dynamic state needs a table or columns.

## Groundwork (do now, non-disruptive)

These tasks make the current system fit the end-state pattern without breaking anything:

### 1. Directory consolidation (11 -> 6)

Move stale content, delete empty directories:

| Directory | Action |
|---|---|
| `awaiting-clarification/` (17 items) | Move to `drafts/boxen/`, register in DB later |
| `agent-recommendations/` (1 item) | Move to `drafts/boxen/` |
| `classified/` (4 items) | Features to `drafts/boxen/`, photos to `archive/` |
| `audits/` (1 item) | Move to `archive/` |
| `processed/` (11 items) | Move to `archive/processed-photos/` |

Result:

```
project-management/
  agent-inbox/       # Input: items for inbox-poller
  human-inbox/       # Output: messages from agents to human
  drafts/            # All ideas, plans, specs (boxen/, octopoid/)
  projects/          # Project content files (NEW)
  archive/           # Completed/superseded material
  postmortems/       # Failure analysis
  scripts/           # Utilities
```

### 2. Add `drafts` table + register existing files

Add the table. Scan `project-management/drafts/` and register every file. Infer author from content where possible, default to `human`. This is pure additive — doesn't change how drafts work yet, just makes them queryable.

### 3. Update `/draft-idea` to insert DB row

When creating a draft, also insert into the DB. Existing drafts still work without DB rows (graceful degradation during migration).

### 4. Create `project-management/projects/` directory

Write content files for any existing DB projects. Add to status script output.

## The Big Project

A project (in the orchestrator sense) that migrates the full system to the entity model. Runs until complete, doesn't disrupt daily work because each task is backward-compatible.

### Phase 1: Drafts (new system, clean slate)

1. `drafts` table + migration
2. Register existing files in DB
3. `/draft-idea` inserts DB row
4. `/review-drafts` queries DB (replaces proposed-tasks review)
5. Draft-processor uses DB status instead of file moves
6. Kill `proposals/`, `proposed-tasks/`, `agent-recommendations/` directories

### Phase 2: Projects (extend what exists)

1. `/create-project` writes file + DB row
2. Project visibility in status script + dashboard
3. Project-level branching (TASK-c2a0adc3 — done)
4. `ready-for-pr` triggers final merge

### Phase 3: Agents (split config)

1. Split `agents.yaml` into per-agent files
2. Add description, invoked_by fields
3. Move dynamic state to DB
4. Scheduler scans directory instead of reading monolith

### Phase 4: Tasks (biggest migration, last)

1. Add `file_path` column to tasks table
2. Stop moving files between queue directories
3. All queue membership determined by DB `queue` column only
4. Update all consumers (scheduler, agents, scripts, slash commands)

### Dependencies

```
Phase 1 (Drafts) ──────────────────> can start immediately
Phase 2 (Projects) ────────────────> can start immediately (independent)
Phase 3 (Agents) ──────────────────> can start immediately (independent)
Phase 4 (Tasks) ───────────────────> depends on nothing, but highest risk — do last
```

All phases are independent except Phase 4 which should go last because it touches the most consumers.

## Open Questions

- Should `drafts` table have a `priority` column, or is that only for tasks?
- Do we need an ordering mechanism within the same status? (e.g., position field)
- How aggressive to be with Phase 4? Task file movement is deeply embedded.
