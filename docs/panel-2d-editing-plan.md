# Panel 2D Editing Plan

## Overview

Enable users to customize panel geometry beyond the automatic finger joints and edge extensions. This includes:
- Custom edge paths (for decorative edges, feet, etc.)
- Cutout shapes (for handles, vents, decorative holes)
- A 2D editing view with drawing tools

---

## Core Concepts

### Safe Space (Editable Areas)

**Direction:** The new safe space system will replace the existing `editableAreas.ts` with a more comprehensive approach that handles both edge joints AND slot holes.

The safe space is the region where custom geometry (cutouts, edge modifications) can be added without interfering with structural joints. Anything outside the safe space could break finger joint or cross-lap slot connections.

```
┌─────────────────────────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  ← Jointed edge (male fingers)
│ ▓                               ▓ │
│ ▓    ┌───────────────────┐      ▓ │  ← MT margin around joints
│ ▓    │                   │      ▓ │
│ ▓    │    SAFE SPACE     │      ▓ │  ← Custom geometry allowed here
│ ▓    │  ┌───┐            │      ▓ │
│ ▓    │  │ X │ ← slot     │      ▓ │  ← Slot holes are exclusions within safe space
│ ▓    │  └───┘            │      ▓ │
│ ▓    └───────────────────┘      ▓ │
│ ▓                               ▓ │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  ← Jointed edge (female slots)
└─────────────────────────────────────┘
         ↑ Open edge (no exclusion)
```

**Key Exclusion Types:**

| Exclusion | Description |
|-----------|-------------|
| **Edge joints** | Finger joint regions at panel edges (MT margin) |
| **Slot holes** | Where divider panels pass through (cross-lap joints) |
| **Slot margins** | MT margin around each slot hole |

**Calculation:**
```
Safe Space = Panel Surface
           - Jointed edge regions (finger/slot at edges)
           - MT margin around jointed edges
           - Slot hole regions (divider intersections)
           - MT margin around slot holes
```

**Legacy:** The existing `src/utils/editableAreas.ts` handles edge joints but NOT slot holes. It will be enhanced or replaced with the new system.

**Return Type:**
```typescript
interface SafeSpaceRegion {
  // The main safe area polygon (may be complex shape)
  outline: PathPoint[];
  // Internal exclusions (slot holes with margins)
  exclusions: PathPoint[][];
}
```

The safe space may have a complex outline (not just a rectangle) and contains internal exclusions for each slot hole.

### Reserved Regions (Uneditable)

Certain regions and lines on a panel are **reserved for mechanical reasons** and cannot be edited. These ensure the box assembles correctly.

**Reserved Elements:**

| Element | Reason | Visual Treatment |
|---------|--------|------------------|
| **Finger joint edges** | Required for panel-to-panel connection | Shown as locked/grayed lines |
| **Finger joint region** (MT from edge) | Fingers extend into this area | Shaded as reserved zone |
| **Slot holes** | Divider panels pass through here | Shown as locked cutouts |
| **Slot margins** (MT around slots) | Structural clearance for cross-lap joints | Shaded as reserved zone |
| **Joint line segments** | The actual finger/slot geometry | Cannot be selected or modified |

**UI Behavior:**

1. **Visual distinction**: Reserved regions shown with distinct styling (e.g., hatched pattern, grayed out, or different color) to clearly separate them from editable areas

2. **Selection blocking**: Clicking on reserved lines/regions does not select them; instead shows a tooltip explaining why (e.g., "Reserved for finger joints")

3. **Edit prevention**: Drawing tools cannot place geometry that overlaps reserved regions; snapping avoids reserved boundaries

4. **Read-only display**: Joint geometry is displayed but not editable - users can see the finger pattern but cannot modify it

**Data Model:**
```typescript
interface ReservedRegion {
  type: 'joint-edge' | 'joint-margin' | 'slot' | 'slot-margin';
  polygon: PathPoint[];
  reason: string;  // Human-readable explanation
}

interface SafeSpaceRegion {
  outline: PathPoint[];
  exclusions: PathPoint[][];  // Slot holes with margins
  reserved: ReservedRegion[]; // All reserved regions for UI display
}
```

### Edge Types

Each panel edge can be one of three types:

| Type | Description | Customizable? |
|------|-------------|---------------|
| **Jointed** | Finger joints rendered | No (male), Partial (female)* |
| **Open** | Smooth line corner-to-corner | Yes |
| **Custom** | User-defined edge path | Yes |

*Female jointed edges can have custom paths if they extend beyond MT from the joint.

---

## Custom Edge Paths

### Definition

A custom edge path replaces the default straight line between two corners with a user-defined polyline.

```typescript
interface CustomEdgePath {
  edge: EdgePosition;        // 'top' | 'bottom' | 'left' | 'right'
  points: EdgePoint[];       // Points from left to right corner
  mirrored: boolean;         // Default: true
}

interface EdgePoint {
  x: number;  // 0 = left corner, 1 = right corner (normalized)
  y: number;  // Positive = outward, negative = inward
}
```

### Rules

1. **Mirroring (default behavior)**
   - Path is automatically mirrored around panel center
   - Points cannot exceed x = 0.5 (panel center)
   - Creates symmetrical designs (e.g., feet, decorative scallops)

2. **Non-mirrored paths**
   - Full control from x = 0 to x = 1
   - Points can be diagonal (not restricted to axis-aligned)

3. **Joint restrictions**
   - **Male jointed edges**: Cannot have custom paths on jointed portion
   - **Female jointed edges**: Can have custom paths if extending > MT from joint
   - Open edges: Full custom path freedom

4. **Feet ARE custom edge paths**
   - Feet are NOT a separate mechanism - they are custom edge paths on the bottom edge
   - The feet configuration (height, width, inset) is a **shorthand/preset** that generates a custom path
   - When feet are enabled, the system generates the equivalent `CustomEdgePath`
   - Users can then further edit the generated path if desired
   - Mirrored by default for symmetry

### Corner Filleting on Custom Paths

Any angle (vertex) on a custom edge path can be filleted. This uses the same fillet system as panel corners.

**Fillet Eligibility Rules:**

| Condition | Fillet Allowed? |
|-----------|-----------------|
| Interior angle (< 180°) | Yes |
| Exterior angle (> 180°) | Yes (creates outward curve) |
| Straight segment (180°) | No (no corner to fillet) |
| Vertex at path endpoint | No (connects to panel corner or joint) |
| Vertex within joint region | No (would interfere with finger joints) |

**Maximum Radius Calculation:**

The maximum fillet radius at a vertex is limited by the shorter of the two adjacent segments:

```
maxRadius = min(segmentA.length, segmentB.length) × sin(angle/2)
```

Where `angle` is the interior angle at the vertex. This ensures the fillet arc doesn't extend beyond either adjacent segment.

**Additional constraints:**
- Fillet cannot extend into joint region (must stay within safe space)
- Fillet cannot cause path to self-intersect
- Minimum radius: 1mm (below this, fillet is not rendered)

**Data Model:**
```typescript
interface CustomEdgePath {
  edge: EdgePosition;
  points: EdgePoint[];
  mirrored: boolean;
  // Fillet radii at each interior vertex (index matches point index)
  fillets?: number[];
}
```

### Example: Feet Shorthand → Custom Path

The feet configuration is a shorthand that generates a custom edge path:

```typescript
// Feet shorthand configuration
const feetConfig: FeetConfig = {
  enabled: true,
  height: 15,    // How far feet extend downward
  width: 20,     // Width of each foot
  inset: 10,     // Distance from panel edge to outer edge of foot
};

// This generates the equivalent CustomEdgePath:
const generatedPath: CustomEdgePath = {
  edge: 'bottom',
  mirrored: true,  // Only define left half, mirror handles right
  points: [
    { x: 0.0, y: 0 },      // Start at corner
    { x: 0.1, y: 0 },      // Flat until notch starts (inset)
    { x: 0.1, y: -15 },    // Notch up (negative = inward, height)
    { x: 0.3, y: -15 },    // Across notch (inset + width)
    { x: 0.3, y: 0 },      // Back down
    { x: 0.5, y: 0 },      // Continue to center
  ],
  // Optional: fillet the inner corners of the notch
  fillets: [0, 0, 3, 3, 0, 0],  // 3mm fillet at notch corners
};
```

Once generated, users can edit the path directly to customize foot shapes beyond what the shorthand allows.

---

## Panel Cutouts

### Cutout Types

Any closed shape placed within the safe space becomes a cutout:

1. **Rectangles** - For vents, slots
2. **Circles/Ellipses** - For finger holes, decorative
3. **Custom paths** - For handles, complex shapes
4. **Imported SVG patterns** - For decorative grilles

### Positioning

All cutout positions are **relative to panel center**:
- Origin (0, 0) = panel center
- Positive X = right, Negative X = left
- Positive Y = up (toward top edge), Negative Y = down

This ensures cutouts stay centered when panel dimensions change.

### Shape Modes

When adding shapes, user can choose:

| Mode | Effect |
|------|--------|
| **Add (Union)** | Shape adds to panel outline |
| **Subtract** | Shape cuts out from panel |
| **Clipping** | Shape defines visible region |

---

## 2D Editing View

### View Layout

```
┌─────────────────────────────────────────────────────────┐
│ [Tools]                              [Mirror: X ○ Y ○]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│                    ┌─────────────┐                      │
│                    │             │                      │
│                    │   PANEL     │    ← Panel outline   │
│                    │   PREVIEW   │      with safe area  │
│                    │             │      highlighted     │
│                    └─────────────┘                      │
│                                                         │
│  [Properties Panel]                                     │
└─────────────────────────────────────────────────────────┘
```

### Tools

| Tool | Icon | Function |
|------|------|----------|
| **Select** | ↖ | Select nodes, lines, shapes |
| **Line** | / | Draw lines, snaps to existing paths |
| **Rectangle** | ▢ | Draw rectangles |
| **Circle** | ○ | Draw circles (center or corner mode) |
| **Fillet** | ◜ | Round corners on selected path |
| **Inset** | ⊟ | Inset/outset selected edge |

### Tool Behaviors

**Line Tool:**
- Snaps to existing path points and edges
- Automatically adds to path area (union) by default
- Toggle subtraction mode for cutouts
- Click-click-doubleclick to complete path

**Rectangle Tool:**
- Drag from corner or center
- Shift = square
- Creates cutout by default in safe area

**Circle Tool:**
- Drag from center (default) or corner
- Creates cutout by default in safe area

**Select Tool:**
- Click to select node/line/shape
- Drag to move
- Delete key to remove
- Properties panel shows coordinates

### Mirror Palette

Toggle mirror axes to automatically duplicate edits:
- **X-axis**: Mirror left/right
- **Y-axis**: Mirror top/bottom
- Both: 4-way symmetry

---

## Import Features

### Import Bitmap

1. User uploads image (PNG, JPG)
2. Image placed as reference layer (not cut)
3. User traces over image with drawing tools
4. Or: Auto-trace to create cut path (stretch goal)

### Import Pattern (SVG)

1. User uploads SVG file
2. Dialog shows SVG paths
3. User selects which path to use as:
   - Cutout shape
   - Clipping mask
   - Edge path
4. Pattern scaled/positioned relative to panel center

---

## Panel Feature Copying

### Copy Between Panels

Users can copy custom features from one panel to another:

**Constraints:**
- Can only copy between panels with **same gendered edges**
- Target panel must have compatible safe space

**Behavior:**
- All changes are **relative to edge positions**
- Copying resets any unique modifications on target
- Custom edge paths copy if edge types match

### Implementation

```typescript
interface PanelFeatures {
  customEdgePaths: CustomEdgePath[];
  cutouts: PanelCutout[];
  // Does NOT include: finger joints, slots (auto-generated)
}

// Action
'COPY_PANEL_FEATURES': {
  sourcePanelId: string;
  targetPanelId: string;
  features: ('edges' | 'cutouts' | 'all')[];
}
```

---

## Data Model Changes

### PanelPath Extensions

```typescript
interface PanelPath {
  // ... existing fields ...

  // New fields for custom geometry
  customEdgePaths?: CustomEdgePath[];
  cutouts?: PanelCutout[];

  // Computed safe space (for UI)
  safeSpace?: SafeSpaceRegion;
}

interface PanelCutout {
  id: string;
  type: 'rectangle' | 'circle' | 'path';
  position: { x: number; y: number };  // Relative to panel center
  geometry: CutoutGeometry;
  mode: 'subtract' | 'clip';
}

interface SafeSpaceRegion {
  // Polygon defining the safe area
  outline: PathPoint[];
  // Excluded regions (around joints)
  exclusions: PathPoint[][];
}
```

### Engine Actions

```typescript
// Custom edge paths
'SET_CUSTOM_EDGE_PATH': {
  panelId: string;
  edge: EdgePosition;
  points: EdgePoint[];
  mirrored: boolean;
}

'CLEAR_CUSTOM_EDGE_PATH': {
  panelId: string;
  edge: EdgePosition;
}

// Cutouts
'ADD_PANEL_CUTOUT': {
  panelId: string;
  cutout: PanelCutout;
}

'UPDATE_PANEL_CUTOUT': {
  panelId: string;
  cutoutId: string;
  changes: Partial<PanelCutout>;
}

'REMOVE_PANEL_CUTOUT': {
  panelId: string;
  cutoutId: string;
}
```

---

## Implementation Phases

### Phase 1: Safe Space Calculation
1. Create `src/engine/safeSpace.ts` with new calculation logic
2. Include edge joint margins (existing logic from editableAreas.ts)
3. Include slot hole detection from panel `holes` array
4. Add MT margin around each slot hole
5. Return `SafeSpaceRegion` with outline polygon and exclusion polygons
6. Add `safeSpace` to PanelPath
7. Update 2D view to show safe space outline and exclusion regions

### Phase 2: Custom Edge Paths
1. Add data model for custom edge paths
2. Implement edge path rendering in panel generation
3. Create edge path editor UI
4. Implement feet as custom edge path preset

### Phase 3: Basic Cutouts
1. Add cutout data model
2. Implement rectangle and circle cutouts
3. Create cutout tools in 2D view
4. Validate cutouts stay within safe space

### Phase 4: 2D Drawing Tools
1. Implement line tool with snapping
2. Implement select tool with node editing
3. Add shape mode toggle (add/subtract)
4. Implement fillet tool for paths

### Phase 5: Import Features
1. Implement bitmap import as reference layer
2. Implement SVG pattern import
3. Create import dialogs

### Phase 6: Panel Feature Copying
1. Implement feature copying between compatible panels
2. Add copy/paste UI
3. Handle edge gender compatibility

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/engine/safeSpace.ts` | Create | Safe space calculation with slot exclusions |
| `src/utils/editableAreas.ts` | Deprecate | Legacy system, replaced by safeSpace.ts |
| `src/engine/types.ts` | Modify | Add SafeSpaceRegion, CustomEdgePath, PanelCutout types |
| `src/engine/panelBridge.ts` | Modify | Include safeSpace and custom geometry in PanelPath |
| `src/components/SketchView2D.tsx` | Modify | Show safe space with exclusions, add 2D editing tools |
| `src/components/tools/LineTool.tsx` | Create | Line drawing tool |
| `src/components/tools/RectangleTool.tsx` | Create | Rectangle tool |
| `src/components/tools/CircleTool.tsx` | Create | Circle tool |
| `src/components/tools/SelectTool.tsx` | Create | Selection and node editing |
| `src/components/ImportDialog.tsx` | Create | SVG/bitmap import |
| `src/utils/svgImport.ts` | Create | SVG parsing utilities |

---

## Open Questions

1. Should custom edge paths support curves (bezier) or only polylines?
2. How to handle cutouts that would make panel structurally unsound?
3. Should there be preset shape libraries (common handle shapes, vent patterns)?
4. How does undo/redo interact with 2D editing? (ties into general undo feature)
