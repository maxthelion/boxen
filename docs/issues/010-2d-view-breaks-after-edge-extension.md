# Issue 010: 2D View Breaks After Edge Extension

**Date Reported:** 2026-02-04
**Status:** Open
**Branch:** main

## Description

Pressing Tab to switch to 2D view fails after applying an edge extension operation. The 2D view either doesn't render or throws an error.

## Steps to Reproduce

1. Open a box in 3D view
2. Select a panel
3. Apply an edge extension (inset/outset or push-pull that extends an edge)
4. Press Tab to switch to 2D view
5. **Result:** 2D view breaks / doesn't render correctly

## Expected Behavior

2D view should render the panel with the extended edge geometry.

## Actual Behavior

2D view fails to render or throws an error.

## Technical Notes

This may be related to:
- Edge extension geometry not being properly handled by 2D renderer
- Panel outline changes from extension not compatible with 2D view expectations
- Path validation failing on extended edge geometry

## Priority

P2 - Affects workflow but has workaround (reload)

## Related

- This is independent of fillet work
- Should be fixed on `main` branch
