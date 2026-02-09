# Panel Push/Pull Tool

## Status: COMPLETE

Move face panels along their perpendicular axis, with options for how this affects the assembly's bounding box.

---

## Core Concept

An assembly has **box boundaries** that determine where its 6 outer faces sit. When a face panel is pushed or pulled along its perpendicular axis, there are two fundamentally different behaviors:

1. **Change Bounding Box** - The assembly resizes (scale mode)
2. **Keep Bounding Box** - The panel offsets from its nominal position (adjust mode)

---

## Mode A: Change Bounding Box (Scale)

When movement changes the bounding box:

```typescript
interface BoundingBoxChange {
  axis: 'x' | 'y' | 'z'
  side: 'positive' | 'negative'  // Which end of the axis
  delta: number                   // Amount to move (positive = outward)
}
```

### Effects:
- Adjacent panels grow/shrink to match the new bounding box
- Box center shifts by `delta / 2`
- Percentage-based subdivisions recalculate their absolute positions
- Sub-assemblies in affected voids resize proportionally

---

## Mode B: Keep Bounding Box (Adjust/Offset)

When movement keeps the bounding box fixed:

### Outward Movement:
- Panel offsets out from its bounding plane
- Adjacent panels extend their edges to meet the offset panel
- Creates an "extruded" or "stepped" appearance

### Inward Movement:
- Adjacent panels also move inward
- Their edges on that side get shortened/inset
- Maintains the box shape but smaller on that face

---

## UI

### Tool Activation:
1. Select a face panel (front, back, left, right, top, or bottom)
2. Activate Push/Pull tool from EditorToolbar
3. FloatingPalette appears with options

### FloatingPalette Controls:
```
┌─────────────────────────────┐
│ Push/Pull            [×]    │
├─────────────────────────────┤
│ Distance: [====●===] 10mm   │
│           [  10.0  ] mm     │
│                             │
│ ○ Scale (resize box)        │
│ ● Adjust (offset panel)     │
│                             │
│ [Apply]  [Cancel]           │
└─────────────────────────────┘
```

### Interactive Dragging:
- Click and drag the push-pull arrow in 3D view
- Live preview shows the result
- Snap to grid increments

---

## Implementation

- Operation system integration with preview state
- Engine handles dimension changes via dispatch
- Edge extensions for adjacent panels (adjust mode)
- Camera remains stable during operations (fixed orbit target)

---

## Completed: January 2026
