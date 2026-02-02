/**
 * Edge Path Integration Tests
 *
 * Tests that CustomEdgePath modifies the panel outline correctly:
 * - Rectangle notches cut into edges
 * - Circle notches cut into edges
 * - Edge path points are correctly converted to coordinates
 * - Outline is properly modified (not just visually overlaid)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createEngine } from '../../../src/engine/Engine';
import { rectToEdgePath, circleToEdgePath, rectToAdditiveEdgePath, circleToAdditiveEdgePath, mergeEdgePaths } from '../../../src/engine/safeSpace';
import type { Engine } from '../../../src/engine/Engine';
import type { AssemblySnapshot, FacePanelSnapshot } from '../../../src/engine/types';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get a face panel snapshot by face ID
 */
function getFacePanelSnapshot(engine: Engine, faceId: string): FacePanelSnapshot | undefined {
  const snapshot = engine.getSnapshot();
  const assembly = snapshot.children[0] as AssemblySnapshot;
  if (!assembly) return undefined;

  return assembly.derived.panels.find(
    p => p.kind === 'face-panel' && (p as FacePanelSnapshot).props.faceId === faceId
  ) as FacePanelSnapshot | undefined;
}

/**
 * Get the panel outline points from a face panel
 */
function getPanelOutlinePoints(engine: Engine, faceId: string): { x: number; y: number }[] {
  const panel = getFacePanelSnapshot(engine, faceId);
  if (!panel) return [];
  return panel.derived.outline.points;
}

/**
 * Check if outline has a notch (inward deviation) on a specific edge
 * For top edge: looks for points with y < maxY (the edge)
 * For left edge: looks for points with x > minX (the edge)
 * etc.
 */
function hasNotchOnEdge(
  points: { x: number; y: number }[],
  edge: 'top' | 'bottom' | 'left' | 'right',
  minDepth: number = 1
): boolean {
  if (points.length < 6) return false; // Need at least 6 points for a notch (4 corners + 2 notch points)

  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  // Look for points that deviate inward from the edge
  switch (edge) {
    case 'top': {
      // Find points near the top edge that are below maxY
      const topPoints = points.filter(p => Math.abs(p.y - maxY) < 1);
      const notchPoints = points.filter(p =>
        p.y < maxY - minDepth &&
        p.y > minY + (maxY - minY) * 0.5 && // Upper half
        p.x > minX + 1 && p.x < maxX - 1 // Not at corners
      );
      return notchPoints.length > 0;
    }
    case 'bottom': {
      const notchPoints = points.filter(p =>
        p.y > minY + minDepth &&
        p.y < maxY - (maxY - minY) * 0.5 && // Lower half
        p.x > minX + 1 && p.x < maxX - 1
      );
      return notchPoints.length > 0;
    }
    case 'left': {
      const notchPoints = points.filter(p =>
        p.x > minX + minDepth &&
        p.x < maxX - (maxX - minX) * 0.5 && // Left half
        p.y > minY + 1 && p.y < maxY - 1
      );
      return notchPoints.length > 0;
    }
    case 'right': {
      const notchPoints = points.filter(p =>
        p.x < maxX - minDepth &&
        p.x > minX + (maxX - minX) * 0.5 && // Right half
        p.y > minY + 1 && p.y < maxY - 1
      );
      return notchPoints.length > 0;
    }
  }
}

/**
 * Count the number of points in the outline
 */
function getPointCount(points: { x: number; y: number }[]): number {
  return points.length;
}

// =============================================================================
// Tests
// =============================================================================

describe('Edge Path Integration', () => {
  let engine: Engine;

  beforeEach(() => {
    engine = createEngine();
  });

  // ===========================================================================
  // Rectangle Edge Paths
  // ===========================================================================

  describe('Rectangle Edge Paths', () => {
    beforeEach(() => {
      engine.createAssembly(100, 80, 60, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Remove left face to make front panel's left edge open
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'left' },
      });
    });

    it('creates notch on left edge with rectangle edge path', () => {
      const panelBefore = getFacePanelSnapshot(engine, 'front');
      expect(panelBefore).toBeDefined();
      const pointsBefore = panelBefore!.derived.outline.points;
      const pointCountBefore = pointsBefore.length;

      // Create a rectangle edge path for the left edge
      // Panel is 100x80, so halfW=50, halfH=40
      // Left edge is at x=-50, y goes from -40 to +40
      // Create a notch from y=-10 to y=+10, going 15mm into the panel
      const edgePath = rectToEdgePath(
        -50, -35,  // x: from edge (-50) to 15mm in (-35)
        -10, 10,   // y: from -10 to +10 (20mm tall notch)
        'left',
        100, 80    // panel dimensions
      );

      expect(edgePath).not.toBeNull();

      // Apply the edge path
      engine.dispatch({
        type: 'SET_EDGE_PATH',
        targetId: 'main-assembly',
        payload: {
          panelId: panelBefore!.id,
          path: edgePath!,
        },
      });

      // Check the outline was modified
      const panelAfter = getFacePanelSnapshot(engine, 'front');
      const pointsAfter = panelAfter!.derived.outline.points;

      // Should have more points (notch adds 4 new points)
      expect(pointsAfter.length).toBeGreaterThan(pointCountBefore);

      // Should have a notch on the left edge
      expect(hasNotchOnEdge(pointsAfter, 'left', 10)).toBe(true);
    });

    it('creates notch on top edge with rectangle edge path', () => {
      // First remove top face to make top edge open
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'top' },
      });

      const panelBefore = getFacePanelSnapshot(engine, 'front');
      expect(panelBefore).toBeDefined();

      // Create a notch on the top edge
      // Top edge is at y=40, x goes from -50 to +50
      // Create a notch from x=-20 to x=+20, going 10mm down
      const edgePath = rectToEdgePath(
        -20, 20,   // x: centered, 40mm wide
        30, 40,    // y: from 10mm below edge (30) to edge (40)
        'top',
        100, 80
      );

      expect(edgePath).not.toBeNull();

      engine.dispatch({
        type: 'SET_EDGE_PATH',
        targetId: 'main-assembly',
        payload: {
          panelId: panelBefore!.id,
          path: edgePath!,
        },
      });

      const panelAfter = getFacePanelSnapshot(engine, 'front');
      const pointsAfter = panelAfter!.derived.outline.points;

      // Should have a notch on the top edge
      expect(hasNotchOnEdge(pointsAfter, 'top', 5)).toBe(true);
    });

    it('edge path points are converted to correct coordinates', () => {
      const panelBefore = getFacePanelSnapshot(engine, 'front');
      expect(panelBefore).toBeDefined();

      // Create edge path with known coordinates
      const edgePath = rectToEdgePath(
        -50, -40,  // 10mm notch depth
        -20, 20,   // 40mm notch height
        'left',
        100, 80
      );

      engine.dispatch({
        type: 'SET_EDGE_PATH',
        targetId: 'main-assembly',
        payload: {
          panelId: panelBefore!.id,
          path: edgePath!,
        },
      });

      const panelAfter = getFacePanelSnapshot(engine, 'front');
      const points = panelAfter!.derived.outline.points;

      // Check that points with x=-40 exist (the notch interior)
      const notchInteriorPoints = points.filter(p => Math.abs(p.x - (-40)) < 0.5);
      expect(notchInteriorPoints.length).toBeGreaterThan(0);

      // Check the y range of notch points
      const notchYs = notchInteriorPoints.map(p => p.y);
      const notchMinY = Math.min(...notchYs);
      const notchMaxY = Math.max(...notchYs);
      expect(notchMinY).toBeCloseTo(-20, 1);
      expect(notchMaxY).toBeCloseTo(20, 1);
    });
  });

  // ===========================================================================
  // Circle Edge Paths
  // ===========================================================================

  describe('Circle Edge Paths', () => {
    beforeEach(() => {
      engine.createAssembly(100, 80, 60, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Remove top face to make front panel's top edge open
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'top' },
      });
    });

    it('creates curved notch on top edge with circle edge path', () => {
      const panelBefore = getFacePanelSnapshot(engine, 'front');
      expect(panelBefore).toBeDefined();
      const pointCountBefore = panelBefore!.derived.outline.points.length;

      // Create a circle edge path for the top edge
      // Circle centered at (0, 35) with radius 10, crossing top edge at y=40
      // Circle goes from y=25 to y=45, intersecting edge at two points
      const edgePath = circleToEdgePath(
        0, 35,     // center at x=0, y=35
        10,        // radius 10 (crosses y=40)
        'top',
        100, 80,
        8          // 8 segments for the arc
      );

      expect(edgePath).not.toBeNull();
      expect(edgePath!.points.length).toBeGreaterThan(6); // Arc + endpoints

      engine.dispatch({
        type: 'SET_EDGE_PATH',
        targetId: 'main-assembly',
        payload: {
          panelId: panelBefore!.id,
          path: edgePath!,
        },
      });

      const panelAfter = getFacePanelSnapshot(engine, 'front');
      const pointsAfter = panelAfter!.derived.outline.points;

      // Should have more points (circle arc adds multiple points)
      expect(pointsAfter.length).toBeGreaterThan(pointCountBefore);

      // Should have a notch on the top edge
      expect(hasNotchOnEdge(pointsAfter, 'top', 5)).toBe(true);
    });

    it('circle edge path creates smooth arc (multiple points)', () => {
      // Create circle with 12 segments for smoother arc
      // Circle centered at y=35 with radius 10 crosses the edge at y=40
      const edgePath = circleToEdgePath(0, 35, 10, 'top', 100, 80, 12);

      expect(edgePath).not.toBeNull();
      // The arc should have multiple points (12 segments + edge endpoints)
      expect(edgePath!.points.length).toBeGreaterThan(10);

      // Verify the arc has negative offsets (going into the panel)
      const arcPoints = edgePath!.points.filter(p => p.offset < -0.1);
      expect(arcPoints.length).toBeGreaterThan(5);

      // The deepest point should be near the center of the arc
      const minOffset = Math.min(...edgePath!.points.map(p => p.offset));
      // Circle center at y=35, edge at y=40, so notch goes 5mm below center
      // Bottom of notch is at y=25, which is 15mm below edge = offset of -15
      expect(minOffset).toBeLessThan(-10);
    });

    it('creates notch on left edge with circle edge path', () => {
      // Remove left face instead
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'left' },
      });

      const panelBefore = getFacePanelSnapshot(engine, 'front');

      // Circle on left edge: center at (-45, 0), radius 10
      // Circle extends from x=-55 to x=-35, crossing left edge at x=-50
      const edgePath = circleToEdgePath(-45, 0, 10, 'left', 100, 80, 8);

      expect(edgePath).not.toBeNull();

      engine.dispatch({
        type: 'SET_EDGE_PATH',
        targetId: 'main-assembly',
        payload: {
          panelId: panelBefore!.id,
          path: edgePath!,
        },
      });

      const panelAfter = getFacePanelSnapshot(engine, 'front');
      const points = panelAfter!.derived.outline.points;

      // Should have a notch on the left edge
      expect(hasNotchOnEdge(points, 'left', 5)).toBe(true);
    });
  });

  // ===========================================================================
  // Edge Path Conversion Functions
  // ===========================================================================

  describe('Edge Path Conversion', () => {
    it('rectToEdgePath creates valid path structure', () => {
      const path = rectToEdgePath(-50, -35, -10, 10, 'left', 100, 80);

      expect(path).not.toBeNull();
      expect(path!.edge).toBe('left');
      expect(path!.mirrored).toBe(false);
      expect(path!.baseOffset).toBe(0);
      expect(path!.points.length).toBe(6); // start, notch-start, notch-bottom, notch-end, notch-top, end

      // Check t values are normalized (0-1)
      for (const pt of path!.points) {
        expect(pt.t).toBeGreaterThanOrEqual(0);
        expect(pt.t).toBeLessThanOrEqual(1);
      }

      // First and last points should be at offset 0
      expect(path!.points[0].offset).toBe(0);
      expect(path!.points[path!.points.length - 1].offset).toBe(0);
    });

    it('circleToEdgePath creates valid path with arc points', () => {
      // Circle at y=35 with radius 10 crosses edge at y=40
      const path = circleToEdgePath(0, 35, 10, 'top', 100, 80, 8);

      expect(path).not.toBeNull();
      expect(path!.edge).toBe('top');
      expect(path!.mirrored).toBe(false);
      expect(path!.points.length).toBeGreaterThan(8); // 8 arc segments + start/end

      // Check t values are normalized
      for (const pt of path!.points) {
        expect(pt.t).toBeGreaterThanOrEqual(0);
        expect(pt.t).toBeLessThanOrEqual(1);
      }
    });

    it('returns null for rectangle completely outside panel', () => {
      // Rectangle completely to the right of panel
      const path = rectToEdgePath(60, 70, 0, 10, 'top', 100, 80);
      expect(path).toBeNull();
    });

    it('clamps rectangle that extends outside panel', () => {
      // Rectangle extends past left edge
      const path = rectToEdgePath(-60, -30, 0, 10, 'left', 100, 80);

      expect(path).not.toBeNull();
      // t values should be clamped to valid range
      expect(path!.points[0].t).toBeGreaterThanOrEqual(0);
    });
  });

  // ===========================================================================
  // Multiple Edge Paths
  // ===========================================================================

  describe('Multiple Edge Paths', () => {
    beforeEach(() => {
      engine.createAssembly(100, 80, 60, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Remove multiple faces to allow edge paths
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
    });

    it('can have edge paths on multiple edges of same panel', () => {
      const panelBefore = getFacePanelSnapshot(engine, 'front');

      // Add notch on top edge
      const topPath = rectToEdgePath(-15, 15, 30, 40, 'top', 100, 80);
      engine.dispatch({
        type: 'SET_EDGE_PATH',
        targetId: 'main-assembly',
        payload: {
          panelId: panelBefore!.id,
          path: topPath!,
        },
      });

      // Add notch on left edge
      const leftPath = rectToEdgePath(-50, -40, -15, 15, 'left', 100, 80);
      engine.dispatch({
        type: 'SET_EDGE_PATH',
        targetId: 'main-assembly',
        payload: {
          panelId: panelBefore!.id,
          path: leftPath!,
        },
      });

      const panelAfter = getFacePanelSnapshot(engine, 'front');
      const points = panelAfter!.derived.outline.points;

      // Should have notches on both edges
      expect(hasNotchOnEdge(points, 'top', 5)).toBe(true);
      expect(hasNotchOnEdge(points, 'left', 5)).toBe(true);
    });

    it('second edge path merges with first on same edge', () => {
      const panelBefore = getFacePanelSnapshot(engine, 'front');

      // Add first notch on top edge (left side: x = -30 to -10)
      const path1 = rectToEdgePath(-30, -10, 30, 40, 'top', 100, 80);
      engine.dispatch({
        type: 'SET_EDGE_PATH',
        targetId: 'main-assembly',
        payload: {
          panelId: panelBefore!.id,
          path: path1!,
        },
      });

      const pointsAfter1 = getFacePanelSnapshot(engine, 'front')!.derived.outline.points;
      const count1 = pointsAfter1.length;

      // Add second notch on same edge (right side: x = 10 to 30)
      const path2 = rectToEdgePath(10, 30, 30, 40, 'top', 100, 80);
      engine.dispatch({
        type: 'SET_EDGE_PATH',
        targetId: 'main-assembly',
        payload: {
          panelId: panelBefore!.id,
          path: path2!,
        },
      });

      const pointsAfter2 = getFacePanelSnapshot(engine, 'front')!.derived.outline.points;

      // Should have MORE points now (merged, not replaced)
      // Each notch adds 4 points (entry, bottom-left, bottom-right, exit)
      // So merged path should have more points than single notch
      expect(pointsAfter2.length).toBeGreaterThan(count1);

      // BOTH notches should be present
      // First notch at x: -30 to -10, bottom at y=30
      const notchAtFirstPos = pointsAfter2.some(p =>
        p.x > -35 && p.x < -5 && p.y < 38 && p.y >= 29
      );
      expect(notchAtFirstPos).toBe(true);

      // Second notch at x: 10 to 30, bottom at y=30
      const notchAtSecondPos = pointsAfter2.some(p =>
        p.x > 5 && p.x < 35 && p.y < 38 && p.y >= 29
      );
      expect(notchAtSecondPos).toBe(true);
    });
  });

  // ===========================================================================
  // Edge Path Corner Ownership
  // ===========================================================================

  describe('Edge Path Corner Ownership', () => {
    /**
     * When a panel has male joints on adjacent edges, the edge path start/end
     * points should be inset to match the finger corner positions. This ensures:
     * 1. No diagonal lines (all segments axis-aligned)
     * 2. No overlapping space with neighboring panels
     */
    it('edge path endpoints respect finger joint corner insets', () => {
      // Create assembly with all faces solid (creates male joints on all edges)
      engine.createAssembly(100, 80, 60, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Only open the top face - this makes the top edge of front panel open
      // But the left and right edges still have male joints (tabs) that mate with side panels
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'top' },
      });

      const panel = getFacePanelSnapshot(engine, 'front');
      expect(panel).toBeDefined();

      // Panel dimensions: 100 x 80, MT = 3
      // Since left and right faces are solid with male joints on front edges,
      // the front panel's top edge should be inset by MT on both ends
      // Expected finger corners: topLeft = (-50 + 3, 40 - 0) = (-47, 40)
      //                          topRight = (50 - 3, 40 - 0) = (47, 40)
      // (top edge is open, so no inset on top itself)

      // Add edge path to top edge - a simple notch in the middle
      const edgePath = rectToEdgePath(-20, 20, 30, 40, 'top', 100, 80);
      expect(edgePath).not.toBeNull();

      engine.dispatch({
        type: 'SET_EDGE_PATH',
        targetId: 'main-assembly',
        payload: {
          panelId: panel!.id,
          path: edgePath!,
        },
      });

      const panelAfter = getFacePanelSnapshot(engine, 'front');
      const points = panelAfter!.derived.outline.points;

      // Find points on the top edge (y should be close to 40 or close to notch depth)
      const topEdgePoints = points.filter(p => p.y > 28); // Above the notch bottom

      // The leftmost and rightmost points on the top edge should be at the finger corners
      // NOT at the outer corners (-50, 50)
      const topEdgeXs = topEdgePoints.map(p => p.x);
      const minX = Math.min(...topEdgeXs);
      const maxX = Math.max(...topEdgeXs);

      // With MT=3 and male joints on left/right edges, corners should be inset
      // Expected: minX around -47 (not -50), maxX around 47 (not 50)
      expect(minX).toBeGreaterThan(-50); // Should be inset from outer corner
      expect(minX).toBeCloseTo(-47, 0);  // Should be at finger corner (-50 + 3)
      expect(maxX).toBeLessThan(50);     // Should be inset from outer corner
      expect(maxX).toBeCloseTo(47, 0);   // Should be at finger corner (50 - 3)

      // Verify no diagonal segments by checking all segments are axis-aligned
      for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        const dx = Math.abs(p2.x - p1.x);
        const dy = Math.abs(p2.y - p1.y);

        // Either dx or dy should be essentially zero (axis-aligned)
        const isAxisAligned = dx < 0.01 || dy < 0.01;
        if (!isAxisAligned) {
          console.log(`Diagonal segment found: (${p1.x.toFixed(2)}, ${p1.y.toFixed(2)}) -> (${p2.x.toFixed(2)}, ${p2.y.toFixed(2)})`);
        }
        expect(isAxisAligned).toBe(true);
      }
    });

    it('edge path on panel with female adjacent joints uses full width', () => {
      // Create assembly where front panel's adjacent edges are female (slots)
      engine.createAssembly(100, 80, 60, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Open top face (top edge becomes open)
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'top' },
      });

      // Also open left and right faces - this removes the male joints on those edges
      // Now front panel's left/right edges are open (no joints)
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

      const panel = getFacePanelSnapshot(engine, 'front');
      expect(panel).toBeDefined();

      // Add edge path to top edge
      const edgePath = rectToEdgePath(-20, 20, 30, 40, 'top', 100, 80);

      engine.dispatch({
        type: 'SET_EDGE_PATH',
        targetId: 'main-assembly',
        payload: {
          panelId: panel!.id,
          path: edgePath!,
        },
      });

      const panelAfter = getFacePanelSnapshot(engine, 'front');
      const points = panelAfter!.derived.outline.points;

      // Find points on the top edge
      const topEdgePoints = points.filter(p => p.y > 28);
      const topEdgeXs = topEdgePoints.map(p => p.x);
      const minX = Math.min(...topEdgeXs);
      const maxX = Math.max(...topEdgeXs);

      // With open left/right edges, the corners should be at full panel width
      // Expected: minX around -50, maxX around 50
      expect(minX).toBeCloseTo(-50, 0);
      expect(maxX).toBeCloseTo(50, 0);
    });
  });

  // ===========================================================================
  // Additive Edge Paths
  // ===========================================================================

  describe('Additive Edge Paths', () => {
    /**
     * Additive edge paths extend the panel outline outward (positive offsets),
     * creating tabs or extensions instead of notches.
     */
    it('rectToAdditiveEdgePath creates positive offset for extension above top edge', () => {
      // Panel is 100 x 80, so halfW=50, halfH=40
      // Rectangle extending above: y goes from 35 (inside) to 50 (10mm above edge at y=40)
      const path = rectToAdditiveEdgePath(-20, 20, 35, 50, 'top', 100, 80);

      expect(path).not.toBeNull();
      expect(path!.edge).toBe('top');

      // Should have points with positive offset (outward extension)
      const hasPositiveOffset = path!.points.some(p => p.offset > 0);
      expect(hasPositiveOffset).toBe(true);

      // Extension height should be 10 (50 - 40)
      const maxOffset = Math.max(...path!.points.map(p => p.offset));
      expect(maxOffset).toBeCloseTo(10, 1);
    });

    it('rectToAdditiveEdgePath returns null if rectangle does not extend beyond edge', () => {
      // Rectangle entirely inside panel (y max = 35, which is less than halfH = 40)
      const path = rectToAdditiveEdgePath(-20, 20, 20, 35, 'top', 100, 80);

      expect(path).toBeNull();
    });

    it('circleToAdditiveEdgePath creates positive offset for extension', () => {
      // Circle centered at top edge extending outward
      // Center at (0, 45), radius 10 means it extends from y=35 to y=55
      // Panel top is at y=40, so it extends 15mm above
      const path = circleToAdditiveEdgePath(0, 45, 10, 'top', 100, 80);

      expect(path).not.toBeNull();
      expect(path!.edge).toBe('top');

      // Should have points with positive offset
      const hasPositiveOffset = path!.points.some(p => p.offset > 0);
      expect(hasPositiveOffset).toBe(true);

      // Max offset should be around 15 (center at 45 + radius 10 - panel edge at 40)
      const maxOffset = Math.max(...path!.points.map(p => p.offset));
      expect(maxOffset).toBeCloseTo(15, 1);
    });

    it('additive edge path extends panel outline when applied', () => {
      // Create fresh assembly with open top for this test
      engine.createAssembly(100, 80, 60, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'top' },
      });

      // Get initial outline bounds
      const panelBefore = getFacePanelSnapshot(engine, 'front')!;
      expect(panelBefore).toBeDefined();
      const pointsBefore = panelBefore.derived.outline.points;
      const maxYBefore = Math.max(...pointsBefore.map(p => p.y));

      // Create additive edge path that extends above top edge
      const path = rectToAdditiveEdgePath(-20, 20, 35, 55, 'top', 100, 80);
      expect(path).not.toBeNull();

      engine.dispatch({
        type: 'SET_EDGE_PATH',
        targetId: 'main-assembly',
        payload: {
          panelId: panelBefore.id,
          path: path!,
        },
      });

      const panelAfter = getFacePanelSnapshot(engine, 'front')!;
      const pointsAfter = panelAfter.derived.outline.points;
      const maxYAfter = Math.max(...pointsAfter.map(p => p.y));

      // Panel should now extend higher (positive Y direction)
      expect(maxYAfter).toBeGreaterThan(maxYBefore);
      // Extension should be 15mm (55 - 40)
      expect(maxYAfter - maxYBefore).toBeCloseTo(15, 1);
    });
  });

  // ===========================================================================
  // Edge Path Merging
  // ===========================================================================

  describe('Edge Path Merging', () => {
    /**
     * When multiple shapes are added to the same edge, they should be merged
     * rather than replaced, allowing multiple notches/extensions on one edge.
     */
    it('mergeEdgePaths combines two non-overlapping notches', () => {
      // First notch at t=0.1-0.3
      const path1 = rectToEdgePath(-40, -20, 30, 40, 'top', 100, 80);
      // Second notch at t=0.7-0.9
      const path2 = rectToEdgePath(20, 40, 30, 40, 'top', 100, 80);

      expect(path1).not.toBeNull();
      expect(path2).not.toBeNull();

      const merged = mergeEdgePaths(path1, path2!);

      // Merged should have both notches
      // Each notch contributes 4 modification points, plus edge endpoints
      expect(merged.points.length).toBeGreaterThan(6);

      // Should have modifications at both locations
      const hasLeftNotch = merged.points.some(p => p.t > 0.05 && p.t < 0.35 && p.offset < -5);
      const hasRightNotch = merged.points.some(p => p.t > 0.65 && p.t < 0.95 && p.offset < -5);
      expect(hasLeftNotch).toBe(true);
      expect(hasRightNotch).toBe(true);
    });

    it('mergeEdgePaths with null existing returns new path unchanged', () => {
      const newPath = rectToEdgePath(-20, 20, 30, 40, 'top', 100, 80);
      expect(newPath).not.toBeNull();

      const merged = mergeEdgePaths(null, newPath!);

      expect(merged.edge).toBe(newPath!.edge);
      expect(merged.points).toEqual(newPath!.points);
    });

    it('overlapping merge: new path takes precedence', () => {
      // First notch: deep (offset=-15) at t=0.3-0.5
      const path1 = rectToEdgePath(-20, 0, 25, 40, 'top', 100, 80);
      // Second notch: shallow (offset=-5) at same location t=0.3-0.5
      const path2 = rectToEdgePath(-20, 0, 35, 40, 'top', 100, 80);

      expect(path1).not.toBeNull();
      expect(path2).not.toBeNull();

      const merged = mergeEdgePaths(path1, path2!);

      // The merged path should have the shallow notch (from path2) in the overlap region
      const notchPoints = merged.points.filter(p => p.t > 0.25 && p.t < 0.55 && p.offset < -1);
      const depths = notchPoints.map(p => p.offset);

      // All depths in the overlap region should be shallow (from path2)
      depths.forEach(d => {
        expect(d).toBeGreaterThan(-10); // Shallow notch, not deep
      });
    });
  });
});
