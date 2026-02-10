# Operations Test Coverage Audit

**Date:** 2026-02-05 (Updated)
**Auditor:** Claude Code

## Overview

This audit evaluates test coverage for all operations against the testing criteria defined in `.claude/rules/testing.md`.

**Key Insight:** Operations available in multiple views (2D and 3D) need separate UI flow tests for each view. We discovered a bug where the 2D fillet implementation had different wiring than the 3D version, causing eligibility to disappear during preview.

## Grading Scale

- **5** - Comprehensive coverage with multiple test cases
- **4** - Good coverage, minor gaps
- **3** - Basic coverage, relies on generic tests
- **2** - Minimal coverage, significant gaps
- **1** - Missing or no dedicated tests

---

## Operations by View Availability

| Operation | 3D View | 2D View | Notes |
|-----------|:-------:|:-------:|-------|
| **corner-fillet** | ✓ | - | 3D only, uses `useBoxStore` |
| **chamfer-fillet** | - | ✓ | 2D only, uses `useEditor` |
| **inset-outset** | ✓ | ✓ | Both views |
| **push-pull** | ✓ | - | |
| **subdivide** | ✓ | - | |
| **subdivide-grid** | ✓ | - | |
| **subdivide-two-panel** | ✓ | - | |
| **configure** | ✓ | - | |
| **scale** | ✓ | - | |
| **move** | ✓ | - | Candidate for 2D |
| **create-sub-assembly** | ✓ | - | |
| **toggle-face** | ✓ | - | Immediate |
| **remove-subdivision** | ✓ | - | Immediate |
| **remove-sub-assembly** | ✓ | - | Immediate |

---

## 3D View Parameter Operations

| Operation | 1. Preview | 2. Geometry | 3. Cancel | 4. Reset | 5. Apply | 6. Valid | 7. UI Flow | **Overall** |
|-----------|:----------:|:-----------:|:---------:|:--------:|:--------:|:--------:|:----------:|:-----------:|
| **corner-fillet** | 5 | 5 | 5 | 5 | 5 | 5 | 5 | **5.0** |
| **inset-outset** | 5 | 5 | 5 | 5 | 5 | 5 | 2 | **4.6** |
| **push-pull** | 5 | 4 | 5 | 5 | 4 | 5 | 1 | **4.1** |
| **subdivide** | 5 | 4 | 5 | 5 | 4 | 5 | 1 | **4.1** |
| **configure** | 4 | 3 | 4 | 4 | 3 | 3 | 1 | **3.1** |
| **scale** | 4 | 3 | 4 | 4 | 3 | 3 | 1 | **3.1** |
| **subdivide-grid** | 3 | 2 | 3 | 3 | 2 | 2 | 1 | **2.3** |
| **move** | 3 | 1 | 3 | 3 | 1 | 1 | 1 | **1.9** |
| **create-sub-assembly** | 2 | 1 | 2 | 2 | 1 | 1 | 1 | **1.4** |

---

## 2D View Parameter Operations

| Operation | 1. Preview | 2. Geometry | 3. Cancel | 4. Reset | 5. Apply | 6. Valid | 7. UI Flow | **Overall** |
|-----------|:----------:|:-----------:|:---------:|:--------:|:--------:|:--------:|:----------:|:-----------:|
| **chamfer-fillet** | 3 | 2 | 2 | 2 | 2 | 2 | 2 | **2.1** |
| **inset-outset** | 3 | 2 | 3 | 3 | 2 | 2 | 1 | **2.3** |

**Note:** 2D operations use the `useEditor` context (EditorStateMachine) instead of `useBoxStore`. They need separate UI flow tests that exercise the editor → engine → panel rendering path.

---

## 3D View Immediate Operations

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

| Operation | View | Primary Test File | Lines |
|-----------|------|-------------------|-------|
| corner-fillet | 3D | `tests/integration/operations/cornerFillet.test.ts` | ~600 |
| corner-fillet | 3D | `src/test/fixtures/filletUIFlow.test.ts` (UI flow) | ~300 |
| corner-fillet | 3D | `src/test/fixtures/filletUIBugs.test.ts` (regression) | ~450 |
| inset-outset | 3D | `tests/integration/operations/insetOutset.test.ts` | ~400 |
| push-pull | 3D | `tests/integration/operations/pushPull.test.ts` | ~300 |
| subdivide | 3D | `tests/integration/operations/subdivide.test.ts` | ~350 |
| (generic) | Both | `tests/unit/store/operations.test.ts` | ~1000 |
| (template) | 3D | `tests/integration/operations/_template.test.ts` | ~200 |

---

## Findings

### Well-Tested (4+)

- **corner-fillet (3D)** - Gold standard. Full UI flow simulation tests.
- **inset-outset (3D)** - Strong coverage, just missing UI flow tests.
- **push-pull**, **subdivide** - Good coverage of core functionality.

### Needs Attention (2-3)

- **chamfer-fillet (2D)** - Recently fixed wiring bug. Needs dedicated tests.
- **inset-outset (2D)** - Available in 2D but no 2D-specific tests.
- **configure**, **scale** - Basic lifecycle tests only, no geometry validation.
- **subdivide-grid** - Relies on generic tests, no dedicated file.

### Critical Gaps (1-2)

- **move** - Only generic operation tests, no move-specific validation.
- **create-sub-assembly** - Minimal coverage.
- **All immediate operations** - No geometry validation tests.

### Multi-View Operations Gap

**Operations available in both 2D and 3D need separate test coverage for each view.** The 2D and 3D views have different:
- State management (`useEditor` vs `useBoxStore`)
- Component rendering paths
- Corner/edge selection UIs

A bug fixed in one view may still exist in the other.

---

## Recommendations

### Priority 1 (High)

1. **Add 2D UI flow tests for `chamfer-fillet`** - Recently had wiring bug
2. **Add 2D UI flow tests for `inset-outset`** - Only multi-view operation without 2D tests
3. Create dedicated `move` operation tests

### Priority 2 (Medium)

4. Add geometry validation to immediate operations
5. Expand `subdivide-grid` tests beyond generic coverage
6. Add 3D UI flow tests to `push-pull` and `subdivide`

### Priority 3 (Low)

7. `create-sub-assembly` tests - Complex operation
8. Consider adding `move` to 2D view (would need tests)

---

## Shared Infrastructure Opportunity

The 2D and 3D views duplicated the "eligibility from preview" bug because they don't share UI infrastructure. Consider extracting:

### Pattern: Eligibility from Main Scene

```typescript
// Potential shared hook
function usePanelEligibility(panelId: string) {
  const mainPanels = useEngineMainPanels();
  const mainPanel = mainPanels?.panels.find(p => p.id === panelId);
  return {
    cornerEligibility: mainPanel?.allCornerEligibility ?? [],
    edgeEligibility: mainPanel?.edgeStatuses ?? [],
  };
}
```

### Current Duplication

| Component | View | Pattern |
|-----------|------|---------|
| `PanelCornerRenderer.tsx` | 3D | `useEngineMainPanels()` for eligibility |
| `SketchView2D.tsx` | 2D | `useEngineMainPanels()` for eligibility |
| `Viewport3D.tsx` | 3D | `useEngineMainPanels()` for eligibility |

### State Management Split

| View | Operations State | Preview Control |
|------|------------------|-----------------|
| 3D | `useBoxStore` | `startOperation()`, `updateOperationParams()` |
| 2D | `useEditor` | `startOperation()`, `updateParams()` |

Unifying these would reduce bugs and make multi-view operations easier to implement.

---

## Next Audit

Schedule next audit after:
1. Adding 2D UI flow tests for chamfer-fillet and inset-outset
2. Evaluating shared infrastructure extraction

