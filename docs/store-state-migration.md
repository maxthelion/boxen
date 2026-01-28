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

### Phase 3: Store Actions Use Engine Dispatch (PENDING)

Migrate store actions to call `engine.dispatch()` directly instead of modifying store state.

**Before:**
```typescript
setConfig: (newConfig) => set((state) => {
  const config = { ...state.config, ...newConfig };
  syncStoreToEngine(config, state.faces, state.rootVoid);
  return { config };
}),
```

**After:**
```typescript
setConfig: (newConfig) => {
  const engine = getEngine();
  engine.dispatch({
    type: 'SET_DIMENSIONS',
    targetId: 'main-assembly',
    payload: newConfig,
  });
  notifyEngineStateChanged();
},
```

**Actions to Migrate:**

High-priority (frequently used):
- [ ] `setConfig` - dimension changes
- [ ] `toggleFace` - face solid/open toggle
- [ ] `addSubdivision` - adding dividers
- [ ] `removeVoid` - removing subdivisions
- [ ] `insetFace` - lid inset operations

Medium-priority:
- [ ] `setAssemblyAxis` - assembly orientation
- [ ] `setLidTabDirection` - tab direction changes
- [ ] `setLidInset` - lid inset amount
- [ ] `purgeVoid` - clearing void contents
- [ ] `setFeetConfig` - feet configuration

Lower-priority (sub-assembly operations):
- [ ] `addSubAssembly` - creating sub-assemblies
- [ ] `removeSubAssembly` - removing sub-assemblies
- [ ] `setSubAssemblyClearance` - sub-assembly clearance
- [ ] `toggleSubAssemblyFace` - sub-assembly face toggle
- [ ] `setSubAssemblyAxis` - sub-assembly orientation

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
