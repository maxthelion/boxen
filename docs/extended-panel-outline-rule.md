# Geometry Rule: Extended Panel Outline

## Rule

**A panel with extended edges must have a simple rectangular outline.**

The outer boundary of any panel (ignoring internal holes like slots) should be defined by 4 straight lines connecting 4 corners. This applies regardless of how many edges are extended or by how much.

---

## Problem

When a panel has multiple edges extended (e.g., bottom panel with all 4 edges outset), the outline is not a clean rectangle. The edges have irregularities or steps instead of being straight lines.

**Current (incorrect):**
```
    ┌──┐      ┌──┐
    │  └──────┘  │
    │            │
┌───┘            └───┐
│                    │
└───┐            ┌───┘
    │            │
    │  ┌──────┐  │
    └──┘      └──┘
```

**Expected (correct):**
```
┌────────────────────┐
│                    │
│                    │
│                    │
│                    │
│                    │
│                    │
│                    │
└────────────────────┘
```

---

## Adjacent Extended Edges

When two neighboring edges of the same panel are both extended, their boundary lines must converge at a single corner point.

**Example:** Bottom panel with front edge extended 10mm and left edge extended 15mm:

```
Corner where extensions meet:

         15mm
    ◄───────────►

    ┌────────────...
    │
    │
▲   │   ┌─ original panel boundary
│   │   │
10mm│   │
│   │   │
▼   │   │
    │   │
```

The corner of the extended panel is at the intersection of the two extended edge lines - NOT a stepped or notched shape.

---

## Why This Matters

1. **Laser cutting:** A clean rectangular outline cuts faster and cleaner than a complex path with many direction changes

2. **Assembly:** Straight edges sit flush against other surfaces

3. **Aesthetics:** The extended base should look intentional and clean, not like a geometry error

4. **Structural:** No weak points from unnecessary notches or thin sections

---

## Implementation

The panel outline generation should:

1. Calculate the 4 corner positions based on all edge extensions
2. Connect corners with straight lines
3. Internal features (slots, finger joints) are separate holes, not part of the outline

```typescript
function computeExtendedPanelOutline(
  baseWidth: number,
  baseHeight: number,
  extensions: { top: number; bottom: number; left: number; right: number }
): Point2D[] {
  // Total dimensions including extensions
  const totalWidth = baseWidth + extensions.left + extensions.right;
  const totalHeight = baseHeight + extensions.top + extensions.bottom;

  // Origin offset for extensions
  const originX = -extensions.left;
  const originY = -extensions.bottom;

  // Simple rectangle - 4 corners, 4 straight edges
  return [
    { x: originX, y: originY },                           // bottom-left
    { x: originX + totalWidth, y: originY },              // bottom-right
    { x: originX + totalWidth, y: originY + totalHeight }, // top-right
    { x: originX, y: originY + totalHeight },             // top-left
  ];
}
```

---

## Validation

Add to ComprehensiveValidator:

```typescript
// Rule: extended-panel:rectangular-outline
// Panel outline (excluding holes) should be a simple rectangle

private validateExtendedPanelOutline(panel: PanelSnapshot): void {
  const outline = panel.derived.outline.points;

  // A simple rectangle has exactly 4 points
  if (outline.length !== 4) {
    this.addError('extended-panel:rectangular-outline',
      `Panel outline has ${outline.length} points, expected 4`,
      { panelId: panel.id }
    );
    return;
  }

  // All angles should be 90 degrees
  // All edges should be axis-aligned (horizontal or vertical)
  for (let i = 0; i < 4; i++) {
    const curr = outline[i];
    const next = outline[(i + 1) % 4];

    const isHorizontal = Math.abs(curr.y - next.y) < TOLERANCE;
    const isVertical = Math.abs(curr.x - next.x) < TOLERANCE;

    if (!isHorizontal && !isVertical) {
      this.addError('extended-panel:rectangular-outline',
        `Panel edge ${i} is not axis-aligned`,
        { panelId: panel.id, from: curr, to: next }
      );
    }
  }
}
```

---

## Related

- `docs/corner-extension-rule-plan.md` - How corners are handled when adjacent panels both extend
- `docs/extended-female-edge-slots-rule.md` - Slot positioning on extended edges
