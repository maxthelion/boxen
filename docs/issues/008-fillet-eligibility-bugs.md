# Issue 008: Fillet Eligibility Bugs - Joints and Custom Edges

**Date Reported:** 2026-02-04
**Status:** Open
**PR:** #14 (Fillet feature fixes)
**Branch:** agent/TASK-fillet-5-integration-tests-20260204-134129

## Description

Two related bugs with fillet corner eligibility:

### Bug A: Outer corners with joints shown as eligible

The 4 outer corners (Top Left, Top Right, Bottom Right, Bottom Left) are shown as eligible in the UI, but they have finger joints on their adjacent edges. Corners where EITHER adjacent edge has joints should be ineligible.

**Screenshot shows:** All 4 corners checked/eligible, but the dashed grey lines indicate finger joints on bottom and left edges.

### Bug B: Custom edge corners not detected

When a custom edge modification exists (e.g., triangular notch cut into panel), the corners of that notch should be eligible for filleting but are not shown in the corner list.

**Screenshot shows:** A triangular notch in the panel outline. The 2 corners where the notch meets the panel should be fillettable, but only the 4 standard outer corners appear in the list.

## Expected Behavior

### Bug A
- A corner is only eligible if BOTH adjacent edges are "safe" (no finger joints)
- In the screenshot, bottom-left and bottom-right corners should be ineligible (bottom edge has joints)
- Top-left should be ineligible (left edge has joints)

### Bug B
- Corner detection should find corners from custom edge modifications
- The corner list should include entries like "Notch Corner 1", "Notch Corner 2" (or similar)
- These corners are typically in the "safe area" (away from edges) so should be eligible

## Technical Analysis

### Bug A: Edge eligibility not checking joints correctly

The current logic may only be checking if the edge is "open" (adjacent face disabled), not whether it has finger joints. An edge can be:
- **Open + no joints** → corners eligible
- **Open + has joints** → corners NOT eligible (still has structural constraints)
- **Closed + has joints** → corners NOT eligible

### Bug B: Corner detection limited to base corners

The corner detection appears to only look at the 4 base panel corners, not corners created by:
- Edge extensions (push-pull)
- Cutouts
- Custom path modifications

The corner list UI shows fixed entries ("Top Left", "Top Right", etc.) rather than dynamically detected corners.

## Recommended Fixes

### Bug A Fix

```typescript
function isCornerEligible(corner: Corner, panel: Panel): boolean {
  const [edge1, edge2] = getAdjacentEdges(corner);

  // Both edges must be safe (open AND no joints)
  return isEdgeSafe(edge1, panel) && isEdgeSafe(edge2, panel);
}

function isEdgeSafe(edge: Edge, panel: Panel): boolean {
  // Edge must be open (no adjacent panel)
  if (!isEdgeOpen(edge, panel)) return false;

  // Edge must not have finger joints
  if (hasFingerJoints(edge, panel)) return false;

  return true;
}
```

### Bug B Fix

Replace fixed corner list with dynamic detection:

```typescript
function detectAllCorners(panel: Panel): Corner[] {
  const corners: Corner[] = [];

  // Detect corners from outline (includes custom edges)
  const outlineCorners = detectCornersInPath(panel.outline);
  corners.push(...outlineCorners);

  // Detect corners from holes/cutouts
  for (const hole of panel.holes) {
    const holeCorners = detectCornersInPath(hole);
    corners.push(...holeCorners);
  }

  // Filter out finger joint corners (Issue 007)
  return corners.filter(c => !isFingerJointCorner(c, panel));
}
```

## Affected Code

- `src/utils/allCorners.ts` - Corner detection and eligibility
- `src/components/FilletPalette.tsx` - UI shows fixed corner list
- `src/engine/nodes/BasePanel.ts` - Edge/joint information

## Related Issues

- Issue 007: Finger Joint Corners Incorrectly Marked as Eligible

## Priority

High - These bugs mean the fillet feature doesn't work correctly for most real use cases (panels with joints, panels with custom edges).
