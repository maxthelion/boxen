# Debugging 3D Panel Rendering Issues

This document describes how to debug and fix THREE.js panel rendering issues, particularly with ExtrudeGeometry and holes (slots).

## Common Symptoms

1. **Holes render as extrusions** - Slots appear to stick out instead of being cut into the panel
2. **Missing geometry** - Parts of the panel don't render at all
3. **Inverted faces** - Panel appears inside-out or has incorrect lighting
4. **Triangulation artifacts** - Strange triangular shapes or missing sections

## Debugging Tools

### Enable Debug Logging

In `PanelPathRenderer.tsx`, the `slot-geometry` debug tag logs detailed geometry information:

```typescript
import { enableDebugTag } from '../utils/debug';
enableDebugTag('slot-geometry');
```

This outputs:
- Outline point count and winding order (CW/CCW)
- Hole point counts and winding orders
- Whether holes are within outline bounds
- Winding correction actions taken

### Using the Debug Button

Click the Debug button in the header to copy diagnostic info to clipboard. This includes all tagged debug output.

## Key Concepts

### Winding Order

THREE.js ExtrudeGeometry expects specific winding orders:
- **Main shape (outline)**: Counter-clockwise (CCW) - negative signed area
- **Holes**: Clockwise (CW) - positive signed area

The signed area formula determines winding:
```typescript
const computeSignedArea = (points: PathPoint[]): number => {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    area += (p2.x - p1.x) * (p2.y + p1.y);
  }
  return area / 2;
};
// Positive area = CW, Negative area = CCW
```

**If holes render as extrusions**: Check if outline and holes have the same winding. They must be opposite.

### Degenerate Geometry

THREE.js triangulation (Earcut) fails with:

1. **Holes touching outline boundary** - Hole vertices on the outline edge
2. **Overlapping holes** - Two holes that share vertices or overlap
3. **Duplicate consecutive points** - Zero-length segments
4. **Self-intersecting paths** - Outline or hole crosses itself
5. **Holes outside outline** - Hole not fully contained within outline

### Path Direction

Paths should trace a continuous, closed loop:
- No backtracking over the same segment
- First and last points should be different (closePath() handles connection)
- Consecutive points should have non-zero distance

## Debugging Checklist

### 1. Check Winding Order

From debug output, verify:
```
Outline: signedArea=9515.20 (CW) <- Should be CW (our data) or CCW (THREE.js expects)
Holes: area=-38.40 (CCW) <- Should be opposite of outline
```

The renderer corrects winding automatically, but if it's not working:
- Outline CW → reversed to CCW
- Holes CCW → reversed to CW

### 2. Check Hole Bounds

Holes must be strictly inside the outline:
```
Outline bounds: [-50.0,-50.0 to 50.0,50.0]
Hole bounds: [-1.5,-32.0 to 1.5,-19.2] within=true
```

If `within=false` or hole bounds touch outline bounds, the hole is degenerate.

### 3. Check for Duplicate Points

Debug output flags duplicates:
```
⚠️ DUPLICATE POINTS IN OUTLINE: 1
  [5→6]: (10.00,20.00) → (10.00,20.00) dist=0.0000
```

### 4. Check Hole-Outline Overlap

If hole vertices match outline vertices exactly, the hole coincides with part of the outline (e.g., a finger joint tab). This creates impossible geometry.

Example of problematic overlap:
```
Outline points: ... [21](-22.8,-32.0) → [22](-25.8,-32.0) → [23](-25.8,-19.2) ...
Hole points: [0](-25.8,-32.0) → [1](-22.8,-32.0) → [2](-22.8,-19.2) → [3](-25.8,-19.2)
```
The hole vertices are the same as outline vertices - degenerate!

## Common Fixes

### Fix 1: Winding Order Correction (Rendering Layer)

In `PanelPathRenderer.tsx`, the renderer corrects winding:
```typescript
// Reverse outline if CW (positive area) to make CCW
const correctedOutline = outlineArea > 0 ? [...outline].reverse() : outline;

// Reverse holes if CCW (negative area) to make CW
const correctedHolePoints = holeArea < 0 ? [...hole.points].reverse() : hole.points;
```

### Fix 2: Filter Degenerate Holes (Rendering Layer)

Skip holes that touch the outline boundary:
```typescript
const touchesLeft = Math.abs(holeMinX - outlineMinX) < 0.01;
// ... similar for other edges
if (touchesLeft || touchesRight || touchesBottom || touchesTop) {
  continue; // Skip this hole
}
```

### Fix 3: Prevent Degenerate Holes (Data Generation Layer)

In slot generation code (e.g., `DividerPanelNode.computeHoles()`), check if slots would touch panel edges:
```typescript
const slotTouchesBoundary = isHorizontal
  ? (Math.abs(slotY - halfMt - (-halfH)) < tolerance)
  : (Math.abs(slotX - halfMt - (-halfW)) < tolerance);

if (slotTouchesBoundary) {
  continue; // Don't generate this slot
}
```

## Data Flow

Understanding where geometry is generated helps locate bugs:

```
BasePanel.computeOutline()     → Generates outline with finger joints
  ├── FacePanelNode.computeHoles()    → Generates slots for dividers
  └── DividerPanelNode.computeHoles() → Generates slots for intersecting dividers

panelBridge.ts                 → Converts engine snapshots to PanelPath type

PanelPathRenderer.tsx          → Converts PanelPath to THREE.js geometry
  └── createGeometryFromPath() → Creates THREE.Shape with holes
```

## Testing Path Validity

Run path validation tests:
```bash
npm test -- --grep "path validation"
```

Tests check for:
- Valid winding orders
- Holes within bounds
- No duplicate points
- No boundary-touching holes
- Minimum path lengths

## Adding New Debug Output

To add debugging for a new issue:

1. Import debug utilities:
```typescript
import { debug, enableDebugTag } from '../utils/debug';
enableDebugTag('my-tag');
```

2. Add debug statements:
```typescript
debug('my-tag', `Relevant info: ${value}`);
```

3. Check output via Debug button in header

## Related Files

- `src/components/PanelPathRenderer.tsx` - THREE.js geometry creation
- `src/engine/nodes/BasePanel.ts` - Outline generation
- `src/engine/nodes/FacePanelNode.ts` - Face panel holes
- `src/engine/nodes/DividerPanelNode.ts` - Divider panel holes
- `src/utils/debug.ts` - Debug logging system
