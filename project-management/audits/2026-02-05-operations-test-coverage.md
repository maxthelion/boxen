# Operations Test Coverage Audit

**Date:** 2026-02-05
**Auditor:** Claude Code

## Overview

This audit evaluates test coverage for all operations against the 7 testing criteria defined in `.claude/rules/testing.md`.

## Grading Scale

- **5** - Comprehensive coverage with multiple test cases
- **4** - Good coverage, minor gaps
- **3** - Basic coverage, relies on generic tests
- **2** - Minimal coverage, significant gaps
- **1** - Missing or no dedicated tests

---

## Parameter Operations (have preview phase)

| Operation | 1. Preview Created | 2. Preview Geometry | 3. Cancel Discards | 4. State Resets | 5. Apply Commits | 6. Geometry Valid | 7. UI Flow Sim | **Overall** |
|-----------|:------------------:|:-------------------:|:------------------:|:---------------:|:----------------:|:-----------------:|:--------------:|:-----------:|
| **corner-fillet** | 5 | 5 | 5 | 5 | 5 | 5 | 5 | **5.0** |
| **inset-outset** | 5 | 5 | 5 | 5 | 5 | 5 | 2 | **4.6** |
| **push-pull** | 5 | 4 | 5 | 5 | 4 | 5 | 1 | **4.1** |
| **subdivide** | 5 | 4 | 5 | 5 | 4 | 5 | 1 | **4.1** |
| **configure** | 4 | 3 | 4 | 4 | 3 | 3 | 1 | **3.1** |
| **scale** | 4 | 3 | 4 | 4 | 3 | 3 | 1 | **3.1** |
| **subdivide-grid** | 3 | 2 | 3 | 3 | 2 | 2 | 1 | **2.3** |
| **move** | 3 | 1 | 3 | 3 | 1 | 1 | 1 | **1.9** |
| **create-sub-assembly** | 2 | 1 | 2 | 2 | 1 | 1 | 1 | **1.4** |
| **chamfer-fillet** | 2 | 1 | 2 | 2 | 1 | 1 | 1 | **1.4** |

---

## Immediate Operations (no preview phase)

Criteria 1-5 are N/A for immediate operations.

| Operation | 6. Geometry Valid | 7. UI Flow Sim | **Overall** |
|-----------|:-----------------:|:--------------:|:-----------:|
| **toggle-face** | 2 | 1 | **1.5** |
| **remove-subdivision** | 1 | 1 | **1.0** |
| **remove-sub-assembly** | 1 | 1 | **1.0** |

---

## Testing Criteria Reference

1. **Preview Created** - Test that `engine.hasPreview()` is true after `startOperation()`
2. **Preview Geometry** - Test that preview panels have correct geometry changes (not just "exists")
3. **Cancel Discards** - Test that `cancelOperation()` removes preview and restores original state
4. **State Resets** - Test that operation state returns to `idle` after cancel
5. **Apply Commits** - Test that `applyOperation()` persists changes to main scene
6. **Geometry Valid** - Test that geometry checker passes after apply
7. **UI Flow Sim** - Test that reads from same data sources as actual UI (catches wiring bugs)

---

## Key Test Files

| Operation | Primary Test File | Lines |
|-----------|-------------------|-------|
| corner-fillet | `tests/integration/operations/cornerFillet.test.ts` | ~600 |
| corner-fillet | `src/test/fixtures/filletUIFlow.test.ts` (UI flow) | ~300 |
| inset-outset | `tests/integration/operations/insetOutset.test.ts` | ~400 |
| push-pull | `tests/integration/operations/pushPull.test.ts` | ~300 |
| subdivide | `tests/integration/operations/subdivide.test.ts` | ~350 |
| (generic) | `tests/unit/store/operations.test.ts` | ~1000 |
| (template) | `tests/integration/operations/_template.test.ts` | ~200 |

---

## Findings

### Well-Tested (4+)

- **corner-fillet** - Gold standard. Only operation with full UI flow simulation tests.
- **inset-outset** - Strong coverage, just missing UI flow tests.
- **push-pull**, **subdivide** - Good coverage of core functionality.

### Needs Attention (2-3)

- **configure**, **scale** - Basic lifecycle tests only, no geometry validation.
- **subdivide-grid** - Relies on generic tests, no dedicated file.

### Critical Gaps (1-2)

- **move** - Only generic operation tests, no move-specific validation.
- **create-sub-assembly**, **chamfer-fillet** - Minimal coverage.
- **All immediate operations** - No geometry validation tests.

### Criterion 7 Gap

**UI Flow Simulation tests only exist for `corner-fillet`.** This test type caught a real bug where eligibility was computed from preview instead of main scene. Other operations may have similar wiring bugs that would only be caught by UI flow tests.

---

## Recommendations

### Priority 1 (High)

1. Add UI flow tests to `inset-outset` - Most used operation after fillet
2. Create dedicated `move` operation tests - Currently only generic coverage

### Priority 2 (Medium)

3. Add geometry validation to immediate operations (`toggle-face`, etc.)
4. Expand `subdivide-grid` tests beyond generic coverage
5. Add UI flow tests to `push-pull` and `subdivide`

### Priority 3 (Low)

6. `chamfer-fillet` tests - Less frequently used
7. `create-sub-assembly` tests - Complex operation, needs comprehensive tests

---

## How to Add UI Flow Tests

Follow the pattern in `src/test/fixtures/filletUIFlow.test.ts`:

```typescript
// Read from MAIN scene for eligibility (what UI should do)
function getMainScenePanels(engine) {
  const hadPreview = engine.hasPreview();
  if (hadPreview) {
    const previewScene = (engine as any)._previewScene;
    (engine as any)._previewScene = null;
    const panels = engine.generatePanelsFromNodes().panels;
    (engine as any)._previewScene = previewScene;
    return panels;
  }
  return engine.generatePanelsFromNodes().panels;
}

// Test that UI state remains consistent through operation
it('selection state persists through operation', () => {
  // 1. Get initial state from UI's perspective
  // 2. Start operation and make changes
  // 3. Verify UI still shows correct state (not affected by preview)
});
```

---

## Next Audit

Schedule next audit after implementing Priority 1 recommendations.
