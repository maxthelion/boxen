import { describe, it, expect } from 'vitest';
import { rect, polygon, circle, lShape } from './shapes';

describe('Shape helpers', () => {
  describe('rect', () => {
    it('creates rectangle with 4 points', () => {
      const shape = rect(10, 20, 30, 40);
      expect(shape.points).toBe(4);

      const path = shape.toPath();
      expect(path).toHaveLength(4);
      expect(path[0]).toEqual({ x: 10, y: 20 });
      expect(path[1]).toEqual({ x: 40, y: 20 });
      expect(path[2]).toEqual({ x: 40, y: 60 });
      expect(path[3]).toEqual({ x: 10, y: 60 });
    });

    it('handles zero position', () => {
      const shape = rect(0, 0, 20, 20);
      const path = shape.toPath();
      expect(path[0]).toEqual({ x: 0, y: 0 });
      expect(path[2]).toEqual({ x: 20, y: 20 });
    });
  });

  describe('polygon', () => {
    it('creates polygon from points', () => {
      const shape = polygon([0, 0], [10, 0], [5, 10]);
      expect(shape.points).toBe(3);

      const path = shape.toPath();
      expect(path).toHaveLength(3);
      expect(path[0]).toEqual({ x: 0, y: 0 });
      expect(path[1]).toEqual({ x: 10, y: 0 });
      expect(path[2]).toEqual({ x: 5, y: 10 });
    });

    it('creates complex polygons', () => {
      const shape = polygon([0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10]);
      expect(shape.points).toBe(6);
      expect(shape.toPath()).toHaveLength(6);
    });
  });

  describe('circle', () => {
    it('creates circle with default segments', () => {
      const shape = circle(0, 0, 10);
      expect(shape.points).toBe(16);

      const path = shape.toPath();
      expect(path).toHaveLength(16);

      // First point should be at (10, 0) - rightmost
      expect(path[0].x).toBeCloseTo(10);
      expect(path[0].y).toBeCloseTo(0);
    });

    it('creates circle with custom segments', () => {
      const shape = circle(5, 5, 10, 8);
      expect(shape.points).toBe(8);
    });

    it('creates circle at offset center', () => {
      const shape = circle(10, 20, 5);
      const path = shape.toPath();

      // First point should be at (15, 20) - center + radius on X axis
      expect(path[0].x).toBeCloseTo(15);
      expect(path[0].y).toBeCloseTo(20);
    });
  });

  describe('lShape', () => {
    it('creates L-shape with 6 points', () => {
      const shape = lShape(0, 0, 20, 20, 10, 10);
      expect(shape.points).toBe(6);

      const path = shape.toPath();
      expect(path).toHaveLength(6);
    });

    it('creates L-shape with correct geometry', () => {
      // L-shape at (0,0) with 20x20 overall, 10x10 notch in top-right
      const shape = lShape(0, 0, 20, 20, 10, 10);
      const path = shape.toPath();

      // Bottom-left corner
      expect(path[0]).toEqual({ x: 0, y: 0 });
      // Bottom-right corner
      expect(path[1]).toEqual({ x: 20, y: 0 });
      // Start of notch (right side going up)
      expect(path[2]).toEqual({ x: 20, y: 10 });
      // Inner corner of notch
      expect(path[3]).toEqual({ x: 10, y: 10 });
      // Top of inner part
      expect(path[4]).toEqual({ x: 10, y: 20 });
      // Top-left corner
      expect(path[5]).toEqual({ x: 0, y: 20 });
    });
  });
});
