/**
 * All Corner Eligibility Tests - Bug 008A
 *
 * Tests that verify corner eligibility correctly checks joint status on BOTH adjacent edges.
 *
 * Bug: Outer corners are shown as eligible even when their adjacent edges have finger joints.
 * A corner should only be eligible if BOTH adjacent edges are "safe" (open AND no joints).
 *
 * Corner coordinate system (panel centered at origin):
 * - Top-left: negative x, positive y
 * - Top-right: positive x, positive y
 * - Bottom-left: negative x, negative y
 * - Bottom-right: positive x, negative y
 *
 * For face panels:
 * - An edge is "open" when adjacent face is disabled (no panel there)
 * - An open edge has no finger joints -> corners on that edge could be eligible
 * - A closed edge has finger joints -> corners on that edge are ineligible
 *
 * Key insight: A corner is where TWO edges meet. Both edges must be open for the corner
 * to be eligible for a fillet operation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createEngine } from '../../engine/Engine';
import type { Engine } from '../../engine/Engine';
import type { AllCornerEligibility } from '../../utils/allCorners';
import type { FaceId } from '../../types';
import type { FacePanelSnapshot } from '../../engine/types';

const materialThickness = 3;

/**
 * Get allCornerEligibility for a face panel from the engine snapshot.
 */
function getPanelEligibility(engine: Engine, faceId: FaceId): AllCornerEligibility[] | undefined {
  const snapshot = engine.getSnapshot();
  const panels = snapshot.children[0].derived.panels;
  const panel = panels.find(
    (p: any) => p.kind === 'face-panel' && p.props.faceId === faceId
  ) as FacePanelSnapshot | undefined;
  return panel?.derived.allCornerEligibility;
}

/**
 * Helper to find corners by their approximate position.
 * Corners are at the extreme points of the panel outline.
 */
function findCornerByPosition(
  corners: AllCornerEligibility[] | undefined,
  xSign: 'positive' | 'negative',
  ySign: 'positive' | 'negative'
): AllCornerEligibility | undefined {
  if (!corners || corners.length === 0) return undefined;

  // Filter to outline corners only
  const outlineCorners = corners.filter(c => c.location === 'outline');
  if (outlineCorners.length === 0) return undefined;

  // Find the corner that matches the position criteria
  // We're looking for corners at the panel's outer bounds
  return outlineCorners.find(c => {
    const xMatch = xSign === 'positive' ? c.position.x > 0 : c.position.x < 0;
    const yMatch = ySign === 'positive' ? c.position.y > 0 : c.position.y < 0;
    return xMatch && yMatch;
  });
}

/**
 * Helper to count eligible corners by position area.
 */
function countEligibleCornersInArea(
  corners: AllCornerEligibility[] | undefined,
  xSign: 'positive' | 'negative',
  ySign: 'positive' | 'negative'
): number {
  if (!corners) return 0;

  return corners.filter(c => {
    if (!c.eligible) return false;
    if (c.location !== 'outline') return false;
    const xMatch = xSign === 'positive' ? c.position.x > 0 : c.position.x < 0;
    const yMatch = ySign === 'positive' ? c.position.y > 0 : c.position.y < 0;
    return xMatch && yMatch;
  }).length;
}

/**
 * Count total eligible outline corners.
 */
function countEligibleOutlineCorners(corners: AllCornerEligibility[] | undefined): number {
  if (!corners) return 0;
  return corners.filter(c => c.eligible && c.location === 'outline').length;
}

describe('Bug 008A: Corner eligibility must check both adjacent edges', () => {
  let engine: Engine;

  beforeEach(() => {
    engine = createEngine();
    engine.createAssembly(100, 80, 60, {
      thickness: materialThickness,
      fingerWidth: 10,
      fingerGap: 1.5,
    });
  });

  describe('corner with one jointed edge should be ineligible', () => {
    it('front panel with only top face open: left:top and right:top corners should be INELIGIBLE', () => {
      // Disable only top face
      // Front panel:
      //   - top edge is open (adjacent to disabled 'top' face)
      //   - left edge has joints (adjacent to solid 'left' face)
      //   - right edge has joints (adjacent to solid 'right' face)
      //   - bottom edge has joints (adjacent to solid 'bottom' face)
      //
      // left:top corner: top edge open, left edge has joints -> should be INELIGIBLE
      // right:top corner: top edge open, right edge has joints -> should be INELIGIBLE
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'top' },
      });

      const corners = getPanelEligibility(engine, 'front');

      expect(corners).toBeDefined();
      expect(corners!.length).toBeGreaterThan(0);

      // Find corners in the top-left and top-right areas
      const topLeftCorner = findCornerByPosition(corners, 'negative', 'positive');
      const topRightCorner = findCornerByPosition(corners, 'positive', 'positive');

      // Log for debugging
      console.log('Panel allCornerEligibility count:', corners?.length);
      console.log('Top-left corner:', topLeftCorner);
      console.log('Top-right corner:', topRightCorner);

      // BUG: These may be marked eligible because top edge is open
      // EXPECTED: Ineligible because left/right edges have joints
      expect(topLeftCorner).toBeDefined();
      expect(topRightCorner).toBeDefined();
      expect(topLeftCorner!.eligible).toBe(false);
      expect(topRightCorner!.eligible).toBe(false);
    });

    it('front panel with only left face open: corners on left edge should be INELIGIBLE', () => {
      // Disable only left face
      // Front panel:
      //   - left edge is open (adjacent to disabled 'left' face)
      //   - top edge has joints (adjacent to solid 'top' face)
      //   - right edge has joints (adjacent to solid 'right' face)
      //   - bottom edge has joints (adjacent to solid 'bottom' face)
      //
      // left:top corner: left edge open, top edge has joints -> should be INELIGIBLE
      // left:bottom corner: left edge open, bottom edge has joints -> should be INELIGIBLE
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'left' },
      });

      const corners = getPanelEligibility(engine, 'front');

      expect(corners).toBeDefined();

      // Find corners in the top-left and bottom-left areas
      const topLeftCorner = findCornerByPosition(corners, 'negative', 'positive');
      const bottomLeftCorner = findCornerByPosition(corners, 'negative', 'negative');

      // BUG: These may be marked eligible because left edge is open
      // EXPECTED: Ineligible because top/bottom edges have joints
      expect(topLeftCorner).toBeDefined();
      expect(bottomLeftCorner).toBeDefined();
      expect(topLeftCorner!.eligible).toBe(false);
      expect(bottomLeftCorner!.eligible).toBe(false);
    });
  });

  describe('corner with both edges open should be eligible', () => {
    it('front panel with top and left faces disabled: top-left corner should be ELIGIBLE', () => {
      // Disable top and left faces
      // Front panel:
      //   - top edge is open (adjacent to disabled 'top' face)
      //   - left edge is open (adjacent to disabled 'left' face)
      //   - right edge has joints (adjacent to solid 'right' face)
      //   - bottom edge has joints (adjacent to solid 'bottom' face)
      //
      // left:top corner: BOTH edges open -> should be ELIGIBLE
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'top' },
      });
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'left' },
      });

      const corners = getPanelEligibility(engine, 'front');

      expect(corners).toBeDefined();

      // Count eligible corners in the top-left area
      const eligibleInTopLeft = countEligibleCornersInArea(corners, 'negative', 'positive');

      console.log('Eligible corners in top-left area:', eligibleInTopLeft);

      // EXPECTED: Exactly 1 eligible corner in the top-left area
      expect(eligibleInTopLeft).toBe(1);
    });

    it('front panel with top and right faces disabled: top-right corner should be ELIGIBLE', () => {
      // Disable top and right faces
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'top' },
      });
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'right' },
      });

      const corners = getPanelEligibility(engine, 'front');

      expect(corners).toBeDefined();

      // Count eligible corners in the top-right area
      const eligibleInTopRight = countEligibleCornersInArea(corners, 'positive', 'positive');

      // EXPECTED: Exactly 1 eligible corner in the top-right area
      expect(eligibleInTopRight).toBe(1);
    });

    it('bottom panel with front and left faces disabled: front-left corner should be ELIGIBLE', () => {
      // Disable front and left faces
      // Bottom panel:
      //   - front edge is open (adjacent to disabled 'front' face)
      //   - left edge is open (adjacent to disabled 'left' face)
      //   - back edge has joints (adjacent to solid 'back' face)
      //   - right edge has joints (adjacent to solid 'right' face)
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'front' },
      });
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'left' },
      });

      const corners = getPanelEligibility(engine, 'bottom');

      expect(corners).toBeDefined();

      const eligibleCount = countEligibleOutlineCorners(corners);

      console.log('Eligible corners on bottom panel:', eligibleCount);

      // EXPECTED: At least 1 eligible corner (the front-left corner)
      expect(eligibleCount).toBeGreaterThan(0);
    });
  });

  describe('all 4 corners eligible only when all 4 adjacent faces disabled', () => {
    it('top panel should have 4 eligible corners when front, back, left, right are all open', () => {
      // Disable all faces adjacent to top panel (front, back, left, right)
      // Top panel edges:
      //   - front edge adjacent to 'front' face -> open
      //   - back edge adjacent to 'back' face -> open
      //   - left edge adjacent to 'left' face -> open
      //   - right edge adjacent to 'right' face -> open
      //
      // All 4 corners should be eligible
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'front' },
      });
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'back' },
      });
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'left' },
      });
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'right' },
      });

      const corners = getPanelEligibility(engine, 'top');

      expect(corners).toBeDefined();

      // Count eligible outline corners
      const eligibleCount = countEligibleOutlineCorners(corners);

      console.log('Total outline corners:', corners?.filter(c => c.location === 'outline').length);
      console.log('Eligible outline corners:', eligibleCount);

      // EXPECTED: Exactly 4 eligible corners (the 4 outer corners)
      expect(eligibleCount).toBe(4);
    });

    it('front panel with all adjacent faces open should have 4 eligible corners', () => {
      // Disable top, bottom, left, right (all faces adjacent to front panel)
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'top' },
      });
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'bottom' },
      });
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'left' },
      });
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'right' },
      });

      const corners = getPanelEligibility(engine, 'front');

      expect(corners).toBeDefined();

      const eligibleCount = countEligibleOutlineCorners(corners);

      console.log('Front panel - Total outline corners:', corners?.filter(c => c.location === 'outline').length);
      console.log('Front panel - Eligible outline corners:', eligibleCount);

      // EXPECTED: Exactly 4 eligible corners
      expect(eligibleCount).toBe(4);
    });

    it('enclosed box should have 0 eligible corners on any face', () => {
      // All faces are solid -> all edges have finger joints
      // No corners should be eligible
      // (Default state - no toggles needed)

      const corners = getPanelEligibility(engine, 'front');

      expect(corners).toBeDefined();

      const eligibleCount = countEligibleOutlineCorners(corners);

      // EXPECTED: 0 eligible corners (all edges have joints)
      expect(eligibleCount).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('panel with 3 adjacent faces open should have 2 eligible corners', () => {
      // Disable top, left, right (3 faces adjacent to front panel)
      // Front panel:
      //   - top edge: open
      //   - left edge: open
      //   - right edge: open
      //   - bottom edge: has joints (bottom face is solid)
      //
      // Expected eligible corners:
      //   - top-left: both top and left are open -> ELIGIBLE
      //   - top-right: both top and right are open -> ELIGIBLE
      //   - bottom-left: left open, bottom has joints -> INELIGIBLE
      //   - bottom-right: right open, bottom has joints -> INELIGIBLE
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'top' },
      });
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'left' },
      });
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'right' },
      });

      const corners = getPanelEligibility(engine, 'front');

      expect(corners).toBeDefined();

      const eligibleCount = countEligibleOutlineCorners(corners);

      console.log('3 open faces - Eligible outline corners:', eligibleCount);

      // EXPECTED: 2 eligible corners (top-left and top-right)
      expect(eligibleCount).toBe(2);
    });

    it('diagonally opposite open faces should have 0 eligible corners', () => {
      // Disable top and bottom (opposite faces, not adjacent on front panel)
      // Front panel:
      //   - top edge: open
      //   - bottom edge: open
      //   - left edge: has joints
      //   - right edge: has joints
      //
      // No corner has BOTH adjacent edges open
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'top' },
      });
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'bottom' },
      });

      const corners = getPanelEligibility(engine, 'front');

      expect(corners).toBeDefined();

      const eligibleCount = countEligibleOutlineCorners(corners);

      // EXPECTED: 0 eligible corners (no corner has both edges open)
      expect(eligibleCount).toBe(0);
    });
  });
});
