# 2D Sketch Editor Plan

Core 2D panel editing view with drawing tools, boolean operations, and corner finishing.

## Status

| Feature | Status |
|---------|--------|
| 2D Sketch View Editor | Complete |
| Joint Line Visualization | Complete |
| Editable Areas & Drawing Tools | Complete |
| Corner Finishing (2D UI) | Partial |
| Advanced 2D Tools | Pending |

---

## Phase 1: 2D Sketch View Editor (Core)

### 1.1 Component: `SketchView2D.tsx`

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

## Phase 3: Editable Areas & Drawing Tools

### 3.1 Calculate Safe Zones

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

### 3.2 Visualization

- In 2D Sketch View: green-tinted overlay rectangles
- In 3D view (optional): subtle highlighting

### 3.3 Drawing Tools & Boolean Operations

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

### 3.4 Mirror Mode for Symmetrical Editing

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

## Phase 4: Corner Finishing (2D Interface)

### 4.1 Chamfer/Fillet Tool Workflow

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

### 4.2 Corner Detection & Model

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

### 4.3 Eligibility Check

A corner is eligible for finishing if:
- It's in an editable area (not near joints)
- The requested radius ≤ maxRadius
- Both adjacent edges are long enough

**Maximum Radius Rule:**
The maximum chamfer/fillet radius for a corner is limited by the **shortest line segment extending from that corner point**.

```typescript
maxRadius = Math.min(edge1Length, edge2Length);
```

### 4.4 Visual Indicators

| State | Appearance |
|-------|------------|
| Unselected eligible corner | Small circle outline (gray) |
| Hovered corner | Circle with highlight (cyan) |
| Selected corner | Filled circle (cyan) |
| Corner with existing finish | Circle with checkmark or filled |
| Ineligible corner | No indicator (or dimmed) |

---

## Phase 5: Advanced 2D Tools (Future)

### 5.1 Point Selection
- Select individual vertices for fine-grained editing
- Move, delete, or insert points on panel outline

### 5.2 Additional Shape Tools
- Rectangle, circle, polygon primitives for cutouts
- Path Tool: Freeform point-by-point path drawing

### 5.3 Multi-Panel Simultaneous Editing
- Select multiple panels and enter 2D editor
- Apply same operations to all selected panels at once
- Synchronized view showing all panels being edited

### 5.4 Grid Snapping
- Enable/disable snap-to-grid when dragging edges or drawing shapes
- Configurable grid size (e.g., 1mm, 5mm, 10mm)
- Visual grid overlay showing snap points
- Keyboard modifier (e.g., hold Shift) to temporarily disable snapping
- Snap to other geometry (edges, corners, center points) in addition to grid

### 5.5 Panel Modification Copying
- Copy modifications from Panel A to Panel B
- Useful for applying same cutouts/chamfers to opposite faces
- Option to mirror when copying to opposite panel

---

## Store Architecture

### State

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

---

## Files

### New Files
| File | Purpose |
|------|---------|
| `src/components/SketchView2D.tsx` | Main 2D editor component |
| `src/components/SketchToolbar.tsx` | Tool selection, boolean mode, grid settings |
| `src/components/CornerEditor.tsx` | Corner selection and finish controls |
| `src/utils/editableAreas.ts` | Calculate safe zones for cutouts |
| `src/utils/cornerDetection.ts` | Detect corners from panel geometry |
| `src/utils/cornerFinish.ts` | Apply chamfer/fillet to path points |
| `src/utils/booleanOps.ts` | Union/difference operations on polygons |
| `src/utils/geometry2d.ts` | Point-in-polygon, intersection, angle calculations |

### Modified Files
| File | Changes |
|------|---------|
| `src/store/useBoxStore.ts` | Sketch view state, drawing actions |
| `src/components/PanelProperties.tsx` | "Edit in 2D" button |
