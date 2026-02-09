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

## 7. Actionable Inbox

**Current state:** The inbox (`project-management/human-inbox/`) is notification-only. Agents write messages, human reads them, then has to manually act (run `/enqueue`, edit a draft, etc.). Messages are informational dead ends.

**What's needed:** Messages should carry structured actions. The human responds to an action inline, and a responder agent picks up the response and executes it.

### How It Would Work

```
Agent creates inbox message with actions
    ↓
Human reads message, responds to specific action
    ↓
Responder agent (periodic) checks for responses
    ↓
If response found → execute the action with human's input
    ↓
Mark action as resolved, archive message
```

### Message Format (proposed)

```markdown
# Draft Aging: 13 drafts processed

**From:** draft-processor
**Created:** 2026-02-09

## Actions

### ACTION-1: Clarify event sourcing snapshot frequency
**Type:** clarify
**Target:** project-management/archive/boxen/event-sourcing-proposal.md
**Question:** What checkpoint frequency? (proposed: every 10 commands)
**Response:** _awaiting_

### ACTION-2: Schedule visibility system fix
**Type:** enqueue
**Proposed task:** Fix visibility system UUID migration (P1, implement)
**Response:** _awaiting_
```

### Response Mechanism

Human responds by editing the `Response:` field:

```markdown
**Response:** every 10 commands is fine, go with that
```

or for an enqueue action:

```markdown
**Response:** yes, do it
```

or to dismiss:

```markdown
**Response:** skip
```

### Responder Agent

A lightweight agent (like the recycler) that periodically:
1. Scans inbox messages for actions where `Response:` is not `_awaiting_`
2. For each responded action, executes the action type:
   - **clarify** → updates the target document with the answer, removes the open question
   - **enqueue** → creates the task via `create_task()`
   - **approve** → runs approval flow
   - **update-draft** → edits the draft with provided content
   - **dismiss** → marks as resolved, no further action
3. Marks the action as `_resolved_` and archives the message when all actions are done

### Examples

**Draft-processor flags open questions:**
```
ACTION: Clarify event sourcing checkpoint frequency
Response: every 10 commands → responder updates draft, removes open question
```

**Proposer suggests a project:**
```
ACTION: Schedule "panel visibility fix" project
Response: do it → responder creates project, breaks down into tasks, enqueues
```

**Agent needs human decision:**
```
ACTION: Choose approach for X (option A vs option B)
Response: option A → responder creates task with option A specified in context
```

### Why This Matters

This is the missing glue between async agent work and human decision-making. Right now the bottleneck is: agent produces output → human has to context-switch to act on it manually → things pile up. With actionable inbox, the human's job reduces to answering questions and saying "yes/no" — the system handles the rest.

It also solves the proposed-tasks dead end: instead of writing to `proposed-tasks/`, the draft-processor writes inbox messages with `enqueue` actions. Human says "yes", responder creates the task. No new review command needed.

## 8. Directory Simplification

`project-management/` has 11 subdirectories with overlapping purposes. Several are artifacts of a one-time photo triage session (Feb 3) and have been dormant since.

### Current State

| Directory | Files | Purpose | Verdict |
|-----------|-------|---------|---------|
| `agent-inbox/` | 0 | Input queue for inbox-poller | **Keep** — active input |
| `agent-recommendations/` | 1 | Agents write recommendations here | **Remove** — redundant with proposals/drafts |
| `audits/` | 1 | One-off test coverage audit | **Remove** — just a report, belongs in drafts or archive |
| `awaiting-clarification/` | 17 | Items from photo triage needing human input | **Remove** — these are drafts with status "Awaiting Clarification" |
| `classified/` | 4 | Triaged items sorted by type (features, architectural, bugs) | **Remove** — one-time triage artifact |
| `drafts/` | 14+ | Ideas, plans, specs (boxen/, octopoid/, proposed-tasks/) | **Keep** — core workflow |
| `human-inbox/` | 8 | Messages from agents to human | **Keep** — active output |
| `processed/` | 11 | Source photos after triage complete | **Remove** — pure archive material |
| `postmortems/` | several | Failure analysis documents | **Keep** — distinct purpose |
| `archive/` | many | Completed/archived drafts | **Keep** — where done work goes |
| `scripts/` | several | Utility scripts | **Keep** |

### Proposed Consolidation

Move content, then delete the empty directories:

- **`awaiting-clarification/` (17 items)** → `drafts/boxen/` with status "Awaiting Clarification". They're just feature ideas that need input — same as any other draft.
- **`agent-recommendations/` (1 item)** → `drafts/boxen/`. Kill directory. Proposers should write to inbox or proposals system.
- **`classified/` (4 items)** → feature docs to `drafts/boxen/`, architectural jpegs to `archive/`. Kill directory.
- **`audits/` (1 item)** → `archive/`. Kill directory. Audits are just reports.
- **`processed/` (11 items)** → `archive/processed-photos/`. Source photos that have been triaged.

### After Cleanup

```
project-management/
  agent-inbox/       # Input: items for inbox-poller
  human-inbox/       # Output: messages from agents to human
  drafts/            # Active ideas and plans (boxen/, octopoid/)
  archive/           # Completed/superseded material
  postmortems/       # Failure analysis
  scripts/           # Utilities
```

Six directories instead of eleven. Simple rule: if it needs attention, it's a draft. If it's done, it's in archive.

## Open Questions

- Should proposed-tasks flow through the formal proposal system, or directly to queue with human approval?
- Is `backlog` a separate queue state, or just `incoming` with better ordering?
- Should projects own the feature branch, or should tasks still have individual branches?
- How much of this should be orchestrator_impl tasks vs done in interactive sessions?
- Actionable inbox: edit-in-place responses vs a simpler reply mechanism (e.g. `/respond ACTION-1 "yes, do it"`)?
- Should the responder agent be a new role, or a focus mode of an existing proposer?
- How to handle actions that need complex input (not just yes/no/short answer)?

## Possible Next Steps

- [ ] Build `/review-proposals` command (review and enqueue proposed-tasks)
- [ ] Add `/create-project` command
- [ ] Add project visibility to status script and dashboard
- [ ] Add `position` field for backlog ordering
- [ ] Clean up stale blockers automatically
- [ ] Consolidate project-management directories (11 → 6): migrate awaiting-clarification, agent-recommendations, classified, audits, processed into drafts/archive
- [ ] Design actionable inbox message format
- [ ] Build responder agent (scan inbox for responses, execute actions)
- [ ] Update draft-processor to write enqueue actions instead of proposed-tasks files
