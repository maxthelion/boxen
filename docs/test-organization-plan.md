# Test Organization Plan

## Current State

Tests are scattered across the codebase:
- `src/utils/*.test.ts` - Utility function tests
- `src/engine/nodes/*.test.ts` - Engine node tests
- `src/engine/integration/*.test.ts` - Some integration tests
- `src/engine/validators/*.test.ts` - Validator tests
- `src/store/*.test.ts` - Store and operation tests
- `src/engine/subAssembly.integration.test.ts` - Inconsistent naming

This makes it difficult to:
- Find related tests
- Distinguish unit tests from integration tests
- Share test fixtures and helpers

## Proposed Structure

```
tests/
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
│   ├── validators/
│   │   ├── EdgeExtensionChecker.test.ts
│   │   └── PathChecker.test.ts
│   ├── store/
│   │   ├── useBoxStore.test.ts
│   │   └── operations.test.ts
│   └── operations/
│       └── validators.test.ts
│
├── integration/             # Tests that exercise multiple systems together
│   ├── geometry/            # Geometry validation after operations
│   │   ├── subdivisions.test.ts
│   │   ├── gridSubdivisions.test.ts
│   │   ├── subAssemblies.test.ts
│   │   ├── edgeExtensions.test.ts
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
    └── assertions.ts        # Custom matchers (compareVoids, etc.)
```

## Test Categories

### Unit Tests (`tests/unit/`)

Fast, isolated tests that test a single function or class in isolation.

**Characteristics:**
- No external dependencies
- Mock collaborators when needed
- Run in milliseconds
- Test edge cases and error conditions

**Example:**
```typescript
// tests/unit/utils/fingerPoints.test.ts
describe('computeFingerPoints', () => {
  it('should generate correct number of points', () => {
    const points = computeFingerPoints(100, 10, 1.5);
    expect(points.length).toBeGreaterThan(0);
  });
});
```

### Integration Tests (`tests/integration/`)

Tests that exercise multiple systems together, typically:
1. Set up a scene with the engine
2. Perform operations
3. Validate the resulting geometry/state

**Characteristics:**
- Test realistic scenarios
- Use the geometry checker to validate output
- May be slower than unit tests
- Test that systems work together correctly

**Pattern: Setup Once, Test Many**

For integration tests that need to validate multiple aspects of the same output:

```typescript
// tests/integration/geometry/subdivisions.test.ts
import { createEngineWithAssembly, defaultMaterial } from '../../fixtures/createEngine';
import { checkEngineGeometry } from '../../../src/engine/geometryChecker';

describe('X-axis subdivision geometry', () => {
  let engine: Engine;
  let panels: PanelSnapshot[];
  let geometryResult: GeometryCheckResult;

  beforeAll(() => {
    // Setup once - expensive operation
    engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);
    engine.dispatch({
      type: 'ADD_SUBDIVISION',
      targetId: 'main-assembly',
      payload: { voidId: 'root', axis: 'x', position: 50 },
    });
    panels = engine.generatePanelsFromNodes();
    geometryResult = checkEngineGeometry(engine);
  });

  // Test many aspects of the same setup
  it('should pass geometry validation', () => {
    expect(geometryResult.valid).toBe(true);
  });

  it('should create a divider panel', () => {
    const divider = panels.find(p => p.kind === 'divider-panel');
    expect(divider).toBeDefined();
  });

  it('should have correct divider dimensions', () => {
    const divider = panels.find(p => p.kind === 'divider-panel');
    expect(divider!.derived.width).toBeCloseTo(54, 1);
  });

  it('should create two child voids', () => {
    const assembly = engine.assembly;
    expect(assembly?.rootVoid.getVoidChildren().length).toBe(2);
  });

  it('should create finger joints on divider edges', () => {
    const divider = panels.find(p => p.kind === 'divider-panel');
    // Check outline has finger joint pattern...
  });
});
```

### Fixtures (`tests/fixtures/`)

Shared helpers to reduce duplication across tests.

```typescript
// tests/fixtures/createEngine.ts
import { Engine, createEngineWithAssembly } from '../../src/engine';
import { MaterialConfig } from '../../src/engine/types';

export const defaultMaterial: MaterialConfig = {
  thickness: 3,
  fingerWidth: 10,
  fingerGap: 1.5,
};

export const thinMaterial: MaterialConfig = {
  thickness: 1.5,
  fingerWidth: 6,
  fingerGap: 1,
};

export function createBasicBox(
  width = 100,
  height = 80,
  depth = 60,
  material = defaultMaterial
): Engine {
  return createEngineWithAssembly(width, height, depth, material);
}

export function createSubdividedBox(
  axis: 'x' | 'y' | 'z',
  position: number
): Engine {
  const engine = createBasicBox();
  engine.dispatch({
    type: 'ADD_SUBDIVISION',
    targetId: 'main-assembly',
    payload: { voidId: 'root', axis, position },
  });
  return engine;
}
```

```typescript
// tests/fixtures/assertions.ts
import { Void } from '../../src/types';

export function compareVoids(a: Void, b: Void, path = 'root'): void {
  expect(a.id, `${path}.id`).toBe(b.id);
  expect(a.bounds.x, `${path}.bounds.x`).toBeCloseTo(b.bounds.x, 2);
  // ... rest of comparison
}

export function expectValidGeometry(engine: Engine): void {
  const result = checkEngineGeometry(engine);
  if (!result.valid) {
    console.error('Geometry errors:', result.errors);
  }
  expect(result.valid).toBe(true);
}
```

## Migration Plan

### Phase 1: Create Structure

1. Create `tests/` directory with subdirectories
2. Create `tests/fixtures/` with shared helpers
3. Update `vitest.config.ts`:
   ```typescript
   import { defineConfig } from 'vitest/config';

   export default defineConfig({
     test: {
       globals: true,
       environment: 'node',
       include: ['tests/**/*.test.ts'],
     },
   });
   ```

### Phase 2: Move Unit Tests

Move tests that don't require complex setup:

| From | To |
|------|-----|
| `src/utils/fingerJointsV2.test.ts` | `tests/unit/utils/fingerJoints.test.ts` |
| `src/utils/fingerPoints.test.ts` | `tests/unit/utils/fingerPoints.test.ts` |
| `src/utils/genderRules.test.ts` | `tests/unit/utils/genderRules.test.ts` |
| `src/utils/editableAreas.test.ts` | `tests/unit/utils/editableAreas.test.ts` |
| `src/utils/panelGenerator.test.ts` | `tests/unit/utils/panelGenerator.test.ts` |
| `src/utils/edgeMating.test.ts` | `tests/unit/utils/edgeMating.test.ts` |
| `src/utils/pathValidation.test.ts` | `tests/unit/utils/pathValidation.test.ts` |
| `src/engine/nodes/BasePanel.test.ts` | `tests/unit/engine/BasePanel.test.ts` |
| `src/engine/nodes/BaseAssembly.test.ts` | `tests/unit/engine/BaseAssembly.test.ts` |
| `src/engine/geometryChecker.test.ts` | `tests/unit/engine/geometryChecker.test.ts` |
| `src/engine/validators/EdgeExtensionChecker.test.ts` | `tests/unit/validators/EdgeExtensionChecker.test.ts` |
| `src/engine/validators/PathChecker.test.ts` | `tests/unit/validators/PathChecker.test.ts` |
| `src/store/useBoxStore.test.ts` | `tests/unit/store/useBoxStore.test.ts` |
| `src/store/operations.test.ts` | `tests/unit/store/operations.test.ts` |
| `src/operations/validators.test.ts` | `tests/unit/operations/validators.test.ts` |

### Phase 3: Move Integration Tests

Move and consolidate integration tests:

| From | To |
|------|-----|
| `src/engine/integration/jointMating.test.ts` | `tests/integration/joints/fingerMating.test.ts` |
| `src/engine/integration/comprehensiveGeometry.test.ts` | `tests/integration/geometry/comprehensive.test.ts` |
| `src/engine/integration/voidBoundsDiagnostic.test.ts` | `tests/integration/geometry/voidBounds.test.ts` |
| `src/engine/subAssembly.integration.test.ts` | `tests/integration/geometry/subAssemblies.test.ts` |
| `src/engine/nodes/gridSubdivision.test.ts` | `tests/integration/geometry/gridSubdivisions.test.ts` |
| `src/engine/nodes/crossLapSlots.test.ts` | `tests/integration/joints/crossLapSlots.test.ts` |
| `src/utils/urlState.test.ts` | `tests/integration/serialization/urlState.test.ts` |

### Phase 4: Extract Fixtures

1. Identify duplicated setup code across tests
2. Extract to `tests/fixtures/`
3. Update imports in test files

### Phase 5: Update Imports

After moving files, update all import paths. Since tests are now outside `src/`, imports will look like:

```typescript
// Before (co-located)
import { computeFingerPoints } from './fingerPoints';

// After (centralized)
import { computeFingerPoints } from '../../src/utils/fingerPoints';
```

## Naming Conventions

- **Unit tests**: `{module}.test.ts`
- **Integration tests**: `{feature}.test.ts`
- **Fixtures**: `{purpose}.ts` (no `.test` suffix)

## Running Tests

```bash
# Run all tests
npm run test:run

# Run only unit tests
npm run test:run -- tests/unit

# Run only integration tests
npm run test:run -- tests/integration

# Run specific test file
npm run test:run -- tests/integration/geometry/subdivisions.test.ts

# Run tests in watch mode
npm run test
```

## Guidelines for New Tests

1. **Unit tests** go in `tests/unit/{category}/`
2. **Integration tests** go in `tests/integration/{feature}/`
3. **Always use fixtures** for common setup (don't duplicate `createEngineWithAssembly` calls)
4. **Integration tests must run geometry checker** to validate output
5. **Use `beforeAll`** for expensive setup that multiple tests share
6. **Keep unit tests fast** - mock external dependencies if needed
