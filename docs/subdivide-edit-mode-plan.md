# Plan: Subdivide Edit Mode

## Summary

When the subdivide tool is activated on a void that already has subdivisions, the palette should show the existing subdivision configuration and allow modifications or additions.

---

## Current Behavior

- Subdivide palette always starts fresh
- No awareness of existing subdivisions on the selected void
- Can create grid subdivisions (multi-axis) but only from scratch

---

## Proposed Behavior

### Scenario 1: Void with No Subdivisions
- Palette opens with default state (no axes selected, compartments = 2)
- User can select one or two axes and set compartment counts
- Same as current behavior

### Scenario 2: Void with Existing Single-Axis Subdivision
- Palette opens showing the existing axis as **already selected**
- Shows current compartment count for that axis
- Other axes available to add (creating a grid)
- User can:
  - **Modify**: Change compartment count on existing axis
  - **Add**: Select additional axis to create grid
  - **Remove**: Deselect the axis (removes those dividers)

### Scenario 3: Void with Existing Grid Subdivision
- Palette shows both axes as selected with their compartment counts
- Third axis available to add (if applicable)
- User can modify counts or remove axes

---

## UI Changes to SubdividePalette

### Current UI
```
┌─────────────────────────────┐
│  Subdivide              ✕   │
├─────────────────────────────┤
│  Axes:  [X] [Y] [Z]         │
│                             │
│  X Compartments: [  3  ]    │
│  Y Compartments: [  2  ]    │
│                             │
│  [Apply]  [Cancel]          │
└─────────────────────────────┘
```

### Enhanced UI (with existing subdivisions)
```
┌─────────────────────────────┐
│  Subdivide              ✕   │
├─────────────────────────────┤
│  Axes:  [X ✓] [Y] [Z ✓]     │  ← Existing axes pre-checked
│                             │
│  X Compartments: [  3  ]    │  ← Shows existing count
│  Z Compartments: [  4  ]    │  ← Shows existing count
│                             │
│  ⚠️ Modifying existing      │  ← Warning if changing
│     subdivisions            │
│                             │
│  [Apply]  [Cancel]          │
└─────────────────────────────┘
```

---

## Behavior Details

### Reading Existing Subdivisions

When palette opens, check if the selected void has:
1. `gridSubdivision` - multi-axis subdivisions
2. `children` with `splitAxis` - single-axis subdivisions

```typescript
function getExistingSubdivisions(void: Void): {
  axes: Set<Axis>;
  compartments: Record<Axis, number>;
} {
  if (void.gridSubdivision) {
    // Grid subdivision
    const axes = new Set(void.gridSubdivision.axes);
    const compartments: Record<Axis, number> = {};
    for (const axis of axes) {
      const positions = void.gridSubdivision.positions[axis] || [];
      compartments[axis] = positions.length + 1;  // dividers + 1 = compartments
    }
    return { axes, compartments };
  }

  if (void.children.length > 0 && void.children[0].splitAxis) {
    // Single-axis subdivision
    const axis = void.children[0].splitAxis;
    return {
      axes: new Set([axis]),
      compartments: { [axis]: void.children.length },
    };
  }

  return { axes: new Set(), compartments: {} };
}
```

### Modifying Existing Subdivisions

**Case: Change compartment count on existing axis**
- If increasing: Add more dividers at equal spacing
- If decreasing: Remove dividers (and merge resulting voids)
- Warning: Decreasing count may lose sub-assemblies in removed compartments

**Case: Add new axis to existing**
- Convert single-axis to grid
- Or add third axis to existing grid
- Existing axis compartment counts preserved

**Case: Remove axis**
- Deselecting an axis removes those dividers
- Warning: This will remove all dividers on that axis

---

## Engine Actions

May need new or modified actions:

```typescript
// Modify existing subdivision
{
  type: 'MODIFY_GRID_SUBDIVISION',
  targetId: 'main-assembly',
  payload: {
    voidId: string;
    axes: Axis[];           // Which axes to subdivide on
    compartments: {         // Compartment count per axis
      x?: number;
      y?: number;
      z?: number;
    };
  }
}
```

This action would:
1. Remove existing subdivisions on the void
2. Create new subdivisions with the specified configuration
3. Attempt to preserve sub-assemblies where possible

---

## What Happens When Settings Change

### Increasing Compartment Count
- New dividers added at equal spacing
- Existing compartments get smaller
- No data loss

### Decreasing Compartment Count
- Some dividers removed
- Compartments merge
- **Warning needed**: Sub-assemblies in removed compartments would be deleted
- Could refuse if sub-assemblies exist, or prompt user

### Adding an Axis
- Existing axis preserved
- New perpendicular dividers added
- Creates grid pattern
- Cross-lap joints created at intersections

### Removing an Axis
- Dividers on that axis removed
- Compartments merge along that axis
- **Warning needed**: Sub-assemblies affected

---

## Preview Behavior

The preview should:
1. Show proposed new subdivision state
2. Highlight what's changing (added/removed dividers)
3. Show warning if compartments with sub-assemblies would be affected

---

## Edge Cases

### Nested Subdivisions
If a child void of the selected void also has subdivisions:
- Currently: Can't modify parent without affecting children
- Proposed: Show warning, require explicit action

### Sub-Assemblies in Compartments
If any compartment contains a sub-assembly:
- Reducing compartment count could delete the sub-assembly
- Show clear warning before allowing this
- Consider blocking the reduction

### Mixed State
Old single-axis subdivisions vs new grid system:
- Convert old format to grid format on first edit
- Preserve compartment count

---

## Implementation Steps

1. **Read existing subdivisions** - Add helper to get current state
2. **Initialize palette with existing** - Pre-populate axes and counts
3. **Track modifications** - Know if user is adding vs modifying
4. **Warning UI** - Show when modifying existing subdivisions
5. **Engine action** - MODIFY_GRID_SUBDIVISION or extend existing
6. **Sub-assembly checks** - Warn before destructive changes

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/SubdividePalette.tsx` | Read existing state, show modifications |
| `src/engine/Engine.ts` | Add/modify action for updating subdivisions |
| `src/engine/types.ts` | Add action type if needed |
| `src/store/useBoxStore.ts` | Helper to read void subdivision state |

---

## Event Sourcing Approach

Instead of adding a `MODIFY_GRID_SUBDIVISION` action, we could implement this as **history modification and replay**:

### How It Would Work

1. When user opens subdivide palette on an already-subdivided void
2. Find the original `ADD_GRID_SUBDIVISION` action in history for this void
3. Show the parameters from that action in the palette
4. When user changes parameters and applies:
   - Remove the original action from history
   - Insert modified action with new parameters
   - Replay all subsequent actions

### The Void ID Problem

**Critical issue**: Changing subdivision parameters changes the child void IDs.

Example timeline:
```
1. ADD_GRID_SUBDIVISION(voidA, x:3) → creates [A-x0, A-x1, A-x2]
2. CREATE_SUB_ASSEMBLY(A-x1, drawer) → drawer in middle compartment
3. SET_FACE_SOLID(A-x2, front, false) → open front on right compartment
```

If user changes to x:2 and we replay:
```
1. ADD_GRID_SUBDIVISION(voidA, x:2) → creates [A-x0, A-x1]
2. CREATE_SUB_ASSEMBLY(A-x1, drawer) → A-x1 is now RIGHT compartment, not middle!
3. SET_FACE_SOLID(A-x2, ...) → A-x2 doesn't exist! Action fails.
```

### Possible Solutions

**Option A: Block modification if dependent actions exist**
```
┌─────────────────────────────────────────┐
│  ⚠️ Cannot modify subdivisions          │
│                                         │
│  This void has subsequent operations:   │
│  • Sub-assembly in compartment 2        │
│  • Face opened in compartment 3         │
│                                         │
│  To modify subdivisions, you must       │
│  first remove these items.              │
│                                         │
│  [Reset & Modify]  [Cancel]             │
└─────────────────────────────────────────┘
```

- Detect dependent actions in history
- Warn user what would be affected
- "Reset & Modify" removes dependent actions and allows modification

**Option B: Position-based void IDs**
- Void IDs encode grid position: `void-{parentId}-x{col}-z{row}`
- Changing compartment count changes which IDs exist
- Actions on positions that still exist survive replay
- Actions on removed positions are dropped (with warning)

**Option C: Semantic remapping**
- Track "logical position" (e.g., "middle compartment", "rightmost")
- Attempt to remap void references during replay
- Complex and potentially confusing

**Option D: Additive modification (simpler, less pure)**
- Don't modify history
- Add `SET_SUBDIVISION` action that replaces current state
- History shows: "subdivided into 3" then "changed to 2"
- Simpler to implement, natural undo

### Recommended Approach

**Use Option A (block + warn) with Option D (additive) as fallback:**

1. **Simple case (no dependent actions)**:
   - Modify the original action in history and replay
   - Clean history, as if user got it right the first time

2. **Complex case (has dependent actions)**:
   - Show warning listing what would be affected
   - Offer choices:
     - **"Reset & Modify"**: Remove dependent actions, modify subdivision
     - **"Keep & Adjust"**: Add new `SET_SUBDIVISION` action (additive)
     - **"Cancel"**: Do nothing

### Detection of Dependent Actions

Scan history after the subdivision action for:
- `CREATE_SUB_ASSEMBLY` targeting child void IDs
- `ADD_SUBDIVISION` targeting child void IDs (nested subdivisions)
- `SET_FACE_SOLID` on sub-assemblies in child voids
- Any action referencing a void ID that's a descendant

```typescript
function findDependentActions(
  history: Command[],
  subdivisionActionIndex: number,
  childVoidIds: Set<string>
): Command[] {
  const dependent: Command[] = [];

  for (let i = subdivisionActionIndex + 1; i < history.length; i++) {
    const command = history[i];
    for (const action of command.actions) {
      // Check if action targets or references any child void
      if (actionDependsOnVoids(action, childVoidIds)) {
        dependent.push(command);
        break;
      }
    }
  }

  return dependent;
}
```

### Sub-Assembly Warning UI

When changing parameters would affect sub-assemblies:

```
┌─────────────────────────────────────────┐
│  Subdivide                          ✕   │
├─────────────────────────────────────────┤
│  Axes:  [X ✓] [Y] [Z]                   │
│                                         │
│  X Compartments: [  2  ]  (was 3)       │
│                                         │
│  ⚠️ This change affects:                │
│                                         │
│  • Drawer in compartment 3 will be      │
│    REMOVED (compartment no longer       │
│    exists)                              │
│                                         │
│  [Apply Anyway]  [Cancel]               │
└─────────────────────────────────────────┘
```

---

## Summary: Event Sourcing Integration

| Scenario | Approach |
|----------|----------|
| No dependent actions | Modify original action, replay |
| Has dependent actions | Warn user, offer Reset or Keep & Adjust |
| Increasing compartments | Safe - replay works, existing content preserved |
| Decreasing compartments | May remove content - warn specifically about what |
| Adding axis | Safe - existing axis preserved, new one added |
| Removing axis | May affect content on that axis - warn |

This approach keeps history clean when possible, but gracefully handles complex cases with user feedback.

---

## Open Questions

1. **Should removing an axis require confirmation?** Yes, if sub-assemblies exist on that axis.

2. **What if user reduces count below what's needed for existing sub-assemblies?** Warn specifically which sub-assemblies would be removed, require confirmation.

3. **Should we show a diff?** Yes: "Adding 2 dividers on X, removing 1 on Z, affects: Drawer in compartment 3"

4. **Undo support?**
   - If we modified history: Undo restores original action
   - If we used additive: Undo removes the `SET_SUBDIVISION` action

---

## Testing Guard Rails

### 1. Dependent Action Detection Tests

```typescript
describe('findDependentActions', () => {
  it('detects sub-assembly in child void', () => {
    const history = [
      { type: 'ADD_GRID_SUBDIVISION', voidId: 'root', axes: ['x'], compartments: { x: 3 } },
      { type: 'CREATE_SUB_ASSEMBLY', voidId: 'root-x1' },  // depends on subdivision
    ];
    const dependent = findDependentActions(history, 0, new Set(['root-x0', 'root-x1', 'root-x2']));
    expect(dependent).toHaveLength(1);
    expect(dependent[0].type).toBe('CREATE_SUB_ASSEMBLY');
  });

  it('detects nested subdivision in child void', () => {
    // Subdivision of a child void depends on parent subdivision existing
  });

  it('ignores actions on unrelated voids', () => {
    // Actions on sibling voids should not be flagged
  });

  it('detects transitive dependencies', () => {
    // Sub-assembly face toggle depends on sub-assembly which depends on subdivision
  });
});
```

### 2. Replay Correctness Tests

```typescript
describe('subdivision replay', () => {
  it('produces identical state when replayed with same params', () => {
    // Create subdivision, capture state
    // Reset, replay same actions
    // States should match exactly
  });

  it('preserves sub-assemblies when increasing compartment count', () => {
    // Create 2 compartments, add sub-assembly to compartment 1
    // Replay with 3 compartments
    // Sub-assembly should still be in position 0 (leftmost)
  });

  it('correctly positions dividers after replay', () => {
    // After replay, dividers should be at equal spacing
    // Not at old positions
  });
});
```

### 3. Warning Detection Tests

```typescript
describe('subdivision modification warnings', () => {
  it('warns when decreasing count would remove sub-assembly', () => {
    // 3 compartments, sub-assembly in compartment 3
    // Try to change to 2 compartments
    // Should warn about sub-assembly removal
  });

  it('warns when removing axis with content', () => {
    // Grid 2x2, sub-assembly in one cell
    // Try to remove one axis
    // Should warn about affected content
  });

  it('no warning when change is safe', () => {
    // 2 compartments, no sub-assemblies
    // Change to 3 compartments
    // No warning needed
  });

  it('lists all affected items in warning', () => {
    // Multiple sub-assemblies, nested subdivisions
    // Warning should list everything that would be affected
  });
});
```

### 4. Geometry Validation Tests

```typescript
describe('subdivision modification geometry', () => {
  it('produces valid geometry after increasing compartments', () => {
    // Modify subdivision, run geometry checker
    const result = validateGeometry(engine);
    expect(result.valid).toBe(true);
  });

  it('produces valid geometry after decreasing compartments', () => {
    // Modify subdivision, run geometry checker
  });

  it('produces valid geometry after adding axis', () => {
    // Convert single-axis to grid, check cross-lap joints
  });

  it('produces valid geometry after removing axis', () => {
    // Remove axis from grid, verify dividers removed cleanly
  });
});
```

### 5. UI State Tests

```typescript
describe('SubdividePalette with existing subdivisions', () => {
  it('pre-populates axes from existing subdivision', () => {
    // Select void with X subdivision
    // Open palette
    // X axis should be checked, count should match
  });

  it('pre-populates multiple axes for grid', () => {
    // Select void with X+Z grid
    // Both axes checked with correct counts
  });

  it('shows modification warning when params differ', () => {
    // Change compartment count
    // Warning should appear
  });

  it('disables apply when no changes made', () => {
    // Open palette on subdivided void
    // Don't change anything
    // Apply button should be disabled or just close
  });
});
```

### 6. Edge Case Tests

```typescript
describe('subdivision edge cases', () => {
  it('handles modification at root void', () => {
    // Root void subdivision, no parent issues
  });

  it('handles deeply nested void modification', () => {
    // Void 3 levels deep, ensure parent chain preserved
  });

  it('handles concurrent modification attempts', () => {
    // Start modifying, ensure can't start another operation
  });

  it('handles cancel correctly', () => {
    // Start modification preview
    // Cancel
    // Original state should be exactly restored
  });

  it('handles undo after modification', () => {
    // Apply modification
    // Undo
    // Should restore previous subdivision state
  });
});
```

### Test Data Helpers

```typescript
// Helper to create test scenarios
function createSubdividedVoid(axes: Axis[], compartments: Record<Axis, number>): Engine {
  const engine = createEngine();
  engine.dispatch({
    type: 'ADD_GRID_SUBDIVISION',
    targetId: 'main-assembly',
    payload: { voidId: 'root', axes, compartments },
  });
  return engine;
}

function addSubAssemblyToCompartment(engine: Engine, compartmentIndex: number): string {
  const voidId = getChildVoidByIndex(engine, compartmentIndex);
  engine.dispatch({
    type: 'CREATE_SUB_ASSEMBLY',
    targetId: 'main-assembly',
    payload: { voidId },
  });
  return voidId;
}
```

### Critical Invariants to Test

1. **No orphaned sub-assemblies**: After any modification, every sub-assembly must be in a valid void
2. **No orphaned voids**: After any modification, void tree must be well-formed
3. **Geometry always valid**: After any modification, `validateGeometry()` must pass
4. **History consistency**: After replay, history should be clean (no failed actions)
5. **Undo reversibility**: Any modification can be undone to restore exact previous state
