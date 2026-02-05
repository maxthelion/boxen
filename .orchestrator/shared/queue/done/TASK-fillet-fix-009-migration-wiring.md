# [TASK-fillet-fix-009] Fix: Complete all-corners migration wiring

ROLE: implement
PRIORITY: P1
BRANCH: feature/fillet-all-corners-integration-tests
CREATED: 2026-02-04T21:45:00Z
CREATED_BY: human
DEPENDS_ON: TASK-fillet-fix-007, TASK-fillet-fix-008a, TASK-fillet-fix-008b

## Problem

Bug 009: The migration from 4-corner to all-corners fillet system is incomplete. Several components still use `cornerEligibility` instead of `allCornerEligibility`.

## Sub-bugs to Fix

### Bug 009A: 3D Eligibility uses old system
**File:** `src/operations/eligibility.ts:104`

```typescript
// BEFORE (broken):
const cornerEligibility = panel.cornerEligibility ?? [];

// AFTER:
const cornerEligibility = panel.allCornerEligibility ?? [];
```

### Bug 009B: 2D View uses old fillet palette
**File:** `src/components/SketchView2D.tsx`

The 2D view should use `FilletAllCornersPalette` instead of the old fixed-checkbox palette.

### Bug 009C: 2D Fillet not applying radius
**File:** `src/components/SketchView2D.tsx` or fillet action

Verify the fillet action dispatches `SET_ALL_CORNER_FILLETS_BATCH` with correct parameters.

### Bug 009D: 3D Fillet preview not working
**File:** `src/components/Viewport3D.tsx` or operation registry

Verify preview action is created and dispatched correctly.

### Bug 009E: Corner indicators inconsistent between 2D/3D
Both views should use `allCornerEligibility` for corner rendering.

## Files to Check/Modify

1. `src/operations/eligibility.ts` - Update `getFilletPanelEligibility()`
2. `src/components/SketchView2D.tsx` - Use FilletAllCornersPalette
3. `src/components/Viewport3D.tsx` - Verify all-corners wiring
4. `src/operations/registry.ts` - Verify fillet operation config
5. `src/engine/panelBridge.ts` - Ensure `allCornerEligibility` is bridged to PanelPath

## Verification Steps

1. Select panel in 3D view with fillet tool
2. Verify eligible corners show (not "No eligible corners")
3. Adjust radius slider - verify preview updates
4. Apply fillet - verify geometry changes
5. Switch to 2D view (Tab)
6. Verify same corners shown as eligible
7. Apply fillet in 2D - verify geometry changes

## Acceptance Criteria

- [ ] 3D view shows correct eligible corners
- [ ] 3D fillet preview works (geometry updates as slider moves)
- [ ] 3D fillet apply works (geometry persists)
- [ ] 2D view shows all detected corners (not fixed 4)
- [ ] 2D fillet apply works
- [ ] Switching between 2D/3D maintains consistency

## Testing

Manual testing required for UI verification. Also run:
```bash
npm run test:run -- src/test/fixtures/allCornerEligibility.test.ts
npm run test:run -- tests/integration/operations/cornerFillet.test.ts
```

CLAIMED_BY: impl-agent-1
CLAIMED_AT: 2026-02-04T21:47:58.025991

COMPLETED_AT: 2026-02-04T21:52:40.523022

## Result
PR created: https://github.com/maxthelion/boxen/pull/31
