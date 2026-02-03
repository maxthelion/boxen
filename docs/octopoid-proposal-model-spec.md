# Octopoid: Proposal-Driven Model Specification

**Purpose:** Specification for octopoid maintainer to implement and document in README.

---

## Current Model (Task-Driven)

```
PM explores codebase → Creates tasks → Implementers execute
```

**Problem:** PM does everything - explores, prioritizes, scopes. No specialization.

---

## Proposed Model (Proposal-Driven)

```
Proposers (specialists) → Proposals → Curator (PM) → Tasks → Executors
```

### Three Layers

**1. Proposal Layer** - Specialized agents propose work
- Each proposer has a **focus area** (tests, architecture, features, plans)
- Proposers run **infrequently** (e.g., daily)
- Each proposer type has **independent backpressure**
- Proposers review their **rejected proposals + feedback** before proposing new items

**2. Curation Layer** - PM curates proposals into tasks
- PM does NOT explore codebase directly
- PM **scores** proposals based on configurable weights
- PM **promotes** good proposals to task queue
- PM **rejects** proposals with feedback (so proposer can learn)
- PM **defers** proposals that aren't right for now
- PM **escalates conflicts** to project owner when proposals contradict

**3. Execution Layer** - Same as current (implementers, testers, reviewers)

---

## Proposer Types (Examples)

| Proposer | Focus | Typical Proposals |
|----------|-------|-------------------|
| test-checker | Test quality | Fix flaky tests, add coverage, reduce brittleness |
| architect | Code structure | Refactoring, simplification, dependency cleanup |
| app-designer | Features | New functionality, UX improvements |
| plan-reader | Documented plans | Tasks extracted from project plans |

Projects define their own proposer prompts. Octopoid provides the infrastructure.

---

## Proposal Lifecycle

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│ active  │────▶│promoted │────▶│  task   │
└─────────┘     └─────────┘     └─────────┘
     │
     ├─────────▶ deferred (revisit later)
     │
     └─────────▶ rejected (with feedback)
```

### Rejection Feedback Loop

When PM rejects a proposal:
1. Rejection includes **written feedback** explaining why
2. Before proposing again, proposer must:
   - Review its rejected proposals
   - Check if underlying issue still exists
   - Address feedback if re-submitting

This prevents proposers from spamming the same bad ideas.

---

## Voice Weights

Not all proposers are equal. Configurable weights:

```yaml
voice_weights:
  plan-reader: 1.5    # Executing plans is priority
  architect: 1.2      # Simplification multiplies velocity
  test-checker: 1.0   # Important but often not urgent
  app-designer: 0.8   # Features after stability
```

Weights can vary by project phase (planning vs implementation vs polish).

---

## Conflict Handling

When PM detects conflicting proposals:
1. PM does NOT resolve autonomously
2. PM creates **message to project owner** with:
   - The conflicting proposals
   - Trade-offs of each
   - Optional recommendation
3. PM defers both proposals until owner responds

This keeps architectural decisions with humans.

---

## Configuration Schema

```yaml
# Backpressure per proposer type
proposal_limits:
  test-checker:
    max_active: 5      # Max proposals in queue
    max_per_run: 2     # Max proposals per invocation
  architect:
    max_active: 3
    max_per_run: 1

# Voice weights (how much each proposer matters)
voice_weights:
  plan-reader: 1.5
  architect: 1.2
  test-checker: 1.0
  app-designer: 0.8

# PM scoring formula
curator_scoring:
  priority_alignment: 0.30   # Matches project goals?
  complexity_reduction: 0.25 # Simplifies codebase?
  risk: 0.15                 # Blast radius if wrong?
  dependencies_met: 0.15     # Blockers resolved?
  voice_weight: 0.15         # Proposer trust level

agents:
  # Proposers - run infrequently
  - name: test-checker
    role: proposer
    focus: test_quality
    interval_seconds: 86400  # Daily

  - name: architect
    role: proposer
    focus: code_structure
    interval_seconds: 86400

  # Curator - runs frequently
  - name: pm-agent
    role: curator
    interval_seconds: 600  # Every 10 min

  # Executors - same as before
  - name: impl-agent-1
    role: implementer
    interval_seconds: 180
```

---

## Directory Structure

```
.orchestrator/
├── agents.yaml
├── prompts/                 # Domain-specific (per project)
│   ├── test-checker.md
│   ├── architect.md
│   └── curator.md
├── shared/
│   ├── proposals/           # NEW
│   │   ├── active/
│   │   ├── deferred/
│   │   └── rejected/
│   └── queue/               # Existing
│       ├── incoming/
│       ├── claimed/
│       ├── done/
│       └── failed/
└── messages/
```

---

## Proposal Format

```markdown
# Proposal: {Title}

**ID:** PROP-{uuid8}
**Proposer:** test-checker
**Category:** test | refactor | feature | debt | plan-task
**Complexity:** S | M | L | XL
**Created:** {ISO8601}

## Summary
One-line description.

## Rationale
Why this matters.

## Complexity Reduction
(Optional) How this simplifies or unblocks other work.

## Dependencies
(Optional) What must happen first.

## Enables
(Optional) What this unblocks.

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Relevant Files
- path/to/file.ts
```

### Rejected Proposal (additional fields)

```markdown
**Rejected By:** pm-agent
**Rejected At:** {ISO8601}
**Rejection Reason:** |
  This is too broad. Consider splitting into smaller proposals.
  Also conflicts with current phase focus on stability.
```

---

## New Role Implementations

### ProposerRole (base class)

```python
class ProposerRole(BaseRole):
    def run(self):
        if not can_create_proposal(self.proposer_type):
            return 0  # Backpressure

        # Review previous rejections
        rejections = get_rejected_proposals(self.agent_name)

        # Domain-specific exploration (via prompt)
        prompt = self.build_prompt(rejections)

        # Create proposals via /create-proposal skill
        self.invoke_claude(prompt, allowed_tools=[...])
```

### CuratorRole (replaces ProductManager)

```python
class CuratorRole(BaseRole):
    def run(self):
        proposals = get_active_proposals()

        # Check for conflicts
        conflicts = detect_conflicts(proposals)
        for conflict in conflicts:
            self.escalate_conflict(conflict)

        # Score and process each proposal
        for proposal in proposals:
            score = self.score_proposal(proposal)
            # Promote, defer, or reject based on score + context
```

---

## New Skills

### For Proposers
- `/create-proposal` - Create a proposal
- `/review-rejections` - See own rejected proposals with feedback

### For Curator
- `/promote-proposal {id}` - Move to task queue
- `/reject-proposal {id} {reason}` - Reject with feedback
- `/defer-proposal {id}` - Defer for later
- `/escalate-conflict` - Message owner about conflicts

### For Management (humans)
- `/proposal-status` - View proposal queue

---

## What's Generic vs Domain-Specific

### Generic (in octopoid)
- Proposal queue infrastructure
- ProposerRole and CuratorRole base classes
- Scoring framework (weights are configurable)
- Conflict detection and escalation
- Backpressure mechanisms
- Skills for proposal lifecycle

### Domain-Specific (in each project)
- Proposer prompts (what to look for)
- Weight values (which voices matter more)
- Scoring weight values
- Plan format integration
- Project phase definitions

---

## Migration Path

1. **v1 (current):** Task-driven PM
2. **v2:** Add proposal infrastructure, curator role
3. **v3:** Deprecate direct-to-task PM, proposers become primary

Projects can opt-in to proposal model via config flag:

```yaml
model: proposal  # or "task" for legacy
```
