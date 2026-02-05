# [TASK-fillet-fix-007] Fix: Filter out finger joint corners from eligibility

ROLE: implement
PRIORITY: P1
BRANCH: feature/fillet-all-corners-integration-tests
CREATED: 2026-02-04T21:45:00Z
CREATED_BY: human
DEPENDS_ON: TASK-fillet-test-007

## Problem

Bug 007: The `getAllCornerEligibility()` method returns corners that are part of finger joint geometry. These should be filtered out - only "design corners" (base panel corners, cutout corners, extension corners) should be included.

## Root Cause

The corner detection in `src/utils/allCorners.ts` iterates over all points in `panel.outline.points` and identifies geometric corners. This includes the many small corners created by finger joint patterns.

## Fix Required

Filter out corners that fall within the "joint region" of any edge. The joint region is the area where finger joints exist.

### Option A: Use forbidden areas (Recommended)

The `computeAllCornerEligibility` function already takes `forbiddenAreas`. Ensure that finger joint regions are properly included as forbidden areas.

In `src/engine/nodes/BasePanel.ts`, the `getAllCornerEligibility()` method should:

1. Compute forbidden areas that include finger joint regions
2. A corner is ineligible if it falls within ANY forbidden area

```typescript
getAllCornerEligibility(): AllCornerEligibility[] {
  const outline = this.getOutline();
  const material = this.getMaterial();
  const dims = this.getDimensions();
  const edgeStatuses = this.computeEdgeStatuses();

  // Build forbidden areas from LOCKED edges (edges with finger joints)
  const forbiddenAreas: ForbiddenArea[] = [];
  for (const status of edgeStatuses) {
    if (status.status === 'locked') {
      // The entire edge region is forbidden (finger joints span the edge)
      const bounds = this.getEdgeBounds(status.position, dims, material.thickness);
      forbiddenAreas.push({ type: 'finger-joint', bounds });
    }
  }

  // Detect corners and compute eligibility
  const config = { materialThickness: material.thickness, minEdgeLength: 2 };
  const corners = detectAllPanelCorners(outline.points, [], config);

  return computeAllCornerEligibility(corners, forbiddenAreas, config);
}
```

### Option B: Detect from base outline

Detect corners from the panel's "base" shape before finger joints are applied, rather than from the final computed outline.

## Files to Modify

- `src/engine/nodes/BasePanel.ts` - `getAllCornerEligibility()` method
- `src/utils/allCorners.ts` - May need to adjust `isInForbiddenArea()` logic

## Acceptance Criteria

- [ ] Tests from TASK-fillet-test-007 now PASS
- [ ] Enclosed box panels return 0 eligible corners
- [ ] Panels with open edges return only design corners, not joint corners
- [ ] No regressions in existing fillet tests

## Testing

Run the test file:
```bash
npm run test:run -- src/test/fixtures/allCornerEligibility.test.ts
```

CLAIMED_BY: impl-agent-1
CLAIMED_AT: 2026-02-04T21:56:13.753175

COMPLETED_AT: 2026-02-04T22:01:17.189536

## Result
PR created: https://github.com/maxthelion/boxen/pull/35
