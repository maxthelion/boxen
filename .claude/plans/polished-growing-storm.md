# Plan: Migrate create-sub-assembly to Operation System with Previews

## Problem Summary

The `create-sub-assembly` operation currently **bypasses the operation system entirely**:
- UI calls `createSubAssembly()` store action directly (mutates Zustand state)
- Engine's `CREATE_SUB_ASSEMBLY` dispatch action exists but is never called
- No preview functionality - changes are immediately committed
- No cancel capability - user can't back out

Additionally, the current `updateOperationParams()` in useBoxStore.ts has a growing switch statement for each operation type. This doesn't scale well.

## Abstraction Strategy

### 1. Registry-Based Preview Dispatch

Each operation can define its own `createPreviewAction` function in the registry that converts params to an engine action:

**File:** `src/operations/registry.ts`

```typescript
import { EngineAction } from '../engine/types';

export interface OperationDefinition {
  // existing fields...

  /** For parameter operations: creates the engine action for preview */
  createPreviewAction?: (params: Record<string, unknown>) => EngineAction | null;
}

// Example for subdivide:
'subdivide': {
  id: 'subdivide',
  name: 'Subdivide',
  type: 'parameter',
  // ...
  createPreviewAction: (params) => {
    const { voidId, axis, positions } = params as { voidId?: string; axis?: 'x'|'y'|'z'; positions?: number[] };
    if (!voidId || !axis || !positions?.length) return null;
    return {
      type: 'ADD_SUBDIVISIONS',
      targetId: 'main-assembly',
      payload: { voidId, axis, positions },
    };
  },
},

// Example for create-sub-assembly:
'create-sub-assembly': {
  id: 'create-sub-assembly',
  name: 'Create Sub-Assembly',
  type: 'parameter',
  // ...
  createPreviewAction: (params) => {
    const { voidId, clearance, assemblyAxis, faceOffsets } = params as { ... };
    if (!voidId) return null;
    return {
      type: 'CREATE_SUB_ASSEMBLY',
      targetId: 'main-assembly',
      payload: { voidId, clearance: clearance ?? 1, assemblyAxis, faceOffsets },
    };
  },
},
```

### 2. Simplified updateOperationParams

The switch statement in `updateOperationParams()` becomes a simple lookup:

```typescript
updateOperationParams: (params) => {
  const { activeOperation } = state.operationState;
  if (!activeOperation) return state;

  const newParams = { ...state.operationState.params, ...params };
  const operation = getOperation(activeOperation);

  // Use registry-defined preview action creator
  if (operation.createPreviewAction) {
    const action = operation.createPreviewAction(newParams);
    if (action) {
      engine.discardPreview();
      engine.startPreview();
      engine.dispatch(action, { preview: true });
      engineStateChanged = true;
    }
  }

  return { operationState: { ...state.operationState, params: newParams } };
}
```

### 3. useOperationPalette Hook

Shared hook for palette components that handles the operation lifecycle:

**File:** `src/hooks/useOperationPalette.ts`

```typescript
export function useOperationPalette<TParams extends Record<string, unknown>>(options: {
  operationId: OperationId;
  canStart: (params: TParams) => boolean;
}): {
  isActive: boolean;
  params: Partial<TParams>;
  updateParams: (newParams: Partial<TParams>) => void;
  start: (initialParams: TParams) => void;
  apply: () => void;
  cancel: () => void;
}
```

## Implementation Plan

### Step 1: Extend OperationDefinition with createPreviewAction

**File:** `src/operations/registry.ts`

Add `createPreviewAction` to the interface and implement it for:
- `subdivide` and `subdivide-two-panel` (move existing logic from store)
- `push-pull` (move existing logic from store)
- `create-sub-assembly` (new)

### Step 2: Simplify updateOperationParams

**File:** `src/store/useBoxStore.ts`

Replace the switch statement with a lookup to `operation.createPreviewAction()`.

### Step 3: Create useOperationPalette Hook

**File:** `src/hooks/useOperationPalette.ts` (new file)

Shared logic for:
- Starting operations with `startOperation()`
- Updating params via `updateOperationParams()`
- Apply via `applyOperation()`
- Cancel via `cancelOperation()`
- Cleanup on unmount

### Step 4: Create CreateSubAssemblyPalette Component

**File:** `src/components/CreateSubAssemblyPalette.tsx` (new file)

Uses `useOperationPalette` hook, similar structure to `SubdividePalette` but with:
- Clearance slider
- Assembly axis toggle
- Face offsets (optional)
- **Void selection prompt** - if no void is selected, show a list of available leaf voids to choose from

### Step 5: Add Toolbar Button

**File:** `src/components/EditorToolbar.tsx`

Add "Create Sub-Assembly" button to the toolbar that:
- Opens `CreateSubAssemblyPalette`
- If a void is selected, uses that void
- If no void is selected, palette prompts user to select a void

### Step 6: Update SubdivisionControls

**File:** `src/components/SubdivisionControls.tsx`

Remove create sub-assembly UI section (it's now in the toolbar).

### Step 7: Verify Engine Action

**File:** `src/engine/Engine.ts`

Ensure `CREATE_SUB_ASSEMBLY` handler accepts all params (assemblyAxis, faceOffsets).

### Step 8: Refactor SubdividePalette (Optional)

**File:** `src/components/SubdividePalette.tsx`

Optionally migrate to use `useOperationPalette` hook for consistency.

### Step 9: Add Integration Tests

**File:** `src/engine/subAssembly.integration.test.ts` (new file)

Test scenarios:
1. **Single subdivision + sub-assembly:**
   - Start with default box
   - Subdivide root void (e.g., Y axis at center)
   - Create sub-assembly in one of the child voids
   - Verify sub-assembly internal dimensions (width/height/depth minus clearance)
   - Verify sub-assembly world-space position is correct

2. **Nested subdivision + sub-assembly:**
   - Start with default box
   - Subdivide root void (Y axis)
   - Subdivide one child void again (X axis)
   - Create sub-assembly in the nested void
   - Verify sub-assembly dimensions match the nested void minus clearance
   - Verify sub-assembly world-space position accounts for both subdivision levels

3. **Dimension correctness checks:**
   - Sub-assembly clearance applied correctly on all sides
   - Sub-assembly panels positioned within void bounds
   - World transforms compose correctly through the hierarchy

### Step 10: Update CLAUDE.md with Operation Implementation Guide

**File:** `CLAUDE.md`

Add section documenting how to implement new operations:

```markdown
## Adding New Operations

### 1. Define in Registry
Add to `src/operations/registry.ts`:
- `id`, `name`, `type` ('parameter' | 'immediate' | 'view')
- `selectionType`, `minSelection`, `maxSelection`
- `createPreviewAction` function (for parameter operations)

### 2. Engine Action (if needed)
Add action type to `src/engine/types.ts` and handler in `src/engine/Engine.ts`

### 3. Palette Component (for parameter operations)
Create palette using `useOperationPalette` hook:
- Calls `start()` when target is selected
- Updates params with `updateParams()`
- Calls `apply()` or `cancel()` on user action

### 4. Toolbar Integration
Add button to `EditorToolbar.tsx` that opens the palette

### 5. Tests
Add tests in `src/store/operations.test.ts` for preview/apply/cancel flow
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/operations/registry.ts` | Add `createPreviewAction` to interface and implement for all parameter operations |
| `src/store/useBoxStore.ts` | Simplify `updateOperationParams` to use registry lookup |
| `src/hooks/useOperationPalette.ts` | New file - shared hook for operation palette lifecycle |
| `src/components/CreateSubAssemblyPalette.tsx` | New file - operation-based palette with void selection |
| `src/components/EditorToolbar.tsx` | Add create sub-assembly toolbar button |
| `src/components/SubdivisionControls.tsx` | Remove create sub-assembly UI section |
| `src/engine/Engine.ts` | Verify CREATE_SUB_ASSEMBLY supports all params |
| `src/engine/subAssembly.integration.test.ts` | New file - integration tests |
| `src/store/operations.test.ts` | Add preview tests for create-sub-assembly |
| `CLAUDE.md` | Add "Adding New Operations" guide section |

## Verification

1. **Manual Testing:**
   - Test subdivide still works (regression)
   - Test push-pull still works (regression)
   - Test create-sub-assembly with preview:
     - Click toolbar button with no selection → prompts for void
     - Select void → palette shows with preview
     - Adjust clearance → preview updates
     - Change assembly axis → preview updates
     - Cancel → sub-assembly disappears
     - Apply → sub-assembly persists

2. **Run Tests:**
   ```bash
   npm run test:run -- src/store/operations.test.ts
   npm run test:run -- src/engine/subAssembly.integration.test.ts
   ```

3. **Type Check:**
   ```bash
   npm run typecheck
   ```

## Decisions

- **Registry-based dispatch:** Each operation defines its own `createPreviewAction` in the registry
- **Simplified store:** No more switch statement in `updateOperationParams`
- **Shared hook:** `useOperationPalette` extracts common palette logic
- **Separate palette:** `CreateSubAssemblyPalette` follows same pattern as `SubdividePalette`
- **Toolbar item:** Create sub-assembly is accessible from toolbar
- **Void selection:** Palette prompts for void selection if none selected
