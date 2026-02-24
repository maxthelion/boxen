# Assembly Creation Operation Plan

## Overview

Refactor initial assembly creation and sub-assembly creation to follow the unified operation pattern. Both will share a common `AssemblyPalette` component for configuring dimensions, assembly axis, and finger joint layout. Enhance the 3D view with axis visualization and panel toggle buttons. Reorganize sidebar with collapsible sections.

---

## Goals

1. **Unified Assembly Palette**: Single floating palette for both main assembly and sub-assembly configuration
2. **Operation Pattern**: Assembly creation follows the same state machine as other operations (idle → active → apply/cancel)
3. **3D Axis Visualization**: Show assembly axis direction in the viewport
4. **3D Panel Toggle Buttons**: Floating buttons at face centers to toggle open/closed
5. **Collapsible Sidebar Sections**: Organized, foldable sidebar for cleaner UI
6. **Preview Support**: Real-time 3D preview as parameters change

---

## Current State

### Main Assembly Creation
- `DimensionForm.tsx` - Sidebar panel with inline inputs
- Directly calls `setConfig()` which dispatches to engine
- No preview phase, changes are immediate
- No assembly axis visualization

### Sub-Assembly Creation
- `CreateSubAssemblyPalette.tsx` - Floating palette
- Uses operation pattern with preview support
- Shows: clearance, assembly axis
- Missing: finger joint configuration (inherits from parent)

### Sidebar
- Flat structure with multiple panels
- No collapsible sections
- Axis selection buried in assembly configuration

---

## Proposed Design

### 1. Shared AssemblyPalette Component

A single `AssemblyPalette.tsx` component that handles both:
- **Main assembly creation/editing** (mode: `'main'`)
- **Sub-assembly creation** (mode: `'sub-assembly'`)

```typescript
interface AssemblyPaletteProps {
  mode: 'main' | 'sub-assembly';
  visible: boolean;
  position: { x: number; y: number };
  onPositionChange: (pos: { x: number; y: number }) => void;
  onClose: () => void;
  containerRef?: React.RefObject<HTMLElement>;
  // Sub-assembly specific
  targetVoidId?: string;
}
```

### Palette Sections

| Section | Main Assembly | Sub-Assembly | Notes |
|---------|---------------|--------------|-------|
| **Dimensions** | Width, Height, Depth | (derived from void - clearance) | Sub-assembly shows computed size |
| **Clearance** | N/A | 0-20mm slider | Gap between sub-assembly and void walls |
| **Material** | Thickness | Thickness | Both need material config |
| **Finger Joints** | Width, Gap | Width, Gap | Configure finger pattern |
| **Assembly Axis** | Toggle with friendly names | Toggle with friendly names | "Top Down", "Side to Side", "Front to Back" |
| **Lid Config** | Inset, Tab Direction | Inset, Tab Direction | Per positive/negative lid (collapsed by default) |

### Friendly Axis Names

```typescript
const axisOptions = [
  { value: 'y', label: 'Top Down', description: 'Lid opens from top' },
  { value: 'x', label: 'Side to Side', description: 'Opens from the side' },
  { value: 'z', label: 'Front to Back', description: 'Opens from front' },
];
```

---

### 2. 3D Axis Visualization

Show a visual indicator of the assembly axis in the 3D viewport.

#### Design
- Directional arrow pointing in positive lid direction
- Positioned at center of assembly
- Color-coded: matches lid faces
- Semi-transparent to not obstruct the box
- Optional: subtle highlight on the two lid faces

#### Component

```typescript
// src/components/AssemblyAxisIndicator.tsx
interface AssemblyAxisIndicatorProps {
  axis: Axis;
  bounds: { width: number; height: number; depth: number };
  position: [number, number, number];
  opacity?: number;
}
```

#### Visibility
- Show when assembly is selected
- Show during `configure-assembly` operation
- Hide otherwise to reduce clutter

---

### 3. Panel Toggle Buttons in 3D

Floating buttons at the center of each panel face to toggle open/closed.

#### Design

```
     [■]  ← Closed (solid panel)
     [□]  ← Open (removed)
```

#### Component

```typescript
// src/components/PanelToggleOverlay.tsx
interface PanelToggleButton {
  faceId: FaceId;
  position: Vector3;     // Center of face in world coordinates
  isOpen: boolean;
}

interface PanelToggleOverlayProps {
  faces: FaceConfig[];
  dimensions: { width: number; height: number; depth: number };
  onToggle: (faceId: FaceId) => void;
}
```

#### Behavior
- Click button to toggle between open (hole) and closed (solid panel)
- Button visually indicates current state
- Immediate visual feedback in 3D view
- Uses existing `toggle-face` immediate operation

#### Visibility
- Show when main assembly is selected (no specific panel selected)
- Hide when a specific panel or void is selected
- Hide during other operations

---

### 4. Collapsible Sidebar Sections

Reorganize sidebar into foldable sections for cleaner UI.

#### Section Structure

```typescript
interface SidebarSection {
  id: string;
  title: string;
  defaultExpanded: boolean;
  condition?: () => boolean;  // Optional visibility condition
}

const sidebarSections: SidebarSection[] = [
  { id: 'structure', title: 'Structure', defaultExpanded: true },
  { id: 'dimensions', title: 'Dimensions', defaultExpanded: true },
  { id: 'joints', title: 'Finger Joints', defaultExpanded: false },
  { id: 'feet', title: 'Feet', defaultExpanded: false, condition: () => assemblyAxis === 'y' },
  { id: 'advanced', title: 'Advanced', defaultExpanded: false },
];
```

#### UI Pattern

```
┌─────────────────────────┐
│ ▼ Structure             │  ← BoxTree component
│   └─ Main Assembly      │
│      └─ root void       │
├─────────────────────────┤
│ ▼ Dimensions            │  ← Expanded
│   Width:  [100] mm      │
│   Height: [ 80] mm      │
│   Depth:  [ 60] mm      │
│   [Configure...]        │  ← Opens AssemblyPalette
├─────────────────────────┤
│ ▶ Finger Joints         │  ← Collapsed
├─────────────────────────┤
│ ▶ Feet                  │  ← Collapsed (only if axis=y)
├─────────────────────────┤
│ ▶ Advanced              │  ← Collapsed
└─────────────────────────┘
```

#### Conditional Sections

**Feet Section**: Only visible when assembly axis is 'y' (Top Down orientation).

```typescript
const shouldShowFeetSection = (assemblyAxis: Axis): boolean => {
  return assemblyAxis === 'y';
};
```

Rationale: Feet only make sense when the box sits with bottom facing down.

---

### 5. Operations

#### `configure-assembly` (new)
For main assembly configuration. Type: `parameter`.

```typescript
'configure-assembly': {
  id: 'configure-assembly',
  name: 'Configure Assembly',
  type: 'parameter',
  selectionType: 'assembly',
  minSelection: 1,
  maxSelection: 1,
  availableIn: ['3d'],
  createPreviewAction: (params) => ({
    type: 'CONFIGURE_ASSEMBLY',
    targetId: 'main-assembly',
    payload: {
      width: params.width,
      height: params.height,
      depth: params.depth,
      materialConfig: params.materialConfig,
      assemblyAxis: params.assemblyAxis,
      lids: params.lids,
    },
  }),
}
```

#### `create-sub-assembly` (existing, extend)
Add finger joint and lid configuration to existing operation.

---

### 6. Engine Actions

#### New: `CONFIGURE_ASSEMBLY`

Replaces multiple individual actions with a single comprehensive action:

```typescript
{
  type: 'CONFIGURE_ASSEMBLY';
  targetId: string;
  payload: {
    width?: number;
    height?: number;
    depth?: number;
    materialConfig?: Partial<MaterialConfig>;
    assemblyAxis?: Axis;
    lids?: {
      positive?: Partial<LidConfig>;
      negative?: Partial<LidConfig>;
    };
  };
}
```

#### Update: `CREATE_SUB_ASSEMBLY`

Extend payload to include material/finger config:

```typescript
{
  type: 'CREATE_SUB_ASSEMBLY';
  targetId: string;
  payload: {
    voidId: string;
    clearance: number;
    assemblyAxis: Axis;
    // New fields:
    materialConfig?: Partial<MaterialConfig>;
    lids?: {
      positive?: Partial<LidConfig>;
      negative?: Partial<LidConfig>;
    };
  };
}
```

---

## UI Flow

### Main Assembly Configuration

1. User clicks "Configure..." button in Dimensions section OR toolbar
2. `AssemblyPalette` opens with mode='main'
3. `startOperation('configure-assembly')` is called
4. User adjusts parameters → `updateOperationParams()` → preview updates
5. 3D view shows axis indicator
6. User clicks Apply → `applyOperation()` → committed
7. OR clicks Cancel → `cancelOperation()` → reverts to original

### Panel Toggle (Immediate)

1. User sees floating toggle buttons at face centers
2. User clicks a button
3. `toggle-face` immediate operation executes
4. Panel toggles open/closed instantly
5. No palette, no preview needed

### Sub-Assembly Creation

1. User selects a void OR clicks "Create Sub-Assembly" tool
2. `AssemblyPalette` opens with mode='sub-assembly'
3. If void not selected, palette prompts for selection
4. Once valid void selected: `startOperation('create-sub-assembly')`
5. User adjusts clearance, axis, finger config → preview updates
6. 3D view shows sub-assembly preview with axis indicator
7. Apply/Cancel as above

---

## Implementation Phases

### Phase 1: Collapsible Sidebar Sections
1. Create `CollapsibleSection.tsx` component
2. Refactor sidebar to use collapsible sections
3. Add conditional visibility for Feet section (axis='y' only)
4. Persist expanded/collapsed state in session

### Phase 2: 3D Axis Visualization
1. Create `AssemblyAxisIndicator.tsx` component
2. Add to `Box3D.tsx` - show when assembly selected
3. Style: arrow with optional lid face highlights

### Phase 3: Panel Toggle Buttons
1. Create `PanelToggleOverlay.tsx` component
2. Calculate button positions from box dimensions
3. Wire up to existing `toggle-face` operation
4. Show/hide based on selection state

### Phase 4: CONFIGURE_ASSEMBLY Engine Action
1. Add action type to `src/engine/types.ts`
2. Implement handler in `Engine.ts`
3. Add tests for action

### Phase 5: configure-assembly Operation
1. Add to `src/operations/types.ts`
2. Add definition to `src/operations/registry.ts`
3. Add validators if needed

### Phase 6: AssemblyPalette Component
1. Create `src/components/AssemblyPalette.tsx`
2. Implement main assembly mode with all sections
3. Use friendly axis names
4. Integrate with Viewport3D

### Phase 7: Migrate Sub-Assembly Creation
1. Refactor `CreateSubAssemblyPalette.tsx` to use shared `AssemblyPalette`
2. Or: Extract shared sections into sub-components used by both
3. Add finger joint config to sub-assembly flow

### Phase 8: Integration & Polish
1. Add "Configure..." button to Dimensions section
2. Add toolbar button for configure-assembly
3. Keyboard shortcuts
4. Tests for operation lifecycle
5. Update DimensionForm to be read-only summary with configure button

---

## Files to Create/Modify

### New Files
- `src/components/AssemblyPalette.tsx` - Shared palette component
- `src/components/AssemblyAxisIndicator.tsx` - 3D axis visualization
- `src/components/PanelToggleOverlay.tsx` - 3D face toggle buttons
- `src/components/CollapsibleSection.tsx` - Reusable collapsible section
- `src/components/Sidebar.tsx` - Refactored sidebar with sections

### Modified Files
- `src/engine/types.ts` - Add CONFIGURE_ASSEMBLY action
- `src/engine/Engine.ts` - Handle CONFIGURE_ASSEMBLY
- `src/operations/types.ts` - Add 'configure-assembly' to OperationId
- `src/operations/registry.ts` - Add operation definition
- `src/components/Box3D.tsx` - Render axis indicator and toggle overlay
- `src/components/Viewport3D.tsx` - Mount AssemblyPalette
- `src/components/EditorToolbar.tsx` - Add configure tool
- `src/components/CreateSubAssemblyPalette.tsx` - Refactor to use shared components
- `src/components/DimensionForm.tsx` - Convert to read-only summary with configure button
- `src/App.tsx` - Sidebar section organization

---

## Open Questions

1. **Toggle button style in 3D**
   - HTML overlay (always faces camera)?
   - 3D geometry (rotates with box)?
   - Recommendation: HTML overlay for clarity

2. **Axis indicator persistence**
   - Always visible when assembly selected?
   - Only during configure operation?
   - User preference toggle?
   - Recommendation: Show when assembly selected, hide when panel/void selected

3. **Sub-assembly material config**
   - Inherit from parent by default?
   - Allow override in palette?
   - Recommendation: Default to parent, allow override

4. **Preview performance**
   - Full panel regeneration on every param change?
   - Debounce dimension changes?
   - Recommendation: Debounce at 100ms for dimension changes

---

## Success Criteria

- [ ] Sidebar has collapsible sections
- [ ] Feet section only visible when axis = 'y'
- [ ] 3D axis indicator shows when assembly selected
- [ ] Panel toggle buttons appear at face centers
- [ ] Clicking toggle button opens/closes face
- [ ] "Configure..." opens AssemblyPalette
- [ ] AssemblyPalette shows friendly axis names
- [ ] Main assembly follows operation pattern (preview → apply/cancel)
- [ ] Sub-assembly creation uses shared palette components
- [ ] Preview updates in real-time as params change
- [ ] All existing tests pass
- [ ] New tests cover operation lifecycle
