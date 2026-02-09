# Subdivision Enhancements Plan

Improvements to the subdivision system: two-plane subdivision and percentage-based positioning.

## Status

| Feature | Status |
|---------|--------|
| Two-Plane Subdivision | Complete |
| Percentage-Based Subdivisions | Complete |

---

## Two-Plane Subdivision

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

### UI Changes

**SubdivisionControls.tsx:**
- Detect when 2 panels selected
- Show simplified subdivision UI with constrained axis options
- "Subdivide between selected panels" button

---

## Percentage-Based Subdivisions

### New Subdivision Model

```typescript
interface Subdivision {
  id: string
  // Current: absolute position
  position: number

  // New: percentage-based (optional)
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

### UI Toggle

- Add toggle in SubdivisionControls: "Lock position" vs "Scale with dimensions"
- Default: percentage mode for new subdivisions

---

## Verification

### Two-Plane Subdivision
1. Select front + back panels (Shift+click)
2. "Subdivide" option appears
3. Only X and Y axis options shown (not Z)
4. Create subdivision → divider appears

### Percentage Subdivisions
1. Create subdivision with "Scale with dimensions" enabled
2. Change box width → subdivision moves proportionally
3. Toggle to "Lock position" → subdivision stays fixed
