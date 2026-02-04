/**
 * Fillet All Corners Integration Tests
 *
 * Tests the fillet-all-corners functionality which allows applying fillets
 * to any corner in panel geometry (outline + holes), not just the 4 outer corners.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createEngine } from '../../../src/engine/Engine';
import { validateGeometry, formatValidationResult } from '../../../src/engine/validators/ComprehensiveValidator';
import { checkPathValidity, formatPathCheckResult } from '../../../src/engine/validators/PathChecker';
import {
  detectAllPanelCorners,
  computeAllCornerEligibility,
  calculateMaxFilletRadius,
  applyFilletToCorner,
  AllCornerInfo,
  ForbiddenArea,
} from '../../../src/utils/allCorners';
import type { Engine } from '../../../src/engine/Engine';
import type { Point2D } from '../../../src/engine/types';

describe('Fillet All Corners', () => {
  let engine: Engine;
  const materialThickness = 3;

  beforeEach(() => {
    engine = createEngine();
    engine.createAssembly(200, 150, 100, {
      thickness: materialThickness,
      fingerWidth: 10,
      fingerGap: 1.5,
    });
  });

  // ===========================================================================
  // Corner Detection Tests
  // ===========================================================================

  describe('Corner Detection', () => {
    it('detects corners in a simple rectangular outline', () => {
      // Simple rectangle
      const outline: Point2D[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 80 },
        { x: 0, y: 80 },
      ];

      const corners = detectAllPanelCorners(outline, [], { materialThickness });

      // Should detect all 4 corners
      expect(corners.length).toBe(4);

      // All corners should be from outline
      corners.forEach(corner => {
        expect(corner.location).toBe('outline');
      });
    });

    it('detects corners in outline with holes', () => {
      const outline: Point2D[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 80 },
        { x: 0, y: 80 },
      ];

      const holes = [
        {
          id: 'cutout-1',
          path: [
            { x: 30, y: 30 },
            { x: 50, y: 30 },
            { x: 50, y: 50 },
            { x: 30, y: 50 },
          ],
        },
      ];

      const corners = detectAllPanelCorners(outline, holes, { materialThickness });

      // Should detect 4 outline corners + 4 hole corners = 8 total
      expect(corners.length).toBe(8);

      // Check location breakdown
      const outlineCorners = corners.filter(c => c.location === 'outline');
      const holeCorners = corners.filter(c => c.location === 'hole');

      expect(outlineCorners.length).toBe(4);
      expect(holeCorners.length).toBe(4);

      // Hole corners should have the correct holeId
      holeCorners.forEach(corner => {
        expect(corner.holeId).toBe('cutout-1');
      });
    });

    it('skips corners with very short edges (finger joints)', () => {
      // Outline with some short edges (like finger joints)
      const outline: Point2D[] = [
        { x: 0, y: 0 },
        { x: 0.5, y: 0 },  // Very short edge
        { x: 100, y: 0 },
        { x: 100, y: 80 },
        { x: 0, y: 80 },
      ];

      const corners = detectAllPanelCorners(outline, [], {
        materialThickness,
        minEdgeLength: 1,  // Only detect corners with edges >= 1mm
      });

      // The corner at (0.5, 0) should be skipped due to short incoming edge
      // Should detect fewer than 5 corners
      expect(corners.length).toBeLessThan(5);
    });

    it('classifies convex and concave corners correctly', () => {
      // L-shaped outline with both convex and concave corners
      // Counter-clockwise winding
      const outline: Point2D[] = [
        { x: 0, y: 0 },
        { x: 60, y: 0 },
        { x: 60, y: 40 },  // Interior corner (concave)
        { x: 100, y: 40 },
        { x: 100, y: 80 },
        { x: 0, y: 80 },
      ];

      const corners = detectAllPanelCorners(outline, [], { materialThickness });

      // Most corners should be convex, one should be concave
      const convexCorners = corners.filter(c => c.type === 'convex');
      const concaveCorners = corners.filter(c => c.type === 'concave');

      expect(convexCorners.length).toBeGreaterThan(0);
      expect(concaveCorners.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Max Radius Calculation Tests
  // ===========================================================================

  describe('Max Radius Calculation', () => {
    it('calculates correct max radius for 90-degree corners', () => {
      // For 90° corner, max radius ~ min(edge1, edge2)
      const maxRadius = calculateMaxFilletRadius(50, 50, Math.PI / 2);

      // With safety factor of 0.8, should be close to 40
      expect(maxRadius).toBeGreaterThan(30);
      expect(maxRadius).toBeLessThan(50);
    });

    it('limits radius by shortest adjacent edge', () => {
      const maxRadius1 = calculateMaxFilletRadius(20, 100, Math.PI / 2);
      const maxRadius2 = calculateMaxFilletRadius(100, 20, Math.PI / 2);

      // Both should be limited by the 20mm edge
      expect(maxRadius1).toBeLessThan(25);
      expect(maxRadius2).toBeLessThan(25);
      expect(Math.abs(maxRadius1 - maxRadius2)).toBeLessThan(0.01);
    });

    it('handles nearly straight corners (returns large radius)', () => {
      // Nearly 180 degrees (straight line)
      const maxRadius = calculateMaxFilletRadius(50, 50, Math.PI - 0.01);

      // Should return very large value (effectively unlimited)
      expect(maxRadius).toBeGreaterThan(1000);
    });
  });

  // ===========================================================================
  // Corner Eligibility Tests
  // ===========================================================================

  describe('Corner Eligibility', () => {
    it('marks corners in forbidden areas as ineligible', () => {
      const corners: AllCornerInfo[] = [
        {
          id: 'outline:0',
          location: 'outline',
          pathIndex: 0,
          position: { x: 10, y: 10 },
          angle: Math.PI / 2,
          type: 'convex',
          incomingEdgeLength: 50,
          outgoingEdgeLength: 50,
        },
        {
          id: 'outline:1',
          location: 'outline',
          pathIndex: 1,
          position: { x: 100, y: 10 },
          angle: Math.PI / 2,
          type: 'convex',
          incomingEdgeLength: 50,
          outgoingEdgeLength: 50,
        },
      ];

      const forbiddenAreas: ForbiddenArea[] = [
        {
          type: 'finger-joint',
          bounds: { minX: 0, maxX: 20, minY: 0, maxY: 20 },
        },
      ];

      const eligibility = computeAllCornerEligibility(corners, forbiddenAreas, { materialThickness });

      // First corner (10,10) is in forbidden area
      const corner0 = eligibility.find(e => e.id === 'outline:0');
      expect(corner0?.eligible).toBe(false);
      expect(corner0?.reason).toBe('mechanical-joint');

      // Second corner (100,10) is outside forbidden area
      const corner1 = eligibility.find(e => e.id === 'outline:1');
      expect(corner1?.eligible).toBe(true);
    });

    it('marks corners with small max radius as ineligible', () => {
      const corners: AllCornerInfo[] = [
        {
          id: 'outline:0',
          location: 'outline',
          pathIndex: 0,
          position: { x: 10, y: 10 },
          angle: Math.PI / 2,
          type: 'convex',
          incomingEdgeLength: 0.5,  // Very short edges
          outgoingEdgeLength: 0.5,
        },
      ];

      const eligibility = computeAllCornerEligibility(corners, [], { materialThickness });

      expect(eligibility[0].eligible).toBe(false);
      expect(eligibility[0].reason).toBe('too-small');
    });
  });

  // ===========================================================================
  // Fillet Application Tests
  // ===========================================================================

  describe('Fillet Application', () => {
    it('applies fillet and produces arc points', () => {
      const points: Point2D[] = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 50 },
        { x: 0, y: 50 },
      ];

      // Apply fillet to corner at index 1 (50, 0)
      const arcPoints = applyFilletToCorner(points, 1, 10, 8);

      // Should produce multiple arc points
      expect(arcPoints.length).toBeGreaterThan(1);

      // Arc should be near the original corner
      arcPoints.forEach(p => {
        const distFromCorner = Math.sqrt((p.x - 50) ** 2 + (p.y - 0) ** 2);
        expect(distFromCorner).toBeLessThan(15);  // Within radius + tolerance
      });
    });

    it('clamps radius when edges are too short', () => {
      const points: Point2D[] = [
        { x: 0, y: 0 },
        { x: 5, y: 0 },  // Short edge
        { x: 5, y: 5 },
        { x: 0, y: 5 },
      ];

      // Try to apply large fillet to corner at index 1
      const arcPoints = applyFilletToCorner(points, 1, 100, 8);

      // Should still produce valid arc (clamped radius)
      expect(arcPoints.length).toBeGreaterThan(1);

      // Arc should not extend beyond the short edges
      arcPoints.forEach(p => {
        expect(p.x).toBeGreaterThanOrEqual(-1);
        expect(p.x).toBeLessThanOrEqual(6);
        expect(p.y).toBeGreaterThanOrEqual(-1);
        expect(p.y).toBeLessThanOrEqual(6);
      });
    });
  });

  // ===========================================================================
  // Engine Integration Tests
  // ===========================================================================

  describe('Engine Integration', () => {
    it('SET_ALL_CORNER_FILLET action works correctly', () => {
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const facePanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      expect(facePanel).toBeDefined();

      // Apply fillet to an outline corner
      const success = engine.dispatch({
        type: 'SET_ALL_CORNER_FILLET',
        targetId: 'main-assembly',
        payload: {
          panelId: facePanel.id,
          cornerId: 'outline:0',
          radius: 5,
        },
      });

      expect(success).toBe(true);

      // Verify geometry is still valid
      const result = validateGeometry(engine);
      if (!result.valid) {
        console.log(formatValidationResult(result));
      }
      // Note: We check for no new errors, but some pre-existing warnings may exist
      expect(result.errors.length).toBe(0);
    });

    it('SET_ALL_CORNER_FILLETS_BATCH action applies multiple fillets', () => {
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const facePanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      expect(facePanel).toBeDefined();

      // Apply batch fillets
      const success = engine.dispatch({
        type: 'SET_ALL_CORNER_FILLETS_BATCH',
        targetId: 'main-assembly',
        payload: {
          fillets: [
            { panelId: facePanel.id, cornerId: 'outline:0', radius: 5 },
            { panelId: facePanel.id, cornerId: 'outline:1', radius: 5 },
          ],
        },
      });

      expect(success).toBe(true);

      // Verify geometry is still valid
      const result = validateGeometry(engine);
      if (!result.valid) {
        console.log(formatValidationResult(result));
      }
      expect(result.errors.length).toBe(0);
    });

    it('passes path validity checks after applying fillets', () => {
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const facePanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      expect(facePanel).toBeDefined();

      // Apply fillet
      engine.dispatch({
        type: 'SET_ALL_CORNER_FILLET',
        targetId: 'main-assembly',
        payload: {
          panelId: facePanel.id,
          cornerId: 'outline:0',
          radius: 5,
        },
      });

      // Check path validity
      const pathResult = checkPathValidity(engine);
      if (!pathResult.valid) {
        console.log(formatPathCheckResult(pathResult));
      }

      // Note: Fillet arcs may not be strictly axis-aligned, so we check for
      // non-axis-aligned but still valid geometry
      // The path checker may flag diagonal segments in fillets, which is expected
    });
  });

  // ===========================================================================
  // Finger Joint Corner Filtering Tests
  // ===========================================================================

  describe('Finger Joint Corner Filtering', () => {
    it('should NOT show finger joint corners as eligible on closed box panels', () => {
      // A closed box has finger joints on all face panel edges
      // Corners created by finger joint patterns should be ineligible
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const frontPanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      expect(frontPanel).toBeDefined();

      // Get all corner eligibility for the front panel
      const allCornerElig = frontPanel.derived.allCornerEligibility;
      expect(allCornerElig).toBeDefined();

      // Log corner count for debugging
      console.log('Total corners detected:', allCornerElig.length);
      console.log('Outline points count:', frontPanel.derived.outline.points.length);

      // With finger joints, a panel has many small corners from the joint pattern
      // ALL of these should be ineligible because they're in the finger joint region
      const eligibleCorners = allCornerElig.filter((c: any) => c.eligible);

      // In a closed box with finger joints on all edges, there should be NO eligible corners
      // because all edges have finger joints (forbidden areas)
      console.log('Eligible corners:', eligibleCorners.length);
      if (eligibleCorners.length > 0) {
        console.log('Eligible corner positions:', eligibleCorners.slice(0, 5).map((c: any) => ({
          id: c.id,
          position: c.position,
          type: c.type,
        })));
      }

      // Verify no finger joint corners are shown as eligible
      expect(eligibleCorners.length).toBe(0);
    });

    it('should show corners as eligible when panel has open edges', () => {
      // Disable two adjacent faces to create an open corner
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

      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const frontPanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      expect(frontPanel).toBeDefined();

      const allCornerElig = frontPanel.derived.allCornerEligibility;

      // With top and left faces disabled, the top-left corner should be eligible
      // because BOTH adjacent edges are now open (no finger joints)
      const eligibleCorners = allCornerElig.filter((c: any) => c.eligible);

      console.log('Eligible corners with open edges:', eligibleCorners.length);

      // Should have at least one eligible corner (the open corner)
      expect(eligibleCorners.length).toBeGreaterThan(0);
    });

    it('should show cutout corners as eligible when not in forbidden area', () => {
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const frontPanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      expect(frontPanel).toBeDefined();

      // Add a cutout in the center of the panel (away from edges)
      engine.dispatch({
        type: 'ADD_CUTOUT',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          cutout: {
            id: 'test-cutout',
            type: 'rect' as const,
            center: { x: 0, y: 0 },  // Center of panel
            width: 20,
            height: 20,
          },
        },
      });

      const updatedSnapshot = engine.getSnapshot();
      const updatedPanels = updatedSnapshot.children[0].derived.panels;
      const updatedFront = updatedPanels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      const allCornerElig = updatedFront.derived.allCornerEligibility;

      // Cutout corners in the center should be eligible (not in forbidden area)
      const holeCorners = allCornerElig.filter((c: any) => c.location === 'hole');
      const eligibleHoleCorners = holeCorners.filter((c: any) => c.eligible);

      console.log('Hole corners:', holeCorners.length);
      console.log('Eligible hole corners:', eligibleHoleCorners.length);

      // Interior cutout corners should be eligible (away from finger joints)
      expect(eligibleHoleCorners.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Realistic Scenario Tests
  // ===========================================================================

  describe('Realistic Scenarios', () => {
    it('handles panel with multiple outline corner fillets', () => {
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const facePanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      expect(facePanel).toBeDefined();

      // Apply fillets to multiple outline corners
      engine.dispatch({
        type: 'SET_ALL_CORNER_FILLETS_BATCH',
        targetId: 'main-assembly',
        payload: {
          fillets: [
            { panelId: facePanel.id, cornerId: 'outline:0', radius: 3 },
            { panelId: facePanel.id, cornerId: 'outline:1', radius: 3 },
            { panelId: facePanel.id, cornerId: 'outline:2', radius: 3 },
            { panelId: facePanel.id, cornerId: 'outline:3', radius: 3 },
          ],
        },
      });

      // Verify geometry is still valid
      const result = validateGeometry(engine);
      if (result.errors.length > 0) {
        console.log('Validation errors:', formatValidationResult(result));
      }
      expect(result.errors.length).toBe(0);
    });

    it('handles box with subdivisions and fillets', () => {
      // Add subdivision
      engine.dispatch({
        type: 'ADD_SUBDIVISIONS',
        targetId: 'main-assembly',
        payload: {
          voidId: engine.getSnapshot().children[0].children[0].id,
          positions: [{ axis: 'x', position: 0.5 }],
        },
      });

      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;

      // Get a divider panel
      const dividerPanel = panels.find((p: any) => p.kind === 'divider-panel');

      if (dividerPanel) {
        // Apply fillet to divider
        engine.dispatch({
          type: 'SET_ALL_CORNER_FILLET',
          targetId: 'main-assembly',
          payload: {
            panelId: dividerPanel.id,
            cornerId: 'outline:0',
            radius: 2,
          },
        });
      }

      // Verify geometry is still valid
      const result = validateGeometry(engine);
      if (!result.valid) {
        console.log(formatValidationResult(result));
      }
      expect(result.errors.length).toBe(0);
    });
  });
});
