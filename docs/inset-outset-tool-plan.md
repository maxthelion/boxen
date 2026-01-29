# Inset/Outset Tool Plan

## Overview

Add an inset/outset tool to the 3D viewport toolbar that allows users to extend or retract panel edges. This tool follows the established operation model with floating palettes.

## Requirements Summary

- **Selection Model**: Hover to highlight edges, click to select, shift+click for multi-select
- **Tool Activation**: Manual - user must activate the inset tool, then select edges
- **Valid Selections**: Panel edges that are NOT male (locked) - i.e., female (outward-only) or open (unlocked) edges
- **Tree View**: Collapsible "Edges" node under each panel showing Top, Bottom, Left, Right
- **Single Source of Truth**: Edge editability logic lives in the engine

---

## Phase 1: Engine - Edge Editability as Source of Truth

### 1.1 Move Edge Status Logic to Engine

Currently `EdgeStatusInfo` and related functions live in `src/utils/panelGenerator.ts`. Move this to the engine so it becomes the authoritative source.

**New file: `src/engine/utils/edgeStatus.ts`**

```typescript
export type EdgeStatus = 'locked' | 'outward-only' | 'unlocked';

export interface EdgeStatusInfo {
  position: EdgePosition;
  status: EdgeStatus;
  adjacentFaceId?: FaceId;
}

// Determine edge status based on joint configuration
export function getEdgeStatus(
  panel: PanelSnapshot,
  edge: EdgePosition,
  assembly: AssemblySnapshot
): EdgeStatusInfo;

// Check if an edge can be selected for inset/outset
export function isEdgeSelectable(status: EdgeStatus): boolean {
  return status !== 'locked';
}

// Get all edge statuses for a panel
export function getPanelEdgeStatuses(
  panel: PanelSnapshot,
  assembly: AssemblySnapshot
): EdgeStatusInfo[];
```

### 1.2 Add Edge Status to Panel Snapshot

Extend `PanelSnapshot.derived` to include pre-computed edge statuses:

```typescript
interface BasePanelSnapshot {
  derived: {
    // ... existing fields
    edgeStatuses: EdgeStatusInfo[];
  };
}
```

This allows UI components to access edge editability without recalculating.

### 1.3 Engine Action for Edge Extension

Add/verify engine action exists:

```typescript
{
  type: 'SET_EDGE_EXTENSION',
  targetId: string,  // assembly ID
  payload: {
    panelId: string,
    edge: EdgePosition,
    value: number
  }
}
```

---

## Phase 2: Selection System - Edge Selection

### 2.1 Extend Selection State

Add edge selection to the store:

```typescript
interface BoxState {
  // ... existing
  selectedEdges: Set<string>;  // Format: "panelId:edge" e.g. "face-front:top"
  hoveredEdge: string | null;  // For hover highlight
}
```

### 2.2 Selection Actions

```typescript
selectEdge: (panelId: string, edge: EdgePosition, additive?: boolean) => void;
deselectEdge: (panelId: string, edge: EdgePosition) => void;
clearEdgeSelection: () => void;
setHoveredEdge: (panelId: string | null, edge: EdgePosition | null) => void;
```

### 2.3 Selection Type for Operations

Add 'edge' to the SelectionType union:

```typescript
export type SelectionType = 'panel' | 'void' | 'assembly' | 'corner' | 'edge' | 'none';
```

---

## Phase 3: 3D Visualization - Edge Highlighting

### 3.1 Edge Face Model

An "edge" for selection purposes is the **thickness face** (end cap) of the panel - a rectangular surface perpendicular to the panel's main face. This surface:
- Has dimensions: `thickness × edge_length`
- May have finger joint geometry cut into it (tabs or slots)
- Is the actual geometry users click to select

### 3.2 Edge Highlight Component

Create `src/components/EdgeHighlight.tsx`:

- Renders a colored overlay on the panel's thickness face
- Must follow the actual edge geometry including finger joints
- Color coding:
  - Hovered: semi-transparent orange overlay
  - Selected: solid orange overlay
  - Locked (non-selectable): blue/gray tint (visual only, no interaction)

**Implementation approach:**
- Extract the edge face vertices from the panel's extruded geometry
- Create a mesh that covers the entire thickness face
- The mesh follows finger joint contours (not a simple rectangle)

### 3.3 Edge Hit Detection

Add edge picking to the 3D viewport:

```typescript
// In Box3D.tsx or separate component
const findEdgeAtPoint = (
  raycaster: THREE.Raycaster,
  panels: PanelSnapshot[]
): { panelId: string; edge: EdgePosition } | null;
```

**Hit detection options:**
- **Option A**: Raycast against the actual extruded panel geometry, then determine which face was hit based on normal/position
- **Option B**: Create invisible simplified box geometry for each edge face (ignoring fingers) for faster raycasting

Recommendation: Option A for accuracy - use the existing panel mesh and classify hits by face normal.

### 3.4 Panel Edge Renderer

Modify `PanelPathRenderer` to support edge highlighting:

- Track which edges are hovered/selected via store state
- Render highlight overlays on thickness faces
- Filter out locked edges from click interaction (can still show visual state)

---

## Phase 4: Operation Registration

### 4.1 Register Inset Operation

Add to `src/operations/registry.ts`:

```typescript
'inset-outset': {
  id: 'inset-outset',
  name: 'Inset/Outset',
  type: 'parameter',
  selectionType: 'edge',
  minSelection: 1,
  maxSelection: Infinity,  // Multi-select supported
  availableIn: ['3d'],
  description: 'Extend or retract panel edges',
  shortcut: 'i',
  createPreviewAction: (params) => {
    const { edges, offset } = params as {
      edges?: Array<{ panelId: string; edge: EdgePosition }>;
      offset?: number;
    };

    if (!edges?.length || offset === undefined) return null;

    // Return batch action for all selected edges
    return {
      type: 'SET_EDGE_EXTENSIONS_BATCH',
      targetId: 'main-assembly',
      payload: { edges, offset },
    };
  },
},
```

### 4.2 Add to Types

```typescript
// src/operations/types.ts
export type OperationId =
  // ... existing
  | 'inset-outset';

export interface InsetOutsetParams {
  edges?: Array<{ panelId: string; edge: EdgePosition }>;
  offset?: number;
}
```

---

## Phase 5: Inset Palette Component

### 5.1 Create `InsetPalette.tsx`

```typescript
interface InsetPaletteProps {
  visible: boolean;
  position: { x: number; y: number };
  onPositionChange: (pos: { x: number; y: number }) => void;
  onClose: () => void;
  containerRef?: React.RefObject<HTMLElement>;
}
```

**Palette Contents:**
- Title: "Inset/Outset" or "Extend Edge"
- Selected edges count: "3 edges selected"
- Offset slider: -MT to +50mm (or reasonable max)
- Number input for precise values
- Apply/Cancel buttons

**Behavior:**
- Shows current extension value (average if multi-select with different values)
- Preview updates in real-time as slider moves
- Locked edges shown but disabled in any edge list

### 5.2 Selection Prompt

When inset tool is active but no edges selected:

```
Select edges to extend

[Visual hint showing editable edges highlighted]
```

---

## Phase 6: Toolbar Integration

### 6.1 Add Tool Button

Add 'inset' to EditorTool type and toolbar:

```typescript
export type EditorTool =
  // ... existing
  | 'inset';
```

Toolbar button with icon (↔ or similar) and tooltip "Inset/Outset (I)"

### 6.2 Keyboard Shortcut

- `I` key activates inset tool
- `Escape` deactivates tool and clears edge selection

---

## Phase 7: Tree View - Edges Node

### 7.1 Add Edges to BoxTree

Under each panel node, add a collapsible "Edges" node:

```
├── face-front (Front)
│   └── Edges
│       ├── Top (editable, +5mm)
│       ├── Bottom (editable)
│       ├── Left (locked)
│       └── Right (locked)
```

### 7.2 Edge Node Display

- Show edge name and status icon
- Show extension value if non-zero
- Locked edges shown with lock icon or grayed out
- Clicking an edge node:
  - Selects that edge
  - Activates inset tool if not active

### 7.3 Visual Indicators

- Editable: orange dot or icon
- Locked: blue dot or lock icon
- Modified (has extension): show value like "+5mm" or "-3mm"

---

## Phase 8: Validation Integration

### 8.1 Reuse 2D Editor Validation

The 2D SketchView2D already has edge validation. Refactor to share:

```typescript
// src/engine/utils/edgeValidation.ts

// Clamp extension value based on edge status
export function clampEdgeExtension(
  value: number,
  status: EdgeStatus,
  materialThickness: number
): number {
  if (status === 'locked') return 0;
  if (status === 'outward-only') return Math.max(0, value);
  // 'unlocked' can go negative up to -MT
  return Math.max(-materialThickness, value);
}
```

### 8.2 Operation Validator

Add validator in `src/operations/validators.ts`:

```typescript
'inset-outset': (selection, snapshot) => {
  // Check that all selected edges are not locked
  for (const edgeKey of selection.selectedEdges) {
    const [panelId, edge] = edgeKey.split(':');
    const panel = findPanel(snapshot, panelId);
    const status = panel?.derived.edgeStatuses.find(s => s.position === edge);
    if (status?.status === 'locked') {
      return { valid: false, reason: 'Cannot modify locked edges (male joints)' };
    }
  }
  return { valid: true };
},
```

---

## Phase 9: Integration Tests with Geometry Checker

### 9.1 Add Edge Extension Geometry Checks

Extend `ComprehensiveValidator.ts` to validate edge extensions:

```typescript
// Add to ComprehensiveValidator.ts

// Check that extended edges don't create invalid geometry
private validateEdgeExtensions(assembly: AssemblySnapshot): void {
  for (const panel of assembly.derived.panels) {
    const extensions = panel.props.edgeExtensions;
    const mt = assembly.props.material.thickness;

    // Check inward extensions don't exceed material thickness
    for (const [edge, value] of Object.entries(extensions)) {
      if (value < -mt) {
        this.addError('extensions:over-inset',
          `Panel ${panel.id} edge ${edge} inset ${value} exceeds material thickness ${mt}`);
      }
    }

    // Check locked edges have zero extension
    const edgeStatuses = panel.derived.edgeStatuses;
    for (const status of edgeStatuses) {
      if (status.status === 'locked' && extensions[status.position] !== 0) {
        this.addError('extensions:locked-modified',
          `Panel ${panel.id} has locked edge ${status.position} with non-zero extension`);
      }
    }
  }
}
```

### 9.2 Integration Tests

Add test scenarios to `src/engine/integration/comprehensiveGeometry.test.ts`:

```typescript
// ===========================================================================
// Scenario: Edge Extensions
// ===========================================================================

describe('Scenario: Edge Extensions', () => {
  beforeEach(() => {
    engine.createAssembly(200, 150, 100, {
      thickness: 3,
      fingerWidth: 10,
      fingerGap: 1.5,
    });
  });

  it('allows valid outward extension on female edges', () => {
    engine.dispatch({
      type: 'SET_EDGE_EXTENSION',
      targetId: 'main-assembly',
      payload: { panelId: findFrontPanel(), edge: 'top', value: 5 },
    });

    const result = validateGeometry(engine);
    expect(result.valid).toBe(true);
  });

  it('allows valid inward extension (up to MT) on unlocked edges', () => {
    // Open top face to make top edges unlocked
    engine.dispatch({
      type: 'TOGGLE_FACE',
      targetId: 'main-assembly',
      payload: { faceId: 'top' },
    });

    engine.dispatch({
      type: 'SET_EDGE_EXTENSION',
      targetId: 'main-assembly',
      payload: { panelId: findFrontPanel(), edge: 'top', value: -3 },
    });

    const result = validateGeometry(engine);
    expect(result.valid).toBe(true);
  });

  it('rejects extension on locked (male) edges', () => {
    // Front panel's left/right edges are male joints (locked)
    // Attempting to extend them should fail validation
    engine.dispatch({
      type: 'SET_EDGE_EXTENSION',
      targetId: 'main-assembly',
      payload: { panelId: findFrontPanel(), edge: 'left', value: 5 },
    });

    const result = validateGeometry(engine);
    expect(result.errors.some(e => e.code === 'extensions:locked-modified')).toBe(true);
  });

  it('rejects over-inset on unlocked edges', () => {
    engine.dispatch({
      type: 'TOGGLE_FACE',
      targetId: 'main-assembly',
      payload: { faceId: 'top' },
    });

    // Try to inset more than material thickness
    engine.dispatch({
      type: 'SET_EDGE_EXTENSION',
      targetId: 'main-assembly',
      payload: { panelId: findFrontPanel(), edge: 'top', value: -10 },
    });

    const result = validateGeometry(engine);
    expect(result.errors.some(e => e.code === 'extensions:over-inset')).toBe(true);
  });
});
```

### 9.3 Operation Tests

Add to `src/store/operations.test.ts`:

```typescript
describe('Inset/Outset Operation', () => {
  beforeEach(() => {
    engine.discardPreview();
    useBoxStore.setState({ operationState: INITIAL_OPERATION_STATE });
  });

  it('should cleanup preview on cancel', () => {
    useBoxStore.getState().startOperation('inset-outset');
    useBoxStore.getState().updateOperationParams({
      edges: [{ panelId: 'face-xxx', edge: 'top' }],
      offset: 5
    });
    expect(engine.hasPreview()).toBe(true);

    useBoxStore.getState().cancelOperation();
    expect(engine.hasPreview()).toBe(false);
  });

  it('should persist changes on apply', () => {
    const panelId = findFrontPanel();
    useBoxStore.getState().startOperation('inset-outset');
    useBoxStore.getState().updateOperationParams({
      edges: [{ panelId, edge: 'top' }],
      offset: 5
    });
    useBoxStore.getState().applyOperation();

    const panels = engine.generatePanelsFromNodes().panels;
    const front = panels.find(p => p.id === panelId);
    expect(front?.edgeExtensions.top).toBe(5);
  });

  it('should validate edge selectability', () => {
    // Locked edges should fail validation
    const result = validateInsetOutset({
      edges: [{ panelId: findFrontPanel(), edge: 'left' }],  // Male joint = locked
      offset: 5,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('locked');
  });
});
```

---

## Implementation Order

1. **Phase 1**: Engine edge status (foundation)
2. **Phase 2**: Selection state for edges
3. **Phase 3**: 3D edge visualization (hover/select)
4. **Phase 4**: Operation registration
5. **Phase 5**: Inset palette
6. **Phase 6**: Toolbar integration
7. **Phase 7**: Tree view edges
8. **Phase 8**: Validation cleanup
9. **Phase 9**: Integration tests with geometry checker

---

## Open Questions

1. ~~Should the inset tool work on sub-assembly panels, or main assembly only initially?~~ **RESOLVED: Both** - tool works on main assembly and sub-assembly panels from the start.
2. Should there be visual feedback showing the extension amount on the 3D edge (like a dimension annotation)?
3. Should batch operations apply the same offset to all edges, or allow per-edge values?
4. **Batch action or individual actions?** The plan proposes `SET_EDGE_EXTENSIONS_BATCH` but no batch actions exist yet in the codebase. Options:
   - **Option A**: Use individual `SET_EDGE_EXTENSION` actions in sequence (simpler, works now)
   - **Option B**: Add new `SET_EDGE_EXTENSIONS_BATCH` action (cleaner for multi-select, matches plan)

   Recommendation: Start with Option A for simplicity, refactor to Option B if performance becomes an issue.

---

## Files to Create/Modify

**New Files:**
- `src/engine/utils/edgeStatus.ts` - Edge editability logic
- `src/components/InsetPalette.tsx` - Operation palette
- `src/components/EdgeHighlight.tsx` - 3D edge visualization
- `src/components/EdgeHighlight.test.tsx` - Edge visualization tests

**Modify:**
- `src/engine/nodes/BasePanel.ts` - Add edgeStatuses to derived
- `src/engine/types.ts` - Add EdgeStatusInfo to snapshot types
- `src/operations/registry.ts` - Register inset-outset operation
- `src/operations/types.ts` - Add operation ID and params
- `src/operations/validators.ts` - Add inset-outset validator
- `src/store/useBoxStore.ts` - Add edge selection state
- `src/store/operations.test.ts` - Add inset-outset operation tests
- `src/components/EditorToolbar.tsx` - Add inset tool button
- `src/components/Viewport3D.tsx` - Add InsetPalette, edge interaction
- `src/components/Box3D.tsx` - Add edge highlighting/picking
- `src/components/BoxTree.tsx` - Add Edges collapsible node
- `src/types.ts` - Add 'inset' to EditorTool
- `src/engine/validators/ComprehensiveValidator.ts` - Add edge extension validation rules
- `src/engine/integration/comprehensiveGeometry.test.ts` - Add edge extension test scenarios
