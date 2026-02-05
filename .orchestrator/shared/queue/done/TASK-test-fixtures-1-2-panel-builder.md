# [TASK-test-fixtures-1-2] Create PanelBuilder Class

ROLE: implement
PRIORITY: P1
BRANCH: main
CREATED: 2026-02-04T19:45:00Z
CREATED_BY: human
EXPEDITE: false
SKIP_PR: false
DEPENDS_ON: TASK-test-fixtures-1-1

## Context

This is Task 1.2 of the composable test fixtures rollout. It depends on Task 1.1 (core TestFixture class). See `project-management/drafts/composable-test-fixtures-rfc.md` for full design.

## Task

Expand the `PanelBuilder` class with panel operation methods.

### File to Update

`src/test/fixtures/PanelBuilder.ts` (extract from TestFixture.ts or create new):

```typescript
import type { FaceId } from '../../types';
import type { TestFixture } from './TestFixture';
import type { FixtureResult } from './types';
import type { Shape } from './shapes';

type EdgeId = 'top' | 'bottom' | 'left' | 'right';

export class PanelBuilder {
  constructor(
    private fixture: TestFixture,
    private faceId: FaceId
  ) {}

  withExtension(edge: EdgeId, amount: number): PanelBuilder {
    // Get panel ID for the operation
    const panels = generatePanelsFromNodes(this.fixture._getEngine());
    const panel = panels.find(p => p.source.faceId === this.faceId);
    if (!panel) throw new Error(`No panel for face ${this.faceId}`);

    this.fixture._queueOperation({
      type: 'APPLY_EDGE_OPERATION',
      targetId: 'main-assembly',
      payload: {
        panelId: panel.id,
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
    const panels = generatePanelsFromNodes(this.fixture._getEngine());
    const panel = panels.find(p => p.source.faceId === this.faceId);
    if (!panel) throw new Error(`No panel for face ${this.faceId}`);

    this.fixture._queueOperation({
      type: 'APPLY_PATH_OPERATION',
      targetId: 'main-assembly',
      payload: {
        panelId: panel.id,
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
    const panels = generatePanelsFromNodes(this.fixture._getEngine());
    const panel = panels.find(p => p.source.faceId === this.faceId);
    if (!panel) throw new Error(`No panel for face ${this.faceId}`);

    this.fixture._queueOperation({
      type: 'APPLY_FILLET',
      targetId: 'main-assembly',
      payload: {
        panelId: panel.id,
        corners,
        radius,
      },
    });
    return this;
  }

  withChamfer(corners: string[], size: number): PanelBuilder {
    const panels = generatePanelsFromNodes(this.fixture._getEngine());
    const panel = panels.find(p => p.source.faceId === this.faceId);
    if (!panel) throw new Error(`No panel for face ${this.faceId}`);

    this.fixture._queueOperation({
      type: 'APPLY_CHAMFER',
      targetId: 'main-assembly',
      payload: {
        panelId: panel.id,
        corners,
        size,
      },
    });
    return this;
  }

  // Return to fixture for further configuration
  and(): TestFixture {
    return this.fixture;
  }

  // Clone the fixture and return new PanelBuilder
  clone(): PanelBuilder {
    return new PanelBuilder(this.fixture.clone(), this.faceId);
  }

  // Terminal: build and return result
  build(): FixtureResult {
    return this.fixture.build();
  }
}
```

### Acceptance Criteria

- [ ] `.withExtension('top', 30)` queues extension operation
- [ ] `.withExtensions(['top', 'left'], 20)` queues multiple extensions
- [ ] `.withCutout(shape)` queues cutout operation
- [ ] `.withFillet(corners, radius)` queues fillet operation
- [ ] `.withChamfer(corners, size)` queues chamfer operation
- [ ] `.and()` returns to TestFixture for more configuration
- [ ] `.clone()` creates independent PanelBuilder
- [ ] All methods chainable

### Test File

Create `src/test/fixtures/PanelBuilder.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { TestFixture } from './TestFixture';
import { rect } from './shapes';

describe('PanelBuilder', () => {
  it('chains extension operations', () => {
    const { panel } = TestFixture.basicBox(100, 80, 60)
      .panel('front')
      .withExtension('top', 30)
      .build();

    // Panel should have extension (more corners)
    expect(panel?.allCornerEligibility?.length).toBeGreaterThan(4);
  });

  it('chains multiple operations', () => {
    const { panel } = TestFixture.basicBox(100, 80, 60)
      .panel('front')
      .withExtension('top', 30)
      .withExtension('bottom', 20)
      .build();

    expect(panel).toBeDefined();
  });

  it('and() returns to fixture', () => {
    const fixture = TestFixture.basicBox(100, 80, 60)
      .panel('front')
      .withExtension('top', 30)
      .and()
      .withOpenFaces(['top', 'front']);

    const { panels } = fixture.build();
    expect(panels.length).toBe(4);  // 6 - 2 open
  });
});
```

## Notes

- Operations may need adjustment based on actual engine action types
- Panel ID resolution happens at queue time (gets current panel ID)
- If engine actions don't exist yet, stub them with TODO comments

CLAIMED_BY: impl-agent-2
CLAIMED_AT: 2026-02-04T20:07:18.864360

COMPLETED_AT: 2026-02-04T20:11:46.929065

## Result
PR created: https://github.com/maxthelion/boxen/pull/24
