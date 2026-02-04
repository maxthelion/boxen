/**
 * All-Corner Eligibility Tests
 *
 * Tests that verify panels report correct eligible corners for fillet operations
 * using the allCornerEligibility system which tracks ALL corners in panel
 * geometry (including finger joint corners and hole corners).
 *
 * Bug 007: Finger joint corners are incorrectly marked as eligible for filleting.
 * The allCornerEligibility array includes corners that are part of the finger joint
 * geometry, but these should be filtered out since they cannot be filleted.
 *
 * PREREQUISITE BUG DISCOVERED: allCornerEligibility is not passed from engine
 * to PanelPath in panelBridge.ts. This must be fixed before the eligibility
 * bug can be properly tested.
 */

import { describe, it, expect } from 'vitest';
import { TestFixture } from './index';

describe('All-corner eligibility', () => {
  describe('Prerequisite: allCornerEligibility is passed to PanelPath', () => {
    /**
     * This test verifies that allCornerEligibility is available on PanelPath.
     *
     * CURRENTLY FAILS because panelBridge.ts doesn't pass allCornerEligibility
     * from the engine snapshot to the store's PanelPath.
     *
     * The fix is to add `allCornerEligibility: derived.allCornerEligibility`
     * to the return value in panelSnapshotToPanelPath() in panelBridge.ts.
     */
    it('should have allCornerEligibility defined on panels', () => {
      const { panel } = TestFixture.basicBox(100, 80, 60)
        .panel('front')
        .build();

      expect(panel).toBeDefined();

      // This assertion FAILS - documenting the prerequisite bug
      // allCornerEligibility is computed in BasePanel.ts but not passed
      // through panelBridge.ts to the store's PanelPath type
      expect(panel?.allCornerEligibility).toBeDefined();
      expect(Array.isArray(panel?.allCornerEligibility)).toBe(true);
    });

    it('allCornerEligibility should have entries for panel with finger joints', () => {
      const { panel } = TestFixture.basicBox(100, 80, 60)
        .panel('front')
        .build();

      const corners = panel?.allCornerEligibility ?? [];

      // A panel with finger joints has many corners in its outline
      // (4 corners from the basic rectangle + 2 corners per finger)
      // Even a small panel should have more than 4 corners
      expect(corners.length).toBeGreaterThan(0);
    });
  });

  describe('Bug 007: Finger joint corners should be ineligible', () => {
    /**
     * In an enclosed box, ALL edges have finger joints (mating with adjacent panels).
     * Therefore, ZERO corners should be eligible for filleting.
     *
     * Currently, finger joint corners are incorrectly marked as eligible.
     */
    it('enclosed box panel should have 0 eligible corners (all edges have joints)', () => {
      const { panel } = TestFixture.enclosedBox(100, 80, 60)
        .panel('front')
        .build();

      expect(panel).toBeDefined();
      expect(panel?.allCornerEligibility).toBeDefined();

      const eligibleCorners = panel?.allCornerEligibility?.filter(c => c.eligible) ?? [];

      // Log actual values for diagnostic purposes
      console.log(`Enclosed box front panel:`);
      console.log(`  Total corners detected: ${panel?.allCornerEligibility?.length ?? 0}`);
      console.log(`  Eligible corners: ${eligibleCorners.length}`);
      if (eligibleCorners.length > 0) {
        console.log(`  Eligible corner IDs: ${eligibleCorners.map(c => c.id).join(', ')}`);
      }

      // BUG: Currently returns many corners (finger joint corners are included)
      // EXPECTED: 0 eligible corners when all edges have finger joints
      //
      // In an enclosed box:
      // - All 6 faces are solid (not open)
      // - All edges on each panel have finger joints (mating with adjacent panels)
      // - Therefore, NO corners should be eligible for filleting
      expect(eligibleCorners.length).toBe(0);
    });

    /**
     * With two adjacent open edges (top and left), ONLY the corner where
     * BOTH edges are free (left:top) should be eligible.
     *
     * The other corners have at least one edge with finger joints.
     */
    it('panel with two adjacent open edges should have 1 eligible corner', () => {
      // Create a box and open the top and left faces
      // For the front panel:
      // - Top edge mates with top face (now open) → should be free
      // - Left edge mates with left face (now open) → should be free
      // - Bottom edge mates with bottom face (still solid) → has joints
      // - Right edge mates with right face (still solid) → has joints
      //
      // Only the corner where two FREE edges meet (left:top) should be eligible
      const { panel } = TestFixture.basicBox(100, 80, 60)
        .withOpenFaces(['top', 'left'])
        .panel('front')
        .build();

      expect(panel).toBeDefined();
      expect(panel?.allCornerEligibility).toBeDefined();

      const eligibleCorners = panel?.allCornerEligibility?.filter(c => c.eligible) ?? [];

      // Log actual values for diagnostic purposes
      console.log(`Front panel with top+left open:`);
      console.log(`  Total corners detected: ${panel?.allCornerEligibility?.length ?? 0}`);
      console.log(`  Eligible corners: ${eligibleCorners.length}`);
      if (eligibleCorners.length > 0) {
        console.log(`  Eligible corner IDs: ${eligibleCorners.map(c => c.id).join(', ')}`);
      }

      // EXPECTED: Exactly 1 corner (left:top where both edges are open/free)
      //
      // Corner eligibility:
      // - left:top → ELIGIBLE (left edge free, top edge free)
      // - right:top → INELIGIBLE (right edge has joints)
      // - left:bottom → INELIGIBLE (bottom edge has joints)
      // - right:bottom → INELIGIBLE (both edges have joints)
      //
      // If finger joint corners are incorrectly included, we'll see many more
      // corners reported as eligible.
      expect(eligibleCorners.length).toBe(1);
    });

    /**
     * With all four adjacent faces open, the front panel becomes a simple
     * rectangle with no finger joints. All 4 outer corners should be eligible.
     */
    it('panel with all four edges open should have 4 eligible corners', () => {
      // Open all faces except front and back - the front panel should have all free edges
      const { panel } = TestFixture.basicBox(100, 80, 60)
        .withOpenFaces(['top', 'bottom', 'left', 'right'])
        .panel('front')
        .build();

      expect(panel).toBeDefined();
      expect(panel?.allCornerEligibility).toBeDefined();

      const eligibleCorners = panel?.allCornerEligibility?.filter(c => c.eligible) ?? [];

      // Log actual values for diagnostic purposes
      console.log(`Front panel with all adjacent faces open:`);
      console.log(`  Total corners detected: ${panel?.allCornerEligibility?.length ?? 0}`);
      console.log(`  Eligible corners: ${eligibleCorners.length}`);

      // EXPECTED: All 4 outer corners should be eligible (all edges are free)
      // The panel becomes a simple rectangle with no finger joints
      expect(eligibleCorners.length).toBe(4);
    });

    /**
     * In a basic box (only top open), the front panel has:
     * - Top edge: open (no adjacent panel)
     * - Bottom, Left, Right edges: have finger joints
     *
     * No corner has BOTH adjacent edges free, so 0 corners are eligible.
     */
    it('basic box (only top open) front panel should have 0 eligible corners', () => {
      const { panel } = TestFixture.basicBox(100, 80, 60)
        .panel('front')
        .build();

      expect(panel).toBeDefined();
      expect(panel?.allCornerEligibility).toBeDefined();

      const eligibleCorners = panel?.allCornerEligibility?.filter(c => c.eligible) ?? [];

      // Log actual values
      console.log(`Basic box front panel (only top open):`);
      console.log(`  Total corners detected: ${panel?.allCornerEligibility?.length ?? 0}`);
      console.log(`  Eligible corners: ${eligibleCorners.length}`);

      // EXPECTED: 0 eligible corners
      // Even though the top edge is "free", the left:top and right:top corners
      // still have one edge with joints (left and right respectively)
      expect(eligibleCorners.length).toBe(0);
    });
  });

  describe('allCornerEligibility structure (when fixed)', () => {
    it('each corner should have required properties', () => {
      const { panel } = TestFixture.basicBox(100, 80, 60)
        .panel('front')
        .build();

      expect(panel).toBeDefined();
      expect(panel?.allCornerEligibility).toBeDefined();

      const corners = panel?.allCornerEligibility ?? [];
      expect(corners.length).toBeGreaterThan(0);

      for (const corner of corners) {
        expect(corner).toHaveProperty('id');
        expect(corner).toHaveProperty('location');
        expect(corner).toHaveProperty('pathIndex');
        expect(corner).toHaveProperty('position');
        expect(corner).toHaveProperty('eligible');
        expect(corner).toHaveProperty('maxRadius');
      }
    });
  });
});
