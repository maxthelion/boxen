# Geometry Rules

Quick reference for geometry constraints. Full documentation in `docs/geometry rules/geometry-rules.md`.

## Core Rules

### Assembly Bounding Box
- Assembly has 6 planes defining outer faces
- Face panels can extend beyond bounding box (feet, inset/outset)
- **Finger joints stay anchored to bounding box** even when panels extend

### Void Dimensions
- Root void = assembly - 2×MT on each axis
- Void boundary = face panel inner surface
- Child voids fit within parent bounds

### Panel Dimensions
- Face panel body = assembly dimension on its plane
- Divider body = void + MT on each side (to reach face inner surfaces)
- **Divider finger region must equal face finger region** (both = maxJoint)

### Finger Joint Alignment
- All panels on same axis use identical finger points (from assembly)
- maxJointLength = axis dimension - 2×MT
- Minimum 3 sections required (finger-hole-finger)
- **Tab positions on dividers must match slot positions on faces**

### Divider-to-Face Mating
- Divider tabs extend through face slots to assembly boundary
- Face slots cut MT deep into face panel
- Slot positions determined by shared finger points

## Common Bugs

### Divider Finger Region Mismatch
**Symptom**: Divider tabs don't align with face slots
**Cause**: Divider body sized to void (correct), but corner insets reduce finger region further
**Fix**: Divider body must be void + 2×MT so finger region equals maxJoint after corner insets

## Testing

Run comprehensive geometry tests:
```bash
npm run test:run -- src/engine/integration/comprehensiveGeometry.test.ts
```

The validator checks:
- `global-3d:*` - 3D positions
- `dimensions:*` - Relative sizes
- `joints:*` - Joint alignment
- `fingers:*` - Finger point usage
- `intersections:*` - Parent/child slots
- `path:*` - 2D path validity
