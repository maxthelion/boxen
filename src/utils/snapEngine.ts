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
  'intersection': 2,
  'midpoint': 3,
  'grid': 4,
  'center': 5,
  'edge-line': 5,
};

// ── Guide line computation ───────────────────────────────────────────────────

/**
 * Compute guide lines from panel dimensions and existing points.
 * Returns center axes, panel edge lines.
 */
export function computeGuideLines(
  panelWidth: number,
  panelHeight: number,
  _outlinePoints: readonly { x: number; y: number }[],
  _gridSize: number,
): GuideLine[] {
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;
  const guides: GuideLine[] = [];

  // Center axes
  guides.push({ axis: 'x', position: 0, type: 'center' });
  guides.push({ axis: 'y', position: 0, type: 'center' });

  // Panel edges
  guides.push({ axis: 'x', position: -halfW, type: 'edge' });
  guides.push({ axis: 'x', position: halfW, type: 'edge' });
  guides.push({ axis: 'y', position: -halfH, type: 'edge' });
  guides.push({ axis: 'y', position: halfH, type: 'edge' });

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
 */
export function pointCandidates(
  cursor: { x: number; y: number },
  existingPoints: readonly { x: number; y: number }[],
  threshold: number,
): SnapTarget[] {
  const results: SnapTarget[] = [];

  for (const pt of existingPoints) {
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
      const activeGuides = findActiveGuides(best.point, guides, threshold);
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
    const activeGuides = findActiveGuides(best.point, guides, threshold);
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
 */
function findActiveGuides(
  point: { x: number; y: number },
  guides: GuideLine[],
  tolerance: number,
): GuideLine[] {
  return guides.filter(g => {
    if (g.axis === 'x') return Math.abs(point.x - g.position) < tolerance;
    return Math.abs(point.y - g.position) < tolerance;
  });
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

  const baseTypes: SnapTargetType[] = ['grid', 'center', 'edge-line', 'point', 'intersection'];

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
