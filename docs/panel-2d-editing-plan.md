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

### Phase 2: Standardized 2D Operation System

**Scope:** This phase implements the **Operations (Discrete)** interaction mode for 2D view. See "Interaction Modes" in Core Concepts for the full model including Draft Mode and Edit Sessions (implemented in later phases).

**Problem:** 2D operations currently bypass the centralized operation system, using local component state instead. This causes:
- No preview phase for 2D operations
- No undo/redo support
- Inconsistent behavior between 2D and 3D views
- Each tool reimplements its own state management

**Goal:** All discrete 2D operations (inset, fillet, add shape) must use the same `startOperation` → `updateOperationParams` → `applyOperation` flow as 3D operations.

#### Current State vs Target State

| Aspect | Current (2D) | Target (2D) |
|--------|--------------|-------------|
| State management | Local (`useState`) | Store (`operationState`) |
| Preview | None/manual | Automatic via engine preview scene |
| Apply/Cancel | Direct mutations | `applyOperation()`/`cancelOperation()` |
| Undo support | None | Via engine dispatch |
| Registry definition | No `createPreviewAction` | Has `createPreviewAction` |

#### Implementation Steps

**1. Add `createPreviewAction` to 2D operations in registry**

Update `src/operations/registry.ts`:

```typescript
'inset-outset': {
  // ... existing config ...
  availableIn: ['2d', '3d'],  // Enable for both views
  createPreviewAction: (params) => {
    const { panelId, edge, offset } = params as InsetParams;
    if (!panelId || !edge || offset === undefined) return null;
    return {
      type: 'SET_EDGE_EXTENSION',
      targetId: 'main-assembly',
      payload: { panelId, edge, extension: offset },
    };
  },
},

'chamfer-fillet': {
  // ... existing config ...
  createPreviewAction: (params) => {
    const { corners, radius, type } = params as ChamferFilletParams;
    if (!corners?.length || radius === undefined) return null;
    return {
      type: 'SET_CORNER_FILLETS_BATCH',
      targetId: 'main-assembly',
      payload: { corners, radius, type },
    };
  },
},
```

**2. Refactor SketchView2D.tsx to use store operations**

Replace local state:
```typescript
// REMOVE these local states:
const [selectedEdges, setSelectedEdges] = useState<Set<EdgePosition>>(new Set());
const [extensionAmount, setExtensionAmount] = useState(0);
const [cornerFinishType, setCornerFinishType] = useState<'chamfer' | 'fillet'>('chamfer');
const [cornerRadius, setCornerRadius] = useState(3);

// USE store operations instead:
const operationState = useBoxStore((state) => state.operationState);
const startOperation = useBoxStore((state) => state.startOperation);
const updateOperationParams = useBoxStore((state) => state.updateOperationParams);
const applyOperation = useBoxStore((state) => state.applyOperation);
const cancelOperation = useBoxStore((state) => state.cancelOperation);
```

**3. Update palette handlers to use operation params**

```typescript
// Inset tool - update params triggers preview
const handleExtensionChange = (value: number) => {
  updateOperationParams({ offset: value });
};

const handleApply = () => {
  applyOperation();
  setActiveTool('select');
};

const handleCancel = () => {
  cancelOperation();
  setActiveTool('select');
};
```

**4. Ensure preview rendering in 2D view**

The 2D view already uses `useEnginePanels()` which returns preview panels when an operation is active. Verify this works correctly for 2D-specific operations.

**5. Add operation param types**

In `src/operations/types.ts`:
```typescript
export interface InsetParams {
  panelId: string;
  edge: EdgePosition;
  offset: number;
}

export interface ChamferFilletParams {
  corners: string[];
  radius: number;
  type: 'chamfer' | 'fillet';
}
```

#### Files to Modify

| File | Changes |
|------|---------|
| `src/operations/registry.ts` | Add `createPreviewAction` to `inset-outset`, `chamfer-fillet` |
| `src/operations/types.ts` | Add param types for 2D operations |
| `src/components/SketchView2D.tsx` | Replace local state with store operations |
| `src/components/InsetPalette2D.tsx` | Create (or refactor from SketchView2D) |
| `src/components/ChamferFilletPalette2D.tsx` | Create (or refactor from SketchView2D) |

#### Verification

1. Activate inset tool in 2D view
2. Select an edge and drag → Preview shows extended edge in real-time
3. Click Apply → Extension committed
4. Click Cancel → Extension reverted to original
5. Same behavior for chamfer/fillet tool

#### Interaction Mode Guidelines

**Use the correct interaction mode for each feature:**

| Feature Type | Interaction Mode | Example |
|--------------|------------------|---------|
| Parameter adjustment | **Operation** | Inset edge, fillet corner |
| Add predefined shape | **Operation** | Add rectangle/circle cutout |
| Draw new geometry | **Draft Mode** | Draw polyline, draw polygon |
| Edit existing geometry | **Edit Session** | Move path nodes, reshape cutout |

**For Operations (this phase):**
1. Define in `src/operations/registry.ts` with `createPreviewAction`
2. Use store's `startOperation`/`updateOperationParams`/`applyOperation` flow
3. NOT use local component state for operation parameters
4. Preview via engine preview scene

**For Draft Mode (Phase 5):**
1. Temporary buffer, geometry not in model until finish
2. `Cmd+Z` pops from buffer, `Esc` discards buffer
3. Finish creates single operation

**For Edit Sessions (Phase 5):**
1. Capture initial state on session start
2. Session-scoped undo stack for micro-edits
3. `Cmd+Z` undoes within session, `Esc` restores initial state
4. Done commits as single operation

### Phase 3: Custom Edge Paths
**Interaction Mode:** Draft Mode (drawing new path), Edit Session (modifying existing)

1. Add data model for custom edge paths
2. Implement edge path rendering in panel generation
3. Create edge path editor UI
4. Implement feet as custom edge path preset
5. Implement Draft Mode for drawing new paths
6. Implement Edit Session for modifying existing paths

### Phase 4: Basic Cutouts
**Interaction Mode:** Operation (add predefined shape), Edit Session (modify)

1. Add cutout data model
2. Implement rectangle and circle cutouts (Operation mode)
3. Create cutout tools in 2D view
4. Validate cutouts stay within safe space
5. Implement Edit Session for reshaping/repositioning cutouts

### Phase 5: 2D Drawing Tools & Session Infrastructure
**Interaction Mode:** Draft Mode (line/shape tools), Edit Session (select tool)

1. Implement Draft Mode infrastructure (`DraftState`, undo buffer)
2. Implement Edit Session infrastructure (`EditSession`, session undo stack)
3. Implement line tool with snapping (Draft Mode)
4. Implement select tool with node editing (Edit Session)
5. Add shape mode toggle (add/subtract)
6. Implement fillet tool for custom path vertices

### Phase 6: Import Features
1. Implement bitmap import as reference layer
2. Implement SVG pattern import
3. Create import dialogs

### Phase 7: Panel Feature Copying
1. Implement feature copying between compatible panels
2. Add copy/paste UI
3. Handle edge gender compatibility

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
