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

**Store Actions: Previously Using Duplicate State**

The store had **72+ references** to `state.config`, `state.faces`, or `state.rootVoid` within store actions. These have now been migrated to use `getModelState()`.

## Migration Phases

### Phase 1: Components Read from Engine ✅ COMPLETE
All components use `useEngine*()` hooks to read model state.

### Phase 2: URL Serialization Reads from Engine ✅ COMPLETE
`saveToUrl()` and `getShareableUrl()` now use `getEngineSnapshot()` instead of reading from store state.

### Phase 3: Store Actions Use Engine Dispatch ✅ COMPLETE

All store actions now dispatch to engine and use fallback logic for backward compatibility.

**Actions Migrated:**
- `setConfig` - dispatches SET_DIMENSIONS, SET_MATERIAL, SET_ASSEMBLY_AXIS, SET_LID_CONFIG
- `toggleFace` - dispatches TOGGLE_FACE
- `removeVoid` - dispatches REMOVE_SUBDIVISION
- `purgeVoid` - dispatches PURGE_VOID
- `setFeetConfig` - dispatches SET_FEET_CONFIG
- `createSubAssembly` - dispatches CREATE_SUB_ASSEMBLY
- `removeSubAssembly` - dispatches REMOVE_SUB_ASSEMBLY
- `setSubAssemblyClearance` - dispatches SET_SUB_ASSEMBLY_CLEARANCE
- `toggleSubAssemblyFace` - dispatches TOGGLE_SUB_ASSEMBLY_FACE
- `setSubAssemblyAxis` - dispatches SET_SUB_ASSEMBLY_AXIS
- `setSubAssemblyLidTabDirection` - dispatches SET_SUB_ASSEMBLY_LID_TAB_DIRECTION

**Deprecated Actions:**
- `setSubAssemblyLidInset` - use push-pull adjust mode
- `setLidInset` - use push-pull adjust mode

### Phase 4: Remove Duplicate State ✅ COMPLETE

All store actions now read model state from engine via `getModelState()` helper.

**Infrastructure Added (Jan 2026):**
- `ensureEngine()` - Creates default assembly if none exists (no store state required)
- `getModelState(state)` - Helper that reads from engine with fallback to store state

**All Actions Now Use Engine as Source of Truth:**

Every store action that needs model state now uses `getModelState()`:
- `setConfig`, `toggleFace`, `removeVoid`, `resetVoids`
- `createSubAssembly`, `removeSubAssembly`, `purgeVoid`
- `toggleSubAssemblyFace`, `setSubAssemblyClearance`
- `setAssemblyAxis`, `setLidTabDirection`, `setLidInset` (deprecated)
- `setFeetConfig`, `setFaceOffset`, `insetFace`
- `setDividerPosition`, `setDividerPositionMode`
- `setIsolatedVoid`, `setIsolatedSubAssembly`, `setIsolatedPanel`
- `setSubAssemblyAxis`, `setSubAssemblyLidTabDirection`, `setSubAssemblyLidInset` (deprecated)
- `generatePanels`, `setEdgeExtension`

**Key Changes:**
- All `ensureEngineInitialized(state.config, state.faces, state.rootVoid)` replaced with `ensureEngine()`
- All `state.config`, `state.faces`, `state.rootVoid` reads replaced with `getModelState()`
- `loadFromUrl` syncs loaded data to engine before setting store state
- All fallback paths updated to read from engine

**Remaining Cleanup (Optional Future Work):**
- The store still maintains `config`, `faces`, `rootVoid` fields for backward compatibility
- These can be removed once all external consumers use engine hooks
- `syncStoreToEngine()` is only used by `loadFromUrl` for initialization
- `ensureEngineInitialized()` is deprecated (replaced by `ensureEngine()`)

**Final Store State Shape (Goal):**
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
