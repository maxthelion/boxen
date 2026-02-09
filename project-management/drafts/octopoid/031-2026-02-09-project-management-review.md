# Holistic Project Management Review

**Status:** Discussion
**Captured:** 2026-02-09

## Raw

> Handwritten notes reviewing the full project management lifecycle: ideas to drafts, draft processing, projects with dependencies, roadmap, proposer recommendations, and backlog ordering.

## Current State Assessment

### 1. Ideas -> Drafts -> Actionable Work

**Pipeline:**
```
/draft-idea -> project-management/drafts/{boxen|octopoid}/
    | (draft-processor, 12h, >3 days old)
    v
project-management/drafts/proposed-tasks/   <-- DEAD END
    | (no automated flow)
    v
??? (manual /enqueue only)
```

**What works:**
- `/draft-idea` captures ideas with structured format (status, captured date, raw quote, context, open questions)
- Draft-processor archives stale drafts, extracts proposed tasks, sends inbox summaries
- `/enqueue` creates tasks directly when human is present

**What's broken:**
- Proposed-tasks directory is a dead end — no review command, no approval flow, no agent reads them
- When human IS present, the draft pipeline is bypassed entirely (straight to `/enqueue`)
- When human is NOT present, ideas can only become proposed-tasks, which go nowhere

### 2. Projects

**Infrastructure (exists but ~10% utilized):**
- DB `projects` table: id, title, description, status (draft->active->ready-for-pr->complete), branch, base_branch
- Tasks link to projects via `project_id` foreign key
- `check_project_completion()` auto-transitions to `ready-for-pr` when all tasks done
- 2 orphan YAML files in `.orchestrator/shared/projects/`

**What a project should contain:**
- Single feature branch
- Multiple tasks with dependencies
- A PR created at the end when all tasks complete

**What's missing:**
- No `/create-project` command
- No visibility in status script or dashboard
- No agent manages project lifecycle
- "PR at the end" workflow doesn't exist — `ready-for-pr` status is set but nothing acts on it
- No way to see "all tasks for project X" except raw DB queries

### 3. Dependencies

**What works (~70%):**
- `blocked_by` field (comma-separated task IDs) in DB
- Dependencies created during breakdown (via `depends-on: #1` notation)
- Dependencies rewired when tasks are recycled (`_rewire_dependencies()`)
- Scheduler skips blocked tasks during claiming

**Gaps:**
- No visibility — no command to list blocked tasks or view dependency graph
- No cleanup — tasks blocked by done/failed tasks stay blocked forever (stale blocker detection added to status.py but doesn't auto-fix)
- No manual dependency creation command
- No deadlock detection

### 4. Roadmap

**What exists:**
- `project-management/drafts/octopoid/octopoid-roadmap.md` — living document with philosophy scorecard, known issues, near/medium/long-term priorities

**What's missing:**
- Completely disconnected from task system
- No "this task implements roadmap item X" linking
- No progress tracking beyond manual document updates
- Proposers don't reference roadmap for prioritization

### 5. Proposers and Recommendations

**Infrastructure (exists but ~5% utilized):**
- 6 proposer agents defined, only 2 active (inbox-poller, draft-processor)
- Full proposal lifecycle: active -> promoted -> deferred -> rejected
- Curator agent exists (paused) — designed to score and promote proposals
- Backpressure limits configured for all proposers

**Fragmentation problem:**
- Recommendations scattered across 3+ directories:
  - `.orchestrator/shared/proposals/active/` (5 proposals sitting)
  - `project-management/agent-recommendations/`
  - `project-management/classified/`
  - `project-management/drafts/proposed-tasks/`
- No unified review queue

**Why it stalled:**
- Curator paused — no one evaluates proposals
- Proposers generate ideas that pile up with no onward motion
- Draft-processor bypasses proposal system entirely (writes to proposed-tasks/ instead)

### 6. Backlog (Specced + Approved, but Ordered)

**Current state:** No explicit backlog concept.
- `incoming/` is the catch-all for all pending work
- Priority field (P0-P4) provides coarse ordering
- No distinction between "just created" and "approved, refined, ready"
- No explicit ordering within same priority level

**What's needed:**
- Either a formal `backlog` queue state, or an ordering mechanism within `incoming`
- A curated, prioritized queue of work that's been specced and signed off
- Connection to roadmap priorities

## Architecture Options

### Option A: Minimal — Fix the Dead Ends

Focus on making what exists actually flow:
1. **Proposed-tasks review command** — `/review-proposals` walks through proposed-tasks, approve -> enqueue or dismiss
2. **Stale blocker cleanup** — auto-unblock tasks when blocker is done
3. **Priority ordering** — add `position` field for explicit ordering within incoming

### Option B: Moderate — Activate Projects + Backlog

Build on Option A plus:
1. **`/create-project`** — creates project with branch, links tasks
2. **Project visibility** — status script shows project->task groupings
3. **Backlog state** — approved work goes to `backlog/` queue, implementers pull from there
4. **Roadmap -> Project linking** — roadmap items reference project IDs

### Option C: Full Pipeline — Activate Proposers + Curator

Build on Option B plus:
1. **Unpause curator** — evaluates proposals, promotes good ones
2. **Unpause architect + test-checker** — low-frequency recommendation agents
3. **Consolidate recommendation pools** — everything flows through proposals/
4. **Auto-task generation** — promoted proposals become backlog items

## Recommended Path

**Start with Option A** — it's 2-3 tasks and unblocks the current dead ends. The proposed-tasks review command alone would unlock 12 tasks that are already specced.

**Then Option B** — projects are the biggest structural gap. Being able to group tasks under a feature with a shared branch and end-to-end PR would change how we plan larger work.

**Option C can wait** — the proposer/curator system is elaborate but not critical. The human PM session (this one) is currently faster and more accurate than autonomous proposers.

## Open Questions

- Should proposed-tasks flow through the formal proposal system, or directly to queue with human approval?
- Is `backlog` a separate queue state, or just `incoming` with better ordering?
- Should projects own the feature branch, or should tasks still have individual branches?
- How much of this should be orchestrator_impl tasks vs done in interactive sessions?

## Possible Next Steps

- [ ] Build `/review-proposals` command (review and enqueue proposed-tasks)
- [ ] Add `/create-project` command
- [ ] Add project visibility to status script and dashboard
- [ ] Add `position` field for backlog ordering
- [ ] Clean up stale blockers automatically
- [ ] Consolidate recommendation directories
