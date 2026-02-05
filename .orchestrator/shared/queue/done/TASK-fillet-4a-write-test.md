# Write Fillet Integration Test

CREATED: 2026-02-04T13:20:00Z
PRIORITY: P1
COMPLEXITY: S
ROLE: implement
BRANCH: feature/fillet-all-corners-integration-tests
SKIP_PR: true

## Context

This is a micro-task. Previous exploration found the fillet code path:
1. `corner-fillet` operation in `src/operations/registry.ts`
2. `createPreviewAction` returns `SET_CORNER_FILLETS_BATCH` action
3. Engine dispatches to `assembly.setPanelCornerFillet()`
4. Panel regeneration calls `applyFilletsToOutline()` in `BasePanel.ts`

## DO NOT EXPLORE

The code path is documented above. Do NOT spend turns reading the codebase. Go directly to writing the test.

## Task

Create a single integration test file that:
1. Creates an engine with a simple assembly
2. Gets a face panel
3. Dispatches `SET_CORNER_FILLETS_BATCH` with a corner and radius
4. Checks that `panel.outline.points.length` increased (fillet adds arc points)

## Exact File to Create

`src/engine/integration/fillet.test.ts`

## Test Template

```typescript
import { describe, it, expect } from 'vitest';
import { createEngineWithAssembly, defaultMaterial } from './testHelpers';
import { generatePanelsFromNodes } from '../panelBridge';

describe('Fillet Integration', () => {
  it('should add points to outline when fillet is applied', () => {
    const engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);
    const panelsBefore = generatePanelsFromNodes(engine.getSnapshot());
    const topPanel = panelsBefore.find(p => p.source.faceId === 'top');

    const pointsBefore = topPanel!.outline.points.length;

    // Apply fillet to a corner
    engine.dispatch({
      type: 'SET_CORNER_FILLETS_BATCH',
      targetId: 'main-assembly',
      payload: {
        fillets: [{
          panelId: topPanel!.id,
          corner: 'left:top',  // or whatever format corners use
          radius: 5,
        }]
      }
    });

    const panelsAfter = generatePanelsFromNodes(engine.getSnapshot());
    const topPanelAfter = panelsAfter.find(p => p.id === topPanel!.id);

    expect(topPanelAfter!.outline.points.length).toBeGreaterThan(pointsBefore);
  });
});
```

## Acceptance Criteria

- [ ] Test file exists at `src/engine/integration/fillet.test.ts`
- [ ] Test runs (may pass or fail - we need to see what happens)
- [ ] Commit the test file

## What NOT to do

- Do NOT explore the codebase
- Do NOT try to fix anything
- Do NOT modify any files except the test file
- Just write the test and commit it

CLAIMED_BY: impl-agent-1
CLAIMED_AT: 2026-02-04T13:19:52.623530

COMPLETED_AT: 2026-02-04T13:24:11.171925

## Result
Merged directly to feature/fillet-all-corners-integration-tests
