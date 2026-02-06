/**
 * Snap guide lines and snap detection for the 2D sketch editor.
 *
 * Guide lines include:
 * - Center lines (through panel center at x=0 and y=0)
 * - Edge extension lines (extending from panel edges, both inner and outer side of joints)
 *
 * Snap detection finds the nearest guide line intersection or guide line point
 * to the cursor position.
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

export interface SnapResult {
  /** The snapped point */
  point: { x: number; y: number };
  /** Which guide lines contributed to this snap */
  guides: GuideLine[];
  /** Distance from cursor to snap point (in SVG units) */
  distance: number;
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
 * Find the nearest snap point to the cursor.
 *
 * Checks cursor distance to guide line intersections and individual guide lines.
 * Intersection snaps are preferred because they lock both axes. If an intersection
 * snap is within threshold, it wins over single-axis snaps.
 */
export function findSnapPoint(
  cursorX: number,
  cursorY: number,
  guides: GuideLine[],
  snapThreshold: number,
): SnapResult | null {
  const horizontals = guides.filter(g => g.orientation === 'horizontal');
  const verticals = guides.filter(g => g.orientation === 'vertical');

  // Find best intersection snap (both axes locked)
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
          guides: [h, v],
          distance: dist,
        };
      }
    }
  }

  // If an intersection is within threshold, prefer it
  if (bestIntersection) {
    return bestIntersection;
  }

  // Fall back to single-axis snap (closest guide line)
  let bestSingle: SnapResult | null = null;
  let bestSingleDist = snapThreshold;

  for (const g of guides) {
    if (g.orientation === 'horizontal') {
      const dist = Math.abs(cursorY - g.position);
      if (dist < bestSingleDist) {
        bestSingleDist = dist;
        bestSingle = {
          point: { x: cursorX, y: g.position },
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
