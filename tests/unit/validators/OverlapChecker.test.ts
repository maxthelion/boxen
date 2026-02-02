/**
 * OverlapChecker Unit Tests
 *
 * Tests 3D overlap detection rules:
 * - overlap:no-body-intersection - Panel bodies must not overlap in 3D space
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createEngine } from '../../../src/engine/Engine';
import {
  checkOverlap,
  formatOverlapCheckResult,
} from '../../../src/engine/validators/OverlapChecker';
import type { Engine } from '../../../src/engine/Engine';

describe('OverlapChecker', () => {
  let engine: Engine;

  beforeEach(() => {
    engine = createEngine();
  });

  describe('Basic Box Validation', () => {
    it('passes all checks for a basic box', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      const result = checkOverlap(engine);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.summary.panelCount).toBe(6); // 6 faces
      expect(result.summary.pairsChecked).toBe(15); // C(6,2) = 15 pairs
    });

    it('passes checks for box with subdivisions', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', position: 100 },
      });

      const result = checkOverlap(engine);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      // 6 face panels + 1 divider
      expect(result.summary.panelCount).toBe(7);
    });

    it('passes checks for box with multiple subdivisions', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Add X subdivision
      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', position: 100 },
      });

      // Get the resulting voids and subdivide one of them on Y
      const snapshot = engine.getSnapshot();
      const rootVoid = snapshot.children[0].children[0];
      const childVoids = rootVoid.children.filter((c: any) => c.kind === 'void');

      if (childVoids.length > 0) {
        engine.dispatch({
          type: 'ADD_SUBDIVISION',
          targetId: 'main-assembly',
          payload: { voidId: childVoids[0].id, axis: 'z', position: 50 },
        });
      }

      const result = checkOverlap(engine);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('passes checks for box with grid subdivision', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      engine.dispatch({
        type: 'ADD_GRID_SUBDIVISION',
        targetId: 'main-assembly',
        payload: {
          voidId: 'root',
          axes: [
            { axis: 'x', positions: [66.67, 133.33] },
            { axis: 'z', positions: [50] },
          ],
        },
      });

      const result = checkOverlap(engine);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('checks the expected rule', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      const result = checkOverlap(engine);

      expect(result.summary.rulesChecked).toContain('overlap:no-body-intersection');
    });
  });

  describe('Box with Sub-Assemblies', () => {
    it('passes checks for box with sub-assembly', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Create sub-assembly in root void
      engine.dispatch({
        type: 'CREATE_SUB_ASSEMBLY',
        targetId: 'main-assembly',
        payload: { voidId: 'root', clearance: 1 },
      });

      const result = checkOverlap(engine);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      // Main box panels + sub-assembly panels
      expect(result.summary.panelCount).toBeGreaterThan(6);
    });

    it('passes checks for sub-assembly with custom clearance', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Create sub-assembly with larger clearance
      engine.dispatch({
        type: 'CREATE_SUB_ASSEMBLY',
        targetId: 'main-assembly',
        payload: { voidId: 'root', clearance: 5 },
      });

      const result = checkOverlap(engine);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty engine gracefully', () => {
      // No assembly created
      const result = checkOverlap(engine);

      expect(result.valid).toBe(true);
      expect(result.summary.panelCount).toBe(0);
      expect(result.summary.pairsChecked).toBe(0);
    });

    it('handles single-panel box (all faces removed)', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Toggle off all faces except one
      const faces = ['back', 'left', 'right', 'top', 'bottom'];
      for (const face of faces) {
        engine.dispatch({
          type: 'TOGGLE_FACE',
          targetId: 'main-assembly',
          payload: { faceId: face as any },
        });
      }

      const result = checkOverlap(engine);

      // Only front face remains - no pairs to check
      expect(result.valid).toBe(true);
      expect(result.summary.panelCount).toBe(1);
      expect(result.summary.pairsChecked).toBe(0);
    });

    it('handles box with various dimensions', () => {
      // Test with a very thin box
      engine.createAssembly(300, 20, 300, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      const result = checkOverlap(engine);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('handles box with thick material', () => {
      engine.createAssembly(100, 100, 100, {
        thickness: 10,
        fingerWidth: 15,
        fingerGap: 2,
      });

      const result = checkOverlap(engine);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Edge Extensions', () => {
    it('passes checks after applying edge extension', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Get bottom panel ID
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const bottomPanel = panels.find(
        (p: any) => p.kind === 'face-panel' && p.props.faceId === 'bottom'
      );

      if (bottomPanel) {
        // Apply edge extension to bottom panel
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: bottomPanel.id, edge: 'bottom', value: 20 },
        });
      }

      const result = checkOverlap(engine);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('passes checks with multiple edge extensions', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Get bottom panel
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const bottomPanel = panels.find(
        (p: any) => p.kind === 'face-panel' && p.props.faceId === 'bottom'
      );

      if (bottomPanel) {
        // Apply extensions to multiple edges
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: bottomPanel.id, edge: 'bottom', value: 20 },
        });
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: bottomPanel.id, edge: 'left', value: 15 },
        });
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: bottomPanel.id, edge: 'right', value: 15 },
        });
      }

      const result = checkOverlap(engine);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('formatOverlapCheckResult', () => {
    it('formats valid result', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      const result = checkOverlap(engine);
      const formatted = formatOverlapCheckResult(result);

      expect(formatted).toContain('OVERLAP CHECK RESULTS');
      expect(formatted).toContain('✓ VALID');
      expect(formatted).toContain('Errors: 0');
      expect(formatted).toContain('Panels Checked: 6');
      expect(formatted).toContain('Pairs Checked: 15');
    });

    it('includes panel count and pairs in output', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', position: 100 },
      });

      const result = checkOverlap(engine);
      const formatted = formatOverlapCheckResult(result);

      expect(formatted).toContain('Panels Checked: 7');
      // C(7,2) = 21 pairs
      expect(formatted).toContain('Pairs Checked: 21');
    });
  });

  describe('Numerical Stability', () => {
    it('handles panels that exactly touch at surfaces', () => {
      // This is the normal case - panels share surfaces at edges
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      const result = checkOverlap(engine);

      // Touching is allowed, only interior overlap is flagged
      expect(result.valid).toBe(true);
    });

    it('handles rotated panels correctly', () => {
      // All face panels have different rotations
      engine.createAssembly(100, 100, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      const result = checkOverlap(engine);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
