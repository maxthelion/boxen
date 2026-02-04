# Proposal: Eliminate Duplicate Model State in Store

**ID:** PROP-arch0204
**Proposer:** architect
**Category:** debt
**Complexity:** L
**Created:** 2026-02-04T06:49:00Z

## Summary
Remove duplicate model state (config, rootVoid, faces, panelCollection) from the Zustand store, consolidating the engine as the single source of truth.

## Rationale

The documented architecture in CLAUDE.md states:
> **Engine (source of truth for model state)** - owns the scene tree: assemblies, voids, faces, dimensions
> **Store (UI state only)** - selection state, active operation, view mode

However, the current implementation violates this:

1. **Duplicate state exists in the store:**
   - `config` (BoxConfig) - `src/store/slices/configSlice.ts:15-17`
   - `rootVoid` (Void tree) - `src/store/slices/configSlice.ts:17`
   - `faces` (Face configurations) - `src/store/slices/configSlice.ts:16`
   - `panelCollection` - `src/store/slices/panelSlice.ts:18`

2. **Mutations happen through both paths:**
   - `setDividerPosition()` in panelSlice.ts:154-297 mutates `rootVoid` directly AND regenerates panels from engine
   - `setFaceOffset()` in configSlice.ts:169-208 directly mutates the void tree with custom recursion
   - `scaleVoidBounds()` and `adjustVoidBounds()` in configSlice.ts:387-498 implement void manipulation independent of engine

3. **Stale state risk:**
   - Components reading `useBoxStore.panelCollection` may get stale data after operations
   - Engine updates without notifying store can leave store state inconsistent

4. **Duplicated logic:**
   - Three different implementations of void bounds manipulation across slices
   - Each slice reimplements the sync pattern differently

This creates bugs that are hard to trace, since state can be inconsistent between engine and store.

## Complexity Reduction

This refactor will:
- Remove 3 duplicate void manipulation implementations (lines 169-208, 387-406, 429-498 in configSlice.ts)
- Consolidate panel generation to always flow through engine
- Make state flow predictable: User Action → Store (UI params) → engine.dispatch() → Engine snapshot → React
- Eliminate the `modelState.ts` helper that exists to paper over the dual-source problem

## Dependencies
None - this is foundational debt that should be addressed before adding more features.

## Enables
- Reliable undo/redo implementation (event sourcing requires single source of truth)
- Collaborative features (requires consistent state model)
- Simpler debugging (one place to inspect model state)
- Cleaner test setup (no need to sync store and engine)

## Acceptance Criteria
- [ ] `config`, `rootVoid`, `faces` removed from store state
- [ ] All components read config/void/face data via engine hooks (`useEngineConfig()`, `useEngineVoidTree()`)
- [ ] `panelCollection` removed from store; components use `useEnginePanels()` exclusively
- [ ] `setDividerPosition()` dispatches to engine, doesn't directly mutate store
- [ ] `setFaceOffset()` dispatches to engine, doesn't directly mutate store
- [ ] `scaleVoidBounds()` and `adjustVoidBounds()` removed or consolidated to engine action
- [ ] `modelState.ts` helper removed (no longer needed)
- [ ] All existing tests pass
- [ ] No `panelCollection`, `rootVoid`, `config`, or `faces` in store type definitions

## Relevant Files
- src/store/slices/configSlice.ts (606 lines - largest offender)
- src/store/slices/panelSlice.ts (656 lines)
- src/store/helpers/modelState.ts (59 lines - to be removed)
- src/store/useBoxStore.ts (hook exports need updating)
- src/engine/Engine.ts (may need new query methods)
- src/engine/panelBridge.ts (already provides snapshot conversion)
- src/hooks/useEnginePanels.ts (already exists, needs to be used everywhere)

## Implementation Approach

### Phase 1: Create engine query methods
Add `engine.getConfig()`, `engine.getVoidTree()`, `engine.getFaces()` methods that return snapshots.

### Phase 2: Create hooks for engine data
Create or extend hooks:
- `useEngineConfig()` - returns config snapshot
- `useEngineVoidTree()` - returns void tree snapshot
- `useEngineFaces()` - returns faces snapshot

### Phase 3: Migrate component reads
Update components to use engine hooks instead of store selectors for model data.

### Phase 4: Remove store state
Delete the model state from store slices and remove the duplicate mutation logic.

### Phase 5: Cleanup
Remove `modelState.ts` helper and update tests.

## Risks

- **Large refactor scope** - Many components touch this state. Phased approach mitigates this.
- **Transient performance** - More engine queries during transition. Final state should be equivalent or better since we eliminate sync overhead.
- **Test updates** - Tests that set store state directly will need to dispatch to engine instead.
