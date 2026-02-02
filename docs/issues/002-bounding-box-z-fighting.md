# Issue 002: Bounding Box Lines Z-Fighting with Geometry

**Date Reported:** 2026-02-02
**Status:** Open
**Branch:** main
**Commit:** 7d0adf180067dfa99cf13f3f399885f5c8a27c33

## Description

The bounding box wireframe lines clash visually with the panel geometry, causing z-fighting artifacts. The bounding box lines appear to be rendered at exactly the same depth as panel edges, resulting in flickering/fighting where they overlap.

### Visual Evidence

![Bounding box z-fighting](images/002-bounding-box-z-fighting.jpeg)

The red/orange lines of the bounding box can be seen fighting with the panel edges, particularly visible along vertical edges where the bounding box line and panel edge occupy the same position.

### Expected Behavior

Bounding box lines should render cleanly without z-fighting. They should sit slightly outward from the actual geometry they bound.

### Actual Behavior

Bounding box lines render at the exact position of panel edges, causing visual artifacts where both try to occupy the same depth position.

## Technical Analysis

The bounding box is likely computed from the exact extents of the panel geometry. When rendered, these lines occupy the same 3D coordinates as panel edges, causing the GPU to struggle with depth ordering (z-fighting).

## Recommended Fix

Add a small offset/padding to the bounding box calculation so the wireframe sits slightly outside the geometry it bounds. A value of 0.1-0.5mm should be sufficient to eliminate z-fighting without visibly changing the bounding box appearance.

```typescript
// Example fix in bounding box calculation
const BOUNDING_BOX_PADDING = 0.2; // mm

const bounds = {
  min: { x: minX - BOUNDING_BOX_PADDING, y: minY - BOUNDING_BOX_PADDING, z: minZ - BOUNDING_BOX_PADDING },
  max: { x: maxX + BOUNDING_BOX_PADDING, y: maxY + BOUNDING_BOX_PADDING, z: maxZ + BOUNDING_BOX_PADDING },
};
```

Alternative approaches:
- Use `depthTest: false` on the bounding box material (renders on top of everything)
- Use `polygonOffset` on the panel materials to push them slightly back
- Render bounding box in a separate pass

## Affected Code

- Bounding box rendering code (likely in `src/components/Box3D.tsx` or similar)
- Possibly `src/components/PanelPathRenderer.tsx` if bounding box is computed per-panel

## Related Files

- Need to identify where bounding box is rendered
