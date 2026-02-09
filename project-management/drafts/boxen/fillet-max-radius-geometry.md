# Maximum Safe Fillet Radius - Geometry Analysis

**Date:** 2026-02-05
**Status:** Draft

## Problem

When applying a fillet to a corner, the arc must be positioned so that the adjacent edges are **tangent** to the arc. This ensures:
1. Smooth transition (no kinks)
2. The arc "kisses" each edge at exactly one point
3. Predictable, professional-looking results

The current implementation may be calculating maximum radius incorrectly, leading to:
- Arcs that extend beyond edge boundaries
- "No free length on adjacent edges" errors on corners that visually have space

## Geometry of a Tangent Fillet

### Basic Setup

For a corner where two edges meet at angle θ (interior angle):

```
        Edge A
          |
          |
          *-------- Edge B
        corner
```

The fillet arc must:
1. Be tangent to Edge A at point P_a
2. Be tangent to Edge B at point P_b
3. Have its center at distance `r` from both edges (where r = fillet radius)

### Key Formula

For a 90° corner (most common case):

```
                    |
                    |  r
              P_a   *----+  (arc center)
                   /     |
                  /      | r
                 /       |
    ------------*--------+
               P_b    corner
```

The **tangent distance** (distance from corner to tangent point) equals:

```
tangent_distance = r * tan(θ/2)
```

For 90° (θ = π/2):
```
tangent_distance = r * tan(45°) = r * 1 = r
```

So for a 90° corner with radius 10, the arc touches each edge 10 units from the corner.

### Maximum Radius Calculation

The maximum safe radius is constrained by the **shorter adjacent edge**:

```
max_radius = min(edge_a_length, edge_b_length) / tan(θ/2)
```

For 90° corners:
```
max_radius = min(edge_a_length, edge_b_length)
```

### Non-90° Corners

For acute angles (< 90°), `tan(θ/2)` is smaller, so the tangent distance is smaller:
- Allows larger radius for same edge length

For obtuse angles (> 90°), `tan(θ/2)` is larger:
- Requires smaller radius to fit within edge length

### Edge Cases to Handle

1. **Very acute angles** (approaching 0°): tan(θ/2) → 0, but arc becomes nearly a straight line
2. **Very obtuse angles** (approaching 180°): tan(θ/2) → ∞, fillet becomes meaningless
3. **Shared edges**: When two fillets share an edge, their combined tangent distances must not exceed edge length

## Current Implementation Issues

Looking at `allCorners.ts:calculateMaxFilletRadius()`:

```typescript
const tanHalfAngle = Math.tan(halfAngle);
return (minEdge * 0.8) / tanHalfAngle;
```

Questions:
1. Is `halfAngle` calculated correctly? Should be `(π - interiorAngle) / 2` for exterior angle approach
2. The 0.8 safety factor - is this appropriate?
3. Are edge lengths being measured correctly (accounting for existing fillets on shared edges)?

## Proposed Fix

### 1. Correct Angle Calculation

The angle used should be the **interior angle** at the corner:

```typescript
// Vector from corner to previous point
const v1 = normalize(prev - corner);
// Vector from corner to next point
const v2 = normalize(next - corner);

// Interior angle using dot product
const interiorAngle = Math.acos(dot(v1, v2));

// Half angle for tangent calculation
const halfAngle = interiorAngle / 2;
```

### 2. Correct Max Radius Formula

```typescript
function calculateMaxFilletRadius(
  incomingEdgeLength: number,
  outgoingEdgeLength: number,
  interiorAngle: number
): number {
  // Guard against degenerate cases
  if (interiorAngle <= 0.01 || interiorAngle >= Math.PI - 0.01) {
    return 0;
  }

  const halfAngle = interiorAngle / 2;
  const tanHalf = Math.tan(halfAngle);

  // Maximum radius where tangent point stays within edge
  const maxFromIncoming = incomingEdgeLength / tanHalf;
  const maxFromOutgoing = outgoingEdgeLength / tanHalf;

  // Use smaller constraint, with safety margin
  const safetyFactor = 0.95; // Allow 95% of theoretical max
  return Math.min(maxFromIncoming, maxFromOutgoing) * safetyFactor;
}
```

### 3. Account for Adjacent Fillets

When multiple corners share an edge, the available edge length is reduced:

```typescript
function getAvailableEdgeLength(
  edgeLength: number,
  existingFilletAtStart: number,
  existingFilletAtEnd: number,
  cornerAngleAtStart: number,
  cornerAngleAtEnd: number
): number {
  const consumedAtStart = existingFilletAtStart * Math.tan(cornerAngleAtStart / 2);
  const consumedAtEnd = existingFilletAtEnd * Math.tan(cornerAngleAtEnd / 2);
  return edgeLength - consumedAtStart - consumedAtEnd;
}
```

## Visual Verification

A properly tangent fillet should:
1. Touch each edge at exactly one point (the tangent point)
2. Have no visible "kink" at the junction
3. The edge lines, if extended, would be tangent to the arc circle

## Testing

Test cases needed:
1. 90° corner with equal edge lengths
2. 90° corner with unequal edge lengths
3. Acute corner (45°)
4. Obtuse corner (135°)
5. Two adjacent corners sharing an edge
6. Corner with very short edges
7. Corner at extension/notch geometry

## User Override Option

It's possible to allow users to exceed the calculated maximum radius. The result:
- Arc will extend beyond the tangent points
- Adjacent edges will intersect the arc (not be tangent to it)
- Creates a "bulging" or "pinched" appearance depending on direction
- Technically valid geometry, just aesthetically unusual

**Recommendation:** Allow override with a warning indicator in the UI, but default to tangent-based maximum.

## Validation of Resultant Geometry

After applying a fillet, the system should validate:
1. **Tangency check**: Verify edges meet arc at tangent points (dot product of edge direction and arc tangent ≈ 1)
2. **No self-intersection**: The filleted outline doesn't cross itself
3. **Winding order preserved**: Outline remains properly wound (CCW for outer, CW for holes)
4. **Path continuity**: No gaps between arc endpoints and adjacent edges

This validation could be added to the geometry checker or as a post-fillet verification step.

## Entry Points for Exploration

Key files to investigate:

| File | Purpose |
|------|---------|
| `src/utils/allCorners.ts` | `calculateMaxFilletRadius()` - current max radius calculation |
| `src/utils/allCorners.ts` | `generateFilletArc()` - arc point generation |
| `src/engine/nodes/BasePanel.ts` | `applyFilletsToOutline()` - where fillets are applied to panel geometry |
| `src/engine/validators/` | Where geometry validation could be added |

### Specific Functions to Review

```
calculateMaxFilletRadius(incomingEdgeLength, outgoingEdgeLength, angle)
```
- Check how `angle` is computed (interior vs exterior)
- Check the formula against the tangent-based derivation above

```
generateFilletArc(corner, prev, next, radius)
```
- Check that arc endpoints are placed at correct tangent points
- Verify arc is generated in correct direction

## References

- Standard fillet geometry: tangent arcs at corner intersections
- CAD software typically uses same tangent-based approach
