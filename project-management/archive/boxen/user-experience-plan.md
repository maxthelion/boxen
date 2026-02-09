# User Experience Plan

App-level UX improvements: first-run experience, project templates, and quality of life enhancements.

## Status

| Feature | Status |
|---------|--------|
| Camera Behavior Fix | Complete |
| Blank Slate / First-Run | Pending (Next) |
| Collapsible Sidebar | Pending |
| Project Templates | Pending |
| Other QoL Items | Pending |

---

## Blank Slate / First-Run Experience

Create a streamlined experience for when the application first loads and the user is creating their first assembly.

### Axis Selection at Top of Sidebar

**Current Location:** Axis selection is buried in assembly configuration.

**New Location:** Top of sidebar, prominent position with friendly names.

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

**Visual Indicator:**
- Show the axis on the selected assembly in 3D view
- Directional arrow or axis line through the box center
- Color-coded to match lid orientation

### Panel Open/Closed Floating Buttons

**Concept:** Instead of a checkbox list in the sidebar, place floating buttons at the center of each panel face in the 3D view.

```typescript
interface PanelToggleButton {
  faceId: FaceId;
  position: Vector3;     // Center of face in world coordinates
  isOpen: boolean;
  icon: 'open' | 'closed';
}
```

**Behavior:**
- Click button to toggle between open (hole) and closed (solid panel)
- Button visually indicates current state
- Immediate visual feedback in 3D view
- Works in conjunction with panel selection

**Visual Design:**
```
     [○]  ← Closed (solid)
     [◯]  ← Open (removed)
```

### Conditional Feet Option

**Rule:** Only show the feet configuration option when the assembly axis is "Top Down" (Y axis).

```typescript
const shouldShowFeetOption = (assemblyAxis: AssemblyAxis): boolean => {
  return assemblyAxis === 'y';  // Only for top-down orientation
};
```

**Rationale:** Feet only make sense when the box sits with bottom facing down, which is the "Top Down" orientation.

### Simplified Initial Options

**Remove from initial assembly creation:**
- Lid inset options (defer to advanced settings)
- Complex assembly configurations

**Keep:**
- Dimensions (width, height, depth)
- Material thickness
- Axis selection
- Panel open/closed toggles

### Foldable Sidebar Sections

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

**UI Pattern:**
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

### Files to Modify

| File | Changes |
|------|---------|
| `src/components/Sidebar.tsx` | Add collapsible sections, move axis to top |
| `src/components/Box3D.tsx` | Add floating panel toggle buttons |
| `src/components/AxisIndicator.tsx` | New component to visualize assembly axis |
| `src/App.tsx` | First-run detection and onboarding flow |

### Implementation Steps

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

### Verification

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

---

## Project Templates

Create a library of starting points (templates) that users can customize when creating new projects.

### Template Concept

Templates are similar to saved projects but with **configurable variables** that are prompted when the template is opened.

**Example Template Variables:**
- Width, height, depth
- Number of horizontal drawers in an assembly
- Material thickness
- Whether to include feet

### Template Storage

Templates should be stored alongside saved projects, with a flag to distinguish them:

```typescript
interface ProjectTemplate extends ProjectState {
  isTemplate: true;
  templateName: string;
  templateDescription?: string;
  variables: TemplateVariable[];
}

interface TemplateVariable {
  id: string;
  name: string;           // Display name (e.g., "Width")
  type: 'number' | 'boolean' | 'select';
  defaultValue: number | boolean | string;

  // For numbers
  min?: number;
  max?: number;
  step?: number;
  unit?: string;          // e.g., "mm"

  // For select
  options?: { value: string; label: string }[];

  // What this variable controls
  binding: VariableBinding;
}

type VariableBinding =
  | { type: 'config'; path: 'width' | 'height' | 'depth' | 'materialThickness' | ... }
  | { type: 'subdivision'; voidId: string; property: 'count' }
  | { type: 'custom'; applyFn: string }  // For complex logic
```

### UI: Saving as Template

In the Project Browser or Save dialog:

1. **"Save as Template" option** alongside regular save
2. **Variable editor** appears when saving as template:
   - Lists available properties (dimensions, subdivisions, etc.)
   - User can toggle which ones become template variables
   - User sets display name and default value for each
   - Highlight/select mechanism to choose which properties to expose

### UI: Opening a Template

When user clicks "New from Template":

1. **Template browser** shows available templates (with thumbnails)
2. **Variable configuration dialog** appears after selection:
   - Shows all template variables with input fields
   - Live preview updates as values change (optional)
   - "Create" button generates the project with specified values

### Variable Application

When a template is instantiated:

```typescript
function applyTemplateVariables(
  template: ProjectTemplate,
  variableValues: Record<string, number | boolean | string>
): ProjectState {
  // Deep clone the template state
  const state = deepClone(template);

  // Apply each variable binding
  for (const variable of template.variables) {
    const value = variableValues[variable.id] ?? variable.defaultValue;
    applyVariableBinding(state, variable.binding, value);
  }

  return state;
}
```

### Built-in Templates

Ship with a few starter templates:

| Template | Description | Variables |
|----------|-------------|-----------|
| Basic Box | Simple 6-sided box | Width, Height, Depth |
| Drawer Unit | Box with horizontal drawers | W, H, D, Drawer Count |
| Divided Organizer | Box with grid subdivisions | W, H, D, Columns, Rows |
| Stackable Tray | Open-top tray with feet | W, H, D, Feet Height |

### Implementation Steps

1. **Extend project storage** to support templates
2. **Add template variable schema** to types
3. **Create TemplateVariableEditor component** for defining variables when saving
4. **Create TemplateConfigDialog component** for setting values when opening
5. **Add "New from Template" button** to header/project browser
6. **Implement variable application logic**
7. **Create built-in templates**

---

## Quality of Life Improvements

Small UX improvements to address friction points.

### Camera Behavior ✓

**Issue:** When an object is scaled (e.g., via push/pull), the camera view changes/jumps unexpectedly.

**Fix:** The OrbitControls should maintain the current view center and zoom level when dimensions change. The camera should not automatically reframe to fit the new dimensions.

**Implementation:** ✓
- Added fixed `target={[0, 0, 0]}` to OrbitControls in Viewport3D.tsx
- This keeps the camera aimed at the origin regardless of scene content changes

### Pending QoL Items

- [ ] Remember collapsed/expanded state of sidebar sections between sessions
- [ ] Keyboard shortcuts overlay (show available shortcuts on `?` key)
- [ ] Undo/redo for major operations (dimension changes, subdivisions, etc.)
- [ ] Copy/paste panel modifications between panels
- [ ] Better visual feedback when hovering over interactive elements

---

## Processing Summary (automated)

**Processed:** 2026-02-09
**Agent:** draft-processor
**Age at processing:** 5 days

**Actions taken:**
- Archived to project-management/archive/boxen/
- Proposed 2 tasks (see proposed-tasks/user-experience-plan.md)
- Note: Camera behavior fix already complete
