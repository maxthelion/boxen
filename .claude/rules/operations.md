---
paths:
  - "src/operations/**"
  - "src/store/operations.test.ts"
  - "src/store/useBoxStore.ts"
  - "src/components/*Palette.tsx"
---

# Operations System Rules

## Operation Types

| Type | Behavior | Preview |
|------|----------|---------|
| `parameter` | User adjusts params before commit | Yes |
| `immediate` | Executes instantly | No |
| `view` | Changes view, no model change | No |

## Operation Phases

`idle` → `awaiting-selection` → `active` → (apply/cancel) → `idle`

## Adding a New Operation

1. Add ID to `src/operations/types.ts`
2. Add definition to `src/operations/registry.ts`
3. Add validator to `src/operations/validators.ts`
4. Add tests to `src/store/operations.test.ts`
5. Create palette component (if parameter type)

## Testing Requirements (CRITICAL)

Every parameter operation MUST have tests that verify:

- [ ] Preview is created when operation starts
- [ ] Preview is discarded when `cancelOperation()` is called
- [ ] Operation state resets to idle after cancel
- [ ] Apply commits the preview correctly

Example:
```typescript
it('should cleanup preview on cancel', () => {
  startOperation('my-operation');
  updateOperationParams({ ... });
  expect(engine.hasPreview()).toBe(true);

  cancelOperation();
  expect(engine.hasPreview()).toBe(false);
});
```

## Preview System

```typescript
engine.startPreview();           // Clone scene
engine.dispatch(action, { preview: true });  // Mutate preview
engine.commitPreview();          // Apply to main scene
engine.discardPreview();         // Discard preview
notifyEngineStateChanged();      // IMPORTANT: Notify React after discard
```

## Declarative Validation

Use `SelectionRequirement` in `validators.ts`:

```typescript
{
  targetType: 'leaf-void',  // or 'face-panel', 'opposing-panels', etc.
  minCount: 1,
  maxCount: 1,
  description: 'Select a void',
  constraints: [{ type: 'must-be-leaf-void' }],
}
```

Validators return `SelectionValidationResult` with `derived` state (targetVoid, validAxes, etc.).

## Subdivision Axis Rules

| Axis | Disabled When |
|------|---------------|
| X | Left OR right face is open |
| Y | Top OR bottom face is open |
| Z | Front OR back face is open |

## Palette Components

- Only mount when tool is active: `{activeTool === 'my-tool' && <MyPalette />}`
- Use `FloatingPalette` container
- Get state from store, not props
- Call `startOperation()` / `updateOperationParams()` / `applyOperation()` / `cancelOperation()`
