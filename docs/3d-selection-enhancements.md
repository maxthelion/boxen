# 3D Edge and Corner Selection

Enable edge and corner selection directly in the 3D view, allowing inset/outset and chamfer operations without switching to 2D.

## Status: Pending

---

## New Selection Filter Modes

### Current filters in ViewportToolbar:
- `assembly` - Select assemblies
- `void` - Select voids
- `panel` - Select panels

### New filters to add:
- `edge` - Select panel edges
- `corner` - Select panel corners

```typescript
type SelectionMode = 'assembly' | 'void' | 'panel' | 'edge' | 'corner' | null;
```

### UI Changes to ViewportToolbar

```typescript
const tools = [
  { mode: 'assembly', label: 'Assembly', icon: '◫' },
  { mode: 'void', label: 'Void', icon: '⬚' },
  { mode: 'panel', label: 'Panel', icon: '▬' },
  { mode: 'edge', label: 'Edge', icon: '─' },      // NEW
  { mode: 'corner', label: 'Corner', icon: '⌐' },  // NEW
];
```

---

## Edge Selection in 3D

### Edge Identification

Each panel has 4 logical edges (top, bottom, left, right). In 3D, these become 3D line segments on the panel surface.

```typescript
interface SelectedEdge {
  panelId: string;
  edge: 'top' | 'bottom' | 'left' | 'right';
}

// Store state
selectedEdges: Set<string>;  // Format: "panelId:edge" e.g., "face-front:top"
hoveredEdge: string | null;
```

### Hit Detection Approach

Rather than creating separate mesh geometry for each edge, use raycasting with distance-to-edge calculation:

1. Raycast hits a panel mesh
2. Get intersection point in panel's local 2D space
3. Calculate distance to each of the 4 edges
4. If within threshold (scaled by camera distance), select that edge

```typescript
const findEdgeAtPoint = (
  localPoint: { x: number, y: number },
  panelWidth: number,
  panelHeight: number,
  threshold: number
): EdgePosition | null => {
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  // Distance to each edge
  const distTop = Math.abs(localPoint.y - halfH);
  const distBottom = Math.abs(localPoint.y + halfH);
  const distLeft = Math.abs(localPoint.x + halfW);
  const distRight = Math.abs(localPoint.x - halfW);

  const minDist = Math.min(distTop, distBottom, distLeft, distRight);
  if (minDist > threshold) return null;

  if (minDist === distTop) return 'top';
  if (minDist === distBottom) return 'bottom';
  if (minDist === distLeft) return 'left';
  return 'right';
};
```

### Visual Feedback

- Highlight hovered edge with colored line (thicker, brighter)
- Selected edges shown in yellow/cyan
- Use `<Line>` component from @react-three/drei or custom LineSegments

```typescript
// In PanelPathRenderer, add edge highlight meshes when in edge mode
{selectionMode === 'edge' && (
  <EdgeHighlights
    panel={panel}
    hoveredEdge={hoveredEdge}
    selectedEdges={selectedEdges}
    onEdgeClick={handleEdgeClick}
    onEdgeHover={handleEdgeHover}
  />
)}
```

---

## Corner Selection in 3D

### Corner Identification

Each panel has 4 corners. In 3D, these are points on the panel surface.

```typescript
interface SelectedCorner {
  panelId: string;
  corner: 'tl' | 'tr' | 'br' | 'bl';
}

// Store state (reuse existing)
selectedCornerIds: Set<string>;  // Format: "panelId:corner" e.g., "face-front:tl"
hoveredCornerId: string | null;
```

### Hit Detection

Similar to edges, but using point distance:

```typescript
const findCornerAtPoint = (
  localPoint: { x: number, y: number },
  panelWidth: number,
  panelHeight: number,
  threshold: number
): CornerPosition | null => {
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  const corners = {
    tl: { x: -halfW, y: halfH },
    tr: { x: halfW, y: halfH },
    br: { x: halfW, y: -halfH },
    bl: { x: -halfW, y: -halfH },
  };

  for (const [id, pos] of Object.entries(corners)) {
    const dist = Math.sqrt(
      (localPoint.x - pos.x) ** 2 +
      (localPoint.y - pos.y) ** 2
    );
    if (dist < threshold) return id as CornerPosition;
  }
  return null;
};
```

### Visual Feedback

- Show corner indicators (small spheres or circles) when in corner mode
- Highlight on hover, fill on selection
- Use `<Sphere>` or `<Circle>` from drei

```typescript
// In PanelPathRenderer, add corner indicators when in corner mode
{selectionMode === 'corner' && (
  <CornerIndicators
    panel={panel}
    hoveredCorner={hoveredCornerId}
    selectedCorners={selectedCornerIds}
    onCornerClick={handleCornerClick}
    onCornerHover={handleCornerHover}
  />
)}
```

---

## Threshold Scaling

Hit detection threshold should scale with camera distance to maintain consistent clickability:

```typescript
const getHitThreshold = (cameraDistance: number): number => {
  // Larger threshold when zoomed out, smaller when zoomed in
  const baseThreshold = 5; // mm
  const scaleFactor = cameraDistance / 200; // Normalize to typical view distance
  return baseThreshold * Math.max(0.5, Math.min(2, scaleFactor));
};
```

---

## Integration with Tools

### Edge Selection → Inset Tool

When edges are selected in 3D and inset tool is active:
- Show FloatingPalette with extension controls
- Same UI as 2D inset tool
- Apply extension to selected edges

### Corner Selection → Chamfer Tool

When corners are selected in 3D and chamfer tool is active:
- Show FloatingPalette with chamfer/fillet controls
- Same UI as 2D chamfer tool
- Apply finish to selected corners

### Tool Activation Flow

1. User selects 'edge' or 'corner' filter mode
2. Click elements to select them (shift+click for multi-select)
3. Click tool button (Inset/Chamfer) in EditorToolbar
4. FloatingPalette appears with tool options
5. Apply changes

Alternative flow (tool-first):
1. User clicks Inset or Chamfer tool
2. Selection mode automatically switches to 'edge' or 'corner'
3. User selects elements
4. FloatingPalette appears when elements selected

---

## Store Changes

```typescript
// New/modified state
selectionMode: SelectionMode;  // Add 'edge' | 'corner'
selectedEdges: Set<string>;    // "panelId:edge" format
hoveredEdge: string | null;

// Existing (may need format update for 3D)
selectedCornerIds: Set<string>;  // Update to "panelId:corner" format
hoveredCornerId: string | null;

// New actions
selectEdge: (panelId: string, edge: EdgePosition, additive?: boolean) => void;
clearEdgeSelection: () => void;
setHoveredEdge: (edgeId: string | null) => void;
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/ViewportToolbar.tsx` | Add edge/corner filter buttons |
| `src/components/PanelPathRenderer.tsx` | Add EdgeHighlights and CornerIndicators |
| `src/components/Box3D.tsx` | Handle edge/corner click routing |
| `src/store/useBoxStore.ts` | Add edge selection state and actions |
| `src/types.ts` | Update SelectionMode type |

---

## New Components

```typescript
// EdgeHighlights.tsx - Renders clickable edge overlays
interface EdgeHighlightsProps {
  panel: PanelPath;
  hoveredEdge: string | null;
  selectedEdges: Set<string>;
  onEdgeClick: (panelId: string, edge: EdgePosition, event: ThreeEvent) => void;
  onEdgeHover: (edgeId: string | null) => void;
}

// CornerIndicators.tsx - Renders clickable corner points
interface CornerIndicatorsProps {
  panel: PanelPath;
  hoveredCorner: string | null;
  selectedCorners: Set<string>;
  onCornerClick: (panelId: string, corner: CornerPosition, event: ThreeEvent) => void;
  onCornerHover: (cornerId: string | null) => void;
}
```

---

## Verification

1. **Edge Filter Mode:**
   - Click 'Edge' filter → edge mode active
   - Hover panel edges → edge highlights
   - Click edge → edge selected (yellow highlight)
   - Shift+click → multi-select edges
   - Click Inset tool → palette appears with extension controls

2. **Corner Filter Mode:**
   - Click 'Corner' filter → corner mode active
   - Small circles appear at panel corners
   - Hover corner → highlight effect
   - Click corner → corner selected (cyan fill)
   - Shift+click → multi-select corners
   - Click Chamfer tool → palette appears with radius controls

3. **Cross-View Consistency:**
   - Select edges in 3D → switch to 2D → same edges selected
   - Select corners in 3D → switch to 2D → same corners selected
   - Apply inset in 3D → visible in both views
   - Apply chamfer in 3D → visible in both views
