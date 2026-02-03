# 2D View Snapping System

**Status:** Awaiting Clarification
**Source:** IMG_8246.jpeg
**Related Docs:** `docs/2d-sketch-plan.md` (Phase 9.7 - brief mention)

## Summary

Enhanced snapping in 2D view:
- Snap to center line of panel
- Snap to edge lines
- Extend lines and snap points to them
- Goal: Make it easy to draw a central circle (or other centered shapes)

## Existing Coverage

`docs/2d-sketch-plan.md` Phase 9.7 mentions:
- Grid snapping (configurable size)
- Snap to other geometry (edges, corners, center points)

But lacks detail on **construction lines** and **line extension**.

## Questions

1. **Center line display**: How should center lines be shown?
   - [ ] Always visible when drawing
   - [ ] Only on hover/near cursor
   - [ ] Toggle on/off in toolbar
   - [ ] Keyboard shortcut to show temporarily

2. **Edge line extension**: When drawing, should edge lines extend as guides?
   - [ ] Yes, extend infinitely (or to canvas bounds)
   - [ ] Yes, extend a fixed distance (e.g., 2x panel size)
   - [ ] Only when cursor is near the line's trajectory
   - [ ] Manual: click edge to create construction line

3. **Snap point visualization**: How to show where snapping will occur?
   - [ ] Crosshair at snap points
   - [ ] Small circles/dots at snap points
   - [ ] Highlight the line/point being snapped to
   - [ ] All of the above

4. **Snap priority**: When multiple snap points are nearby, which wins?
   - [ ] Closest to cursor
   - [ ] Priority order (center > edge > grid)
   - [ ] Show all options, let user choose
   - [ ] Modifier key to cycle through options

5. **Construction lines**: Should users be able to create persistent construction lines?
   - [ ] Yes, draw lines that persist during session
   - [ ] No, just automatic extension of existing edges
   - [ ] Yes, and they can be saved with the project

## Ready to Implement After

Answers to questions above.
