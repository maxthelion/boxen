# Proposal: Extract useOperationPalette hook to eliminate palette duplication

**ID:** PROP-618d8692
**Proposer:** architect
**Category:** refactor
**Complexity:** M
**Created:** 2026-02-04T07:45:46Z

## Summary
Extract common operation lifecycle logic from 6+ palette components into a reusable `useOperationPalette` hook.

## Rationale

All operation palettes (ScalePalette, MovePalette, CreateSubAssemblyPalette, InsetPalette, FilletPalette, etc.) repeat the same boilerplate pattern:

```typescript
// This pattern is duplicated 6+ times across palette components:
const operationState = useBoxStore((state) => state.operationState);
const startOperation = useBoxStore((state) => state.startOperation);
const updateOperationParams = useBoxStore((state) => state.updateOperationParams);
const applyOperation = useBoxStore((state) => state.applyOperation);
const cancelOperation = useBoxStore((state) => state.cancelOperation);
const hasAutoStarted = useRef(false);

// Plus: auto-start logic, reset logic, cleanup effects, apply/cancel handlers
```

Each palette also duplicates:
1. **Auto-start effect** - Start operation when valid selection detected
2. **Reset effect** - Reset `hasAutoStarted` when selection changes
3. **Cleanup effect** - Discard preview when unmounted
4. **Apply handler** - Call `applyOperation()` then `onClose()`
5. **Cancel handler** - Call `cancelOperation()` then `onClose()`

This duplication:
- Makes it easy to introduce bugs when the pattern changes
- Adds ~50-80 lines of boilerplate to each palette
- Makes adding new operations more error-prone
- Obscures the actual operation-specific logic

## Complexity Reduction

**Before:** Each new operation palette requires manually implementing the same lifecycle:
- Copy boilerplate from existing palette
- Risk subtle bugs from incomplete copying
- 6+ places to update if lifecycle changes

**After:** New palettes become simple:
```typescript
const { isActive, params, updateParams, apply, cancel } = useOperationPalette('my-operation', {
  canStart: !!selectedVoidId,
  initialParams: { voidId: selectedVoidId },
  onClose,
});
```

The hook encapsulates:
- Store selectors (one subscription instead of 5)
- Auto-start lifecycle
- Reset/cleanup effects
- Apply/cancel handlers

## Dependencies
None - this is standalone refactoring.

## Enables
- Faster implementation of new operations
- Single place to fix operation lifecycle bugs
- Easier testing of operation lifecycle (test hook once)
- Potential for operation lifecycle improvements (e.g., better preview cleanup)

## Acceptance Criteria
- [ ] New `useOperationPalette` hook in `src/hooks/useOperationPalette.ts`
- [ ] Hook accepts operation ID and configuration object
- [ ] Hook returns: `{ isActive, params, updateParams, apply, cancel }`
- [ ] Auto-start behavior triggered by `canStart` boolean
- [ ] Cleanup effect runs on unmount
- [ ] At least 3 existing palettes refactored to use the hook
- [ ] No behavior changes - existing operation tests pass
- [ ] Lines of code reduced in refactored palettes by ~40%

## Relevant Files
- src/hooks/useOperationPalette.ts (new)
- src/components/ScalePalette.tsx
- src/components/MovePalette.tsx
- src/components/CreateSubAssemblyPalette.tsx
- src/components/InsetPalette.tsx
- src/components/FilletPalette.tsx
- src/components/FilletAllCornersPalette.tsx
- src/components/SubdividePalette.tsx
- src/components/PushPullPalette.tsx
- src/components/ConfigurePalette.tsx
