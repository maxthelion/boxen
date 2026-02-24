# Sub-Assembly Operations Plan

## Overview

Sub-assemblies (drawers, trays, inserts) should work with all operations in the same way as main assemblies, with some constraints. Currently, some operations don't work correctly on sub-assembly panels (e.g., inset tool creates edges strangely).

## Goals

1. All operations work correctly on sub-assembly panels
2. Enforce sub-assembly-specific constraints
3. Geometry validation prevents invalid configurations
4. Integration tests verify operation compatibility

---

## Current State

Sub-assemblies exist in the engine (`SubAssemblyNode`) and can be created via the `create-sub-assembly` operation. However:
- Some operations produce incorrect geometry on sub-assembly panels
- No validation prevents operations that would cause clashes
- No integration tests verify operations work on sub-assemblies

---

## Sub-Assembly Constraints

Sub-assemblies have unique constraints because they exist within a parent void:

### 1. No Scale Operation
- Sub-assembly dimensions are constrained by parent void bounds
- Push-pull is the only way to resize (and only on open faces)

### 2. Push-Pull Restrictions
- Can only push-pull out of **open (empty) faces**
- Cannot push beyond parent void bounds
- Cannot push into space occupied by other sub-assemblies

### 3. Face Toggle Restrictions (Parent Assembly)
- A **parent assembly** face cannot be closed if a sub-assembly is protruding through it
- Example: If a drawer sticks out of the front of a box, the box's front face cannot be closed
- This applies to the main assembly, not the sub-assembly itself
- Sub-assemblies can close their own faces freely (within their bounds)

### 4. Inset/Outset Restrictions
- Inset can only work in **clear space** (not where joints exist)
- Must respect the safe area calculation (see panel-2d-editing-plan.md)

### 5. Subdivide Restrictions
- Subdivisions within sub-assembly voids follow same rules as main assembly
- Cross-lap joints must not conflict with parent structure

---

## Geometry Validation

### New Validation Rules

Add to `src/engine/geometryChecker.ts` or create `src/engine/validators/CollisionChecker.ts`:

```typescript
// Rule: Objects don't overlap
'collision:no-overlap' - Sub-assemblies don't intersect each other
'collision:within-bounds' - Sub-assemblies stay within parent void
'collision:face-clearance' - Parent face can't close if sub-assembly protrudes through it

// Rule: Operation eligibility
'subasm:push-pull-open-only' - Push-pull only on open faces
'subasm:no-scale' - Scale operation not available
'subasm:face-toggle-clearance' - Face can close only if space available
```

### Validation Triggers

- Before applying any operation on sub-assembly
- When toggling face solid state
- When moving dividers that affect sub-assembly space

---

## UI Improvements

### Assembly Axis Visualization
- Show assembly axis as an **infinite line** running through the assembly
- Not an arrow with label (current implementation)
- Applies to **both main assemblies and sub-assemblies**
- Displayed when the **configure operation** is opened
- Helps users understand orientation for operations

### Drawer Extension Indicator
- If a sub-assembly (e.g., drawer) sticks out of a void, show that the parent face can be extended
- Visual indicator on the extendable face
- Tooltip explaining the extension option

---

## Copy/Paste Sub-Assemblies

### Behavior
- Copy a sub-assembly to clipboard
- Paste into another void (same or different main assembly)
- **Default: Copy by reference** (linked instances)
- Option: Copy as independent (deep copy)

### Implementation
```typescript
// New actions
'COPY_SUB_ASSEMBLY' - Copy sub-assembly to clipboard (store reference)
'PASTE_SUB_ASSEMBLY' - Paste into target void
  - payload: { targetVoidId, asReference: boolean }

// Linked instances share:
- Material configuration
- Face configuration
- Internal subdivisions (optional)

// Changes to one linked instance can optionally propagate
```

---

## Integration Tests

### Phase 1: Run Existing Operation Tests on Sub-Assemblies

Create `tests/integration/operations/subassembly/` directory with tests that:

1. Create a main assembly with a sub-assembly
2. Run each operation on sub-assembly panels
3. Verify geometry validation passes

```typescript
// tests/integration/operations/subassembly/insetOutset.test.ts
describe('Inset/Outset on Sub-Assembly', () => {
  let engine: Engine;
  let subAssemblyId: string;

  beforeEach(() => {
    engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);
    // Add sub-assembly to root void
    engine.dispatch({
      type: 'CREATE_SUB_ASSEMBLY',
      targetId: 'main-assembly',
      payload: { voidId: 'root', ... }
    });
    subAssemblyId = /* get created sub-assembly ID */;
  });

  // Run same tests as main assembly insetOutset.test.ts
  // but targeting sub-assembly panels
});
```

### Phase 2: Constraint Validation Tests

```typescript
describe('Sub-Assembly Constraints', () => {
  it('should prevent scale operation on sub-assembly', () => {
    // Attempt scale, verify it's rejected or not available
  });

  it('should only allow push-pull on open faces', () => {
    // Close a face, attempt push-pull, verify rejection
  });

  it('should prevent parent face close if sub-assembly protrudes', () => {
    // Create sub-assembly that sticks out of parent void (e.g., drawer)
    // Attempt to close the parent's face where sub-assembly protrudes
    // Verify rejection
  });

  it('should detect sub-assembly overlap', () => {
    // Create two sub-assemblies
    // Move one to overlap, verify validation fails
  });
});
```

---

## Implementation Phases

### Phase 1: Audit & Fix Operations
1. Test each operation on sub-assembly panels manually
2. Document which operations fail and how
3. Fix engine logic to handle sub-assembly context

### Phase 2: Add Constraint Validation
1. Implement collision detection
2. Add pre-operation validation
3. Add validation error messages to UI

### Phase 3: Integration Tests
1. Create sub-assembly operation test files
2. Add constraint validation tests
3. Add to CI pipeline

### Phase 4: UI Improvements
1. Update axis visualization
2. Add extension indicators
3. Implement copy/paste UI

### Phase 5: Copy/Paste Feature
1. Implement clipboard actions
2. Add reference vs independent copy option
3. Handle linked instance updates

---

## Files to Modify/Create

| File | Action | Description |
|------|--------|-------------|
| `src/engine/validators/CollisionChecker.ts` | Create | Overlap and bounds validation |
| `src/engine/geometryChecker.ts` | Modify | Add sub-assembly rules |
| `src/operations/registry.ts` | Modify | Add sub-assembly eligibility checks |
| `src/components/Box3D.tsx` | Modify | Axis visualization |
| `tests/integration/operations/subassembly/*.ts` | Create | Sub-assembly operation tests |

---

## Open Questions

1. Should linked sub-assembly instances share internal subdivisions?
2. How to handle copy/paste across different projects/files?
3. Should there be a "fit to void" operation that auto-sizes sub-assembly?

---

## Processing Summary (automated)

**Processed:** 2026-02-09
**Agent:** draft-processor
**Age at processing:** 6 days

**Actions taken:**
- Archived to project-management/archive/boxen/
- Surfaced 3 open questions in inbox (linked instances, cross-project copy/paste, fit-to-void operation)
- No tasks proposed (blocked by open questions)
