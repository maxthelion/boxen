# Proposal: Fix utils-to-store dependency inversion

**ID:** PROP-arch-001
**Proposer:** architect
**Category:** refactor
**Complexity:** S
**Created:** 2026-02-04T09:00:43Z

## Summary

Move pure helper functions out of `store/helpers/` to `utils/` and update imports in utility files to eliminate the improper utils->store dependency direction.

## Rationale

The codebase has a dependency direction violation where utility files import from the store layer:

```
Current (broken):
  utils/panelGenerator.ts ──imports──> store/useBoxStore.ts
  utils/svgExport.ts      ──imports──> store/useBoxStore.ts
  utils/extendModeDebug.ts ──imports──> store/useBoxStore.ts
```

This violates the proper dependency hierarchy:
```
Correct:
  Components → Store → Engine
           ↘ Utils (no store dependency)
```

**The functions being imported are pure functions that don't access store state:**
- `getAllSubdivisions(root: Void)` - Takes a `Void` and returns `Subdivision[]`
- `getBoundsStart`, `getBoundsSize` - Already exist in `utils/bounds.ts` but are re-exported through the store

This creates:
1. Confusing import paths (utils importing from store)
2. False sense of coupling to store
3. Potential circular dependency risks as codebase grows

## Proposed Changes

### Phase 1: Move `getAllSubdivisions` to utils (5 files affected)

1. **Create `src/utils/voidHelpers.ts`** - Move `getAllSubdivisions` function from `store/helpers/selection.ts`

2. **Update imports in utility files:**
   - `src/utils/panelGenerator.ts:26` - Import from `./voidHelpers` instead of `../store/useBoxStore`
   - `src/utils/svgExport.ts:3` - Import from `./voidHelpers` instead of `../store/useBoxStore`
   - `src/utils/extendModeDebug.ts:8` - Import from `./voidHelpers` and `./bounds` instead of `../store/useBoxStore`

3. **Update component imports (no behavior change):**
   - Components can continue importing from `store/useBoxStore` (which will re-export from utils)
   - Or update to import directly from utils for consistency

### Phase 2: Clean up bounds re-exports

- `getBoundsStart` and `getBoundsSize` already exist in `utils/bounds.ts`
- `extendModeDebug.ts` should import directly from `./bounds` instead of through the store

## Complexity Reduction

This refactoring:
- Clarifies that these are pure data transformation functions, not store-dependent
- Removes 3 improper utils->store import paths
- Makes dependency graph cleaner for future refactoring
- Sets pattern for keeping utils layer independent

## Dependencies

None - this is a standalone improvement.

## Enables

- Cleaner codebase architecture for future features
- Easier testing of utility functions in isolation
- Clear separation of concerns between data transformations and state management

## Acceptance Criteria

- [ ] `getAllSubdivisions` is defined in `src/utils/voidHelpers.ts`
- [ ] `src/utils/panelGenerator.ts` imports from `./voidHelpers`, not store
- [ ] `src/utils/svgExport.ts` imports from `./voidHelpers`, not store
- [ ] `src/utils/extendModeDebug.ts` imports from `./voidHelpers` and `./bounds`, not store
- [ ] `store/useBoxStore.ts` re-exports `getAllSubdivisions` from utils (for backwards compatibility)
- [ ] All existing tests pass
- [ ] No runtime behavior changes

## Relevant Files

**Files to create:**
- `src/utils/voidHelpers.ts` (new)

**Files to modify:**
- `src/utils/panelGenerator.ts` - Update import
- `src/utils/svgExport.ts` - Update import
- `src/utils/extendModeDebug.ts` - Update imports
- `src/store/helpers/selection.ts` - Remove `getAllSubdivisions` (or make it re-export)
- `src/store/useBoxStore.ts` - Re-export from new location
