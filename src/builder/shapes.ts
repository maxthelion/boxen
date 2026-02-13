import type { Point2D } from '../engine/types';

/**
 * Shape interface for assembly builders.
 * Shapes can be converted to paths and track their corner count.
 */
export interface Shape {
  /** Convert shape to array of points for path operations */
  toPath(): Point2D[];
  /** Number of corners/points (for eligibility calculations) */
  points: number;
}

/**
 * Create a rectangle shape.
 * @param x - Left edge X coordinate
 * @param y - Bottom edge Y coordinate
 * @param width - Width of rectangle
 * @param height - Height of rectangle
 */
export function rect(x: number, y: number, width: number, height: number): Shape {
  return {
    toPath: () => [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ],
    points: 4,
  };
}

/**
 * Create a polygon shape from points.
 * @param points - Array of [x, y] tuples
 */
export function polygon(...points: [number, number][]): Shape {
  return {
    toPath: () => points.map(([x, y]) => ({ x, y })),
    points: points.length,
  };
}

/**
 * Create a circle approximation (regular polygon).
 * @param cx - Center X
 * @param cy - Center Y
 * @param radius - Radius
 * @param segments - Number of segments (default 16)
 */
export function circle(cx: number, cy: number, radius: number, segments: number = 16): Shape {
  const pts: Point2D[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    pts.push({
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    });
  }
  return {
    toPath: () => pts,
    points: segments,
  };
}

/**
 * Create an L-shaped polygon.
 * Useful for testing non-rectangular cutouts.
 */
export function lShape(
  x: number,
  y: number,
  width: number,
  height: number,
  notchWidth: number,
  notchHeight: number
): Shape {
  // L-shape: rectangle with top-right corner cut out
  const pts: Point2D[] = [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height - notchHeight },
    { x: x + width - notchWidth, y: y + height - notchHeight },
    { x: x + width - notchWidth, y: y + height },
    { x, y: y + height },
  ];
  return {
    toPath: () => pts,
    points: 6,
  };
}
