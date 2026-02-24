# Assembly Feet

## Status: COMPLETE

Add feet that extrude from bottom corners of side panels.

---

## Feet Configuration

```typescript
interface FeetConfig {
  enabled: boolean
  height: number           // How far feet extend down (mm)
  width: number            // Width of each foot along the panel edge (mm)
  slopeAngle: number       // Angle of inner edge slope (degrees, e.g., 45°)
  cornerFinish?: {
    type: 'none' | 'chamfer' | 'fillet'
    radius: number         // Size of chamfer/fillet on outer corner
  }
}

// Added to AssemblyConfig
feet?: FeetConfig
```

---

## Feet Geometry

Each foot is a **corner extension** on side panels (front, back, left, right):

```
    Panel Edge
    ══════════════════════════════
    │                            │
    │      Main Panel            │
    │                            │
    ══════════════════════════════
   ╱│                            │╲
  ╱ │                            │ ╲  ← Sloped inner edge
 │  │                            │  │
 └──┘                            └──┘
  ↑                                ↑
 Foot                            Foot
(corner extension)          (corner extension)
```

### Foot Shape (per corner):
1. Rectangular base extending down from corner
2. Inner edge slopes toward panel center (configurable angle)
3. Optional chamfer/fillet on the outer corner point

---

## Feet Generation

When feet enabled:
1. Bottom face remains as configured (solid/open)
2. Each side panel (front, back, left, right) gets **two feet** - one at each bottom corner
3. Feet are added as path modifications to existing panels

---

## Slope Calculation

The inner edge slopes toward the panel center:
```typescript
const slopeOffset = footHeight * Math.tan(slopeAngle * Math.PI / 180)
```

- At 45°: slopeOffset = footHeight (1:1 slope)
- At 60°: slopeOffset ≈ footHeight * 1.73 (steeper)
- At 30°: slopeOffset ≈ footHeight * 0.58 (shallower)

---

## UI

- Feet configuration in Assembly Properties panel
- Only shown when assembly axis is 'y' (top-down orientation)
- Sliders for height, width, slope angle
- Optional corner finish with radius

---

## Completed: January 2026
