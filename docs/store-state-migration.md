# Store State Migration Plan

## Overview

This document tracks the migration from store-centric state to engine-centric state. The goal is to eliminate duplicate state where the store maintains copies of model data (`config`, `faces`, `rootVoid`) that should only live in the engine.

## Current Architecture

### Dual State Problem

The store (`useBoxStore.ts`) maintains its own copies of:
- `config` - Box dimensions, material thickness, assembly config
- `faces` - Face solid/open state
- `rootVoid` - Void tree structure

These duplicate the engine's internal state, creating a bidirectional sync pattern:

```
User Action → Store Action modifies state.config/faces/rootVoid
                ↓
            syncStoreToEngine() → Engine updates
                ↓
            Components read via useEngine*() hooks
```

### Audit Results (January 2026)

**Components: All Correct**

All React components correctly read model state from engine hooks:

| Component | Engine Hooks Used |
|-----------|-------------------|
| `Box3D.tsx` | `useEngineConfig`, `useEngineVoidTree`, `useEnginePanels`, `useEngineMainPanels`, `useEngineMainConfig` |
| `BoxTree.tsx` | `useEngineFaces`, `useEngineVoidTree`, `useEnginePanels` |
| `VoidMesh.tsx` | `useEngineConfig`, `useEngineFaces`, `useEngineVoidTree` |
| `SketchView2D.tsx` | `useEngineConfig`, `useEngineFaces`, `useEngineVoidTree`, `useEnginePanels` |
| `SketchSidebar.tsx` | `useEngineConfig`, `useEngineFaces`, `useEngineVoidTree`, `useEnginePanels` |
| `SubdivisionControls.tsx` | `useEngineConfig`, `useEngineVoidTree`, `useEngineMainVoidTree` |
| `CreateSubAssemblyPalette.tsx` | `useEngineVoidTree`, `useEngineMainVoidTree` |
| `SubdividePalette.tsx` | `useEngineVoidTree`, `useEngineFaces`, `useEngineMainVoidTree`, `useEnginePanels` |
| `DimensionForm.tsx` | `useEngineConfig` |
| `AssemblyProperties.tsx` | `useEngineConfig`, `useEngineFaces`, `useEngineVoidTree` |
| `Viewport3D.tsx` | `useEnginePanels` |
| `PanelProperties.tsx` | `useEngineConfig`, `useEngineFaces`, `useEngineVoidTree`, `useEnginePanels` |

**Store Actions: Still Using Duplicate State**

The store has **72+ references** to `state.config`, `state.faces`, or `state.rootVoid` within store actions. Key patterns:

1. **Reading state for calculations:**
   ```typescript
   const mt = state.config.materialThickness;
   const targetVoid = findVoid(state.rootVoid, voidId);
   ```

2. **Modifying state then syncing:**
   ```typescript
   set({ config: { ...state.config, width: newWidth } });
   syncStoreToEngine(state.config, state.faces, state.rootVoid);
   ```

3. **Initializing engine from store:**
   ```typescript
   ensureEngineInitialized(state.config, state.faces, state.rootVoid);
   ```

## Migration Phases

### Phase 1: Components Read from Engine ✅ COMPLETE
All components use `useEngine*()` hooks to read model state.

### Phase 2: URL Serialization Reads from Engine ✅ COMPLETE
`saveToUrl()` and `getShareableUrl()` now use `getEngineSnapshot()` instead of reading from store state.

### Phase 3: Store Actions Use Engine Dispatch (IN PROGRESS)

Migrate store actions to call `engine.dispatch()` directly instead of modifying store state.

**Pattern:**
Store actions now dispatch to engine and update local state from the returned snapshot.
Fallback logic preserves backward compatibility if dispatch fails.

```typescript
purgeVoid: (voidId) => set((state) => {
  ensureEngineInitialized(state.config, state.faces, state.rootVoid);

  const result = dispatchToEngine({
    type: 'PURGE_VOID',
    targetId: 'main-assembly',
    payload: { voidId },
  });

  if (!result.success || !result.snapshot) {
    // Fallback to local update
    return { rootVoid: VoidTree.update(...) };
  }

  return { rootVoid: result.snapshot.rootVoid };
}),
```

**Actions Migration Status:**

High-priority (frequently used):
- [x] `setConfig` - dispatches SET_DIMENSIONS, SET_MATERIAL, SET_ASSEMBLY_AXIS, SET_LID_CONFIG
- [x] `toggleFace` - dispatches TOGGLE_FACE
- [x] `removeVoid` - dispatches REMOVE_SUBDIVISION
- [ ] `insetFace` - lid inset operations (uses setConfig)

Medium-priority:
- [x] `purgeVoid` - dispatches PURGE_VOID ✓ (Jan 2026)
- [x] `setFeetConfig` - dispatches SET_FEET_CONFIG ✓ (Jan 2026)

Sub-assembly operations:
- [ ] `createSubAssembly` - requires faceOffsets support in engine (complex)
- [ ] `removeSubAssembly` - needs to extract subAssemblyId from void first
- [x] `setSubAssemblyClearance` - dispatches SET_SUB_ASSEMBLY_CLEARANCE ✓ (Jan 2026)
- [x] `toggleSubAssemblyFace` - dispatches TOGGLE_SUB_ASSEMBLY_FACE ✓ (Jan 2026)
- [x] `setSubAssemblyAxis` - dispatches SET_SUB_ASSEMBLY_AXIS ✓ (Jan 2026)

Lid configuration (for sub-assemblies):
- [ ] `setSubAssemblyLidTabDirection` - needs engine action
- [ ] `setSubAssemblyLidInset` - needs engine action

**Engine Actions Added (Jan 2026):**
- `PURGE_VOID` - Clear void children and sub-assembly
- `SET_SUB_ASSEMBLY_CLEARANCE` - Update clearance
- `TOGGLE_SUB_ASSEMBLY_FACE` - Toggle face solid/open
- `SET_SUB_ASSEMBLY_AXIS` - Change assembly orientation
- `CREATE_SUB_ASSEMBLY` - Enhanced with optional assemblyAxis param

**Summary (8 of 12 actions migrated):**
The most frequently used actions now dispatch to engine. Remaining actions are either
complex (createSubAssembly with faceOffsets) or infrequently used (lid configuration).
All migrated actions include fallback logic for backward compatibility.

### Phase 4: Remove Duplicate State (PENDING)

Once all actions use engine dispatch:
1. Remove `config`, `faces`, `rootVoid` from store state
2. Remove `syncStoreToEngine()` function
3. Remove `ensureEngineInitialized()` function
4. Store becomes purely UI state

**Final Store State Shape:**
```typescript
interface BoxStore {
  // Selection state
  selectedPanelIds: Set<string>;
  selectedVoidIds: Set<string>;
  selectedSubAssemblyIds: Set<string>;
  selectedAssemblyId: string | null;

  // Hover state
  hoveredPanelId: string | null;
  hoveredVoidId: string | null;

  // View state
  viewMode: '3d' | '2d';
  sketchPanelId: string | null;
  selectionMode: SelectionMode;

  // Tool state
  activeTool: ToolType;
  operationState: OperationState;

  // Visibility state
  hiddenVoidIds: Set<string>;
  isolatedVoidId: string | null;
  hiddenFaceIds: Set<FaceId>;

  // Debug state
  showDebugAnchors: boolean;
}
```

## Engine Dispatch Actions Needed

The engine needs these dispatch action types to support the migration:

```typescript
type EngineAction =
  | { type: 'SET_DIMENSIONS'; targetId: string; payload: Partial<BoxConfig> }
  | { type: 'TOGGLE_FACE'; targetId: string; payload: { faceId: FaceId } }
  | { type: 'ADD_SUBDIVISION'; targetId: string; payload: SubdivisionParams }
  | { type: 'REMOVE_SUBDIVISION'; targetId: string; payload: { voidId: string } }
  | { type: 'SET_ASSEMBLY_AXIS'; targetId: string; payload: { axis: AssemblyAxis } }
  | { type: 'SET_LID_CONFIG'; targetId: string; payload: LidConfigParams }
  | { type: 'SET_FEET_CONFIG'; targetId: string; payload: FeetConfig }
  | { type: 'ADD_SUB_ASSEMBLY'; targetId: string; payload: SubAssemblyParams }
  | { type: 'REMOVE_SUB_ASSEMBLY'; targetId: string; payload: { subAssemblyId: string } }
  // ... etc
```

## Benefits of Migration

1. **Single Source of Truth:** Engine owns all model state
2. **Event Sourcing Ready:** All mutations are serializable actions
3. **Undo/Redo:** Actions can be recorded and replayed
4. **Collaboration:** Actions can be synced between clients
5. **Simpler Mental Model:** No bidirectional sync to reason about
6. **Smaller Store:** Store only tracks UI state

## Related Documents

- `docs/event-sourcing-proposal.md` - Undo/redo and action recording
- `docs/completed_projects/oo-refactor.md` - Engine architecture decisions
