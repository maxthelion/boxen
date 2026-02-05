# Fix Corner Eligibility Calculation

CREATED: 2026-02-04T12:20:02Z
PRIORITY: P1
COMPLEXITY: M
ROLE: implement
BRANCH: feature/fillet-all-corners-integration-tests
SKIP_PR: true
BLOCKED_BY: TASK-fillet-2-fix-corner-detection

## Context

This is part 3 of fixing the fillet feature.
- Part 2: TASK-fillet-2-fix-corner-detection (must complete first)
- Part 4: TASK-fillet-4-fix-fillet-operation (BLOCKED_BY this task)

## Problem

Corner eligibility is currently wrong. Bottom corners on joint edges show as eligible when they shouldn't be.

## Eligibility Rules

A corner is **eligible** for filleting only if BOTH edges meeting at that corner are "safe" (no finger joints).

**Edge types:**
- **Joint edge**: Has finger joints (male tabs or female slots) - NOT safe
- **Open edge**: No joints (face is disabled/removed) - safe
- **Extended edge**: Panel extends beyond assembly boundary - safe

**Corner eligibility:**
| Edge 1 | Edge 2 | Eligible? |
|--------|--------|-----------|
| Joint | Joint | NO |
| Joint | Open | NO |
| Joint | Extended | NO |
| Open | Open | YES |
| Open | Extended | YES |
| Extended | Extended | YES |

**Cutout corners:**
- If the cutout is fully inside the panel's "safe area" (away from all joint edges), all its corners are eligible
- If the cutout touches or crosses a joint edge region, those corners are ineligible

## Task

1. Find the eligibility calculation code

2. For each detected corner, determine what edges meet there:
   - Get the two edge segments adjacent to the corner point
   - Classify each edge: joint, open, or extended

3. Apply the rules above to determine eligibility

4. Visual feedback:
   - Eligible corners: show with normal indicator (clickable)
   - Ineligible corners: show dimmed or don't show at all

## Acceptance Criteria

- [ ] Corners where both edges are joint → ineligible (dimmed/hidden)
- [ ] Corners where one edge is joint → ineligible
- [ ] Corners where both edges are open/extended → eligible
- [ ] Cutout corners inside safe area → eligible
- [ ] TypeScript compiles without errors

CLAIMED_BY: impl-agent-2
CLAIMED_AT: 2026-02-04T12:25:01.047306

COMPLETED_AT: 2026-02-04T12:32:43.930557

## Result
Merged directly to feature/fillet-all-corners-integration-tests
