# [TASK-test-fixtures-1-5] Create Index and Exports

ROLE: implement
PRIORITY: P1
BRANCH: main
CREATED: 2026-02-04T19:45:00Z
CREATED_BY: human
EXPEDITE: false
SKIP_PR: false
DEPENDS_ON: TASK-test-fixtures-1-1, TASK-test-fixtures-1-2, TASK-test-fixtures-1-3, TASK-test-fixtures-1-4

## Context

This is Task 1.5, the final task of Phase 1. It depends on all other Phase 1 tasks. See `project-management/drafts/composable-test-fixtures-rfc.md` for full design.

## Task

Create the public exports for the test fixtures module and verify everything works together.

### File to Create

`src/test/fixtures/index.ts`:

```typescript
// Core fixture class
export { TestFixture } from './TestFixture';

// Panel builder (may be needed for advanced usage)
export { PanelBuilder } from './PanelBuilder';

// Shape helpers
export { rect, polygon, circle, lShape } from './shapes';
export type { Shape } from './shapes';

// Permutation utilities
export { permute, permuteNamed, countPermutations } from './permute';

// Types
export type { FixtureResult, QueuedOperation } from './types';
```

### Integration Test

Create `src/test/fixtures/integration.test.ts` that verifies the full workflow:

```typescript
import { describe, it, expect } from 'vitest';
import { TestFixture, rect, permute } from './index';
import { checkEngineGeometry } from '../../engine/geometryChecker';

describe('Test Fixtures Integration', () => {
  describe('basic workflow', () => {
    it('creates and builds a fixture', () => {
      const { engine, panels, panel } = TestFixture
        .basicBox(100, 80, 60)
        .panel('front')
        .build();

      expect(engine).toBeDefined();
      expect(panels.length).toBe(5);
      expect(panel).toBeDefined();
      expect(panel?.source.faceId).toBe('front');
    });

    it('produces valid geometry', () => {
      const { engine } = TestFixture.basicBox(100, 80, 60).build();
      const result = checkEngineGeometry(engine);
      expect(result.valid).toBe(true);
    });
  });

  describe('branching workflow', () => {
    it('creates independent branches', () => {
      const base = TestFixture.basicBox(100, 80, 60);

      const branch1 = base.clone().withOpenFaces(['top']);
      const branch2 = base.clone().withOpenFaces(['top', 'front']);

      const { panels: panels1 } = branch1.build();
      const { panels: panels2 } = branch2.build();

      expect(panels1.length).toBe(5);
      expect(panels2.length).toBe(4);
    });
  });

  describe('matrix workflow', () => {
    const matrix = permute({
      openFaces: [['top'], ['top', 'front']],
    });

    describe.each(matrix)('with %s', (name, { openFaces }) => {
      it('creates valid geometry', () => {
        const { engine } = TestFixture
          .basicBox(100, 80, 60)
          .withOpenFaces(openFaces)
          .build();

        const result = checkEngineGeometry(engine);
        expect(result.valid).toBe(true);
      });

      it('has expected panel count', () => {
        const { panels } = TestFixture
          .basicBox(100, 80, 60)
          .withOpenFaces(openFaces)
          .build();

        const expectedCount = 6 - openFaces.length;
        expect(panels.length).toBe(expectedCount);
      });
    });
  });

  describe('shape helpers', () => {
    it('rect creates valid shape', () => {
      const shape = rect(10, 10, 20, 20);
      expect(shape.points).toBe(4);
      expect(shape.toPath()).toHaveLength(4);
    });
  });
});
```

### Update tsconfig if needed

Ensure the `src/test/` directory is included in TypeScript compilation for tests.

### Acceptance Criteria

- [ ] All exports available from `'../test/fixtures'`
- [ ] `import { TestFixture, rect, permute } from '../test/fixtures'` works
- [ ] TypeScript types are properly exported
- [ ] Integration test passes
- [ ] All Phase 1 tests pass: `npm run test:run -- src/test/fixtures/`

### Verification Command

```bash
npm run test:run -- src/test/fixtures/
```

All tests in `src/test/fixtures/` should pass.

## Notes

- This task ties together all Phase 1 work
- After this task, Phase 2 (eligible points testing) can begin
- Ensure no circular dependencies between files

CLAIMED_BY: impl-agent-1
CLAIMED_AT: 2026-02-04T20:04:53.056177

COMPLETED_AT: 2026-02-04T20:07:22.125527

## Result
PR created: https://github.com/maxthelion/boxen/pull/22

CLAIMED_BY: impl-agent-2
CLAIMED_AT: 2026-02-04T20:13:33.131417

COMPLETED_AT: 2026-02-04T20:17:29.677943

## Result
PR created: https://github.com/maxthelion/boxen/pull/25
