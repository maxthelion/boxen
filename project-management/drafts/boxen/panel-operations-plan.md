# Panel Operations Plan

3D operations for modifying panel geometry: feet, splitting, push/pull, edge extensions, and 3D selection.

## Status

| Feature | Status |
|---------|--------|
| Assembly Feet | Complete |
| Panel Push/Pull | Complete |
| Inset/Outset (Edge Extensions) | Complete |
| Corner Finishing (geometry) | Complete |
| Assembly/Panel Splitting | Pending |
| 3D Edge/Corner Selection | Pending |
| Axis-Based Section Ownership | Pending |

---

## Assembly Feet

### Configuration

```typescript
interface FeetConfig {
  enabled: boolean
  height: number           // How far feet extend down (mm)
  width: number            // Width of each foot along the panel edge (mm)
  slopeAngle: number       // Angle of inner edge slope (degrees, e.g., 45°)
  cornerFinish?: {
    type: 'none' | 'chamfer' | 'fillet'
    radius: number         // Size of chamfer/fillet on outer corner
  }
}

// Add to AssemblyConfig
feet?: FeetConfig
```

### Feet Geometry

Each foot is a **corner extension** on side panels (front, back, left, right):

```
    Panel Edge
    ══════════════════════════════
    │                            │
    │      Main Panel            │
    │                            │
    ══════════════════════════════
   ╱│                            │╲
  ╱ │                            │ ╲  ← Sloped inner edge
 │  │                            │  │
 └──┘                            └──┘
  ↑                                ↑
 Foot                            Foot
(corner extension)          (corner extension)
```

**Foot Shape (per corner):**
1. Rectangular base extending down from corner
2. Inner edge slopes toward panel center (configurable angle)
3. Optional chamfer/fillet on the outer corner point (away from panel)

### Feet Generation

When feet enabled:
1. Bottom face remains as configured (solid/open)
2. Each side panel (front, back, left, right) gets **two feet** - one at each bottom corner
3. Feet are added as path modifications to existing panels

### Slope Calculation

The inner edge slopes toward the panel center:
```typescript
const slopeOffset = footHeight * Math.tan(slopeAngle * Math.PI / 180)
```

At 45°: slopeOffset = footHeight (1:1 slope)
At 60°: slopeOffset ≈ footHeight * 1.73 (steeper)
At 30°: slopeOffset ≈ footHeight * 0.58 (shallower)

### Implementation TODO

- [ ] **Sloped inner edge**: Add `slopeAngle` to feet generation
- [ ] **Corner fillet**: Apply fillet to outer corner of feet
- [ ] **UI controls**: Add slope angle slider and fillet radius input

---

## Panel Push/Pull Tool

Move face panels along their perpendicular axis, with options for how this affects the assembly's bounding box.

### Core Concept

An assembly has **box boundaries** that determine where its 6 outer faces sit. When a face panel is pushed or pulled along its perpendicular axis, there are two fundamentally different behaviors:

1. **Change Bounding Box** - The assembly resizes
2. **Keep Bounding Box** - The panel offsets from its nominal position

### Mode A: Change Bounding Box

When movement changes the bounding box:

```typescript
interface BoundingBoxChange {
  axis: 'x' | 'y' | 'z'
  side: 'positive' | 'negative'  // Which end of the axis
  delta: number                   // Amount to move (positive = outward)
}
```

**Effects:**
- Adjacent panels grow/shrink to match the new bounding box
- Box center shifts by `delta / 2`
- Percentage-based subdivisions recalculate their absolute positions
- Sub-assemblies in affected voids resize proportionally
- All descendants need recalculation

### Mode B: Keep Bounding Box (Offset Panel)

When movement keeps the bounding box fixed:

**Outward Movement:**
- Panel offsets out from its bounding plane
- Adjacent panels extend their edges to meet the offset panel
- Creates an "extruded" or "stepped" appearance
- Uses existing edge extension mechanism

**Inward Movement (two sub-options):**

**Option 1: Inset as Divider**
- The face becomes "open" (removed from the box boundary)
- The moved panel becomes an internal divider/subdivision
- Effectively creates a recessed area

**Option 2: Shrink Adjacent Panels**
- Adjacent panels also move inward
- Their edges on that side get shortened/inset
- Maintains the box shape but smaller on that face

```typescript
interface PanelOffset {
  panelId: string
  offset: number                  // Distance from bounding plane (positive = outward)
  inwardBehavior?: 'inset-as-divider' | 'shrink-adjacent'
}
```

### UI for Push/Pull Tool

**FloatingPalette Controls:**
```
┌─────────────────────────────┐
│ Push/Pull            [×]    │
├─────────────────────────────┤
│ Distance: [====●===] 10mm   │
│           [  10.0  ] mm     │
│                             │
│ ○ Resize box                │
│ ● Offset panel              │
│                             │
│ If moving inward:           │
│ ○ Convert to divider        │
│ ● Shrink adjacent edges     │
│                             │
│ [Apply]  [Reset]            │
└─────────────────────────────┘
```

---

## Assembly and Panel Splitting

Split assemblies into separate pieces for manufacturing or design purposes.

### Assembly Splitting

Split an entire assembly along a plane perpendicular to a chosen axis.

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

**Split Plane Visualization:**
- Show translucent plane when configuring split
- Plane is perpendicular to selected axis
- Drag handle to adjust position
- Snapping to subdivision boundaries

**Result of Assembly Split:**
1. Creates two child assemblies from the original
2. Each child assembly has:
   - Its portion of the original void tree
   - New face panels at the split plane
   - Adjusted dimensions
3. Original assembly becomes a "split assembly" container

**Connection Options:**
| Type | Description |
|------|-------------|
| `none` | Simple cut, parts are separate |
| `finger-joint` | Finger joints at split plane for reassembly |
| `alignment-pins` | Holes for dowel pins to align parts |
| `overlap` | One side has lip that overlaps the other |

### Face Panel Splitting

Split a single face panel by drawing a line across it. Useful for:
- Creating panels that fit on smaller material sheets
- Adding structural joints within a large panel
- Design aesthetics (visible seams)

```typescript
interface PanelSplit {
  id: string
  panelId: string
  orientation: 'horizontal' | 'vertical' | 'custom'
  position: number                 // Distance from edge (mm)
  positionMode: 'absolute' | 'percentage'
  startPoint?: { x: number, y: number }
  endPoint?: { x: number, y: number }
  connectionType: 'none' | 'finger-joint' | 'overlap'
}
```

**Split Line Constraints:**
- Must span full width/height of panel (for horizontal/vertical)
- Cannot cross existing holes or cutouts
- Must be at least `2 × materialThickness` from edges
- Cannot intersect finger joint regions

**Result of Panel Split:**
1. Original panel replaced by two new panels
2. Each new panel has:
   - Adjusted dimensions
   - Connection geometry at split edge (fingers, overlap, etc.)
   - Original edge connections preserved on non-split edges
3. Split panels can be edited independently

### SVG Export

Split panels export as separate paths:
- Named with suffix (e.g., `face-front-a`, `face-front-b`)
- Can be placed on different sheets
- Include alignment marks for reassembly

---

## 3D Edge and Corner Selection

Enable edge and corner selection directly in the 3D view, allowing inset/outset and chamfer operations without switching to 2D.

### New Selection Filter Modes

**Current filters in ViewportToolbar:**
- `assembly` - Select assemblies
- `void` - Select voids
- `panel` - Select panels

**New filters to add:**
- `edge` - Select panel edges
- `corner` - Select panel corners

```typescript
type SelectionMode = 'assembly' | 'void' | 'panel' | 'edge' | 'corner' | null;
```

### Edge Selection in 3D

**Edge Identification:**
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

**Hit Detection Approach:**
Rather than creating separate mesh geometry for each edge, use raycasting with distance-to-edge calculation:

1. Raycast hits a panel mesh
2. Get intersection point in panel's local 2D space
3. Calculate distance to each of the 4 edges
4. If within threshold (scaled by camera distance), select that edge

### Corner Selection in 3D

**Corner Identification:**
Each panel has 4 corners. In 3D, these are points on the panel surface.

```typescript
interface SelectedCorner {
  panelId: string;
  corner: 'tl' | 'tr' | 'br' | 'bl';
}

// Store state
selectedCornerIds: Set<string>;  // Format: "panelId:corner" e.g., "face-front:tl"
hoveredCornerId: string | null;
```

### Threshold Scaling

Hit detection threshold should scale with camera distance to maintain consistent clickability:

```typescript
const getHitThreshold = (cameraDistance: number): number => {
  const baseThreshold = 5; // mm
  const scaleFactor = cameraDistance / 200;
  return baseThreshold * Math.max(0.5, Math.min(2, scaleFactor));
};
```

### Integration with Tools

**Edge Selection → Inset Tool:**
When edges are selected in 3D and inset tool is active:
- Show FloatingPalette with extension controls
- Same UI as 2D inset tool
- Apply extension to selected edges

**Corner Selection → Chamfer Tool:**
When corners are selected in 3D and chamfer tool is active:
- Show FloatingPalette with chamfer/fillet controls
- Same UI as 2D chamfer tool
- Apply finish to selected corners

### Files to Modify

| File | Changes |
|------|---------|
| `src/components/ViewportToolbar.tsx` | Add edge/corner filter buttons |
| `src/components/PanelPathRenderer.tsx` | Add EdgeHighlights and CornerIndicators |
| `src/components/Box3D.tsx` | Handle edge/corner click routing |
| `src/store/useBoxStore.ts` | Add edge selection state and actions |
| `src/types.ts` | Update SelectionMode type |

---

## Axis-Based Section Ownership Model

A unified model for determining finger joint geometry and extension overlaps based on "ownership" of sections along shared axes.

### Core Concept

Each edge where two panels meet has an axis running along it. This axis has points that divide it into sections. Each section is "owned" by one panel, which determines the joint geometry:
- Owner panel has a **tab** (material extends outward)
- Non-owner panel has a **slot** (material is cut inward)

### Axis Points

1. **Finger points** - The regular alternating finger joint pattern
2. **Panel boundary points** - Where panels start/end (including extensions)
3. **Pseudo-points** - Panel ends become additional points on the axis

### Ownership Rules (in priority order)

1. **Open face rule**: If one face is removed/open, the solid face owns ALL sections on that edge

2. **Gender rule**: Male panels (tabs-out) own sections by default; female panels (slots) receive

3. **Extension beyond neighbor**: If a panel extends further than its neighbor along the axis, it owns the new sections (they're adjacent to nothing)

4. **Female extension into male territory**: If a female panel extends into space covered by a male panel's extension, the female panel claims ownership of those sections

### Implementation Approach

```typescript
interface AxisSection {
  start: number;      // Position along axis
  end: number;        // Position along axis
  owner: FaceId;      // Which panel owns this section
  reason: 'gender' | 'open_face' | 'extension_beyond' | 'extension_claim';
}

interface JointAxis {
  axisId: string;                    // e.g., "front-left-vertical"
  faceA: FaceId;
  faceB: FaceId;
  points: number[];                  // All points including finger points and panel boundaries
  sections: AxisSection[];           // Computed ownership for each section
}

function computeAxisOwnership(
  axis: JointAxis,
  faces: Face[],
  extensions: Record<FaceId, EdgeExtensions>
): AxisSection[] {
  // 1. Gather all points: finger points + panel start/end + extension boundaries
  // 2. Sort points along axis
  // 3. For each section between points, determine owner based on rules
  // 4. Return sections with ownership
}
```

### Benefits

- Unified model for regular joints AND extension overlaps
- Clear rules for who "wins" at any point along an axis
- Extensions naturally integrate with finger joint system
- Handles complex cases (multiple extensions, varying lengths)
- Makes the overlap problem a solved ownership problem rather than geometric collision

---

## Verification

### Assembly Feet
1. Enable feet in Assembly Properties
2. Bottom is forced solid, side panels extend down
3. 3D view shows feet
4. SVG export includes extended panels

### Push/Pull
1. Select front panel → Push/Pull tool
2. Choose "Resize box" mode → box depth changes
3. Choose "Offset panel" mode → panel offsets, adjacent panels extend

### Assembly Split
1. Select assembly → choose Split tool
2. Select axis and position
3. Preview shows two resulting assemblies
4. Apply → assembly tree updates with children

### Panel Split
1. Select panel in 2D view
2. Activate Split tool
3. Draw horizontal line across panel
4. Apply → panel becomes two panels in panel list

### 3D Selection
1. Click 'Edge' filter → edge mode active
2. Hover panel edges → edge highlights
3. Click edge → edge selected
4. Click Inset tool → palette appears with extension controls
