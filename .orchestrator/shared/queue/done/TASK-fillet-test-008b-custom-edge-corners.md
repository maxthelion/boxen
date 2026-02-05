# [TASK-fillet-test-008b] Write failing test for custom edge corner detection

ROLE: implement
PRIORITY: P1
BRANCH: feature/fillet-all-corners-integration-tests
CREATED: 2026-02-04T21:45:00Z
CREATED_BY: human
DEPENDS_ON: TASK-fillet-test-007

## Problem

Bug 008B: Corners created by custom edge modifications (notches, extensions) are not detected by the all-corners system. Only the 4 base panel corners appear.

## Task

Write a **failing test** that verifies corners from edge extensions are detected.

## Test to Write

Add to `src/test/fixtures/allCornerEligibility.test.ts`:

```typescript
describe('Bug 008B: Custom edge corners should be detected', () => {
  it('panel with edge extension should have 6 corners (4 base + 2 extension)', () => {
    // A panel with one extended edge creates a step shape
    // This adds 2 new corners where the extension meets the original edge
    const { panel } = TestFixture.basicBox(100, 80, 60)
      .withOpenFaces(['top', 'left'])  // Make edges open for extension
      .panel('front')
      .withExtension('top', 20)
      .build();

    // Count all detected corners (not just eligible ones)
    const allCorners = panel.allCornerEligibility ?? [];

    // BUG: May only return 4 corners (the base corners)
    // EXPECTED: 6 corners (4 base + 2 from extension step)
    expect(allCorners.length).toBeGreaterThanOrEqual(6);
  });

  it('panel with 2 adjacent extensions should have 8 corners', () => {
    const { panel } = TestFixture.basicBox(100, 80, 60)
      .withOpenFaces(['top', 'left'])
      .panel('front')
      .withExtension('top', 20)
      .withExtension('left', 20)
      .build();

    const allCorners = panel.allCornerEligibility ?? [];

    // 4 base + 2 from top extension + 2 from left extension = 8
    expect(allCorners.length).toBeGreaterThanOrEqual(8);
  });

  it('extension corners on open edges should be eligible', () => {
    const { panel } = TestFixture.basicBox(100, 80, 60)
      .withOpenFaces(['top', 'left'])
      .panel('front')
      .withExtension('top', 20)
      .build();

    const eligibleCorners = panel.allCornerEligibility?.filter(c => c.eligible) ?? [];

    // The extension creates 2 new corners on the top edge
    // Since top edge is open (no joints), these should be eligible
    // Plus the original left:top corner
    expect(eligibleCorners.length).toBeGreaterThanOrEqual(3);
  });

  it('cutout corners should be detected and eligible', () => {
    const { panel } = TestFixture.basicBox(100, 80, 60)
      .withOpenFaces(['top'])  // Just need to build
      .panel('front')
      .withCutout({ type: 'rect', center: { x: 0, y: 0 }, width: 20, height: 20, id: 'test-cutout' })
      .build();

    const allCorners = panel.allCornerEligibility ?? [];
    const holeCorners = allCorners.filter(c => c.location === 'hole' || c.id.includes('hole'));

    // Rectangular cutout should add 4 corners
    // BUG: May return 0 hole corners
    expect(holeCorners.length).toBe(4);

    // Cutout corners in center of panel should be eligible (away from edges)
    const eligibleHoleCorners = holeCorners.filter(c => c.eligible);
    expect(eligibleHoleCorners.length).toBe(4);
  });
});
```

## Acceptance Criteria

- [ ] Tests added to `src/test/fixtures/allCornerEligibility.test.ts`
- [ ] Tests run and **FAIL** (proving the bug exists)
- [ ] Tests verify both corner detection AND eligibility for custom geometry

## Notes

- The PanelBuilder may need `withCutout` to accept the cutout shape directly
- Check the actual format of `allCornerEligibility` entries for location/id patterns
- Extension corners should be detectable from the outline geometry

CLAIMED_BY: impl-agent-1
CLAIMED_AT: 2026-02-04T21:52:47.669474

COMPLETED_AT: 2026-02-04T21:56:08.218087

## Result
PR created: https://github.com/maxthelion/boxen/pull/33
