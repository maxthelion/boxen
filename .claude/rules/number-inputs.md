---
paths:
  - "src/components/**/*.tsx"
---

# Number Input Rules

## Component Usage

All numeric inputs MUST use the `NumberInput` component from `src/components/UI/NumberInput.tsx`.

For palette forms, use `PaletteNumberInput` from `FloatingPalette.tsx` which wraps `NumberInput` with a label.

## Step Values by Category

| Category | Step | Examples |
|----------|------|----------|
| **Dimensions (mm)** | 10 | Width, Height, Depth, Feet Height, Feet Width |
| **Material (mm)** | 0.5 | Material Thickness, Clearance |
| **Finger Joints (mm)** | 1 | Finger Width, Inset |
| **Fractions** | 0.1 | Corner Gap multiplier |
| **Counts** | 1 | Compartments, divisions |
| **Movement (mm)** | 1 | Push/Pull offset, Move delta |

## Example Usage

```tsx
// Dimension field (step=10)
<NumberInput
  value={width}
  onChange={setWidth}
  min={10}
  step={10}
  unit="mm"
/>

// Material field (step=0.5)
<NumberInput
  value={thickness}
  onChange={setThickness}
  min={0.5}
  max={20}
  step={0.5}
  unit="mm"
/>

// In palettes with label
<PaletteNumberInput
  label="Width"
  value={width}
  onChange={setWidth}
  min={10}
  step={10}
  unit="mm"
/>
```

## Button Behavior

- All number inputs show +/- buttons by default
- Buttons are disabled at min/max bounds
- Use `showButtons={false}` only for inline/compact layouts
