# [TASK-fillet-fix-008b] Fix: Detect corners from edge extensions and cutouts

ROLE: implement
PRIORITY: P1
BRANCH: feature/fillet-all-corners-integration-tests
CREATED: 2026-02-04T21:45:00Z
CREATED_BY: human
DEPENDS_ON: TASK-fillet-test-008b

## Problem

Bug 008B: Corners created by edge extensions and cutouts are not detected by the all-corners system. The corner detection needs to find ALL geometric corners, not just the 4 base panel corners.

## Root Cause

The `detectAllPanelCorners()` function may be:
1. Only looking at a simplified outline (not the actual computed outline with extensions)
2. Not processing hole/cutout paths
3. Filtering too aggressively

## Fix Required

### 1. Ensure corner detection uses the full computed outline

The outline passed to `detectAllPanelCorners()` should be the actual panel outline including:
- Edge extensions (the step shapes created by push-pull)
- Modified edges from custom paths

In `BasePanel.getAllCornerEligibility()`:
```typescript
// Use the ACTUAL computed outline, not a simplified version
const outline = this.getOutline();  // Should include extensions
const corners = detectAllPanelCorners(outline.points, holes, config);
```

### 2. Process holes/cutouts for corner detection

Pass the panel's holes to corner detection:
```typescript
// Get holes from the outline
const holes = outline.holes?.map(h => ({
  id: h.id ?? `hole-${index}`,
  path: h.points
})) ?? [];

const corners = detectAllPanelCorners(outline.points, holes, config);
```

### 3. Verify corner detection algorithm

In `src/utils/allCorners.ts`, verify `detectCornersInPath()` correctly identifies corners:
- A corner exists where the angle between adjacent segments is not 180°
- Both convex (exterior) and concave (interior) corners should be detected
- The minimum edge length check shouldn't filter out extension corners

## Files to Modify

- `src/engine/nodes/BasePanel.ts` - `getAllCornerEligibility()` to pass correct data
- `src/utils/allCorners.ts` - `detectAllPanelCorners()` and `detectCornersInPath()`

## Verification

After fix, a panel with:
- 1 extension should have 6+ corners (4 base + 2 from step)
- 2 adjacent extensions should have 8+ corners
- 1 rectangular cutout should have 4 hole corners

## Acceptance Criteria

- [ ] Tests from TASK-fillet-test-008b now PASS
- [ ] Extension corners are detected in `allCornerEligibility`
- [ ] Cutout corners are detected with `location: 'hole'`
- [ ] Extension corners on open edges are marked eligible
- [ ] No regressions

## Testing

```bash
npm run test:run -- src/test/fixtures/allCornerEligibility.test.ts
```

CLAIMED_BY: impl-agent-2
CLAIMED_AT: 2026-02-04T21:52:16.521517

COMPLETED_AT: 2026-02-04T21:54:54.032809

## Result
PR created: https://github.com/maxthelion/boxen/pull/32
