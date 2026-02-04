/**
 * All-Corner Eligibility Tests (Bug 007)
 *
 * Tests that verify finger joint corners are correctly marked as INELIGIBLE
 * for fillet operations. The bug is that corners created by finger joint
 * geometry (the many small corners in the finger pattern) are incorrectly
 * being marked as eligible.
 *
 * Key insight: A corner should only be eligible for filleting if BOTH
 * adjacent edges are "open" (no finger joints). Corners that are part of
 * finger joint geometry should always be ineligible because they're
 * mechanical joints, not intentional design corners.
 *
 * Note: We access allCornerEligibility through the engine's snapshot (derived.allCornerEligibility)
 * rather than through TestFixture's panel result, because the panelBridge currently doesn't
 * pass through allCornerEligibility to the PanelPath type.
 */

import { describe, it, expect } from 'vitest';
import { TestFixture } from './index';
import type { FaceId } from '../../types';
import type { AllCornerEligibility } from '../../engine/types';

/**
 * Helper to get a panel's allCornerEligibility from the engine snapshot.
 * The TestFixture's panel property goes through panelBridge which doesn't include allCornerEligibility,
 * so we need to access the engine's raw snapshot.
 */
function getPanelAllCornerEligibility(
  engine: ReturnType<typeof TestFixture.basicBox>['_getEngine'] extends () => infer E ? E : never,
  faceId: FaceId
): AllCornerEligibility[] | undefined {
  const snapshot = engine.getSnapshot();
  // snapshot.children[0] is the AssemblyNode, which has derived.panels
  const assemblySnapshot = snapshot.children[0] as any;
  const panels = assemblySnapshot?.derived?.panels ?? [];
  const panel = panels.find(
    (p: any) => p.kind === 'face-panel' && p.props?.faceId === faceId
  );
  return panel?.derived?.allCornerEligibility;
}

/**
 * Helper to get eligible corners with position info for debugging.
 */
function getEligibleCornerInfo(
  allCornerEligibility: AllCornerEligibility[] | undefined
): Array<{ id: string; position: { x: number; y: number }; type?: string }> {
  if (!allCornerEligibility) return [];
  return allCornerEligibility
    .filter(c => c.eligible)
    .map(c => ({ id: c.id, position: c.position, type: c.type }));
}

describe('All-corner eligibility', () => {
  describe('Bug 007: Finger joint corners should be ineligible', () => {
    it('enclosed box panel should have 0 eligible corners (all edges have joints)', () => {
      // An enclosed box has finger joints on ALL edges of every face panel.
      // Therefore, there are NO design corners that can be filleted - all
      // corners are either:
      // 1. Part of finger joint geometry (small corners from tabs/slots)
      // 2. At the intersection of two jointed edges (forbidden by both)
      //
      // The allCornerEligibility array will contain many corners (from the
      // finger joint pattern), but ALL of them should be marked ineligible.
      const { engine } = TestFixture.enclosedBox(100, 80, 60)
        .panel('front')
        .build();

      const allCornerEligibility = getPanelAllCornerEligibility(engine, 'front');

      expect(allCornerEligibility).toBeDefined();

      const eligibleCorners = allCornerEligibility?.filter(c => c.eligible) ?? [];
      const totalCorners = allCornerEligibility?.length ?? 0;

      // Log diagnostic info
      console.log(`Total corners detected: ${totalCorners}`);
      console.log(`Eligible corners: ${eligibleCorners.length}`);
      if (eligibleCorners.length > 0) {
        console.log('First 5 eligible corner positions:', eligibleCorners.slice(0, 5).map(c => ({
          id: c.id,
          position: c.position,
          type: c.type,
        })));
      }

      // BUG: Currently returns many corners (all the finger joint corners)
      // EXPECTED: Should return 0 (no eligible corners when all edges have joints)
      expect(eligibleCorners.length).toBe(0);
    });

    it('panel with one open edge should have 0 eligible corners (corners need TWO open edges)', () => {
      // Disable top face - front panel's top edge becomes open (no joints)
      // BUT: the left and right edges still have joints (mating with left/right panels)
      //      and the bottom edge still has joints (mating with bottom panel)
      //
      // A corner is only eligible if BOTH adjacent edges are open.
      // - Top-left corner: top edge is open, but left edge has joints -> INELIGIBLE
      // - Top-right corner: top edge is open, but right edge has joints -> INELIGIBLE
      // - Bottom-left corner: both edges have joints -> INELIGIBLE
      // - Bottom-right corner: both edges have joints -> INELIGIBLE
      //
      // Therefore: 0 eligible corners (even though one edge is open)
      const { engine } = TestFixture.basicBox(100, 80, 60)
        .withOpenFaces(['top'])  // basicBox already has top open, but be explicit
        .panel('front')
        .build();

      const allCornerEligibility = getPanelAllCornerEligibility(engine, 'front');

      expect(allCornerEligibility).toBeDefined();

      const eligibleCorners = allCornerEligibility?.filter(c => c.eligible) ?? [];

      // Log diagnostic info
      console.log(`Corners with one open edge: ${eligibleCorners.length}`);
      if (eligibleCorners.length > 0) {
        console.log('Eligible corners:', getEligibleCornerInfo(allCornerEligibility));
      }

      // BUG: May return finger joint corners from other edges
      // EXPECTED: Should return exactly 0 (corners need TWO open edges)
      expect(eligibleCorners.length).toBe(0);
    });

    it('panel with two adjacent open edges should have 1 eligible corner', () => {
      // Disable top and left faces - this makes:
      // - Front panel's top edge: OPEN (no top face to joint with)
      // - Front panel's left edge: OPEN (no left face to joint with)
      // - Front panel's bottom edge: has joints (mating with bottom panel)
      // - Front panel's right edge: has joints (mating with right panel)
      //
      // A corner is only eligible if BOTH adjacent edges are open:
      // - Top-left corner: BOTH edges open -> ELIGIBLE (this is the only one!)
      // - Top-right corner: top open, right has joints -> INELIGIBLE
      // - Bottom-left corner: left open, bottom has joints -> INELIGIBLE
      // - Bottom-right corner: both have joints -> INELIGIBLE
      //
      // EXPECTED: Exactly 1 corner (top-left) should be eligible
      const { engine } = TestFixture.basicBox(100, 80, 60)
        .withOpenFaces(['top', 'left'])
        .panel('front')
        .build();

      const allCornerEligibility = getPanelAllCornerEligibility(engine, 'front');

      expect(allCornerEligibility).toBeDefined();

      const eligibleCorners = allCornerEligibility?.filter(c => c.eligible) ?? [];

      // Log diagnostic info
      console.log(`Corners with two adjacent open edges: ${eligibleCorners.length}`);
      if (eligibleCorners.length > 0) {
        console.log('Eligible corners:', getEligibleCornerInfo(allCornerEligibility));
      }

      // EXPECTED: Exactly 1 corner (top-left where both adjacent edges are open)
      expect(eligibleCorners.length).toBe(1);
    });

    it('panel with two opposite open edges should have 0 eligible corners', () => {
      // Disable top and bottom faces - this makes:
      // - Front panel's top edge: OPEN
      // - Front panel's bottom edge: OPEN
      // - Front panel's left edge: has joints (mating with left panel)
      // - Front panel's right edge: has joints (mating with right panel)
      //
      // A corner needs BOTH adjacent edges open:
      // - Top-left: top open, left has joints -> INELIGIBLE
      // - Top-right: top open, right has joints -> INELIGIBLE
      // - Bottom-left: bottom open, left has joints -> INELIGIBLE
      // - Bottom-right: bottom open, right has joints -> INELIGIBLE
      //
      // EXPECTED: 0 eligible corners (no adjacent open edges)
      const { engine } = TestFixture.basicBox(100, 80, 60)
        .withOpenFaces(['top', 'bottom'])
        .panel('front')
        .build();

      const allCornerEligibility = getPanelAllCornerEligibility(engine, 'front');

      const eligibleCorners = allCornerEligibility?.filter(c => c.eligible) ?? [];

      console.log(`Corners with two opposite open edges: ${eligibleCorners.length}`);

      // EXPECTED: 0 eligible corners (opposite edges don't share a corner)
      expect(eligibleCorners.length).toBe(0);
    });

    it('panel with three open edges should have 2 eligible corners', () => {
      // Disable top, left, and right faces:
      // - Front panel's top edge: OPEN
      // - Front panel's left edge: OPEN
      // - Front panel's right edge: OPEN
      // - Front panel's bottom edge: has joints (mating with bottom panel)
      //
      // - Top-left: both open -> ELIGIBLE
      // - Top-right: both open -> ELIGIBLE
      // - Bottom-left: left open, bottom has joints -> INELIGIBLE
      // - Bottom-right: right open, bottom has joints -> INELIGIBLE
      //
      // EXPECTED: 2 eligible corners (top-left and top-right)
      const { engine } = TestFixture.basicBox(100, 80, 60)
        .withOpenFaces(['top', 'left', 'right'])
        .panel('front')
        .build();

      const allCornerEligibility = getPanelAllCornerEligibility(engine, 'front');

      const eligibleCorners = allCornerEligibility?.filter(c => c.eligible) ?? [];

      console.log(`Corners with three open edges: ${eligibleCorners.length}`);

      // EXPECTED: 2 eligible corners (top-left and top-right)
      expect(eligibleCorners.length).toBe(2);
    });

    it('panel with all four edges open should have 4 eligible corners', () => {
      // Disable all faces except front:
      // All edges are OPEN -> all 4 corners should be ELIGIBLE
      const { engine } = TestFixture.basicBox(100, 80, 60)
        .withOpenFaces(['top', 'bottom', 'left', 'right', 'back'])
        .panel('front')
        .build();

      const allCornerEligibility = getPanelAllCornerEligibility(engine, 'front');

      const eligibleCorners = allCornerEligibility?.filter(c => c.eligible) ?? [];

      console.log(`Corners with all four edges open: ${eligibleCorners.length}`);

      // EXPECTED: 4 eligible corners (all panel corners are free)
      expect(eligibleCorners.length).toBe(4);
    });
  });

  describe('Corner count sanity checks', () => {
    it('enclosed box panel should detect many corners (from finger joints)', () => {
      // An enclosed box panel has complex finger joint geometry
      // The total corner count should be much higher than 4
      const { engine } = TestFixture.enclosedBox(100, 80, 60)
        .panel('front')
        .build();

      const allCornerEligibility = getPanelAllCornerEligibility(engine, 'front');

      const totalCorners = allCornerEligibility?.length ?? 0;

      console.log(`Total corners in enclosed box panel: ${totalCorners}`);

      // Finger joints create many corners - should be way more than the 4 design corners
      // A typical panel might have 50-150 corners depending on finger joint settings
      expect(totalCorners).toBeGreaterThan(20);
    });

    it('panel with all edges open should have exactly 4 corners', () => {
      // When all edges are open, the panel is a simple rectangle with 4 corners
      const { engine } = TestFixture.basicBox(100, 80, 60)
        .withOpenFaces(['top', 'bottom', 'left', 'right', 'back'])
        .panel('front')
        .build();

      const allCornerEligibility = getPanelAllCornerEligibility(engine, 'front');

      const totalCorners = allCornerEligibility?.length ?? 0;

      console.log(`Total corners with all edges open: ${totalCorners}`);

      // With no finger joints, should be exactly 4 corners (rectangle)
      expect(totalCorners).toBe(4);
    });
  });
});
