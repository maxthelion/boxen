# Edge Extension Corner Overlap

**Status:** Idea
**Captured:** 2026-02-24

## Raw

> When 2 edges are offset, they are both occupying the corner space. This should be an integration test that: makes a box with no lid, selects two top edges that are next to each other (eg form a corner), extend them upwards. Running a geometry validator on the result would show they are occupying the same space.

## Idea

When two adjacent panel edges are both extended (e.g. two top edges forming a corner on a lidless box), the extensions overlap — both panels claim the corner volume. The geometry rules specify corner ownership: "When two adjacent panels both extend, female yields by MT." This rule exists in `EdgeExtensionChecker.ts` but is not being enforced in the actual extension geometry generation.

## Context

Observed visually in the 3D view — two extended panels clearly overlap at the corner with z-fighting / material intersection artifacts. Screenshot attached to conversation.

The geometry rules already define the fix (`.claude/rules/geometry.md` §Edge Extensions):
- **Corner ownership**: When two adjacent panels both extend, female yields by MT

## Integration Test (write BEFORE fix)

```typescript
// Test: adjacent edge extensions don't overlap at corner
it('adjacent extensions yield corner to male panel', () => {
  const engine = createEngineWithAssembly({
    width: 200, height: 150, depth: 100,
    materialThickness: 6,
  });

  // Remove top face to get open edges
  engine.dispatch({ type: 'TOGGLE_FACE', targetId: 'main', payload: { face: 'top' } });

  // Extend two adjacent top edges (e.g. front-top and left-top)
  engine.dispatch({
    type: 'APPLY_EDGE_OPERATION',
    targetId: 'main',
    payload: { panelId: frontPanelId, edge: 'top', offset: 30 }
  });
  engine.dispatch({
    type: 'APPLY_EDGE_OPERATION',
    targetId: 'main',
    payload: { panelId: leftPanelId, edge: 'top', offset: 30 }
  });

  const panels = generatePanelsFromNodes(engine._scene);
  const front = panels.find(p => /* front panel */);
  const left = panels.find(p => /* left panel */);

  // Validate no overlap — ComprehensiveValidator should catch this
  const result = ComprehensiveValidator.validate(engine.getSnapshot());
  expect(result.valid).toBe(true);

  // Specifically: female panel's extension width should be reduced by MT at the corner
  // e.g. if left is female, its extension at the front-facing end should be
  // inset by materialThickness
});
```

**Expected failure:** Test should fail before fix because both panels currently extend the full width without yielding.

## Open Questions

- Which panel is male/female at the corner? Determined by wall priority (front=1 < left=3, so front is male, left yields)
- Does the validator already check for overlapping material, or does it need a new check?
- Should this apply retroactively when a second extension is added, or only when both are applied together?
