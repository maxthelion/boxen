# Acceptance Criteria for Finger Joint System Refactor

This document lists all functionality that must work after the refactor. Each item should be verifiable.

---

## 1. Box Configuration

- [ ] Set width, height, depth (min 1mm each)
- [ ] Set material thickness (min 0.1mm)
- [ ] Set finger width (min 1mm)
- [ ] Set corner gap multiplier (0-5x) → becomes `minDistance` in new system
- [ ] Changes trigger panel regeneration

## 2. Face Operations

- [ ] Toggle each of 6 faces between solid/open
- [ ] Open faces show different visual indicator
- [ ] Open faces disable subdivision on perpendicular axis
- [ ] Open faces affect sub-assembly positioning
- [ ] Face grid shows solid/open status

## 3. Assembly Configuration

- [ ] Select assembly axis (X, Y, Z)
- [ ] Axis determines which faces are "lids"
- [ ] Configure lid tab direction per lid (tabs-out / tabs-in)
- [ ] Configure lid inset per lid (mm)
- [ ] Tabs-in disabled when inset > 0
- [ ] Inset > 0 forces tabs-out

## 4. Finger Joint Rendering

- [ ] Finger joints render on edges between solid faces
- [ ] Tabs (male) protrude by material thickness
- [ ] Slots (female) indent by material thickness
- [ ] Mating edges have opposite gender (tabs meet slots)
- [ ] Finger positions align perfectly on mating edges
- [ ] Pattern is symmetric (starts and ends with tab)
- [ ] Corner gap from bounding box edge to first finger
- [ ] Fingers evenly distributed along edge

## 5. Gender Assignment

- [ ] Lids have consistent gender (both male or both female)
- [ ] Side panels have opposite gender on lid-meeting edges
- [ ] Wall-to-wall edges use priority system
- [ ] Dividers are always male

## 6. Subdivisions

- [ ] Create X-axis divisions (disabled if left/right open)
- [ ] Create Y-axis divisions (disabled if top/bottom open)
- [ ] Create Z-axis divisions (disabled if front/back open)
- [ ] Preview divisions before confirming
- [ ] Adjust number of divisions (1-20)
- [ ] Dividers distribute evenly
- [ ] Remove individual subdivisions
- [ ] Purge all subdivisions from a void

## 7. Divider Panels

- [ ] Divider panels generate with correct dimensions
- [ ] Dividers have finger joints on edges meeting outer panels
- [ ] Divider tabs align with slots in outer panels
- [ ] Divider position adjustable via slider/input
- [ ] Position constrained to valid range (no overlap)

## 8. Intersecting Dividers

- [ ] Cross-joints generated where dividers intersect
- [ ] Vertical cuts allow panels to slot together
- [ ] Cut width matches material thickness

## 9. Sub-Assemblies

- [ ] Create sub-assembly within selected void
- [ ] Configure clearance from void walls
- [ ] Configure assembly axis
- [ ] Configure face offsets (when parent has open faces)
- [ ] Sub-assembly has own 6 faces (toggleable)
- [ ] Sub-assembly has own assembly configuration
- [ ] Sub-assembly generates own finger points (not inherited)
- [ ] Remove sub-assembly from void

## 10. Inset Panels

- [ ] Inset lids position correctly (inside box)
- [ ] Finger joints only on valid range (intersection of both edges)
- [ ] Joints skip finger points outside shorter panel's range

## 11. Edge Extensions

- [ ] Extend unlocked edges (no finger joints) outward/inward
- [ ] Locked edges (with joints) show as non-extendable
- [ ] Extensions preserved across panel regeneration
- [ ] Visual preview of edge extension values
- [ ] Extensions apply to divider panels

## 12. Panel Selection & Properties

- [ ] Click panel to select
- [ ] Shift+click for multi-select
- [ ] Selection mode filters (assembly/void/panel)
- [ ] Selected panel shows properties in sidebar
- [ ] Hover highlights panel in 3D and tree

## 13. Visibility & Isolation

- [ ] Hide/show individual panels
- [ ] Hide/show voids
- [ ] Isolate feature (show only selected + descendants)
- [ ] Un-isolate restores previous visibility

## 14. Tree Navigation

- [ ] Hierarchical void tree display
- [ ] Face panels listed under assembly
- [ ] Divider panels listed
- [ ] Sub-assemblies shown with indicator
- [ ] Click to select, hover to highlight
- [ ] Eye icon toggles visibility
- [ ] Delete button for removable items

## 15. Export

- [ ] Export individual face as SVG
- [ ] Export individual divider as SVG
- [ ] Export all pieces as combined SVG
- [ ] Configure bed size (presets + custom)
- [ ] Configure gap between pieces
- [ ] Allow rotation option
- [ ] Show labels option
- [ ] Separate files per bed option
- [ ] Kerf compensation applied

## 16. Project Management

- [ ] Save project to local storage with name
- [ ] Thumbnail captured on save
- [ ] Load project from browser
- [ ] Share via URL (encodes full state)
- [ ] Load from URL on startup
- [ ] New project resets to defaults

## 17. 3D Visualization

- [ ] Panels render in correct 3D positions
- [ ] Finger joints visible on panel edges
- [ ] Orbit/zoom/pan controls work
- [ ] Selection highlighting
- [ ] Hover highlighting
- [ ] Debug anchor spheres toggle

## 18. Real-time Updates

- [ ] Parameter changes update preview
- [ ] Divider position slider updates live
- [ ] Subdivision preview shows before confirm
- [ ] Sub-assembly preview shows bounds

---

## Performance Criteria

- [ ] Panel generation completes in < 500ms for typical box
- [ ] No visible lag when adjusting sliders
- [ ] 3D rendering maintains 30+ fps

## Edge Cases

- [ ] Very small boxes (10mm) generate correctly
- [ ] Very large boxes (1000mm+) generate correctly
- [ ] Single finger fits when edge is small
- [ ] Zero fingers (straight edge) when too small
- [ ] All 6 faces open = just void, no panels
- [ ] Sub-assembly with all faces open
- [ ] Dividers meeting open faces (straight edge)
