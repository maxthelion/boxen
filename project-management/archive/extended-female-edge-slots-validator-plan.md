# Plan: Extended Female Edge Slots Geometry Rule

## Summary

Add a geometry rule to the ComprehensiveValidator that checks if face panels with extended edges have the required `extension-slot` holes for mating male tabs. This rule will run automatically in all integration tests via `validateGeometry(engine)`.

---

## Problem Statement

When a female edge (one that receives tabs from a mating panel) is extended outward via feet or the inset/outset tool, the slots that connect with the perpendicular panel's tabs should:

1. Still exist at their original positions
2. Potentially extend the slot pattern into the extension region

**Current behavior (suspected bug):** Extended female edges may be missing slots or have incorrectly positioned slots, breaking the joint with the mating panel.

---

## Deliverables

### 1. New Validation Rule in ComprehensiveValidator

Add `validateExtendedEdgeSlots()` method to `src/engine/validators/ComprehensiveValidator.ts` that:
- Detects face panels with edge extensions (feet)
- Checks that `extension-slot` holes exist on those extended female edges
- Reports errors if slots are missing
- Rule ID: `extended-edges:female-edge-slots`

### 2. Documentation File (Already Exists)

The rule is already documented at `docs/extended-female-edge-slots-rule.md`. No changes needed.

---

## Implementation Details

### Rule Logic

The validation checks:
1. **Identify extended face panels** - Face panels that have feet (bottom edge extension)
2. **Determine which edges are female** - Female edges receive tabs from mating panels
3. **Check for extension-slot holes** - Extended female edges should have `extension-slot` holes
4. **Report violations** - If a female edge is extended but has no extension-slots

### Key Code Locations

| File | Purpose |
|------|---------|
| `src/engine/validators/ComprehensiveValidator.ts` | Add new validation method |
| `src/utils/panelGenerator.ts:1989-2156` | `generateExtensionSlotHoles()` - generates slots on extended edges |
| `src/engine/nodes/FacePanelNode.ts:646-672` | Feet config on face panels |
| `src/utils/genderRules.ts` | Determine male/female edge relationships |

---

## Code to Add

### 1. Add validation method to ComprehensiveValidator.ts

```typescript
// ===========================================================================
// Module 6: Extended Edge Slot Validator
// ===========================================================================

/**
 * Validates that face panels with extended edges have the required
 * extension-slot holes for mating with perpendicular panels.
 *
 * Rule: extended-edges:female-edge-slots
 * When a female edge is extended (e.g., via feet), the panel should have
 * extension-slot holes to receive tabs from the mating male panel.
 */
private validateExtendedEdgeSlots(assembly: AssemblySnapshot): void {
  const panels = assembly.derived.panels;
  const facePanels = panels.filter(p => p.kind === 'face-panel') as FacePanelSnapshot[];
  const feetConfig = assembly.props.feet;

  // Rule: Extended female edges must have extension-slot holes
  this.markRuleChecked('extended-edges:female-edge-slots');

  // Skip if no feet (no edge extensions)
  if (!feetConfig?.enabled || !feetConfig?.height) {
    return;
  }

  // Wall panels have feet extending their bottom edge
  // For Y-axis assembly: front, back, left, right are walls
  const assemblyAxis = assembly.props.assemblyAxis;
  const wallFaces: FaceId[] = assemblyAxis === 'y'
    ? ['front', 'back', 'left', 'right']
    : assemblyAxis === 'x'
      ? ['front', 'back', 'top', 'bottom']
      : ['left', 'right', 'top', 'bottom'];

  for (const face of facePanels) {
    const faceId = face.props.faceId;

    // Only check wall panels (which have feet)
    if (!wallFaces.includes(faceId)) continue;

    // The bottom edge is extended by feet
    // Check if this panel has extension-slot holes
    const holes = face.derived.outline.holes;
    const extensionSlots = holes.filter(h => h.source.type === 'extension-slot');

    // Determine if the bottom edge is female for this face
    // (receives tabs from the bottom panel)
    const bottomEdgeIsFemale = this.isBottomEdgeFemale(faceId, assemblyAxis);

    if (bottomEdgeIsFemale && extensionSlots.length === 0) {
      this.addError('extended-edges:female-edge-slots',
        `Face panel ${faceId} has extended female bottom edge but no extension-slot holes`,
        {
          faceId,
          feetHeight: feetConfig.height,
          expectedSlots: true,
          actualSlots: 0,
          allHoleTypes: holes.map(h => h.source.type),
        }
      );
    }
  }
}

/**
 * Determines if the bottom edge of a face panel is female (receives tabs).
 * Based on wall priority rules from genderRules.ts
 */
private isBottomEdgeFemale(faceId: FaceId, assemblyAxis: Axis): boolean {
  // For Y-axis assembly:
  // - Wall panels (front, back, left, right) meet bottom panel at their bottom edge
  // - The bottom panel typically tabs OUT (is male) to walls
  // - So wall bottom edges are female (receive tabs)
  //
  // This is a simplified check - the actual gender determination is complex
  // but for feet (which are on walls), the wall's bottom edge is typically female

  if (assemblyAxis === 'y') {
    return ['front', 'back', 'left', 'right'].includes(faceId);
  }

  // For X-axis assembly: similar logic for the "floor" faces
  if (assemblyAxis === 'x') {
    return ['front', 'back', 'top', 'bottom'].includes(faceId);
  }

  return false;
}
```

### 2. Call the method in validateAll()

Add to the `validateAll()` method:

```typescript
// In validateAll(), after existing validators:
this.validateExtendedEdgeSlots(assembly);
```

---

## Verification

1. **Run existing integration tests (should fail if bug exists):**
   ```bash
   npm run test:run -- src/engine/integration/comprehensiveGeometry.test.ts
   ```

2. **Check specific scenario - Scenario 8: Box with Feet:**
   The existing "Scenario 8: Box with Feet" test at line ~560 of `comprehensiveGeometry.test.ts` will now also validate this rule.

3. **Visual verification:**
   - Enable feet on a box in the UI
   - Check 2D view of front/back wall panels
   - Slots for bottom panel tabs should be visible at the joint line

4. **After fix:**
   - `validateGeometry(engine)` should return no errors for extended-edges rule
   - All scenarios with feet should pass

---

## Files to Modify

| File | Action |
|------|--------|
| `src/engine/validators/ComprehensiveValidator.ts` | ADD new `validateExtendedEdgeSlots()` method |
| `src/engine/validators/ComprehensiveValidator.ts` | MODIFY `validateAll()` to call new method |

---

## Notes

- The existing doc at `docs/extended-female-edge-slots-rule.md` describes the expected behavior
- The rule will automatically run on all integration tests that call `validateGeometry()`
- Existing "Scenario 8: Box with Feet" test will trigger this validation
- If the bug exists, tests will fail with clear error messages
