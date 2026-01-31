import { describe, it, expect } from 'vitest';
import {
  computeSignedArea,
  getPathBounds,
  findDuplicatePoints,
  holeTouchesBoundary,
  validatePanelPath,
} from '../../../src/utils/pathValidation';
import { PathPoint } from '../../../src/types';

describe('pathValidation', () => {
  describe('computeSignedArea', () => {
    it('returns positive area for clockwise path', () => {
      // CW square: top-left → top-right → bottom-right → bottom-left
      const cwSquare: PathPoint[] = [
        { x: 0, y: 10 },
        { x: 10, y: 10 },
        { x: 10, y: 0 },
        { x: 0, y: 0 },
      ];
      expect(computeSignedArea(cwSquare)).toBeGreaterThan(0);
    });

    it('returns negative area for counter-clockwise path', () => {
      // CCW square: top-left → bottom-left → bottom-right → top-right
      const ccwSquare: PathPoint[] = [
        { x: 0, y: 10 },
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ];
      expect(computeSignedArea(ccwSquare)).toBeLessThan(0);
    });

    it('returns approximately correct area magnitude', () => {
      // 10x10 square should have area ~100
      const square: PathPoint[] = [
        { x: 0, y: 10 },
        { x: 10, y: 10 },
        { x: 10, y: 0 },
        { x: 0, y: 0 },
      ];
      expect(Math.abs(computeSignedArea(square))).toBeCloseTo(100, 1);
    });
  });

  describe('getPathBounds', () => {
    it('returns correct bounds for a path', () => {
      const path: PathPoint[] = [
        { x: -5, y: 10 },
        { x: 15, y: -3 },
        { x: 8, y: 20 },
      ];
      const bounds = getPathBounds(path);
      expect(bounds.minX).toBe(-5);
      expect(bounds.maxX).toBe(15);
      expect(bounds.minY).toBe(-3);
      expect(bounds.maxY).toBe(20);
    });

    it('returns zeros for empty path', () => {
      const bounds = getPathBounds([]);
      expect(bounds.minX).toBe(0);
      expect(bounds.maxX).toBe(0);
      expect(bounds.minY).toBe(0);
      expect(bounds.maxY).toBe(0);
    });
  });

  describe('findDuplicatePoints', () => {
    it('finds no duplicates in valid path', () => {
      const path: PathPoint[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ];
      expect(findDuplicatePoints(path)).toHaveLength(0);
    });

    it('finds duplicate consecutive points', () => {
      const path: PathPoint[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 0 }, // duplicate
        { x: 10, y: 10 },
      ];
      const duplicates = findDuplicatePoints(path);
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].index).toBe(1);
    });

    it('finds duplicate at path closure (last to first)', () => {
      const path: PathPoint[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 0 }, // same as first - creates zero-length closing segment
      ];
      const duplicates = findDuplicatePoints(path);
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].index).toBe(3);
    });

    it('respects tolerance parameter', () => {
      const path: PathPoint[] = [
        { x: 0, y: 0 },
        { x: 0.0001, y: 0 }, // very close but not exact
        { x: 10, y: 10 },
      ];
      // With default tolerance (0.001), should find duplicate
      expect(findDuplicatePoints(path, 0.001)).toHaveLength(1);
      // With tighter tolerance, should not find duplicate
      expect(findDuplicatePoints(path, 0.00001)).toHaveLength(0);
    });
  });

  describe('holeTouchesBoundary', () => {
    const outlineBounds = { minX: -50, maxX: 50, minY: -50, maxY: 50 };

    it('returns false for hole fully inside', () => {
      const holePoints: PathPoint[] = [
        { x: -10, y: -10 },
        { x: 10, y: -10 },
        { x: 10, y: 10 },
        { x: -10, y: 10 },
      ];
      const result = holeTouchesBoundary(holePoints, outlineBounds);
      expect(result.touches).toBe(false);
      expect(result.edges).toHaveLength(0);
    });

    it('detects hole touching left boundary', () => {
      const holePoints: PathPoint[] = [
        { x: -50, y: -10 },
        { x: -40, y: -10 },
        { x: -40, y: 10 },
        { x: -50, y: 10 },
      ];
      const result = holeTouchesBoundary(holePoints, outlineBounds);
      expect(result.touches).toBe(true);
      expect(result.edges).toContain('left');
    });

    it('detects hole touching multiple boundaries', () => {
      const holePoints: PathPoint[] = [
        { x: -50, y: 40 },
        { x: -40, y: 40 },
        { x: -40, y: 50 },
        { x: -50, y: 50 },
      ];
      const result = holeTouchesBoundary(holePoints, outlineBounds);
      expect(result.touches).toBe(true);
      expect(result.edges).toContain('left');
      expect(result.edges).toContain('top');
    });
  });

  describe('validatePanelPath', () => {
    // Valid CCW outline (standard for our panel generation)
    const validOutline: PathPoint[] = [
      { x: -50, y: 50 },   // top-left
      { x: 50, y: 50 },    // top-right
      { x: 50, y: -50 },   // bottom-right
      { x: -50, y: -50 },  // bottom-left
    ];

    // Valid CW hole (opposite winding to outline)
    const validHole: PathPoint[] = [
      { x: -10, y: 10 },   // top-left
      { x: -10, y: -10 },  // bottom-left
      { x: 10, y: -10 },   // bottom-right
      { x: 10, y: 10 },    // top-right
    ];

    it('validates a correct path with no holes', () => {
      const result = validatePanelPath(validOutline, []);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('validates a correct path with valid hole', () => {
      const result = validatePanelPath(validOutline, [{ points: validHole }]);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects empty outline', () => {
      const result = validatePanelPath([], []);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.type === 'empty_path')).toBe(true);
    });

    it('rejects outline with fewer than 3 points', () => {
      const result = validatePanelPath([{ x: 0, y: 0 }, { x: 10, y: 0 }], []);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.type === 'insufficient_points')).toBe(true);
    });

    it('rejects degenerate outline with zero area', () => {
      // Collinear points - zero area
      const collinear: PathPoint[] = [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
      ];
      const result = validatePanelPath(collinear, []);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.type === 'zero_area')).toBe(true);
    });

    it('rejects outline with duplicate points', () => {
      const withDuplicate: PathPoint[] = [
        { x: -50, y: 50 },
        { x: 50, y: 50 },
        { x: 50, y: 50 }, // duplicate
        { x: 50, y: -50 },
        { x: -50, y: -50 },
      ];
      const result = validatePanelPath(withDuplicate, []);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.type === 'duplicate_points')).toBe(true);
    });

    it('rejects hole with same winding as outline', () => {
      // This hole is CCW like the outline - wrong!
      const sameWindingHole: PathPoint[] = [
        { x: -10, y: 10 },
        { x: 10, y: 10 },
        { x: 10, y: -10 },
        { x: -10, y: -10 },
      ];
      const result = validatePanelPath(validOutline, [{ points: sameWindingHole }]);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.type === 'same_winding')).toBe(true);
    });

    it('rejects hole outside outline bounds', () => {
      const outsideHole: PathPoint[] = [
        { x: 60, y: 10 },
        { x: 60, y: -10 },
        { x: 80, y: -10 },
        { x: 80, y: 10 },
      ];
      const result = validatePanelPath(validOutline, [{ points: outsideHole }]);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.type === 'hole_outside_bounds')).toBe(true);
    });

    it('rejects hole touching outline boundary', () => {
      // Hole touches left edge of outline
      const boundaryHole: PathPoint[] = [
        { x: -50, y: 10 },   // touches left boundary
        { x: -50, y: -10 },
        { x: -40, y: -10 },
        { x: -40, y: 10 },
      ];
      const result = validatePanelPath(validOutline, [{ points: boundaryHole }]);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.type === 'hole_touches_boundary')).toBe(true);
    });

    it('warns about very small holes', () => {
      // Very small hole (0.5 x 0.5)
      const tinyHole: PathPoint[] = [
        { x: -0.25, y: 0.25 },
        { x: -0.25, y: -0.25 },
        { x: 0.25, y: -0.25 },
        { x: 0.25, y: 0.25 },
      ];
      const result = validatePanelPath(validOutline, [{ points: tinyHole }]);
      // Still valid, but should warn
      expect(result.warnings.some(w => w.type === 'very_small_hole')).toBe(true);
    });

    it('detects multiple errors in one validation', () => {
      // Hole with duplicate points AND touching boundary
      const badHole: PathPoint[] = [
        { x: -50, y: 10 },
        { x: -50, y: 10 }, // duplicate
        { x: -50, y: -10 },
        { x: -40, y: -10 },
        { x: -40, y: 10 },
      ];
      const result = validatePanelPath(validOutline, [{ points: badHole }]);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('real-world scenarios', () => {
    it('validates typical face panel with divider slots', () => {
      // Simulated face panel outline (CW, will be reversed by renderer)
      const outline: PathPoint[] = [
        { x: -47, y: 50 },
        { x: 47, y: 50 },
        { x: 47, y: 32 },
        { x: 50, y: 32 },
        { x: 50, y: -32 },
        { x: 47, y: -32 },
        { x: 47, y: -50 },
        { x: -47, y: -50 },
        { x: -47, y: -32 },
        { x: -50, y: -32 },
        { x: -50, y: 32 },
        { x: -47, y: 32 },
      ];

      // Typical slot hole (CCW, opposite to outline)
      const slot: PathPoint[] = [
        { x: -1.5, y: -32 },
        { x: 1.5, y: -32 },
        { x: 1.5, y: -19.2 },
        { x: -1.5, y: -19.2 },
      ];

      const result = validatePanelPath(outline, [{ points: slot }]);
      expect(result.valid).toBe(true);
    });

    it('detects problematic divider slot at panel edge', () => {
      // Divider panel outline
      const outline: PathPoint[] = [
        { x: -25.8, y: 50 },
        { x: 25.8, y: 50 },
        { x: 25.8, y: -50 },
        { x: -25.8, y: -50 },
      ];

      // Slot that touches the left edge (the bug we fixed)
      const edgeSlot: PathPoint[] = [
        { x: -25.8, y: -32 },  // touches left boundary
        { x: -22.8, y: -32 },
        { x: -22.8, y: -19.2 },
        { x: -25.8, y: -19.2 },
      ];

      const result = validatePanelPath(outline, [{ points: edgeSlot }]);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.type === 'hole_touches_boundary')).toBe(true);
    });
  });
});
