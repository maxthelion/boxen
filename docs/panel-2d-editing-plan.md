# Panel 2D Editing Plan

## Overview

Enable users to customize panel geometry beyond the automatic finger joints and edge extensions. This includes:
- Custom edge paths (for decorative edges, feet, etc.)
- Cutout shapes (for handles, vents, decorative holes)
- A 2D editing view with drawing tools

---

## Core Concepts

### Geometry Model: Assembly → Panel

The system has two distinct geometry domains with a constraint relationship:

```
┌─────────────────────────────────────────────────────────────┐
│                  ASSEMBLY GEOMETRY                           │
│                 (3D structural model)                        │
├─────────────────────────────────────────────────────────────┤
│  • Box dimensions (W × H × D)                                │
│  • Face configuration (which faces solid)                    │
│  • Void tree (subdivisions, sub-assemblies)                  │
│  • Material properties (thickness, finger width)             │
│  • Assembly config (axis, lids, feet)                        │
│                                                              │
│  Managed by: ENGINE (existing)                               │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ Derives constraints
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                 PANEL CONSTRAINTS                            │
│              (derived from assembly)                         │
├─────────────────────────────────────────────────────────────┤
│  Per panel (read-only, computed):                            │
│  • Body dimensions                                           │
│  • Edge types (male joint / female joint / open)             │
│  • Safe space outline                                        │
│  • Slot exclusions                                           │
│  • Corner positions and max fillet radii                     │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ Constrains
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  PANEL GEOMETRY                              │
│               (2D editable features)                         │
├─────────────────────────────────────────────────────────────┤
│  Per panel (editable within constraints):                    │
│  • Custom edge paths (must stay within safe space)           │
│  • Cutouts (must stay within safe space)                     │
│  • Corner fillets (limited by max radius)                    │
│  • Edge extensions (limited by edge type)                    │
│                                                              │
│  Managed by: ENGINE (new) + 2D EDITOR                        │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ Combined into
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   PANEL OUTPUT                               │
│              (final renderable/exportable)                   │
├─────────────────────────────────────────────────────────────┤
│  • Complete outline (joints + custom paths + fillets)        │
│  • All holes (slots + cutouts)                               │
│  • Transform (3D position/rotation)                          │
│  • Metadata (source, label)                                  │
└─────────────────────────────────────────────────────────────┘
```

**Key principles:**
1. Assembly geometry changes invalidate panel constraints
2. Panel geometry must respect panel constraints (validation)
3. Both levels are persisted in engine state
4. Panel output is derived (computed on demand)

**Data model:**
```typescript
// Panel Constraints - derived, read-only
interface PanelConstraints {
  bodyDimensions: { width: number; height: number };
  edges: Map<EdgePosition, EdgeConstraint>;
  safeSpace: SafeSpaceRegion;
  corners: Map<CornerPosition, CornerConstraint>;
}

interface EdgeConstraint {
  type: 'male-joint' | 'female-joint' | 'open';
  canExtend: boolean;
  maxInset: number;
}

interface CornerConstraint {
  position: PathPoint;
  maxFilletRadius: number;
  edges: [EdgePosition, EdgePosition];
}

// Panel Geometry - editable within constraints
interface PanelGeometry {
  edgePaths: Map<EdgePosition, CustomEdgePath>;
  cutouts: Cutout[];
  cornerFillets: Map<CornerPosition, number>;
  edgeExtensions: Map<EdgePosition, number>;
}
```

**Engine actions span both levels:**
```typescript
type EngineAction =
  // Assembly-level (existing)
  | { type: 'SET_DIMENSIONS'; ... }
  | { type: 'ADD_SUBDIVISION'; ... }

  // Panel-level (new)
  | { type: 'SET_EDGE_PATH'; panelId: string; edge: EdgePosition; path: CustomEdgePath }
  | { type: 'ADD_CUTOUT'; panelId: string; cutout: Cutout }
  | { type: 'SET_CORNER_FILLET'; panelId: string; corner: CornerPosition; radius: number }
```

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

### Interaction Modes

The 2D editor has three distinct interaction modes, each with different state management and undo behavior:

#### 1. Operations (Discrete Parameter Changes)

Standard operations with clear inputs and atomic results. Uses the centralized operation system.

**Examples:** Inset edge, fillet corner, add predefined cutout shape

**Flow:**
```
Select target → Set parameters → Preview → Apply/Cancel
```

**Characteristics:**
- Uses `startOperation` → `updateOperationParams` → `applyOperation`
- Engine preview scene shows live result
- Apply commits as single undo step
- Cancel discards preview

#### 2. Draft Mode (Creating New Geometry)

For drawing new paths/shapes that don't exist yet. Geometry is collected in a temporary buffer and only added to the model on completion.

**Examples:** Draw polyline, draw polygon, draw freehand path

**Flow:**
```
┌─────────────────────────────────────────────────────────────┐
│                      DRAFT MODE                              │
│                                                              │
│   Model State                    Draft Buffer                │
│  ┌──────────────┐              ┌──────────────────┐         │
│  │              │              │ • Point 1        │         │
│  │  (unchanged) │              │ • Point 2        │         │
│  │              │              │ • Point 3 ←      │         │
│  └──────────────┘              └──────────────────┘         │
│                                                              │
│   Draft rendered as overlay - NOT in model yet              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Characteristics:**
- Session starts implicitly on first input (e.g., first click places first point)
- Points accumulate in temporary buffer, not in model
- Draft rendered as visual overlay
- `Cmd+Z` removes last point from buffer (simple array pop)
- `Esc` discards entire draft
- Finish (double-click, Enter, Done) creates single operation with final geometry

**Data Model:**
```typescript
interface DraftState {
  type: 'polyline' | 'polygon' | 'rectangle' | 'circle';
  targetPanelId: string;
  targetEdge?: EdgePosition;  // For edge paths
  points: PathPoint[];        // Accumulated points
}
```

**Implementation:**
```typescript
// Draft is just local state - no operation dispatch until finish
function handleClick(point: PathPoint) {
  draft.points.push(point);
  renderDraftOverlay();
}

function handleUndo() {
  draft.points.pop();  // Simple array manipulation
  renderDraftOverlay();
}

function handleEscape() {
  draft = null;  // Discard entirely, nothing to restore
}

function handleFinish() {
  // NOW dispatch the actual operation
  engine.dispatch({
    type: 'ADD_CUSTOM_EDGE_PATH',
    payload: { panelId, edge, points: draft.points }
  });
  draft = null;
}
```

#### 3. Edit Session (Modifying Existing Geometry)

For editing geometry that already exists in the model. Captures initial state and tracks micro-edits for session-scoped undo.

**Examples:** Edit existing path nodes, reshape cutout, move vertices

**Flow:**
```
┌─────────────────────────────────────────────────────────────┐
│                     EDIT SESSION                             │
│                                                              │
│   Initial State (captured)       Live State (in model)      │
│  ┌──────────────┐              ┌──────────────────┐         │
│  │ • Point 1    │              │ • Point 1        │         │
│  │ • Point 2    │   ───────►   │ • Point 2 (moved)│         │
│  │ • Point 3    │              │ • Point 3        │         │
│  └──────────────┘              │ • Point 4 (new)  │         │
│        ↑                       └──────────────────┘         │
│   For Esc rollback                                          │
│                                                              │
│   Session undo stack: [move P2, add P4]                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Characteristics:**
- Session starts implicitly when user begins editing (e.g., starts dragging a node)
- Initial state captured for rollback
- Micro-edits modify model directly (live feedback)
- Session maintains its own undo stack
- `Cmd+Z` undoes last micro-edit within session
- `Esc` restores initial state (full rollback)
- Done commits entire session as single operation

**Data Model:**
```typescript
interface EditSession {
  type: 'path-edit' | 'cutout-edit';
  targetId: string;
  initialState: SerializedState;  // For Esc rollback
  undoStack: MicroEdit[];         // Session-scoped undo
  redoStack: MicroEdit[];         // Session-scoped redo
}

type MicroEdit =
  | { type: 'move-node'; nodeIndex: number; from: PathPoint; to: PathPoint }
  | { type: 'add-node'; nodeIndex: number; point: PathPoint }
  | { type: 'delete-node'; nodeIndex: number; point: PathPoint };
```

#### Mode Summary

| Mode | When | Model State | Undo Behavior | Cancel (Esc) |
|------|------|-------------|---------------|--------------|
| **Operation** | Inset, fillet, add shape | Preview scene | N/A (adjust params) | Discard preview |
| **Draft** | Drawing new path/shape | Unchanged | Pop from buffer | Discard buffer |
| **Edit Session** | Editing existing geometry | Modified live | Session undo stack | Restore initial |

#### Undo Routing

```typescript
function handleUndo() {
  if (draftState) {
    // In draft mode - pop last point
    draftState.points.pop();
  } else if (editSession) {
    // In edit session - undo last micro-edit
    const edit = editSession.undoStack.pop();
    applyInverse(edit);
    editSession.redoStack.push(edit);
  } else {
    // Normal - global undo
    undoLastOperation();
  }
}

function handleEscape() {
  if (draftState) {
    draftState = null;  // Discard draft
  } else if (editSession) {
    restoreState(editSession.initialState);  // Rollback
    editSession = null;
  }
}
```

### Editor Context Architecture

A unified **Editor Context** manages all interaction modes, providing a consistent interface across 2D and 3D views.

#### State Machine (Pure, Testable)

The core logic is a pure state machine with no React dependencies:

```typescript
// src/editor/EditorStateMachine.ts - NO React imports

type EditorMode = 'idle' | 'operation' | 'draft' | 'editing';

interface EditorState {
  mode: EditorMode;
  activeView: '2d' | '3d';
  originView: '2d' | '3d';      // View that started this mode
  validViews: ('2d' | '3d')[];  // Views where this mode works

  // Operation mode
  operationId?: string;
  operationParams?: Record<string, unknown>;

  // Draft mode
  draftType?: 'polyline' | 'polygon' | 'rectangle';
  draftTarget?: { panelId: string; edge?: EdgePosition };
  draftPoints: PathPoint[];

  // Edit session mode
  editTarget?: string;
  initialSnapshot?: SerializedState;
  editHistory: MicroEdit[];
  editHistoryIndex: number;
}

type EditorAction =
  | { type: 'START_OPERATION'; operationId: string; params?: Record<string, unknown> }
  | { type: 'UPDATE_PARAMS'; params: Record<string, unknown> }
  | { type: 'START_DRAFT'; draftType: string; target: DraftTarget }
  | { type: 'ADD_DRAFT_POINT'; point: PathPoint }
  | { type: 'START_EDIT_SESSION'; targetId: string; snapshot: SerializedState }
  | { type: 'RECORD_EDIT'; edit: MicroEdit }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'COMMIT' }
  | { type: 'CANCEL' };

// Pure reducer - testable without React
function editorReducer(state: EditorState, action: EditorAction): EditorState;

// Pure helper functions - testable
function canUndo(state: EditorState): boolean;
function canRedo(state: EditorState): boolean;
function getCommitPayload(state: EditorState): CommitPayload | null;
```

#### React Hook (Thin Wrapper)

```typescript
// src/editor/useEditorContext.ts
export function useEditorContext() {
  const [state, dispatch] = useReducer(editorReducer, initialState);
  const engine = useEngine();

  return {
    // Mode state
    mode: state.mode,
    isActive: state.mode !== 'idle',

    // Unified interface - same for all modes
    canUndo: canUndo(state),
    canRedo: canRedo(state),
    undo: () => dispatch({ type: 'UNDO' }),
    redo: () => dispatch({ type: 'REDO' }),
    commit: () => { /* dispatch to engine, then reset */ },
    cancel: () => { /* restore/discard, then reset */ },

    // Mode starters
    startOperation: (opId, params) => dispatch({ type: 'START_OPERATION', ... }),
    startDraft: (type, target) => dispatch({ type: 'START_DRAFT', ... }),

    // Mode-specific accessors
    draftPoints: state.draftPoints,
    operationParams: state.operationParams,
    // ...
  };
}
```

#### Single Context, View-Aware

One EditorContext spans both 2D and 3D views:

```
┌─────────────────────────────────────────────────────────────┐
│                    EDITOR CONTEXT                            │
│                   (single instance)                          │
├─────────────────────────────────────────────────────────────┤
│  mode: 'idle' | 'operation' | 'draft' | 'editing'            │
│  activeView: '2d' | '3d'                                     │
│  validViews: ['2d'] | ['3d'] | ['2d', '3d']                  │
└─────────────────────────────────────────────────────────────┘
          │                           │
          ▼                           ▼
   ┌─────────────┐             ┌─────────────┐
   │  3D View    │             │  2D View    │
   └─────────────┘             └─────────────┘
```

**View-specific modes:**
| Mode/Operation | Valid Views |
|----------------|-------------|
| Inset edge | 2D, 3D |
| Fillet corner | 2D, 3D |
| Draw polyline | 2D only |
| Edit path nodes | 2D only |
| Push-pull divider | 3D only |

**View switch behavior:** If user tries to switch views while in a view-specific mode, prompt to finish or cancel first.

#### Testability

```typescript
// Unit test the pure state machine
describe('EditorStateMachine', () => {
  it('accumulates draft points', () => {
    let state = editorReducer(initialState, { type: 'START_DRAFT', ... });
    state = editorReducer(state, { type: 'ADD_DRAFT_POINT', point: { x: 0, y: 0 } });
    state = editorReducer(state, { type: 'ADD_DRAFT_POINT', point: { x: 10, y: 0 } });

    expect(state.draftPoints).toHaveLength(2);
  });

  it('undo removes last draft point', () => {
    // ... setup with 2 points ...
    state = editorReducer(state, { type: 'UNDO' });

    expect(state.draftPoints).toHaveLength(1);
  });
});

// Integration test with mock context
describe('LineTool', () => {
  it('adds point on click', () => {
    const mockContext = { addDraftPoint: vi.fn(), ... };
    render(<EditorContext.Provider value={mockContext}><LineTool /></EditorContext.Provider>);

    fireEvent.click(canvas, { clientX: 100, clientY: 100 });
    expect(mockContext.addDraftPoint).toHaveBeenCalled();
  });
});
```

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

### Phase 1: Safe Space Calculation ✅
1. Create `src/engine/safeSpace.ts` with new calculation logic
2. Include edge joint margins (existing logic from editableAreas.ts)
3. Include slot hole detection from panel `holes` array
4. Add MT margin around each slot hole
5. Return `SafeSpaceRegion` with outline polygon and exclusion polygons
6. Add `safeSpace` to PanelPath
7. Update 2D view to show safe space outline and exclusion regions

### Phase 2: Standardized 2D Operation System ✅
Migrated inset and chamfer/fillet tools to use centralized operation system (`startOperation` → `updateOperationParams` → `applyOperation`). Operations now use engine preview scene for live feedback.

---

### Phase 3: Editor Context Architecture ✅ (Core Complete)

**Goal:** Create a unified editing system that handles all three interaction modes (Operations, Draft, Edit Sessions) with a single, testable state machine.

#### Completion Status

**Core Infrastructure: DONE**
- `src/editor/types.ts` - All type definitions ✅
- `src/editor/EditorStateMachine.ts` - Pure reducer with all modes ✅
- `src/editor/EditorStateMachine.test.ts` - 40 tests passing ✅
- `src/editor/useEditorContext.ts` - React hook + engine sync ✅
- `src/editor/EditorContext.tsx` - Provider + hooks ✅
- `src/editor/useEditorKeyboard.ts` - Keyboard shortcuts ✅
- App.tsx integration - EditorProvider wrapping app ✅

**Remaining Work (to revisit after Phase 5):**

1. **Draft Mode Commit** (`useEditorContext.ts` lines 130-135)
   - Currently a stub - needs engine actions for custom paths/cutouts
   - **Revisit when:** Phase 5 adds cutout engine actions

2. **Edit Session Snapshot Restore** (`useEditorContext.ts` lines 159-161)
   - Currently a stub - needs engine snapshot/restore mechanism
   - **Revisit when:** Phase 4/5 adds geometry that can be edited

3. **Component Migration** - 8 components still use `useBoxStore` for operations:
   - `Viewport3D.tsx`, `SubdividePalette.tsx`, `ScalePalette.tsx`
   - `MovePalette.tsx`, `ConfigurePalette.tsx`, `CreateSubAssemblyPalette.tsx`
   - `PanelEdgeRenderer.tsx`, `PanelCornerRenderer.tsx`
   - **Revisit when:** After Phase 4 to consolidate all operations

**Currently Working:**
- 2D inset/chamfer tools use EditorContext
- Mode-aware undo/redo (Cmd+Z)
- Escape to cancel active mode

#### Why This Architecture?

The current implementation has operations spread across:
- `useBoxStore` (operation state)
- `SketchView2D.tsx` (local tool state)
- Individual palette components

This makes it hard to:
- Add new interaction modes (Draft, Edit Sessions)
- Implement consistent undo/redo across modes
- Test editing logic without React
- Handle view switching during active edits

#### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  EditorStateMachine.ts                       │
│                   (Pure TypeScript)                          │
├─────────────────────────────────────────────────────────────┤
│  • No React dependencies                                     │
│  • Pure reducer: (state, action) → state                     │
│  • All mode logic in one place                               │
│  • Fully unit-testable                                       │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   useEditorContext.ts                        │
│                    (React Hook)                              │
├─────────────────────────────────────────────────────────────┤
│  • Thin wrapper around state machine                         │
│  • Connects to engine for preview/commit                     │
│  • Provides actions as callbacks                             │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   EditorContext.tsx                          │
│                  (React Provider)                            │
├─────────────────────────────────────────────────────────────┤
│  • Single context for both 2D and 3D views                   │
│  • Tools consume via useEditor() hook                        │
└─────────────────────────────────────────────────────────────┘
```

#### State Machine Design

```typescript
// src/editor/types.ts

type EditorMode = 'idle' | 'operation' | 'draft' | 'editing';

interface EditorState {
  mode: EditorMode;

  // View tracking
  activeView: '2d' | '3d';
  originView: '2d' | '3d';      // View that started this mode

  // Operation mode (discrete parameter changes)
  operation?: {
    id: string;
    params: Record<string, unknown>;
  };

  // Draft mode (accumulating new geometry)
  draft?: {
    type: 'polyline' | 'polygon' | 'rectangle' | 'circle';
    targetPanelId: string;
    targetEdge?: EdgePosition;
    points: PathPoint[];
  };

  // Edit session mode (modifying existing geometry)
  editSession?: {
    targetId: string;
    initialSnapshot: unknown;
    history: MicroEdit[];
    historyIndex: number;
  };
}

type EditorAction =
  // Mode transitions
  | { type: 'START_OPERATION'; operationId: string; params?: Record<string, unknown> }
  | { type: 'START_DRAFT'; draftType: DraftType; target: DraftTarget }
  | { type: 'START_EDIT_SESSION'; targetId: string; snapshot: unknown }

  // Operation mode
  | { type: 'UPDATE_PARAMS'; params: Record<string, unknown> }

  // Draft mode
  | { type: 'ADD_DRAFT_POINT'; point: PathPoint }
  | { type: 'UPDATE_DRAFT_POINT'; index: number; point: PathPoint }

  // Edit session mode
  | { type: 'RECORD_EDIT'; edit: MicroEdit }

  // Universal
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'COMMIT' }
  | { type: 'CANCEL' }
  | { type: 'SET_VIEW'; view: '2d' | '3d' };
```

#### Implementation Steps

**Step 1: Create type definitions**

File: `src/editor/types.ts`
- EditorMode, EditorState, EditorAction types
- MicroEdit types for edit sessions
- DraftType, DraftTarget types

**Step 2: Implement pure state machine**

File: `src/editor/EditorStateMachine.ts`
```typescript
export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'START_OPERATION':
      return {
        ...state,
        mode: 'operation',
        originView: state.activeView,
        operation: { id: action.operationId, params: action.params ?? {} },
      };

    case 'UPDATE_PARAMS':
      if (state.mode !== 'operation' || !state.operation) return state;
      return {
        ...state,
        operation: { ...state.operation, params: { ...state.operation.params, ...action.params } },
      };

    case 'UNDO':
      return handleUndo(state);

    case 'CANCEL':
      return { ...state, mode: 'idle', operation: undefined, draft: undefined, editSession: undefined };

    // ... other cases
  }
}

function handleUndo(state: EditorState): EditorState {
  switch (state.mode) {
    case 'draft':
      // Pop last point from draft buffer
      if (!state.draft || state.draft.points.length === 0) return state;
      return {
        ...state,
        draft: { ...state.draft, points: state.draft.points.slice(0, -1) },
      };

    case 'editing':
      // Undo last micro-edit in session
      if (!state.editSession || state.editSession.historyIndex < 0) return state;
      return {
        ...state,
        editSession: {
          ...state.editSession,
          historyIndex: state.editSession.historyIndex - 1,
        },
      };

    default:
      return state; // Operations don't have undo (use cancel)
  }
}

// Helper functions (pure, testable)
export function canUndo(state: EditorState): boolean { /* ... */ }
export function canRedo(state: EditorState): boolean { /* ... */ }
export function canCommit(state: EditorState): boolean { /* ... */ }
export function getOperationParams(state: EditorState): Record<string, unknown> | null { /* ... */ }
export function getDraftPoints(state: EditorState): PathPoint[] { /* ... */ }
```

**Step 3: Write unit tests for state machine**

File: `src/editor/EditorStateMachine.test.ts`
```typescript
describe('EditorStateMachine', () => {
  describe('Operation mode', () => {
    it('starts operation with initial params', () => {
      const state = editorReducer(initialState, {
        type: 'START_OPERATION',
        operationId: 'inset-outset',
        params: { offset: 5 },
      });

      expect(state.mode).toBe('operation');
      expect(state.operation?.id).toBe('inset-outset');
      expect(state.operation?.params.offset).toBe(5);
    });

    it('updates operation params', () => {
      let state = editorReducer(initialState, { type: 'START_OPERATION', operationId: 'inset-outset' });
      state = editorReducer(state, { type: 'UPDATE_PARAMS', params: { offset: 10 } });

      expect(state.operation?.params.offset).toBe(10);
    });

    it('cancels operation and returns to idle', () => {
      let state = editorReducer(initialState, { type: 'START_OPERATION', operationId: 'inset-outset' });
      state = editorReducer(state, { type: 'CANCEL' });

      expect(state.mode).toBe('idle');
      expect(state.operation).toBeUndefined();
    });
  });

  describe('Draft mode', () => {
    it('accumulates draft points', () => {
      let state = editorReducer(initialState, {
        type: 'START_DRAFT',
        draftType: 'polyline',
        target: { panelId: 'panel-1' },
      });
      state = editorReducer(state, { type: 'ADD_DRAFT_POINT', point: { x: 0, y: 0 } });
      state = editorReducer(state, { type: 'ADD_DRAFT_POINT', point: { x: 10, y: 0 } });

      expect(state.draft?.points).toHaveLength(2);
    });

    it('undo removes last draft point', () => {
      // ... setup with 2 points ...
      state = editorReducer(state, { type: 'UNDO' });

      expect(state.draft?.points).toHaveLength(1);
    });

    it('cancel discards entire draft', () => {
      // ... setup with points ...
      state = editorReducer(state, { type: 'CANCEL' });

      expect(state.mode).toBe('idle');
      expect(state.draft).toBeUndefined();
    });
  });

  describe('Edit session mode', () => {
    it('tracks micro-edits in history', () => { /* ... */ });
    it('undo steps back through history', () => { /* ... */ });
    it('cancel restores initial snapshot', () => { /* ... */ });
  });
});
```

**Step 4: Create React hook wrapper**

File: `src/editor/useEditorContext.ts`
```typescript
export function useEditorContext() {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const engine = getEngine();

  // Sync operation params to engine preview
  useEffect(() => {
    if (state.mode === 'operation' && state.operation) {
      const registry = getOperationRegistry();
      const opDef = registry[state.operation.id];
      if (opDef?.createPreviewAction) {
        const action = opDef.createPreviewAction(state.operation.params);
        if (action) {
          engine.startPreview();
          engine.dispatch(action, { preview: true });
        }
      }
    }
  }, [state.operation?.params]);

  const commit = useCallback(() => {
    if (state.mode === 'operation') {
      engine.commitPreview();
    } else if (state.mode === 'draft' && state.draft) {
      // Create operation from draft
      engine.dispatch({
        type: 'ADD_CUSTOM_PATH',
        payload: { panelId: state.draft.targetPanelId, points: state.draft.points },
      });
    }
    dispatch({ type: 'COMMIT' });
  }, [state, engine]);

  const cancel = useCallback(() => {
    if (state.mode === 'operation') {
      engine.discardPreview();
    } else if (state.mode === 'editing' && state.editSession) {
      // Restore initial state
      engine.restoreSnapshot(state.editSession.initialSnapshot);
    }
    dispatch({ type: 'CANCEL' });
  }, [state, engine]);

  return {
    // State
    mode: state.mode,
    isActive: state.mode !== 'idle',
    activeView: state.activeView,

    // Operation mode
    operationId: state.operation?.id,
    operationParams: state.operation?.params ?? {},

    // Draft mode
    draftPoints: state.draft?.points ?? [],
    draftType: state.draft?.type,

    // Edit session
    editTarget: state.editSession?.targetId,

    // Capabilities
    canUndo: canUndo(state),
    canRedo: canRedo(state),
    canCommit: canCommit(state),

    // Actions
    startOperation: (id: string, params?: Record<string, unknown>) =>
      dispatch({ type: 'START_OPERATION', operationId: id, params }),
    updateParams: (params: Record<string, unknown>) =>
      dispatch({ type: 'UPDATE_PARAMS', params }),
    startDraft: (type: DraftType, target: DraftTarget) =>
      dispatch({ type: 'START_DRAFT', draftType: type, target }),
    addDraftPoint: (point: PathPoint) =>
      dispatch({ type: 'ADD_DRAFT_POINT', point }),
    startEditSession: (targetId: string, snapshot: unknown) =>
      dispatch({ type: 'START_EDIT_SESSION', targetId, snapshot }),
    recordEdit: (edit: MicroEdit) =>
      dispatch({ type: 'RECORD_EDIT', edit }),
    undo: () => dispatch({ type: 'UNDO' }),
    redo: () => dispatch({ type: 'REDO' }),
    commit,
    cancel,
    setView: (view: '2d' | '3d') => dispatch({ type: 'SET_VIEW', view }),
  };
}
```

**Step 5: Create React context provider**

File: `src/contexts/EditorContext.tsx`
```typescript
const EditorContext = createContext<ReturnType<typeof useEditorContext> | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const editor = useEditorContext();
  return <EditorContext.Provider value={editor}>{children}</EditorContext.Provider>;
}

export function useEditor() {
  const context = useContext(EditorContext);
  if (!context) throw new Error('useEditor must be used within EditorProvider');
  return context;
}
```

**Step 6: Migrate existing operations**

Update `SketchView2D.tsx` to use the new context:
```typescript
// Before:
const operationState = useBoxStore((state) => state.operationState);
const startOperation = useBoxStore((state) => state.startOperation);
// ...

// After:
const { mode, operationParams, startOperation, updateParams, commit, cancel } = useEditor();
```

**Step 7: Add keyboard handling**

File: `src/editor/useEditorKeyboard.ts`
```typescript
export function useEditorKeyboard() {
  const { mode, undo, redo, cancel, canUndo, canRedo } = useEditor();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo: Cmd+Z (mode-aware)
      if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        if (canUndo) {
          e.preventDefault();
          undo();
        }
      }

      // Redo: Cmd+Shift+Z
      if (e.key === 'z' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        if (canRedo) {
          e.preventDefault();
          redo();
        }
      }

      // Cancel: Escape
      if (e.key === 'Escape' && mode !== 'idle') {
        e.preventDefault();
        cancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, undo, redo, cancel, canUndo, canRedo]);
}
```

#### Files to Create

| File | Description |
|------|-------------|
| `src/editor/types.ts` | Type definitions for editor state machine |
| `src/editor/EditorStateMachine.ts` | Pure state machine (no React) |
| `src/editor/EditorStateMachine.test.ts` | Unit tests for state machine |
| `src/editor/useEditorContext.ts` | React hook wrapping state machine |
| `src/editor/useEditorKeyboard.ts` | Keyboard shortcut handling |
| `src/contexts/EditorContext.tsx` | React context provider |

#### Files to Modify

| File | Changes |
|------|---------|
| `src/App.tsx` | Wrap with `<EditorProvider>` |
| `src/components/SketchView2D.tsx` | Use `useEditor()` instead of store operations |
| `src/components/Viewport3D.tsx` | Use `useEditor()` for 3D operations |

#### Migration Strategy

1. Build new system alongside existing operation system
2. Create adapter that maps old store operations to new editor context
3. Migrate one tool at a time (start with inset in 2D)
4. Once all tools migrated, remove old operation state from store

#### Verification

1. All existing operation tests still pass
2. New state machine tests pass
3. Inset tool works identically via new context
4. Undo/redo works correctly per mode
5. Escape cancels active mode
6. View switching blocked during view-specific modes

---

### Phase 4: Custom Edge Paths (PARKED - needs revisiting)

**Goal:** Allow users to customize panel edges with custom paths, including feet.

**Status:** Core functionality implemented (steps 1-4). Steps 5-6 deferred.

**TODO when revisiting:**
- Step 5: Feet as edge path preset
- Step 6: Edge path editing tool (drag/add/delete nodes)
- Visual feedback improvements for path preview
- Integration testing with actual panel rendering

#### Implementation Steps

1. **Add data model for custom edge paths** ✅
   - Added `CustomEdgePath` and `EdgePathPoint` types to `src/engine/types.ts`
   - Added `customEdgePaths` to `BasePanelSnapshot.props`
   - Added `_customEdgePaths` Map to `BasePanel` class with get/set/clear accessors
   - Storage in `BaseAssembly._panelCustomEdgePaths` with clone support

2. **Add engine actions for edge paths** ✅
   - `SET_EDGE_PATH` - Set custom path on panel edge
   - `CLEAR_EDGE_PATH` - Remove custom path, revert to default
   - Dispatch handlers in `Engine.ts`
   - Integration with panel generation (applies stored paths to panels)

3. **Implement edge path rendering in panel generation** ✅
   - Added `applyCustomEdgePathToOutline()` method in `BasePanel.ts`
   - Handles mirrored paths (define half, mirror automatically)
   - Converts normalized coordinates (t=0-1 along edge, offset=perpendicular) to panel coordinates
   - Replaces edge segment with custom path points
   - Tests added: `tests/unit/engine/BasePanel.test.ts`

4. **Create edge path drawing tool** ✅ (uses Draft mode from EditorContext)
   - Select panel edge to customize - click near editable edge starts draft
   - Click to add points along edge - accumulated in draft buffer
   - Preview path as it's drawn - SVG overlay with point markers
   - Commit creates engine action - SET_EDGE_PATH dispatched on apply
   - Fixed edge hit distance for reliable detection

5. **Implement feet as custom edge path preset** (DEFERRED)
   - Feet config generates equivalent CustomEdgePath
   - Shorthand for common foot patterns
   - Users can further edit generated path

6. **Create edge path editing tool** (DEFERRED)
   - Select existing custom edge path
   - Drag nodes to move them
   - Add/delete nodes
   - Session undo/redo for edits

---

### Phase 5: Basic Cutouts (IN PROGRESS)

**Goal:** Allow users to add cutout shapes (rectangles, circles) to panels for handles, vents, etc.

#### Implementation Steps

1. **Add cutout data model**
   - Define `Cutout` type with shape variants (rect, circle, path)
   - Add `cutouts` array to panel storage in assembly
   - Engine actions: `ADD_CUTOUT`, `UPDATE_CUTOUT`, `DELETE_CUTOUT`
   - Integrate cutouts into panel outline generation as holes

2. **Implement rectangle cutout tool** (uses Operation mode)
   - Click-drag to define rectangle bounds
   - Preview shows rectangle outline
   - Snap to grid/edges optional
   - Apply adds cutout via engine action

3. **Implement circle cutout tool** (uses Operation mode)
   - Click center, drag for radius
   - Preview shows circle outline
   - Apply adds cutout via engine action

4. **Validate cutouts stay within safe space**
   - Check cutout bounds against safe space region
   - Warn or prevent cutouts that intersect joints/slots
   - Visual feedback when cutout is invalid

5. **Implement cutout editing** (uses Edit Session)
   - Select existing cutout to edit
   - Drag to move, handles to resize
   - Delete key removes cutout
   - Session undo/redo for edits

---

### Phase 6: Advanced Drawing Tools

1. Line tool with snapping (uses Draft mode)
2. Polygon tool (uses Draft mode)
3. Freeform path tool (uses Draft mode)
4. Shape mode toggle (add/subtract)

---

### Phase 7: Import Features

1. Bitmap import as reference layer
2. SVG pattern import
3. Import dialogs

---

### Phase 8: Panel Feature Copying

1. Feature copying between compatible panels
2. Copy/paste UI
3. Edge gender compatibility handling

---

## Files to Create/Modify

### Core Architecture

| File | Action | Description |
|------|--------|-------------|
| `src/editor/EditorStateMachine.ts` | Create | Pure state machine for all editing modes (testable) |
| `src/editor/EditorStateMachine.test.ts` | Create | Unit tests for state machine |
| `src/editor/useEditorContext.ts` | Create | React hook wrapping state machine |
| `src/editor/types.ts` | Create | EditorState, EditorAction, mode types |
| `src/contexts/EditorContext.tsx` | Create | React context provider |

### Engine Extensions

| File | Action | Description |
|------|--------|-------------|
| `src/engine/safeSpace.ts` | Created ✅ | Safe space calculation with slot exclusions |
| `src/engine/PanelGeometry.ts` | Create | Panel-level geometry storage (paths, cutouts) |
| `src/engine/PanelConstraints.ts` | Create | Derived constraints from assembly |
| `src/engine/types.ts` | Modify | Add PanelGeometry, PanelConstraints, CustomEdgePath types |
| `src/engine/panelBridge.ts` | Modify | Include panel geometry in output |
| `src/utils/editableAreas.ts` | Deprecate | Legacy system, replaced by safeSpace.ts |

### 2D Editor Components

| File | Action | Description |
|------|--------|-------------|
| `src/components/SketchView2D.tsx` | Modify | Use EditorContext, show safe space |
| `src/components/tools/LineTool.tsx` | Create | Line drawing (Draft Mode) |
| `src/components/tools/RectangleTool.tsx` | Create | Rectangle tool |
| `src/components/tools/CircleTool.tsx` | Create | Circle tool |
| `src/components/tools/SelectTool.tsx` | Create | Selection and node editing (Edit Session) |
| `src/components/ImportDialog.tsx` | Create | SVG/bitmap import |
| `src/utils/svgImport.ts` | Create | SVG parsing utilities |

---

## Open Questions

1. ~~How does undo/redo interact with 2D editing?~~ → Answered: EditorContext handles mode-specific undo
2. Should custom edge paths support curves (bezier) or only polylines?
3. How to handle cutouts that would make panel structurally unsound?
4. Should there be preset shape libraries (common handle shapes, vent patterns)?
