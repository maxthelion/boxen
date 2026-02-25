# Sub-Assembly Push-Pull Through Open Parent Faces

**Status:** Idea
**Captured:** 2026-02-24

## Raw

> A sub assembly should be allowed to be extended with push pull outside of its parent, as long as it is going out of an open face (eg no geometry conflict). At the moment this doesn't work. This should start with a failing integration test.

## Idea

When a sub-assembly (drawer, tray, insert) sits inside a parent void, push-pull on the sub-assembly's face is currently blocked from extending beyond the parent void bounds. However, if the parent face on that side is open (toggled off), there is no physical panel blocking the extension — it should be allowed.

The constraint should be: "sub-assembly face cannot extend past a closed parent face" rather than "sub-assembly face cannot extend past parent void bounds."

## Integration Test (write BEFORE fix)

```typescript
it('sub-assembly push-pull extends through open parent face', () => {
  const engine = createEngineWithAssembly({
    width: 200, height: 150, depth: 100,
    materialThickness: 6,
  });

  // Add a sub-assembly in the root void
  engine.dispatch({
    type: 'ADD_SUB_ASSEMBLY',
    targetId: 'main',
    payload: { voidId: 'root', subType: 'tray' }
  });

  // Open the parent's top face
  engine.dispatch({
    type: 'TOGGLE_FACE',
    targetId: 'main',
    payload: { face: 'top' }
  });

  // Push-pull the sub-assembly's top face upward, beyond parent bounds
  const subAssembly = /* find sub-assembly node */;
  const originalHeight = subAssembly.height;
  const extensionAmount = 30; // extends 30mm above parent

  engine.dispatch({
    type: 'SET_DIMENSIONS',
    targetId: subAssembly.id,
    payload: { height: originalHeight + extensionAmount }
  });

  // Should succeed — parent top face is open, no geometry conflict
  const panels = generatePanelsFromNodes(engine._scene);
  const subPanels = panels.filter(p => p.assemblyId === subAssembly.id);

  // Sub-assembly panels should extend beyond parent void bounds
  const maxY = Math.max(...subPanels.flatMap(p =>
    p.outline.points.map(pt => pt.y)
  ));
  expect(maxY).toBeGreaterThan(parentVoidBounds.maxY);

  // Geometry should still be valid (no overlapping material)
  const result = ComprehensiveValidator.validate(engine.getSnapshot());
  expect(result.valid).toBe(true);
});

it('sub-assembly push-pull blocked by closed parent face', () => {
  const engine = createEngineWithAssembly({
    width: 200, height: 150, depth: 100,
    materialThickness: 6,
  });

  // Add sub-assembly, but keep parent top face CLOSED
  engine.dispatch({
    type: 'ADD_SUB_ASSEMBLY',
    targetId: 'main',
    payload: { voidId: 'root', subType: 'tray' }
  });

  // Attempt to extend beyond parent — should be clamped or rejected
  // because the closed top face would create a geometry conflict
});
```

**Expected failure:** First test fails because push-pull currently clamps to parent void bounds regardless of face state.

## Open Questions

- Is the constraint enforced in the engine (dispatch rejects the action) or in the UI (push-pull arrow limits drag range)?
- If the parent face is later closed after the sub-assembly was extended, what happens? Force-shrink the sub-assembly? Block closing the face?
- Should this work for all directions, or only upward (e.g. a tray extending above an open-top box)?
- Does this interact with finger joints? If the sub-assembly extends through an open face, its side panels would need to grow but wouldn't have mating joints at the parent boundary.

## Possible Next Steps

- Write the failing integration tests
- Identify where the void bounds constraint is enforced (likely in engine dispatch or geometry checker)
- Modify the constraint to check parent face state, not just void bounds
- Add edge cases: partially open (adjacent face closed creates corner conflict)
