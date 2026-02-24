# 2D View Legend & Visual Polish

**Status:** Awaiting Clarification
**Source:** IMG_8246.jpeg
**Related Docs:** `docs/2d-sketch-plan.md` (Phase 1-2)

## Summary

Visual improvements to the 2D panel editing view:
- Show mechanical joints and forbidden areas in a legend
- Use thinner lines for better clarity

## Existing Coverage

`docs/2d-sketch-plan.md` already defines:
- Color coding: Blue (generated edges), Orange (editable), Dashed gray (joints), Green tint (editable areas)
- But no explicit **legend component** showing what each color means

## Questions

1. **Legend placement**: Where should the legend appear?
   - [ ] Fixed position in corner (like map legends)
   - [ ] Collapsible panel in sidebar
   - [ ] Tooltip on hover over elements
   - [ ] Other: ___

2. **"Forbidden areas"**: What exactly should be shown as forbidden?
   - [ ] Joint margins (MT inset from jointed edges)
   - [ ] Slot regions (where other panels intersect)
   - [ ] Areas that would create invalid geometry
   - [ ] All of the above?

3. **Line weight customization**: Should users be able to adjust line weights, or just use better defaults?
   - [ ] Just improve defaults (thinner overall)
   - [ ] Add a line weight preference setting
   - [ ] Different weights based on zoom level

4. **What's currently too thick?**
   - Panel outlines?
   - Joint pattern lines?
   - Grid lines?
   - All of the above?

## Ready to Implement After

Answers to questions above.
