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

// =============================================================================
// Polygon Classification (for determining how to apply operations)
// =============================================================================

/**
 * Check if a point is inside a polygon using ray casting algorithm.
 * Returns true if point is inside, false if outside or exactly on boundary.
 */
export function isPointInPolygon(point: PathPoint, polygon: PathPoint[]): boolean {
  const { x, y } = point;
  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;

    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Check if a point is approximately on a polygon edge.
 * Uses distance threshold for tolerance.
 */
export function isPointOnPolygonEdge(point: PathPoint, polygon: PathPoint[], tolerance = 1e-6): boolean {
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];
    const dist = distanceToLineSegment(point, p1, p2);
    if (dist < tolerance) {
      return true;
    }
  }
  return false;
}

/**
 * Distance from a point to a line segment.
 */
function distanceToLineSegment(point: PathPoint, segStart: PathPoint, segEnd: PathPoint): number {
  const { x, y } = point;
  const x1 = segStart.x, y1 = segStart.y;
  const x2 = segEnd.x, y2 = segEnd.y;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    // Segment is a point
    return Math.sqrt((x - x1) * (x - x1) + (y - y1) * (y - y1));
  }

  // Project point onto line and clamp to segment
  let t = ((x - x1) * dx + (y - y1) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;

  return Math.sqrt((x - projX) * (x - projX) + (y - projY) * (y - projY));
}

/**
 * Classification result for a polygon relative to a panel outline.
 */
export type PolygonClassification =
  | 'interior'        // Entirely inside the panel (use ADD_CUTOUT)
  | 'boundary'        // Crosses the panel boundary (use boolean-to-edge-path)
  | 'exterior'        // Entirely outside the panel
  | 'invalid';        // Could not classify

/**
 * Classify a polygon relative to a panel outline.
 * Determines whether the polygon is entirely inside, entirely outside,
 * or crosses the boundary of the panel.
 *
 * Key distinction:
 * - 'interior': All points inside OR touching the boundary (no points outside)
 * - 'boundary': At least one point inside AND at least one point outside
 * - 'exterior': All points outside the panel
 *
 * @param polygon - The polygon to classify
 * @param panelOutline - The panel outline to classify against
 * @param tolerance - Distance tolerance for boundary detection
 * @returns Classification result
 */
export function classifyPolygon(
  polygon: PathPoint[],
  panelOutline: PathPoint[],
  tolerance = 1.0
): PolygonClassification {
  if (polygon.length < 3 || panelOutline.length < 3) {
    return 'invalid';
  }

  let insideCount = 0;
  let outsideCount = 0;
  let onBoundaryCount = 0;

  for (const point of polygon) {
    const onEdge = isPointOnPolygonEdge(point, panelOutline, tolerance);
    if (onEdge) {
      onBoundaryCount++;
      continue;
    }

    const inside = isPointInPolygon(point, panelOutline);
    if (inside) {
      insideCount++;
    } else {
      outsideCount++;
    }
  }

  // Key insight: "boundary" means the polygon CROSSES the boundary,
  // i.e., has points on BOTH sides. Just touching is not crossing.

  // If any points are on opposite sides of the boundary, it crosses
  if (insideCount > 0 && outsideCount > 0) {
    return 'boundary';
  }

  // All points inside or on boundary (none outside) = interior
  // This includes polygons that touch the edge but don't cross it
  if (outsideCount === 0 && (insideCount > 0 || onBoundaryCount > 0)) {
    return 'interior';
  }

  // All points outside or on boundary (none inside) = exterior or boundary
  if (insideCount === 0 && outsideCount > 0) {
    // Check if the polygon edges actually cross the panel boundary
    // (the polygon could be outside but with edges that intersect)
    const hasIntersection = polygonsIntersect(polygon, panelOutline);
    if (hasIntersection) {
      return 'boundary';
    }
    return 'exterior';
  }

  // All points exactly on boundary - treat as interior (it's contained)
  if (onBoundaryCount === polygon.length) {
    return 'interior';
  }

  return 'invalid';
}

/**
 * Check if two polygons have edge intersections (not just point containment).
 */
function polygonsIntersect(polyA: PathPoint[], polyB: PathPoint[]): boolean {
  // Check each edge of A against each edge of B
  for (let i = 0; i < polyA.length; i++) {
    const a1 = polyA[i];
    const a2 = polyA[(i + 1) % polyA.length];

    for (let j = 0; j < polyB.length; j++) {
      const b1 = polyB[j];
      const b2 = polyB[(j + 1) % polyB.length];

      if (segmentsIntersect(a1, a2, b1, b2)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if two line segments intersect (proper intersection, not just touching endpoints).
 */
function segmentsIntersect(a1: PathPoint, a2: PathPoint, b1: PathPoint, b2: PathPoint): boolean {
  const d1 = direction(b1, b2, a1);
  const d2 = direction(b1, b2, a2);
  const d3 = direction(a1, a2, b1);
  const d4 = direction(a1, a2, b2);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  // Check collinear cases
  if (d1 === 0 && onSegment(b1, b2, a1)) return true;
  if (d2 === 0 && onSegment(b1, b2, a2)) return true;
  if (d3 === 0 && onSegment(a1, a2, b1)) return true;
  if (d4 === 0 && onSegment(a1, a2, b2)) return true;

  return false;
}

function direction(p1: PathPoint, p2: PathPoint, p3: PathPoint): number {
  return (p3.x - p1.x) * (p2.y - p1.y) - (p2.x - p1.x) * (p3.y - p1.y);
}

function onSegment(p1: PathPoint, p2: PathPoint, p: PathPoint): boolean {
  return Math.min(p1.x, p2.x) <= p.x && p.x <= Math.max(p1.x, p2.x) &&
         Math.min(p1.y, p2.y) <= p.y && p.y <= Math.max(p1.y, p2.y);
}

// =============================================================================
// Boolean-to-EdgePath Extraction
// =============================================================================

/**
 * Represents an edge of a rectangular panel.
 */
export type EdgePosition = 'top' | 'bottom' | 'left' | 'right';

/**
 * Get the edge position and parameters for a given edge.
 * Returns the start/end points and axis direction for the edge.
 */
function getEdgeParams(edge: EdgePosition, width: number, height: number): {
  start: PathPoint;
  end: PathPoint;
  axis: 'x' | 'y';
  perpAxis: 'x' | 'y';
  perpDirection: 1 | -1;  // Direction of positive offset (outward)
} {
  switch (edge) {
    case 'top':
      return {
        start: { x: 0, y: height },
        end: { x: width, y: height },
        axis: 'x',
        perpAxis: 'y',
        perpDirection: 1,  // Outward is +Y
      };
    case 'bottom':
      return {
        start: { x: 0, y: 0 },
        end: { x: width, y: 0 },
        axis: 'x',
        perpAxis: 'y',
        perpDirection: -1,  // Outward is -Y
      };
    case 'left':
      return {
        start: { x: 0, y: 0 },
        end: { x: 0, y: height },
        axis: 'y',
        perpAxis: 'x',
        perpDirection: -1,  // Outward is -X
      };
    case 'right':
      return {
        start: { x: width, y: 0 },
        end: { x: width, y: height },
        axis: 'y',
        perpAxis: 'x',
        perpDirection: 1,  // Outward is +X
      };
  }
}

/**
 * Point in (t, offset) coordinates for edge paths.
 * - t: normalized position along edge (0 = start, 1 = end)
 * - offset: perpendicular distance from edge line (positive = outward)
 */
export interface EdgePathPoint {
  t: number;
  offset: number;
}

/**
 * Extract edge path points from a modified polygon for a specific edge.
 * Converts absolute coordinates to (t, offset) relative to the original edge.
 *
 * @param resultPolygon - The polygon after boolean operation
 * @param edge - Which edge to extract
 * @param panelWidth - Original panel width
 * @param panelHeight - Original panel height
 * @returns Array of (t, offset) points, or null if edge wasn't modified
 */
export function extractEdgePathFromPolygon(
  resultPolygon: PathPoint[],
  edge: EdgePosition,
  panelWidth: number,
  panelHeight: number
): EdgePathPoint[] | null {
  const edgeParams = getEdgeParams(edge, panelWidth, panelHeight);
  const { start, end, axis, perpAxis, perpDirection } = edgeParams;

  // Find the edge length for normalization
  const edgeLength = axis === 'x' ? (end.x - start.x) : (end.y - start.y);
  if (edgeLength === 0) return null;

  // Original edge position (perpendicular coordinate)
  const originalEdgePos = perpAxis === 'x' ? start.x : start.y;

  // Tolerance for considering a point to be "on" the edge region
  const tolerance = 0.1;

  // Find points that are in the edge region
  // We need to extract a contiguous segment of the polygon that represents this edge
  const edgePoints: { t: number; offset: number; idx: number }[] = [];

  for (let i = 0; i < resultPolygon.length; i++) {
    const p = resultPolygon[i];

    // Get coordinates along and perpendicular to the edge
    const alongPos = axis === 'x' ? p.x : p.y;
    const perpPos = perpAxis === 'x' ? p.x : p.y;

    // Calculate t (normalized position along edge)
    const startAlong = axis === 'x' ? start.x : start.y;
    const t = (alongPos - startAlong) / edgeLength;

    // If point is within the edge's t range (with some tolerance)
    if (t >= -tolerance && t <= 1 + tolerance) {
      // Calculate offset (perpendicular distance from original edge)
      const offset = (perpPos - originalEdgePos) * perpDirection;

      edgePoints.push({
        t: Math.max(0, Math.min(1, t)),
        offset,
        idx: i,
      });
    }
  }

  if (edgePoints.length === 0) return null;

  // Check if there are any modifications (offset != 0 for non-corner points)
  const hasModifications = edgePoints.some(
    p => Math.abs(p.offset) > tolerance && p.t > tolerance && p.t < 1 - tolerance
  );

  if (!hasModifications) return null;

  // Sort by t value and deduplicate
  edgePoints.sort((a, b) => a.t - b.t);

  // Convert to simple array
  const result: EdgePathPoint[] = edgePoints.map(p => ({
    t: p.t,
    offset: p.offset,
  }));

  // Ensure we have endpoints at t=0 and t=1
  if (result.length > 0 && result[0].t > 0.001) {
    result.unshift({ t: 0, offset: 0 });
  }
  if (result.length > 0 && result[result.length - 1].t < 0.999) {
    result.push({ t: 1, offset: 0 });
  }

  return result;
}

/**
 * Determine which edges a shape intersects with a panel boundary.
 * This checks which edges of the base rectangle the shape actually touches or crosses.
 *
 * @param shape - The shape polygon
 * @param panelWidth - Panel width
 * @param panelHeight - Panel height
 * @returns Set of edge positions that the shape intersects
 */
export function findIntersectedEdges(
  shape: PathPoint[],
  panelWidth: number,
  panelHeight: number
): Set<EdgePosition> {
  const intersected = new Set<EdgePosition>();

  // Define edge segments of the base panel rectangle
  const edges: { edge: EdgePosition; p1: PathPoint; p2: PathPoint }[] = [
    { edge: 'bottom', p1: { x: 0, y: 0 }, p2: { x: panelWidth, y: 0 } },
    { edge: 'right', p1: { x: panelWidth, y: 0 }, p2: { x: panelWidth, y: panelHeight } },
    { edge: 'top', p1: { x: panelWidth, y: panelHeight }, p2: { x: 0, y: panelHeight } },
    { edge: 'left', p1: { x: 0, y: panelHeight }, p2: { x: 0, y: 0 } },
  ];

  // Check each edge of the shape against each panel edge
  for (let i = 0; i < shape.length; i++) {
    const s1 = shape[i];
    const s2 = shape[(i + 1) % shape.length];

    for (const { edge, p1, p2 } of edges) {
      // Check if shape edge intersects or touches this panel edge
      if (segmentsIntersectOrTouch(s1, s2, p1, p2)) {
        intersected.add(edge);
      }
    }
  }

  // Also check if any shape vertex is on a panel edge
  for (const point of shape) {
    for (const { edge, p1, p2 } of edges) {
      if (isPointOnSegment(point, p1, p2, 0.5)) {
        intersected.add(edge);
      }
    }
  }

  return intersected;
}

/**
 * Check if a point is on a line segment (within tolerance).
 */
function isPointOnSegment(point: PathPoint, segStart: PathPoint, segEnd: PathPoint, tolerance: number): boolean {
  const dist = distanceToLineSegment(point, segStart, segEnd);
  return dist < tolerance;
}

/**
 * Check if two segments intersect or touch (including collinear overlap).
 */
function segmentsIntersectOrTouch(a1: PathPoint, a2: PathPoint, b1: PathPoint, b2: PathPoint): boolean {
  // First check standard intersection
  if (segmentsIntersect(a1, a2, b1, b2)) {
    return true;
  }

  // Check if any endpoint of one segment is on the other segment
  const tolerance = 0.5;
  if (isPointOnSegment(a1, b1, b2, tolerance)) return true;
  if (isPointOnSegment(a2, b1, b2, tolerance)) return true;
  if (isPointOnSegment(b1, a1, a2, tolerance)) return true;
  if (isPointOnSegment(b2, a1, a2, tolerance)) return true;

  return false;
}

/**
 * Extract affected edges from a boolean operation result.
 * Only extracts edges that the input shape actually intersected.
 *
 * @param resultPolygon - The polygon after boolean operation
 * @param inputShape - The shape that was unioned/differenced with the panel
 * @param panelWidth - Original panel width
 * @param panelHeight - Original panel height
 * @returns Map of edge -> edge path points for modified edges
 */
export function extractAffectedEdges(
  resultPolygon: PathPoint[],
  panelWidth: number,
  panelHeight: number,
  inputShape?: PathPoint[]
): Map<EdgePosition, EdgePathPoint[]> {
  const affectedEdges = new Map<EdgePosition, EdgePathPoint[]>();

  // Determine which edges to check
  let edgesToCheck: EdgePosition[];
  if (inputShape && inputShape.length >= 3) {
    // Only check edges that the input shape actually intersects
    const intersected = findIntersectedEdges(inputShape, panelWidth, panelHeight);
    edgesToCheck = Array.from(intersected);
  } else {
    // Fallback: check all edges
    edgesToCheck = ['top', 'bottom', 'left', 'right'];
  }

  for (const edge of edgesToCheck) {
    const edgePath = extractEdgePathFromPolygon(
      resultPolygon,
      edge,
      panelWidth,
      panelHeight
    );

    if (edgePath && edgePath.length > 0) {
      affectedEdges.set(edge, edgePath);
    }
  }

  return affectedEdges;
}
