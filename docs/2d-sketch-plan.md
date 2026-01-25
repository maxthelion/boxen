# Boxen 2D Sketch View & Enhanced Features

## Overview

Implement the features specified in `2dviewerspec.md`:
1. **2D Sketch View Editor** - Edit panels in a dedicated 2D view
2. **Joint Line Visualization** - Separate joint lines from panel edges
3. **Two-Plane Subdivision** - Select two panels to subdivide the void between them
4. **Percentage-Based Subdivisions** - Adaptive subdivisions that scale with dimensions
5. **Editable Areas** - Highlight safe zones for cutouts
6. **Assembly Feet** - Add feet that extrude bottom panels downward
7. **Corner Finishing** - Chamfers and fillets on corners

---

## Phase 1: 2D Sketch View Editor (Core)

### 1.1 New Component: `SketchView2D.tsx`

A dedicated 2D canvas for editing a selected panel.

**Entry Point:**
- Add "Edit in 2D" button to PanelProperties when a panel is selected
- **Replaces the 3D viewport** with toggle control to flip back and forth
- Keyboard shortcut (e.g., `E` key) to toggle between views

**Rendering:**
- SVG-based or Canvas-based for precision and interactivity
- Pan/zoom controls (scroll wheel, drag)
- Grid background with configurable snap increments
- Dimension labels on edges

**Visual Elements:**
| Element | Color | Description |
|---------|-------|-------------|
| Generated edges | Blue | From parent dimensions, not directly editable |
| Editable edges | Orange | Can be moved per edge rules |
| Joint lines | Dashed gray | Finger joints separate from edge |
| Holes/slots | Dark fill | Existing cutouts |
| Editable areas | Green tint | Safe zones for modifications |
| Selected corner | Cyan highlight | Corner selected for finishing |

### 1.2 Edge Movement Rules

Per spec, edges have different movement constraints:

```typescript
type EdgeConstraint =
  | { type: 'fixed' }           // Male joint - cannot move
  | { type: 'outward-only' }    // Female joint - can extend outward
  | { type: 'bidirectional', limit: number }  // Open face - can move in/out

function getEdgeConstraint(panel: PanelPath, edge: EdgePosition): EdgeConstraint {
  // Male joint (tabs extending out): cannot move
  // Female joint (slots receiving tabs): outward only
  // Open face (straight edge): bidirectional with limit
}
```

**Movement Limits:**
- Inward: Cannot hit a joint on the opposite side
- Calculated as: `oppositeEdgeJointStart - currentEdgePosition - minGap`

### 1.3 Interactive Edge Dragging

- Click and drag orange edges
- Snap to grid increments (configurable)
- Real-time preview of panel shape
- Apply on mouse release → triggers panel regeneration

### 1.4 Store Changes

```typescript
// New state
sketchViewPanelId: string | null  // Panel being edited in 2D view

// New actions
enterSketchView: (panelId: string) => void
exitSketchView: () => void
```

---

## Phase 2: Joint Line Visualization

### 2.1 Separate Joint Lines from Edges

Currently, finger joints are part of the panel outline. For the 2D view, we need to show:
- **Panel edge line** - The conceptual boundary
- **Joint line** - Where fingers/slots actually cut

**Implementation:**
- Add `jointLines` array to PanelPath (or compute on render)
- Each joint line is a path segment showing the finger pattern

### 2.2 Assembly Axis Preview

When previewing a new assembly/sub-assembly:
- Show a line along the primary axis
- Indicates lid vs wall orientation

**Implementation:**
- Extend `SubAssemblyPreview` to include axis visualization
- Render as dashed line through the void center

---

## Phase 3: Two-Plane Subdivision

### 3.1 Multi-Panel Selection Detection

When exactly 2 panels are selected:
1. Check if they share a common void (are both faces of the same void)
2. If void has no existing subdivisions → show subdivision option

### 3.2 Axis Determination

The subdivision axes available are:
- The two axes perpendicular to both selected panels
- NOT the axis parallel to the panels

**Example:** If front and back panels selected (both in XY plane):
- Can subdivide along X (left-right) or Y (top-bottom)
- Cannot subdivide along Z (would be parallel to panels)

### 3.3 UI Changes

**SubdivisionControls.tsx:**
- Detect when 2 panels selected
- Show simplified subdivision UI with constrained axis options
- "Subdivide between selected panels" button

---

## Phase 4: Percentage-Based Subdivisions

### 4.1 New Subdivision Model

```typescript
interface Subdivision {
  id: string
  // Current: absolute position
  position: number

  // New: percentage-based (optional)
  positionMode: 'absolute' | 'percentage'
  percentagePosition?: number  // 0.0 to 1.0
}
```

### 4.2 Position Calculation

When `positionMode === 'percentage'`:
```typescript
const absolutePosition = voidStart + (voidLength * percentagePosition)
```

### 4.3 Dimension Change Handling

When box dimensions change:
1. Percentage subdivisions recalculate their absolute positions
2. Absolute subdivisions stay fixed (may become invalid if outside bounds)

### 4.4 UI Toggle

- Add toggle in SubdivisionControls: "Lock position" vs "Scale with dimensions"
- Default: percentage mode for new subdivisions

---

## Phase 5: Editable Areas

### 5.1 Calculate Safe Zones

For each panel, calculate rectangles where cutouts can be added without affecting joints.

```typescript
interface EditableArea {
  x: number
  y: number
  width: number
  height: number
}

function getEditableAreas(panel: PanelPath, config: BoxConfig): EditableArea[] {
  // Minimum distance from closed-face joints: 1× materialThickness
  // Open-face edges: can go all the way to edge
}
```

### 5.2 Visualization

- In 2D Sketch View: green-tinted overlay rectangles
- In 3D view (optional): subtle highlighting

### 5.3 Drawing Tools & Boolean Operations

**Multiple Tools:**
- **Freeform Draw**: Click to place points, close polygon to complete
- **Rectangle Tool**: Click-drag for rectangles
- **Circle Tool**: Click-drag for circles/ellipses

**Boolean Operations:**
- **Add (Union)**: Extend the panel shape outward
- **Subtract (Difference)**: Create holes/cutouts in the panel

**Workflow:**
1. Select tool (freeform, rectangle, circle)
2. Select operation (add or subtract)
3. Draw shape within valid area
4. Shape is merged/subtracted from panel outline
5. Panel regenerates with new geometry

**Validation:**
- Subtract: Must be within editable area
- Add: Must not overlap with joints or other panels
- Result must maintain valid panel topology (no self-intersection)

### 5.4 Mirror Mode for Symmetrical Editing

**Mirror Options:**
- **Off**: No mirroring (default)
- **Horizontal**: Mirror across vertical center axis (left ↔ right)
- **Vertical**: Mirror across horizontal center axis (top ↔ bottom)
- **Both**: Mirror across both axes (4-way symmetry)

```typescript
type MirrorMode = 'none' | 'horizontal' | 'vertical' | 'both'

// Store state
mirrorMode: MirrorMode
```

**Visual Indicators:**
- Dashed center line(s) shown when mirror mode active
- Ghost preview of mirrored shape while drawing

**Behavior:**
1. User draws shape on one side of center axis
2. Shape is automatically duplicated and mirrored
3. Both shapes are applied in single boolean operation
4. Corner finishes applied to mirrored corners too

**Use Cases:**
- Symmetrical cutouts (handles, ventilation patterns)
- Decorative holes
- Cable management slots on both sides

---

## Phase 6: Assembly Feet

### 6.1 Feet Configuration

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

### 6.2 Feet Geometry

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

### 6.3 Feet Generation

When feet enabled:
1. Bottom face remains as configured (solid/open)
2. Each side panel (front, back, left, right) gets **two feet** - one at each bottom corner
3. Feet are added as path modifications to existing panels

### 6.4 Path Construction for Foot

Starting from bottom-left corner of panel, going clockwise:
```typescript
// Foot at bottom-left corner
const footPoints = [
  { x: -panelWidth/2, y: -panelHeight/2 },                    // Original corner
  { x: -panelWidth/2, y: -panelHeight/2 - footHeight },       // Foot bottom-left
  // Optional chamfer/fillet point(s) here
  { x: -panelWidth/2 + footWidth, y: -panelHeight/2 - footHeight }, // Foot bottom-right
  // Sloped edge going back up toward panel
  { x: -panelWidth/2 + footWidth + slopeOffset, y: -panelHeight/2 }, // Slope end
  // ... continue along bottom edge to next foot
]
```

### 6.5 Slope Calculation

The inner edge slopes toward the panel center:
```typescript
const slopeOffset = footHeight * Math.tan(slopeAngle * Math.PI / 180)
```

At 45°: slopeOffset = footHeight (1:1 slope)
At 60°: slopeOffset ≈ footHeight * 1.73 (steeper)
At 30°: slopeOffset ≈ footHeight * 0.58 (shallower)

### 6.6 Implementation TODO

- [ ] **Sloped inner edge**: Add `slopeAngle` to feet generation - inner edge of each foot slopes toward panel center
- [ ] **Corner fillet**: Apply fillet to outer corner of feet (the point furthest from panel body)
- [ ] **UI controls**: Add slope angle slider and fillet radius input to feet configuration panel

---

## Phase 7: Corner Finishing

### 7.1 Floating Palette Component

A reusable floating palette component for tool options. Will be used by chamfer/fillet, and later by other tools (inset/outset, shape properties, etc.).

```typescript
interface FloatingPaletteProps {
  position: { x: number, y: number }  // Screen position (near selection)
  title?: string
  children: React.ReactNode           // Tool-specific controls
  onClose: () => void
}

// The palette floats near the selected elements
// Draggable, but auto-positions to avoid obscuring selection
// Closes on Escape or clicking outside
```

**Features:**
- Auto-positions near selection without obscuring it
- Draggable by title bar
- Semi-transparent background
- Closes on Escape or external click
- Compact design for minimal screen obstruction

### 7.2 Chamfer/Fillet Tool Workflow

**Activation:**
1. User clicks "Chamfer" tool button in EditorToolbar (2D mode)
2. Tool becomes active, corners become selectable
3. Corner indicators appear on all eligible corners (circles at corner positions)

**Selection:**
1. Click a corner indicator to select it
2. Shift+click to add/remove from selection (multi-select)
3. Click+drag to box-select multiple corners

**Floating Palette (appears when corners selected):**
```
┌─────────────────────────┐
│ Corner Finish      [×]  │
├─────────────────────────┤
│ ○ Chamfer   ● Fillet    │
│                         │
│ Radius: [====●===] 5mm  │
│         [  5.0  ] mm    │
│                         │
│ [Apply]  [Clear]        │
└─────────────────────────┘
```

**Controls:**
- Toggle between Chamfer and Fillet
- Radius slider with numeric input
- Apply: commits the finish to selected corners
- Clear: removes finish from selected corners
- Live preview while adjusting

### 7.3 Corner Detection & Model

```typescript
interface DetectedCorner {
  id: string                    // Unique ID based on position
  position: { x: number, y: number }
  angle: number                 // Interior angle (90° = right angle)
  eligible: boolean             // Has enough material for finishing
  maxRadius: number             // Maximum safe radius
}

interface CornerFinish {
  cornerId: string
  type: 'none' | 'chamfer' | 'fillet'
  radius: number
}

// Stored per-panel
cornerFinishes: CornerFinish[]  // Map of corner ID to finish settings
```

**Corner Types:**
- Original 4 corners of rectangular panel
- Corners created by cutouts (subtraction)
- Corners created by additions (union)
- Inner corners (concave) from L-shaped cuts

### 7.4 Eligibility Check

A corner is eligible for finishing if:
- It's in an editable area (not near joints)
- The requested radius ≤ maxRadius
- Both adjacent edges are long enough

**Maximum Radius Rule:**
The maximum chamfer/fillet radius for a corner is limited by the **shortest line segment extending from that corner point**. This ensures the finish doesn't extend beyond the available material on either adjacent edge.

```typescript
maxRadius = Math.min(edge1Length, edge2Length);
```

Where `edge1Length` and `edge2Length` are the lengths of the two line segments meeting at the corner.

### 7.5 Path Modification

- **Chamfer**: Replace corner vertex with two vertices creating 45° cut
- **Fillet**: Replace corner vertex with arc (polyline approximation for SVG compatibility)

### 7.6 Visual Indicators

| State | Appearance |
|-------|------------|
| Unselected eligible corner | Small circle outline (gray) |
| Hovered corner | Circle with highlight (cyan) |
| Selected corner | Filled circle (cyan) |
| Corner with existing finish | Circle with checkmark or filled |
| Ineligible corner | No indicator (or dimmed) |

---

## Phase 8: Assembly and Panel Splitting

Split assemblies into separate pieces for manufacturing or design purposes. This enables creating multi-part boxes, stackable containers, or designs that exceed material sheet sizes.

### 8.1 Assembly Splitting

Split an entire assembly along a plane perpendicular to a chosen axis.

**Configuration:**
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

### 8.2 Face Panel Splitting

Split a single face panel by drawing a line across it. Useful for:
- Creating panels that fit on smaller material sheets
- Adding structural joints within a large panel
- Design aesthetics (visible seams)

**Split Line Tool:**
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

**UI Workflow:**
1. Select panel in 2D Sketch View
2. Activate Split tool from toolbar
3. Choose orientation (defaults to horizontal or vertical based on panel aspect ratio)
4. Click to place split line, or drag to position
5. Adjust with numeric input or snap to grid
6. Configure connection type
7. Apply split

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

### 8.3 Types and Interfaces

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

### 8.4 Store Actions

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

### 8.5 Panel Generator Changes

When generating panels with splits:
1. Check for applicable splits
2. For each split panel:
   - Calculate split position in local coordinates
   - Generate two sub-panels with adjusted outlines
   - Add connection geometry (fingers, overlap lip, pin holes)
   - Preserve holes that fall entirely within one sub-panel
   - Error if hole would be bisected by split

### 8.6 SVG Export

Split panels export as separate paths:
- Named with suffix (e.g., `face-front-a`, `face-front-b`)
- Can be placed on different sheets
- Include alignment marks for reassembly

### 8.7 Verification

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

---

## Phase 9: Future Enhancements

Features to address after completing phases 1-8:

### 9.1 Push/Pull Panel Movement
- Move panel edges outwards or inwards interactively
- Doesn't scale all divisions - just adds/removes material
- Similar to SketchUp's push/pull tool

### 9.2 Inset/Outset Tool (Edge Extension)

**Current Issue:**
Extended edges are not full width - they only extend within the "safe zone" between joints. The extension should be full width unless the adjacent panel's joint meets the extended area.

**Extension Width Rules:**
1. Extended edge goes **full width to the corner** by default
2. Exception: If the **adjacent perpendicular panel** extends far enough to meet this extension, a joint is created and the extension is shortened to accommodate it
3. If extension is long enough to meet an adjacent panel, **finger joints appear** on that edge of the extension

**Example:**
- Panel A (front face) extends bottom edge downward by 20mm
- The extension goes full width (corner to corner)
- If left wall panel also extends down to meet it, the left side of the extension gets shortened and gains finger joints where they meet

**Floating Palette UI:**
Palette appears **immediately when Inset tool is selected** (like chamfer tool).

| Element | Description |
|---------|-------------|
| Edge checkboxes | Toggle each extendable edge (top, bottom, left, right) |
| Extension amount | Single numeric input (applies to all selected edges) |
| Apply button | Commit the extension |

**Multi-Edge Extension:**
- Multiple edges can be selected and extended simultaneously
- Extensions remain **rectangular** (L-shaped additions at corners, not diagonal)
- Single extension value applies to all selected edges equally
- Example: selecting top + right with 10mm creates a 10mm extension on top and a 10mm extension on right, with an L-shaped corner where they meet

**Inset (Negative Extension):**
- Edges can be **inset** (moved inward) as well as outset
- Limit: Cannot inset within **material thickness** of the opposite edge's joint
- This preserves structural integrity of finger joints

**Edge Eligibility:**
- **Male joint (tabs-out)**: Cannot extend (locked) - shown disabled in palette
- **Female joint (slots)**: Can extend outward only
- **Open edge (no joint)**: Can extend in both directions

**Visual Feedback:**
- Live preview of new edge positions as values are changed in the palette
- **Selected edges shown in yellow** to indicate they will be affected by the transformation
- Disabled/grayed checkboxes for ineligible edges
- Current extension value shown per edge

**UI Behavior:**
- Palette appears when Inset tool is selected
- **Palette disappears when Apply is pressed** (or on Escape to cancel)
- Preview updates in real-time as slider/input values change
- Apply commits the extension; Cancel reverts to original state

### 9.3 Other Advanced 2D View Tools
- **Point Selection**: Select individual vertices for fine-grained editing
- **Shape Tools**: Rectangle, circle, polygon primitives for cutouts
- **Path Tool**: Freeform point-by-point path drawing

### 9.4 Mirror Tools
- **Mirror Toggle Axis 1**: Mirror operations across horizontal axis
- **Mirror Toggle Axis 2**: Mirror operations across vertical axis
- Useful for symmetric cutouts and modifications

### 9.5 Panel Modification Copying
- Copy modifications from Panel A to Panel B
- Useful for applying same cutouts/chamfers to opposite faces
- Option to mirror when copying to opposite panel

### 9.6 Multi-Panel Simultaneous Editing
- Select multiple panels and enter 2D editor
- Apply same operations to all selected panels at once
- Synchronized view showing all panels being edited

### 9.7 Grid Snapping in 2D View
- Enable/disable snap-to-grid when dragging edges or drawing shapes
- Configurable grid size (e.g., 1mm, 5mm, 10mm)
- Visual grid overlay showing snap points
- Keyboard modifier (e.g., hold Shift) to temporarily disable snapping
- Snap to other geometry (edges, corners, center points) in addition to grid

### 9.8 Axis-Based Section Ownership Model

A unified model for determining finger joint geometry and extension overlaps based on "ownership" of sections along shared axes.

**Core Concept:**
Each edge where two panels meet has an axis running along it. This axis has points that divide it into sections. Each section is "owned" by one panel, which determines the joint geometry:
- Owner panel has a **tab** (material extends outward)
- Non-owner panel has a **slot** (material is cut inward)

**Axis Points:**
1. **Finger points** - The regular alternating finger joint pattern
2. **Panel boundary points** - Where panels start/end (including extensions)
3. **Pseudo-points** - Panel ends become additional points on the axis

**Ownership Rules (in priority order):**

1. **Open face rule**: If one face is removed/open, the solid face owns ALL sections on that edge

2. **Gender rule**: Male panels (tabs-out) own sections by default; female panels (slots) receive

3. **Extension beyond neighbor**: If a panel extends further than its neighbor along the axis, it owns the new sections (they're adjacent to nothing)

4. **Female extension into male territory**: If a female panel extends into space covered by a male panel's extension, the female panel claims ownership of those sections

**Example - Front and Left both extend bottom:**
```
Axis: Vertical edge at front-left corner

Points on axis (top to bottom):
  - Top of box (normal finger joints start)
  - ... finger points ...
  - Bottom of box (normal finger joints end)
  - End of front's extension (front owns below this if left doesn't extend as far)
  - End of left's extension (left owns below this if front doesn't extend as far)

Section ownership:
  - Normal region: Alternates based on gender (front=male, left=female → front owns tabs)
  - Extension region:
    - If only front extends: front owns all extension sections
    - If both extend same amount: follows gender rule (front owns)
    - If left extends further: left owns sections beyond front's extension
```

**Implementation Approach:**

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

**Panel Generation Changes:**
- Clone the base finger point archetype for the axis
- Add panel boundary points (including extensions) as pseudo-points
- Compute section ownership
- Generate outline: tabs where owner, slots where not owner
- Changing ownership triggers panel redraw

**Benefits:**
- Unified model for regular joints AND extension overlaps
- Clear rules for who "wins" at any point along an axis
- Extensions naturally integrate with finger joint system
- Handles complex cases (multiple extensions, varying lengths)
- Makes the overlap problem a solved ownership problem rather than geometric collision

---

## Phase 10: 3D Edge and Corner Selection

Enable edge and corner selection directly in the 3D view, allowing inset/outset and chamfer operations without switching to 2D.

### 10.1 New Selection Filter Modes

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

**UI Changes to ViewportToolbar:**
```typescript
const tools = [
  { mode: 'assembly', label: 'Assembly', icon: '◫' },
  { mode: 'void', label: 'Void', icon: '⬚' },
  { mode: 'panel', label: 'Panel', icon: '▬' },
  { mode: 'edge', label: 'Edge', icon: '─' },      // NEW
  { mode: 'corner', label: 'Corner', icon: '⌐' },  // NEW
];
```

### 10.2 Edge Selection in 3D

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

**Visual Feedback:**
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

### 10.3 Corner Selection in 3D

**Corner Identification:**
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

**Hit Detection:**
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

**Visual Feedback:**
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

### 10.4 Threshold Scaling

Hit detection threshold should scale with camera distance to maintain consistent clickability:

```typescript
const getHitThreshold = (cameraDistance: number): number => {
  // Larger threshold when zoomed out, smaller when zoomed in
  const baseThreshold = 5; // mm
  const scaleFactor = cameraDistance / 200; // Normalize to typical view distance
  return baseThreshold * Math.max(0.5, Math.min(2, scaleFactor));
};
```

### 10.5 Integration with Tools

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

**Tool Activation Flow:**
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

### 10.6 Store Changes

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

### 10.7 Files to Modify

| File | Changes |
|------|---------|
| `src/components/ViewportToolbar.tsx` | Add edge/corner filter buttons |
| `src/components/PanelPathRenderer.tsx` | Add EdgeHighlights and CornerIndicators |
| `src/components/Box3D.tsx` | Handle edge/corner click routing |
| `src/store/useBoxStore.ts` | Add edge selection state and actions |
| `src/types.ts` | Update SelectionMode type |

### 10.8 New Components

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

### 10.9 Verification

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

---

## Implementation Order

| Phase | Feature | Complexity | Dependencies | Status |
|-------|---------|------------|--------------|--------|
| 1 | 2D Sketch View | High | None | **DONE** |
| 2 | Joint Line Visualization | Medium | Phase 1 | **DONE** |
| 3 | Two-Plane Subdivision | Low | None | **DONE** |
| 4 | Percentage Subdivisions | Medium | None | **DONE** |
| 5 | Editable Areas | Medium | Phase 1 | **DONE** |
| 6 | Assembly Feet | Medium | None | **DONE** |
| 7 | Corner Finishing | Medium | Phase 5 | Partial (chamfer mirroring bug) |
| 8 | Assembly/Panel Splitting | Medium | None | Pending |
| 9 | Future Enhancements | Various | Phases 1-7 | Pending |
| 10 | 3D Edge/Corner Selection | Medium | Phase 7 | Pending |

**Recommended order:** 3 → 4 → 1 → 2 → 5 → 6 → 7 → 8 → 10

Start with lower-complexity features (3, 4) to build momentum, then tackle the core 2D editor (1, 2, 5), and finish with independent features (6, 7, 8, 10).

**Current status:** Phases 1-6 complete. Phase 7 has partial implementation (chamfer mirroring issue pending). Editor toolbar added to both 2D and 3D views with placeholder tools.

---

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `src/components/SketchView2D.tsx` | Main 2D editor component with canvas/SVG rendering |
| `src/components/SketchToolbar.tsx` | Tool selection, boolean mode, grid settings |
| `src/components/CornerEditor.tsx` | Corner selection and finish controls popup |
| `src/utils/editableAreas.ts` | Calculate safe zones for cutouts |
| `src/utils/cornerDetection.ts` | Detect corners from panel geometry |
| `src/utils/cornerFinish.ts` | Apply chamfer/fillet to path points |
| `src/utils/booleanOps.ts` | Union/difference operations on polygons |
| `src/utils/geometry2d.ts` | Point-in-polygon, intersection, angle calculations |

### Modified Files
| File | Changes |
|------|---------|
| `src/types.ts` | Add FeetConfig, CornerFinish, percentage subdivision fields |
| `src/store/useBoxStore.ts` | Sketch view state, feet actions, percentage subdivision handling |
| `src/components/PanelProperties.tsx` | "Edit in 2D" button, corner finish controls |
| `src/components/SubdivisionControls.tsx` | Two-panel detection, percentage toggle |
| `src/components/AssemblyProperties.tsx` | Feet configuration UI |
| `src/utils/panelGenerator.ts` | Feet extension generation, corner finishing |
| `src/utils/svgExport.ts` | Include corner finishing in exports |

---

## Verification

### Phase 1-2: 2D Sketch View
1. Select panel → click "Edit in 2D" → 2D view opens
2. Blue edges (generated) are not draggable
3. Orange edges (editable) can be dragged per rules
4. Joint lines shown separately from panel edges
5. Changes reflect in 3D view after editing

### Phase 3: Two-Plane Subdivision
1. Select front + back panels (Shift+click)
2. "Subdivide" option appears
3. Only X and Y axis options shown (not Z)
4. Create subdivision → divider appears

### Phase 4: Percentage Subdivisions
1. Create subdivision with "Scale with dimensions" enabled
2. Change box width → subdivision moves proportionally
3. Toggle to "Lock position" → subdivision stays fixed

### Phase 5: Editable Areas
1. In 2D view, green zones visible
2. Draw rectangle in green zone → hole created
3. Attempt to draw in non-green zone → rejected

### Phase 6: Feet
1. Enable feet in Assembly Properties
2. Bottom is forced solid, side panels extend down
3. 3D view shows feet
4. SVG export includes extended panels

### Phase 7: Corner Finishing
1. Select corner finish type in properties
2. Eligible corners show chamfer/fillet
3. Ineligible corners (near joints) unchanged
4. SVG export includes corner modifications

---

## Design Decisions (Resolved)

| Question | Decision |
|----------|----------|
| 2D View Mode | Replace viewport with toggle to flip back/forth |
| Cutout Tools | Multiple tools: freeform, rectangle, circle with boolean ops |
| Corner Scope | Per-corner, including dynamically created corners |
| Feet Geometry | Corner extensions with sloped inner edge, optional chamfer/fillet |

---

## Store Architecture for 2D Editing

### New State

```typescript
// View mode
viewMode: '3d' | '2d'
sketchPanelId: string | null      // Panel being edited in 2D

// Drawing state
activeTool: 'select' | 'freeform' | 'rectangle' | 'circle' | 'corner'
booleanMode: 'add' | 'subtract'
mirrorMode: 'none' | 'horizontal' | 'vertical' | 'both'
drawingPoints: Point[]            // Current in-progress shape

// Undo/Redo for 2D edits
sketchHistory: PanelPath[]
sketchHistoryIndex: number
```

### Panel Path Extensions

```typescript
interface PanelPath {
  // ... existing fields ...

  // Custom geometry (from boolean operations)
  customOutline?: PathPoint[]     // If set, overrides generated outline

  // Corner finishes
  cornerFinishes: CornerFinish[]

  // Detected corners (computed)
  detectedCorners?: DetectedCorner[]
}
```

### Actions

```typescript
// View toggle
setViewMode: (mode: '3d' | '2d') => void
enterSketchView: (panelId: string) => void
exitSketchView: () => void

// Drawing
setActiveTool: (tool: ToolType) => void
setBooleanMode: (mode: 'add' | 'subtract') => void
setMirrorMode: (mode: MirrorMode) => void
addDrawingPoint: (point: Point) => void
completeDrawing: () => void       // Apply boolean operation (with mirroring)
cancelDrawing: () => void

// Corner finishing
setCornerFinish: (panelId: string, cornerId: string, finish: CornerFinish) => void

// Undo/Redo
undoSketchEdit: () => void
redoSketchEdit: () => void
```

---

## Technical Notes

### Boolean Operations Library

For polygon union/difference, consider:
- **Clipper2** (via clipper2-js): Fast, robust, handles complex cases
- **polygon-clipping**: Pure JS, smaller bundle
- **Custom implementation**: More control but complex edge cases

Recommendation: Use `clipper2-js` for reliability with complex shapes.

### SVG vs Canvas for 2D View

| Approach | Pros | Cons |
|----------|------|------|
| SVG | Native DOM events, easy styling, scalable | Slower with many elements |
| Canvas | Fast rendering, pixel-level control | Manual hit testing, harder interaction |

Recommendation: SVG for initial implementation (simpler interaction model), Canvas if performance becomes an issue.
