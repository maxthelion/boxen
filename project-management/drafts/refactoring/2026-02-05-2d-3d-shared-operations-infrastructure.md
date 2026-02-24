# Refactoring: Shared Operations Infrastructure for 2D/3D Views

**Date:** 2026-02-05
**Source:** Operations test coverage audit
**Status:** Partially implemented

## Problem

The 2D and 3D views duplicated the "eligibility from preview" bug because they don't share UI infrastructure. When an operation applies changes to the preview scene, eligibility data (corners, edges) disappears because the preview panel no longer has those corners.

Both views independently made the same mistake:
- Getting eligibility from `panelCollection` (preview) instead of `mainPanelCollection` (main scene)
- Bug was fixed in 3D view but remained in 2D view for a period

## Implemented: Shared `usePanelEligibility` Hook

A shared hook has been extracted to `src/engine/useEngineState.ts`:

```typescript
export interface PanelEligibility {
  corners: AllCornerEligibility[];
  edges: EdgeStatusInfo[];
}

export function usePanelEligibility(panelId: string | undefined): PanelEligibility {
  const mainPanels = useEngineMainPanels();

  return useMemo(() => {
    if (!panelId || !mainPanels) {
      return EMPTY_ELIGIBILITY;
    }

    const mainPanel = mainPanels.panels.find(p => p.id === panelId);
    if (!mainPanel) {
      return EMPTY_ELIGIBILITY;
    }

    return {
      corners: mainPanel.allCornerEligibility ?? [],
      edges: mainPanel.edgeStatuses ?? [],
    };
  }, [panelId, mainPanels]);
}
```

**Adoption status:**
| Component | Using shared hook |
|-----------|------------------|
| `SketchView2D.tsx` | Yes |
| `PanelCornerRenderer.tsx` | No (iterates many panels, hook pattern doesn't fit) |
| `Viewport3D.tsx` | Not yet assessed |

## Remaining Opportunity: State Management Unification

The 2D and 3D views have different state management:

| View | Operations State | Preview Control |
|------|------------------|-----------------|
| 3D | `useBoxStore` | `startOperation()`, `updateOperationParams()` |
| 2D | `useEditor` | `startOperation()`, `updateParams()` |

### Current Duplication

Operations that appear in both views (inset-outset, potentially move) need:
- Separate palette components or careful conditional logic
- Separate test coverage for each view's wiring
- Manual synchronization of bug fixes

### Potential Unification

Options to explore:

**Option A: Facade pattern**
Create a unified operations API that wraps both `useBoxStore` and `useEditor`:

```typescript
// Hypothetical unified API
function useOperationController(view: '2d' | '3d') {
  const boxStore = useBoxStore();
  const editor = useEditor();

  return {
    startOperation: view === '2d' ? editor.startOperation : boxStore.startOperation,
    updateParams: view === '2d' ? editor.updateParams : boxStore.updateOperationParams,
    // ...
  };
}
```

**Option B: Migrate 2D to useBoxStore**
Use `useEditor` only for draft mode (drawing paths/shapes), move operation state to `useBoxStore`.

**Option C: Shared operation components**
Create view-agnostic palette components that receive operation handlers as props.

### Recommendation

Evaluate Option B (migrate 2D operations to useBoxStore) as it would:
1. Reduce code duplication
2. Make multi-view operations trivial
3. Keep `useEditor` focused on its core purpose (draft/drawing mode)

## Related Files

- `src/engine/useEngineState.ts` - `usePanelEligibility` hook
- `src/components/SketchView2D.tsx` - 2D view (uses useEditor)
- `src/components/Viewport3D.tsx` - 3D view (uses useBoxStore)
- `src/store/useBoxStore.ts` - 3D operation state
- `src/editor/EditorStateMachine.ts` - 2D operation state

## Related Audit

See `project-management/audits/2026-02-05-operations-test-coverage.md` for test coverage analysis of operations in both views.
