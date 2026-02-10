# Proposal: Enhanced draft metadata and aging tracking

**ID:** PROP-d7f4a2c8
**Proposer:** draft-processor
**Category:** plan-task
**Complexity:** S
**Created:** 2026-02-10T23:08:05Z

## Summary
Add standardized metadata headers to all drafts and create a dashboard script that shows draft age, status, and identifies candidates for processing before they become stale.

## Rationale
Currently, there are 22 drafts across `boxen/` and `octopoid/` subdirectories (~3000 lines total). While none are technically stale yet (>3 days old), the draft-processor agent only acts reactively after drafts cross the 3-day threshold. This creates several problems:

1. **Inconsistent metadata**: Some drafts have `Captured:` headers, some use filename dates, others have neither. This makes age calculation unreliable.
2. **No visibility**: There's no way to see at a glance which drafts are approaching staleness or which have high priority.
3. **Reactive rather than proactive**: The system waits for drafts to become stale rather than surfacing actionable items earlier.
4. **No priority tracking**: All drafts are treated equally, even though some may be time-sensitive or blocking other work.

A simple dashboard script would let the PM triage drafts proactively, identifying which to action, which to defer, and which to archive before they accumulate.

## Complexity Reduction
This reduces cognitive load for the PM by:
- Eliminating manual counting/sorting of draft files
- Surfacing which drafts need attention without reading all 22 files
- Preventing the need to recover from large backlogs of stale drafts

## Dependencies
None - this is a standalone tooling improvement.

## Enables
- More efficient draft triage sessions
- Earlier action on time-sensitive ideas
- Better prioritization of which ideas to prototype or enqueue
- Reduces "draft rot" where good ideas languish unnoticed

## Acceptance Criteria
- [ ] All existing drafts have standardized metadata headers: `Captured:`, `Status:`, `Priority:` (P0/P1/P2/P3)
- [ ] New draft template includes these headers
- [ ] Dashboard script `project-management/scripts/draft-dashboard.sh` shows:
  - Total draft count per subdirectory
  - Drafts sorted by age (oldest first)
  - Drafts approaching staleness (2+ days old)
  - Drafts by status (Idea/In Progress/Blocked)
  - Drafts by priority
- [ ] Script output is human-readable (table format preferred)
- [ ] Script handles missing metadata gracefully (fallback to mtime)

## Relevant Files
- `project-management/drafts/boxen/*.md` - All boxen drafts need metadata
- `project-management/drafts/octopoid/*.md` - All octopoid drafts need metadata
- `project-management/scripts/draft-dashboard.sh` - New script to create
- `project-management/templates/draft-template.md` - Template for new drafts (may need to create)
