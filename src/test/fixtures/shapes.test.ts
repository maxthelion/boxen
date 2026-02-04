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
  });

  describe('lShape', () => {
    it('creates L-shape with 6 points', () => {
      const shape = lShape(0, 0, 20, 20, 10, 10);
      expect(shape.points).toBe(6);

      const path = shape.toPath();
      expect(path).toHaveLength(6);
    });
  });
});
