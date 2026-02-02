/**
 * Integration tests for boolean edge operations in the 2D editor.
 *
 * These tests verify that:
 * - Interior polygons create cutouts (holes)
 * - Boundary-crossing polygons modify edge paths
 * - Multiple operations compose correctly
 *
 * Related issues: D3, D4, D5, D6 in docs/issueswith2deditor.md
 *
 * IMPORTANT: These tests should FAIL to demonstrate the bugs exist.
 * Once fixed, they should pass.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createEngineWithAssembly } from '../../../src/engine/Engine';
import { MaterialConfig } from '../../../src/engine/types';
import {
  classifyPolygon,
  createRectPolygon,
  unionPolygons,
  differencePolygons,
  extractAffectedEdges,
} from '../../../src/utils/polygonBoolean';

const defaultMaterial: MaterialConfig = {
  thickness: 3,
  fingerWidth: 10,
  fingerGap: 10,
};

describe('Boolean Edge Operations Integration', () => {
  // Panel dimensions for tests
  const panelWidth = 100;
  const panelHeight = 80;

  describe('Issue D3: Interior polygon cutouts', () => {
    it('should classify a polygon entirely inside as interior', () => {
      const panelOutline = createRectPolygon(0, 0, panelWidth, panelHeight);

      // Small rectangle in the center
      const interiorPolygon = createRectPolygon(30, 30, 70, 50);

      const classification = classifyPolygon(interiorPolygon, panelOutline);
      expect(classification).toBe('interior');
    });

    it('should create a cutout when ADD_CUTOUT is dispatched for interior polygon', () => {
      const engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);

      // Get the front panel
      const panels = engine.generatePanelsFromNodes().panels;
      const frontPanel = panels.find(p => p.source.type === 'face' && p.source.faceId === 'front');
      expect(frontPanel).toBeDefined();

      // Dispatch ADD_CUTOUT for a rectangle in the center
      const success = engine.dispatch({
        type: 'ADD_CUTOUT',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel!.id,
          cutout: {
            id: 'test-cutout',
            type: 'rect',
            center: { x: 50, y: 40 },
            width: 20,
            height: 10,
          },
        },
      });

      expect(success).toBe(true);

      // Verify the panel now has a hole
      const updatedPanels = engine.generatePanelsFromNodes().panels;
      const updatedFront = updatedPanels.find(p => p.id === frontPanel!.id);
      expect(updatedFront).toBeDefined();
      expect(updatedFront!.holes.length).toBeGreaterThan(0);

      // Find our cutout hole
      const cutoutHole = updatedFront!.holes.find(h => h.id.includes('test-cutout'));
      expect(cutoutHole).toBeDefined();
    });
  });

  describe('Issue D5/D6: Boundary-crossing polygon edge operations', () => {
    it('should classify a polygon crossing the top edge as boundary', () => {
      const panelOutline = createRectPolygon(0, 0, panelWidth, panelHeight);

      // Rectangle extending above the top edge
      const boundaryPolygon = createRectPolygon(30, 60, 70, 100);

      const classification = classifyPolygon(boundaryPolygon, panelOutline);
      expect(classification).toBe('boundary');
    });

    it('should extract affected edge from union with triangle on top', () => {
      const baseRect = createRectPolygon(0, 0, panelWidth, panelHeight);

      // Triangle extending from top edge
      const triangle = [
        { x: 30, y: 80 },
        { x: 70, y: 80 },
        { x: 50, y: 100 },
      ];

      const result = unionPolygons(baseRect, triangle);
      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThan(4); // More points than original rectangle

      const affected = extractAffectedEdges(result!, panelWidth, panelHeight);

      // Should detect top edge was modified
      expect(affected.has('top')).toBe(true);

      const topPath = affected.get('top')!;
      expect(topPath.length).toBeGreaterThan(2);

      // Should have points with positive offset (the triangle peak)
      const maxOffset = Math.max(...topPath.map(p => p.offset));
      expect(maxOffset).toBeGreaterThan(0);
      expect(maxOffset).toBeCloseTo(20, 1); // Triangle extends 20mm above panel
    });

    it('should extract affected edge from union with rectangle on top', () => {
      const baseRect = createRectPolygon(0, 0, panelWidth, panelHeight);

      // Rectangle extending from top edge (tab/extension)
      const extension = createRectPolygon(40, 70, 60, 100);

      const result = unionPolygons(baseRect, extension);
      expect(result).not.toBeNull();

      const affected = extractAffectedEdges(result!, panelWidth, panelHeight);

      // Should detect top edge was modified
      expect(affected.has('top')).toBe(true);

      const topPath = affected.get('top')!;

      // Should have the extension profile:
      // - Start at t=0, offset=0
      // - Rise to offset=20 at around t=0.4
      // - Stay at offset=20 until around t=0.6
      // - Drop back to offset=0
      // - End at t=1, offset=0

      const hasExtensionPeak = topPath.some(p => p.offset >= 19); // Allow some tolerance
      expect(hasExtensionPeak).toBe(true);
    });

    it('should apply edge operation and modify panel outline via engine', () => {
      const engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);

      // Get the front panel
      const panels = engine.generatePanelsFromNodes().panels;
      const frontPanel = panels.find(p => p.source.type === 'face' && p.source.faceId === 'front');
      expect(frontPanel).toBeDefined();

      // Panel outline uses CENTERED coordinates (-halfW to +halfW, -halfH to +halfH)
      const halfW = frontPanel!.width / 2;
      const halfH = frontPanel!.height / 2;

      const originalPointCount = frontPanel!.outline.points.length;
      const originalMaxY = Math.max(...frontPanel!.outline.points.map(p => p.y));

      // Rectangle extending from top edge (overlaps y=halfH, extends 20mm above)
      const extension = createRectPolygon(-halfW * 0.2, halfH - 5, halfW * 0.2, halfH + 20);

      const success = engine.dispatch({
        type: 'APPLY_EDGE_OPERATION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel!.id,
          operation: 'union',
          shape: extension,
        },
      });

      expect(success).toBe(true);

      // Verify the panel outline was modified
      const updatedPanels = engine.generatePanelsFromNodes().panels;
      const updatedFront = updatedPanels.find(p => p.id === frontPanel!.id);
      expect(updatedFront).toBeDefined();

      // The max Y should be higher (extension sticks out above)
      // Note: Point count may not increase if the union simplifies finger joint geometry
      const newMaxY = Math.max(...updatedFront!.outline.points.map(p => p.y));
      expect(newMaxY).toBeGreaterThan(originalMaxY);
      expect(newMaxY).toBeCloseTo(halfH + 20, 0); // Extension height
    });

    it('should extract affected edge from difference (notch cut)', () => {
      const baseRect = createRectPolygon(0, 0, panelWidth, panelHeight);

      // Rectangle cutting into the bottom edge (notch)
      const notch = createRectPolygon(40, -10, 60, 20);

      const result = differencePolygons(baseRect, notch);
      expect(result).not.toBeNull();

      const affected = extractAffectedEdges(result!, panelWidth, panelHeight);

      // Should detect bottom edge was modified
      expect(affected.has('bottom')).toBe(true);

      const bottomPath = affected.get('bottom')!;

      // Should have negative offset points (the notch goes inward)
      const minOffset = Math.min(...bottomPath.map(p => p.offset));
      expect(minOffset).toBeLessThan(0);
    });
  });

  describe('Issue D4: Composing multiple edge operations', () => {
    it('should preserve existing edge modifications when adding new ones', () => {
      const engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);

      const panels = engine.generatePanelsFromNodes().panels;
      const frontPanel = panels.find(p => p.source.type === 'face' && p.source.faceId === 'front');
      expect(frontPanel).toBeDefined();

      // Panel outline uses CENTERED coordinates (-halfW to +halfW, -halfH to +halfH)
      const halfW = frontPanel!.width / 2;
      const halfH = frontPanel!.height / 2;

      const originalMaxY = Math.max(...frontPanel!.outline.points.map(p => p.y));

      // First operation: Add extension on left side of top edge
      const extension1 = createRectPolygon(-halfW * 0.8, halfH - 5, -halfW * 0.4, halfH + 15);

      const success1 = engine.dispatch({
        type: 'APPLY_EDGE_OPERATION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel!.id,
          operation: 'union',
          shape: extension1,
        },
      });
      expect(success1).toBe(true);

      // Verify first extension was applied - max Y should be higher
      let updatedPanels = engine.generatePanelsFromNodes().panels;
      let updatedFront = updatedPanels.find(p => p.id === frontPanel!.id);
      const maxYAfterFirst = Math.max(...updatedFront!.outline.points.map(p => p.y));
      expect(maxYAfterFirst).toBeGreaterThan(originalMaxY);

      // Second operation: Add extension on right side of top edge
      const extension2 = createRectPolygon(halfW * 0.4, halfH - 5, halfW * 0.8, halfH + 15);

      const success2 = engine.dispatch({
        type: 'APPLY_EDGE_OPERATION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel!.id,
          operation: 'union',
          shape: extension2,
        },
      });
      expect(success2).toBe(true);

      // Verify BOTH extensions are preserved
      updatedPanels = engine.generatePanelsFromNodes().panels;
      updatedFront = updatedPanels.find(p => p.id === frontPanel!.id);
      const points = updatedFront!.outline.points;

      // Check for high-Y points in left region (x < 0) - first extension
      const leftExtensionPoints = points.filter(p => p.x < 0 && p.y > originalMaxY);
      expect(leftExtensionPoints.length).toBeGreaterThan(0);

      // Check for high-Y points in right region (x > 0) - second extension
      const rightExtensionPoints = points.filter(p => p.x > 0 && p.y > originalMaxY);
      expect(rightExtensionPoints.length).toBeGreaterThan(0);

      // Max Y should still be at extension height
      const newMaxY = Math.max(...points.map(p => p.y));
      expect(newMaxY).toBeCloseTo(halfH + 15, 0); // Extension height
    });
  });

  describe('Polygon classification edge cases', () => {
    it('should classify polygon touching edge but not crossing as interior', () => {
      const panelOutline = createRectPolygon(0, 0, panelWidth, panelHeight);

      // Rectangle that touches the top edge but doesn't cross it
      const touchingPolygon = createRectPolygon(30, 60, 70, 80);

      const classification = classifyPolygon(touchingPolygon, panelOutline);

      // FIXED: Polygon with edges on the boundary but not crossing it
      // should be classified as 'interior' (fully contained within panel)
      expect(classification).toBe('interior');
    });

    it('should classify polygon fully inside (not touching edge) as interior', () => {
      const panelOutline = createRectPolygon(0, 0, panelWidth, panelHeight);

      // Rectangle that is fully inside, not touching any edge
      const fullyInsidePolygon = createRectPolygon(30, 30, 70, 70);

      const classification = classifyPolygon(fullyInsidePolygon, panelOutline);
      expect(classification).toBe('interior');
    });

    it('should classify polygon slightly crossing edge as boundary', () => {
      const panelOutline = createRectPolygon(0, 0, panelWidth, panelHeight);

      // Rectangle that crosses the top edge by just 1 unit
      const slightlyCrossing = createRectPolygon(30, 60, 70, 81);

      const classification = classifyPolygon(slightlyCrossing, panelOutline);
      expect(classification).toBe('boundary');
    });

    it('should classify freeform polygon crossing boundary as boundary', () => {
      const panelOutline = createRectPolygon(0, 0, panelWidth, panelHeight);

      // Irregular polygon crossing the top edge
      const freeformPolygon = [
        { x: 30, y: 70 },
        { x: 50, y: 95 },  // This point is outside
        { x: 70, y: 70 },
        { x: 60, y: 75 },
        { x: 40, y: 75 },
      ];

      const classification = classifyPolygon(freeformPolygon, panelOutline);
      expect(classification).toBe('boundary');
    });
  });

  describe('Edge path extraction accuracy', () => {
    it('should correctly calculate t values for extracted edge points', () => {
      const baseRect = createRectPolygon(0, 0, 100, 80);

      // Triangle at specific position on top edge
      const triangle = [
        { x: 25, y: 80 },  // t = 0.25
        { x: 75, y: 80 },  // t = 0.75
        { x: 50, y: 100 }, // t = 0.5, offset = 20
      ];

      const result = unionPolygons(baseRect, triangle);
      const affected = extractAffectedEdges(result!, 100, 80);
      const topPath = affected.get('top');

      expect(topPath).toBeDefined();

      // Find the peak point
      const peakPoint = topPath!.find(p => p.offset > 15);
      expect(peakPoint).toBeDefined();
      expect(peakPoint!.t).toBeCloseTo(0.5, 1);
      expect(peakPoint!.offset).toBeCloseTo(20, 1);
    });

    it('should include anchor points at t=0 and t=1', () => {
      const baseRect = createRectPolygon(0, 0, 100, 80);
      const extension = createRectPolygon(40, 70, 60, 100);

      const result = unionPolygons(baseRect, extension);
      const affected = extractAffectedEdges(result!, 100, 80);
      const topPath = affected.get('top');

      expect(topPath).toBeDefined();

      // Should have anchor at start
      const startPoint = topPath!.find(p => p.t < 0.01);
      expect(startPoint).toBeDefined();

      // Should have anchor at end
      const endPoint = topPath!.find(p => p.t > 0.99);
      expect(endPoint).toBeDefined();
    });
  });

  /**
   * ACTUAL FAILURE TESTS
   *
   * These tests verify that panel outlines actually change after operations.
   * They should FAIL to demonstrate the reported bugs (D3-D6).
   */
  describe('Panel outline actually changes (failure tests)', () => {
    it('D5/D6: boundary extension should modify panel bounds (triangle)', () => {
      const engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);

      const panels = engine.generatePanelsFromNodes().panels;
      const frontPanel = panels.find(p => p.source.type === 'face' && p.source.faceId === 'front');
      expect(frontPanel).toBeDefined();

      // Panel outline uses CENTERED coordinates (-halfW to +halfW, -halfH to +halfH)
      const halfW = frontPanel!.width / 2;
      const halfH = frontPanel!.height / 2;

      // Get original Y bounds
      const originalMaxY = Math.max(...frontPanel!.outline.points.map(p => p.y));

      // Apply a boundary-crossing extension (triangle on top edge using centered coords)
      const triangle = [
        { x: -halfW * 0.4, y: halfH },        // Left base of triangle at top edge
        { x: halfW * 0.4, y: halfH },         // Right base at top edge
        { x: 0, y: halfH + 20 },              // Peak extends 20mm above
      ];

      const success = engine.dispatch({
        type: 'APPLY_EDGE_OPERATION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel!.id,
          operation: 'union',
          shape: triangle,
        },
      });

      expect(success).toBe(true);

      // Get updated panel and check bounds changed
      const updatedPanels = engine.generatePanelsFromNodes().panels;
      const updatedFront = updatedPanels.find(p => p.id === frontPanel!.id);
      expect(updatedFront).toBeDefined();

      // THE KEY TEST: Max Y should be higher (extension peak sticks out above)
      const newMaxY = Math.max(...updatedFront!.outline.points.map(p => p.y));
      expect(newMaxY).toBeGreaterThan(originalMaxY);
      expect(newMaxY).toBeCloseTo(halfH + 20, 0); // Triangle peak height
    });

    it('D5/D6: boundary extension should change panel height bounds', () => {
      const engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);

      const panels = engine.generatePanelsFromNodes().panels;
      const frontPanel = panels.find(p => p.source.type === 'face' && p.source.faceId === 'front');
      expect(frontPanel).toBeDefined();

      // Get original Y bounds
      const originalMaxY = Math.max(...frontPanel!.outline.points.map(p => p.y));

      // Apply extension that adds 20mm above
      // Panel outline uses CENTERED coordinates (-halfW to +halfW, -halfH to +halfH)
      const halfW = frontPanel!.width / 2;
      const halfH = frontPanel!.height / 2;
      // Extension overlaps top edge (y=halfH) and extends 20mm above
      const extension = createRectPolygon(-halfW * 0.2, halfH - 5, halfW * 0.2, halfH + 20);

      engine.dispatch({
        type: 'APPLY_EDGE_OPERATION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel!.id,
          operation: 'union',
          shape: extension,
        },
      });

      const updatedPanels = engine.generatePanelsFromNodes().panels;
      const updatedFront = updatedPanels.find(p => p.id === frontPanel!.id);

      // THE KEY TEST: Max Y should be higher after extension
      const newMaxY = Math.max(...updatedFront!.outline.points.map(p => p.y));
      expect(newMaxY).toBeGreaterThan(originalMaxY);
    });

    it('D4: second extension should preserve first extension', () => {
      const engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);

      const panels = engine.generatePanelsFromNodes().panels;
      const frontPanel = panels.find(p => p.source.type === 'face' && p.source.faceId === 'front');
      expect(frontPanel).toBeDefined();

      // Panel outline uses CENTERED coordinates (-halfW to +halfW, -halfH to +halfH)
      const halfW = frontPanel!.width / 2;
      const halfH = frontPanel!.height / 2;

      const originalMaxY = Math.max(...frontPanel!.outline.points.map(p => p.y));

      // First extension on left side of top edge
      const ext1 = createRectPolygon(-halfW * 0.8, halfH - 5, -halfW * 0.4, halfH + 15);
      engine.dispatch({
        type: 'APPLY_EDGE_OPERATION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel!.id,
          operation: 'union',
          shape: ext1,
        },
      });

      // Verify first extension is applied
      let updatedPanels = engine.generatePanelsFromNodes().panels;
      let updatedFront = updatedPanels.find(p => p.id === frontPanel!.id);
      const maxYAfterFirst = Math.max(...updatedFront!.outline.points.map(p => p.y));
      expect(maxYAfterFirst).toBeGreaterThan(originalMaxY);

      // Second extension on right side of top edge
      const ext2 = createRectPolygon(halfW * 0.4, halfH - 5, halfW * 0.8, halfH + 15);
      engine.dispatch({
        type: 'APPLY_EDGE_OPERATION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel!.id,
          operation: 'union',
          shape: ext2,
        },
      });

      // Verify both extensions are present
      updatedPanels = engine.generatePanelsFromNodes().panels;
      updatedFront = updatedPanels.find(p => p.id === frontPanel!.id);
      const points = updatedFront!.outline.points;

      // THE KEY TEST: Both extensions should be preserved
      // Check for high-Y points in left region (x < 0)
      const leftExtensionPoints = points.filter(p => p.x < 0 && p.y > originalMaxY);
      expect(leftExtensionPoints.length).toBeGreaterThan(0);

      // Check for high-Y points in right region (x > 0)
      const rightExtensionPoints = points.filter(p => p.x > 0 && p.y > originalMaxY);
      expect(rightExtensionPoints.length).toBeGreaterThan(0);

      // Max Y should still be at extension height
      const maxYAfterSecond = Math.max(...points.map(p => p.y));
      expect(maxYAfterSecond).toBeCloseTo(halfH + 15, 0);
    });

    it('D3: interior polygon touching edge should create cutout, not edge path', () => {
      const engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);

      const panels = engine.generatePanelsFromNodes().panels;
      const frontPanel = panels.find(p => p.source.type === 'face' && p.source.faceId === 'front');
      expect(frontPanel).toBeDefined();

      const originalHoleCount = frontPanel!.holes.length;

      // Polygon that touches top edge but doesn't cross it
      // In the UI, this would be drawn as "cut hole" but touches the boundary
      const pw = frontPanel!.width;
      const ph = frontPanel!.height;

      // This should be classified as interior and create a cutout
      // But currently it's classified as boundary and fails
      const touchingPolygon = createRectPolygon(pw * 0.3, ph * 0.7, pw * 0.7, ph);

      const panelOutline = createRectPolygon(0, 0, pw, ph);
      const classification = classifyPolygon(touchingPolygon, panelOutline);

      // THE KEY TEST: Should be interior, not boundary
      // This will FAIL due to the classification bug
      expect(classification).toBe('interior');

      // If classification was correct, this cutout would be created:
      if (classification === 'interior') {
        const centerX = (pw * 0.3 + pw * 0.7) / 2;
        const centerY = (ph * 0.7 + ph) / 2;

        engine.dispatch({
          type: 'ADD_CUTOUT',
          targetId: 'main-assembly',
          payload: {
            panelId: frontPanel!.id,
            cutout: {
              id: 'touching-cutout',
              type: 'rect',
              center: { x: centerX, y: centerY },
              width: pw * 0.4,
              height: ph * 0.3,
            },
          },
        });

        const updatedPanels = engine.generatePanelsFromNodes().panels;
        const updatedFront = updatedPanels.find(p => p.id === frontPanel!.id);
        expect(updatedFront!.holes.length).toBeGreaterThan(originalHoleCount);
      }
    });

    it('differencePolygons should cut triangle from simple rectangle', () => {
      // Simple test: rectangle minus triangle should create notch
      const rect = [
        { x: -50, y: -40 },
        { x: 50, y: -40 },
        { x: 50, y: 40 },
        { x: -50, y: 40 },
      ];

      const triangle = [
        { x: -10, y: 30 },  // Inside rect
        { x: 10, y: 30 },   // Inside rect
        { x: 0, y: 60 },    // Outside rect (above)
      ];

      const result = differencePolygons(rect, triangle);
      expect(result).not.toBeNull();
      console.log('Difference result points:', result!.length);
      console.log('Result Y range:', Math.min(...result!.map(p => p.y)), 'to', Math.max(...result!.map(p => p.y)));

      // The result should have points with Y < 40 in the center region
      // where the triangle was cut out
      const centerPoints = result!.filter(p => Math.abs(p.x) < 15);
      console.log('Center points:', centerPoints);
      const minYInCenter = Math.min(...centerPoints.map(p => p.y));

      // The notch should cut down to y=30 (triangle base)
      expect(minYInCenter).toBeLessThan(40);
    });

    it('D8: difference operation on simple rectangle works correctly', () => {
      // This test verifies the basic difference operation works.
      // Note: On panels with finger joints, cuts should be clipped to safe space
      // (that's a separate issue - boolean ops need safe space clipping)

      const rect = createRectPolygon(-50, -40, 50, 40);

      // Triangle notch cutting into the top
      const notchTriangle = [
        { x: -10, y: 30 },   // Inside rect, left side
        { x: 10, y: 30 },    // Inside rect, right side
        { x: 0, y: 60 },     // Peak extends above rect
      ];

      const result = differencePolygons(rect, notchTriangle);
      expect(result).not.toBeNull();

      // The result should have a notch cut into the top
      // Points in the center region should go down to y=30
      const centerPoints = result!.filter(p => Math.abs(p.x) < 15 && p.y > 25);
      const minYInCenter = Math.min(...centerPoints.map(p => p.y));

      expect(minYInCenter).toBe(30); // Cut goes down to triangle base
    });
  });
});
