# [TASK-test-fixtures-2-1] Basic Eligible Points Tests

ROLE: implement
PRIORITY: P1
BRANCH: main
CREATED: 2026-02-04T20:25:00Z
CREATED_BY: human
EXPEDITE: false
SKIP_PR: false

## Context

Phase 2 of the composable test fixtures rollout. Phase 1 is complete - the test fixture system is now available in `src/test/fixtures/`.

This task uses the new fixture system to test fillet corner eligibility across different panel configurations. The goal is to verify that `panel.allCornerEligibility` returns the correct number of corners for various panel states.

## Task

Create tests for fillet corner eligibility using the new TestFixture system.

### File to Create

`src/test/fixtures/filletEligibility.test.ts`:

```typescript
/**
 * Fillet Corner Eligibility Tests
 *
 * Tests that verify panels report correct eligible corners for fillet operations.
 * Uses the composable test fixture system for easy scenario setup.
 */

import { describe, it, expect } from 'vitest';
import { TestFixture, rect } from './index';
import { checkGeometry } from '../../engine/geometryChecker';

describe('Fillet corner eligibility', () => {
  describe('basic panels (no extensions)', () => {
    it('basic panel has 4 eligible corners', () => {
      const { panel } = TestFixture
        .basicBox(100, 80, 60)
        .panel('front')
        .build();

      expect(panel).toBeDefined();
      // A basic rectangular panel should have 4 corners eligible for fillet
      expect(panel?.allCornerEligibility?.length).toBe(4);
    });

    it('all face panels have 4 eligible corners', () => {
      const faces = ['front', 'back', 'left', 'right', 'bottom'] as const;

      for (const face of faces) {
        const { panel } = TestFixture
          .basicBox(100, 80, 60)
          .panel(face)
          .build();

        expect(panel).toBeDefined();
        expect(panel?.allCornerEligibility?.length).toBe(4);
      }
    });

    it('enclosed box panels have 4 eligible corners', () => {
      const { panel } = TestFixture
        .enclosedBox(100, 80, 60)
        .panel('front')
        .build();

      expect(panel?.allCornerEligibility?.length).toBe(4);
    });
  });

  describe('panels with extensions', () => {
    it('panel with 1 extension has 6 eligible corners', () => {
      const { panel } = TestFixture
        .basicBox(100, 80, 60)
        .panel('front')
        .withExtension('top', 30)
        .build();

      // 4 base corners + 2 from extension = 6
      expect(panel?.allCornerEligibility?.length).toBe(6);
    });

    it('panel with 2 adjacent extensions has 8 eligible corners', () => {
      const { panel } = TestFixture
        .basicBox(100, 80, 60)
        .panel('front')
        .withExtension('top', 30)
        .withExtension('right', 20)
        .build();

      // 4 base + 2 + 2 = 8
      expect(panel?.allCornerEligibility?.length).toBe(8);
    });

    it('panel with 2 opposite extensions has 8 eligible corners', () => {
      const { panel } = TestFixture
        .basicBox(100, 80, 60)
        .panel('front')
        .withExtension('top', 30)
        .withExtension('bottom', 20)
        .build();

      // 4 base + 2 + 2 = 8
      expect(panel?.allCornerEligibility?.length).toBe(8);
    });

    it('panel with 3 extensions has 10 eligible corners', () => {
      const { panel } = TestFixture
        .basicBox(100, 80, 60)
        .panel('front')
        .withExtensions(['top', 'left', 'right'], 20)
        .build();

      // 4 base + 2 + 2 + 2 = 10
      expect(panel?.allCornerEligibility?.length).toBe(10);
    });

    it('panel with 4 extensions has 12 eligible corners', () => {
      const { panel } = TestFixture
        .basicBox(100, 80, 60)
        .panel('front')
        .withExtensions(['top', 'bottom', 'left', 'right'], 20)
        .build();

      // 4 base + 4*2 = 12
      expect(panel?.allCornerEligibility?.length).toBe(12);
    });
  });

  describe('panels with cutouts', () => {
    it('panel with rectangular cutout has 8 eligible corners', () => {
      const { panel } = TestFixture
        .basicBox(100, 80, 60)
        .panel('front')
        .withCutout(rect(10, 10, 20, 20))
        .build();

      // 4 base + 4 from rectangular cutout = 8
      expect(panel?.allCornerEligibility?.length).toBe(8);
    });

    it('panel with 2 cutouts has 12 eligible corners', () => {
      const { panel } = TestFixture
        .basicBox(100, 80, 60)
        .panel('front')
        .withCutout(rect(-30, 10, 15, 15))
        .withCutout(rect(15, 10, 15, 15))
        .build();

      // 4 base + 4 + 4 = 12
      expect(panel?.allCornerEligibility?.length).toBe(12);
    });
  });

  describe('panels with extensions AND cutouts', () => {
    it('extended panel with cutout combines corners correctly', () => {
      const { panel } = TestFixture
        .basicBox(100, 80, 60)
        .panel('front')
        .withExtension('top', 30)
        .withCutout(rect(10, 10, 20, 20))
        .build();

      // 4 base + 2 from extension + 4 from cutout = 10
      expect(panel?.allCornerEligibility?.length).toBe(10);
    });
  });

  describe('geometry validity', () => {
    it('all test scenarios produce valid geometry', () => {
      const scenarios = [
        TestFixture.basicBox(100, 80, 60).panel('front'),
        TestFixture.basicBox(100, 80, 60).panel('front').withExtension('top', 30),
        TestFixture.basicBox(100, 80, 60).panel('front').withExtensions(['top', 'left'], 20),
        TestFixture.basicBox(100, 80, 60).panel('front').withCutout(rect(10, 10, 20, 20)),
      ];

      for (const scenario of scenarios) {
        const { engine } = scenario.build();
        const result = checkGeometry(engine);
        expect(result.valid).toBe(true);
      }
    });
  });
});
```

### Acceptance Criteria

- [ ] Tests pass for basic panels (4 corners)
- [ ] Tests pass for panels with 1-4 extensions
- [ ] Tests pass for panels with cutouts
- [ ] Tests pass for panels with both extensions and cutouts
- [ ] All test scenarios produce valid geometry
- [ ] Any failing tests indicate bugs to document

### Important Notes

1. **If tests fail**, that indicates bugs in the fillet eligibility system. Document which tests fail and what the actual vs expected values are.

2. The `panel.allCornerEligibility` property should exist on PanelPath. If it doesn't exist, check `panel.cornerEligibility` or investigate how corner eligibility is exposed.

3. This task is diagnostic - we expect some tests may fail, revealing bugs to fix.

## Expected Outcomes

- If all tests pass: Fillet eligibility is working correctly
- If some tests fail: Document the failures as bugs for follow-up tasks

CLAIMED_BY: impl-agent-2
CLAIMED_AT: 2026-02-04T20:25:10.127151

COMPLETED_AT: 2026-02-04T20:29:32.226851

## Result
PR created: https://github.com/maxthelion/boxen/pull/26
