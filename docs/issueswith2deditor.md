# Issues with 2D Editor Implementation

This document tracks issues encountered with the 2D sketch editor. Issues are categorized by the underlying system they affect.

---

## Two Distinct Systems

The 2D editor has two fundamentally different systems for modifying panel geometry:

### 1. Boolean Polygon Operations

**Purpose**: Add or subtract shapes that interact with the panel boundary.

**How it works**: Uses polygon boolean library (`polygonBoolean.ts`) to compute union or difference between the panel outline and a user-drawn shape.

**Storage**: `_panelModifiedSafeAreas` stores the resulting outline.

**Use cases**:
- Adding a tab/extension that sticks out from the panel
- Cutting a notch from the panel edge
- Any shape that crosses the panel boundary

### 2. Edge Path Editing (Fork/Merge)

**Purpose**: Directly manipulate the geometry of a specific edge.

**How it works**: User draws points along an edge using (t, offset) coordinates:
- `t`: normalized position along edge (0 = start, 1 = end)
- `offset`: perpendicular distance from original edge line (positive = outward)

**Storage**: `customEdgePaths` array on the panel, one entry per modified edge.

**Use cases**:
- Drawing a custom profile along the top edge
- Creating decorative wave patterns
- Adding feet or notches at specific positions along an edge

**NOT a boolean operation** - this is direct point-by-point definition of edge geometry.

### 3. Interior Cutouts

**Purpose**: Cut holes entirely inside the panel body.

**How it works**: Stores cutout shapes (rect, circle, path) that become holes in the THREE.js extrusion.

**Storage**: `_panelCutouts` map.

**Use cases**:
- Ventilation holes
- Cable pass-through holes
- Decorative interior cutouts

**Constraint**: Cutouts must be entirely inside the panel outline. THREE.js cannot render holes that extend outside the main shape.

---

## Category A: Boolean Polygon Operation Issues

### Issue A1: Boundary-crossing polygon creates extrusion instead of cutting

**Screenshots**: `002-polygonpathonboundary1.jpg`, `002-polygonpathonboundary2.jpg`

**Symptom**: Drawing a polygon that crosses the panel boundary and selecting "Cut hole" creates a 3D **extrusion sticking out** instead of cutting a notch.

**Root Cause**: The code uses `ADD_CUTOUT` for all subtractive polygons. But cutouts are rendered as THREE.js holes, which cannot extend outside the main shape. THREE.js exhibits undefined behavior (extrusions, artifacts).

**Correct Behavior**: Boundary-crossing subtractive polygons should use `APPLY_EDGE_OPERATION` with `difference`, not `ADD_CUTOUT`.

### Issue A2: Boundary-crossing polygon appears as overlay, not merged

**Screenshots**: `003-polygonpathonboundary1.jpg`, `003-polygonpathonboundary2.jpg`, `003-polygonpathonboundary3.jpg`

**Symptom**: Polygon appears as dark overlay in 2D, creates extrusion in 3D.

**Root Cause**: Same as A1.

### Issue A3: No polygon classification before applying operations

**Symptom**: The UI doesn't determine whether a polygon is interior, boundary-crossing, or exterior before deciding how to apply it.

**Required Fix**: Classify polygon location and route to correct action:

| Polygon Location | Cut hole | Add material |
|-----------------|----------|--------------|
| **Entirely inside** | `ADD_CUTOUT` | Invalid (show error) |
| **Crosses boundary** | `APPLY_EDGE_OPERATION` difference | `APPLY_EDGE_OPERATION` union |
| **Entirely outside** | Invalid (show error) | `APPLY_EDGE_OPERATION` union |

---

## Category B: Edge Path Editing Issues

These issues relate to the (t, offset) coordinate system for direct edge manipulation.

### Issue B1: Fork start point not snapping to existing path offset

**Symptom**: When starting a fork on an edge that already has a custom path, the first point's offset should match the existing path's offset at that t position. Otherwise it creates a slope/jump.

**Status**: Fixed - Added `getEdgePathOffsetAtT()` helper to interpolate existing path offset.

### Issue B2: Merge point not snapping to existing path offset

**Symptom**: When completing a fork (clicking back on the edge), the merge point should also snap to the existing path's offset at that t position.

**Status**: Fixed - Same fix as B1.

### Issue B3: New path not merging with existing edge path

**Symptom**: After adding a rectangle extension to an edge, drawing a manual path causes both to disappear - only the new path remains.

**Root Cause**: Commit logic replaced the entire edge path instead of merging. New anchor points at t=0 and t=1 with offset=0 overwrote existing modifications.

**Status**: Fixed - Updated commit logic to:
1. Keep existing points outside new path's t-range
2. Insert new points
3. Preserve existing path's start/end offsets for anchors

### Issue B4: Edge path creating diagonal lines from corners

**Symptom**: After applying an edge path that doesn't start at t=0 or end at t=1, diagonal lines connect path endpoints to panel corners.

**Root Cause**: Missing anchor points at t=0 and t=1 to preserve original edge segments.

**Status**: Fixed - Added anchor points during commit.

### Issue B5: Coordinate system confusion

**Problem**: The `PathPoint` type is overloaded:
- For edge paths: `x` = t (0-1), `y` = offset (mm)
- For polygons: `x` = panel x (mm), `y` = panel y (mm)

This makes the code confusing and error-prone.

**Proposed Fix**: Use discriminated union for draft state:
```typescript
type DraftState =
  | { type: 'edge-path'; edge: EdgePosition; points: EdgePathPoint[] }
  | { type: 'polygon'; points: Point2D[] };
```

---

## Category C: UI/Interaction Issues

### Issue C1: Boundary detection failing for finger joint tabs

**Symptom**: Clicking on panel boundary was classified as 'open-space' instead of 'boundary'.

**Root Cause**: Bounds check happened before boundary proximity check. Finger joint tabs extend beyond panel body.

**Status**: Fixed - Reordered checks in `classifyClickLocation()`.

### Issue C2: Stale draftPoints in useCallback

**Symptom**: Adding points to draft had stale state.

**Status**: Fixed - Added `draftPoints` to dependency array.

### Issue C3: Polygon cutout shifting position when applied

**Symptom**: Hole appeared at different position than where drawn.

**Root Cause**: `pathCutoutToHole` wasn't adding center offset to points.

**Status**: Fixed.

---

## Architecture Overview

```
User Action
    │
    ├─► Draw polygon ──► Classify location ──┬─► Interior ──► ADD_CUTOUT
    │                                        ├─► Boundary ──► APPLY_EDGE_OPERATION
    │                                        └─► Exterior ──► APPLY_EDGE_OPERATION (or error)
    │
    └─► Draw on edge ──► Edge Path System ──► SET_EDGE_PATH
                         (t, offset coords)
```

---

## Revised Architecture: Boolean → CustomEdgePath Extraction

**Reference**: `docs/issueswith2drenderer/IMG_8241.jpeg`

### Current Approach (Wrong)
```
Boolean op → Full polygon result → Replaces entire outline via modifiedOutlinePolygon
```
This bypasses edgeExtensions, customEdgePaths, cornerFillets - nothing composes.

### New Approach
```
Boolean op on COPY → Extract affected edge(s) → Convert to (t, offset) → Store as customEdgePath
```

### Algorithm

1. **Compute boolean** (union/difference) on a copy of the panel outline
2. **Identify affected edges** by comparing result points to original edge positions
3. **For each affected edge**:
   - Extract the portion of the result polygon that replaces that edge
   - Convert absolute coordinates to (t, offset) relative to original edge line
   - Store as `customEdgePath` for that edge (replaces any existing path on that edge)
4. **Unaffected edges keep their existing customEdgePaths**

### Example: Triangle Union on Top Edge

```
Original panel:     ┌────────────┐
                    │            │
                    └────────────┘

Added polygon:          △ (triangle on top)

Boolean result:     ┌────/\──────┐
                    │            │
                    └────────────┘

Extracted edge:     ────/\──────  (just the top edge, as open path)

Stored as customEdgePath for "top":
  points: [
    { t: 0, offset: 0 },
    { t: 0.3, offset: 0 },
    { t: 0.5, offset: 20 },  // peak of triangle
    { t: 0.7, offset: 0 },
    { t: 1, offset: 0 }
  ]
```

### Example: Circle Union on Left Edge (with existing modifications)

```
Original (has notches):  ┌──┐  ┌──┐
                         │  │  │  │
                         └──┘  └──┘

Added polygon: ○ (circle on left edge)

Result: Only LEFT edge affected
        Other edges keep existing customEdgePaths
```

### Benefits

1. **Composable**: edgeExtensions, cornerFillets still work
2. **Scoped**: Only affected edges are modified
3. **Unified**: Boolean ops become another way to generate customEdgePaths
4. **Reversible**: Can clear individual edge paths without losing others

### Edge Cases

1. **Shape spans corner** (affects 2 edges): Extract separate customEdgePath for each edge
2. **Existing customEdgePath on affected edge**: Replace it with the new boolean-derived path
3. **Interior-only polygon**: Use ADD_CUTOUT (hole), not this system

---

## Implementation Priority

### HIGH (Immediate) - ✅ IMPLEMENTED (2025-02-02)
1. ✅ Fix polygon classification (Issues A1, A2, A3)
   - Added `classifyPolygon()` utility in `polygonBoolean.ts`
   - Interior → ADD_CUTOUT
   - Boundary-crossing → New boolean-to-edge-path system

2. ✅ Implement boolean-to-customEdgePath extraction
   - Added `extractAffectedEdges()` in `polygonBoolean.ts`
   - Modified `applyEdgeOperation()` in Engine.ts to:
     - Compute boolean on rectangular base (no finger joints)
     - Detect affected edges
     - Extract edge portions
     - Convert to (t, offset) coordinates
     - Store as `customEdgePath` via SET_EDGE_PATH

### MEDIUM
3. Add validation/feedback for invalid operations
4. Debug visualization for polygon classification

### LOW (Future Refactor)
5. Strongly type draft state to eliminate PathPoint overloading
6. Remove `modifiedOutlinePolygon` system (no longer used by new approach)

---

## Files Modified

| File | Changes |
|------|---------|
| `src/components/SketchView2D.tsx` | ✅ Added polygon classification before applying operations |
| `src/utils/polygonBoolean.ts` | ✅ Added `isPointInPolygon()`, `classifyPolygon()`, `extractAffectedEdges()`, `extractEdgePathFromPolygon()` |
| `src/engine/Engine.ts` | ✅ Modified `APPLY_EDGE_OPERATION` to use edge extraction instead of storing full polygon |
| `src/engine/nodes/BasePanel.ts` | May be able to remove `_modifiedOutlinePolygon` eventually |

---

## Test Cases

### Boolean Polygon Operations
1. Interior polygon + cut hole → `ADD_CUTOUT` creates hole
2. Boundary-crossing polygon + cut hole → `APPLY_EDGE_OPERATION` difference creates notch
3. Boundary-crossing polygon + add material → `APPLY_EDGE_OPERATION` union extends panel
4. Exterior polygon + add material → `APPLY_EDGE_OPERATION` union extends panel
5. Interior polygon + add material → Error/disabled
6. Exterior polygon + cut hole → Error/disabled

### Edge Path Editing
7. Fork from unmodified edge → First point at offset=0
8. Fork from modified edge → First point at interpolated offset
9. Add second path to edge with existing path → Both paths preserved
10. Path not starting at t=0 → Anchor added, no diagonal to corner

---

## Category D: Post-Refactor Issues

Issues discovered after the boolean-to-edge-path refactor. These should be tackled holistically.

### Issue D1: Cursor doesn't change when path tool is selected

**Status**: ✅ FIXED

**Symptom**: When the path drawing tool is active, the cursor remains as default pointer instead of changing to crosshair.

**Fix Applied**: Updated `getCursor()` in `SketchView2D.tsx` to return `'crosshair'` when the path tool is selected, not just when actively drawing.

**File**: `src/components/SketchView2D.tsx`

### Issue D2: Edge detection threshold too aggressive for path tool

**Status**: ✅ FIXED

**Symptom**: When clicking near (but not on) an edge to start a free-floating polygon, the system interprets the click as an edge path start instead.

**Fix Applied**: Reduced the hit distance in `findEdgeAtPoint()` from `Math.max(8, viewBox.width / 25)` to `Math.max(4, viewBox.width / 50)`. This makes edge detection more precise and less likely to catch clicks intended for open space.

**File**: `src/components/SketchView2D.tsx`

### Issue D3: Interior polygon not creating cutout

**Status**: ✅ FIXED

**Symptom**: Drawing a polygon path entirely within the panel boundaries and selecting "Cut hole" does not create a cutout. The polygon just disappears.

**ROOT CAUSE**: Polygons with edges that **touch** (but don't cross) the panel boundary were misclassified as `'boundary'` instead of `'interior'`.

**Fix Applied**: Updated `classifyPolygon()` in `polygonBoolean.ts` to distinguish between:
- Edges that **overlap/touch** → classified as `'interior'`
- Edges that **cross** (points on both sides) → classified as `'boundary'`

**Files**:
- `src/utils/polygonBoolean.ts` (classifyPolygon, polygonsIntersect)

### Issue D4: Rectangle extension on modified edge doesn't merge with existing path

**Status**: ✅ FIXED

**Symptom**: Adding a second extension to a panel that already has one would lose the first extension.

**ROOT CAUSE**: Boolean operation was computed against a simple rectangle instead of the current panel outline.

**Fix Applied**: Updated `applyEdgeOperation` in `Engine.ts` to:
1. Get the current modified outline (or original outline with finger joints)
2. Apply boolean operation to that outline
3. Store the result via `setModifiedSafeArea`

This preserves all previous modifications when adding new ones.

### Issue D5: Boundary polygon creates shape but doesn't merge with panel

**Status**: ✅ FIXED

**Screenshots**: `004-freeform-path1.jpg`, `004-freeform-path2.jpg`

**Symptom**: Drawing a freeform polygon that crosses the panel boundary would appear as overlay instead of merging.

**ROOT CAUSE**: Same as D4 - boolean was computed against wrong reference geometry.

**Fix Applied**: Same fix as D4 - boolean now operates on the actual panel outline.

### Issue D6: Boundary polygon with "Extend" makes shape disappear

**Status**: ✅ FIXED

**Symptom**: Extending a panel with a boundary-crossing polygon would cause the shape to disappear.

**ROOT CAUSE**: Same as D4/D5 - the edge extraction pipeline was failing because boolean was computed against simple rectangle.

**Fix Applied**: Simplified approach - boolean operations now directly modify the panel outline stored in `_panelModifiedSafeAreas`, bypassing the complex edge extraction pipeline. The panel uses this modified outline directly via `setModifiedOutlinePolygon`.

### Issue D7: Edge path points connected in wrong order after apply

**Status**: ✅ FIXED

**Screenshots**: `005-edge-path1.jpg`, `005-edge-path2.jpg`

**Symptom**: Drawing an edge path with points that don't go strictly left-to-right (e.g., a peaked shape where you draw up, across, then down) results in the points being connected in the wrong order after applying. The path creates a zigzag instead of the intended shape.

**ROOT CAUSE**: The edge path commit logic in `useEditorContext.ts` was sorting all points by their `t` value (position along edge). This assumed paths always go monotonically left-to-right, breaking paths where the user intentionally crosses back (e.g., drawing a peak or valley).

**Fix Applied**: Removed the sorting of user-drawn points. Points are now kept in click order, preserving the user's intended path shape. The t-range is still calculated (using min/max) for merging with existing paths, but the points themselves maintain their original order.

**Files**:
- `src/editor/useEditorContext.ts` (commit logic)

### Issue D8: Boolean operations not clipped to safe space boundary

**Status**: 🔴 OPEN

**Symptom**: Boolean operations (cut/extend) that straddle both safe space and forbidden joint areas incorrectly modify the joint geometry. Cuts should be clipped to the safe space boundary and not affect finger joints.

**Example**: A shape drawn partially over the safe space and partially over a jointed edge creates jagged lines crossing into the joint area, corrupting the finger joint pattern.

**Expected Behavior**:
- Boolean operations should only affect the safe space region
- Shapes that extend into forbidden (jointed) areas should be clipped to the safe space boundary
- Finger joint geometry should remain untouched

**Root Cause**: The boolean operation is applied directly to the full panel outline (including finger joints) without first clipping the user's shape to the safe space bounds.

**Proposed Fix**:
1. Before applying boolean: intersect the user's shape with the safe space polygon
2. Apply boolean only with the clipped shape
3. This preserves finger joints while allowing cuts/extensions up to the safe space boundary

**Files**:
- `src/engine/Engine.ts` (applyEdgeOperation - needs to clip shape to safe space first)
- `src/engine/safeSpace.ts` (may need to expose safe space polygon for clipping)
