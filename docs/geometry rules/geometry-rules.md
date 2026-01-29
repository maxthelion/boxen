# Geometry Rules

These rules define the geometric constraints for assemblies, faces, voids, and dividers.

## Motivation

- We need to assess all rules regarding geometry
- There are too many regressions

## Assembly Bounding Box

- Dictates where the faces would normally be
- Has 3 axes with finger points
- Has 6 planes that denote the outer faces of the face panels
- Face panels can be extended outside the bounding box via:
  - **Feet** (edge extensions on bottom edge)
  - **Inset/Outset tool** (moves panel surface in or out)
- **Key rule**: Extensions are additive - finger joints remain anchored to the bounding box
  - The mating edge (where joints connect) stays at the bounding box plane
  - Only the panel body/surface extends beyond
- Face panels can be moved out or in through the **push-pull operation**
  - This changes the assembly's bounding box (different from inset/outset)

## Assembly Void

- An assembly contains a void that is the inner dimensions
- This is smaller by 2x MT (material thickness) than the bounding box

## Face Panel Dimensions

- The faces of a box should be the same length as the bounding box when including fingers
- Where fingers are inset, the distance between the inset edges of the joint should be the same as the void's dimensions
- Faces intersect along a line/axis that should be one of the void's edge lines

## Subdivision / Divider Rules

- When a void is subdivided, the panels created should extend at their maximum to the assembly's boundaries (tips of fingers)
  - E.g., they should intersect the outer plane on Z axis, each MT/2 from the center of the divider's plane
- The inner part of the joint should run along the outer plane of the void

## Nested Subdivision Rules

- Where subdivisions are further divided, new voids should be created
- New voids should share a plane with their containing void if they touch it (e.g., first or last along the axis)
- New voids can share multiple outer planes with their containing void (maximum of 5)

---

## Additional Rules (from codebase analysis)

### Finger Joint Rules

- **Minimum 3-section guarantee**: Finger joints must allow at least 3 sections (finger-hole-finger pattern)
  - Formula: `maxJointLength >= fingerWidth * (3 + 2 * fingerGap)`
  - Where: `maxJointLength = axisLength - 2*MT`
- Finger width is auto-constrained based on available space
- Finger patterns are computed per-axis at the assembly level and shared by all panels

### Divider Body Span Rules

- Divider body extends from void boundary to reach walls
  - `bodyStart = atLowWall ? boundsLow : boundsLow - MT`
  - `bodyEnd = atHighWall ? boundsHigh : boundsHigh + MT`
- When bounded by solid faces: divider body = void size + 2*MT

### Slot Hole Constraints

- Slots are created where dividers intersect face panels
- Slot holes must NOT touch panel boundary edges (tolerance: 0.01mm)
- Only perpendicular dividers create slots (same-axis dividers don't intersect)

### Path Geometry Constraints (for THREE.js rendering)

- **Winding order**: Outline must be CCW, holes must be CW
- **Holes inside bounds**: All hole points must be strictly inside outline bounds
- **No degenerate paths**:
  - Minimum 3 points per path
  - No duplicate consecutive points (tolerance: 0.001mm)
  - Very small holes (< 1mm dimension) generate warnings

### Tolerance Values

| Context | Tolerance | Usage |
|---------|-----------|-------|
| Material Thickness | `0.01` mm | Checking if void reaches walls |
| Slot Boundary | `0.01` mm | Preventing slots at panel edges |
| Duplicate Points | `0.001` mm | Path validation |
| Hole Boundary | `0.01` mm | Hole inside-bounds check |

---

## Inconsistencies / Items Needing Clarification

### 1. Face Extension for Feet/Inset-Outset (CLARIFIED)

The rules mention: "Face planes can be extended outside the bounding box with inset/outset & edges (for feet)."

**Clarification**: Both **feet** and **inset/outset** extend panels outside the bounding box, but finger joints remain anchored to the bounding box. This means:
- Feet (edge extensions) and inset/outset add material beyond the bounding box boundary
- Finger joint patterns are calculated based on the original bounding box dimensions
- The mating edge (where joints connect) stays at the bounding box plane

This is correct behavior - the bounding box defines where panels mate, and extensions are purely additive.

### 2. Push-Pull vs Inset/Outset (CLARIFIED)

There are two distinct operations:
- **Inset/Outset**: Extends panel surface beyond bounding box. Joints stay anchored to original bounding box. Does NOT change assembly dimensions.
- **Push-Pull**: Actually moves the bounding box plane itself, changing assembly dimensions. Joints move with it.

**Question remaining**: Is push-pull fully implemented? How does it recalculate finger patterns when dimensions change?

### 3. Max 5 Shared Planes (CLARIFIED - Observation)

The rule states nested voids can share "maximum of 5" planes with their parent.

**Clarification**: This is an observation, not a rule to enforce. A child void can never share all 6 planes because subdivision always splits along one axis - by definition, the child void is smaller than the parent on at least one axis.

### 4. Divider Extends to "Tips of Fingers" (CLARIFIED)

The rule states dividers "should extend at their maximum to the assembly's boundaries (tips of fingers)".

**Clarification**: When a divider meets a solid face:
- The divider has **tabs** (finger joints) on that edge
- Those tabs extend **through slots in the face panel** to reach the assembly boundary
- "Tips of fingers" = the divider's tabs reaching the assembly outer surface

This is the same principle as face-to-face joints - tabs from one panel go through slots in the mating panel to reach the outer boundary.

---

## Geometry Checker

A geometry checking engine has been implemented at `src/engine/geometryChecker.ts` that validates:

1. `void-bounds-2mt` - Root void = assembly - 2×MT
2. `face-panel-body-size` - Face panels match assembly dimensions
3. `divider-body-span` - Dividers span void + 2×MT
4. `nested-void-shared-planes` - Max 5 shared planes
5. `finger-3-section-minimum` - Adequate space for finger patterns
6. `slot-within-panel` - Slots don't touch panel edges
7. `path-winding-order` - CCW outline, CW holes
8. `holes-inside-outline` - Holes within outline bounds
9. `no-degenerate-paths` - Valid path geometry

Usage:
```typescript
import { checkGeometry, formatGeometryCheckResult } from './engine/geometryChecker';

const result = checkGeometry(engine);
console.log(formatGeometryCheckResult(result));
```
