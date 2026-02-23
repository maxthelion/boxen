/**
 * Edge Path Validation Utilities
 *
 * Detects self-intersection and crossing between edge paths.
 *
 * Edge paths are stored as sequences of (t, offset) points where:
 *   - t: normalized position along the edge (0-1)
 *   - offset: perpendicular distance from the panel edge (negative = inward)
 *
 * In (t, offset) space the path forms a polyline. A "crossing" occurs when
 * two line segments of this polyline intersect in their interiors (not just
 * at shared endpoints between adjacent segments).
 */

import type { EdgePathPoint } from '../engine/types';

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Compute the 2D cross product of vectors (ax, ay) and (bx, by).
 */
function cross2D(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

/**
 * Test whether two line segments in (t, offset) space properly intersect.
 *
 * "Properly intersect" means they cross at a point strictly interior to
 * both segments — touching at shared endpoints is NOT considered an
 * intersection, since adjacent segments in a polyline always share one
 * endpoint.
 *
 * @param p1 - Start of segment 1
 * @param p2 - End of segment 1
 * @param p3 - Start of segment 2
 * @param p4 - End of segment 2
 * @param epsilon - Tolerance to avoid floating-point false positives at endpoints
 */
function segmentsProperlyIntersect(
  p1: EdgePathPoint,
  p2: EdgePathPoint,
  p3: EdgePathPoint,
  p4: EdgePathPoint,
  epsilon: number = 1e-9
): boolean {
  const d1t = p2.t - p1.t;
  const d1o = p2.offset - p1.offset;
  const d2t = p4.t - p3.t;
  const d2o = p4.offset - p3.offset;

  // Denominator of the parametric intersection equations
  const denom = cross2D(d1t, d1o, d2t, d2o);

  // Segments are parallel (or collinear) — they cannot properly cross
  if (Math.abs(denom) < epsilon) return false;

  const et = p3.t - p1.t;
  const eo = p3.offset - p1.offset;

  // Parametric parameters s (along segment 1) and u (along segment 2)
  const s = cross2D(et, eo, d2t, d2o) / denom;
  const u = cross2D(et, eo, d1t, d1o) / denom;

  // A proper (interior) intersection requires both parameters strictly inside (0, 1)
  return s > epsilon && s < 1 - epsilon &&
         u > epsilon && u < 1 - epsilon;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Detect self-intersection in an edge path polyline.
 *
 * Checks every pair of non-adjacent segments for a proper crossing.
 * Adjacent segments (which share an endpoint) are excluded from the check
 * since they trivially "touch" but do not cross.
 *
 * @param points - Sequence of EdgePathPoints defining the polyline
 * @returns true if any two non-adjacent segments cross each other
 */
export function detectEdgePathSelfIntersection(
  points: EdgePathPoint[]
): boolean {
  const n = points.length;

  // Need at least 4 points to have 3 segments, the minimum for a self-crossing
  if (n < 4) return false;

  // Segments are [0→1], [1→2], ..., [(n-2)→(n-1)]
  // Non-adjacent pairs (i, j) require j >= i + 2
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 2; j < n - 1; j++) {
      if (segmentsProperlyIntersect(points[i], points[i + 1], points[j], points[j + 1])) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Detect crossings between two separate edge path polylines.
 *
 * Used to check whether a new freeform path (the one the user just drew)
 * would cross the existing edge path already stored for that panel edge.
 *
 * @param path1Points - First path (e.g., the existing stored edge path)
 * @param path2Points - Second path (e.g., the new path being committed)
 * @returns true if any segment from path1 properly crosses any segment from path2
 */
export function detectEdgePathCrossing(
  path1Points: EdgePathPoint[],
  path2Points: EdgePathPoint[]
): boolean {
  const n1 = path1Points.length;
  const n2 = path2Points.length;

  for (let i = 0; i < n1 - 1; i++) {
    for (let j = 0; j < n2 - 1; j++) {
      if (segmentsProperlyIntersect(
        path1Points[i], path1Points[i + 1],
        path2Points[j], path2Points[j + 1]
      )) {
        return true;
      }
    }
  }

  return false;
}
