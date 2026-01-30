# Inset/Outset Tool UX Improvements

## Requirements (from docs/IMG_8223.jpeg)

1. **Move tool integration**: Move tool should work on eligible panel edges (effectively like edge extension)

2. **Inset/outset tool changes**:
   - If a panel is selected, it should be added as a visual highlight in 3D view
   - All the panel's eligible children (edges) should be selected for the operation
   - The palette should list all parent panels of selected edges with their children edges as a row of toggle buttons that add/remove from selection

3. **Edge selection enhancement**: If an edge is selected with inset tool active, its parent panel should be visually highlighted in 3D view and added to palette

---

## Current State Analysis

### Edge Selection System (`useBoxStore.ts`)
- `selectedEdges: Set<string>` - Format: `"panelId:edge"` (e.g., `"uuid123:top"`)
- `selectEdge(panelId, edge, additive?)` - Toggle selection
- Edge selection is independent from panel selection

### InsetPalette (`src/components/InsetPalette.tsx`)
- Currently shows: selected edge count, extension slider, apply/cancel
- Does NOT show: parent panels, individual edge toggles

### PanelEdgeRenderer (`src/components/PanelEdgeRenderer.tsx`)
- Renders edge indicators when inset tool is active
- Handles edge hover/click selection
- Does NOT highlight parent panels

### Visual Highlighting (`PanelPathRenderer.tsx`)
- Panels highlighted via `isPanelSelectedIn3DView()` which checks `selectedPanelIds`
- Selection cascade: selecting assembly highlights all children

---

## Implementation Plan

### Part 1: Parent Panel Highlighting When Edges Selected

**Goal**: When edges are selected with inset tool active, highlight their parent panels.

**File: `src/components/PanelPathRenderer.tsx`**

Add logic to highlight panels that have selected edges:

```typescript
// In the component, check if panel has any selected edges
const hasSelectedEdge = useMemo(() => {
  if (activeTool !== 'inset') return false;
  const edges: EdgePosition[] = ['top', 'bottom', 'left', 'right'];
  return edges.some(edge => selectedEdges.has(`${panel.id}:${edge}`));
}, [panel.id, selectedEdges, activeTool]);

// Use this in the display color/opacity logic
const displayColor = isSelected || hasSelectedEdge ? selectedColor : ...;
```

### Part 2: Panel Selection Auto-Selects Eligible Edges

**Goal**: When a panel is selected with inset tool active, auto-select all its eligible (non-locked) edges.

**File: `src/store/useBoxStore.ts`**

Add action to select all eligible edges of a panel:

```typescript
selectPanelEdges: (panelId: string, edgeStatuses: EdgeStatusInfo[]) => {
  const eligibleEdges = edgeStatuses
    .filter(s => s.status !== 'locked')
    .map(s => `${panelId}:${s.position}`);

  set(state => ({
    selectedEdges: new Set([...state.selectedEdges, ...eligibleEdges])
  }));
}
```

**File: `src/components/Viewport3D.tsx`**

When inset tool is active and panel is clicked:
- Get the panel's edge statuses
- Call `selectPanelEdges()` to add all eligible edges

### Part 3: Enhanced Palette with Panel Groups

**Goal**: Palette shows parent panels with their edges as toggle buttons.

**File: `src/components/InsetPalette.tsx`**

Restructure to show:
1. List of unique parent panels (derived from selectedEdges)
2. Each panel shows its 4 edges as toggle buttons (top, bottom, left, right)
3. Toggle buttons show edge status color (green/orange/gray)
4. Clicking toggle adds/removes that edge from selection

**New palette structure:**
```
┌─────────────────────────────────────┐
│ Inset/Outset                    [X] │
├─────────────────────────────────────┤
│ Front Panel                         │
│ [top] [bottom] [left] [right]       │
│                                     │
│ Back Panel                          │
│ [top] [bottom] [left] [right]       │
├─────────────────────────────────────┤
│ Extension: [____] mm                │
│ [Apply]                             │
└─────────────────────────────────────┘
```

**Props changes:**
```typescript
interface InsetPaletteProps {
  visible: boolean;
  position: { x: number; y: number };
  // NEW: Pass full panel info instead of just count
  panelEdgeGroups: Array<{
    panelId: string;
    panelName: string;  // e.g., "Front", "Back", "Divider-1"
    edges: Array<{
      position: EdgePosition;
      status: EdgeStatus;
      isSelected: boolean;
    }>;
  }>;
  offset: number;
  materialThickness: number;
  onEdgeToggle: (panelId: string, edge: EdgePosition) => void;
  onOffsetChange: (offset: number) => void;
  onApply: () => void;
  onClose: () => void;
  onPositionChange: (pos: { x: number; y: number }) => void;
  containerRef: React.RefObject<HTMLDivElement>;
}
```

### Part 4: Move Tool Edge Support (Future)

**Goal**: Move tool can drag eligible edges like edge extensions.

This is a larger change that builds on the inset tool. Implementation approach:
1. When move tool is active and edge is hovered, show drag handle
2. Dragging edge perpendicular to its direction adjusts extension
3. Uses same `SET_EDGE_EXTENSION` engine action

**Scope**: Mark as future work, not in initial implementation.

---

### Part 5: Remove Edges from Object Tree

**Goal**: Edges should no longer appear in the BoxTree (object tree) component.

**Rationale**: With the new palette showing edge toggles grouped by panel, the object tree becomes redundant for edge management and adds clutter.

**File: `src/components/BoxTree.tsx`**

Remove edge rendering from the tree:
- Remove edge entries under panels
- Panels should remain selectable but not show child edges

---

## Files to Modify

1. **`src/components/InsetPalette.tsx`**
   - Restructure to show panel groups with edge toggles
   - Add edge toggle click handlers

2. **`src/components/PanelPathRenderer.tsx`**
   - Add parent panel highlighting when edges selected

3. **`src/store/useBoxStore.ts`**
   - Add `selectPanelEdges()` action
   - Add helper to get unique parent panels from selected edges

4. **`src/components/Viewport3D.tsx`**
   - Compute `panelEdgeGroups` from selected edges and panels
   - Pass to InsetPalette
   - Handle panel click → select all eligible edges

5. **`src/components/BoxTree.tsx`**
   - Remove edge entries from the tree structure
   - Keep panels but without edge children

6. **`src/components/FloatingPalette.tsx`** (optional)
   - May need new subcomponents for edge toggle buttons

---

## Verification

1. **Manual testing:**
   - Activate inset tool
   - Click an edge → parent panel highlights
   - Click a panel → all eligible edges auto-select
   - Palette shows panel groups with edge toggles
   - Toggle edges on/off via palette buttons
   - Adjust extension value → preview updates
   - Apply → changes committed

2. **Edge cases:**
   - Multiple panels selected → shows all in palette
   - Mix of locked/unlocked edges → locked edges grayed out
   - Empty selection → palette shows empty state

---

## Implementation Order

1. Part 5: Remove edges from object tree (cleanup, simplifies UI)
2. Part 1: Parent panel highlighting (quick win, minimal changes)
3. Part 3: Enhanced palette with panel groups (main UX improvement)
4. Part 2: Panel click auto-selects edges (polish)
5. Part 4: Move tool integration (future scope)
