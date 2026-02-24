# Edge Mirroring / Symmetry Tool

**Status:** Awaiting Clarification
**Source:** IMG_8246.jpeg
**Related Docs:** `docs/2d-sketch-plan.md` (Phase 5.4 Mirror Mode)

## Summary

When altering an edge path, add an option to mirror changes:
- Any points drawn on one edge are duplicated and applied on the other side
- Diagram shows: points A and B on left edge mirrored to A' and B' on right edge

## Existing Coverage

`docs/2d-sketch-plan.md` Phase 5.4 defines:
- Mirror modes: none, horizontal, vertical, both
- Dashed center lines shown when active
- Ghost preview of mirrored shape while drawing
- Both shapes applied in single boolean operation

## Questions

1. **"Other side" meaning**: The note says "mirror to other side" - does this mean:
   - [ ] Mirror across the panel's center axis (left edge → right edge)
   - [ ] Mirror to the **opposite panel** (front panel → back panel)
   - [ ] Both options available

2. **Edge path vs. panel content**: What should be mirrored?
   - [ ] Edge modifications only (notches, tabs drawn on edge)
   - [ ] Interior cutouts as well
   - [ ] Everything (edges + cutouts + fillets)

3. **UX for mirroring to opposite panel**: If mirroring to back panel:
   - [ ] Automatic (changes to front always go to back)
   - [ ] Manual (select both panels, then draw once)
   - [ ] Prompt after drawing: "Apply to opposite panel too?"

4. **What if the opposite panel is different?**
   - Different size (due to different extensions)?
   - Different joint configuration?
   - Should mirroring be blocked, or scaled/adjusted?

5. **Live vs. after-the-fact**:
   - [ ] Live mirroring (see changes as you draw)
   - [ ] Post-hoc (draw on one, then "mirror to other" command)
   - [ ] Both

## Ready to Implement After

Clarification on scope (same panel vs. opposite panel) and UX flow.
