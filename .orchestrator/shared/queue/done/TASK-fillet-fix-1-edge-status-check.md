# Fix Fillet Eligibility: Check Edge Status for Joints

CREATED: 2026-02-04T14:00:00Z
PRIORITY: P1
COMPLEXITY: S
ROLE: implement
BRANCH: feature/fillet-all-corners-integration-tests
SKIP_PR: true

## Reference Documentation

**READ THESE FIRST - they contain the design decisions:**
- `docs/panel-corner-fillet-plan.md` - Section "Eligibility Computation"
- `project-management/awaiting-clarification/batch-fillet-corners.md` - Eligibility rules

## Problem

Corners where adjacent edges have finger joints are being shown as eligible for filleting. They should NOT be eligible.

From the docs:
> Corners that are part of mechanical joints **cannot** be filleted
> Anything in a forbidden area (even on the boundary) **cannot** be filleted

## The Fix

The docs specify this exact check:

```typescript
// From docs/panel-corner-fillet-plan.md line 247-253
function computeCornerEligibility(panel: BasePanel): CornerEligibility[] {
  return ALL_CORNERS.map(corner => {
    const [edge1, edge2] = corner.split(':') as [EdgePosition, EdgePosition];
    const edge1Status = panel.getEdgeStatus(edge1);
    const edge2Status = panel.getEdgeStatus(edge2);

    // Check if either edge has joints (locked status indicates mating edge)
    if (edge1Status === 'locked' || edge2Status === 'locked') {
      return { corner, eligible: false, reason: 'has-joints', maxRadius: 0 };
    }
    // ... rest of eligibility logic
  });
}
```

## Task

1. Find where corner eligibility is computed (likely `src/utils/allCorners.ts` or similar)
2. Add check: if either adjacent edge has status `'locked'`, corner is ineligible
3. Test: box with all faces enabled → all 4 outer corners should be INELIGIBLE (all edges have joints)
4. Test: disable top + left faces → only top-right corner becomes eligible

## Acceptance Criteria

- [ ] Corners on edges with joints are marked ineligible
- [ ] Box with all faces: 0 eligible corners
- [ ] Box with 2 adjacent faces disabled: 1 eligible corner (the one where both disabled faces meet)
- [ ] Commit changes

## DO NOT

- Do not rewrite the fillet system from scratch
- Do not modify the 4-corner detection (that's a separate task)
- Just add the edge status check

CLAIMED_BY: impl-agent-1
CLAIMED_AT: 2026-02-04T14:06:43.768482

COMPLETED_AT: 2026-02-04T14:12:25.028986

## Result
Merged directly to feature/fillet-all-corners-integration-tests

CLAIMED_BY: impl-agent-1
CLAIMED_AT: 2026-02-04T14:13:35.759286

COMPLETED_AT: 2026-02-04T14:18:33.142288

## Result
Merged directly to feature/fillet-all-corners-integration-tests
