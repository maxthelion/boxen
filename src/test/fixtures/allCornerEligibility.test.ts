/**
 * All-Corner Eligibility Tests
 *
 * Tests for the all-corners fillet system that allows filleting any corner
 * in panel geometry (not just the 4 outer corners).
 *
 * Bug 007: Finger joint corners are incorrectly marked as eligible
 * Bug 008B: Corners from custom edge modifications (extensions, cutouts) are not detected
 */

import { describe, it, expect } from 'vitest';
import { TestFixture, rect } from './index';
import type { AllCornerEligibility } from '../../engine/types';

/**
 * Helper to get allCornerEligibility from engine snapshot for a given face.
 * The TestFixture's PanelPath doesn't include allCornerEligibility,
 * so we need to access the engine snapshot directly.
 */
function getAllCornerEligibility(
  engine: ReturnType<typeof TestFixture.basicBox>['_getEngine'] extends () => infer E ? E : never,
  faceId: string
): AllCornerEligibility[] {
  const snapshot = engine.getSnapshot();
  const assembly = snapshot.children[0];
  const panels = assembly.derived.panels;
  const panel = panels.find(
    (p: any) => p.kind === 'face-panel' && p.props.faceId === faceId
  );
  return panel?.derived?.allCornerEligibility ?? [];
}

/**
 * Helper to get panel outline point count from engine snapshot.
 */
function getOutlinePointCount(
  engine: ReturnType<typeof TestFixture.basicBox>['_getEngine'] extends () => infer E ? E : never,
  faceId: string
): number {
  const snapshot = engine.getSnapshot();
  const assembly = snapshot.children[0];
  const panels = assembly.derived.panels;
  const panel = panels.find(
    (p: any) => p.kind === 'face-panel' && p.props.faceId === faceId
  );
  return panel?.derived?.outline?.points?.length ?? 0;
}

// =============================================================================
// Bug 007: Finger Joint Corner Filtering
// =============================================================================

describe('Bug 007: Finger joint corners should not be eligible', () => {
  describe('enclosed box (all edges have finger joints)', () => {
    it('enclosed box panel should have 0 eligible corners', () => {
      const { engine } = TestFixture.enclosedBox(100, 80, 60).panel('front').build();
      const allCorners = getAllCornerEligibility(engine, 'front');
      const eligibleCorners = allCorners.filter(c => c.eligible);

      // All 4 corners of an enclosed box panel have finger joints on both edges
      // Therefore NO corners should be eligible for filleting
      // BUG: Currently returns many eligible corners (finger joint corners)
      expect(eligibleCorners.length).toBe(0);
    });

    it('should detect many corners total (finger joint geometry)', () => {
      const { engine } = TestFixture.enclosedBox(100, 80, 60).panel('front').build();
      const allCorners = getAllCornerEligibility(engine, 'front');

      // Finger joints create many small corners in the geometry
      // This is a sanity check that corner detection is working
      expect(allCorners.length).toBeGreaterThan(20);
    });
  });

  describe('one open edge (other edges have finger joints)', () => {
    it('panel with one open edge should have 0 eligible corners', () => {
      const { engine } = TestFixture.basicBox(100, 80, 60)
        .withOpenFaces(['top'])
        .panel('front')
        .build();
      const allCorners = getAllCornerEligibility(engine, 'front');
      const eligibleCorners = allCorners.filter(c => c.eligible);

      // With only TOP face open, the front panel's top edge is straight
      // But left, right, bottom edges still have finger joints
      // The top corners have one open edge but one jointed edge = NOT eligible
      // BUG: May return finger joint corners as eligible
      expect(eligibleCorners.length).toBe(0);
    });
  });

  describe('two adjacent open edges (one free corner)', () => {
    it('panel with two adjacent open edges should have 1 eligible corner', () => {
      const { engine } = TestFixture.basicBox(100, 80, 60)
        .withOpenFaces(['top', 'left'])
        .panel('front')
        .build();
      const allCorners = getAllCornerEligibility(engine, 'front');
      const eligibleCorners = allCorners.filter(c => c.eligible);

      // With TOP and LEFT faces open, the front panel has:
      // - top edge: straight (no joints)
      // - left edge: straight (no joints)
      // - right edge: finger joints
      // - bottom edge: finger joints
      // Only the top-left corner has BOTH edges free = 1 eligible corner
      // BUG: May return many corners (finger joint corners)
      expect(eligibleCorners.length).toBe(1);
    });
  });

  describe('two opposite open edges (no free corners)', () => {
    it('panel with two opposite open edges should have 0 eligible corners', () => {
      const { engine } = TestFixture.basicBox(100, 80, 60)
        .withOpenFaces(['top', 'bottom'])
        .panel('front')
        .build();
      const allCorners = getAllCornerEligibility(engine, 'front');
      const eligibleCorners = allCorners.filter(c => c.eligible);

      // With TOP and BOTTOM faces open, the front panel has:
      // - top edge: straight
      // - bottom edge: straight
      // - left edge: finger joints
      // - right edge: finger joints
      // No corner has BOTH edges free = 0 eligible corners
      expect(eligibleCorners.length).toBe(0);
    });
  });

  describe('three open edges (two free corners)', () => {
    it('panel with three open edges should have 2 eligible corners', () => {
      const { engine } = TestFixture.basicBox(100, 80, 60)
        .withOpenFaces(['top', 'left', 'right'])
        .panel('front')
        .build();
      const allCorners = getAllCornerEligibility(engine, 'front');
      const eligibleCorners = allCorners.filter(c => c.eligible);

      // With TOP, LEFT, RIGHT faces open:
      // - top edge: straight
      // - left edge: straight
      // - right edge: straight
      // - bottom edge: finger joints
      // Top-left and top-right corners have BOTH edges free = 2 eligible
      // BUG: May return many corners (finger joint corners)
      expect(eligibleCorners.length).toBe(2);
    });
  });

  describe('four open edges (all corners free)', () => {
    it('panel with all four adjacent faces open should have 4 eligible corners', () => {
      const { engine } = TestFixture.basicBox(100, 80, 60)
        .withOpenFaces(['top', 'bottom', 'left', 'right'])
        .panel('front')
        .build();
      const allCorners = getAllCornerEligibility(engine, 'front');
      const eligibleCorners = allCorners.filter(c => c.eligible);

      // With all 4 adjacent faces open, the front panel is a simple rectangle
      // All 4 corners have both edges free
      expect(eligibleCorners.length).toBe(4);
    });

    it('panel with all open edges should have exactly 4 corners total', () => {
      const { engine } = TestFixture.basicBox(100, 80, 60)
        .withOpenFaces(['top', 'bottom', 'left', 'right'])
        .panel('front')
        .build();
      const allCorners = getAllCornerEligibility(engine, 'front');

      // Without finger joints, there should be exactly 4 corners
      expect(allCorners.length).toBe(4);
    });
  });
});

// =============================================================================
// Bug 008B: Custom Edge Corners Should Be Detected
// =============================================================================

describe('Bug 008B: Custom edge corners should be detected', () => {
  it('panel with edge extension should have 6 corners (4 base + 2 extension)', () => {
    // A panel with one extended edge creates a step shape
    // This adds 2 new corners where the extension meets the original edge
    const { engine } = TestFixture.basicBox(100, 80, 60)
      .withOpenFaces(['top', 'left'])  // Make edges open for extension
      .panel('front')
      .withExtension('top', 20)
      .build();

    // Count all detected corners (not just eligible ones)
    const allCorners = getAllCornerEligibility(engine, 'front');

    // BUG: May only return 4 corners (the base corners)
    // EXPECTED: 6 corners (4 base + 2 from extension step)
    // Extension creates a step: left edge goes up, then across (extension),
    // then back down to the right corner - that's 2 new corners
    expect(allCorners.length).toBeGreaterThanOrEqual(6);
  });

  it('panel with 2 adjacent extensions should have 8 corners', () => {
    const { engine } = TestFixture.basicBox(100, 80, 60)
      .withOpenFaces(['top', 'left'])
      .panel('front')
      .withExtension('top', 20)
      .withExtension('left', 20)
      .build();

    const allCorners = getAllCornerEligibility(engine, 'front');

    // 4 base + 2 from top extension + 2 from left extension = 8
    // BUG: May only return 4 corners
    expect(allCorners.length).toBeGreaterThanOrEqual(8);
  });

  it('extension corners on open edges should be eligible', () => {
    const { engine } = TestFixture.basicBox(100, 80, 60)
      .withOpenFaces(['top', 'left'])
      .panel('front')
      .withExtension('top', 20)
      .build();

    const allCorners = getAllCornerEligibility(engine, 'front');
    const eligibleCorners = allCorners.filter(c => c.eligible);

    // The extension creates 2 new corners on the top edge
    // Since top edge is open (no joints), these should be eligible
    // Plus the original left:top corner (both edges are open)
    // BUG: Extension corners may not be detected at all
    expect(eligibleCorners.length).toBeGreaterThanOrEqual(3);
  });

  it('cutout corners should be detected and eligible', () => {
    const { engine } = TestFixture.basicBox(100, 80, 60)
      .withOpenFaces(['top'])  // Just need to build
      .panel('front')
      .withCutout(rect(0, 0, 20, 20))  // Centered cutout
      .build();

    const allCorners = getAllCornerEligibility(engine, 'front');
    const holeCorners = allCorners.filter(c => c.location === 'hole');

    // Rectangular cutout should add 4 corners
    // BUG: May return 0 hole corners
    expect(holeCorners.length).toBe(4);

    // Cutout corners in center of panel should be eligible (away from edges)
    const eligibleHoleCorners = holeCorners.filter(c => c.eligible);
    expect(eligibleHoleCorners.length).toBe(4);
  });

  it('cutout corners should have correct holeId', () => {
    const { engine } = TestFixture.basicBox(100, 80, 60)
      .withOpenFaces(['top'])
      .panel('front')
      .withCutout(rect(-20, 10, 15, 15))  // First cutout
      .withCutout(rect(20, 10, 15, 15))   // Second cutout
      .build();

    const allCorners = getAllCornerEligibility(engine, 'front');
    const holeCorners = allCorners.filter(c => c.location === 'hole');

    // Two rectangular cutouts should add 8 corners total
    expect(holeCorners.length).toBe(8);

    // Each cutout's corners should have a holeId
    const uniqueHoleIds = new Set(holeCorners.map(c => c.holeId).filter(Boolean));
    expect(uniqueHoleIds.size).toBe(2);
  });

  it('extension corners should have correct IDs', () => {
    const { engine } = TestFixture.basicBox(100, 80, 60)
      .withOpenFaces(['top', 'left'])
      .panel('front')
      .withExtension('top', 20)
      .build();

    const allCorners = getAllCornerEligibility(engine, 'front');

    // All corners from extensions should be 'outline' location (not 'hole')
    // since they modify the outline, not add holes
    const outlineCorners = allCorners.filter(c => c.location === 'outline');

    // With extension, should have 6 outline corners
    expect(outlineCorners.length).toBeGreaterThanOrEqual(6);
  });
});
