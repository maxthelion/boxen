# Clip Mask System

**Status:** Awaiting Clarification
**Source:** IMG_8247.jpeg
**Related Docs:** None (new feature)

## Summary

Allow clip mask creation for constraining drawing areas:
- Allow bitmap import in clip mask
- Default clip mask = safe areas (where drawing is allowed)
- Maximum clip mask = panel face (full panel boundary)

## Questions

1. **What is the purpose of clip masks?**
   - [ ] Constrain where user can draw (can't draw outside mask)
   - [ ] Visual guide only (shows where drawing is "safe")
   - [ ] Defines area for engraving/etching (not cutting)
   - [ ] Something else?

2. **Bitmap import - what's the use case?**
   - [ ] Trace a design from an imported image
   - [ ] Use bitmap as engraving content (raster engraving)
   - [ ] Define complex mask shapes from images
   - [ ] Reference image to draw over

3. **"Default clip mask = safe areas"**: Is this different from the existing green "editable areas"?
   - [ ] Same thing, just giving it a name
   - [ ] Different - clip mask is user-definable, editable areas are computed
   - [ ] Clip mask can be smaller than editable area (user restriction)

4. **Clip mask shapes**:
   - [ ] Only rectangles
   - [ ] Any polygon (drawn by user)
   - [ ] Imported from SVG
   - [ ] Derived from bitmap (trace edges)

5. **Multiple clip masks per panel?**
   - [ ] Yes, can have multiple regions
   - [ ] No, one mask defines the entire drawable area

6. **Interaction with existing features**:
   - Does the clip mask affect where cutouts can be placed?
   - Does it affect edge modifications?
   - Is it purely for engraving/visual content?

7. **Bitmap handling**:
   - [ ] Embed bitmap in project file
   - [ ] Link to external file
   - [ ] Convert to vectors on import
   - [ ] Keep as raster for laser engraving

## Ready to Implement After

Clarification on the core use case and whether this is about cutting constraints vs. engraving.
