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

### 3.1 Edge Highlight Component

Create `src/components/EdgeHighlight.tsx`:

- Renders a highlighted line/tube along an edge
- Shows on hover (subtle) and selection (prominent)
- Color coding:
  - Hovered: light orange outline
  - Selected: bright orange fill
  - Locked (non-selectable): blue/gray (no interaction)

### 3.2 Edge Hit Detection

Add edge picking to the 3D viewport:

```typescript
// In Box3D.tsx or separate component
const findEdgeAtPoint = (
  raycaster: THREE.Raycaster,
  panels: PanelSnapshot[]
): { panelId: string; edge: EdgePosition } | null;
```

Use invisible edge geometry (thick lines or thin boxes) for raycasting.

### 3.3 Panel Edge Renderer

Modify `PanelCollectionRenderer` or create `PanelEdgeRenderer`:

- Render edge geometries for each panel
- Handle hover/selection state
- Filter out locked edges from interaction (visual indication only)

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

## Implementation Order

1. **Phase 1**: Engine edge status (foundation)
2. **Phase 2**: Selection state for edges
3. **Phase 3**: 3D edge visualization (hover/select)
4. **Phase 4**: Operation registration
5. **Phase 5**: Inset palette
6. **Phase 6**: Toolbar integration
7. **Phase 7**: Tree view edges
8. **Phase 8**: Validation cleanup

---

## Open Questions

1. Should the inset tool work on sub-assembly panels, or main assembly only initially?
2. Should there be visual feedback showing the extension amount on the 3D edge (like a dimension annotation)?
3. Should batch operations apply the same offset to all edges, or allow per-edge values?

---

## Files to Create/Modify

**New Files:**
- `src/engine/utils/edgeStatus.ts` - Edge editability logic
- `src/components/InsetPalette.tsx` - Operation palette
- `src/components/EdgeHighlight.tsx` - 3D edge visualization

**Modify:**
- `src/engine/nodes/BasePanel.ts` - Add edgeStatuses to derived
- `src/engine/types.ts` - Add EdgeStatusInfo to snapshot types
- `src/operations/registry.ts` - Register inset-outset operation
- `src/operations/types.ts` - Add operation ID and params
- `src/store/useBoxStore.ts` - Add edge selection state
- `src/components/EditorToolbar.tsx` - Add inset tool button
- `src/components/Viewport3D.tsx` - Add InsetPalette, edge interaction
- `src/components/Box3D.tsx` - Add edge highlighting/picking
- `src/components/BoxTree.tsx` - Add Edges collapsible node
- `src/types.ts` - Add 'inset' to EditorTool
