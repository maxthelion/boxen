# Test Organization Plan

## Current State

Tests are scattered across the codebase:
- `src/utils/*.test.ts` - Utility function tests
- `src/engine/nodes/*.test.ts` - Engine node tests
- `src/engine/integration/*.test.ts` - Some integration tests
- `src/engine/validators/*.ts` - Validator modules (not tests)
- `src/store/*.test.ts` - Store and operation tests
- `src/engine/subAssembly.integration.test.ts` - Inconsistent naming

This makes it difficult to:
- Find related tests
- Distinguish unit tests from integration tests
- Share test fixtures and helpers

## Proposed Structure

```
tests/
├── validators/              # Validator modules (used by integration tests)
│   ├── index.ts             # Re-exports all validators
│   ├── GeometryValidator.ts # Validates 3D geometry (positions, dimensions)
│   ├── PathValidator.ts     # Validates 2D paths (axis-aligned, no diagonals)
│   ├── JointValidator.ts    # Validates finger joints and slots
│   ├── EventValidator.ts    # Validates event source recording
│   └── SelectionValidator.ts # Validates selection eligibility
│
├── unit/                    # Fast, isolated tests
│   ├── utils/
│   │   ├── fingerJoints.test.ts
│   │   ├── fingerPoints.test.ts
│   │   ├── genderRules.test.ts
│   │   ├── editableAreas.test.ts
│   │   ├── panelGenerator.test.ts
│   │   ├── edgeMating.test.ts
│   │   └── pathValidation.test.ts
│   ├── engine/
│   │   ├── BasePanel.test.ts
│   │   ├── BaseAssembly.test.ts
│   │   └── geometryChecker.test.ts
│   └── store/
│       ├── useBoxStore.test.ts
│       └── slices.test.ts
│
├── integration/             # Tests that exercise multiple systems together
│   ├── operations/          # Operation-specific integration tests
│   │   ├── _template.test.ts       # Template with required test structure
│   │   ├── pushPull.test.ts
│   │   ├── subdivide.test.ts
│   │   ├── subdivideGrid.test.ts
│   │   ├── insetOutset.test.ts
│   │   ├── cornerFillet.test.ts
│   │   ├── move.test.ts
│   │   ├── createSubAssembly.test.ts
│   │   ├── configure.test.ts
│   │   └── scale.test.ts
│   ├── geometry/            # Cross-cutting geometry validation
│   │   ├── subdivisions.test.ts
│   │   ├── gridSubdivisions.test.ts
│   │   ├── subAssemblies.test.ts
│   │   └── comprehensive.test.ts
│   ├── serialization/       # Roundtrip tests
│   │   └── urlState.test.ts
│   └── joints/
│       ├── fingerMating.test.ts
│       └── crossLapSlots.test.ts
│
└── fixtures/                # Shared test helpers and factory functions
    ├── createEngine.ts      # Engine setup helpers
    ├── createProject.ts     # ProjectState factories
    ├── materials.ts         # Default material configs
    └── assertions.ts        # Custom matchers
```

## Validators (`tests/validators/`)

Validators are modules (not tests) that perform specific validation checks. They are primarily used by integration tests to validate operation outputs.

```typescript
// tests/validators/index.ts
export { GeometryValidator } from './GeometryValidator';
export { PathValidator } from './PathValidator';
export { JointValidator } from './JointValidator';
export { EventValidator } from './EventValidator';
export { SelectionValidator } from './SelectionValidator';

// Convenience function to run all validators
export function validateOperation(
  engine: Engine,
  options?: ValidationOptions
): ValidationResult {
  const results: ValidationResult[] = [];

  results.push(GeometryValidator.validate(engine));
  results.push(PathValidator.validate(engine));
  results.push(JointValidator.validate(engine));

  if (options?.checkEvents) {
    results.push(EventValidator.validate(engine));
  }

  return mergeResults(results);
}
```

### Validator Responsibilities

| Validator | What It Checks |
|-----------|----------------|
| `GeometryValidator` | Void bounds, panel dimensions, 3D positions, relative sizes |
| `PathValidator` | Axis-aligned segments, no diagonals, minimum points, no duplicates |
| `JointValidator` | Finger point alignment, slot positions, cross-lap joints |
| `EventValidator` | Actions recorded to event source, replay consistency |
| `SelectionValidator` | Only expected object types can be selected for operation |

## Operation Integration Tests

Each operation must have a comprehensive integration test in `tests/integration/operations/`. These tests follow a standard pattern.

### Required Test Structure

```typescript
// tests/integration/operations/_template.test.ts
/**
 * OPERATION INTEGRATION TEST TEMPLATE
 *
 * Copy this file when creating tests for a new operation.
 * All sections marked [REQUIRED] must be implemented.
 *
 * The tests verify:
 * 1. Geometry validation - all output objects have valid geometry
 * 2. Path validation - all 2D paths are axis-aligned with no diagonals
 * 3. Event recording - actions are properly recorded for undo/redo
 * 4. Preview behavior - preview shows expected changes
 * 5. Apply behavior - changes are committed correctly
 * 6. Cancel behavior - changes are discarded, state reverts
 * 7. Selection eligibility - only valid objects can be selected
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Engine, createEngineWithAssembly } from '../../../src/engine';
import { useBoxStore } from '../../../src/store/useBoxStore';
import {
  validateOperation,
  GeometryValidator,
  PathValidator,
  EventValidator,
  SelectionValidator,
} from '../../validators';
import { defaultMaterial, createBasicBox } from '../../fixtures/createEngine';

describe('[OPERATION_NAME] Operation', () => {
  let engine: Engine;

  beforeEach(() => {
    engine = createBasicBox();
    useBoxStore.getState().reset?.();
  });

  // =========================================================================
  // [REQUIRED] Section 1: Geometry Validation
  // =========================================================================
  describe('Geometry Validation', () => {
    it('should produce valid geometry after operation', () => {
      // Perform the operation
      engine.dispatch({
        type: 'OPERATION_ACTION',
        targetId: 'main-assembly',
        payload: { /* ... */ },
      });

      // Validate geometry
      const result = GeometryValidator.validate(engine);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should maintain valid geometry with edge cases', () => {
      // Test minimum values, maximum values, boundary conditions
    });
  });

  // =========================================================================
  // [REQUIRED] Section 2: Path Validation
  // =========================================================================
  describe('Path Validation', () => {
    it('should produce axis-aligned paths with no diagonal segments', () => {
      // Perform operation
      engine.dispatch({ /* ... */ });

      // Validate paths
      const result = PathValidator.validate(engine);
      expect(result.valid).toBe(true);
    });

    it('should have no degenerate paths (too few points, duplicates)', () => {
      // Check path integrity
    });
  });

  // =========================================================================
  // [REQUIRED] Section 3: Event Recording
  // =========================================================================
  describe('Event Recording', () => {
    it('should record action to event source', () => {
      engine.dispatch({ /* ... */ });

      const events = engine.getEventHistory();
      expect(events).toContainEqual(
        expect.objectContaining({ type: 'OPERATION_ACTION' })
      );
    });

    it('should be replayable from event history', () => {
      // Create fresh engine
      // Replay events
      // Compare state
    });
  });

  // =========================================================================
  // [REQUIRED] Section 4: Preview Behavior
  // =========================================================================
  describe('Preview Behavior', () => {
    it('should create preview when operation starts', () => {
      useBoxStore.getState().startOperation('operation-id');

      expect(engine.hasPreview()).toBe(true);
    });

    it('should update preview when parameters change', () => {
      useBoxStore.getState().startOperation('operation-id');
      useBoxStore.getState().updateOperationParams({ param: 10 });

      // Verify preview reflects new parameters
      const previewPanels = engine.getPreviewPanels();
      // Assert expected changes in preview
    });

    it('should not affect committed state during preview', () => {
      const originalState = engine.getSnapshot();

      useBoxStore.getState().startOperation('operation-id');
      useBoxStore.getState().updateOperationParams({ param: 10 });

      // Main scene should be unchanged
      expect(engine.getMainScene()).toEqual(originalState);
    });
  });

  // =========================================================================
  // [REQUIRED] Section 5: Apply Behavior
  // =========================================================================
  describe('Apply Behavior', () => {
    it('should commit changes when applied', () => {
      useBoxStore.getState().startOperation('operation-id');
      useBoxStore.getState().updateOperationParams({ param: 10 });
      useBoxStore.getState().applyOperation();

      // Verify changes are committed
      expect(engine.hasPreview()).toBe(false);
      // Assert expected changes in main scene
    });

    it('should clear operation state after apply', () => {
      useBoxStore.getState().startOperation('operation-id');
      useBoxStore.getState().applyOperation();

      const state = useBoxStore.getState().operationState;
      expect(state.activeOperation).toBeNull();
      expect(state.phase).toBe('idle');
    });

    it('should pass full validation after apply', () => {
      useBoxStore.getState().startOperation('operation-id');
      useBoxStore.getState().updateOperationParams({ param: 10 });
      useBoxStore.getState().applyOperation();

      const result = validateOperation(engine);
      expect(result.valid).toBe(true);
    });
  });

  // =========================================================================
  // [REQUIRED] Section 6: Cancel Behavior
  // =========================================================================
  describe('Cancel Behavior', () => {
    it('should discard preview when cancelled', () => {
      const originalState = engine.getSnapshot();

      useBoxStore.getState().startOperation('operation-id');
      useBoxStore.getState().updateOperationParams({ param: 10 });
      useBoxStore.getState().cancelOperation();

      expect(engine.hasPreview()).toBe(false);
      expect(engine.getSnapshot()).toEqual(originalState);
    });

    it('should reset operation state after cancel', () => {
      useBoxStore.getState().startOperation('operation-id');
      useBoxStore.getState().cancelOperation();

      const state = useBoxStore.getState().operationState;
      expect(state.activeOperation).toBeNull();
      expect(state.phase).toBe('idle');
    });
  });

  // =========================================================================
  // [REQUIRED] Section 7: Selection Eligibility
  // =========================================================================
  describe('Selection Eligibility', () => {
    it('should only accept valid selection types', () => {
      // For panel operations: verify only panels can be selected
      // For void operations: verify only voids can be selected
      // For edge operations: verify only edges can be selected
      // etc.
    });

    it('should reject ineligible objects', () => {
      // Test that wrong object types cannot be selected
      // E.g., for move: face panels should be rejected
      // E.g., for push-pull: divider panels should be rejected
    });

    it('should respect selection count limits', () => {
      // Test minSelection and maxSelection from operation definition
    });
  });

  // =========================================================================
  // [OPTIONAL] Operation-Specific Tests
  // =========================================================================
  describe('Operation-Specific Behavior', () => {
    // Add tests specific to this operation's unique behavior
    // E.g., for subdivide: test multiple axes, grid creation
    // E.g., for fillet: test radius constraints, corner eligibility
  });
});
```

### Example: Inset/Outset Operation Test

```typescript
// tests/integration/operations/insetOutset.test.ts
describe('Inset/Outset Operation', () => {
  // ... standard sections from template ...

  describe('Operation-Specific Behavior', () => {
    it('should only allow extending unlocked edges', () => {
      // Male edges (locked) cannot be extended
    });

    it('should allow outward-only extension on female edges', () => {
      // Female edges can extend outward, not inward
    });

    it('should allow bidirectional extension on open edges', () => {
      // Open face edges can extend or retract
    });

    it('should create proper edge extension geometry', () => {
      // Verify extension adds to panel outline correctly
    });
  });
});
```

## Test Categories

### Unit Tests (`tests/unit/`)

Fast, isolated tests that test a single function or class in isolation.

**Characteristics:**
- No external dependencies
- Mock collaborators when needed
- Run in milliseconds
- Test edge cases and error conditions

### Integration Tests (`tests/integration/`)

Tests that exercise multiple systems together.

**Characteristics:**
- Test realistic scenarios
- Use validators to check output
- May be slower than unit tests
- Test that systems work together correctly

**Pattern: Setup Once, Test Many**

For integration tests that need to validate multiple aspects of the same output:

```typescript
describe('X-axis subdivision geometry', () => {
  let engine: Engine;
  let panels: PanelSnapshot[];
  let validationResult: ValidationResult;

  beforeAll(() => {
    // Setup once - expensive operation
    engine = createBasicBox();
    engine.dispatch({
      type: 'ADD_SUBDIVISION',
      targetId: 'main-assembly',
      payload: { voidId: 'root', axis: 'x', position: 50 },
    });
    panels = engine.generatePanelsFromNodes();
    validationResult = validateOperation(engine);
  });

  it('should pass all validations', () => {
    expect(validationResult.valid).toBe(true);
  });

  it('should create a divider panel', () => {
    const divider = panels.find(p => p.kind === 'divider-panel');
    expect(divider).toBeDefined();
  });

  // ... more tests using the same setup
});
```

## Migration Plan

### Phase 1: Create Structure

1. Create `tests/` directory with subdirectories
2. Move validators from `src/engine/validators/` to `tests/validators/`
3. Create `tests/fixtures/` with shared helpers
4. Update `vitest.config.ts`

### Phase 2: Create Operation Test Template

1. Create `tests/integration/operations/_template.test.ts`
2. Document required sections with comments
3. Create first operation test using template

### Phase 3: Move and Reorganize Tests

| From | To |
|------|-----|
| `src/engine/validators/*.ts` | `tests/validators/` |
| `src/utils/*.test.ts` | `tests/unit/utils/` |
| `src/engine/nodes/*.test.ts` | `tests/unit/engine/` |
| `src/store/*.test.ts` | `tests/unit/store/` |
| `src/engine/integration/*.test.ts` | `tests/integration/geometry/` |
| Operation-related tests | `tests/integration/operations/` |

### Phase 4: Implement Missing Operation Tests

For each operation in `src/operations/registry.ts`, ensure there's a corresponding test file in `tests/integration/operations/` that follows the template.

## Running Tests

```bash
# Run all tests
npm run test:run

# Run only unit tests
npm run test:run -- tests/unit

# Run only integration tests
npm run test:run -- tests/integration

# Run only operation tests
npm run test:run -- tests/integration/operations

# Run specific operation test
npm run test:run -- tests/integration/operations/insetOutset.test.ts

# Run tests in watch mode
npm run test
```

## Guidelines for New Operations

When adding a new operation:

1. **Add operation definition** in `src/operations/registry.ts`
2. **Create test file** by copying `tests/integration/operations/_template.test.ts`
3. **Implement all required sections** (marked `[REQUIRED]` in template)
4. **Add operation-specific tests** for unique behavior
5. **Run full test suite** to ensure no regressions

## Validation Checklist

Before merging any operation, verify:

- [ ] All 7 required test sections are implemented
- [ ] Geometry validation passes
- [ ] Path validation passes (no diagonals)
- [ ] Event recording works
- [ ] Preview creates/updates correctly
- [ ] Apply commits changes
- [ ] Cancel reverts state
- [ ] Only valid objects can be selected
