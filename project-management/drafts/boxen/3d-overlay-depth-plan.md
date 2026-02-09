# 3D Overlay Depth Management Plan

## Problem

Various 3D overlay elements (indicators, highlights, wireframes) can have z-fighting or incorrect depth ordering, causing:
- Elements hidden behind panels when they should be visible
- Flickering/z-fighting between overlapping elements
- Inconsistent visibility depending on camera angle

## Known Overlay Elements

### Currently Implemented

| Element | File | Current Depth Handling | Issues |
|---------|------|----------------------|--------|
| **Fillet corner circles** | `PanelCornerRenderer.tsx` | `zOffset = thickness/2 + 0.05`, `depthWrite={false}` | Only 2 visible, position at wrong corners |
| **Edge selection indicators** | `PanelEdgeRenderer.tsx` | ? | May be hidden by panels |
| **Panel wireframe edges** | `PanelPathRenderer.tsx` | ? | ? |
| **Bounding box lines** | `Box3D.tsx` | `<lineBasicMaterial>` | May z-fight with panels |
| **Void cell mesh** | `VoidMesh.tsx` | Transparent material | ? |
| **Push/pull arrows** | `PushPullArrow.tsx` | ? | ? |
| **Assembly axis indicator** | `AssemblyAxisIndicator.tsx` | ? | ? |
| **Sub-assembly wireframe** | `SubAssembly3D.tsx` | ? | ? |

### Potential Issues to Investigate

1. **Fillet circles at wrong position**
   - Circles positioned at original panel corners
   - Should be at extended corners (after edge extensions applied)
   - Need to account for `edgeExtensions` when computing corner positions

2. **Overlay visibility**
   - Elements may be occluded by panel geometry
   - Need consistent `depthTest`/`depthWrite` settings

3. **Render order**
   - Three.js renders by distance from camera by default
   - Transparent objects may need explicit `renderOrder`

---

## Investigation Tasks

### Task 1: Audit all overlay elements

For each overlay, document:
- [ ] File location
- [ ] Current z-offset or depth handling
- [ ] `depthTest` setting (default: true)
- [ ] `depthWrite` setting (default: true)
- [ ] `transparent` setting
- [ ] `renderOrder` if set
- [ ] Known visibility issues

### Task 2: Fix fillet circle positioning

**Problem**: `getCornerOffset()` uses panel dimensions without extensions

**Current code** (`PanelCornerRenderer.tsx`):
```typescript
const halfWidth = (panelWidth * scale) / 2;
const halfHeight = (panelHeight * scale) / 2;
const [localX, localY] = getCornerOffset(corner, halfWidth, halfHeight);
```

**Fix**: Account for edge extensions when computing corner positions
```typescript
// Get edge extensions for this panel
const extensions = panel.edgeExtensions ?? { top: 0, bottom: 0, left: 0, right: 0 };

// Compute extended corner position
function getExtendedCornerOffset(
  corner: CornerKey,
  halfWidth: number,
  halfHeight: number,
  extensions: EdgeExtensions,
  scale: number
): [number, number] {
  const ext = {
    top: extensions.top * scale,
    bottom: extensions.bottom * scale,
    left: extensions.left * scale,
    right: extensions.right * scale,
  };

  switch (corner) {
    case 'left:top':
      return [-(halfWidth + ext.left), halfHeight + ext.top];
    case 'right:top':
      return [halfWidth + ext.right, halfHeight + ext.top];
    case 'bottom:left':
      return [-(halfWidth + ext.left), -(halfHeight + ext.bottom)];
    case 'bottom:right':
      return [halfWidth + ext.right, -(halfHeight + ext.bottom)];
  }
}
```

### Task 3: Establish depth management conventions

**Proposed conventions:**

1. **Overlay elements on panel surface**:
   - `depthTest={true}` - respect panel occlusion
   - `depthWrite={false}` - don't occlude other overlays
   - z-offset: `thickness * scale / 2 + 0.1`

2. **Always-visible overlays** (selection highlights):
   - `depthTest={false}` - always visible
   - `depthWrite={false}`
   - Or use `renderOrder` with higher value

3. **Wireframes and lines**:
   - Consider `polygonOffset` for lines on surfaces
   - Or small z-offset in normal direction

4. **Transparent elements**:
   - Set explicit `renderOrder` for predictable ordering
   - Higher values render later (on top)

### Task 4: Implement fixes

Priority order:
1. Fix fillet circle positioning (blocking issue)
2. Audit edge selection indicators
3. Audit bounding box lines
4. Document conventions in code

---

## Files to Investigate

1. `src/components/PanelCornerRenderer.tsx` - Fillet circles
2. `src/components/PanelEdgeRenderer.tsx` - Edge selection
3. `src/components/PanelPathRenderer.tsx` - Panel wireframes
4. `src/components/Box3D.tsx` - Bounding box
5. `src/components/VoidMesh.tsx` - Void cells
6. `src/components/PushPullArrow.tsx` - Push/pull UI
7. `src/components/AssemblyAxisIndicator.tsx` - Axis indicator
8. `src/components/SubAssembly3D.tsx` - Sub-assembly wireframe

---

## Three.js Depth Reference

```typescript
// Depth testing: should this object be hidden by closer objects?
depthTest={true}   // Default - normal depth behavior
depthTest={false}  // Always render, ignore depth

// Depth writing: should this object hide farther objects?
depthWrite={true}  // Default - writes to depth buffer
depthWrite={false} // Doesn't affect depth buffer (good for overlays)

// Render order: explicit ordering for transparent objects
renderOrder={0}    // Default
renderOrder={10}   // Renders later (on top of renderOrder < 10)

// Polygon offset: offset depth for coplanar geometry
<meshBasicMaterial polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
```

---

## Success Criteria

- [ ] All 4 fillet circles visible at correct (extended) corner positions
- [ ] Edge selection indicators visible when edges selected
- [ ] Bounding box lines visible without z-fighting
- [ ] Consistent depth behavior across all overlays
- [ ] Documented conventions for future overlay elements
