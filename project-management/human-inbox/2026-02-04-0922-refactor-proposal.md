# Proposal: Complete Store-to-Engine State Migration

**ID:** PROP-8f3a2c91
**Proposer:** architect
**Category:** debt
**Complexity:** M
**Created:** 2026-02-04T09:22:47Z

## Summary
Remove duplicated model state (config, faces, rootVoid) from the Zustand store, completing the migration to engine-as-source-of-truth.

## Rationale
The codebase is in a transitional state where model data exists in both the engine (source of truth) and the Zustand store (legacy cache). This creates:

1. **State divergence risk** - If engine and store get out of sync, components may see stale data
2. **Cognitive overhead** - Developers must understand the `getModelState()` indirection pattern
3. **Code complexity** - 5 slice files use `getModelState(state)` with fallback logic that won't be needed once migration completes
4. **Initialization complexity** - `useBoxStore.ts` lines 56-58 explicitly override slice state with initial model values

The comments in `src/store/helpers/modelState.ts` explicitly state: "Once migration is complete, store.config/faces/rootVoid will be removed and this helper will only read from engine."

## Complexity Reduction
After this refactor:
- Remove `config`, `faces`, `rootVoid` fields from store (lines 56-58 of `useBoxStore.ts`)
- Remove `getModelState()` helper and all fallback logic
- Remove `StoreStateWithModel` interface
- Simplify `ConfigSlice`, `VoidSlice`, `PanelSlice`, `SubAssemblySlice`, and `VisibilitySlice` interfaces
- Actions that previously needed `getModelState(state)` will directly use `getEngineSnapshot()`

This removes ~50-100 lines of transitional code and eliminates an entire category of potential bugs.

## Dependencies
- Engine must be fully initialized before any store actions run (already true based on `ensureEngine()` calls)
- All components must be reading from `useEnginePanels()` hook rather than store model state (appears complete based on code review)

## Enables
- Cleaner mental model for new contributors
- Easier debugging (single source of truth, no need to check both engine and store)
- Foundation for future event-sourcing implementation (store won't hold redundant model state)

## Acceptance Criteria
- [ ] Store no longer has `config`, `faces`, `rootVoid` fields in its type definition
- [ ] `getModelState()` helper is removed from codebase
- [ ] All slice actions that need model state read directly from `getEngineSnapshot()`
- [ ] `StoreStateWithModel` interface is removed
- [ ] All existing tests pass without modification (or with minimal changes to test setup)
- [ ] No regressions in UI behavior - app functions identically

## Relevant Files
- src/store/useBoxStore.ts (remove lines 56-58, remove from BoxStore type)
- src/store/helpers/modelState.ts (delete file)
- src/store/slices/configSlice.ts (remove config/faces/rootVoid from ConfigSlice, use getEngineSnapshot())
- src/store/slices/voidSlice.ts (update to use getEngineSnapshot() directly)
- src/store/slices/panelSlice.ts (update to use getEngineSnapshot() directly)
- src/store/slices/subAssemblySlice.ts (update to use getEngineSnapshot() directly)
- src/store/slices/visibilitySlice.ts (update to use getEngineSnapshot() directly)

## Implementation Notes
The migration is straightforward because:
1. `getModelState()` already prefers engine state and only falls back to store state
2. `getEngineSnapshot()` returns the same `{config, faces, rootVoid}` structure
3. The engine is always initialized by the time actions run (via `ensureEngine()`)

Each slice action currently doing:
```typescript
const modelState = getModelState(state);
const { config, faces, rootVoid } = modelState;
```

Will become:
```typescript
const { config, faces, rootVoid } = getEngineSnapshot();
```
