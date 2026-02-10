# Shape Drawing & Clipboard Features

**Source:** inbox/IMG_8247.jpeg
**Created:** 2026-02-03
**Category:** Features

## Summary

Feature requests for improving shape/cutout workflow and adding copy-paste functionality.

## Items

### Cutout Panel UX
- When a shape is drawn and cutout panel appears, allow moving it before applying
- Improves placement accuracy before committing

### Copy & Paste Features
- Allow copying and pasting features between panels
- Examples of features to copy:
  - Custom edge modifications
  - Cutouts
  - Extensions

### Copy/Paste Constraints
- Allowed between panels on same axis around central axis (front, left, right, back)
- Allowed between top and bottom panels
- Must also match openness (open/closed state)

### Clip Mask System
- Allow clip mask creation for constraining drawing areas
- Allow bitmap import in clip mask
- Default clip mask = safe areas (areas where drawing is allowed)
- Maximum clip mask = panel face (full panel boundary)

### Fillet Corners
- Allow filleting all corners that are eligible
- Batch operation to round multiple corners at once
