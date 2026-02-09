# Subdivision Features

## Status: COMPLETE

Features for enhanced subdivision behavior in box assemblies.

---

## Two-Plane Subdivision (Phase 3)

### Multi-Panel Selection Detection

When exactly 2 panels are selected:
1. Check if they share a common void (are both faces of the same void)
2. If void has no existing subdivisions → show subdivision option

### Axis Determination

The subdivision axes available are:
- The two axes perpendicular to both selected panels
- NOT the axis parallel to the panels

**Example:** If front and back panels selected (both in XY plane):
- Can subdivide along X (left-right) or Y (top-bottom)
- Cannot subdivide along Z (would be parallel to panels)

### Implementation

- `SubdividePalette.tsx` detects when 2 panels are selected
- Shows simplified subdivision UI with constrained axis options
- "Subdivide between selected panels" button

---

## Percentage-Based Subdivisions (Phase 4)

### Subdivision Model

```typescript
interface Subdivision {
  id: string
  position: number           // Absolute position
  positionMode: 'absolute' | 'percentage'
  percentagePosition?: number  // 0.0 to 1.0
}
```

### Position Calculation

When `positionMode === 'percentage'`:
```typescript
const absolutePosition = voidStart + (voidLength * percentagePosition)
```

### Dimension Change Handling

When box dimensions change:
1. Percentage subdivisions recalculate their absolute positions
2. Absolute subdivisions stay fixed (may become invalid if outside bounds)

### UI

- Toggle in SubdivisionControls: "Lock position" vs "Scale with dimensions"
- Default: percentage mode for new subdivisions

---

## Completed: January 2026
