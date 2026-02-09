# Color System Plan

## Current State

Colors are scattered across multiple component files as hardcoded hex values or local constants:

| File | Color Constants |
|------|-----------------|
| `PanelPathRenderer.tsx` | Panel fill/edge colors (inline) |
| `PanelEdgeRenderer.tsx` | `EDGE_COLORS` object |
| `PanelCornerRenderer.tsx` | `CORNER_COLORS` object |
| `VoidMesh.tsx` | Void colors (inline) |
| `PushPullArrow.tsx` | Arrow colors (inline) |
| `AssemblyAxisIndicator.tsx` | `AXIS_COLORS` object |
| `SketchView2D.tsx` | 2D view colors (inline) |
| `InsetPalette.tsx` | Edge status colors (inline) |
| `FilletPalette.tsx` | Corner status colors (inline) |

## Problems

1. **Inconsistency**: Same semantic meaning uses different colors (e.g., "selected" is purple in some places, blue in others)
2. **Hard to customize**: No central place to adjust the theme
3. **Duplication**: Same colors repeated across files
4. **No dark/light mode support**: Colors are fixed

---

## Proposed Config Structure

### File: `src/config/colors.ts`

```typescript
/**
 * Centralized color configuration for the application.
 * All selection, hover, and highlight colors should be defined here.
 */

export interface StateColors {
  base: string;
  hover: string;
}

export interface ColorConfig {
  // ===== Selection States =====
  selection: {
    primary: StateColors;      // Main selection color (purple)
    secondary: StateColors;    // Alternate selection (blue)
  };

  // ===== Interactive States =====
  interactive: {
    hover: StateColors;        // General hover feedback (green)
    active: StateColors;       // Active/pressed state
    disabled: StateColors;     // Disabled/locked state (gray)
  };

  // ===== Edge Status (Inset/Outset Tool) =====
  edge: {
    locked: StateColors;       // Has finger joints, non-interactive
    unlocked: StateColors;     // Open edge, can extend freely
    outwardOnly: StateColors;  // Female joint, outward extension only
    selected: StateColors;     // Currently selected edge
  };

  // ===== Corner Status (Fillet Tool) =====
  corner: {
    eligible: StateColors;     // Can be filleted
    ineligible: StateColors;   // Cannot be filleted
    selected: StateColors;     // Currently selected corner
  };

  // ===== Panel Types =====
  panel: {
    face: StateColors;         // Main box face panels
    divider: StateColors;      // Subdivision dividers
    subAssembly: StateColors;  // Drawer/tray panels
    preview: StateColors;      // New panels during preview
  };

  // ===== Tool Eligibility (panel coloring when tool active) =====
  eligibility: {
    eligible: StateColors;     // Green - panel can be operated on
    ineligible: StateColors;   // Pink - panel cannot be operated on
  };

  // ===== Void Cells =====
  void: {
    default: StateColors;
    selected: StateColors;
    wireframe: string;         // Outline color
  };

  // ===== Axes (Standard RGB convention) =====
  axis: {
    x: string;                 // Red
    y: string;                 // Green
    z: string;                 // Blue
  };

  // ===== Operation Feedback =====
  operation: {
    positive: StateColors;     // Extending/adding (blue)
    negative: StateColors;     // Retracting/removing (red)
    dragging: string;          // During drag (orange)
  };

  // ===== Bounding & Preview =====
  bounds: {
    assembly: string;          // Main assembly bounds
    previewActive: string;     // During active preview
  };

  // ===== 2D Sketch View =====
  sketch: {
    grid: {
      minor: string;
      major: string;
      axes: string;
    };
    editable: StateColors;     // Editable regions
    boundary: string;          // Conceptual panel boundary
    adjacent: StateColors;     // Adjacent panel cross-section
  };

  // ===== Opacity Presets =====
  opacity: {
    solid: number;             // 0.9
    selected: number;          // 0.8
    hover: number;             // 0.7
    default: number;           // 0.6
    subtle: number;            // 0.4
    faint: number;             // 0.2
  };
}

// ===== Default Theme =====
export const defaultColors: ColorConfig = {
  selection: {
    primary: { base: '#9b59b6', hover: '#a855f7' },
    secondary: { base: '#4a9eff', hover: '#6ab0f9' },
  },

  interactive: {
    hover: { base: '#6ab04c', hover: '#7ec850' },
    active: { base: '#2ecc71', hover: '#3dd87f' },
    disabled: { base: '#6c757d', hover: '#868e96' },
  },

  edge: {
    locked: { base: '#6c757d', hover: '#868e96' },
    unlocked: { base: '#28a745', hover: '#51cf66' },
    outwardOnly: { base: '#fd7e14', hover: '#ff922b' },
    selected: { base: '#9b59b6', hover: '#a855f7' },
  },

  corner: {
    eligible: { base: '#00bcd4', hover: '#4dd0e1' },
    ineligible: { base: '#546e7a', hover: '#78909c' },
    selected: { base: '#00e5ff', hover: '#18ffff' },
  },

  panel: {
    face: { base: '#3498db', hover: '#5dade2' },
    divider: { base: '#f39c12', hover: '#f5b041' },
    subAssembly: { base: '#1abc9c', hover: '#48c9b0' },
    preview: { base: '#00ff00', hover: '#33ff33' },
  },

  eligibility: {
    eligible: { base: '#4ade80', hover: '#86efac' },     // Green
    ineligible: { base: '#f472b6', hover: '#f9a8d4' },   // Pink
  },

  void: {
    default: { base: '#95a5a6', hover: '#aab7b8' },
    selected: { base: '#4a90d9', hover: '#6ba3e0' },
    wireframe: '#ff00ff',
  },

  axis: {
    x: '#e74c3c',
    y: '#2ecc71',
    z: '#3498db',
  },

  operation: {
    positive: { base: '#1e5a9e', hover: '#2e7ad1' },
    negative: { base: '#b33939', hover: '#c94444' },
    dragging: '#ffaa00',
  },

  bounds: {
    assembly: '#ff0000',
    previewActive: '#ffcc00',
  },

  sketch: {
    grid: {
      minor: '#2a2a3e',
      major: '#3a3a4e',
      axes: '#4a4a6a',
    },
    editable: { base: '#2ecc71', hover: '#3dd87f' },
    boundary: '#6a6a8a',
    adjacent: { base: '#4a5568', hover: '#718096' },
  },

  opacity: {
    solid: 0.9,
    selected: 0.8,
    hover: 0.7,
    default: 0.6,
    subtle: 0.4,
    faint: 0.2,
  },
};
```

---

## Usage Pattern

### Hook for accessing colors

```typescript
// src/hooks/useColors.ts
import { defaultColors, ColorConfig } from '../config/colors';

// Future: could load from user preferences or theme
export function useColors(): ColorConfig {
  return defaultColors;
}
```

### Component usage

```typescript
// Before (hardcoded):
const color = isSelected ? '#9b59b6' : '#3498db';

// After (from config):
const colors = useColors();
const color = isSelected ? colors.selection.primary.base : colors.panel.face.base;
```

---

## Migration Plan

### Phase 1: Create config file ✅
- [x] Create `src/config/colors.ts` with `ColorConfig` interface
- [x] Define `defaultColors` with all current values
- [x] Create `useColors()` hook

### Phase 2: Migrate 3D components ✅
- [x] `PanelPathRenderer.tsx` - panel fill/edge colors
- [x] `PanelEdgeRenderer.tsx` - replace `EDGE_COLORS`
- [x] `PanelCornerRenderer.tsx` - replace `CORNER_COLORS`
- [x] `VoidMesh.tsx` - void selection colors
- [x] `PushPullArrow.tsx` - operation feedback colors
- [x] `AssemblyAxisIndicator.tsx` - axis colors

### Phase 3: Migrate 2D components ✅
- [x] `SketchView2D.tsx` - grid and geometry colors

### Phase 4: Migrate palette UI ✅
- [x] `InsetPalette.tsx` - edge status indicators
- [x] `FilletPalette.tsx` - corner status indicators

### Phase 5: Consistency pass ✅
- [x] Ensure same semantic meaning uses same color
- [x] Document color meanings in config file
- [ ] Consider dark/light mode variants (future enhancement)

---

## Future Enhancements

1. **Theme support**: Multiple color configs (dark, light, high-contrast)
2. **User customization**: Allow users to override colors in settings
3. **CSS variables**: Expose colors as CSS custom properties for UI components
4. **Accessibility**: Ensure sufficient contrast ratios
