# Corner Extension Rule for Adjacent Equal-Extension Edges

## Problem

When two adjacent edges on the same panel have equal extensions, they don't meet at a single corner point. Instead, there's a gap or step at the corner.

**Example:**
- Bottom edge extends down by 20mm (feet)
- Left edge extends left by 20mm (feet)
- Current result: L-shaped corner with gap
- Desired result: Clean diagonal or squared corner meeting at a single point

---

## Proposed Rule

### Rule: Adjacent Equal-Extension Corner Completion

**When two neighboring edges on the same panel both extend by equal amounts, the corner should extend diagonally to form a single point.**

**Formula:**
- If `edge_A_extension == edge_B_extension` (where A and B are adjacent edges)
- Corner point = `(base_corner.x + extension_A, base_corner.y + extension_B)`

**Conditions:**
1. Both edges must extend (extension > 0)
2. Extensions must be equal (within tolerance of 0.01mm)
3. Both edges must extend in the same "outward" direction (both additive)

**Corner calculation change:**
```
Current:  Each edge extends independently → L-shape with gap
Proposed: Equal extensions → single diagonal corner point
```

**Visual:**
```
Current (gap):              Proposed (single point):
    ┌──────                     ┌──────
    │                           │
    │   ┌────                   │
    │   │                       └────────
    └───┘
```

---

## Implementation Approach

### Location
`src/utils/panelGenerator.ts` - corner calculation section (lines ~700-1100)

### Logic Change

In the `extCorners` calculation, add detection for equal adjacent extensions:

```typescript
// For each corner, check if adjacent edges have equal extensions
const bottomLeftHasEqualExtensions =
  extBottom > 0 && extLeft > 0 && Math.abs(extBottom - extLeft) < 0.01;

// If equal, extend to single corner point
if (bottomLeftHasEqualExtensions) {
  extCorners.bottomLeft = {
    x: -halfW - extLeft,
    y: -halfH - extBottom
  };
}
```

### All Four Corners

| Corner | Adjacent Edges | Equal Extension Check | Single Point |
|--------|---------------|----------------------|--------------|
| topLeft | top, left | `extTop == extLeft` | `(-halfW - extLeft, halfH + extTop)` |
| topRight | top, right | `extTop == extRight` | `(halfW + extRight, halfH + extTop)` |
| bottomLeft | bottom, left | `extBottom == extLeft` | `(-halfW - extLeft, -halfH - extBottom)` |
| bottomRight | bottom, right | `extBottom == extRight` | `(halfW + extRight, -halfH - extBottom)` |

---

## Design Decisions (Confirmed)

- **Unequal extensions**: Keep L-shape gap (only merge when equal)
- **Tolerance**: Exact match only (0.01mm floating-point tolerance)

---

## Edge Cases

### 1. Only One Edge Extends
No change - current behavior is correct.

### 2. Unequal Extensions
Keep current L-shape/stepped behavior. No corner merging.

### 3. Perpendicular Panel Conflicts
When a perpendicular panel also extends on the shared edge, the "meeting" rules still apply. The equal-extension corner rule should only apply when there's no perpendicular conflict.

### 4. Interaction with Material Thickness Insets
If the edge also has finger joint insets (from adjacent solid faces), the base corner position includes those insets. The extension is additive from that base.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/utils/panelGenerator.ts` | Add equal-extension corner detection and calculation |
| `docs/geometry rules/geometry-rules.md` | Document new corner rule |

---

## Verification

1. **Visual check in 3D view**: Extended corners meet at single points
2. **Test with feet on multiple edges**: Configure feet on bottom + left edges with same height
3. **Test unequal extensions**: Verify L-shape preserved when extensions differ
4. **Geometry checker**: Run `checkEngineGeometry()` to ensure no invalid paths
5. **Export SVG**: Verify cut paths have clean corners
