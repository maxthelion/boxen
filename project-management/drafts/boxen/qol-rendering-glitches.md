# QoL: Rendering Glitches - Edges Too Close

**Source:** Handwritten notes (IMG_8245)
**Category:** Quality of Life / Rendering
**Created:** 2026-02-03

## Summary

Fix z-fighting/rendering glitches when edges are too close together in the 3D view.

## Questions

### 1. Which situations cause the glitches?

- [ ] Panel edges meeting at corners
- [ ] Divider panels intersecting face panels
- [ ] Finger joint tabs overlapping
- [ ] All of the above
- [ ] Other (please describe)

### 2. Preferred fix approach?

- [ ] Add small offset to prevent coplanar surfaces
- [ ] Use polygon offset in shader
- [ ] Render order management
- [ ] Whatever works best technically

### 3. Priority level?

- [ ] High - very distracting
- [ ] Medium - noticeable but not blocking
- [ ] Low - minor visual issue
