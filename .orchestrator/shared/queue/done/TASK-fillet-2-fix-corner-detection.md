# Fix Corner Detection to Include All Corners

CREATED: 2026-02-04T12:20:01Z
PRIORITY: P1
COMPLEXITY: M
ROLE: implement
BRANCH: feature/fillet-all-corners-integration-tests
SKIP_PR: true
BLOCKED_BY: TASK-fillet-1-remove-all-corners-button

## Context

This is part 2 of fixing the fillet feature.
- Part 1: TASK-fillet-1-remove-all-corners-button (must complete first)
- Part 3: TASK-fillet-3-fix-eligibility (BLOCKED_BY this task)

## Problem

Currently the chamfer/fillet tool only detects the 4 outer corners of a panel. It should detect ALL corners:
- The 4 outer panel corners
- Corners of cutout holes/shapes
- Corners created by custom edge paths (push-pull extensions)
- Both convex (outer) and concave (inner) corners

## Task

Update corner detection to find all corners in panel geometry, not just the outer 4.

## Specific Changes

1. Find the corner detection code (likely in `src/components/ChamferPalette.tsx` or a utility)

2. Update detection to walk the panel outline AND all holes:
   ```typescript
   // Pseudocode
   const corners = [];
   // Walk outline points
   for (let i = 0; i < outline.points.length; i++) {
     if (isCorner(outline.points, i)) {
       corners.push({ point: outline.points[i], source: 'outline', index: i });
     }
   }
   // Walk each hole
   for (const hole of holes) {
     for (let i = 0; i < hole.points.length; i++) {
       if (isCorner(hole.points, i)) {
         corners.push({ point: hole.points[i], source: 'hole', holeId: hole.id, index: i });
       }
     }
   }
   ```

3. A "corner" is defined as a point where the path changes direction (not a straight continuation)

## Acceptance Criteria

- [ ] Panel with 4-corner rectangular cutout shows 8 selectable corners (4 outer + 4 cutout)
- [ ] Panel with L-shaped cutout shows appropriate number of corners
- [ ] TypeScript compiles without errors
- [ ] Corner indicators render at correct positions

## Notes

- Don't worry about eligibility yet - that's the next task
- Just make sure ALL geometric corners are detected and shown

CLAIMED_BY: impl-agent-2
CLAIMED_AT: 2026-02-04T12:15:15.642514

COMPLETED_AT: 2026-02-04T12:19:23.270643

## Result
Merged directly to feature/fillet-all-corners-integration-tests
