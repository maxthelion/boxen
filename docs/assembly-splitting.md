# Assembly and Panel Splitting

Split assemblies into separate pieces for manufacturing or design purposes. This enables creating multi-part boxes, stackable containers, or designs that exceed material sheet sizes.

## Status: Pending

---

## Assembly Splitting

Split an entire assembly along a plane perpendicular to a chosen axis.

### Configuration

```typescript
interface AssemblySplit {
  id: string
  axis: 'x' | 'y' | 'z'           // Axis perpendicular to the split plane
  position: number                 // Position along the axis (mm from origin)
  positionMode: 'absolute' | 'percentage'
  gap: number                      // Gap between split parts (mm, default: 0)
  connectionType: 'none' | 'finger-joint' | 'alignment-pins' | 'overlap'
}
```

### Split Plane Visualization

- Show translucent plane when configuring split
- Plane is perpendicular to selected axis
- Drag handle to adjust position
- Snapping to subdivision boundaries

### Result of Assembly Split

1. Creates two child assemblies from the original
2. Each child assembly has:
   - Its portion of the original void tree
   - New face panels at the split plane
   - Adjusted dimensions
3. Original assembly becomes a "split assembly" container

### Connection Options

| Type | Description |
|------|-------------|
| `none` | Simple cut, parts are separate |
| `finger-joint` | Finger joints at split plane for reassembly |
| `alignment-pins` | Holes for dowel pins to align parts |
| `overlap` | One side has lip that overlaps the other |

---

## Face Panel Splitting

Split a single face panel by drawing a line across it. Useful for:
- Creating panels that fit on smaller material sheets
- Adding structural joints within a large panel
- Design aesthetics (visible seams)

### Split Line Tool

```typescript
interface PanelSplit {
  id: string
  panelId: string
  orientation: 'horizontal' | 'vertical' | 'custom'
  // For horizontal/vertical:
  position: number                 // Distance from edge (mm)
  positionMode: 'absolute' | 'percentage'
  // For custom:
  startPoint?: { x: number, y: number }
  endPoint?: { x: number, y: number }
  connectionType: 'none' | 'finger-joint' | 'overlap'
}
```

### UI Workflow

1. Select panel in 2D Sketch View
2. Activate Split tool from toolbar
3. Choose orientation (defaults to horizontal or vertical based on panel aspect ratio)
4. Click to place split line, or drag to position
5. Adjust with numeric input or snap to grid
6. Configure connection type
7. Apply split

### Split Line Constraints

- Must span full width/height of panel (for horizontal/vertical)
- Cannot cross existing holes or cutouts
- Must be at least `2 × materialThickness` from edges
- Cannot intersect finger joint regions

### Result of Panel Split

1. Original panel replaced by two new panels
2. Each new panel has:
   - Adjusted dimensions
   - Connection geometry at split edge (fingers, overlap, etc.)
   - Original edge connections preserved on non-split edges
3. Split panels can be edited independently

---

## Types and Interfaces

```typescript
// Add to types.ts
interface SplitConfig {
  assemblySplits: AssemblySplit[]
  panelSplits: PanelSplit[]
}

type ConnectionType = 'none' | 'finger-joint' | 'alignment-pins' | 'overlap'

interface AssemblySplit {
  id: string
  axis: 'x' | 'y' | 'z'
  position: number
  positionMode: 'absolute' | 'percentage'
  gap: number
  connectionType: ConnectionType
}

interface PanelSplit {
  id: string
  panelId: string
  orientation: 'horizontal' | 'vertical' | 'custom'
  position: number
  positionMode: 'absolute' | 'percentage'
  startPoint?: Point
  endPoint?: Point
  connectionType: ConnectionType
}
```

---

## Store Actions

```typescript
// Assembly splitting
addAssemblySplit: (split: AssemblySplit) => void
updateAssemblySplit: (id: string, updates: Partial<AssemblySplit>) => void
removeAssemblySplit: (id: string) => void

// Panel splitting
addPanelSplit: (split: PanelSplit) => void
updatePanelSplit: (id: string, updates: Partial<PanelSplit>) => void
removePanelSplit: (id: string) => void
```

---

## Panel Generator Changes

When generating panels with splits:
1. Check for applicable splits
2. For each split panel:
   - Calculate split position in local coordinates
   - Generate two sub-panels with adjusted outlines
   - Add connection geometry (fingers, overlap lip, pin holes)
   - Preserve holes that fall entirely within one sub-panel
   - Error if hole would be bisected by split

---

## SVG Export

Split panels export as separate paths:
- Named with suffix (e.g., `face-front-a`, `face-front-b`)
- Can be placed on different sheets
- Include alignment marks for reassembly

---

## Verification

1. **Assembly Split:**
   - Select assembly → choose Split tool
   - Select axis and position
   - Preview shows two resulting assemblies
   - Apply → assembly tree updates with children
   - Each child assembly can be independently modified

2. **Panel Split:**
   - Select panel in 2D view
   - Activate Split tool
   - Draw horizontal line across panel
   - Configure finger joint connection
   - Apply → panel becomes two panels in panel list
   - SVG export shows both panels with mating joints
