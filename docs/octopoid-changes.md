# Octopoid Changes for Proposal-Driven System

Summary of changes to make to the octopoid orchestrator to support the proposal-driven multi-agent architecture.

## 1. New Role Type: `proposer`

Add a new base role alongside `implementer`, `tester`, `reviewer`.

```python
# orchestrator/roles/proposer.py
class ProposerRole(BaseRole):
    """Base class for proposal-generating agents."""

    def run(self):
        # 1. Check proposal backpressure for this proposer type
        # 2. Review previously rejected proposals + feedback
        # 3. Explore codebase (domain-specific)
        # 4. Create proposals via /create-proposal skill
```

**Key behaviors:**
- Has its own backpressure limits (separate from task queue)
- Reviews rejection feedback before proposing new items
- Writes to `proposals/active/` instead of `queue/incoming/`

## 2. Refactor PM to `curator` Role

Rename/refactor `product_manager` to `curator`.

```python
# orchestrator/roles/curator.py
class CuratorRole(BaseRole):
    """Curates proposals into tasks."""

    def run(self):
        # 1. Read active proposals
        # 2. Score each proposal
        # 3. Promote, defer, or reject
        # 4. Detect conflicts → escalate
```

**Key behaviors:**
- Does NOT explore codebase directly
- Reads proposals and project priorities
- Writes promoted tasks to `queue/incoming/`
- Writes rejections with feedback to `proposals/rejected/`

## 3. Proposal Queue Structure

Add new directories alongside existing queue:

```
.orchestrator/shared/
├── proposals/           # NEW
│   ├── active/          # Under consideration
│   ├── deferred/        # Revisit later
│   └── rejected/        # With feedback
├── queue/               # Existing
│   ├── incoming/
│   ├── claimed/
│   ├── done/
│   └── failed/
```

## 4. Proposal Format & Utils

**New file:** `orchestrator/proposal_utils.py`

```python
def can_create_proposal(proposer_type: str) -> tuple[bool, str]:
    """Check backpressure for a specific proposer type."""

def create_proposal(
    title: str,
    proposer: str,
    category: str,  # test | refactor | feature | debt | plan-task
    complexity: str,  # S | M | L | XL
    summary: str,
    rationale: str,
    acceptance_criteria: list[str],
    depends_on: list[str] | None = None,
    enables: list[str] | None = None,
    complexity_reduction: str | None = None,
) -> Path:
    """Create a proposal file in proposals/active/."""

def get_rejected_proposals(proposer: str) -> list[Proposal]:
    """Get this proposer's rejected proposals with feedback."""

def promote_proposal(proposal_id: str, priority: str) -> Path:
    """Move proposal to task queue."""

def reject_proposal(proposal_id: str, reason: str) -> None:
    """Move to rejected with feedback."""

def defer_proposal(proposal_id: str, reason: str | None = None) -> None:
    """Move to deferred for later review."""
```

## 5. Configuration Extensions

Extend `agents.yaml` schema:

```yaml
# Proposal backpressure (per proposer type)
proposal_limits:
  test-checker:
    max_active: 5
    max_per_run: 2
  architect:
    max_active: 3
    max_per_run: 1
  app-designer:
    max_active: 5
    max_per_run: 2
  plan-reader:
    max_active: 10
    max_per_run: 3

# Voice weights for PM scoring
voice_weights:
  plan-reader: 1.5
  architect: 1.2
  test-checker: 1.0
  app-designer: 0.8

# Curator scoring weights
curator_scoring:
  priority_alignment: 0.30
  complexity_reduction: 0.25
  risk: 0.15
  dependencies_met: 0.15
  voice_weight: 0.15

agents:
  # Proposers (run infrequently)
  - name: test-checker
    role: proposer
    focus: test_quality
    interval_seconds: 86400

  # Curator (runs frequently)
  - name: pm-agent
    role: curator
    interval_seconds: 600

  # Executors (existing)
  - name: impl-agent-1
    role: implementer
    interval_seconds: 180
```

## 6. New Agent Skills

### For Proposers

**`/create-proposal`** - Create a new proposal
```
orchestrator/commands/agent/create-proposal.md
```

**`/review-rejections`** - Review own rejected proposals
```
orchestrator/commands/agent/review-rejections.md
```

### For Curator

**`/score-proposal`** - Score a proposal (internal use)
```
orchestrator/commands/agent/score-proposal.md
```

**`/promote-proposal`** - Move proposal to task queue
```
orchestrator/commands/agent/promote-proposal.md
```

**`/reject-proposal`** - Reject with feedback
```
orchestrator/commands/agent/reject-proposal.md
```

**`/defer-proposal`** - Defer for later
```
orchestrator/commands/agent/defer-proposal.md
```

**`/escalate-conflict`** - Escalate conflicting proposals to owner
```
orchestrator/commands/agent/escalate-conflict.md
```

### For Management

**`/proposal-status`** - View proposal queue state
```
orchestrator/commands/management/proposal-status.md
```

## 7. Conflict Detection

Add to curator logic:

```python
def detect_conflicts(proposals: list[Proposal]) -> list[ConflictGroup]:
    """
    Detect proposals that conflict with each other.

    Conflict indicators:
    - Same files mentioned in relevant_files
    - Opposite approaches to same problem (heuristic)
    - Explicit "conflicts_with" in proposal metadata
    """
```

When conflicts detected, curator uses `/escalate-conflict` to message owner.

## 8. Template Updates

**New template:** `templates/proposal.md.tmpl`

```markdown
# Proposal: $title

**ID:** PROP-$uuid8
**Proposer:** $proposer
**Category:** $category
**Complexity:** $complexity
**Created:** $timestamp

## Summary
$summary

## Rationale
$rationale

## Complexity Reduction
$complexity_reduction

## Dependencies
$dependencies

## Enables
$enables

## Acceptance Criteria
$acceptance_criteria

## Relevant Files
$relevant_files
```

**Update:** `templates/agent_instructions.md.tmpl`

Add proposer-specific section:
```markdown
## Proposer Instructions

Before creating new proposals:
1. Check your previously rejected proposals in `.orchestrator/shared/proposals/rejected/`
2. Review the rejection feedback
3. Verify the issue still exists in the codebase
4. Do not re-submit without addressing feedback
```

## 9. Init Script Updates

Update `orchestrator/init.py` to:
- Create `proposals/` directory structure
- Add proposal-related skills to `.claude/commands/`
- Add `proposal_limits` and `voice_weights` to default `agents.yaml`

## Summary of New Files

```
orchestrator/
├── orchestrator/
│   ├── proposal_utils.py      # NEW
│   └── roles/
│       ├── proposer.py        # NEW (base class)
│       ├── curator.py         # NEW (refactored from product_manager)
│       └── product_manager.py # DEPRECATED or removed
├── commands/
│   └── agent/
│       ├── create-proposal.md    # NEW
│       ├── review-rejections.md  # NEW
│       ├── score-proposal.md     # NEW
│       ├── promote-proposal.md   # NEW
│       ├── reject-proposal.md    # NEW
│       ├── defer-proposal.md     # NEW
│       └── escalate-conflict.md  # NEW
│   └── management/
│       └── proposal-status.md    # NEW
└── templates/
    └── proposal.md.tmpl          # NEW
```

## Not in Octopoid (Domain-Specific)

These stay in the parent project (e.g., Boxen):

- `.orchestrator/prompts/test-checker.md` - What to look for
- `.orchestrator/prompts/architect.md` - What good architecture means
- `.orchestrator/prompts/app-designer.md` - Project roadmap context
- `.orchestrator/prompts/plan-reader.md` - How to read plan format
- `.orchestrator/prompts/curator.md` - Project priorities
- Voice weight configuration (project-specific values)
- Scoring weight configuration (project-specific values)
