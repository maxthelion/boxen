# Issue 009: Fillet All-Corners Migration Incomplete

**Date Reported:** 2026-02-04
**Status:** Open
**Branch:** feature/fillet-all-corners-integration-tests
**Commit:** 261c9f6

## Description

The migration from 4-corner fillet system to all-corners fillet system is incomplete. Several components still use the old `cornerEligibility` data instead of `allCornerEligibility`.

## Bugs Found

### Bug A: 3D Eligibility Tooltip Uses Old System

**Location:** `src/operations/eligibility.ts:104`

```typescript
// Current (broken):
const cornerEligibility = panel.cornerEligibility ?? [];

// Should be:
const cornerEligibility = panel.allCornerEligibility ?? [];
```

**Symptom:** In 3D view, selecting a panel shows "No eligible corners on this panel" even when corners are eligible.

**Root Cause:** `getFilletPanelEligibility()` checks `panel.cornerEligibility` (old 4-corner data) instead of `panel.allCornerEligibility` (new dynamic corners).

### Bug B: 2D View Uses Old Fillet Palette

**Location:** `src/components/SketchView2D.tsx`

**Symptom:** 2D view still shows the old "Corner Fillet" palette with fixed checkboxes:
- Top Left
- Top Right
- Bottom Right
- Bottom Left

**Expected:** Should use `FilletAllCornersPalette` like 3D view, showing all detected corners from geometry.

### Bug C: 2D Chamfer/Fillet Radius Not Applied

**Location:** `src/components/SketchView2D.tsx` or related fillet action

**Symptom:** In 2D view, selecting corners (Top Left, Top Right checked) and setting radius (7mm) then clicking Apply does NOT modify the panel outline. Corners remain sharp.

**Expected:** Panel outline should show chamfered/filleted corners at the specified radius.

### Bug D: 3D Fillet Preview Not Working

**Location:** `src/components/Viewport3D.tsx` or operation registry

**Symptom:** In 3D view, adjusting the fillet radius slider doesn't show a preview of the filleted corners on the panel geometry.

**Expected:** Panel outline should update in real-time to show filleted corners as radius changes.

### Bug E: Corner Indicators Show in 2D But Not Consistently in 3D

**Symptom:** The cyan corner circles appear in 2D view but 3D view shows "No eligible corners" message.

**Root Cause:** 2D and 3D views use different data sources for corner rendering.

## Affected Code

- `src/operations/eligibility.ts` - `getFilletPanelEligibility()` function
- `src/components/SketchView2D.tsx` - Fillet palette and corner rendering
- `src/components/FilletPalette.tsx` - Old 4-corner palette (used by 2D view)
- 2D fillet/chamfer action dispatch - radius not being applied to panel geometry

## Recommended Fixes

### Fix A: Update Eligibility Check
```typescript
// In src/operations/eligibility.ts
export function getFilletPanelEligibility(panel: PanelPath): EligibilityResult {
  const cornerEligibility = panel.allCornerEligibility ?? [];
  const hasEligibleCorner = cornerEligibility.some(c => c.eligible);
  // ...
}
```

### Fix B: Update 2D View to Use All-Corners Palette
- Import `FilletAllCornersPalette` in SketchView2D
- Replace old fillet palette with new one
- Wire up `allCornerEligibility` data

## Testing

1. Select panel in 3D view with fillet tool active
2. Verify eligible corners show (not "No eligible corners" message)
3. Switch to 2D view
4. Verify all geometric corners are shown (not just 4 fixed corners)
5. Add an inset/cutout, verify new corners appear in fillet tool

## Priority

P1 - Blocks fillet feature from working correctly
