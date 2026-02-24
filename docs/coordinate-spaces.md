# Coordinate Spaces in Boxen

This document describes every coordinate space used in the Boxen 3D view, how transforms chain between them, and which files use each space.

---

## Overview

```
panel-local 2D (mm)
      │  FacePanelNode.computeTransform()
      │  DividerPanelNode.computeTransform()
      ▼
engine world space (mm, centered at origin)
      │  × scale factor (Box3D.tsx)
      ▼
Three.js world space (normalized units)
      │  camera at [150, 150, 150]
      ▼
screen / camera space
```

There is also a parallel 2D path for panel editing:

```
screen (clientX, clientY)
      │  screenToSvgCoords()  (sketchCoordinates.ts)
      ▼
SVG / sketch space (mm, panel-local, Y-flipped)
      │  scale(1,-1) SVG transform
      ▼
panel-local 2D (mm, Y up)
```

---

## Space 1: Assembly-Local Space

**Units:** millimetres
**Origin:** negative corner of the assembly bounding box (x=0, y=0, z=0)
**Range:** `(0..width, 0..height, 0..depth)`

This is used internally for **void and subdivision bounds**. Assembly dimensions are always in mm. The void tree stores all bounds in this space.

### Conversion to world space
```
world.x = assembly_local.x - width  / 2
world.y = assembly_local.y - height / 2
world.z = assembly_local.z - depth  / 2
```

### Files that use it
| File | Usage |
|------|-------|
| `src/engine/nodes/VoidNode.ts` | `VoidNode.bounds` — all void bounds in assembly-local mm |
| `src/engine/nodes/BaseAssembly.ts` | `computeInteriorBounds()` and slot hole geometry |
| `src/engine/nodes/FacePanelNode.ts` | `computeHoles()` — void bounds passed in from `getSubdivisions()` |
| `src/engine/nodes/SubAssemblyNode.ts` | `getWorldTransform()` converts void center from assembly-local to world |
| `src/engine/panelBridge.ts` | `voidNodeToVoid()` — copies bounds as-is into store `Void.bounds` |
| `src/store/useBoxStore.ts` | `Void.bounds` — stored as assembly-local mm |

---

## Space 2: Panel-Local 2D Space

**Units:** millimetres
**Origin:** center of the panel face
**Axes:** X right, Y up, Z out of the face (towards the viewer in 2D sketch)
**Range:** `(-width/2..width/2, -height/2..height/2)`

This is the coordinate system for all **panel geometry** — outline paths, slot holes, cutout shapes, and edge segment classification. All `PathPoint` arrays in `PanelPath.outline.points` and `PanelPath.holes[].path.points` are in this space.

```typescript
// Top edge boundary in panel-local space:
top: { start: { x: -halfW, y: halfH }, end: { x: halfW, y: halfH } }
// Bottom edge:
bottom: { start: { x: -halfW, y: -halfH }, end: { x: halfW, y: -halfH } }
```

### Files that use it
| File | Usage |
|------|-------|
| `src/engine/nodes/BasePanel.ts` | `computeOutline()` — generates outline PathPoints |
| `src/engine/nodes/FacePanelNode.ts` | `computeHoles()` — slot hole PathPoints |
| `src/engine/nodes/DividerPanelNode.ts` | All geometry computations |
| `src/utils/sketchCoordinates.ts` | `classifySegment()`, `getEdgeSegments()`, `getConceptualBoundary()`, `svgToEdgeCoords()`, `edgeCoordsToSvg()` |
| `src/components/SketchView2D.tsx` | Renders panel outlines directly in panel-local; applies `scale(1,-1)` to SVG group |
| `src/engine/safeSpace.ts` | `SafeSpaceRegion` bounds in panel-local mm |

---

## Space 3: Engine World Space

**Units:** millimetres
**Origin:** center of the main assembly bounding box
**Axes:** Three.js convention — Y up, Z towards viewer (right-handed)

This is the space that `PanelPath.position` lives in. Panels are positioned relative to the assembly center in mm.

The **main assembly** always has its world transform at the origin:
```typescript
// AssemblyNode.ts:42
getWorldTransform(): Transform3D {
  return { position: [0, 0, 0], rotation: [0, 0, 0] };
}
```

**Sub-assemblies** are positioned by their void center offset from the main assembly center:
```typescript
// SubAssemblyNode.ts:121
getWorldTransform(): Transform3D {
  // void center in assembly-local coords
  const voidCenterX = bounds.x + bounds.w / 2;
  // Convert to world (subtract half dims to center at origin)
  position: [voidCenterX - halfW + positionOffset.x, ...]
}
```

### Face panel positions
`FacePanelNode.computeTransform()` places each face at its outer surface center:
```typescript
// FacePanelNode.ts:153
case 'front': return { position: [ax, ay, az + halfD - mt/2], rotation: [0, 0, 0] };
case 'back':  return { position: [ax, ay, az - halfD + mt/2], rotation: [0, Math.PI, 0] };
case 'left':  return { position: [ax - halfW + mt/2, ay, az], rotation: [0, -Math.PI/2, 0] };
case 'right': return { position: [ax + halfW - mt/2, ay, az], rotation: [0,  Math.PI/2, 0] };
case 'top':   return { position: [ax, ay + halfH - mt/2, az], rotation: [-Math.PI/2, 0, 0] };
case 'bottom':return { position: [ax, ay - halfH + mt/2, az], rotation: [ Math.PI/2, 0, 0] };
```

### Divider panel positions
`DividerPanelNode.computeTransform()` uses void bounds to center the divider in its axis:
- X-axis divider: rotated `[0, Math.PI/2, 0]`, centered in the YZ plane at `x = sub.position`
- Y-axis divider: rotated `[-Math.PI/2, 0, 0]`, centered at `y = sub.position`
- Z-axis divider: no rotation, centered at `z = sub.position`

### Files that use it
| File | Usage |
|------|-------|
| `src/engine/nodes/FacePanelNode.ts` | `computeTransform()` — produces position/rotation in engine world mm |
| `src/engine/nodes/DividerPanelNode.ts` | `computeTransform()` — produces position/rotation in engine world mm |
| `src/engine/types.ts` | `Transform3D { position: [number,number,number]; rotation: [number,number,number] }` |
| `src/engine/panelBridge.ts` | Copies `derived.worldTransform` into `PanelPath.position` and `PanelPath.rotation` |
| `src/components/Box3D.tsx` | `boxCenter = { x: width/2, y: height/2, z: depth/2 }` — void mesh centering |
| `src/components/PushPullArrow.tsx` | `position` prop is in engine world mm (before scale) |

---

## Space 4: Three.js World Space (Normalized)

**Units:** Three.js units (dimensionless, proportional to mm × scale)
**Origin:** center of the main assembly (same as engine world origin)
**Scale factor:** `scale = 100 / Math.max(width, height, depth)` — the longest dimension becomes 100 units

Computed in `Box3D.tsx`:
```typescript
// Box3D.tsx:71
const scale = 100 / Math.max(width, height, depth);
```

All Three.js rendering uses this normalized scale. `PanelPathRenderer` receives `scale` as a prop and applies it in two places:

1. **Position**: `scaledPosition = position * scale` — placed on the Three.js `<group>`
2. **Geometry**: `shape.moveTo(point.x * scale, point.y * scale)` inside `createGeometryFromPath()`

```typescript
// PanelPathRenderer.tsx:307
const scaledPosition: [number, number, number] = useMemo(() => [
  position[0] * scale,
  position[1] * scale,
  position[2] * scale,
], [position, scale]);
```

The wireframe bounding box is created directly in Three.js world units:
```typescript
// Box3D.tsx:120
new THREE.BoxGeometry(boundingBoxW * 1.001, boundingBoxH * 1.001, boundingBoxD * 1.001)
// where boundingBoxW = config.width * scale
```

The grid floor is placed at `y = -60` (Three.js units), matching the bottom of a typical box.

### Face normals in Three.js world space
`PushPullArrow.tsx` defines face normals directly in Three.js world space:
```typescript
// PushPullArrow.tsx:19
case 'front':  return new THREE.Vector3(0, 0, 1);
case 'back':   return new THREE.Vector3(0, 0, -1);
case 'left':   return new THREE.Vector3(-1, 0, 0);
case 'right':  return new THREE.Vector3(1, 0, 0);
case 'top':    return new THREE.Vector3(0, 1, 0);
case 'bottom': return new THREE.Vector3(0, -1, 0);
```

Drag projection uses a view-aligned plane intersected in Three.js world space.

### Files that use it
| File | Usage |
|------|-------|
| `src/components/Box3D.tsx` | Computes `scale` and `scaledW/H/D`; passes `scale` to all sub-components |
| `src/components/PanelPathRenderer.tsx` | Applies `scale` to positions and path geometry |
| `src/components/PushPullArrow.tsx` | Arrow position, face normals, and drag math in Three.js world space |
| `src/components/VoidMesh.tsx` | Receives bounds already in Three.js world units (scaled by caller) |
| `src/components/AssemblyAxisIndicator.tsx` | `dimensions` prop in Three.js world units |
| `src/components/PanelToggleOverlay.tsx` | `dimensions` prop in Three.js world units |
| `src/components/PanelEdgeRenderer.tsx` | `scale` prop; positions in Three.js world units |
| `src/components/PanelCornerRenderer.tsx` | `scale` prop; positions in Three.js world units |

---

## Space 5: 2D Sketch Space (SVG)

**Units:** millimetres (same as panel-local)
**Origin:** center of the panel face (same as panel-local)
**Y axis:** SVG natively has Y pointing down; a `scale(1, -1)` transform applied to the SVG `<g>` group flips it so Y points up, matching panel-local space

The `viewBox` is a pan/zoom window into panel-local space. Initial state:
`{ x: 0, y: 0, width: 200, height: 200 }` (centered roughly at panel center after being initialized to fit the panel).

### Coordinate transforms

**Screen → SVG (panel-local):**
```typescript
// sketchCoordinates.ts:286  screenToSvgCoords()
// Accounts for preserveAspectRatio centering + Y-flip
const y = -((localY / renderHeight) * viewBox.height + viewBox.y);
```

**SVG → Edge-relative (t, offset):**
```typescript
// sketchCoordinates.ts:329  svgToEdgeCoords()
// t: 0–1 position along edge (start corner = 0, end corner = 1)
// offset: perpendicular mm distance from edge (positive = outward)
```

**Edge-relative → SVG:**
```typescript
// sketchCoordinates.ts:370  edgeCoordsToSvg()
```

### Files that use it
| File | Usage |
|------|-------|
| `src/utils/sketchCoordinates.ts` | All coordinate transform functions |
| `src/components/SketchView2D.tsx` | Main 2D editor; applies `scale(1,-1)` to SVG group; uses `screenToSvgCoords` for hit-testing |
| `src/engine/types.ts` | `EdgePathPoint { t, offset }` — edge-relative coordinates |
| `src/engine/types.ts` | `Cutout { center: { x, y } }` — cutout positions in panel-local mm |

---

## Full Transform Chain: Panel-Local → Three.js World

```
1. Engine computes panel outline in panel-local 2D (mm, centred at origin):
      src/engine/nodes/BasePanel.ts  computeOutline()

2. Engine computes panel's world transform in engine world space (mm):
      FacePanelNode.computeTransform()  →  { position: [x,y,z], rotation: [rx,ry,rz] }
      - position  = assembly world offset + face-specific offset (half-dims ± mt/2)
      - rotation  = Euler XYZ for face orientation

3. Engine serialises to PanelSnapshot → PanelPath via panelBridge:
      src/engine/panelBridge.ts  panelSnapshotToPanelPath()
      - PanelPath.position  = derived.worldTransform.position  (mm)
      - PanelPath.rotation  = derived.worldTransform.rotation  (radians)
      - PanelPath.outline   = derived.outline.points           (panel-local mm)

4. React hook useEnginePanels() returns PanelCollection to Box3D.

5. Box3D.tsx computes scale  =  100 / max(W,H,D)  and passes to PanelCollectionRenderer.

6. PanelPathRenderer applies scale in two places:
      scaledPosition  = position * scale          →  Three.js group translation
      shape.moveTo(pt.x * scale, pt.y * scale)    →  path geometry vertices

7. THREE.js renders:
      group position={scaledPosition} rotation={rotation}
        mesh geometry={extrudeGeometry}   ← panel-local geometry scaled to Three.js units
```

The rotation stored in `PanelPath.rotation` is a Three.js Euler in XYZ order. It is passed directly to the `<group rotation={rotation}>`, so no conversion is needed.

---

## Quick Reference

| Space | Units | Origin | Y-up? | Key files |
|-------|-------|--------|-------|-----------|
| Assembly-local | mm | neg. corner of box | — | VoidNode, void bounds |
| Panel-local 2D | mm | panel center | yes | BasePanel outline, sketchCoordinates |
| Engine world | mm | assembly center | yes | FacePanelNode, DividerPanelNode transforms |
| Three.js world | normalized | assembly center | yes | Box3D, PanelPathRenderer, PushPullArrow |
| SVG/sketch | mm | panel center | yes (via scale(1,-1)) | SketchView2D, sketchCoordinates |

---

## Notes for Shared Axis Gizmo

When building a shared axis gizmo (Draft 142), the gizmo will need to be positioned in **Three.js world space** at the centroid or bounds center of the selected items. The relevant conversions:

- **Assembly bounding box in Three.js world:** `{ x: ±scaledW/2, y: ±scaledH/2, z: ±scaledD/2 }`
- **Void cell center in Three.js world:** `(bounds.{x,y,z} + bounds.{w,h,d}/2 - boxCenter.{x,y,z}) * scale`
- **Panel center in Three.js world:** `panel.position * scale` (already in world mm, just scale)

Face normals in Three.js world space are already defined in `PushPullArrow.tsx:getFaceNormal()` and can be reused.
