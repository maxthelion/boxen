# [TASK-test-fixtures-1-1] Create Core TestFixture Class

ROLE: implement
PRIORITY: P1
BRANCH: main
CREATED: 2026-02-04T19:45:00Z
CREATED_BY: human
EXPEDITE: false
SKIP_PR: false

## Context

We're building a composable test fixture system for matrix-driven testing. This is Task 1.1 of the rollout plan. See `project-management/drafts/composable-test-fixtures-rfc.md` for full design.

**Create new branch:** `feature/composable-test-fixtures` from `main`

## Task

Create the core `TestFixture` class and types.

### Files to Create

1. `src/test/fixtures/types.ts`:
```typescript
import type { Engine } from '../../engine/Engine';
import type { PanelPath } from '../../engine/panelBridge';

export interface FixtureResult {
  engine: Engine;
  panels: PanelPath[];
  panel?: PanelPath;  // The selected panel, if any
}

export interface QueuedOperation {
  action: any;  // EngineAction
}
```

2. `src/test/fixtures/TestFixture.ts`:
```typescript
import { Engine } from '../../engine/Engine';
import { createEngineWithAssembly } from '../../engine/integration/testHelpers';
import { generatePanelsFromNodes } from '../../engine/panelBridge';
import type { FaceId } from '../../types';
import type { FixtureResult, QueuedOperation } from './types';

const defaultMaterial = { thickness: 3, clearance: 0.1 };

export class TestFixture {
  private engine: Engine;
  private _selectedFace: FaceId | null = null;
  private operations: QueuedOperation[] = [];

  private constructor() {
    this.engine = null as any;  // Set by factory methods
  }

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

  // Panel selection - stores faceId, resolved at build time
  panel(face: FaceId): PanelBuilder {
    this._selectedFace = face;
    return new PanelBuilder(this, face);
  }

  clone(): TestFixture {
    const copy = new TestFixture();
    copy.engine = this.engine.clone();
    copy._selectedFace = this._selectedFace;
    copy.operations = [...this.operations];
    return copy;
  }

  build(): FixtureResult {
    // Execute queued operations
    for (const op of this.operations) {
      this.engine.dispatch(op.action);
    }

    // Generate fresh panel list
    const panels = generatePanelsFromNodes(this.engine);

    // Re-resolve selected panel by faceId
    const selectedPanel = this._selectedFace
      ? panels.find(p => p.source.faceId === this._selectedFace)
      : undefined;

    return {
      engine: this.engine,
      panels,
      panel: selectedPanel,
    };
  }

  // Internal: queue operation for lazy execution
  _queueOperation(action: any): void {
    this.operations.push({ action });
  }

  // Internal: get current engine for PanelBuilder
  _getEngine(): Engine {
    return this.engine;
  }
}

// Forward declaration - PanelBuilder created in Task 1.2
// For now, create minimal stub
export class PanelBuilder {
  constructor(
    private fixture: TestFixture,
    private faceId: FaceId
  ) {}

  build(): FixtureResult {
    return this.fixture.build();
  }
}
```

### Acceptance Criteria

- [ ] `TestFixture.basicBox(100, 80, 60)` creates engine with open-top box
- [ ] `TestFixture.enclosedBox(100, 80, 60)` creates engine with all faces
- [ ] `.withOpenFaces(['top', 'front'])` configures which faces are open
- [ ] `.panel('front')` returns PanelBuilder (stub for now)
- [ ] `.clone()` creates independent deep copy
- [ ] `.build()` returns `{ engine, panels, panel }`
- [ ] Selected panel is re-resolved by faceId after build

### Test File

Create `src/test/fixtures/TestFixture.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { TestFixture } from './TestFixture';

describe('TestFixture', () => {
  it('creates basic box with open top', () => {
    const { engine, panels } = TestFixture.basicBox(100, 80, 60).build();
    expect(engine).toBeDefined();
    expect(panels.length).toBe(5);  // 6 faces - 1 open
  });

  it('creates enclosed box', () => {
    const { panels } = TestFixture.enclosedBox(100, 80, 60).build();
    expect(panels.length).toBe(6);
  });

  it('selects panel by face', () => {
    const { panel } = TestFixture.basicBox(100, 80, 60)
      .panel('front')
      .build();
    expect(panel).toBeDefined();
    expect(panel?.source.faceId).toBe('front');
  });

  it('clone creates independent copy', () => {
    const base = TestFixture.basicBox(100, 80, 60);
    const clone = base.clone();

    // Modify clone
    clone.withOpenFaces(['top', 'front']);

    // Original unchanged
    const { panels: basePanels } = base.build();
    const { panels: clonePanels } = clone.build();

    expect(basePanels.length).toBe(5);
    expect(clonePanels.length).toBe(4);
  });
});
```

## Notes

- This is Task 1.1 of 5 in Phase 1
- Task 1.2 (PanelBuilder) will expand the stub PanelBuilder class
- Use existing `createEngineWithAssembly` from test helpers

CLAIMED_BY: impl-agent-1
CLAIMED_AT: 2026-02-04T19:59:43.993501

COMPLETED_AT: 2026-02-04T20:04:43.931817

## Result
PR created: https://github.com/maxthelion/boxen/pull/19
