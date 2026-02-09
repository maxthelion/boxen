# Panel Eligibility Coloring Plan

## Dependencies

- **[color-system-plan.md](color-system-plan.md)** - Must be implemented first to provide the centralized color configuration system

## Overview

When a tool is active, panels should be colored to indicate whether they are eligible for that tool's operation:
- **Green**: Viable/eligible for the operation
- **Pink**: Not viable/ineligible for the operation

## Tool-Specific Eligibility Rules

### Inset/Outset Tool
- **Eligible (Green)**: Panels with at least one non-locked edge (unlocked or outward-only)
- **Ineligible (Pink)**: Panels where all edges are locked (have finger joints)

### Fillet Tool
- **Eligible (Green)**: Panels with at least one eligible corner (both adjacent edges extended)
- **Ineligible (Pink)**: Panels with no eligible corners

### Move Tool
- **Eligible (Green)**: Divider panels only (can be repositioned)
- **Ineligible (Pink)**: Face panels (cannot be moved, only extended)

### Push/Pull Tool
- **Eligible (Green)**: Face panels only (can toggle solid/open)
- **Ineligible (Pink)**: Divider panels (cannot be pushed/pulled)

---

## Implementation

### Color Configuration

Eligibility colors are defined in the centralized color system (see [color-system-plan.md](color-system-plan.md)).

Add to `src/config/colors.ts` under the `ColorConfig` interface:

```typescript
// In ColorConfig interface
eligibility: {
  eligible: StateColors;     // Green - can operate
  ineligible: StateColors;   // Pink - cannot operate
};

// In defaultColors
eligibility: {
  eligible: { base: '#4ade80', hover: '#86efac' },
  ineligible: { base: '#f472b6', hover: '#f9a8d4' },
},
```

### Usage in Components

Access via the `useColors()` hook:

```typescript
const colors = useColors();
const eligibleColor = colors.eligibility.eligible.base;
const ineligibleColor = colors.eligibility.ineligible.base;
```

### Panel Eligibility Computation

**File: `src/components/PanelPathRenderer.tsx`**

Add eligibility check based on active tool:

```typescript
const getPanelEligibility = (
  panel: PanelPath,
  activeTool: EditorTool
): 'eligible' | 'ineligible' | null => {
  // Only show eligibility coloring for relevant tools
  if (!['inset', 'fillet', 'move', 'push-pull'].includes(activeTool)) {
    return null;
  }

  switch (activeTool) {
    case 'inset':
      // Eligible if any edge is not locked
      const hasNonLockedEdge = panel.edgeStatuses?.some(
        e => e.status !== 'locked'
      );
      return hasNonLockedEdge ? 'eligible' : 'ineligible';

    case 'fillet':
      // Eligible if any corner is eligible
      const hasEligibleCorner = panel.cornerEligibility?.some(
        c => c.eligible
      );
      return hasEligibleCorner ? 'eligible' : 'ineligible';

    case 'move':
      // Only dividers are eligible
      return panel.source.type === 'divider' ? 'eligible' : 'ineligible';

    case 'push-pull':
      // Only face panels are eligible
      return panel.source.type === 'face' ? 'eligible' : 'ineligible';

    default:
      return null;
  }
};
```

### Color Application

In `PanelPathRenderer`, apply eligibility color when tool is active:

```typescript
const colors = useColors();

// Determine panel color
let panelColor = colors.panel.face.base;

const eligibility = getPanelEligibility(panel, activeTool);
if (eligibility === 'eligible') {
  panelColor = colors.eligibility.eligible.base;
} else if (eligibility === 'ineligible') {
  panelColor = colors.eligibility.ineligible.base;
}

// Selection/hover still override eligibility colors
if (isSelected) {
  panelColor = colors.selection.primary.base;
} else if (isHovered) {
  panelColor = colors.interactive.hover.base;
}
```

### Opacity Adjustments

Use opacity values from the color system:
- Eligible: `colors.opacity.default` (0.6) - inviting
- Ineligible: `colors.opacity.subtle` (0.4) - dimmed, discouraging

---

## Files to Modify

1. **`src/config/colors.ts`** (from color-system-plan)
   - Add `eligibility` section to `ColorConfig` interface
   - Add eligibility colors to `defaultColors`

2. **`src/components/PanelPathRenderer.tsx`**
   - Import `useColors()` hook
   - Add `getPanelEligibility()` function
   - Apply eligibility colors from color system in render logic

---

## Visual Behavior

| Tool | Panel Type | Has Eligible Elements | Color |
|------|------------|----------------------|-------|
| Inset | Any | Has non-locked edges | Green |
| Inset | Any | All edges locked | Pink |
| Fillet | Any | Has eligible corners | Green |
| Fillet | Any | No eligible corners | Pink |
| Move | Divider | - | Green |
| Move | Face | - | Pink |
| Push/Pull | Face | - | Green |
| Push/Pull | Divider | - | Pink |

---

## Edge Cases

1. **Selected panels**: Selection color (purple) overrides eligibility color
2. **Hovered panels**: Hover color overrides eligibility color
3. **Select tool**: No eligibility coloring (normal panel colors)
4. **Subdivide tool**: Consider adding eligibility for voids instead of panels

---

## Testing

Manual verification:
1. Activate inset tool → panels with extendable edges are green
2. Activate fillet tool → panels with fillable corners are green
3. Activate move tool → only dividers are green
4. Activate push-pull tool → only faces are green
5. Select a panel → selection color overrides eligibility
6. Hover a panel → hover color overrides eligibility

---

## Processing Summary (automated)

**Processed:** 2026-02-09
**Agent:** draft-processor
**Age at processing:** 7 days

**Actions taken:**
- Archived to project-management/archive/boxen/
- Proposed 1 task (see proposed-tasks/panel-eligibility-coloring-plan.md)
- Note: depends on color-system-plan.md being implemented first
