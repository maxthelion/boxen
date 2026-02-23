/**
 * Unified Snap Engine for 2D Sketch View
 *
 * Pure functions for computing snap targets from cursor position.
 * The key insight: angle constraint and proximity snaps are composed
 * in one call — not applied sequentially. The caller gets one result
 * that satisfies both constraints.
 *
 * Consumed by SketchView2D (path, rectangle, circle tools).
 * Depends on sketchCoordinates.ts for constrainAngle() and thresholds.
 */

import { constrainAngle } from './sketchCoordinates';

// ── Types ────────────────────────────────────────────────────────────────────

export type SnapTargetType =
  | 'grid'            // Grid intersection
  | 'center'          // Panel center axis (x=0 or y=0)
  | 'edge-line'       // Panel boundary line (halfW, halfH)
  | 'point'           // Existing vertex (outline corner, cutout vertex)
  | 'alignment'       // Horizontal/vertical alignment with existing point
  | 'edge-segment'    // Nearest point on a panel boundary segment
  | 'midpoint'        // Midpoint of a segment
  | 'intersection'    // Where two guide lines cross
  | 'close-polygon'   // Near start point of current polygon draft
  | 'merge-boundary'; // Near boundary edge during edge-path drawing

export type GuideLineType = 'center' | 'edge' | 'grid';

export interface GuideLine {
  axis: 'x' | 'y';   // 'x' = vertical line at position, 'y' = horizontal line at position
  position: number;
  type: GuideLineType;
}

export interface SnapTarget {
  type: SnapTargetType;
  point: { x: number; y: number };
  priority: number; // Lower = wins. Ties broken by distance.
}

export interface SnapResult {
  point: { x: number; y: number };  // The final position (used everywhere)
  target: SnapTarget | null;         // What was snapped to (null = no snap)
  angleConstrained: boolean;
  distance: number;
  activeGuides: GuideLine[];         // For rendering guide line highlights
}

export interface SnapConfig {
  enabledTypes: Set<SnapTargetType>;
  threshold: number;
  gridSize: number;
  shiftHeld: boolean;
  angleReference?: { x: number; y: number };
}

export interface SnapContext {
  panelWidth: number;
  panelHeight: number;
  outlinePoints: readonly { x: number; y: number }[];
  draftPoints: readonly { x: number; y: number }[];
  gridSize: number;
  /** For edge-path mode: which edge the draft is on */
  draftEdge?: 'top' | 'bottom' | 'left' | 'right';
}

// ── Priority map ─────────────────────────────────────────────────────────────

const PRIORITY: Record<SnapTargetType, number> = {
  'close-polygon': 0,
  'merge-boundary': 0,
  'point': 1,
  'alignment': 2,
  'intersection': 2,
  'edge-segment': 2.5,
  'center': 3,
  'edge-line': 3,
  'midpoint': 4,
  'grid': 5,
};

// ── Guide line computation ───────────────────────────────────────────────────

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Compute guide lines from panel dimensions and outline geometry.
 *
 * Returns center axes, panel edge lines, and — when outline points are
 * available — guide lines derived from finger joint tips and other
 * horizontal/vertical segments near the panel boundary. This means
 * users can snap to the inner edge of finger joint regions, not just
 * the conceptual boundary.
 */
export function computeGuideLines(
  panelWidth: number,
  panelHeight: number,
  outlinePoints: readonly { x: number; y: number }[],
  _gridSize: number,
): GuideLine[] {
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;
  const guides: GuideLine[] = [];
  const tolerance = 0.01;

  // Center axes
  guides.push({ axis: 'x', position: 0, type: 'center' });
  guides.push({ axis: 'y', position: 0, type: 'center' });

  // Collect unique edge positions from outline segments.
  // Horizontal segments near top/bottom → y-guides.
  // Vertical segments near left/right → x-guides.
  const horizontalYs = new Set<number>();
  const verticalXs = new Set<number>();

  for (let i = 0; i < outlinePoints.length; i++) {
    const p1 = outlinePoints[i];
    const p2 = outlinePoints[(i + 1) % outlinePoints.length];
    const dx = Math.abs(p2.x - p1.x);
    const dy = Math.abs(p2.y - p1.y);

    // Horizontal segment near top/bottom edge
    if (dx > tolerance && dy < tolerance && Math.abs(p1.y) > halfH * 0.5) {
      horizontalYs.add(roundTo(p1.y, 4));
    }
    // Vertical segment near left/right edge
    if (dy > tolerance && dx < tolerance && Math.abs(p1.x) > halfW * 0.5) {
      verticalXs.add(roundTo(p1.x, 4));
    }
  }

  // Always include the conceptual boundary edges
  horizontalYs.add(roundTo(halfH, 4));
  horizontalYs.add(roundTo(-halfH, 4));
  verticalXs.add(roundTo(halfW, 4));
  verticalXs.add(roundTo(-halfW, 4));

  for (const y of horizontalYs) {
    if (Math.abs(y) > tolerance) {
      guides.push({ axis: 'y', position: y, type: 'edge' });
    }
  }
  for (const x of verticalXs) {
    if (Math.abs(x) > tolerance) {
      guides.push({ axis: 'x', position: x, type: 'edge' });
    }
  }

  return guides;
}

// ── Candidate generators ─────────────────────────────────────────────────────

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Find grid intersections near the cursor.
 * Returns up to the 4 nearest grid points within threshold.
 */
export function gridCandidates(
  cursor: { x: number; y: number },
  gridSize: number,
  threshold: number,
): SnapTarget[] {
  const results: SnapTarget[] = [];

  // Check the 4 nearest grid intersections
  const baseX = Math.floor(cursor.x / gridSize) * gridSize;
  const baseY = Math.floor(cursor.y / gridSize) * gridSize;

  for (let dx = 0; dx <= gridSize; dx += gridSize) {
    for (let dy = 0; dy <= gridSize; dy += gridSize) {
      const gx = baseX + dx;
      const gy = baseY + dy;
      const d = dist(cursor, { x: gx, y: gy });
      if (d <= threshold) {
        results.push({
          type: 'grid',
          point: { x: gx, y: gy },
          priority: PRIORITY.grid,
        });
      }
    }
  }

  return results;
}

/**
 * Find existing vertices near the cursor.
 * Deduplicates points at the same position so overlapping outline
 * vertices don't produce multiple candidates.
 */
export function pointCandidates(
  cursor: { x: number; y: number },
  existingPoints: readonly { x: number; y: number }[],
  threshold: number,
): SnapTarget[] {
  const results: SnapTarget[] = [];
  const seen = new Set<string>();

  for (const pt of existingPoints) {
    const key = `${roundTo(pt.x, 4)},${roundTo(pt.y, 4)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const d = dist(cursor, pt);
    if (d <= threshold) {
      results.push({
        type: 'point',
        point: { x: pt.x, y: pt.y },
        priority: PRIORITY.point,
      });
    }
  }

  return results;
}

/**
 * Find midpoints of outline segments near the cursor.
 */
export function midpointCandidates(
  cursor: { x: number; y: number },
  outlinePoints: readonly { x: number; y: number }[],
  threshold: number,
): SnapTarget[] {
  const results: SnapTarget[] = [];
  if (outlinePoints.length < 2) return results;

  for (let i = 0; i < outlinePoints.length; i++) {
    const a = outlinePoints[i];
    const b = outlinePoints[(i + 1) % outlinePoints.length];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const d = dist(cursor, mid);
    if (d <= threshold) {
      results.push({
        type: 'midpoint',
        point: mid,
        priority: PRIORITY.midpoint,
      });
    }
  }

  return results;
}

/**
 * Find horizontal/vertical alignment with existing points.
 *
 * For each reference point, checks if the cursor is near its X or Y
 * coordinate. If so, produces a snap target at (refPoint.x, cursor.y)
 * or (cursor.x, refPoint.y) — i.e. alignment along that axis while
 * keeping the cursor's position on the other axis.
 */
export function alignmentCandidates(
  cursor: { x: number; y: number },
  referencePoints: readonly { x: number; y: number }[],
  threshold: number,
): SnapTarget[] {
  const results: SnapTarget[] = [];
  const seen = new Set<string>();

  for (const pt of referencePoints) {
    // Vertical alignment (same X)
    const dx = Math.abs(cursor.x - pt.x);
    if (dx <= threshold) {
      const key = `v:${roundTo(pt.x, 4)}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          type: 'alignment',
          point: { x: pt.x, y: cursor.y },
          priority: PRIORITY.alignment,
        });
      }
    }

    // Horizontal alignment (same Y)
    const dy = Math.abs(cursor.y - pt.y);
    if (dy <= threshold) {
      const key = `h:${roundTo(pt.y, 4)}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          type: 'alignment',
          point: { x: cursor.x, y: pt.y },
          priority: PRIORITY.alignment,
        });
      }
    }
  }

  return results;
}

/**
 * Find nearest point on panel boundary segments near the cursor.
 *
 * Unlike `pointCandidates` which snaps to vertices, this snaps to any
 * point along a boundary segment — useful for clicking "between" finger
 * joint corners on an edge.
 */
export function edgeSegmentCandidates(
  cursor: { x: number; y: number },
  outlinePoints: readonly { x: number; y: number }[],
  panelWidth: number,
  panelHeight: number,
  threshold: number,
): SnapTarget[] {
  const results: SnapTarget[] = [];
  if (outlinePoints.length < 2) return results;

  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;
  const edgeTolerance = 5;

  for (let i = 0; i < outlinePoints.length; i++) {
    const s = outlinePoints[i];
    const e = outlinePoints[(i + 1) % outlinePoints.length];

    // Only include segments on or near the panel boundary
    const onTop = Math.abs(s.y - halfH) < edgeTolerance && Math.abs(e.y - halfH) < edgeTolerance;
    const onBottom = Math.abs(s.y + halfH) < edgeTolerance && Math.abs(e.y + halfH) < edgeTolerance;
    const onLeft = Math.abs(s.x + halfW) < edgeTolerance && Math.abs(e.x + halfW) < edgeTolerance;
    const onRight = Math.abs(s.x - halfW) < edgeTolerance && Math.abs(e.x - halfW) < edgeTolerance;
    if (!(onTop || onBottom || onLeft || onRight)) continue;

    const nearest = nearestPointOnSegment(cursor.x, cursor.y, s.x, s.y, e.x, e.y);
    if (nearest.distance <= threshold) {
      results.push({
        type: 'edge-segment',
        point: { x: nearest.x, y: nearest.y },
        priority: PRIORITY['edge-segment'],
      });
    }
  }

  return results;
}

/**
 * Find the nearest point on a line segment to a given point.
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
    const d = Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    return { x: x1, y: y1, distance: d };
  }

  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));

  const nearX = x1 + t * dx;
  const nearY = y1 + t * dy;
  const d = Math.sqrt((px - nearX) ** 2 + (py - nearY) ** 2);

  return { x: nearX, y: nearY, distance: d };
}

/**
 * Find crossings of guide lines near the cursor.
 */
export function intersectionCandidates(
  cursor: { x: number; y: number },
  guides: GuideLine[],
  threshold: number,
): SnapTarget[] {
  const results: SnapTarget[] = [];
  const xGuides = guides.filter(g => g.axis === 'x');
  const yGuides = guides.filter(g => g.axis === 'y');

  for (const xg of xGuides) {
    for (const yg of yGuides) {
      const pt = { x: xg.position, y: yg.position };
      const d = dist(cursor, pt);
      if (d <= threshold) {
        results.push({
          type: 'intersection',
          point: pt,
          priority: PRIORITY.intersection,
        });
      }
    }
  }

  return results;
}

/**
 * Check if cursor is near the start point of a polygon draft (to close it).
 * Returns null if fewer than 3 points or too far.
 */
export function closePolygonCandidate(
  cursor: { x: number; y: number },
  draftPoints: readonly { x: number; y: number }[],
  threshold: number,
): SnapTarget | null {
  if (draftPoints.length < 3) return null;

  const start = draftPoints[0];
  const d = dist(cursor, start);
  if (d > threshold) return null;

  return {
    type: 'close-polygon',
    point: { x: start.x, y: start.y },
    priority: PRIORITY['close-polygon'],
  };
}

/**
 * Check if cursor is near the panel boundary during edge-path drawing.
 * Returns a snap target ON the boundary at the cursor's position projected
 * to the boundary edge.
 */
export function mergeBoundaryCandidate(
  cursor: { x: number; y: number },
  edge: 'top' | 'bottom' | 'left' | 'right',
  panelWidth: number,
  panelHeight: number,
  threshold: number,
  _minDraftPoints: number,
): SnapTarget | null {
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  let distToBoundary: number;
  let mergePoint: { x: number; y: number };

  switch (edge) {
    case 'top':
      distToBoundary = Math.abs(cursor.y - halfH);
      mergePoint = { x: cursor.x, y: halfH };
      break;
    case 'bottom':
      distToBoundary = Math.abs(cursor.y + halfH);
      mergePoint = { x: cursor.x, y: -halfH };
      break;
    case 'left':
      distToBoundary = Math.abs(cursor.x + halfW);
      mergePoint = { x: -halfW, y: cursor.y };
      break;
    case 'right':
      distToBoundary = Math.abs(cursor.x - halfW);
      mergePoint = { x: halfW, y: cursor.y };
      break;
  }

  if (distToBoundary > threshold) return null;

  return {
    type: 'merge-boundary',
    point: mergePoint,
    priority: PRIORITY['merge-boundary'],
  };
}

/**
 * Find snap targets from guide lines (center and edge lines).
 * Snaps to the nearest axis on a guide when within threshold.
 */
function guideLineCandidates(
  cursor: { x: number; y: number },
  guides: GuideLine[],
  threshold: number,
  enabledTypes: Set<SnapTargetType>,
): SnapTarget[] {
  const results: SnapTarget[] = [];

  for (const guide of guides) {
    const snapType: SnapTargetType = guide.type === 'center' ? 'center' : 'edge-line';
    if (!enabledTypes.has(snapType)) continue;

    let d: number;
    let snapPoint: { x: number; y: number };

    if (guide.axis === 'x') {
      // Vertical line at x=position — snap cursor.x to that position
      d = Math.abs(cursor.x - guide.position);
      snapPoint = { x: guide.position, y: cursor.y };
    } else {
      // Horizontal line at y=position — snap cursor.y to that position
      d = Math.abs(cursor.y - guide.position);
      snapPoint = { x: cursor.x, y: guide.position };
    }

    if (d <= threshold) {
      results.push({
        type: snapType,
        point: snapPoint,
        priority: PRIORITY[snapType],
      });
    }
  }

  return results;
}

// ── Selection ────────────────────────────────────────────────────────────────

/**
 * Pick the best snap target from candidates.
 * Lower priority wins; ties broken by distance to cursor.
 */
export function pickBest(
  candidates: SnapTarget[],
  cursor: { x: number; y: number },
): SnapTarget | null {
  if (candidates.length === 0) return null;

  return candidates.reduce((best, candidate) => {
    if (candidate.priority < best.priority) return candidate;
    if (candidate.priority > best.priority) return best;
    // Same priority — prefer closer
    return dist(cursor, candidate.point) < dist(cursor, best.point) ? candidate : best;
  });
}

// ── Shift + snap composition ─────────────────────────────────────────────────

/**
 * Filter snap candidates to those lying on (or near) the angle-constrained ray.
 *
 * The ray goes from angleRef through the nearest 45° direction toward cursor.
 * Candidates are projected onto the ray; if perpendicular distance < tolerance,
 * they survive.
 */
export function filterToConstraintRay(
  candidates: SnapTarget[],
  angleRef: { x: number; y: number },
  cursor: { x: number; y: number },
  tolerance: number,
): SnapTarget[] {
  const dx = cursor.x - angleRef.x;
  const dy = cursor.y - angleRef.y;
  const rawAngle = Math.atan2(dy, dx);
  const snapAngle = Math.round(rawAngle / (Math.PI / 4)) * (Math.PI / 4);

  // Unit direction vector of the ray
  const dirX = Math.cos(snapAngle);
  const dirY = Math.sin(snapAngle);

  return candidates.filter(candidate => {
    // Vector from angleRef to candidate point
    const vx = candidate.point.x - angleRef.x;
    const vy = candidate.point.y - angleRef.y;

    // Perpendicular distance from point to the ray
    // Cross product magnitude / ray length (ray is unit, so just cross product)
    const perpDist = Math.abs(vx * dirY - vy * dirX);

    // Also check candidate is in the same half-plane as the cursor (not behind angleRef)
    const dot = vx * dirX + vy * dirY;

    return perpDist <= tolerance && dot > 0;
  });
}

// ── Main pipeline ────────────────────────────────────────────────────────────

/**
 * Compute the snapped position for a raw cursor.
 *
 * This is THE function to call from event handlers. It:
 * 1. Generates all snap candidates based on enabled types
 * 2. If Shift is held, filters to the constraint ray
 * 3. Picks the best surviving candidate
 * 4. Falls back to angle-only or raw cursor
 */
export function snapPoint(
  rawCursor: { x: number; y: number },
  config: SnapConfig,
  context: SnapContext,
): SnapResult {
  const { enabledTypes, threshold, gridSize, shiftHeld, angleReference } = config;
  const { panelWidth, panelHeight, outlinePoints, draftPoints, draftEdge } = context;

  // Precompute guide lines
  const guides = computeGuideLines(panelWidth, panelHeight, outlinePoints, gridSize);
  const refPoints = [...draftPoints, ...outlinePoints];

  // Gather all candidates
  const allCandidates: SnapTarget[] = [];

  if (enabledTypes.has('grid')) {
    allCandidates.push(...gridCandidates(rawCursor, gridSize, threshold));
  }

  if (enabledTypes.has('point')) {
    allCandidates.push(...pointCandidates(rawCursor, outlinePoints, threshold));
  }

  if (enabledTypes.has('midpoint')) {
    allCandidates.push(...midpointCandidates(rawCursor, outlinePoints, threshold));
  }

  if (enabledTypes.has('alignment')) {
    allCandidates.push(...alignmentCandidates(rawCursor, refPoints, threshold));
  }

  if (enabledTypes.has('edge-segment')) {
    allCandidates.push(...edgeSegmentCandidates(rawCursor, outlinePoints, panelWidth, panelHeight, threshold));
  }

  if (enabledTypes.has('center') || enabledTypes.has('edge-line')) {
    allCandidates.push(...guideLineCandidates(rawCursor, guides, threshold, enabledTypes));
  }

  if (enabledTypes.has('intersection')) {
    allCandidates.push(...intersectionCandidates(rawCursor, guides, threshold));
  }

  if (enabledTypes.has('close-polygon')) {
    const cp = closePolygonCandidate(rawCursor, draftPoints, threshold);
    if (cp) allCandidates.push(cp);
  }

  if (enabledTypes.has('merge-boundary') && draftEdge) {
    const mb = mergeBoundaryCandidate(rawCursor, draftEdge, panelWidth, panelHeight, threshold, 2);
    if (mb) allCandidates.push(mb);
  }

  // Shift composition
  if (shiftHeld && angleReference) {
    const rayFiltered = filterToConstraintRay(allCandidates, angleReference, rawCursor, threshold);
    const best = pickBest(rayFiltered, rawCursor);

    if (best) {
      // Snap target ON the constraint ray — satisfies both constraints
      const activeGuides = findActiveGuides(best.point, guides, threshold, refPoints);
      return {
        point: best.point,
        target: best,
        angleConstrained: true,
        distance: dist(rawCursor, best.point),
        activeGuides,
      };
    }

    // No snap on the ray — fall back to pure angle constraint
    const constrained = constrainAngle(
      { x: angleReference.x, y: angleReference.y },
      rawCursor,
    );
    return {
      point: constrained,
      target: null,
      angleConstrained: true,
      distance: dist(rawCursor, constrained),
      activeGuides: [],
    };
  }

  // No Shift — pick best candidate
  const best = pickBest(allCandidates, rawCursor);

  if (best) {
    const activeGuides = findActiveGuides(best.point, guides, threshold, refPoints);
    return {
      point: best.point,
      target: best,
      angleConstrained: false,
      distance: dist(rawCursor, best.point),
      activeGuides,
    };
  }

  // No snap — return raw cursor
  return {
    point: rawCursor,
    target: null,
    angleConstrained: false,
    distance: 0,
    activeGuides: [],
  };
}

/**
 * Find guide lines that pass through (or very near) a point.
 * Used to highlight active guides in the UI.
 *
 * Also synthesizes temporary alignment guide lines when the snap point
 * aligns with reference points (draft points, outline vertices).
 */
function findActiveGuides(
  point: { x: number; y: number },
  guides: GuideLine[],
  tolerance: number,
  referencePoints?: readonly { x: number; y: number }[],
): GuideLine[] {
  const result = guides.filter(g => {
    if (g.axis === 'x') return Math.abs(point.x - g.position) < tolerance;
    return Math.abs(point.y - g.position) < tolerance;
  });

  // Add alignment guide lines for reference points that match
  if (referencePoints) {
    const seenX = new Set(result.filter(g => g.axis === 'x').map(g => roundTo(g.position, 4)));
    const seenY = new Set(result.filter(g => g.axis === 'y').map(g => roundTo(g.position, 4)));

    for (const pt of referencePoints) {
      const rx = roundTo(pt.x, 4);
      if (Math.abs(point.x - pt.x) < tolerance && !seenX.has(rx)) {
        seenX.add(rx);
        result.push({ axis: 'x', position: pt.x, type: 'edge' });
      }
      const ry = roundTo(pt.y, 4);
      if (Math.abs(point.y - pt.y) < tolerance && !seenY.has(ry)) {
        seenY.add(ry);
        result.push({ axis: 'y', position: pt.y, type: 'edge' });
      }
    }
  }

  return result;
}

// ── Tool presets ─────────────────────────────────────────────────────────────

/**
 * Get the snap configuration for a given tool/mode combination.
 */
export function getToolSnapConfig(
  tool: 'polygon' | 'rectangle' | 'circle' | 'edge-path',
  pathMode: 'polygon' | 'forked' | undefined,
  viewBoxWidth: number,
  gridSize: number,
): SnapConfig {
  const threshold = Math.max(8, viewBoxWidth / 25);

  const baseTypes: SnapTargetType[] = ['grid', 'center', 'edge-line', 'point', 'alignment', 'edge-segment', 'intersection'];

  let enabledTypes: Set<SnapTargetType>;

  switch (tool) {
    case 'polygon':
      if (pathMode === 'forked') {
        enabledTypes = new Set<SnapTargetType>([...baseTypes, 'merge-boundary', 'midpoint']);
      } else {
        enabledTypes = new Set<SnapTargetType>([...baseTypes, 'midpoint', 'close-polygon']);
      }
      break;
    case 'edge-path':
      enabledTypes = new Set<SnapTargetType>([...baseTypes, 'merge-boundary']);
      break;
    case 'rectangle':
    case 'circle':
      enabledTypes = new Set<SnapTargetType>(baseTypes);
      break;
    default:
      enabledTypes = new Set<SnapTargetType>(baseTypes);
  }

  return {
    enabledTypes,
    threshold,
    gridSize,
    shiftHeld: false,
  };
}
