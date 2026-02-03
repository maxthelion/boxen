# Proposal Guidelines for Agents

When you need user approval before proceeding with work, submit a proposal to the human-inbox.

## When to Submit a Proposal

Submit a proposal when:
- Creating an implementation plan for a feature
- Proposing a refactoring approach
- Suggesting test coverage for a feature
- Making an architecture or design decision
- Asking a question that blocks your work
- Any work that should be reviewed before execution

**Do NOT** submit proposals for:
- Routine task completion (just complete the task)
- Minor fixes that follow established patterns
- Work explicitly requested by the user

## Proposal Location

Write proposals to: `project-management/human-inbox/`

## Filename Convention

Use this pattern: `YYYY-MM-DD-[short-name]-[type].md`

Types:
- `implementation-proposal.md` - Plans for implementing features
- `test-proposal.md` - Test coverage plans
- `refactor-proposal.md` - Code restructuring plans
- `decision.md` - Architecture/design decisions
- `question.md` - Questions needing user input
- `inbox-triage.md` - Inbox categorization (inbox-poller only)

Examples:
- `2026-02-03-snapping-system-implementation-proposal.md`
- `2026-02-03-fillet-test-proposal.md`
- `2026-02-03-state-management-decision.md`
- `2026-02-03-panel-compatibility-question.md`

## Proposal Format

```markdown
# [Type]: [Title]

**Created:** [ISO timestamp]
**From Agent:** [your-agent-name]
**Related To:** [feature name, task ID, or issue - if applicable]

## Summary

[1-3 sentences explaining what this proposal is about]

## Context

[Background information the user needs to understand the proposal]

## Proposal

[Detailed content of what you're proposing]

### [Section 1]
[Details]

### [Section 2]
[Details]

## Alternatives Considered

[Other approaches you considered and why you didn't choose them]

## Questions for User

[Specific questions that need answers, if any]
1. Question one?
2. Question two?

## Requested Actions

[What you want to happen if this is approved]
- Action 1
- Action 2

## Next Steps (if approved)

[What you will do after approval]
```

## After Submission

1. Your proposal will appear in the user's outbox
2. User will review via `/human-inbox` command
3. User may:
   - **Approve** - You can proceed with the proposed work
   - **Approve with changes** - Proceed with modifications
   - **Ask questions** - Answer and wait for re-review
   - **Reject** - Do not proceed; proposal will be discarded
4. Approved proposals are moved to `project-management/processed/`

## Tips

- Be concise but complete
- Include enough context for the user to make a decision
- If proposing multiple options, indicate your recommendation
- Link to related files or documentation
- For implementation proposals, break down into phases if complex
- For questions, provide options when possible (easier to approve)

## Example: Implementation Proposal

```markdown
# Implementation Proposal: 2D View Snapping System

**Created:** 2026-02-03T14:30:00Z
**From Agent:** architect
**Related To:** 2D View Snapping feature (awaiting-clarification)

## Summary

Proposing a 3-phase implementation of snap-to-grid and snap-to-geometry
for the 2D panel editor.

## Context

The clarified feature spec requires snapping to center lines, edge lines,
and extended construction lines. Current 2D view has no snapping.

## Proposal

### Phase 1: Grid Snapping
- Add configurable grid overlay
- Snap cursor to grid points while drawing
- Toggle via toolbar button

### Phase 2: Geometry Snapping
- Detect panel center lines
- Snap to edge midpoints and corners
- Visual indicators for snap points

### Phase 3: Construction Lines
- Extend edges as guides
- Snap to intersection points

## Alternatives Considered

- All-at-once implementation: Rejected due to complexity
- Third-party snapping library: None fit our SVG-based approach

## Requested Actions

- Approve this phased approach
- Create implementation tasks for each phase

## Next Steps (if approved)

Will create detailed technical spec for Phase 1 and begin implementation.
```
