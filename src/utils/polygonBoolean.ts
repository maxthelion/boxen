/**
 * Boolean polygon operations utility
 *
 * Wraps the polygon-clipping library to work with our PathPoint format.
 * Used for robust union/difference operations on safe area polygons.
 */

import polygonClipping from 'polygon-clipping';
import type { Pair, Ring, Polygon, MultiPolygon } from 'polygon-clipping';

export interface PathPoint {
  x: number;
  y: number;
}

// Convert our PathPoint array to polygon-clipping format
function pathToRing(points: PathPoint[]): Ring {
  return points.map((p) => [p.x, p.y] as Pair);
}

// Convert polygon-clipping ring back to PathPoint array
function ringToPath(ring: Ring): PathPoint[] {
  return ring.map(([x, y]) => ({ x, y }));
}

// Convert PathPoint array to Polygon format (single ring, no holes)
function pathToPolygon(points: PathPoint[]): Polygon {
  return [pathToRing(points)];
}

/**
 * Union of two polygons (add material)
 * Returns the combined area of both polygons.
 * If result has multiple disjoint regions, returns the largest one.
 */
export function unionPolygons(
  a: PathPoint[],
  b: PathPoint[]
): PathPoint[] | null {
  if (a.length < 3 || b.length < 3) {
    return null;
  }

  try {
    const polyA = pathToPolygon(a);
    const polyB = pathToPolygon(b);
    const result: MultiPolygon = polygonClipping.union(polyA, polyB);

    return extractLargestPolygon(result);
  } catch (e) {
    console.error('Union operation failed:', e);
    return null;
  }
}

/**
 * Difference of two polygons (remove material)
 * Returns polygon A minus polygon B.
 * If result has multiple disjoint regions, returns the largest one.
 */
export function differencePolygons(
  a: PathPoint[],
  b: PathPoint[]
): PathPoint[] | null {
  if (a.length < 3 || b.length < 3) {
    return null;
  }

  try {
    const polyA = pathToPolygon(a);
    const polyB = pathToPolygon(b);
    const result: MultiPolygon = polygonClipping.difference(polyA, polyB);

    return extractLargestPolygon(result);
  } catch (e) {
    console.error('Difference operation failed:', e);
    return null;
  }
}

/**
 * Intersection of two polygons
 * Returns the overlapping area of both polygons.
 * If result has multiple disjoint regions, returns the largest one.
 */
export function intersectPolygons(
  a: PathPoint[],
  b: PathPoint[]
): PathPoint[] | null {
  if (a.length < 3 || b.length < 3) {
    return null;
  }

  try {
    const polyA = pathToPolygon(a);
    const polyB = pathToPolygon(b);
    const result: MultiPolygon = polygonClipping.intersection(polyA, polyB);

    return extractLargestPolygon(result);
  } catch (e) {
    console.error('Intersection operation failed:', e);
    return null;
  }
}

/**
 * Extract the largest polygon (by area) from a MultiPolygon result.
 * Returns the outer ring only (ignores holes for edge path extraction).
 */
function extractLargestPolygon(multiPolygon: MultiPolygon): PathPoint[] | null {
  if (multiPolygon.length === 0) {
    return null;
  }

  // If single polygon, return its outer ring
  if (multiPolygon.length === 1) {
    const polygon = multiPolygon[0];
    if (polygon.length === 0) return null;
    return ringToPath(polygon[0]); // Outer ring
  }

  // Multiple polygons - find the largest by area
  let largestArea = 0;
  let largestPolygon: Polygon | null = null;

  for (const polygon of multiPolygon) {
    if (polygon.length === 0) continue;
    const area = Math.abs(computeRingArea(polygon[0]));
    if (area > largestArea) {
      largestArea = area;
      largestPolygon = polygon;
    }
  }

  if (!largestPolygon || largestPolygon.length === 0) {
    return null;
  }

  return ringToPath(largestPolygon[0]); // Outer ring of largest polygon
}

/**
 * Compute signed area of a ring using the shoelace formula.
 * Positive for counter-clockwise, negative for clockwise.
 */
function computeRingArea(ring: Ring): number {
  let area = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += ring[i][0] * ring[j][1];
    area -= ring[j][0] * ring[i][1];
  }
  return area / 2;
}

/**
 * Create a rectangular polygon from bounds
 */
export function createRectPolygon(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): PathPoint[] {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

/**
 * Create a circular polygon approximation
 * @param cx Center X
 * @param cy Center Y
 * @param radius Circle radius
 * @param segments Number of segments (default 32)
 */
export function createCirclePolygon(
  cx: number,
  cy: number,
  radius: number,
  segments = 32
): PathPoint[] {
  const points: PathPoint[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push({
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    });
  }
  return points;
}

/**
 * Compute the area of a PathPoint polygon using the shoelace formula.
 * Returns absolute value (always positive).
 */
export function computePolygonArea(points: PathPoint[]): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area / 2);
}

/**
 * Check if a polygon is valid (at least 3 points, non-zero area)
 */
export function isValidPolygon(points: PathPoint[]): boolean {
  if (points.length < 3) return false;
  const area = computePolygonArea(points);
  return area > 1e-10; // Small epsilon for numerical stability
}
