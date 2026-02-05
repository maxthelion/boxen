# [TASK-fillet-test-008a] Write failing test for corner eligibility with joint edges

ROLE: implement
PRIORITY: P1
BRANCH: feature/fillet-all-corners-integration-tests
CREATED: 2026-02-04T21:45:00Z
CREATED_BY: human
DEPENDS_ON: TASK-fillet-test-007

## Problem

Bug 008A: Outer corners are shown as eligible even when their adjacent edges have finger joints. A corner should only be eligible if BOTH adjacent edges are "safe" (open AND no joints).

## Task

Write a **failing test** that verifies corner eligibility correctly checks joint status.

## Test to Write

Add to `src/test/fixtures/allCornerEligibility.test.ts`:

```typescript
describe('Bug 008A: Corner eligibility must check both adjacent edges', () => {
  it('corner with one jointed edge should be ineligible', () => {
    // Disable only top face
    // Front panel: top edge is open, left/right/bottom have joints
    // left:top corner: top edge open, left edge has joints -> INELIGIBLE
    // right:top corner: top edge open, right edge has joints -> INELIGIBLE
    const { panel } = TestFixture.basicBox(100, 80, 60)
      .withOpenFaces(['top'])
      .panel('front')
      .build();

    const leftTop = panel.allCornerEligibility?.find(c =>
      c.id === 'outline:left:top' || c.position.x < 0 && c.position.y > 0
    );
    const rightTop = panel.allCornerEligibility?.find(c =>
      c.id === 'outline:right:top' || c.position.x > 0 && c.position.y > 0
    );

    // BUG: These may be marked eligible because top edge is open
    // EXPECTED: Ineligible because left/right edges have joints
    expect(leftTop?.eligible).toBe(false);
    expect(rightTop?.eligible).toBe(false);
  });

  it('corner with both edges open should be eligible', () => {
    // Disable top and left faces
    // Front panel: top and left edges are open
    // left:top corner: both edges open -> ELIGIBLE
    const { panel } = TestFixture.basicBox(100, 80, 60)
      .withOpenFaces(['top', 'left'])
      .panel('front')
      .build();

    // Find the top-left corner (negative x, positive y)
    const eligibleCorners = panel.allCornerEligibility?.filter(c => c.eligible) ?? [];
    const topLeftArea = eligibleCorners.filter(c =>
      c.position.x < 0 && c.position.y > 0
    );

    // EXPECTED: Exactly one eligible corner in the top-left area
    expect(topLeftArea.length).toBe(1);
  });

  it('all 4 corners eligible only when all 4 adjacent faces disabled', () => {
    // Disable all faces adjacent to top panel (front, back, left, right)
    // Top panel should have all 4 corners eligible
    const { panel } = TestFixture.basicBox(100, 80, 60)
      .withOpenFaces(['front', 'back', 'left', 'right'])
      .panel('top')
      .build();

    const eligibleCorners = panel.allCornerEligibility?.filter(c => c.eligible) ?? [];

    // EXPECTED: Exactly 4 eligible corners (the 4 outer corners)
    expect(eligibleCorners.length).toBe(4);
  });
});
```

## Acceptance Criteria

- [ ] Tests added to `src/test/fixtures/allCornerEligibility.test.ts`
- [ ] Tests run and **FAIL** (proving the bug exists)
- [ ] Test clearly demonstrates that joint edge check is missing

## Notes

- This test may need adjustment based on how corner IDs are formatted in `allCornerEligibility`
- The key assertion is that corners are only eligible when BOTH adjacent edges are safe

CLAIMED_BY: impl-agent-2
CLAIMED_AT: 2026-02-04T21:43:22.948076

COMPLETED_AT: 2026-02-04T21:48:17.688858

## Result
PR created: https://github.com/maxthelion/boxen/pull/29
