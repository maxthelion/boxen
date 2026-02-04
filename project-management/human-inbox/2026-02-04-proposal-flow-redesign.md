# Proposal Flow Redesign

**Created:** 2026-02-04
**From:** Claude (planning session)
**Status:** Awaiting discussion

## Problem Statement

Current octopoid flow is fully autonomous:
```
Proposer → proposals/active/ → Curator (auto-approves) → Task Queue → Implementer
```

This bypasses human judgment. The curator is a Claude agent that automatically decides what work gets done.

**Desired:** Human approval before proposals become tasks.

## Design Goals

1. **Octopoid core should be generic** - no boxen-specific paths
2. **Proposers create proposals** - with backpressure rules (max active per proposer)
3. **Proposals sit in a "pending" state** - not auto-promoted
4. **Project-specific integration** decides how proposals get approved
5. **Curator only sees approved proposals** (or is removed entirely)

## Proposed Architecture

### Layer 1: Octopoid Core (submodule)

```
.orchestrator/shared/proposals/
├── pending/           # NEW: Proposals awaiting review
│   ├── architect/     # Per-proposer subdirectories
│   ├── test-checker/
│   └── ...
├── approved/          # Proposals approved for work
├── rejected/          # Rejected with feedback
└── completed/         # Done (promoted to task or closed)
```

**Proposer behavior:**
- Creates proposals in `pending/{proposer-name}/`
- Backpressure: max N pending proposals per proposer
- Does NOT write to `approved/` - that requires external action

**Curator behavior (simplified):**
- Only processes `approved/` directory
- Converts approved proposals to tasks
- No longer makes approval decisions - just task creation

### Layer 2: Boxen Integration

A new agent (or skill) surfaces pending proposals to human-inbox:

```
.orchestrator/shared/proposals/pending/
        ↓
"proposal-reviewer" agent (runs periodically)
        ↓
project-management/human-inbox/2026-02-04-pending-proposals.md
        ↓
Human reviews, approves/rejects
        ↓
Approved → .orchestrator/shared/proposals/approved/
Rejected → .orchestrator/shared/proposals/rejected/
```

### Human Inbox Format

```markdown
# Pending Agent Proposals

**Created:** 2026-02-04T10:00:00
**From Agent:** proposal-reviewer
**Proposals Found:** 3

## From: architect

### PROP-abc123: Split SketchView2D into smaller components

**Complexity:** M
**Summary:** The SketchView2D component is 800+ lines...

**Actions:**
- [ ] Approve → creates task
- [ ] Reject (provide reason)
- [ ] Defer (not now)

---

## From: test-checker

### PROP-def456: Add integration tests for fillet operation

**Complexity:** S
**Summary:** The fillet operation lacks integration tests...

**Actions:**
- [ ] Approve
- [ ] Reject
- [ ] Defer

---

Reply with decisions or use /review-proposals for interactive review.
```

## Alternative: Per-Proposer Human Inbox Items

Instead of batching all proposals, each proposer's proposals could go to human-inbox separately:

```
architect proposal → human-inbox/2026-02-04-architect-proposals.md
test-checker proposal → human-inbox/2026-02-04-test-proposals.md
```

**Pros:** Easier to review by category
**Cons:** More files to review

## Questions for Discussion

### 1. Proposal organization

**Option A:** Single `pending/` directory with all proposals
```
pending/
├── PROP-abc123.md  (from architect)
├── PROP-def456.md  (from test-checker)
```

**Option B:** Per-proposer subdirectories
```
pending/
├── architect/
│   └── PROP-abc123.md
├── test-checker/
│   └── PROP-def456.md
```

**Option C:** Per-category (not per-proposer)
```
pending/
├── refactor/
├── test/
├── feature/
```

### 2. What happens to the Curator?

**Option A:** Curator becomes task-creator only
- Only processes `approved/` directory
- Converts proposals to tasks (formatting, priority assignment)
- No approval authority

**Option B:** Remove Curator entirely
- Human approval goes directly to task queue
- `/approve-proposal` skill creates the task directly

**Option C:** Curator as optional accelerator
- Projects can enable auto-curation if they want autonomous mode
- Disabled by default (proposals sit in pending)

### 3. Proposal-reviewer agent vs skill

**Option A:** Dedicated agent that runs periodically
- Checks `pending/` directories
- Creates human-inbox summary
- Runs on interval (e.g., hourly)

**Option B:** Skill invoked manually
- `/review-proposals` shows pending and lets you approve/reject
- No automatic surfacing

**Option C:** Both
- Agent surfaces to human-inbox for async notification
- Skill for interactive review

### 4. Approval granularity

**Option A:** Approve individual proposals
- Each proposal approved/rejected separately
- More control, more friction

**Option B:** Batch approval by proposer
- "Approve all architect proposals"
- Less control, less friction

**Option C:** Trust levels per proposer
- High trust: auto-approve (current behavior)
- Medium trust: surface to human-inbox
- Low trust: require explicit approval

## Recommended Approach

Based on the goals:

1. **Per-proposer pending directories** (Option B in Q1)
   - Clean organization
   - Easy to apply different rules per proposer

2. **Curator as task-creator only** (Option A in Q2)
   - Keep the role but remove approval authority
   - Handles task formatting, priority, dependencies

3. **Both agent and skill** (Option C in Q3)
   - Agent for async notification
   - Skill for interactive review

4. **Individual approval with batch option** (hybrid of Q4)
   - Default: approve individually
   - Skill supports "approve all from X"

## Implementation Steps

### Phase 1: Octopoid core changes
1. Add `pending/` directory structure
2. Change proposers to write to `pending/{proposer}/`
3. Add `approved/` directory
4. Change curator to only read from `approved/`

### Phase 2: Boxen integration
1. Create `proposal-reviewer` agent prompt
2. Create `/review-proposals` skill
3. Create `/approve-proposal` skill (moves pending → approved)
4. Update human-inbox workflow

## Files to Modify

**Octopoid core:**
- `orchestrator/proposal_utils.py` - new directory structure
- `orchestrator/roles/proposer.py` - write to pending/{proposer}/
- `orchestrator/roles/curator.py` - only read approved/
- `orchestrator/config.py` - new path helpers

**Boxen local:**
- `.orchestrator/agents.yaml` - add proposal-reviewer agent
- `.orchestrator/prompts/proposal-reviewer.md` - new prompt
- `orchestrator/commands/` - new skills

---

**Ready to discuss. What's your take on the questions above?**
