# Modification Pattern Plan

## Overview

Establish a consistent pattern for how UI operations modify the box model. All operations should follow the same state machine, regardless of whether they need a floating palette or are simple toggles.

---

## Current State

The codebase has several operations with inconsistent patterns:
- **Push/Pull**: Uses preview system + floating palette
- **Subdivision**: Uses preview system + floating palette
- **Toggle Face**: Immediate action, no preview
- **Sub-Assembly Creation**: Uses preview + form
- **Chamfer/Fillet**: Uses selection + floating palette, no formal preview

---

## Design Principles (from notes)

1. **Apply commits, Cancel reverts**: All operations use preview → apply/cancel pattern
2. **Floating palettes are optional**: Some operations need parameter UI, others are simple toggles
3. **Canonical operation list**: Define all operations with their selection requirements
4. **Context-aware toolbar**: Buttons enable/disable based on current selection
5. **Operation prompts for selection**: If nothing selected, entering an operation mode prompts for appropriate target selection
6. **Selection refinement**: While in operation mode, user can adjust what the operation applies to
7. **Preview rendering**: All changes show preview before commit

---

## Canonical Operations Table

### 3D Operations

| Operation | Selection Type | Min | Max | Filter | Palette | Type |
|-----------|---------------|-----|-----|--------|---------|------|
| **Push/Pull** | panel | 1 | 1 | Face panels only | Yes (offset, mode) | parameter |
| **Subdivide (void)** | void | 1 | 1 | Leaf voids only (no children, no sub-asm) | Yes (axis, count) | parameter |
| **Subdivide (two-panel)** | panel | 2 | 2 | Parallel face/divider panels | Yes (axis, count) | parameter |
| **Inset Face** | panel | 1 | 1 | Face panels only, requires negative offset | No (via Push/Pull) | parameter |
| **Create Sub-Assembly** | void | 1 | 1 | Leaf voids only | Yes (clearance, axis, offsets) | parameter |
| **Toggle Face Solid** | panel | 1 | 1 | Face panels only | No | immediate |
| **Remove Subdivision** | void | 1 | 1 | Non-root voids with splitAxis | No | immediate |
| **Remove Sub-Assembly** | void | 1 | 1 | Voids containing sub-assembly | No | immediate |
| **Purge Void** | void | 1 | 1 | Voids with children or sub-asm | No | immediate |
| **Edit in 2D** | panel | 1 | 1 | Any panel | No | view |
| **Select Assembly** | assembly | 1 | 1 | Main or sub-assembly | No | view |

### 2D Operations (Sketch View)

| Operation | Selection Type | Min | Max | Filter | Palette | Type |
|-----------|---------------|-----|-----|--------|---------|------|
| **Chamfer/Fillet** | corner | 1 | ∞ | Panel outline corners | Yes (radius, type) | parameter |
| **Inset Edge** | edge | 1 | 1 | Unlocked edges (no finger joints) | No (drag) | parameter |
| **Draw Rectangle** | none | 0 | 0 | — | No | immediate |
| **Draw Circle** | none | 0 | 0 | — | No | immediate |
| **Draw Path** | none | 0 | 0 | — | No | immediate |

### Property Panel Operations (always available when selection matches)

| Operation | Selection Type | Min | Max | Filter | Palette | Type |
|-----------|---------------|-----|-----|--------|---------|------|
| **Set Dimensions** | assembly | 1 | 1 | Main assembly | No (inline) | immediate |
| **Set Material** | assembly | 1 | 1 | Main assembly | No (inline) | immediate |
| **Set Assembly Axis** | assembly | 1 | 1 | Any assembly | No (inline) | immediate |
| **Set Lid Config** | assembly | 1 | 1 | Any assembly | No (inline) | immediate |
| **Set Feet Config** | assembly | 1 | 1 | Main assembly | No (inline) | immediate |
| **Set Divider Position** | panel | 1 | 1 | Divider panels only | No (inline) | immediate |
| **Set Position Mode** | panel | 1 | 1 | Divider panels (main box only) | No (inline) | immediate |
| **Set Edge Extension** | panel + edge | 1 | 1 | Unlocked edges only | No (inline) | immediate |
| **Set Sub-Asm Clearance** | sub-assembly | 1 | 1 | Sub-assemblies only | No (inline) | immediate |

### Selection Filters Summary

| Filter | Description |
|--------|-------------|
| Face panels only | `panel.source.type === 'face'` |
| Divider panels only | `panel.source.type === 'divider'` |
| Leaf voids only | `void.children.length === 0 && !void.subAssembly` |
| Non-root voids | `void.id !== 'root'` |
| Parallel panels | Two panels on same axis (front/back, left/right, top/bottom) |
| Unlocked edges | Edges without finger joints (typically open faces) |
| Voids with sub-asm | `void.subAssembly !== undefined` |

### Disabled Conditions

| Operation | Disabled When |
|-----------|---------------|
| Subdivide axis X | Left or right face is open |
| Subdivide axis Y | Top or bottom face is open |
| Subdivide axis Z | Front or back face is open |
| Set Lid Tab Direction | Lid inset > 0 |
| Set Divider Position Mode | Panel is in sub-assembly |
| Push/Pull Apply | Offset = 0 |
| Inset Face button | Offset >= 0 |

---

## Operation Type Classification

### Type A: Parameter Operations (need floating palette)
Operations requiring user input beyond target selection. Use preview system.

- Push/Pull
- Subdivide (void or two-panel)
- Create Sub-Assembly
- Chamfer/Fillet

### Type B: Immediate Operations (no palette)
Execute instantly on click. No preview needed.

- Toggle Face Solid
- Remove Subdivision
- Remove Sub-Assembly
- Purge Void
- All property panel operations

### Type C: View/Mode Operations
Change editing context without modifying model.

- Edit in 2D
- Select Assembly

---

## State Machine

```
┌──────────────────────────────────────────────────────────────────┐
│                        IDLE STATE                                 │
│  - No active operation                                           │
│  - Selection allowed (void, panel, corner, assembly)             │
│  - Toolbar shows available operations based on selection         │
└───────────────────────────┬──────────────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            │                               │
            ▼                               ▼
┌───────────────────────┐     ┌───────────────────────────────────┐
│  AWAITING SELECTION   │     │       OPERATION ACTIVE            │
│  (if no valid target) │     │  - Preview state created          │
│                       │     │  - Selection refinement allowed   │
│  - Tool active        │     │  - Parameter palette shown (if    │
│  - Prompt for target  │     │    Type A operation)              │
│  - Highlight valid    │     │  - Preview renders in viewport    │
│    targets            │     │                                   │
└───────────┬───────────┘     └───────────────┬───────────────────┘
            │                                 │
            │ select valid target             │
            └────────────────┬────────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
         ┌────────┐    ┌─────────┐    ┌──────────┐
         │ APPLY  │    │ CANCEL  │    │ SWITCH   │
         │        │    │         │    │ TOOL     │
         └────┬───┘    └────┬────┘    └────┬─────┘
              │             │              │
              ▼             ▼              ▼
         Commit to      Discard        Cancel
         engine         preview        preview
              │             │              │
              └─────────────┴──────────────┘
                            │
                            ▼
                     Return to IDLE
```

---

## Unified Operation Interface

```typescript
interface OperationDefinition {
  id: OperationId;
  name: string;
  type: 'parameter' | 'immediate' | 'view';

  // Selection requirements
  selectionType: 'void' | 'panel' | 'corner' | 'assembly' | 'none';
  minSelection: number;
  maxSelection: number;
  selectionFilter?: (item: SelectableItem) => boolean;

  // For parameter operations
  palette?: React.ComponentType<PaletteProps>;

  // Availability
  availableIn: ('2d' | '3d')[];

  // Validation
  canApply: (state: BoxState) => { valid: boolean; reason?: string };
}

// Examples:
const OPERATIONS: Record<OperationId, OperationDefinition> = {
  'push-pull': {
    id: 'push-pull',
    name: 'Push/Pull',
    type: 'parameter',
    selectionType: 'panel',
    minSelection: 1,
    maxSelection: 1,
    selectionFilter: (panel) => panel.source.type === 'face',
    palette: PushPullPalette,
    availableIn: ['3d'],
    canApply: (state) => {
      const panel = getSelectedPanel(state);
      return { valid: panel?.source.type === 'face' };
    },
  },

  'subdivide': {
    id: 'subdivide',
    name: 'Subdivide',
    type: 'parameter',
    selectionType: 'void',  // or 'panel' with filter
    minSelection: 1,
    maxSelection: 2,        // 1 void OR 2 parallel panels
    selectionFilter: (item) => {
      if (isVoid(item)) return true;
      if (isPanel(item)) return item.source.type === 'face';
      return false;
    },
    palette: SubdividePalette,
    availableIn: ['3d'],
    canApply: (state) => {
      // Complex validation for void vs two-panel mode
    },
  },

  'toggle-face': {
    id: 'toggle-face',
    name: 'Toggle Solid',
    type: 'immediate',
    selectionType: 'panel',
    minSelection: 1,
    maxSelection: 1,
    selectionFilter: (panel) => panel.source.type === 'face',
    availableIn: ['3d'],
    canApply: () => ({ valid: true }),
  },
};
```

---

## Store Changes

### New State Fields

```typescript
interface OperationState {
  activeOperation: OperationId | null;
  operationPhase: 'idle' | 'awaiting-selection' | 'active';
  previewState: PreviewState | null;
  operationMetadata: Record<string, unknown>;
}
```

### New Actions

```typescript
interface OperationActions {
  // Start an operation (may enter awaiting-selection if no valid target)
  startOperation: (operationId: OperationId) => void;

  // Update operation parameters (for Type A operations)
  updateOperationParams: (params: Record<string, unknown>) => void;

  // Refine selection while operation is active
  refineSelection: (targetId: string, additive?: boolean) => void;

  // Complete the operation
  applyOperation: () => void;
  cancelOperation: () => void;
}
```

---

## Toolbar Integration

```typescript
// EditorToolbar.tsx
const EditorToolbar: React.FC = () => {
  const selection = useBoxStore((s) => ({
    panels: s.selectedPanelIds,
    voids: s.selectedVoidIds,
    corners: s.selectedCornerIds,
  }));
  const activeOperation = useBoxStore((s) => s.activeOperation);

  // Compute which operations are available
  const availableOperations = useMemo(() => {
    return Object.values(OPERATIONS).filter((op) => {
      // Check view compatibility
      if (!op.availableIn.includes(currentView)) return false;

      // Check selection requirements
      const selectionCount = getSelectionCount(selection, op.selectionType);

      // If nothing selected, operation is available but will prompt
      if (selectionCount === 0) return true;

      // Check selection filter
      return meetsSelectionRequirements(selection, op);
    });
  }, [selection, currentView]);

  return (
    <div className="toolbar">
      {availableOperations.map((op) => (
        <ToolButton
          key={op.id}
          operation={op}
          active={activeOperation === op.id}
          enabled={canStartOperation(op, selection)}
          onClick={() => startOperation(op.id)}
        />
      ))}
    </div>
  );
};
```

---

## Implementation Phases

### Phase 1: Define Operation Registry
1. Create `src/operations/types.ts` with operation interface
2. Create `src/operations/registry.ts` with all operation definitions
3. Add validation helpers (`canApply`, `meetsSelectionRequirements`)

### Phase 2: Unify State Machine
1. Add `OperationState` to store
2. Implement `startOperation`, `applyOperation`, `cancelOperation`
3. Migrate existing operations to use new state machine

### Phase 3: Toolbar Availability
1. Update EditorToolbar to use operation registry
2. Implement dynamic enable/disable based on selection
3. Add visual feedback for "awaiting selection" state

### Phase 4: Selection Prompting
1. Implement "awaiting-selection" phase
2. Add visual highlighting of valid targets
3. Allow selection refinement during active operation

### Phase 5: Migrate Existing Operations
1. Push/Pull → uses unified pattern
2. Subdivide → uses unified pattern
3. Chamfer → uses unified pattern
4. Toggle Face → immediate operation pattern

---

## UI Patterns

### Awaiting Selection State
When an operation is activated without valid selection:
- Toolbar button shows "active" state
- Status bar shows: "Select a [target type] to [operation name]"
- Valid targets highlight on hover
- Clicking valid target enters "active" phase

### Active Operation State
- Floating palette appears (for Type A operations)
- Preview renders in viewport
- Selection can still be refined (shift-click to add/remove)
- ESC or click outside cancels
- Apply button commits

### Immediate Operations
- Execute instantly on click
- No preview phase needed
- Can support undo via command pattern

---

## Example: Push/Pull Flow

1. **User clicks Push/Pull button** (nothing selected)
   - Operation: `push-pull`
   - Phase: `awaiting-selection`
   - UI: "Select a face to push/pull"

2. **User clicks front face**
   - Phase: `active`
   - Preview created with front face metadata
   - PushPullPalette appears

3. **User drags slider to 10mm**
   - `updateOperationParams({ offset: 10 })`
   - Preview updates, 3D view shows preview

4. **User clicks Apply**
   - `applyOperation()` → commits preview to engine
   - Phase: `idle`
   - Palette closes

---

## Example: Toggle Face Flow

1. **User selects front face** (idle state)
   - Selection: `{ panels: ['face-front'] }`

2. **User clicks Toggle Solid button**
   - Operation: `toggle-face` (immediate type)
   - No preview phase
   - Directly dispatches `TOGGLE_FACE` to engine
   - Remains in idle state

---

## Files to Create/Modify

### New Files
- `src/operations/types.ts` - Operation interfaces
- `src/operations/registry.ts` - Operation definitions
- `src/operations/validation.ts` - Selection validation helpers
- `src/operations/index.ts` - Public exports

### Modified Files
- `src/store/useBoxStore.ts` - Add OperationState, actions
- `src/components/EditorToolbar.tsx` - Use operation registry
- `src/components/SubdivisionControls.tsx` - Migrate to unified pattern
- `src/components/PushPullPalette.tsx` - Migrate to unified pattern
- `src/components/Viewport3D.tsx` - Handle awaiting-selection phase

---

## Open Questions

1. **Should immediate operations support undo?**
   - Currently no undo system exists
   - Could implement command pattern alongside this work

2. **How to handle operation conflicts?**
   - E.g., user tries to subdivide while push/pull active
   - Proposal: Cancel current operation, start new one

3. **Should 2D view operations share the same registry?**
   - Some operations (rectangle, circle, path) are 2D-only
   - Could have separate registries or unified with `availableIn` filter

4. **Multi-select operations**
   - E.g., select 5 corners, apply chamfer to all
   - Current design supports this via `maxSelection`

---

## Success Criteria

- [ ] All operations follow the same state machine
- [ ] Toolbar buttons enable/disable based on selection
- [ ] "Awaiting selection" phase works for all Type A operations
- [ ] Preview renders for all parameter operations
- [ ] Apply commits to engine, Cancel discards preview
- [ ] Operations can be added by defining in registry
