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

---

## Phase 7: Corner Finishing

### 7.1 Corner Detection & Model

Corners are detected dynamically from panel geometry, not just the 4 panel corners:

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

### 7.2 Corner Detection Algorithm

1. Walk panel outline points
2. At each point, calculate angle between incoming and outgoing edges
3. If angle < 180° (concave or right-angle), it's a "corner"
4. Calculate distance to nearest joint/edge for max radius

**Corner Types:**
- Original 4 corners of rectangular panel
- Corners created by cutouts (subtraction)
- Corners created by additions (union)
- Inner corners (concave) from L-shaped cuts

### 7.3 Eligibility Check

A corner is eligible for finishing if:
- It's in an editable area (not near joints)
- The requested radius ≤ maxRadius
- Both adjacent edges are long enough

### 7.4 Path Modification

- **Chamfer**: Replace corner vertex with two vertices creating 45° cut
- **Fillet**: Replace corner vertex with arc (polyline approximation for SVG compatibility)

### 7.5 UI in 2D Sketch View

- Eligible corners shown with small indicator
- Click corner → popup with chamfer/fillet options
- Slider or input for radius
- Preview shows result before applying

---

## Implementation Order

| Phase | Feature | Complexity | Dependencies |
|-------|---------|------------|--------------|
| 1 | 2D Sketch View | High | None |
| 2 | Joint Line Visualization | Medium | Phase 1 |
| 3 | Two-Plane Subdivision | Low | None |
| 4 | Percentage Subdivisions | Medium | None |
| 5 | Editable Areas | Medium | Phase 1 |
| 6 | Assembly Feet | Medium | None |
| 7 | Corner Finishing | Medium | Phase 5 |

**Recommended order:** 3 → 4 → 1 → 2 → 5 → 6 → 7

Start with lower-complexity features (3, 4) to build momentum, then tackle the core 2D editor (1, 2, 5), and finish with independent features (6, 7).

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

