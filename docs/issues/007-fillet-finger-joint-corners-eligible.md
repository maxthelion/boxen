# Issue 007: Finger Joint Corners Incorrectly Marked as Eligible for Fillet

**Date Reported:** 2026-02-04
**Status:** Open
**PR:** #14 (Fillet feature fixes)
**Branch:** agent/TASK-fillet-5-integration-tests-20260204-134129

## Description

The fillet feature incorrectly marks finger joint corners as eligible for filleting. These corners appear along edges where finger joints exist (e.g., bottom and left edges in screenshot).

### Screenshot

Circles visible along bottom and left edges represent corners that are being marked as eligible, but shouldn't be.

### Expected Behavior

Finger joint corners should NOT be eligible for filleting because:
1. They are **implied geometry** from the finger joint pattern, not intentional design corners
2. They are on the **boundary of forbidden areas** (the joint regions where material must remain for structural integrity)

### Actual Behavior

The corner detection finds ALL geometric corners in the outline, including the many small corners created by the finger joint pattern (each finger creates 2-4 corners).

## Technical Analysis

The corner detection in `src/utils/allCorners.ts` likely iterates over all points in `panel.outline.points` and identifies corners based on angle changes. This correctly finds geometric corners but doesn't distinguish between:

1. **Design corners** - The 4 (or more) intentional corners of the panel shape
2. **Joint corners** - The many small corners created by finger joint geometry

### Root Cause

The eligibility check considers whether edges are "safe" (no joints), but the corner detection itself doesn't filter out corners that are **part of** the joint geometry.

A corner at position (x, y) should be ineligible if:
- It falls within the finger joint region of any edge
- It's a corner created BY the finger joint pattern (not the base panel shape)

## Recommended Fixes

### Option A: Filter by region

After detecting all corners, filter out any that fall within the "joint region" of an edge. The joint region is typically `materialThickness` distance from the edge.

```typescript
function isInJointRegion(corner: Point, panel: Panel): boolean {
  // Check if corner is within MT of any jointed edge
  for (const edge of panel.jointedEdges) {
    if (distanceToEdge(corner, edge) < materialThickness) {
      return true;
    }
  }
  return false;
}
```

### Option B: Use base outline, not computed outline

Detect corners from the "base" panel shape (rectangle + cutouts) before finger joints are applied, rather than from the final computed outline with joints.

### Option C: Track corner origin

When generating the outline, tag each corner with its origin:
- `'base'` - Original panel corner
- `'cutout'` - Corner from a cutout/hole
- `'joint'` - Corner from finger joint geometry
- `'extension'` - Corner from edge extension

Only corners with origin `'base'`, `'cutout'`, or `'extension'` are eligible for fillet.

## Affected Code

- `src/utils/allCorners.ts` - Corner detection
- `src/engine/nodes/BasePanel.ts` - Outline computation
- `src/components/FilletAllCornersPalette.tsx` - UI (displays eligible corners)

## Priority

Medium - Feature works for basic cases but shows incorrect UI for panels with finger joints (most real use cases).
