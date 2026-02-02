/**
 * Tests for polygon boolean operations
 */

import { describe, it, expect } from 'vitest';
import {
  unionPolygons,
  differencePolygons,
  intersectPolygons,
  createRectPolygon,
  createCirclePolygon,
  computePolygonArea,
  isValidPolygon,
} from '../../../src/utils/polygonBoolean';

describe('polygonBoolean', () => {
  describe('createRectPolygon', () => {
    it('should create a rectangle with correct corners', () => {
      const rect = createRectPolygon(0, 0, 10, 5);
      expect(rect).toHaveLength(4);
      expect(rect).toContainEqual({ x: 0, y: 0 });
      expect(rect).toContainEqual({ x: 10, y: 0 });
      expect(rect).toContainEqual({ x: 10, y: 5 });
      expect(rect).toContainEqual({ x: 0, y: 5 });
    });
  });

  describe('createCirclePolygon', () => {
    it('should create a circle with specified number of segments', () => {
      const circle = createCirclePolygon(0, 0, 10, 8);
      expect(circle).toHaveLength(8);

      // All points should be radius distance from center
      for (const point of circle) {
        const dist = Math.sqrt(point.x * point.x + point.y * point.y);
        expect(dist).toBeCloseTo(10, 5);
      }
    });
  });

  describe('computePolygonArea', () => {
    it('should compute correct area for a rectangle', () => {
      const rect = createRectPolygon(0, 0, 10, 5);
      const area = computePolygonArea(rect);
      expect(area).toBeCloseTo(50, 5);
    });

    it('should compute correct area for a unit square', () => {
      const square = createRectPolygon(0, 0, 1, 1);
      const area = computePolygonArea(square);
      expect(area).toBeCloseTo(1, 5);
    });
  });

  describe('isValidPolygon', () => {
    it('should return true for valid polygons', () => {
      const rect = createRectPolygon(0, 0, 10, 5);
      expect(isValidPolygon(rect)).toBe(true);
    });

    it('should return false for polygons with less than 3 points', () => {
      expect(isValidPolygon([{ x: 0, y: 0 }])).toBe(false);
      expect(isValidPolygon([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false);
    });

    it('should return false for degenerate polygons', () => {
      // All points on a line
      expect(isValidPolygon([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ])).toBe(false);
    });
  });

  describe('unionPolygons', () => {
    it('should union two non-overlapping rectangles', () => {
      const rect1 = createRectPolygon(0, 0, 10, 10);
      const rect2 = createRectPolygon(5, 5, 15, 15);

      const result = unionPolygons(rect1, rect2);
      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThanOrEqual(4);

      // Union area should be larger than either individual rectangle
      const area = computePolygonArea(result!);
      expect(area).toBeGreaterThan(100); // rect1 area
      expect(area).toBeGreaterThan(100); // rect2 area
      // Union area = 100 + 100 - 25 (overlap) = 175
      expect(area).toBeCloseTo(175, 1);
    });

    it('should return containing rectangle when one contains the other', () => {
      const outer = createRectPolygon(0, 0, 20, 20);
      const inner = createRectPolygon(5, 5, 15, 15);

      const result = unionPolygons(outer, inner);
      expect(result).not.toBeNull();

      const area = computePolygonArea(result!);
      expect(area).toBeCloseTo(400, 1); // Outer rectangle area
    });
  });

  describe('differencePolygons', () => {
    it('should cut a notch from a rectangle', () => {
      const rect = createRectPolygon(0, 0, 100, 50);
      const notch = createRectPolygon(40, 40, 60, 60); // Overlaps top edge

      const result = differencePolygons(rect, notch);
      expect(result).not.toBeNull();

      // Area should be original minus the overlapping portion
      // rect: 100x50 = 5000
      // overlap: 20x10 = 200
      // result: 5000 - 200 = 4800
      const area = computePolygonArea(result!);
      expect(area).toBeCloseTo(4800, 1);
    });

    it('should return null when subtracting larger polygon', () => {
      const small = createRectPolygon(10, 10, 20, 20);
      const large = createRectPolygon(0, 0, 100, 100);

      const result = differencePolygons(small, large);
      // Result should be null or empty (small is entirely contained in large)
      expect(result === null || result.length < 3 || computePolygonArea(result) < 0.001).toBe(true);
    });
  });

  describe('intersectPolygons', () => {
    it('should find intersection of overlapping rectangles', () => {
      const rect1 = createRectPolygon(0, 0, 10, 10);
      const rect2 = createRectPolygon(5, 5, 15, 15);

      const result = intersectPolygons(rect1, rect2);
      expect(result).not.toBeNull();

      // Intersection should be 5x5 = 25
      const area = computePolygonArea(result!);
      expect(area).toBeCloseTo(25, 1);
    });

    it('should return null for non-overlapping rectangles', () => {
      const rect1 = createRectPolygon(0, 0, 10, 10);
      const rect2 = createRectPolygon(20, 20, 30, 30);

      const result = intersectPolygons(rect1, rect2);
      expect(result === null || result.length < 3).toBe(true);
    });
  });

  describe('edge modification scenarios', () => {
    it('should create an extension by union', () => {
      // Panel body: 100x50 centered at origin
      const body = createRectPolygon(-50, -25, 50, 25);
      // Extension tab: extends 15mm above top edge
      const extension = createRectPolygon(-20, 25, 20, 40);

      const result = unionPolygons(body, extension);
      expect(result).not.toBeNull();

      // Area should be body + extension
      // body: 100x50 = 5000
      // extension: 40x15 = 600
      // result: 5600
      const area = computePolygonArea(result!);
      expect(area).toBeCloseTo(5600, 1);
    });

    it('should cut a notch by difference', () => {
      // Panel body: 100x50 centered at origin
      const body = createRectPolygon(-50, -25, 50, 25);
      // Notch: cuts 10mm into top edge
      const notch = createRectPolygon(-10, 15, 10, 35);

      const result = differencePolygons(body, notch);
      expect(result).not.toBeNull();

      // Area should be body minus the overlap
      // body: 100x50 = 5000
      // overlap: 20x10 = 200
      // result: 4800
      const area = computePolygonArea(result!);
      expect(area).toBeCloseTo(4800, 1);
    });

    it('should handle extension + notch scenario', () => {
      // Start with panel body
      const body = createRectPolygon(-50, -25, 50, 25);

      // Add extension (union)
      const extension = createRectPolygon(-20, 25, 20, 40);
      const withExtension = unionPolygons(body, extension);
      expect(withExtension).not.toBeNull();

      // Cut notch through extension (difference)
      const notch = createRectPolygon(-5, 20, 5, 45);
      const result = differencePolygons(withExtension!, notch);
      expect(result).not.toBeNull();

      // Verify the result has the right shape
      // The result should have a slot cut through the extension
      const area = computePolygonArea(result!);
      // body: 5000, extension: 600, notch overlap: 10x20 = 200
      // result: 5600 - 200 = 5400
      expect(area).toBeCloseTo(5400, 1);
    });
  });
});
