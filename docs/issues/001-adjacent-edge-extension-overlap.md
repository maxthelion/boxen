# Issue 001: Adjacent Edge Extensions Cause Finger Joint Overlap

**Date Reported:** 2026-02-02
**Status:** Open
**Branch:** main
**Commit:** 7d0adf180067dfa99cf13f3f399885f5c8a27c33

## Description

When two adjacent face panels (e.g., front and right) both have edge extensions applied to the same edge (e.g., both extend their top edges), the finger joint tabs at their shared corner clash in the extended region.

### Steps to Reproduce

1. Create a box (e.g., 100 x 80 x 60)
2. Select the front panel and extend the top edge by 20mm
3. Select the right panel and extend the top edge by 20mm
4. Observe the corner where front and right panels meet

### Expected Behavior

Either:
- The system should prevent applying conflicting extensions
- Or the geometry should be adjusted so panels don't overlap (e.g., one panel's extension should stop at the corner, or the finger joints should not continue into the extended region)

### Actual Behavior

Both panels extend upward with their full finger joint patterns continuing into the extended region. The finger tabs from the front panel (on its right edge) and the finger tabs from the right panel (on its left edge) both occupy the same corner space, causing:

1. Visual artifacts (Z-fighting) in the 3D view
2. Invalid geometry that cannot be laser cut - two pieces of material trying to occupy the same space

### Visual Evidence

When viewing isolated panels:
- Front panel: extends upward, right edge has finger tabs protruding in +X direction
- Right panel: extends upward, left edge has finger tabs protruding in +Z direction (after rotation)
- At the corner above the original box, both sets of tabs occupy the same volume

## Technical Analysis

The issue occurs because:
1. Edge extensions grow the panel outline in one direction
2. The finger joint pattern on perpendicular edges continues into the extended region
3. When two adjacent panels both extend the same edge, their perpendicular finger joints overlap at the corner

The overlap region is approximately:
- Width: material thickness (3mm)
- Height: extension amount (e.g., 20mm)
- Depth: material thickness (3mm)

## Recommended Fixes

### Option A: Prevent Conflicting Extensions (UI-level)
Add validation to prevent users from applying extensions to adjacent panels on the same edge. Show a warning explaining why this combination is not allowed.

### Option B: Adjust Finger Joint Generation
When a panel has an edge extension AND the perpendicular edge has finger joints:
- Stop the finger joint pattern at the original panel boundary
- The extended region should have a straight edge (no finger joints)

### Option C: Corner Priority System
Implement a corner ownership rule (similar to existing gender rules):
- One panel "owns" the corner and extends fully
- The adjacent panel's extension stops at the corner (shortened by material thickness)

### Option D: Mitered Corner Extensions
For extended regions, generate a 45-degree miter joint at corners instead of trying to continue finger joints.

## Affected Code

- `src/engine/nodes/FacePanelNode.ts` - finger joint generation
- `src/engine/nodes/BasePanel.ts` - outline generation with extensions
- `src/utils/fingerJoints.ts` - finger pattern calculation

## Existing Corner Ownership Logic

**Note:** Corner ownership rules already exist but aren't being applied correctly:

- `src/utils/axisOwnership.ts` - Contains the full logic for determining which panel "wins" at overlapping corners:
  - `getOverlapLoser()` - Determines which face should give way (lines 355-387)
  - `calculateOverlapNotch()` - Calculates the notch depth/length needed (lines 393-414)
  - `getCornerOverlapInfo()` - Gets overlap info for panel corners (lines 432-467)

The `edge-extensions:corner-ownership` rule in `EdgeExtensionChecker.ts` already validates this but only as a warning. The actual geometry generation needs to use these functions to adjust panel outlines.

## Detection

The 3D Overlap Validator (`src/engine/validators/OverlapChecker.ts`) now detects this issue via the `overlap:conflicting-extensions` rule. Integration tests in `tests/integration/geometry/edgeExtensionOverlap.test.ts` verify detection.

## Related Files

- `tests/integration/geometry/edgeExtensionOverlap.test.ts` - tests that reproduce and detect this issue
  - Includes a **skipped test** that will pass once the fix is implemented
- `src/engine/validators/OverlapChecker.ts` - validator that catches the issue
- `src/utils/axisOwnership.ts` - existing corner ownership logic (not currently applied)
- `src/engine/validators/EdgeExtensionChecker.ts` - has `corner-ownership` rule (warning only)
