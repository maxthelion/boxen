---
paths:
  - "src/**/*.test.ts"
  - "src/**/*.test.tsx"
---

# Testing Rules

## Test Commands

```bash
npm run test        # Watch mode
npm run test:run    # Run once
```

## Operation Tests (CRITICAL)

Every parameter operation in `src/store/operations.test.ts` must verify:

1. **Preview cleanup on cancel** - `cancelOperation()` must discard preview
2. **State reset on cancel** - Operation state returns to `{ activeOperation: null, phase: 'idle' }`
3. **Apply commits changes** - `applyOperation()` persists to main scene

## Test Structure

```typescript
describe('MyOperation', () => {
  beforeEach(() => {
    // Reset engine and store state
    engine.discardPreview();
    useBoxStore.setState({ operationState: INITIAL_OPERATION_STATE });
  });

  it('should cleanup preview on cancel', () => {
    startOperation('my-operation');
    updateOperationParams({ ... });
    expect(engine.hasPreview()).toBe(true);

    cancelOperation();
    expect(engine.hasPreview()).toBe(false);
  });
});
```

## Validator Tests

Tests in `src/operations/validators.test.ts` should cover:

- Valid selections return `{ valid: true, derived: { ... } }`
- Invalid selections return `{ valid: false, reason: '...' }`
- Edge cases (empty selection, wrong type, constraints violated)

## Snapshot Access

Use correct snapshot structure:
```typescript
const snapshot = engine.getSnapshot();
const assembly = snapshot.children[0];  // NOT snapshot.assemblies[0]
const rootVoid = assembly.rootVoid;
```
