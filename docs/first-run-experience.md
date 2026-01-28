# Blank Slate / First-Run Experience

Create a streamlined experience for when the application first loads and the user is creating their first assembly.

## Status: Pending (Next Up)

---

## Axis Selection at Top of Sidebar

### Current Location
Axis selection is buried in assembly configuration.

### New Location
Top of sidebar, prominent position with friendly names.

```typescript
interface AxisOption {
  value: AssemblyAxis;
  label: string;
  description: string;
}

const axisOptions: AxisOption[] = [
  { value: 'y', label: 'Top Down', description: 'Lid opens from top' },
  { value: 'x', label: 'Side to Side', description: 'Opens from the side' },
  { value: 'z', label: 'Front to Back', description: 'Opens from front' },
];
```

### Visual Indicator

- Show the axis on the selected assembly in 3D view
- Directional arrow or axis line through the box center
- Color-coded to match lid orientation

---

## Panel Open/Closed Floating Buttons

### Concept

Instead of a checkbox list in the sidebar, place floating buttons at the center of each panel face in the 3D view.

```typescript
interface PanelToggleButton {
  faceId: FaceId;
  position: Vector3;     // Center of face in world coordinates
  isOpen: boolean;
  icon: 'open' | 'closed';
}
```

### Behavior

- Click button to toggle between open (hole) and closed (solid panel)
- Button visually indicates current state
- Immediate visual feedback in 3D view
- Works in conjunction with panel selection

### Visual Design

```
     [○]  ← Closed (solid)
     [◯]  ← Open (removed)
```

---

## Conditional Feet Option

### Rule

Only show the feet configuration option when the assembly axis is "Top Down" (Y axis).

```typescript
const shouldShowFeetOption = (assemblyAxis: AssemblyAxis): boolean => {
  return assemblyAxis === 'y';  // Only for top-down orientation
};
```

### Rationale

Feet only make sense when the box sits with bottom facing down, which is the "Top Down" orientation.

---

## Simplified Initial Options

### Remove from initial assembly creation:
- Lid inset options (defer to advanced settings)
- Complex assembly configurations

### Keep:
- Dimensions (width, height, depth)
- Material thickness
- Axis selection
- Panel open/closed toggles

---

## Foldable Sidebar Sections

Organize the sidebar into collapsible sections:

```typescript
interface SidebarSection {
  id: string;
  title: string;
  defaultExpanded: boolean;
}

const sidebarSections: SidebarSection[] = [
  { id: 'axis', title: 'Orientation', defaultExpanded: true },
  { id: 'dimensions', title: 'Dimensions', defaultExpanded: true },
  { id: 'joints', title: 'Joint Features', defaultExpanded: false },
  { id: 'feet', title: 'Feet', defaultExpanded: false },
  { id: 'advanced', title: 'Advanced', defaultExpanded: false },
];
```

### UI Pattern

```
┌─────────────────────────┐
│ ▼ Orientation           │  ← Expanded
│   ○ Top Down            │
│   ● Side to Side        │
│   ○ Front to Back       │
├─────────────────────────┤
│ ▼ Dimensions            │  ← Expanded
│   Width:  [100] mm      │
│   Height: [ 80] mm      │
│   Depth:  [ 60] mm      │
├─────────────────────────┤
│ ▶ Joint Features        │  ← Collapsed
├─────────────────────────┤
│ ▶ Feet                  │  ← Collapsed (only if axis=y)
├─────────────────────────┤
│ ▶ Advanced              │  ← Collapsed
└─────────────────────────┘
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/Sidebar.tsx` | Add collapsible sections, move axis to top |
| `src/components/Box3D.tsx` | Add floating panel toggle buttons |
| `src/components/AxisIndicator.tsx` | New component to visualize assembly axis |
| `src/App.tsx` | First-run detection and onboarding flow |

---

## Implementation Steps

1. **Refactor Sidebar Layout:**
   - Create `CollapsibleSection` component
   - Reorganize existing controls into sections
   - Move axis selection to prominent top position

2. **Add Axis Visualization:**
   - Create `AxisIndicator` component for 3D view
   - Show directional arrow along assembly axis
   - Update when axis selection changes

3. **Add Panel Toggle Buttons:**
   - Create `PanelToggleOverlay` component
   - Position buttons at face centers (calculated from box dimensions)
   - Wire up to `toggleFace()` action

4. **Conditional Feet Section:**
   - Hide feet section when axis ≠ 'y'
   - Auto-disable feet when axis changes away from 'y'

5. **Polish First-Run Experience:**
   - Default to sensible dimensions
   - Axis pre-selected to "Top Down"
   - All faces closed by default

---

## Verification

1. **Fresh App Load:**
   - Axis selector visible at top of sidebar
   - Dimensions section expanded
   - Advanced options collapsed

2. **Axis Selection:**
   - Select "Top Down" → feet option appears, axis shown in 3D
   - Select "Side to Side" → feet option hidden, axis updates

3. **Panel Toggles:**
   - Floating buttons visible at face centers in 3D view
   - Click button → panel toggles open/closed
   - Visual feedback matches panel state

4. **Collapsible Sections:**
   - Click section header → expands/collapses
   - State persists during session
