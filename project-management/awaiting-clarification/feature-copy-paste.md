# Feature Copy/Paste Between Panels

**Status:** Awaiting Clarification
**Source:** IMG_8247.jpeg
**Related Docs:** `docs/2d-sketch-plan.md` (Phase 9.5 - brief mention)

## Summary

Allow copying and pasting features between panels:
- Examples: custom edge modifications, cutouts, extensions
- Allowed between panels on same axis (front ↔ left ↔ right ↔ back)
- Allowed between top ↔ bottom
- Must match "openness" (open/closed state)

## Existing Coverage

`docs/2d-sketch-plan.md` Phase 9.5 mentions:
- Copy modifications from Panel A to Panel B
- Option to mirror when copying to opposite panel

But lacks detail on **what exactly can be copied** and **compatibility rules**.

## Questions

1. **What features are copyable?**
   - [ ] Edge extensions (inset/outset amounts)
   - [ ] Custom edge paths (notches, tabs)
   - [ ] Cutouts (holes)
   - [ ] Corner fillets
   - [ ] All of the above

2. **Compatibility rules - "same axis"**: The note mentions front/left/right/back.
   - Does this mean panels that share the same orientation (all vertical walls)?
   - Or panels that share an actual edge (front & left meet at a corner)?

3. **"Must match openness"**: What does this mean?
   - [ ] Both panels must be solid (not removed/open face)
   - [ ] The edge being copied must have the same joint status (male/female/open)
   - [ ] Something else?

4. **Size differences**: If source panel is 100mm wide and target is 80mm wide:
   - [ ] Scale features proportionally
   - [ ] Keep absolute positions (may clip)
   - [ ] Keep positions relative to center
   - [ ] Ask user which approach

5. **UX for copy/paste**:
   - [ ] Select panel → Ctrl+C → select other panel → Ctrl+V
   - [ ] Right-click menu: "Copy features" / "Paste features"
   - [ ] Dedicated tool: "Transfer features" with source/target picker
   - [ ] Checkbox in panel properties: "Sync with panel X"

6. **What about conflicts?** If target panel already has features:
   - [ ] Replace all
   - [ ] Merge (add new, keep existing)
   - [ ] Ask user

## Ready to Implement After

Clarification on compatibility rules and handling of size differences.
