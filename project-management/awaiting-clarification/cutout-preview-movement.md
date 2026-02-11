# Cutout Preview Movement

**Status:** Awaiting Clarification
**Source:** IMG_8247.jpeg
**Related Docs:** `docs/freeform-polygon-tool-plan.md` (partial)

## Summary

When a shape is drawn and the cutout panel appears, allow moving it before applying.

Currently: Draw shape → immediately applied (or palette appears for boolean choice)
Desired: Draw shape → can reposition → then apply

## Questions

1. **What triggers "movement mode"?**
   - [ ] Automatically after drawing any shape
   - [ ] Button in the boolean palette: "Move" / "Reposition"
   - [ ] Drag handle appears on the shape preview

2. **Movement constraints**:
   - [ ] Free movement anywhere on panel
   - [ ] Constrained to editable areas (green zones)
   - [ ] Snap to grid/center lines during move

3. **What can be adjusted during preview?**
   - [ ] Position only
   - [ ] Position + rotation
   - [ ] Position + scale
   - [ ] All of the above

4. **Multiple shapes**: If user draws multiple shapes before applying:
   - [ ] Each shape can be moved independently
   - [ ] All shapes move together as a group
   - [ ] Not supported (one shape at a time)

5. **Preview visualization**:
   - [ ] Ghost outline (dashed)
   - [ ] Semi-transparent fill
   - [ ] Shows how panel will look after applying

## Ready to Implement After

Decision on movement constraints and what's adjustable.
