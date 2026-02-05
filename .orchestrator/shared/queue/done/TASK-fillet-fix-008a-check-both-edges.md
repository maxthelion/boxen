# [TASK-fillet-fix-008a] Fix: Check both adjacent edges for corner eligibility

ROLE: implement
PRIORITY: P1
BRANCH: feature/fillet-all-corners-integration-tests
CREATED: 2026-02-04T21:45:00Z
CREATED_BY: human
DEPENDS_ON: TASK-fillet-test-008a

## Problem

Bug 008A: Corners are marked eligible when only ONE adjacent edge is open. Both adjacent edges must be "safe" (open AND no finger joints) for a corner to be eligible.

## Root Cause

The eligibility logic may only be checking if the edge is "open" (adjacent face disabled), not whether it has finger joints. The check needs to verify BOTH edges are completely safe.

## Fix Required

Update the eligibility logic to check both adjacent edges:

```typescript
function isCornerEligible(corner: AllCornerInfo, panel: BasePanel): boolean {
  // Get the two edges that meet at this corner
  const adjacentEdges = getAdjacentEdgesForCorner(corner, panel);

  // Both edges must be safe
  return adjacentEdges.every(edge => isEdgeSafe(edge, panel));
}

function isEdgeSafe(edge: EdgePosition, panel: BasePanel): boolean {
  const statuses = panel.computeEdgeStatuses();
  const status = statuses.find(s => s.position === edge);

  // Edge is safe if it's NOT locked (locked = has finger joints)
  // Note: 'unlocked' = open edge with no joints
  //       'outward-only' = female joints (slots) - still can fillet
  //       'locked' = male joints (tabs) - cannot fillet
  return status?.status !== 'locked';
}
```

## Files to Modify

- `src/utils/allCorners.ts` - `computeAllCornerEligibility()` function
- `src/engine/nodes/BasePanel.ts` - May need to pass edge status info to eligibility computation

## Key Insight

The `edgeStatuses` array from `computeEdgeStatuses()` has three possible values:
- `'locked'` - Male joints (tabs out) - corner INELIGIBLE
- `'outward-only'` - Female joints (slots) - corner may be eligible
- `'unlocked'` - Open edge (no adjacent face) - corner eligible if BOTH edges unlocked

A corner at the intersection of edges E1 and E2 is eligible only if:
- Neither E1 nor E2 is 'locked'
- The corner is not in a forbidden area

## Acceptance Criteria

- [ ] Tests from TASK-fillet-test-008a now PASS
- [ ] Corner with one jointed edge is ineligible
- [ ] Corner with both edges open is eligible
- [ ] No regressions in other fillet tests

## Testing

```bash
npm run test:run -- src/test/fixtures/allCornerEligibility.test.ts
```

CLAIMED_BY: impl-agent-2
CLAIMED_AT: 2026-02-04T21:55:00.710140

COMPLETED_AT: 2026-02-04T21:57:38.927819

## Result
PR created: https://github.com/maxthelion/boxen/pull/34
