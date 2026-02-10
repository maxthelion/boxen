# Fix Fillet: Exclude Finger Joint Geometry Corners

CREATED: 2026-02-04T14:00:00Z
PRIORITY: P1
COMPLEXITY: S
ROLE: implement
BRANCH: feature/fillet-all-corners-integration-tests
SKIP_PR: true
BLOCKED_BY: TASK-fillet-fix-1-edge-status-check

## Reference Documentation

**READ FIRST:**
- `project-management/drafts/boxen/batch-fillet-corners.md` - "Eligibility rules"

Key quote:
> Anything in a forbidden area (even on the boundary) **cannot** be filleted

## Problem

The corner detection finds ALL geometric corners in the panel outline, including the many small corners created by finger joint patterns. These shouldn't be shown as fillettable.

Screenshot showed: Circles along bottom and left edges where finger joints create corners. These are "implied geometry" from the joints, not design corners.

## The Fix

Filter out corners that are part of finger joint geometry. Options:

### Option A: Filter by region (recommended)
Corners within `materialThickness` of a jointed edge are in the "forbidden area":

```typescript
function isInForbiddenArea(point: Point, panel: Panel): boolean {
  for (const edge of getJointedEdges(panel)) {
    if (distanceToEdge(point, edge) < panel.materialThickness) {
      return true;
    }
  }
  return false;
}

// In corner detection:
const corners = detectAllCorners(outline);
const eligibleCorners = corners.filter(c => !isInForbiddenArea(c.point, panel));
```

### Option B: Track corner origin
Tag corners when generated - only allow 'base', 'cutout', 'extension' origins, not 'joint'.

## Task

1. Find corner detection code (likely `src/utils/allCorners.ts`)
2. Add filter to exclude corners in forbidden areas (within MT of jointed edges)
3. Test: panel with finger joints → finger joint corners NOT shown
4. Test: panel with cutout inside safe area → cutout corners ARE shown

## Acceptance Criteria

- [ ] Finger joint corners not shown as eligible
- [ ] Safe area corners (cutouts, extensions) still detected
- [ ] Commit changes

## DO NOT

- Do not change how corners are initially detected
- Just filter out the forbidden area corners after detection

CLAIMED_BY: impl-agent-2
CLAIMED_AT: 2026-02-04T14:13:25.635137

COMPLETED_AT: 2026-02-04T14:18:04.156986

## Result
Merged directly to feature/fillet-all-corners-integration-tests
