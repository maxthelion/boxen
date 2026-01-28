/**
 * Path validation utilities for detecting unrenderable geometry
 *
 * THREE.js ExtrudeGeometry with holes has specific requirements:
 * - Outline must be counter-clockwise (CCW)
 * - Holes must be clockwise (CW) - opposite to outline
 * - Holes must be strictly inside the outline (not touching boundary)
 * - No duplicate consecutive points
 * - No self-intersecting paths
 */

import { PathPoint } from '../types';

export interface PathValidationResult {
  valid: boolean;
  errors: PathValidationError[];
  warnings: PathValidationWarning[];
}

export interface PathValidationError {
  type: 'duplicate_points' | 'hole_outside_bounds' | 'hole_touches_boundary' |
        'same_winding' | 'empty_path' | 'insufficient_points' | 'zero_area';
  message: string;
  details?: Record<string, unknown>;
}

export interface PathValidationWarning {
  type: 'near_zero_segment' | 'very_small_hole';
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Compute signed area of a polygon (shoelace formula)
 * Positive = clockwise (CW), Negative = counter-clockwise (CCW)
 */
export function computeSignedArea(points: PathPoint[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    area += (p2.x - p1.x) * (p2.y + p1.y);
  }
  return area / 2;
}

/**
 * Check if a point is strictly inside a bounding box (not on boundary)
 */
function isStrictlyInside(
  point: PathPoint,
  minX: number, maxX: number,
  minY: number, maxY: number,
  tolerance: number = 0.01
): boolean {
  return point.x > minX + tolerance &&
         point.x < maxX - tolerance &&
         point.y > minY + tolerance &&
         point.y < maxY - tolerance;
}

/**
 * Get bounding box of a path
 */
export function getPathBounds(points: PathPoint[]): {
  minX: number; maxX: number; minY: number; maxY: number;
} {
  if (points.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }
  return {
    minX: Math.min(...points.map(p => p.x)),
    maxX: Math.max(...points.map(p => p.x)),
    minY: Math.min(...points.map(p => p.y)),
    maxY: Math.max(...points.map(p => p.y)),
  };
}

/**
 * Check for duplicate consecutive points in a path
 */
export function findDuplicatePoints(
  points: PathPoint[],
  tolerance: number = 0.001
): Array<{ index: number; point: PathPoint }> {
  const duplicates: Array<{ index: number; point: PathPoint }> = [];

  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const dist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);

    if (dist < tolerance) {
      duplicates.push({ index: i, point: p1 });
    }
  }

  return duplicates;
}

/**
 * Check if a hole touches the outline boundary
 */
export function holeTouchesBoundary(
  holePoints: PathPoint[],
  outlineBounds: { minX: number; maxX: number; minY: number; maxY: number },
  tolerance: number = 0.01
): { touches: boolean; edges: string[] } {
  const holeBounds = getPathBounds(holePoints);
  const edges: string[] = [];

  if (Math.abs(holeBounds.minX - outlineBounds.minX) < tolerance) edges.push('left');
  if (Math.abs(holeBounds.maxX - outlineBounds.maxX) < tolerance) edges.push('right');
  if (Math.abs(holeBounds.minY - outlineBounds.minY) < tolerance) edges.push('bottom');
  if (Math.abs(holeBounds.maxY - outlineBounds.maxY) < tolerance) edges.push('top');

  return { touches: edges.length > 0, edges };
}

/**
 * Validate a panel path with outline and holes for THREE.js renderability
 */
export function validatePanelPath(
  outline: PathPoint[],
  holes: Array<{ points: PathPoint[] }>,
  options: { tolerance?: number } = {}
): PathValidationResult {
  const tolerance = options.tolerance ?? 0.01;
  const errors: PathValidationError[] = [];
  const warnings: PathValidationWarning[] = [];

  // Check outline
  if (outline.length === 0) {
    errors.push({
      type: 'empty_path',
      message: 'Outline path is empty',
    });
    return { valid: false, errors, warnings };
  }

  if (outline.length < 3) {
    errors.push({
      type: 'insufficient_points',
      message: `Outline has only ${outline.length} points (minimum 3 required)`,
    });
    return { valid: false, errors, warnings };
  }

  // Check outline area
  const outlineArea = computeSignedArea(outline);
  if (Math.abs(outlineArea) < tolerance) {
    errors.push({
      type: 'zero_area',
      message: 'Outline has zero or near-zero area',
      details: { area: outlineArea },
    });
  }

  // Check for duplicate points in outline
  const outlineDuplicates = findDuplicatePoints(outline, tolerance);
  if (outlineDuplicates.length > 0) {
    errors.push({
      type: 'duplicate_points',
      message: `Outline has ${outlineDuplicates.length} duplicate consecutive point(s)`,
      details: { duplicates: outlineDuplicates },
    });
  }

  // Get outline bounds for hole validation
  const outlineBounds = getPathBounds(outline);

  // Check each hole
  for (let i = 0; i < holes.length; i++) {
    const hole = holes[i];

    if (hole.points.length === 0) {
      errors.push({
        type: 'empty_path',
        message: `Hole ${i} is empty`,
      });
      continue;
    }

    if (hole.points.length < 3) {
      errors.push({
        type: 'insufficient_points',
        message: `Hole ${i} has only ${hole.points.length} points (minimum 3 required)`,
      });
      continue;
    }

    // Check hole area
    const holeArea = computeSignedArea(hole.points);
    if (Math.abs(holeArea) < tolerance) {
      errors.push({
        type: 'zero_area',
        message: `Hole ${i} has zero or near-zero area`,
        details: { holeIndex: i, area: holeArea },
      });
    }

    // Check winding order - holes should have opposite winding to outline
    const outlineIsCW = outlineArea > 0;
    const holeIsCW = holeArea > 0;
    if (outlineIsCW === holeIsCW) {
      errors.push({
        type: 'same_winding',
        message: `Hole ${i} has same winding order as outline (both ${outlineIsCW ? 'CW' : 'CCW'})`,
        details: { holeIndex: i, outlineArea, holeArea },
      });
    }

    // Check for duplicate points in hole
    const holeDuplicates = findDuplicatePoints(hole.points, tolerance);
    if (holeDuplicates.length > 0) {
      errors.push({
        type: 'duplicate_points',
        message: `Hole ${i} has ${holeDuplicates.length} duplicate consecutive point(s)`,
        details: { holeIndex: i, duplicates: holeDuplicates },
      });
    }

    // Check if hole is within outline bounds
    const holeBounds = getPathBounds(hole.points);
    const holeOutsideBounds =
      holeBounds.minX < outlineBounds.minX - tolerance ||
      holeBounds.maxX > outlineBounds.maxX + tolerance ||
      holeBounds.minY < outlineBounds.minY - tolerance ||
      holeBounds.maxY > outlineBounds.maxY + tolerance;

    if (holeOutsideBounds) {
      errors.push({
        type: 'hole_outside_bounds',
        message: `Hole ${i} extends outside outline bounds`,
        details: { holeIndex: i, holeBounds, outlineBounds },
      });
    }

    // Check if hole touches outline boundary
    const boundaryCheck = holeTouchesBoundary(hole.points, outlineBounds, tolerance);
    if (boundaryCheck.touches) {
      errors.push({
        type: 'hole_touches_boundary',
        message: `Hole ${i} touches outline boundary at: ${boundaryCheck.edges.join(', ')}`,
        details: { holeIndex: i, edges: boundaryCheck.edges, holeBounds, outlineBounds },
      });
    }

    // Warn about very small holes
    const holeWidth = holeBounds.maxX - holeBounds.minX;
    const holeHeight = holeBounds.maxY - holeBounds.minY;
    if (holeWidth < 1 || holeHeight < 1) {
      warnings.push({
        type: 'very_small_hole',
        message: `Hole ${i} is very small (${holeWidth.toFixed(2)}x${holeHeight.toFixed(2)})`,
        details: { holeIndex: i, width: holeWidth, height: holeHeight },
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate a PanelPath object
 */
export function validatePanelPathObject(panel: {
  outline: { points: PathPoint[] };
  holes: Array<{ path: { points: PathPoint[] } }>;
}): PathValidationResult {
  return validatePanelPath(
    panel.outline.points,
    panel.holes.map(h => ({ points: h.path.points }))
  );
}
