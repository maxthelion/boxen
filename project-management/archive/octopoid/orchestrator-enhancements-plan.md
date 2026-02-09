# Orchestrator Enhancements Plan

## Instruction

Design a system where the PM doesn't look through the codebase for stuff to enqueue and instead looks at items that have been proposed. There should be other agents that only propose things, focusing on different stuff. Ideas include: test-checker - proposes improving tests, removing brittleness, highlighting gaps; architect - looks at potential for refactoring etc; application designer - thinks of functionality to build. Each of these would have a limit on how many things they can propose based on back pressure. There should be consideration of items that reduce complexity and allow more to be built. The PM should also look at the plans we've made, and suggest actionable tasks that meet our priorities. Consideration should also be given to larger projects that require multiple phases to accomplish. How do we manage projects with architectural dependencies? Which agent's voices are most important.

---

## Overview

Transform the orchestrator from a simple task queue into a **proposal-driven prioritization system** where specialized agents propose work and a PM agent curates and prioritizes based on project goals.

## Core Concept: Proposal → Curation → Execution

```
┌─────────────────────────────────────────────────────────────────┐
│                      PROPOSAL LAYER                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  Test    │  │Architect │  │ App      │  │ Plan     │        │
│  │ Checker  │  │          │  │ Designer │  │ Reader   │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       │             │             │             │               │
│       ▼             ▼             ▼             ▼               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   PROPOSAL QUEUE                         │   │
│  │  (backpressure-limited per agent type)                   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     CURATION LAYER                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    PM AGENT                               │   │
│  │  - Reviews proposals                                      │   │
│  │  - Checks against project priorities                      │   │
│  │  - Considers dependencies                                 │   │
│  │  - Scores and prioritizes                                 │   │
│  │  - Promotes to task queue OR rejects with reason          │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXECUTION LAYER                               │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    TASK QUEUE                            │    │
│  │  incoming → claimed → done/failed                        │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                       │
│  │Implementer│ │  Tester  │  │ Reviewer │                       │
│  └──────────┘  └──────────┘  └──────────┘                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Proposer Agents

### 1. Test Checker
**Focus:** Test quality and coverage

**Proposes:**
- Tests with high flakiness (based on CI history or heuristics)
- Missing test coverage for critical paths
- Tests that are too coupled to implementation details
- Missing integration tests for component boundaries
- Outdated test fixtures or mocks

**Explores:**
- `src/**/*.test.ts`, `src/**/*.spec.ts`
- CI logs if available
- Coverage reports
- Test execution times

### 2. Architect
**Focus:** Code structure and maintainability

**Proposes:**
- Refactoring opportunities (large files, deep nesting, code duplication)
- Architectural improvements (better separation of concerns)
- Dependency cleanup (circular deps, unnecessary coupling)
- Performance bottlenecks visible in code structure
- **Complexity reduction** - identifies code that, if simplified, would unblock other work

**Explores:**
- Module structure and imports
- File sizes and complexity metrics
- TODO/FIXME/HACK comments
- Code patterns that deviate from project conventions

### 3. Application Designer
**Focus:** User-facing functionality

**Proposes:**
- New features based on project roadmap
- UX improvements
- Missing functionality gaps
- Polish items (error messages, loading states, edge cases)

**Explores:**
- Existing plans in `docs/`
- Component structure
- User-facing code paths
- Comments indicating incomplete features

### 4. Plan Reader
**Focus:** Executing on documented plans

**Proposes:**
- Actionable tasks extracted from plan documents
- Next steps from in-progress plans
- Unblocked items when dependencies complete

**Explores:**
- `docs/plan_index.md`
- `docs/projects/`
- Plan documents with status `in-progress` or `draft`
- Project phase definitions

---

## Proposal Format

```markdown
# Proposal: {Title}

**Proposer:** test-checker | architect | app-designer | plan-reader
**Category:** test | refactor | feature | debt | plan-task
**Complexity:** S | M | L | XL
**Created:** {ISO8601}

## Summary
{1-2 sentence description}

## Rationale
{Why this matters, what problem it solves}

## Complexity Reduction
{Optional: How this unblocks or simplifies other work}

## Dependencies
{Optional: Other proposals or tasks this depends on}

## Blocked By
{Optional: What must be done first}

## Enables
{Optional: What this unblocks}

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Relevant Files
- path/to/file1.ts
- path/to/file2.ts
```

---

## PM Agent (Curator Role)

The PM no longer explores the codebase directly. Instead:

### Inputs
1. **Proposal queue** - All proposals from proposer agents
2. **Project priorities** - From `docs/projects/` and current project
3. **Plan documents** - From `docs/plan_index.md`
4. **Dependency graph** - What blocks what
5. **Current state** - What's in progress, what's completed

### Decision Framework

The PM scores each proposal on:

| Factor | Weight | Description |
|--------|--------|-------------|
| **Priority Alignment** | 30% | Does it match current project/phase goals? |
| **Complexity Reduction** | 25% | Does it simplify or unblock other work? |
| **Risk** | 15% | What's the blast radius if it goes wrong? |
| **Dependencies Met** | 15% | Are blockers resolved? |
| **Agent Trust** | 15% | Historical accuracy of proposer |

### Actions

For each proposal, PM can:
1. **Promote** → Move to task queue with priority
2. **Defer** → Keep in proposals, review later
3. **Reject** → Remove with documented reason
4. **Split** → Break into smaller proposals
5. **Merge** → Combine related proposals
6. **Request Clarification** → Ask proposer to elaborate

### Voice Weighting

Not all proposers are equal. Suggested weights:

| Proposer | Base Weight | Rationale |
|----------|-------------|-----------|
| Plan Reader | 1.5x | Executing documented plans is highest priority |
| Architect | 1.2x | Complexity reduction multiplies future velocity |
| Test Checker | 1.0x | Important but often not urgent |
| App Designer | 0.8x | New features after stability |

Weights can be configured per-project or per-phase:
- **Planning phase:** Plan Reader 2x, App Designer 1.5x
- **Implementation phase:** Plan Reader 1.5x, Architect 1.2x
- **Polish phase:** Test Checker 1.5x, App Designer 1.2x

---

## Multi-Phase Projects

### Project Structure

Projects with architectural dependencies use phases:

```markdown
# Project: Feature X

## Phase 1: Foundation
**Status:** Complete
**Enables:** Phase 2, Phase 3

Tasks:
- [x] Create base types
- [x] Set up infrastructure

## Phase 2: Core Implementation
**Status:** Active
**Depends On:** Phase 1
**Enables:** Phase 3

Tasks:
- [ ] Implement main logic
- [ ] Add basic tests

## Phase 3: Polish
**Status:** Blocked
**Depends On:** Phase 2

Tasks:
- [ ] Add advanced features
- [ ] Comprehensive testing
```

### Dependency Resolution

The PM maintains a dependency graph:

```
proposals/
├── dependency-graph.json    # Computed dependencies
└── blocked/                 # Proposals waiting on dependencies
```

When a task completes:
1. PM checks what it unblocks
2. Moves unblocked proposals to active consideration
3. Notifies relevant proposers

### Architectural Dependencies

Some proposals have hard dependencies:

```yaml
# In proposal metadata
depends_on:
  - type: proposal
    id: PROP-abc123
  - type: task
    id: TASK-def456
  - type: external
    description: "API v2 deployed"
```

PM won't promote until dependencies are met.

---

## Backpressure Per Proposer

Each proposer type has independent limits:

```yaml
# In agents.yaml
proposal_limits:
  test-checker:
    max_active: 5      # Max proposals in queue
    max_per_run: 2     # Max proposals per invocation
  architect:
    max_active: 3
    max_per_run: 1
  app-designer:
    max_active: 5
    max_per_run: 2
  plan-reader:
    max_active: 10     # Higher - these are pre-planned
    max_per_run: 3
```

When at limit, proposer skips its run or focuses on improving existing proposals.

---

## Directory Structure

```
.orchestrator/
├── agents.yaml
├── shared/
│   ├── proposals/           # NEW: Proposal queue
│   │   ├── active/          # Proposals under consideration
│   │   ├── deferred/        # Proposals to revisit later
│   │   ├── rejected/        # Rejected with reasons
│   │   └── promoted/        # Promoted to tasks (archive)
│   ├── queue/               # Existing task queue
│   │   ├── incoming/
│   │   ├── claimed/
│   │   ├── done/
│   │   └── failed/
│   └── state/
│       ├── dependency-graph.json
│       └── agent-scores.json  # Trust scores per proposer
└── messages/
```

---

## Generic vs Domain-Specific

### What belongs in orchestrator (generic)

- Proposal queue structure and lifecycle
- PM curation workflow and scoring framework
- Backpressure mechanisms
- Dependency tracking infrastructure
- Agent trust scoring system
- Multi-phase project support

### What is domain-specific (Boxen)

- **Proposer prompts** - What each proposer looks for
- **Voice weights** - Which proposers matter more for this project
- **Plan integration** - Reading `docs/plan_index.md` and `docs/projects/`
- **Category definitions** - What "refactor" vs "feature" means here
- **Acceptance criteria templates** - Project-specific quality bars

### Recommended Split

**In orchestrator (configurable):**
```yaml
# agents.yaml
proposers:
  - name: test-checker
    role: proposer
    focus: test_quality
    weight: 1.0

  - name: architect
    role: proposer
    focus: code_structure
    weight: 1.2

curators:
  - name: pm-agent
    role: curator
    scoring_weights:
      priority_alignment: 0.30
      complexity_reduction: 0.25
      risk: 0.15
      dependencies_met: 0.15
      agent_trust: 0.15
```

**In project (`.orchestrator/prompts/`):**
```
prompts/
├── test-checker.md      # Domain-specific exploration instructions
├── architect.md         # What "good architecture" means here
├── app-designer.md      # Project roadmap context
├── plan-reader.md       # How to read our plan format
└── pm-curator.md        # Project priorities and phase context
```

---

## Implementation Phases

### Phase 1: Proposal Infrastructure
- Add `proposals/` directory structure
- Create proposal format and validation
- Add proposal CRUD operations
- Backpressure per proposer type

### Phase 2: Proposer Roles
- Refactor PM into curator-only role
- Create `proposer` base role
- Implement test-checker proposer
- Implement architect proposer

### Phase 3: Curator Enhancement
- PM reads proposals instead of codebase
- Scoring framework implementation
- Promote/defer/reject workflow
- Dependency checking

### Phase 4: Plan Integration
- Plan-reader proposer
- Project phase awareness
- Dependency graph for multi-phase projects

### Phase 5: Trust & Learning
- Track proposer accuracy (promoted vs rejected)
- Adjust weights based on history
- Feedback loop to proposers

---

## Design Decisions

### 1. Proposer Scheduling

Proposers run **infrequently** (e.g., daily) on their own schedule. They are idea generators, not real-time responders.

```yaml
# Example schedules
proposers:
  - name: test-checker
    interval_seconds: 86400  # Daily
    preferred_time: "02:00"  # Run at 2am

  - name: architect
    interval_seconds: 86400  # Daily
    preferred_time: "03:00"
```

PM runs more frequently (every 10-30 min) to curate and promote.

### 2. Proposal Lifecycle & Revision

When PM **rejects** a proposal, it includes feedback explaining why.

Before a proposer creates new proposals, it should:
1. Review its **previously rejected proposals** and the PM's feedback
2. Check if the underlying issue **still exists** in the codebase
3. Decide whether to revise and re-submit or abandon

```markdown
# Rejected proposal includes:
REJECTED_BY: pm-agent
REJECTED_AT: 2024-01-15T10:30:00Z
REJECTION_REASON: |
  This refactoring is too broad. Consider splitting into:
  1. Extract the validation logic first
  2. Then refactor the handler separately
  Also, this conflicts with the current phase focus on stability.
```

Proposers should **not blindly re-submit** - they must verify the proposal still makes sense given current code state.

### 3. Conflict Escalation

When the PM detects **conflicting proposals** (incompatible approaches to the same problem):

1. PM **does not resolve** the conflict autonomously
2. PM creates a **message to the project owner** explaining:
   - The two (or more) conflicting proposals
   - The trade-offs of each approach
   - Any recommendation if one seems clearly better
3. PM **defers both proposals** until owner responds

This could be implemented as a `/escalate-conflict` skill:

```markdown
# Message to owner
## ⚠️ Conflicting Proposals Need Resolution

**Proposals:**
- PROP-abc123: "Refactor auth into separate service" (architect)
- PROP-def456: "Simplify auth by inlining into handlers" (architect)

**Conflict:** These take opposite approaches to the auth module.

**Trade-offs:**
- Separate service: Better isolation, more complexity
- Inline: Simpler, but tighter coupling

**PM Recommendation:** Given our current phase focus on reducing complexity,
the inline approach may be more appropriate. But this is an architectural
decision that should be made by the project owner.

**Action needed:** Reply with which approach to pursue, or provide alternative direction.
```

### 4. Complexity Estimates

Use **T-shirt sizes** (S/M/L/XL) for initial estimates. PM can refine when promoting to task.

| Size | Rough Scope |
|------|-------------|
| S | Single file, < 1 hour |
| M | Few files, < half day |
| L | Multiple components, ~1 day |
| XL | Cross-cutting, multi-day (consider splitting) |

## Open Questions

1. **How granular should proposer focus be?**
   - Should test-checker have sub-focuses (unit vs integration vs e2e)?
   - Or keep proposers broad and let PM categorize?

2. **Should proposals expire?**
   - If a proposal sits deferred for 30 days, should it auto-archive?
   - Or require explicit proposer re-validation?

3. **How do we bootstrap trust scores?**
   - All proposers start at 1.0?
   - Or seed based on role (plan-reader higher)?

---

## Success Metrics

- **Proposal acceptance rate** - % of proposals promoted to tasks
- **Task completion rate** - % of promoted tasks completed successfully
- **Proposer accuracy** - Per-agent acceptance rate over time
- **Dependency accuracy** - % of dependency predictions correct
- **Velocity** - Tasks completed per time period
- **Complexity trend** - Is codebase getting simpler or more complex?
