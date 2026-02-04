# RFC: Composable Test Fixture System

**Created:** 2026-02-04
**Status:** Draft
**Author:** Human + Claude
**Related:** Testing Strategy notes (IMG_8250-8252)

## Summary

A fluent builder API for creating test fixtures that represent various panel states. Enables matrix-driven testing across all permutations of panel modifications (extensions, cutouts, subdivisions, etc.).

## Motivation

From the Testing Strategy notes:

> "For each operation, what do we know of the objects before + after?"
> "What kind of permutations do we need to apply an operation to?"

Currently, testing operations like fillet requires manually constructing engine state for each scenario. This is verbose, error-prone, and makes it difficult to ensure coverage across all permutations.

The notes identify these permutation dimensions for fillet alone:
- Panel with 0/1/2/3/4 extensions
- Panel with custom edges (rectangles added/removed)
- Panel with cutouts
- Panel on face adjacent to open face(s)
- Subdivided panels

Testing all combinations manually is impractical. We need a system that:
1. Makes fixture creation readable and composable
2. Enables branching from common states (tree of outcomes)
3. Supports matrix-driven test generation

## Proposal

### Core API

```typescript
import { TestFixture, rect } from '../test/fixtures';

// Basic usage - fluent builder
const fixture = TestFixture
  .basicBox(100, 80, 60)
  .panel('front')
  .withExtension('top', 30)
  .withCutout(rect(10, 10, 20, 20))
  .build();

// Access results
fixture.engine;              // The Engine instance
fixture.panel;               // The selected panel
fixture.panels;              // All panels
fixture.panel.allCornerEligibility;  // Computed properties available
```

### Branching (Tree of Outcomes)

From the notes: "Tree of outcomes, branching from same original state."

```typescript
// Common origin
const base = TestFixture.basicBox(100, 80, 60).panel('front');

// Branch into different final states
const plain = base.build();
const withExt = base.clone().withExtension('top', 30).build();
const withCutout = base.clone().withCutout(rect(10, 10, 20, 20)).build();
const withBoth = base.clone()
  .withExtension('top', 30)
  .withCutout(rect(10, 10, 20, 20))
  .build();
```

### Matrix-Driven Testing

```typescript
import { TestFixture, permute } from '../test/fixtures';

// Define permutation dimensions
const matrix = permute({
  extensions: [
    [],
    ['top'],
    ['top', 'left'],
    ['top', 'right', 'bottom', 'left'],
  ],
  cutouts: [
    [],
    [rect(10, 10, 20, 20)],
    [rect(5, 5, 10, 10), rect(30, 30, 10, 10)],  // multiple cutouts
  ],
  openFaces: [
    ['top'],
    ['top', 'front'],
  ],
});

// Generates all combinations: 4 × 3 × 2 = 24 test cases
describe.each(matrix)('fillet eligibility: %s', (name, config) => {
  it('calculates correct eligible corners', () => {
    const fixture = TestFixture
      .basicBox(100, 80, 60)
      .withOpenFaces(config.openFaces)
      .panel('front')
      .withExtensions(config.extensions)
      .withCutouts(config.cutouts)
      .build();

    const expected = calculateExpectedCorners(config);
    expect(fixture.panel.allCornerEligibility.length).toBe(expected);
  });
});
```

### Preset Fixtures

Common starting points for tests:

```typescript
// Presets for common scenarios
TestFixture.basicBox(w, h, d)           // 6-sided box, top open
TestFixture.enclosedBox(w, h, d)        // All faces closed
TestFixture.boxWithDivider(w, h, d)     // Box with X-axis divider
TestFixture.trayWithFeet(w, h, d)       // Open top, feet on bottom

// Named panel states
TestFixture.basicBox(100, 80, 60)
  .panel('front')
  .asExtendedPanel()      // Preset: top extension 20mm
  .asPanelWithFeet()      // Preset: bottom extension with foot cutouts
```

## Implementation

### TestFixture Class

```typescript
// src/test/fixtures/TestFixture.ts

export class TestFixture {
  private engine: Engine;
  private _selectedPanel: string | null = null;
  private operations: QueuedOperation[] = [];

  // Factory methods
  static basicBox(width: number, height: number, depth: number): TestFixture {
    const fixture = new TestFixture();
    fixture.engine = createEngineWithAssembly(width, height, depth, defaultMaterial);
    // Default: top face open
    fixture.engine.dispatch({
      type: 'SET_FACE_ENABLED',
      targetId: 'main-assembly',
      payload: { faceId: 'top', enabled: false },
    });
    return fixture;
  }

  static enclosedBox(width: number, height: number, depth: number): TestFixture {
    const fixture = new TestFixture();
    fixture.engine = createEngineWithAssembly(width, height, depth, defaultMaterial);
    return fixture;
  }

  // Configuration
  withOpenFaces(faces: FaceId[]): TestFixture {
    const allFaces: FaceId[] = ['top', 'bottom', 'left', 'right', 'front', 'back'];
    for (const face of allFaces) {
      this.engine.dispatch({
        type: 'SET_FACE_ENABLED',
        targetId: 'main-assembly',
        payload: { faceId: face, enabled: !faces.includes(face) },
      });
    }
    return this;
  }

  // Panel selection - returns PanelBuilder for chaining
  panel(face: FaceId): PanelBuilder {
    const panels = generatePanelsFromNodes(this.engine);
    const panel = panels.find(p => p.source.faceId === face);
    if (!panel) throw new Error(`No panel for face ${face}`);
    this._selectedPanel = panel.id;
    return new PanelBuilder(this, panel.id);
  }

  // Branching
  clone(): TestFixture {
    const copy = new TestFixture();
    copy.engine = this.engine.clone();
    copy._selectedPanel = this._selectedPanel;
    copy.operations = [...this.operations];
    return copy;
  }

  // Build final result
  build(): FixtureResult {
    // Execute any queued operations
    for (const op of this.operations) {
      this.engine.dispatch(op.action);
    }

    const panels = generatePanelsFromNodes(this.engine);
    const selectedPanel = this._selectedPanel
      ? panels.find(p => p.id === this._selectedPanel)
      : undefined;

    return {
      engine: this.engine,
      panels,
      panel: selectedPanel,
    };
  }

  // Internal: queue operation for execution at build time
  _queueOperation(action: EngineAction): void {
    this.operations.push({ action });
  }
}
```

### PanelBuilder Class

```typescript
// src/test/fixtures/PanelBuilder.ts

export class PanelBuilder {
  constructor(
    private fixture: TestFixture,
    private panelId: string
  ) {}

  withExtension(edge: EdgeId, amount: number): PanelBuilder {
    this.fixture._queueOperation({
      type: 'APPLY_EDGE_OPERATION',
      targetId: 'main-assembly',
      payload: {
        panelId: this.panelId,
        edge,
        operation: 'extend',
        amount,
      },
    });
    return this;
  }

  withExtensions(edges: EdgeId[], amount: number = 20): PanelBuilder {
    for (const edge of edges) {
      this.withExtension(edge, amount);
    }
    return this;
  }

  withCutout(shape: Shape): PanelBuilder {
    this.fixture._queueOperation({
      type: 'APPLY_PATH_OPERATION',
      targetId: 'main-assembly',
      payload: {
        panelId: this.panelId,
        path: shape.toPath(),
        operation: 'cutout',
      },
    });
    return this;
  }

  withCutouts(shapes: Shape[]): PanelBuilder {
    for (const shape of shapes) {
      this.withCutout(shape);
    }
    return this;
  }

  withFillet(corners: string[], radius: number): PanelBuilder {
    this.fixture._queueOperation({
      type: 'APPLY_FILLET',
      targetId: 'main-assembly',
      payload: {
        panelId: this.panelId,
        corners,
        radius,
      },
    });
    return this;
  }

  withChamfer(corners: string[], size: number): PanelBuilder {
    this.fixture._queueOperation({
      type: 'APPLY_CHAMFER',
      targetId: 'main-assembly',
      payload: {
        panelId: this.panelId,
        corners,
        size,
      },
    });
    return this;
  }

  // Presets
  asExtendedPanel(amount: number = 20): PanelBuilder {
    return this.withExtension('top', amount);
  }

  asPanelWithFeet(footWidth: number = 15, footHeight: number = 10): PanelBuilder {
    // Extension with cutouts for feet
    return this
      .withExtension('bottom', footHeight)
      .withCutout(rect(-40, -45, 20, footHeight))  // left foot gap
      .withCutout(rect(20, -45, 20, footHeight));  // right foot gap
  }

  // Terminal - return to fixture for further config or build
  and(): TestFixture {
    return this.fixture;
  }

  clone(): PanelBuilder {
    return new PanelBuilder(this.fixture.clone(), this.panelId);
  }

  build(): FixtureResult {
    return this.fixture.build();
  }
}
```

### Shape Helpers

```typescript
// src/test/fixtures/shapes.ts

export interface Shape {
  toPath(): Point2D[];
  points: number;  // for corner count calculations
}

export function rect(x: number, y: number, width: number, height: number): Shape {
  return {
    toPath: () => [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ],
    points: 4,
  };
}

export function polygon(...points: [number, number][]): Shape {
  return {
    toPath: () => points.map(([x, y]) => ({ x, y })),
    points: points.length,
  };
}
```

### Permutation Generator

```typescript
// src/test/fixtures/permute.ts

type PermutationConfig = Record<string, unknown[]>;

export function permute<T extends PermutationConfig>(
  config: T
): Array<[string, { [K in keyof T]: T[K][number] }]> {
  const keys = Object.keys(config);
  const results: Array<[string, any]> = [];

  function generate(index: number, current: Record<string, unknown>) {
    if (index === keys.length) {
      const name = keys
        .map(k => `${k}:${JSON.stringify(current[k])}`)
        .join(', ');
      results.push([name, { ...current }]);
      return;
    }

    const key = keys[index];
    for (const value of config[key]) {
      generate(index + 1, { ...current, [key]: value });
    }
  }

  generate(0, {});
  return results;
}
```

### Result Type

```typescript
// src/test/fixtures/types.ts

export interface FixtureResult {
  engine: Engine;
  panels: PanelPath[];
  panel?: PanelPath;  // The selected panel, if any
}
```

## Usage Examples

### Example 1: Testing Fillet Corner Eligibility

```typescript
describe('Fillet corner eligibility', () => {
  it('basic panel has 4 eligible corners', () => {
    const { panel } = TestFixture
      .basicBox(100, 80, 60)
      .panel('front')
      .build();

    expect(panel.allCornerEligibility.length).toBe(4);
  });

  it('panel with top extension has 6 eligible corners', () => {
    const { panel } = TestFixture
      .basicBox(100, 80, 60)
      .panel('front')
      .withExtension('top', 30)
      .build();

    // 4 base + 2 from extension
    expect(panel.allCornerEligibility.length).toBe(6);
  });

  it('panel with cutout adds cutout corners to eligible count', () => {
    const { panel } = TestFixture
      .basicBox(100, 80, 60)
      .panel('front')
      .withCutout(rect(10, 10, 20, 20))
      .build();

    // 4 base + 4 from rectangular cutout
    expect(panel.allCornerEligibility.length).toBe(8);
  });
});
```

### Example 2: Matrix Test for Extensions

```typescript
const extensionMatrix = permute({
  edges: [
    [],
    ['top'],
    ['top', 'bottom'],
    ['top', 'left'],
    ['top', 'right', 'bottom', 'left'],
  ],
});

describe.each(extensionMatrix)('extension permutations: %s', (name, { edges }) => {
  it('should have correct corner count', () => {
    const { panel } = TestFixture
      .basicBox(100, 80, 60)
      .panel('front')
      .withExtensions(edges, 20)
      .build();

    const expectedCorners = 4 + (edges.length * 2);
    expect(panel.allCornerEligibility.length).toBe(expectedCorners);
  });

  it('should produce valid geometry', () => {
    const { engine } = TestFixture
      .basicBox(100, 80, 60)
      .panel('front')
      .withExtensions(edges, 20)
      .build();

    const result = checkEngineGeometry(engine);
    expect(result.valid).toBe(true);
  });
});
```

### Example 3: Branching for Before/After Tests

```typescript
describe('Fillet application', () => {
  // Common starting point
  const base = TestFixture.basicBox(100, 80, 60).panel('front');

  it('plain panel before fillet', () => {
    const { panel } = base.clone().build();
    expect(panel.outline.points.length).toBe(4);
  });

  it('panel after fillet on one corner', () => {
    const { panel } = base.clone()
      .withFillet(['top-left'], 5)
      .build();

    // Fillet replaces corner with arc points
    expect(panel.outline.points.length).toBeGreaterThan(4);
  });

  it('extended panel before fillet', () => {
    const { panel } = base.clone()
      .withExtension('top', 30)
      .build();

    expect(panel.allCornerEligibility.length).toBe(6);
  });

  it('extended panel after fillet', () => {
    const { panel } = base.clone()
      .withExtension('top', 30)
      .withFillet(['top-left', 'extension-top-left'], 5)
      .build();

    // Verify both corners were filleted
    // ... assertions
  });
});
```

## File Structure

```
src/test/
├── fixtures/
│   ├── index.ts           # Public exports
│   ├── TestFixture.ts     # Main fixture class
│   ├── PanelBuilder.ts    # Panel operation builder
│   ├── shapes.ts          # Shape helpers (rect, polygon)
│   ├── permute.ts         # Permutation generator
│   └── types.ts           # TypeScript types
└── integration/
    └── fixtureExamples.test.ts  # Example tests using fixtures
```

## Design Decisions

1. **Lazy Execution** ✅
   - Operations queue until `.build()` is called
   - Rationale: Cleaner for branching, matches "tree of outcomes" philosophy

2. **Panel Selection Re-resolution** ✅
   - Panel IDs can change during engine clone (preview operations)
   - Solution: Store `faceId` not `panelId`; re-resolve panel by face after `.build()`
   - The `build()` method finds panel by `source.faceId` from fresh panel list

3. **Validation During Build** ✅ (if cheap)
   - Run geometry checker automatically on `.build()`
   - Optional: `build({ validate: false })` to skip for performance-sensitive tests

4. **Snapshot Testing** ✅
   - Support `toMatchSnapshot()` for panel outlines
   - Opt-in via `build({ snapshot: true })` or separate `.snapshot()` method

5. **Coverage Tracking** - Deferred to second iteration
   - Not in initial implementation
   - Future: track which matrix permutations have test coverage

## Rollout Plan

See `project-management/drafts/test-fixtures-rollout-plan.md` for detailed implementation tasks.

## Related Documents

- Testing Strategy notes (IMG_8250, IMG_8251, IMG_8252)
- `docs/geometry rules/geometry-rules.md` - Geometry constraints
- `src/engine/integration/comprehensiveGeometry.test.ts` - Existing integration tests
