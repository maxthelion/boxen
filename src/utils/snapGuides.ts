/**
 * Snap guide lines and snap detection for the 2D sketch editor.
 *
 * Guide lines include:
 * - Center lines (through panel center at x=0 and y=0)
 * - Edge extension lines (extending from panel edges, both inner and outer side of joints)
 *
 * Snap detection finds the nearest guide line intersection, snap point, edge segment,
 * or guide line point to the cursor position.
 *
 * Snap priority: point > intersection > edge > single-axis guide line
 */

import { PathPoint } from '../types';

export type GuideLineOrientation = 'horizontal' | 'vertical';

export interface GuideLine {
  /** Orientation of the line */
  orientation: GuideLineOrientation;
  /** Position on the perpendicular axis (y for horizontal, x for vertical) */
  position: number;
  /** Type of guide line for styling */
  type: 'center' | 'edge';
}

/** A specific vertex on the panel outline that can be snapped to */
export interface SnapPoint {
  x: number;
  y: number;
}

/** An edge segment of the panel outline */
export interface EdgeSegment {
  start: PathPoint;
  end: PathPoint;
  /** Index of the start point in the outline */
  index: number;
}

/** What the snap result snapped to */
export type SnapType =
  | 'point'        // Specific vertex on the outline
  | 'intersection' // Two guide lines crossing
  | 'edge'         // Nearest point on an edge segment
  | 'guide-line';  // Single guide line (axis snap)

export interface SnapResult {
  /** The snapped point */
  point: { x: number; y: number };
  /** What was snapped to */
  type: SnapType;
  /** Which guide lines contributed to this snap (for intersection and guide-line types) */
  guides: GuideLine[];
  /** Distance from cursor to snap point (in SVG units) */
  distance: number;
  /** For 'edge' type: which edge the panel outline was matched */
  edgePosition?: 'top' | 'bottom' | 'left' | 'right';
  /** For 'edge' type: the matched edge segment */
  edgeSegment?: EdgeSegment;
}

/**
 * Compute guide lines for a panel.
 *
 * Returns center lines and edge extension lines derived from the panel's
 * outline segments.
 */
export function computeGuideLines(
  panelWidth: number,
  panelHeight: number,
  outlinePoints: PathPoint[],
): GuideLine[] {
  const guides: GuideLine[] = [];
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  // Center lines
  guides.push({ orientation: 'horizontal', position: 0, type: 'center' });
  guides.push({ orientation: 'vertical', position: 0, type: 'center' });

  // Extract unique Y-positions from horizontal segments (top/bottom edges)
  // and unique X-positions from vertical segments (left/right edges)
  const horizontalYs = new Set<number>();
  const verticalXs = new Set<number>();

  const tolerance = 0.01;

  for (let i = 0; i < outlinePoints.length; i++) {
    const p1 = outlinePoints[i];
    const p2 = outlinePoints[(i + 1) % outlinePoints.length];

    const dx = Math.abs(p2.x - p1.x);
    const dy = Math.abs(p2.y - p1.y);

    // Horizontal segment (significant X span, minimal Y span)
    if (dx > tolerance && dy < tolerance) {
      // Only include segments near the top/bottom edges
      if (Math.abs(p1.y) > halfH * 0.5) {
        horizontalYs.add(roundTo(p1.y, 4));
      }
    }

    // Vertical segment (significant Y span, minimal X span)
    if (dy > tolerance && dx < tolerance) {
      // Only include segments near the left/right edges
      if (Math.abs(p1.x) > halfW * 0.5) {
        verticalXs.add(roundTo(p1.x, 4));
      }
    }
  }

  // Always add the conceptual boundary edges
  horizontalYs.add(roundTo(halfH, 4));
  horizontalYs.add(roundTo(-halfH, 4));
  verticalXs.add(roundTo(halfW, 4));
  verticalXs.add(roundTo(-halfW, 4));

  // Convert to guide lines (skip center which is already added)
  for (const y of horizontalYs) {
    if (Math.abs(y) > tolerance) {
      guides.push({ orientation: 'horizontal', position: y, type: 'edge' });
    }
  }

  for (const x of verticalXs) {
    if (Math.abs(x) > tolerance) {
      guides.push({ orientation: 'vertical', position: x, type: 'edge' });
    }
  }

  return guides;
}

/**
 * Extract all unique vertices from the outline as snap points.
 */
export function computeSnapPoints(outlinePoints: PathPoint[]): SnapPoint[] {
  const points: SnapPoint[] = [];
  const seen = new Set<string>();

  for (const p of outlinePoints) {
    const key = `${roundTo(p.x, 4)},${roundTo(p.y, 4)}`;
    if (!seen.has(key)) {
      seen.add(key);
      points.push({ x: p.x, y: p.y });
    }
  }

  return points;
}

/**
 * Extract all edge segments from the outline for edge snapping.
 * Also classifies each segment by its edge position (top/bottom/left/right)
 * based on panel dimensions.
 */
export function computeEdgeSegments(
  outlinePoints: PathPoint[],
  panelWidth: number,
  panelHeight: number,
  tolerance: number = 5,
): EdgeSegment[] {
  const segments: EdgeSegment[] = [];
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  for (let i = 0; i < outlinePoints.length; i++) {
    const start = outlinePoints[i];
    const end = outlinePoints[(i + 1) % outlinePoints.length];

    // Only include segments that are on or near the panel boundary
    const onTop = Math.abs(start.y - halfH) < tolerance && Math.abs(end.y - halfH) < tolerance;
    const onBottom = Math.abs(start.y + halfH) < tolerance && Math.abs(end.y + halfH) < tolerance;
    const onLeft = Math.abs(start.x + halfW) < tolerance && Math.abs(end.x + halfW) < tolerance;
    const onRight = Math.abs(start.x - halfW) < tolerance && Math.abs(end.x - halfW) < tolerance;

    if (onTop || onBottom || onLeft || onRight) {
      segments.push({ start, end, index: i });
    }
  }

  return segments;
}

/**
 * Classify an edge segment by its position on the panel.
 */
export function classifyEdgeSegment(
  segment: EdgeSegment,
  panelWidth: number,
  panelHeight: number,
  tolerance: number = 5,
): 'top' | 'bottom' | 'left' | 'right' | null {
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  const { start, end } = segment;

  if (Math.abs(start.y - halfH) < tolerance && Math.abs(end.y - halfH) < tolerance) return 'top';
  if (Math.abs(start.y + halfH) < tolerance && Math.abs(end.y + halfH) < tolerance) return 'bottom';
  if (Math.abs(start.x + halfW) < tolerance && Math.abs(end.x + halfW) < tolerance) return 'left';
  if (Math.abs(start.x - halfW) < tolerance && Math.abs(end.x - halfW) < tolerance) return 'right';

  return null;
}

/**
 * Find the nearest point on a line segment to a given point.
 * Returns the closest point and the distance.
 */
function nearestPointOnSegment(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number,
): { x: number; y: number; distance: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    const dist = Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    return { x: x1, y: y1, distance: dist };
  }

  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));

  const nearX = x1 + t * dx;
  const nearY = y1 + t * dy;
  const dist = Math.sqrt((px - nearX) ** 2 + (py - nearY) ** 2);

  return { x: nearX, y: nearY, distance: dist };
}

/**
 * A constraint axis for angle-constrained snapping.
 *
 * When the user holds Shift while drawing, the cursor direction is snapped to
 * the nearest 45° increment. This constraint can be composed with guide snapping
 * so the placed point is both angle-constrained AND on a nearby guide line.
 */
export interface ConstraintAxis {
  /** The anchor point (last placed point) the constraint line passes through */
  fromPoint: { x: number; y: number };
  /** The snapped angle in radians (multiple of π/4: 0°, 45°, 90°, etc.) */
  angle: number;
}

/**
 * Find snap points along a constraint ray (angle-constrained + guide snapping).
 *
 * Given a constraint ray (from fromPoint at a fixed angle), finds the nearest
 * guide line intersection that lies ON the constraint ray within snapThreshold.
 *
 * Priority: guide-guide intersections > single guide intersections
 *
 * Returns null if no guide intersection is found within threshold.
 */
function findConstrainedGuideSnap(
  cursorX: number,
  cursorY: number,
  guides: GuideLine[],
  snapThreshold: number,
  constraint: ConstraintAxis,
): SnapResult | null {
  const { fromPoint, angle } = constraint;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  // Project cursor onto constraint ray to get the "constrained cursor" parameter
  const tCursor = (cursorX - fromPoint.x) * cosA + (cursorY - fromPoint.y) * sinA;

  // Find all intersections of the constraint ray with each guide line
  interface RayIntersection {
    point: { x: number; y: number };
    t: number;
    guide: GuideLine;
  }

  const intersections: RayIntersection[] = [];

  for (const g of guides) {
    if (g.orientation === 'horizontal') {
      // Horizontal guide at y = g.position
      // Ray: y = fromPoint.y + t*sinA → t = (g.position - fromPoint.y) / sinA
      if (Math.abs(sinA) < 0.001) continue; // Ray is parallel to this guide
      const t = (g.position - fromPoint.y) / sinA;
      if (t < 0) continue; // Intersection is behind fromPoint
      const ix = fromPoint.x + t * cosA;
      intersections.push({ point: { x: ix, y: g.position }, t, guide: g });
    } else {
      // Vertical guide at x = g.position
      // Ray: x = fromPoint.x + t*cosA → t = (g.position - fromPoint.x) / cosA
      if (Math.abs(cosA) < 0.001) continue; // Ray is parallel to this guide
      const t = (g.position - fromPoint.x) / cosA;
      if (t < 0) continue; // Intersection is behind fromPoint
      const iy = fromPoint.y + t * sinA;
      intersections.push({ point: { x: g.position, y: iy }, t, guide: g });
    }
  }

  if (intersections.length === 0) return null;

  // Coincidence tolerance: two intersections at the same point (guide-guide intersection on ray)
  const coincidenceTolerance = 0.5;

  // Pass 1: guide-guide intersections (higher priority)
  let bestIntersectionDist = snapThreshold;
  let bestIntersection: SnapResult | null = null;

  for (let i = 0; i < intersections.length; i++) {
    for (let j = i + 1; j < intersections.length; j++) {
      const ptI = intersections[i].point;
      const ptJ = intersections[j].point;
      const samePoint =
        Math.abs(ptI.x - ptJ.x) < coincidenceTolerance &&
        Math.abs(ptI.y - ptJ.y) < coincidenceTolerance;
      if (!samePoint) continue;

      // Both guides intersect the constraint ray at the same point
      const dist = Math.min(
        Math.abs(intersections[i].t - tCursor),
        Math.abs(intersections[j].t - tCursor),
      );
      if (dist < bestIntersectionDist) {
        bestIntersectionDist = dist;
        bestIntersection = {
          point: ptI,
          type: 'intersection',
          guides: [intersections[i].guide, intersections[j].guide],
          distance: dist,
        };
      }
    }
  }

  if (bestIntersection) return bestIntersection;

  // Pass 2: single guide intersections
  let bestSingleDist = snapThreshold;
  let bestSingle: SnapResult | null = null;

  for (const inter of intersections) {
    const dist = Math.abs(inter.t - tCursor);
    if (dist < bestSingleDist) {
      bestSingleDist = dist;
      bestSingle = {
        point: inter.point,
        type: 'guide-line',
        guides: [inter.guide],
        distance: dist,
      };
    }
  }

  return bestSingle;
}

/**
 * Find the nearest snap point to the cursor.
 *
 * Priority: point > intersection > edge > single-axis guide line
 *
 * Checks:
 * 1. Specific outline vertices (snap points)
 * 2. Guide line intersections (both axes locked)
 * 3. Edge segments (nearest point on outline boundary)
 * 4. Individual guide lines (single axis snap)
 *
 * When constraintAxis is provided (Shift held while drawing):
 * - Skips point, edge, and unconstrained guide snapping
 * - Only snaps to guide lines that intersect the constraint ray
 * - Returns a point that is both angle-constrained AND on a guide line
 * - Returns null if no guide intersection is within threshold (caller should fall back to pure angle constraint)
 */
export function findSnapPoint(
  cursorX: number,
  cursorY: number,
  guides: GuideLine[],
  snapThreshold: number,
  snapPoints?: SnapPoint[],
  edgeSegments?: EdgeSegment[],
  panelWidth?: number,
  panelHeight?: number,
  constraintAxis?: ConstraintAxis,
): SnapResult | null {
  // When a constraint axis is provided, only find guide intersections on the constraint ray
  if (constraintAxis) {
    return findConstrainedGuideSnap(cursorX, cursorY, guides, snapThreshold, constraintAxis);
  }

  // 1. Check snap points (individual outline vertices) — highest priority
  if (snapPoints && snapPoints.length > 0) {
    let bestPoint: SnapResult | null = null;
    let bestPointDist = snapThreshold;

    for (const sp of snapPoints) {
      const dist = Math.sqrt((cursorX - sp.x) ** 2 + (cursorY - sp.y) ** 2);
      if (dist < bestPointDist) {
        bestPointDist = dist;
        bestPoint = {
          point: { x: sp.x, y: sp.y },
          type: 'point',
          guides: [],
          distance: dist,
        };
      }
    }

    if (bestPoint) {
      return bestPoint;
    }
  }

  // 2. Check guide line intersections (both axes locked)
  const horizontals = guides.filter(g => g.orientation === 'horizontal');
  const verticals = guides.filter(g => g.orientation === 'vertical');

  let bestIntersection: SnapResult | null = null;
  let bestIntersectionDist = snapThreshold;

  for (const h of horizontals) {
    for (const v of verticals) {
      const ix = v.position;
      const iy = h.position;
      const dist = Math.sqrt((cursorX - ix) ** 2 + (cursorY - iy) ** 2);
      if (dist < bestIntersectionDist) {
        bestIntersectionDist = dist;
        bestIntersection = {
          point: { x: ix, y: iy },
          type: 'intersection',
          guides: [h, v],
          distance: dist,
        };
      }
    }
  }

  if (bestIntersection) {
    return bestIntersection;
  }

  // 3. Check edge segments (nearest point on outline boundary)
  if (edgeSegments && edgeSegments.length > 0 && panelWidth !== undefined && panelHeight !== undefined) {
    let bestEdge: SnapResult | null = null;
    let bestEdgeDist = snapThreshold;

    for (const seg of edgeSegments) {
      const nearest = nearestPointOnSegment(
        cursorX, cursorY,
        seg.start.x, seg.start.y,
        seg.end.x, seg.end.y,
      );
      if (nearest.distance < bestEdgeDist) {
        bestEdgeDist = nearest.distance;
        const edgePos = classifyEdgeSegment(seg, panelWidth, panelHeight);
        bestEdge = {
          point: { x: nearest.x, y: nearest.y },
          type: 'edge',
          guides: [],
          distance: nearest.distance,
          edgePosition: edgePos ?? undefined,
          edgeSegment: seg,
        };
      }
    }

    if (bestEdge) {
      return bestEdge;
    }
  }

  // 4. Fall back to single-axis snap (closest guide line)
  let bestSingle: SnapResult | null = null;
  let bestSingleDist = snapThreshold;

  for (const g of guides) {
    if (g.orientation === 'horizontal') {
      const dist = Math.abs(cursorY - g.position);
      if (dist < bestSingleDist) {
        bestSingleDist = dist;
        bestSingle = {
          point: { x: cursorX, y: g.position },
          type: 'guide-line',
          guides: [g],
          distance: dist,
        };
      }
    } else {
      const dist = Math.abs(cursorX - g.position);
      if (dist < bestSingleDist) {
        bestSingleDist = dist;
        bestSingle = {
          point: { x: g.position, y: cursorY },
          type: 'guide-line',
          guides: [g],
          distance: dist,
        };
      }
    }
  }

  return bestSingle;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
