# Modification Pattern Plan

## Overview

Establish a consistent pattern for how UI operations modify the box model. All operations follow the same state machine, regardless of whether they need a floating palette or are simple toggles.

---

## Implementation Status

✅ **Implemented:**
- Operation registry with type definitions
- State machine (idle → awaiting-selection → active)
- Preview system integration
- Declarative validation system
- Tests for preview cleanup

⚠️ **Partially Implemented:**
- Toolbar availability (basic enable/disable)

❌ **Not Yet Implemented:**
- Selection refinement during active operation
- Visual highlighting of valid targets in awaiting-selection phase
- Property panel operations in registry

---

## Operation Types

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

### Type C: View/Mode Operations
Change editing context without modifying model.

- Edit in 2D

---

## Canonical Operations Table

### 3D Operations

| Operation | Selection Type | Min | Max | Filter | Palette | Type |
|-----------|---------------|-----|-----|--------|---------|------|
| **Push/Pull** | panel | 1 | 1 | Face panels only, main assembly | Yes | parameter |
| **Subdivide (void)** | void | 1 | 1 | Leaf voids only | Yes | parameter |
| **Subdivide (two-panel)** | panel | 2 | 2 | Parallel panels with void between | Yes | parameter |
| **Create Sub-Assembly** | void | 1 | 1 | Leaf voids only | Yes | parameter |
| **Toggle Face Solid** | panel | 1 | 1 | Face panels only | No | immediate |
| **Remove Subdivision** | void | 1 | 1 | Non-root voids | No | immediate |
| **Remove Sub-Assembly** | void | 1 | 1 | Voids with sub-assembly | No | immediate |
| **Edit in 2D** | panel | 1 | 1 | Any panel | No | view |

### 2D Operations (Sketch View)

| Operation | Selection Type | Min | Max | Filter | Palette | Type |
|-----------|---------------|-----|-----|--------|---------|------|
| **Chamfer/Fillet** | corner | 1 | ∞ | Panel outline corners | Yes | parameter |

### Selection Filters

| Filter | Implementation |
|--------|----------------|
| Face panels only | `panel.source.type === 'face'` |
| Leaf voids only | `void.children.length === 0 && !void.subAssembly` |
| Parallel panels | Two panels with same normal axis |
| Void between panels | `findVoidBetweenPanels()` returns non-null |
| Main assembly only | `!panel.source.subAssemblyId` |

### Subdivision Axis Rules

| Axis | Disabled When |
|------|---------------|
| X | Left or right face is open |
| Y | Top or bottom face is open |
| Z | Front or back face is open |

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
│                       │     │  - Parameter palette shown (if    │
│  - Tool active        │     │    Type A operation)              │
│  - Prompt for target  │     │  - Preview renders in viewport    │
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

## File Structure

```
src/operations/
├── index.ts          # Public exports
├── types.ts          # OperationId, OperationType, OperationState, param interfaces
├── registry.ts       # OPERATION_DEFINITIONS, helper functions
├── validators.ts     # Declarative validation system
└── validators.test.ts # Tests for validators

src/store/
├── useBoxStore.ts    # OperationState, startOperation, applyOperation, cancelOperation
└── operations.test.ts # Tests for operation lifecycle and preview cleanup
```

---

## Type Definitions

### Operation Definition (registry.ts)

```typescript
interface OperationDefinition {
  id: OperationId;
  name: string;
  type: 'parameter' | 'immediate' | 'view';
  selectionType: 'void' | 'panel' | 'corner' | 'assembly' | 'none';
  minSelection: number;
  maxSelection: number;
  availableIn: ('2d' | '3d')[];
  description?: string;
  shortcut?: string;
}
```

### Operation State (types.ts)

```typescript
interface OperationState {
  activeOperation: OperationId | null;
  phase: 'idle' | 'awaiting-selection' | 'active';
  params: Record<string, unknown>;
}
```

### Selection Requirement (validators.ts)

```typescript
interface SelectionRequirement {
  targetType: SelectionTargetType;
  minCount: number;
  maxCount: number;
  description: string;
  constraints?: SelectionConstraint[];
}

type SelectionTargetType =
  | 'void'
  | 'leaf-void'
  | 'panel'
  | 'face-panel'
  | 'parallel-panels'
  | 'opposing-panels'
  | 'corner'
  | 'assembly'
  | 'none';

type SelectionConstraint =
  | { type: 'must-be-leaf-void' }
  | { type: 'must-be-parallel-panels' }
  | { type: 'must-have-void-between'; description: string }
  | { type: 'must-be-main-assembly-panels' }
  | { type: 'panels-must-be-opposing' }
  | { type: 'panels-same-axis' };
```

### Validation Result (validators.ts)

```typescript
interface SelectionValidationResult {
  valid: boolean;
  reason?: string;
  derived?: {
    targetVoid?: Void;
    targetVoidId?: string;
    validAxes?: Axis[];
    normalAxis?: Axis;
    panels?: PanelPath[];
    panelDescriptions?: string[];
  };
}
```

---

## Store Actions

```typescript
interface OperationActions {
  // Start an operation (may enter awaiting-selection if no valid target)
  startOperation: (operationId: OperationId) => void;

  // Update operation parameters (triggers preview update)
  updateOperationParams: (params: Record<string, unknown>) => void;

  // Complete the operation
  applyOperation: () => void;   // Commits preview to engine
  cancelOperation: () => void;  // Discards preview, resets state
}
```

---

## Preview System Integration

Parameter operations use the Engine's preview system:

```typescript
// Starting a preview
engine.startPreview();  // Clones _scene to _previewScene

// Applying changes to preview
engine.dispatch(action, { preview: true });  // Targets _previewScene

// Committing
engine.commitPreview();  // Copies _previewScene to _scene

// Cancelling
engine.discardPreview();  // Deletes _previewScene
notifyEngineStateChanged();  // IMPORTANT: Notify React to re-render
```

React components automatically render preview state via `useEnginePanels()`.

---

## Testing Requirements

Every parameter operation MUST have tests that verify:

1. **Preview Creation**: Preview exists after operation starts with valid target
2. **Preview Cleanup on Cancel**: `cancelOperation()` discards preview
3. **State Reset on Cancel**: Operation state returns to idle
4. **Apply Commits Preview**: `applyOperation()` commits changes to main scene

Example test structure (from `src/store/operations.test.ts`):

```typescript
describe('Subdivide Operation', () => {
  it('should cleanup preview on cancel', () => {
    // Setup: start operation with preview
    startOperation('subdivide');
    updateOperationParams({ voidId: 'root', axis: 'x', count: 1, positions: [50] });
    expect(engine.hasPreview()).toBe(true);

    // Cancel should discard preview
    cancelOperation();
    expect(engine.hasPreview()).toBe(false);
  });

  it('should reset operation state on cancel', () => {
    startOperation('subdivide');
    cancelOperation();

    const state = useBoxStore.getState();
    expect(state.operationState.activeOperation).toBeNull();
    expect(state.operationState.phase).toBe('idle');
  });
});
```

---

## Adding a New Operation

1. **Add Operation ID** (`src/operations/types.ts`)
   ```typescript
   export type OperationId = ... | 'my-new-operation';
   ```

2. **Add Definition** (`src/operations/registry.ts`)
   ```typescript
   'my-new-operation': {
     id: 'my-new-operation',
     name: 'My New Operation',
     type: 'parameter',
     selectionType: 'void',
     minSelection: 1,
     maxSelection: 1,
     availableIn: ['3d'],
     description: 'Does something useful',
   },
   ```

3. **Add Validator** (`src/operations/validators.ts`)
   ```typescript
   export const validateMyNewOperationSelection = (...): SelectionValidationResult => {
     // Validation logic
   };

   // Add to getSelectionRequirements()
   case 'my-new-operation':
     return {
       targetType: 'leaf-void',
       minCount: 1,
       maxCount: 1,
       description: 'Select a void',
       constraints: [{ type: 'must-be-leaf-void' }],
     };

   // Add to validateSelection()
   case 'my-new-operation':
     return validateMyNewOperationSelection(...);
   ```

4. **Add Tests** (`src/store/operations.test.ts`)
   - Test preview cleanup on cancel
   - Test state reset on cancel
   - Test apply commits changes

5. **Create Palette** (if parameter operation)
   - Create component in `src/components/`
   - Render in `Viewport3D.tsx` when tool is active
   - Only mount when `activeTool === 'my-new-operation'`

---

## Example Flows

### Push/Pull Flow

1. **User clicks Push/Pull button** (nothing selected)
   - Phase: `awaiting-selection`
   - UI: "Select a face to push/pull"

2. **User clicks front face**
   - Phase: `active`
   - Preview created
   - PushPullPalette appears

3. **User drags slider to 10mm**
   - `updateOperationParams({ offset: 10 })`
   - Preview updates in 3D view

4. **User clicks Apply**
   - `applyOperation()` commits preview
   - Phase: `idle`

### Toggle Face Flow (Immediate)

1. **User selects front face** (idle state)
2. **User clicks Toggle Solid button**
   - No preview phase
   - Directly dispatches to engine
   - Remains in idle state

---

## Open Questions

1. **Selection refinement**: Should users be able to shift-click to modify selection during active operation?

2. **Visual feedback**: How to highlight valid targets during awaiting-selection phase?

3. **Undo system**: Should immediate operations support undo via command pattern?
