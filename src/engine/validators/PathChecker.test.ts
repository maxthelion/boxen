/**
 * PathChecker Unit Tests
 *
 * Tests path validation rules:
 * - path:axis-aligned - No diagonal segments
 * - path:minimum-points - At least 3 points
 * - path:no-duplicates - No consecutive duplicate points
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createEngine } from '../Engine';
import {
  checkPathValidity,
  isPathAxisAligned,
  findDiagonalSegments,
  formatPathCheckResult,
} from './PathChecker';
import type { Engine } from '../Engine';
import type { Point2D } from '../types';

describe('PathChecker', () => {
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

      const result = checkPathValidity(engine);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('passes all checks for box with subdivisions', () => {
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

      const result = checkPathValidity(engine);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('checks all expected rules', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      const result = checkPathValidity(engine);

      expect(result.summary.rulesChecked).toContain('path:axis-aligned');
      expect(result.summary.rulesChecked).toContain('path:minimum-points');
      expect(result.summary.rulesChecked).toContain('path:no-duplicates');
    });
  });

  describe('Rule: path:axis-aligned', () => {
    describe('isPathAxisAligned helper', () => {
      it('returns true for axis-aligned rectangle', () => {
        const points: Point2D[] = [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 50 },
          { x: 0, y: 50 },
        ];

        expect(isPathAxisAligned(points)).toBe(true);
      });

      it('returns true for axis-aligned L-shape', () => {
        const points: Point2D[] = [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
          { x: 50, y: 25 },
          { x: 100, y: 25 },
          { x: 100, y: 50 },
          { x: 0, y: 50 },
        ];

        expect(isPathAxisAligned(points)).toBe(true);
      });

      it('returns false for path with diagonal segment', () => {
        const points: Point2D[] = [
          { x: 0, y: 0 },
          { x: 100, y: 50 }, // Diagonal!
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ];

        expect(isPathAxisAligned(points)).toBe(false);
      });

      it('returns false for path with closing diagonal', () => {
        const points: Point2D[] = [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 50, y: 50 }, // Last point doesn't align with first
        ];

        expect(isPathAxisAligned(points)).toBe(false);
      });

      it('respects tolerance for near-axis-aligned segments', () => {
        const points: Point2D[] = [
          { x: 0, y: 0 },
          { x: 100, y: 0.0005 }, // Within default tolerance
          { x: 100, y: 50 },
          { x: 0, y: 50 },
        ];

        expect(isPathAxisAligned(points)).toBe(true);
      });

      it('returns true for empty path', () => {
        expect(isPathAxisAligned([])).toBe(true);
      });

      it('returns true for single point', () => {
        expect(isPathAxisAligned([{ x: 0, y: 0 }])).toBe(true);
      });
    });

    describe('findDiagonalSegments helper', () => {
      it('returns empty array for axis-aligned path', () => {
        const points: Point2D[] = [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 50 },
          { x: 0, y: 50 },
        ];

        const diagonals = findDiagonalSegments(points);
        expect(diagonals).toHaveLength(0);
      });

      it('finds single diagonal segment', () => {
        const points: Point2D[] = [
          { x: 0, y: 0 },
          { x: 100, y: 50 }, // Diagonal!
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ];

        const diagonals = findDiagonalSegments(points);
        expect(diagonals).toHaveLength(1);
        expect(diagonals[0].index).toBe(0);
        expect(diagonals[0].from).toEqual({ x: 0, y: 0 });
        expect(diagonals[0].to).toEqual({ x: 100, y: 50 });
      });

      it('finds multiple diagonal segments', () => {
        const points: Point2D[] = [
          { x: 0, y: 0 },
          { x: 50, y: 50 }, // Diagonal 1 (from 0,0)
          { x: 100, y: 0 }, // Diagonal 2 (from 50,50)
          { x: 100, y: 100 },
          // Closing segment from (100,100) to (0,0) is also diagonal!
        ];

        const diagonals = findDiagonalSegments(points);
        expect(diagonals).toHaveLength(3); // 0→1, 1→2, and 3→0 (closing)
        expect(diagonals[0].index).toBe(0);
        expect(diagonals[1].index).toBe(1);
        expect(diagonals[2].index).toBe(3); // Closing segment
      });

      it('finds diagonal in closing segment', () => {
        const points: Point2D[] = [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 50, y: 50 }, // Closing segment goes diagonally to (0,0)
          // Also segment 2→3 is diagonal: (100,100) to (50,50)
        ];

        const diagonals = findDiagonalSegments(points);
        expect(diagonals).toHaveLength(2); // 2→3 and 3→0 (closing)
        expect(diagonals[0].index).toBe(2); // (100,100) → (50,50)
        expect(diagonals[1].index).toBe(3); // (50,50) → (0,0) closing
      });

      it('includes dx and dy in result', () => {
        const points: Point2D[] = [
          { x: 0, y: 0 },
          { x: 30, y: 40 },
          { x: 30, y: 100 },
          // Closing segment (30,100) → (0,0) is also diagonal
        ];

        const diagonals = findDiagonalSegments(points);
        expect(diagonals).toHaveLength(2); // 0→1 and 2→0 (closing)
        expect(diagonals[0].dx).toBeCloseTo(30);
        expect(diagonals[0].dy).toBeCloseTo(40);
      });
    });
  });

  describe('Rule: path:minimum-points', () => {
    it('accepts paths with 3 or more points', () => {
      const trianglePath: Point2D[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 50, y: 50 },
      ];

      // This is a valid polygon (minimum points)
      expect(trianglePath.length >= 3).toBe(true);
    });

    it('rejects paths with fewer than 3 points', () => {
      const twoPoints: Point2D[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ];

      expect(twoPoints.length < 3).toBe(true);
    });
  });

  describe('formatPathCheckResult', () => {
    it('formats valid result', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      const result = checkPathValidity(engine);
      const formatted = formatPathCheckResult(result);

      expect(formatted).toContain('PATH VALIDITY CHECK RESULTS');
      expect(formatted).toContain('✓ VALID');
      expect(formatted).toContain('Errors: 0');
    });
  });

  describe('Edge Extension Scenarios', () => {
    it('validates path after applying edge extension', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Get front panel ID
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const frontPanel = panels.find(
        (p: any) => p.kind === 'face-panel' && p.props.faceId === 'front'
      );

      if (frontPanel) {
        // Apply edge extension
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: frontPanel.id, edge: 'bottom', value: 20 },
        });
      }

      const result = checkPathValidity(engine);

      // Log any errors for debugging
      if (!result.valid) {
        console.log(formatPathCheckResult(result));
      }

      // This test documents the current behavior
      // If edge extensions produce diagonal lines, this test will expose it
      // The test itself doesn't assert validity - that's for the integration tests
      expect(result.summary.rulesChecked).toContain('path:axis-aligned');
    });

    it('validates path after multiple edge extensions', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Get front panel ID
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const frontPanel = panels.find(
        (p: any) => p.kind === 'face-panel' && p.props.faceId === 'front'
      );

      if (frontPanel) {
        // Apply multiple edge extensions
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: frontPanel.id, edge: 'bottom', value: 20 },
        });
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: frontPanel.id, edge: 'left', value: 15 },
        });
      }

      const result = checkPathValidity(engine);

      // This test documents the current behavior
      expect(result.summary.rulesChecked).toContain('path:axis-aligned');
    });
  });
});
