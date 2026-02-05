# [TASK-test-fixtures-2-2] Extension Permutation Matrix Tests

ROLE: implement
PRIORITY: P1
BRANCH: main
CREATED: 2026-02-04T20:25:00Z
CREATED_BY: human
EXPEDITE: false
SKIP_PR: false
DEPENDS_ON: TASK-test-fixtures-2-1

## Context

Phase 2, Task 2 of the composable test fixtures rollout. This task creates matrix-driven tests that systematically test all combinations of edge extensions.

The `permute()` function from the test fixtures module generates all combinations, allowing us to test every extension scenario in a single test file.

## Task

Create matrix-driven tests for extension combinations using `permute()`.

### File to Create

`src/test/fixtures/extensionMatrix.test.ts`:

```typescript
/**
 * Extension Permutation Matrix Tests
 *
 * Systematically tests all combinations of edge extensions to verify:
 * 1. Correct corner count for each combination
 * 2. Valid geometry for all combinations
 *
 * Uses the permute() utility for matrix-driven testing.
 */

import { describe, it, expect } from 'vitest';
import { TestFixture, permute, permuteNamed } from './index';
import { checkGeometry } from '../../engine/geometryChecker';
import type { EdgeId } from './PanelBuilder';

describe('Extension Permutation Matrix', () => {
  /**
   * All possible edge combinations from 0 to 4 edges.
   * Each combination tests a different extension scenario.
   */
  const edgeCombinations: EdgeId[][] = [
    [],                                    // 0 extensions
    ['top'],                               // 1 extension
    ['bottom'],
    ['left'],
    ['right'],
    ['top', 'bottom'],                     // 2 opposite extensions
    ['left', 'right'],
    ['top', 'left'],                       // 2 adjacent extensions
    ['top', 'right'],
    ['bottom', 'left'],
    ['bottom', 'right'],
    ['top', 'bottom', 'left'],             // 3 extensions
    ['top', 'bottom', 'right'],
    ['top', 'left', 'right'],
    ['bottom', 'left', 'right'],
    ['top', 'bottom', 'left', 'right'],    // 4 extensions
  ];

  const extensionMatrix = permuteNamed(
    { edges: edgeCombinations },
    (config) => {
      if (config.edges.length === 0) return 'no extensions';
      return `extensions: ${config.edges.join(', ')}`;
    }
  );

  describe.each(extensionMatrix)('%s', (_name, { edges }) => {
    it('has correct corner count', () => {
      const { panel } = TestFixture
        .basicBox(100, 80, 60)
        .panel('front')
        .withExtensions(edges, 20)
        .build();

      // Base 4 corners + 2 corners per extension
      const expectedCorners = 4 + (edges.length * 2);

      expect(panel).toBeDefined();
      expect(panel?.allCornerEligibility?.length).toBe(expectedCorners);
    });

    it('produces valid geometry', () => {
      const { engine } = TestFixture
        .basicBox(100, 80, 60)
        .panel('front')
        .withExtensions(edges, 20)
        .build();

      const result = checkGeometry(engine);
      expect(result.valid).toBe(true);
    });
  });

  describe('extension amounts', () => {
    const amounts = [5, 10, 20, 30, 50];

    const amountMatrix = permute({
      edge: ['top', 'left'] as EdgeId[],
      amount: amounts,
    });

    describe.each(amountMatrix)('%s', (_name, { edge, amount }) => {
      it('works with varying extension amounts', () => {
        const { panel, engine } = TestFixture
          .basicBox(100, 80, 60)
          .panel('front')
          .withExtension(edge, amount)
          .build();

        // Should have 6 corners (4 base + 2 from extension)
        expect(panel?.allCornerEligibility?.length).toBe(6);

        // Geometry should be valid
        const result = checkGeometry(engine);
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('different faces', () => {
    const faceMatrix = permute({
      face: ['front', 'back', 'left', 'right', 'bottom'] as const,
      edges: [[], ['top'], ['top', 'left']] as EdgeId[][],
    });

    describe.each(faceMatrix)('%s', (_name, { face, edges }) => {
      it('works on different faces', () => {
        const { panel, engine } = TestFixture
          .basicBox(100, 80, 60)
          .panel(face)
          .withExtensions(edges, 20)
          .build();

        const expectedCorners = 4 + (edges.length * 2);
        expect(panel?.allCornerEligibility?.length).toBe(expectedCorners);

        const result = checkGeometry(engine);
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('branching from common base', () => {
    it('creates consistent results across branches', () => {
      const base = TestFixture.basicBox(100, 80, 60).panel('front');

      // Create branches for different extension counts
      const branches = edgeCombinations.map(edges => ({
        edges,
        fixture: base.clone().withExtensions(edges, 20),
      }));

      for (const branch of branches) {
        const { panel } = branch.fixture.build();
        const expectedCorners = 4 + (branch.edges.length * 2);
        expect(panel?.allCornerEligibility?.length).toBe(expectedCorners);
      }
    });
  });
});

describe('Extension Edge Cases', () => {
  it('handles very small extensions', () => {
    const { panel, engine } = TestFixture
      .basicBox(100, 80, 60)
      .panel('front')
      .withExtension('top', 1)
      .build();

    expect(panel?.allCornerEligibility?.length).toBe(6);
    expect(checkGeometry(engine).valid).toBe(true);
  });

  it('handles very large extensions', () => {
    const { panel, engine } = TestFixture
      .basicBox(100, 80, 60)
      .panel('front')
      .withExtension('top', 100) // Same as box height
      .build();

    expect(panel?.allCornerEligibility?.length).toBe(6);
    expect(checkGeometry(engine).valid).toBe(true);
  });

  it('handles multiple extensions on same edge (should use latest)', () => {
    const { panel } = TestFixture
      .basicBox(100, 80, 60)
      .panel('front')
      .withExtension('top', 10)
      .withExtension('top', 30) // Should override
      .build();

    // Still only 6 corners (1 extension)
    expect(panel?.allCornerEligibility?.length).toBe(6);
  });
});
```

### Acceptance Criteria

- [ ] All 16 edge combinations tested for correct corner count
- [ ] All combinations produce valid geometry
- [ ] Different extension amounts work correctly
- [ ] Different faces work correctly
- [ ] Branching creates consistent results
- [ ] Edge cases handled (very small/large extensions)

### Test Count

This file will generate approximately:
- 16 edge combinations × 2 tests = 32 tests
- 10 amount variations = 10 tests
- 15 face × edge combinations = 15 tests
- 5 edge case tests
- **Total: ~62 tests**

### Important Notes

1. If tests fail, document the specific combinations that fail
2. The `allCornerEligibility` property may not exist - check what's actually available on PanelPath
3. Some edge cases may reveal bugs - that's the goal of this testing

## Expected Outcomes

- Comprehensive coverage of extension scenarios
- Any failures reveal specific bugs to fix
- Baseline for future regression testing

CLAIMED_BY: impl-agent-1
CLAIMED_AT: 2026-02-04T20:25:30.626941

COMPLETED_AT: 2026-02-04T20:30:27.695937

## Result
PR created: https://github.com/maxthelion/boxen/pull/27
