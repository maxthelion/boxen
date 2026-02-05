# Write Test for 2D View After Extension

CREATED: 2026-02-04T15:30:00Z
PRIORITY: P2
COMPLEXITY: S
ROLE: implement
BRANCH: main
SKIP_PR: true

## Context

Pressing Tab to switch to 2D view breaks after applying an edge extension. Need a test to reproduce this.

## Task

Write a test in `src/engine/integration/` that:

1. Creates an engine with assembly
2. Applies an edge extension (inset or push-pull)
3. Gets panel data via `generatePanelsFromNodes()`
4. Attempts to compute what SketchView2D needs (viewbox, safe space)

## Test Template

```typescript
// src/engine/integration/2dViewAfterExtension.test.ts
import { describe, it, expect } from 'vitest';
import { createEngineWithAssembly } from '../testHelpers';
import { generatePanelsFromNodes } from '../panelBridge';

describe('2D View After Extension', () => {
  it('should provide valid panel data after edge extension', () => {
    const engine = createEngineWithAssembly(100, 80, 60, {
      thickness: 3,
      fingerWidth: 10,
      clearance: 0.1,
    });

    // Apply an inset/extension to front panel
    engine.dispatch({
      type: 'SET_EDGE_INSETS',
      targetId: 'main-assembly',
      payload: {
        panelId: /* find front panel ID */,
        insets: { top: 10 }, // extend top edge
      },
    });

    // Get panel data
    const panels = generatePanelsFromNodes(engine.getSnapshot());
    const frontPanel = panels.find(p => p.source.faceId === 'front');

    expect(frontPanel).toBeDefined();
    expect(frontPanel!.outline.points.length).toBeGreaterThan(0);
    // Add more assertions for what 2D view needs
  });
});
```

## Acceptance Criteria

- [ ] Test file created
- [ ] Test reproduces the issue (fails or shows the problem)
- [ ] Commit the test

CLAIMED_BY: impl-agent-1
CLAIMED_AT: 2026-02-04T16:18:10.219180

COMPLETED_AT: 2026-02-04T16:22:41.008860

## Result
Merged directly to main
