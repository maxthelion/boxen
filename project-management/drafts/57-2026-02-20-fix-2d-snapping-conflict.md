---
**Processed:** 2026-02-23
**Mode:** automated
**Actions taken:**
- Sent open questions to human inbox for resolution before task creation
- No tasks proposed (open questions blocking)
**Outstanding items:** Open questions at line 98-103 need human answers before implementation can be scoped
---

# Fix 2D Snapping: Guideline vs Axis Constraint Conflict

**Status:** Partial
**Captured:** 2026-02-20
**Source:** PR #48 / TASK-a6f7f4cf (2D View Snapping System)

## Raw

> 48 had lots of issues but was heading in the right direction. These included: the snapping to guidelines was conflicting with snapping to x, y or diagonal when shift was held down. I think there are 2 separate coordinate systems at work or something.

## Investigation Findings

### Not a coordinate space problem

Both systems operate in the same SVG coordinate space (panel-local, centered at 0,0). The coordinate transform chain is:

```
Screen (clientX, clientY)
  → screenToSvg() — accounts for SVG aspect ratio, Y-flip
  → SVG space (panel-local, origin at center)
    → snapping operates here
    → angle constraint operates here
```

No coordinate mismatch.

### The real problem: ordering

The conflict is in the **pipeline ordering**. In `handleMouseDown`:

```typescript
// Step 1: Snap to nearest guideline/vertex/edge
const snappedPos = snapResult ? snapResult.point : svgPos;

// Step 2: If shift held, constrain angle FROM the snapped position
let newPoint = { x: snappedPos.x, y: snappedPos.y };
if (isShiftHeld && draftPoints.length > 0) {
  const lastPoint = draftPoints[draftPoints.length - 1];
  newPoint = constrainAngle(lastPoint, snappedPos);  // Overrides snap
}
```

What happens:
1. Cursor is near a vertical guideline at x=50
2. Snap moves point to (50, y) — guideline highlights, snap indicator appears
3. Shift is held — `constrainAngle()` locks to nearest 45-degree angle from last point
4. The angle-constrained point lands at (47, y') — **off the guideline**
5. User sees highlighted guideline but the placed point isn't on it

The visual feedback is lying to the user.

### Snap system architecture (PR #48)

**Snap priority (highest to lowest):**
1. Point snap — outline vertices (corners, finger joint tips)
2. Intersection snap — where two guide lines cross
3. Edge snap — nearest point on an outline segment
4. Guide-line snap — nearest single guide line

**Guide lines include:**
- Center lines (x=0, y=0)
- Panel boundary edges (±halfW, ±halfH)
- Finger joint tip positions (outer edges of tabs)

**Key files:**
- `src/utils/snapGuides.ts` (375 lines) — core snap system
- `src/components/SketchView2D.tsx` — integration, ~lines 1787-1809 for snap in mousemove
- `tests/unit/utils/snapGuides.test.ts` (456 lines, 28+ tests) — good coverage

### Snap threshold
- `Math.max(viewBox.width, viewBox.height) / 40` (2.5% of viewport)
- Scales with zoom — good

## Proposed Fix: Compose Instead of Override

The fix is to make the two systems **compose** rather than run sequentially. Three approaches:

### Option A: Constrain first, then snap (recommended)

```
raw cursor → constrainAngle (if shift) → findSnapPoint → final position
```

Apply angle constraint first to get a line of valid positions, then snap to the nearest guideline **on that constrained line**. This means:
- Without shift: snap freely to any guideline
- With shift: only snap to guidelines that intersect the constraint axis

Implementation: `findSnapPoint` already supports single-axis snapping. Pass the constrained axis direction and only consider guides perpendicular to it.

### Option B: Snap first, then only constrain to snapped guides

If a snap is active, skip angle constraint entirely. The snap takes priority. This is simpler but means shift does nothing when near a guideline.

### Option C: Snap-aware angle constraint

Run both, then pick the result that satisfies the most constraints simultaneously. Find the nearest 45-degree angle from the last point that also falls on a nearby guideline. If no such point exists, fall back to angle constraint alone.

## Open Questions

- Which option matches user expectations from Figma/Illustrator?
- Should edge-relative snapping (for the path tool's edge operations) also compose with shift?
- The `handleMouseMove` preview also needs the same fix — snap indicator should reflect the final composed position

## Possible Next Steps

- Write integration tests that reproduce the conflict: shift-draw near a guideline, verify the placed point is on the guideline AND angle-constrained
- Implement Option A in `findSnapPoint` — add an optional `constraintAxis` parameter
- Update both `handleMouseMove` (preview) and `handleMouseDown` (commit) to use the composed pipeline
- Verify snap indicator matches the actual placed point
