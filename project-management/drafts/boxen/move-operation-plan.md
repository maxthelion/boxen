# Move Operation Plan

## Overview

Add a new "move" operation that allows users to reposition divider panels along their perpendicular axis. This enables fine-tuning compartment sizes after initial subdivision.

## Toolbar

- **New toolbar icon required** - suggest `⬄` (horizontal arrows) or `↔` to indicate movement
- Add to EditorToolbar.tsx with 3D mode availability
- Shortcut: `M` (currently unused)

## Requirements

### Selection
- Requires selection of one or more divider panels
- All selected panels must share the same axis (e.g., all X-dividers or all Z-dividers)
- If panels from different axes are selected, the operation should be unavailable or show a validation error

### UI/UX
- Operation type: `parameter` (has preview phase with adjustable parameters)
- When active, show a floating palette with:
  - Current position indicator
  - Drag handle or input for position adjustment
  - Apply/Cancel buttons
- Selected panels highlight during operation
- Preview shows panels at new positions in real-time

### Movement Constraints
1. **Axis constraint**: Panels move perpendicular to their plane
   - X-dividers move along X axis
   - Y-dividers move along Y axis
   - Z-dividers move along Z axis

2. **Parent void constraint**: Panels cannot move outside their parent void bounds
   - Minimum position: `parentVoid.bounds[axis] + materialThickness`
   - Maximum position: `parentVoid.bounds[axis] + parentVoid.bounds[size] - materialThickness`

3. **Collision constraint**: Panels cannot overlap each other
   - Minimum separation: `materialThickness` between adjacent dividers
   - If collision would occur, preview shows panels in red/error state
   - Apply button disabled when in collision state

### Position Mode (Default)
- **Relative positioning**: Panels shift their relative position within their parent void
- Position is stored as absolute coordinate in assembly space (consistent with current subdivision system)

### Preview Behavior
- Valid positions: Show panels at new location with normal styling
- Invalid positions (collision): Show panels in red/error color
- Out of bounds: Clamp to valid range or show error

---

## Implementation Plan

### Phase 1: Types & Registry

**File: `src/operations/types.ts`**
```typescript
export type OperationId =
  // ... existing
  | 'move';
```

**File: `src/engine/types.ts`**
```typescript
// Add new action
| {
    type: 'MOVE_SUBDIVISIONS';
    targetId: string;
    payload: {
      moves: { subdivisionId: string; newPosition: number }[]
    }
  }
```

**File: `src/operations/registry.ts`**
```typescript
'move': {
  id: 'move',
  name: 'Move',
  type: 'parameter',
  selectionType: 'panel',
  minSelection: 1,
  maxSelection: Infinity,  // Allow multiple panels
  availableIn: ['3d'],
  description: 'Move divider panels along their axis',
  shortcut: 'm',

  // Validation: all panels must be dividers on same axis
  validateSelection: (panels: PanelPath[]) => {
    const dividers = panels.filter(p => p.source.type === 'divider');
    if (dividers.length === 0) return { valid: false, reason: 'Select divider panels' };

    const axes = new Set(dividers.map(p => p.source.axis));
    if (axes.size > 1) return { valid: false, reason: 'All dividers must share same axis' };

    return { valid: true };
  },

  createPreviewAction: (params) => {
    const { moves } = params as { moves?: { subdivisionId: string; newPosition: number }[] };
    if (!moves?.length) return null;

    return {
      type: 'MOVE_SUBDIVISIONS',
      targetId: 'main-assembly',
      payload: { moves },
    };
  },
},
```

### Phase 2: Engine Action Handler

**File: `src/engine/Engine.ts`**
```typescript
case 'MOVE_SUBDIVISIONS': {
  const { moves } = action.payload;

  for (const { subdivisionId, newPosition } of moves) {
    // Find the subdivision (stored on VoidNode)
    // Update its position
    // This will trigger recalculation of child void bounds
  }

  this.invalidateNodeMap();
  return true;
}
```

**File: `src/engine/nodes/VoidNode.ts`**

Add method to update subdivision position:
```typescript
moveSubdivision(subdivisionId: string, newPosition: number): boolean {
  // Find subdivision in _subdivisions or _gridSubdivision
  // Validate new position is within bounds
  // Update position
  // Recalculate child void bounds
  return success;
}
```

### Phase 3: Validation

**File: `src/operations/validators.ts`**

Add collision detection:
```typescript
export function validateMovePositions(
  voidNode: VoidSnapshot,
  axis: Axis,
  moves: { subdivisionId: string; newPosition: number }[],
  materialThickness: number
): { valid: boolean; collisions: string[] } {
  // Get all subdivision positions on this axis (existing + moved)
  // Sort by position
  // Check for collisions (distance < materialThickness)
  // Check bounds constraints
  // Return validation result with collision info
}
```

### Phase 4: UI - MovePalette Component

**File: `src/components/MovePalette.tsx`**

```typescript
interface MovePaletteProps {
  visible: boolean;
  position: { x: number; y: number };
  onPositionChange: (pos: { x: number; y: number }) => void;
  onClose: () => void;
  containerRef: React.RefObject<HTMLElement>;
}

export const MovePalette: React.FC<MovePaletteProps> = ({ ... }) => {
  // Get selected divider panels
  // Get their current positions
  // Track position changes (delta or absolute)
  // Show collision warnings
  // Apply/Cancel buttons

  return (
    <FloatingPalette title="Move Dividers" onClose={handleCancel} ...>
      {/* Position input/slider */}
      {/* Collision warning if applicable */}
      <PaletteButtonRow>
        <PaletteButton
          variant="primary"
          onClick={handleApply}
          disabled={hasCollisions}
        >
          Apply
        </PaletteButton>
        <PaletteButton onClick={handleCancel}>Cancel</PaletteButton>
      </PaletteButtonRow>
    </FloatingPalette>
  );
};
```

### Phase 5: 3D Interaction (Optional Enhancement)

Allow dragging panels directly in the 3D view:
- Detect click-and-drag on selected divider panels
- Constrain movement to perpendicular axis
- Update preview position during drag
- Show collision feedback in real-time

### Phase 6: Toolbar Integration

**File: `src/components/EditorToolbar.tsx`**
```typescript
{
  id: 'move',
  icon: '↔',  // or appropriate icon
  label: 'Move',
  tooltip: 'Move dividers (M)',
  modes: ['3d'],
},
```

**File: `src/components/Viewport3D.tsx`**
- Add MovePalette to viewport
- Wire up position state and handlers

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/operations/types.ts` | Add `'move'` to OperationId |
| `src/engine/types.ts` | Add `MOVE_SUBDIVISIONS` action |
| `src/operations/registry.ts` | Add move operation config |
| `src/engine/Engine.ts` | Add action handler |
| `src/engine/nodes/VoidNode.ts` | Add `moveSubdivision()` method |
| `src/operations/validators.ts` | Add collision/bounds validation |
| `src/components/MovePalette.tsx` | New file - palette UI |
| `src/components/EditorToolbar.tsx` | Add move tool button |
| `src/components/Viewport3D.tsx` | Integrate MovePalette |
| `src/engine/integration/moveOperation.test.ts` | **New file - geometry checker integration tests (required)** |

---

## Validation Rules

1. **Selection validation**:
   - At least one divider panel selected
   - All selected panels on same axis
   - Panels must be from same parent void (for multi-select)

2. **Position validation**:
   - Within parent void bounds (+ material thickness buffer)
   - No collision with other dividers on same axis
   - Minimum separation = material thickness

3. **Collision feedback**:
   - Colliding panels shown in red
   - Tooltip/message explaining collision
   - Apply button disabled

---

## Existing Code Review

### Candidate Code Checked
- **Push-pull operation**: Located in `PushPullPalette.tsx`, `PushPullArrow.tsx`, `pushPullDebug.ts`
- **VoidNode subdivision**: `_gridSubdivision` stores positions but has no update mechanism
- **Engine actions**: `ADD_SUBDIVISION`, `ADD_GRID_SUBDIVISION`, `REMOVE_SUBDIVISION` exist, but no `MOVE_SUBDIVISION`

### Finding: New Implementation Required
No existing move/reposition functionality for dividers. This is new code.

### Shared Functionality with Push-Pull

The move operation shares UI patterns with push-pull:

| Component | Push-Pull | Move | Can Share? |
|-----------|-----------|------|------------|
| FloatingPalette | ✓ | ✓ | Yes - same base component |
| PaletteNumberInput | ✓ (offset) | ✓ (position) | Yes |
| Preview system | ✓ | ✓ | Yes - same operation flow |
| 3D arrows/handles | PushPullArrow.tsx | Could adapt | Partial |
| Axis constraint | Face normal | Divider perpendicular | Similar logic |

### Reusable Components
1. `FloatingPalette` - base palette with apply/cancel
2. `PaletteNumberInput` - numeric input with units
3. Operation flow: `startOperation` → `updateOperationParams` → preview → `applyOperation`
4. Registry pattern with `createPreviewAction`

### New Components Needed
1. `MovePalette.tsx` - specific UI for move operation
2. Position update in `VoidNode` - method to update subdivision positions
3. `MOVE_SUBDIVISIONS` engine action
4. Collision validation logic

---

## Future Enhancements

> **Note**: In future, we may want to support absolute positioning from an outer boundary edge (e.g., "50mm from left wall"). This would require:
> - Position mode toggle: Relative vs Absolute
> - Reference edge selector (which wall to measure from)
> - Conversion between relative and absolute coordinates
> - UI to show/edit absolute measurements

---

## Test Cases

### Unit Tests
1. **Single divider move**: Move one X-divider along X axis
2. **Multi-divider move**: Select and move multiple Z-dividers together
3. **Bounds constraint**: Cannot move past parent void edges
4. **Collision detection**: Two dividers cannot occupy same position
5. **Collision preview**: Red highlight when collision would occur
6. **Grid subdivision move**: Move divider that's part of a grid
7. **Nested void divider**: Move divider in a subdivided child void

### Geometry Checker Integration Tests (Required)

**Per CLAUDE.md rules, all new operations modifying geometry must pass geometry checker validation.**

Add to `src/engine/integration/moveOperation.test.ts`:

```typescript
import { checkEngineGeometry } from '../geometryChecker';

describe('Move Operation Integration', () => {
  it('should produce valid geometry after moving single divider', () => {
    const engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);

    // Create subdivision
    engine.dispatch({
      type: 'ADD_SUBDIVISIONS',
      targetId: 'main-assembly',
      payload: { voidId: 'root', axis: 'x', positions: [50] },
    });

    // Move the divider
    engine.dispatch({
      type: 'MOVE_SUBDIVISIONS',
      targetId: 'main-assembly',
      payload: { moves: [{ subdivisionId: '...', newPosition: 60 }] },
    });

    // Verify geometry is valid
    const result = checkEngineGeometry(engine);
    expect(result.valid).toBe(true);
    expect(result.summary.errors).toBe(0);
  });

  it('should produce valid geometry after moving grid dividers', () => {
    // Similar test with grid subdivision
  });

  it('should produce valid geometry with cross-lap joints after move', () => {
    // Test that cross-lap joints remain valid after moving intersecting dividers
  });
});
```

**Note**: Do not modify geometry checker rules (`src/engine/geometryChecker.ts`) without user consultation.

---

## Open Questions

1. Should moving a grid divider break the grid subdivision into individual subdivisions?
2. How to handle moving dividers that have cross-lap joints with perpendicular dividers?
3. Should there be a "distribute evenly" button to reset to equal spacing?
4. Keyboard shortcuts for nudging (arrow keys)?
