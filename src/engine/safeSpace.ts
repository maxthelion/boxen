/**
 * Safe Space Calculation Module
 *
 * Calculates regions where custom geometry (cutouts, edge modifications) can be added
 * without interfering with structural joints. Anything outside the safe space could
 * break finger joint or cross-lap slot connections.
 *
 * Key exclusions:
 * - Edge joint regions (finger/slot at edges) with MT margin
 * - Slot holes (divider intersections) with MT margin
 */

import { PanelPath, FaceConfig, BoxConfig, PathPoint } from '../types';
import { debug, setDebugTags, disableDebugTag } from '../utils/debug';

// Enable only safe-space debug tag, disable noisy ones
setDebugTags(['safe-space']);
disableDebugTag('slot-geometry');
disableDebugTag('panel-gen');
disableDebugTag('sub-assembly');

// =============================================================================
// Types
// =============================================================================

/**
 * Types of reserved regions that cannot be edited
 */
export type ReservedRegionType =
  | 'joint-edge'    // Finger joint region at panel edge
  | 'joint-margin'  // MT margin around joint edge
  | 'slot'          // Slot hole where divider passes through
  | 'slot-margin';  // MT margin around slot hole

/**
 * A region on the panel that is reserved for mechanical reasons
 */
export interface ReservedRegion {
  type: ReservedRegionType;
  polygon: PathPoint[];
  reason: string;  // Human-readable explanation
}

/**
 * The complete safe space information for a panel
 */
export interface SafeSpaceRegion {
  /** The main safe area outline (may be complex polygon) */
  outline: PathPoint[];
  /** Internal exclusions (slot holes with margins) */
  exclusions: PathPoint[][];
  /** All reserved regions for UI display */
  reserved: ReservedRegion[];
  /**
   * Computed result paths - the actual safe areas after subtracting exclusions.
   * Each path is a closed polygon (typically a rectangle) representing an area
   * where custom geometry can be added safely.
   *
   * Mental model:
   * - Simple panel with joints on all sides: 1 rectangle (center safe area)
   * - Panel with internal slot (divider): 2+ rectangles (one on each side of slot)
   * - Panel with extension on open edge: may have additional safe regions in extension
   */
  resultPaths: PathPoint[][];
}

type EdgePosition = 'top' | 'bottom' | 'left' | 'right';

// =============================================================================
// Edge Joint Detection
// =============================================================================

/**
 * Mapping of face ID to its neighbor on each edge
 */
const NEIGHBOR_MAP: Record<string, Record<EdgePosition, string>> = {
  front: { top: 'top', bottom: 'bottom', left: 'left', right: 'right' },
  back: { top: 'top', bottom: 'bottom', left: 'right', right: 'left' },
  left: { top: 'top', bottom: 'bottom', left: 'back', right: 'front' },
  right: { top: 'top', bottom: 'bottom', left: 'front', right: 'back' },
  top: { top: 'back', bottom: 'front', left: 'left', right: 'right' },
  bottom: { top: 'front', bottom: 'back', left: 'left', right: 'right' },
};

/**
 * Determine if a face edge has finger joints (is connected to an adjacent solid face)
 */
function faceEdgeHasJoints(
  faceId: string,
  edgePosition: EdgePosition,
  faces: FaceConfig[]
): boolean {
  const neighbors = NEIGHBOR_MAP[faceId];
  if (!neighbors) return false;

  const neighborId = neighbors[edgePosition];
  const neighborFace = faces.find(f => f.id === neighborId);

  return neighborFace?.solid ?? false;
}

/**
 * Get edge margins for a face panel based on adjacent faces
 */
function getFaceEdgeMargins(
  faceId: string,
  faces: FaceConfig[],
  materialThickness: number
): Record<EdgePosition, number> {
  const edges: EdgePosition[] = ['top', 'bottom', 'left', 'right'];
  const margins: Record<EdgePosition, number> = { top: 0, bottom: 0, left: 0, right: 0 };

  for (const edge of edges) {
    // Safe space needs 2×MT margin from edges with joints:
    //
    // Why 2×MT?
    // - 1×MT for the finger joint region itself: Finger tabs extend MT into the panel
    //   from the edge. Any cutout here would interfere with the structural joint.
    // - 1×MT additional clearance margin: Provides structural integrity around the
    //   joint region. Without this buffer, cutouts placed right at the joint boundary
    //   could weaken the material or cause stress concentrations during assembly.
    //
    // Example: For 3mm material, the safe space is inset 6mm from jointed edges.
    margins[edge] = faceEdgeHasJoints(faceId, edge, faces) ? materialThickness * 2 : 0;
  }

  return margins;
}

/**
 * Get edge margins for a divider panel (joints on all edges)
 *
 * Divider panels have finger joints on all four edges (they connect to face panels
 * on two edges and potentially to other dividers via cross-lap joints on the other
 * two edges). Therefore all edges need the 2×MT margin.
 *
 * @see getFaceEdgeMargins for explanation of why 2×MT is used
 */
function getDividerEdgeMargins(materialThickness: number): Record<EdgePosition, number> {
  const margin = materialThickness * 2;
  return {
    top: margin,
    bottom: margin,
    left: margin,
    right: margin,
  };
}

// =============================================================================
// Slot Hole Processing
// =============================================================================

/**
 * Expand a slot hole polygon by the material thickness margin
 */
function expandPolygon(points: PathPoint[], margin: number): PathPoint[] {
  if (points.length < 3) return points;

  // Simple approach: find bounding box and expand it
  const minX = Math.min(...points.map(p => p.x));
  const maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y));
  const maxY = Math.max(...points.map(p => p.y));

  return [
    { x: minX - margin, y: maxY + margin },
    { x: maxX + margin, y: maxY + margin },
    { x: maxX + margin, y: minY - margin },
    { x: minX - margin, y: minY - margin },
  ];
}

/**
 * Get slot exclusion regions from panel holes
 */
function getSlotExclusions(
  panel: PanelPath,
  materialThickness: number
): { exclusions: PathPoint[][]; reserved: ReservedRegion[] } {
  const exclusions: PathPoint[][] = [];
  const reserved: ReservedRegion[] = [];

  for (const hole of panel.holes) {
    // Only process slot holes (from dividers, sub-assemblies, or extensions)
    const isSlot = hole.source?.type === 'divider-slot' ||
                   hole.source?.type === 'extension-slot' ||
                   hole.type === 'slot';

    if (!isSlot) continue;

    const holePoints = hole.path.points;
    if (holePoints.length < 3) continue;

    // Add the slot hole itself as a reserved region
    reserved.push({
      type: 'slot',
      polygon: [...holePoints],
      reason: 'Slot for divider panel connection',
    });

    // Expand the slot by MT margin for the exclusion zone
    const expandedSlot = expandPolygon(holePoints, materialThickness);
    exclusions.push(expandedSlot);

    // Add the margin as a separate reserved region
    reserved.push({
      type: 'slot-margin',
      polygon: expandedSlot,
      reason: 'Clearance around slot for structural integrity',
    });
  }

  return { exclusions, reserved };
}

// =============================================================================
// Safe Space Outline Calculation
// =============================================================================

/**
 * Calculate the safe space outline as the full panel surface (body + extensions).
 *
 * The outline covers the entire panel. Joint regions are handled as exclusions,
 * not as boundary reductions. This allows extension areas to be usable even
 * on edges that have finger joints.
 *
 * Note: panelWidth and panelHeight are the BODY dimensions (without extensions).
 */
function calculateSafeOutline(
  panelWidth: number,
  panelHeight: number,
  edgeExtensions: Record<EdgePosition, number>
): PathPoint[] {
  // panelWidth/Height are the body dimensions (without extensions)
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  // Outline covers the full panel (body + all extensions)
  const left = -halfW - edgeExtensions.left;
  const right = halfW + edgeExtensions.right;
  const bottom = -halfH - edgeExtensions.bottom;
  const top = halfH + edgeExtensions.top;

  // Return clockwise polygon
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
}

/**
 * Create exclusion regions for edge joints.
 *
 * Joint regions are where finger joints connect panels. These areas cannot
 * have cutouts. The exclusion is the joint region (1×MT from edge) plus
 * a clearance margin (1×MT additional).
 *
 * Total exclusion depth from body edge = 2×MT
 */
function createJointExclusions(
  panelWidth: number,
  panelHeight: number,
  edgeMargins: Record<EdgePosition, number>,
  edgeExtensions: Record<EdgePosition, number>
): PathPoint[][] {
  const exclusions: PathPoint[][] = [];

  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  // For each edge with joints, create an exclusion strip
  // The strip spans the full width of the panel (including extensions on perpendicular edges)

  if (edgeMargins.top > 0) {
    // Top joint exclusion: spans from left edge to right edge, at top of body
    const left = -halfW - edgeExtensions.left;
    const right = halfW + edgeExtensions.right;
    exclusions.push([
      { x: left, y: halfH },                        // Top-left at body edge
      { x: right, y: halfH },                       // Top-right at body edge
      { x: right, y: halfH - edgeMargins.top },     // Inner boundary
      { x: left, y: halfH - edgeMargins.top },
    ]);
  }

  if (edgeMargins.bottom > 0) {
    const left = -halfW - edgeExtensions.left;
    const right = halfW + edgeExtensions.right;
    exclusions.push([
      { x: left, y: -halfH + edgeMargins.bottom },
      { x: right, y: -halfH + edgeMargins.bottom },
      { x: right, y: -halfH },
      { x: left, y: -halfH },
    ]);
  }

  if (edgeMargins.left > 0) {
    const top = halfH + edgeExtensions.top;
    const bottom = -halfH - edgeExtensions.bottom;
    exclusions.push([
      { x: -halfW, y: top },
      { x: -halfW + edgeMargins.left, y: top },
      { x: -halfW + edgeMargins.left, y: bottom },
      { x: -halfW, y: bottom },
    ]);
  }

  if (edgeMargins.right > 0) {
    const top = halfH + edgeExtensions.top;
    const bottom = -halfH - edgeExtensions.bottom;
    exclusions.push([
      { x: halfW - edgeMargins.right, y: top },
      { x: halfW, y: top },
      { x: halfW, y: bottom },
      { x: halfW - edgeMargins.right, y: bottom },
    ]);
  }

  return exclusions;
}

/**
 * Create reserved regions for edge joints (for UI display).
 *
 * These span the full panel extent including extensions on perpendicular edges.
 */
function createEdgeReservedRegions(
  panelWidth: number,
  panelHeight: number,
  edgeMargins: Record<EdgePosition, number>,
  edgeExtensions: Record<EdgePosition, number>
): ReservedRegion[] {
  const reserved: ReservedRegion[] = [];

  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  // Create reserved region for each edge with joints
  // Spans include extensions on perpendicular edges
  if (edgeMargins.top > 0) {
    const left = -halfW - edgeExtensions.left;
    const right = halfW + edgeExtensions.right;
    reserved.push({
      type: 'joint-edge',
      polygon: [
        { x: left, y: halfH },
        { x: right, y: halfH },
        { x: right, y: halfH - edgeMargins.top },
        { x: left, y: halfH - edgeMargins.top },
      ],
      reason: 'Reserved for finger joints',
    });
  }

  if (edgeMargins.bottom > 0) {
    const left = -halfW - edgeExtensions.left;
    const right = halfW + edgeExtensions.right;
    reserved.push({
      type: 'joint-edge',
      polygon: [
        { x: left, y: -halfH + edgeMargins.bottom },
        { x: right, y: -halfH + edgeMargins.bottom },
        { x: right, y: -halfH },
        { x: left, y: -halfH },
      ],
      reason: 'Reserved for finger joints',
    });
  }

  if (edgeMargins.left > 0) {
    const top = halfH + edgeExtensions.top;
    const bottom = -halfH - edgeExtensions.bottom;
    reserved.push({
      type: 'joint-edge',
      polygon: [
        { x: -halfW, y: top },
        { x: -halfW + edgeMargins.left, y: top },
        { x: -halfW + edgeMargins.left, y: bottom },
        { x: -halfW, y: bottom },
      ],
      reason: 'Reserved for finger joints',
    });
  }

  if (edgeMargins.right > 0) {
    const top = halfH + edgeExtensions.top;
    const bottom = -halfH - edgeExtensions.bottom;
    reserved.push({
      type: 'joint-edge',
      polygon: [
        { x: halfW - edgeMargins.right, y: top },
        { x: halfW, y: top },
        { x: halfW, y: bottom },
        { x: halfW - edgeMargins.right, y: bottom },
      ],
      reason: 'Reserved for finger joints',
    });
  }

  return reserved;
}

// =============================================================================
// Result Path Computation
// =============================================================================

/**
 * Check if two axis-aligned rectangles overlap
 */
function rectanglesOverlap(
  r1: { minX: number; maxX: number; minY: number; maxY: number },
  r2: { minX: number; maxX: number; minY: number; maxY: number },
  tolerance: number = 0.001
): boolean {
  return !(
    r1.maxX < r2.minX - tolerance ||
    r1.minX > r2.maxX + tolerance ||
    r1.maxY < r2.minY - tolerance ||
    r1.minY > r2.maxY + tolerance
  );
}

/**
 * Get bounding box of a polygon
 */
function getBoundingBox(points: PathPoint[]): { minX: number; maxX: number; minY: number; maxY: number } {
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/**
 * Create a rectangle path from bounds (clockwise winding)
 */
function boundsToPath(bounds: { minX: number; maxX: number; minY: number; maxY: number }): PathPoint[] {
  return [
    { x: bounds.minX, y: bounds.maxY },  // top-left
    { x: bounds.maxX, y: bounds.maxY },  // top-right
    { x: bounds.maxX, y: bounds.minY },  // bottom-right
    { x: bounds.minX, y: bounds.minY },  // bottom-left
  ];
}

/**
 * Check if an exclusion spans the full width or height of the outline
 * (i.e., it "splits" the safe space into separate regions)
 */
function exclusionSpansFullDimension(
  exclusion: PathPoint[],
  outline: PathPoint[],
  tolerance: number = 0.001
): { spansWidth: boolean; spansHeight: boolean } {
  const exBounds = getBoundingBox(exclusion);
  const outBounds = getBoundingBox(outline);

  // Check if exclusion spans full width (left edge to right edge)
  const spansWidth = exBounds.minX <= outBounds.minX + tolerance &&
                     exBounds.maxX >= outBounds.maxX - tolerance;

  // Check if exclusion spans full height (bottom edge to top edge)
  const spansHeight = exBounds.minY <= outBounds.minY + tolerance &&
                      exBounds.maxY >= outBounds.maxY - tolerance;

  return { spansWidth, spansHeight };
}

/**
 * Compute the actual safe area paths by subtracting exclusions from the outline.
 *
 * This implements a simplified algorithm optimized for our use case:
 * - All shapes are axis-aligned rectangles
 * - Edge joint exclusions run along panel edges (reduce safe area bounds)
 * - Slot exclusions may split the safe area into multiple rectangles
 * - Extensions on open edges create additional safe regions beyond body bounds
 *
 * Algorithm:
 * 1. Start with outline bounds
 * 2. Apply edge joint exclusions to shrink body bounds
 * 3. Add extension safe regions (extensions are on open edges, no joints)
 * 4. Apply slot exclusions that span full dimensions to split into regions
 * 5. Return the resulting rectangular regions
 */
export function computeResultPaths(
  outline: PathPoint[],
  exclusions: PathPoint[][],
  panelWidth: number,
  panelHeight: number,
  edgeExtensions?: Record<EdgePosition, number>,
  materialThickness?: number
): PathPoint[][] {
  const extensions = edgeExtensions ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const mt = materialThickness ?? 3;  // Default to 3mm if not provided

  debug('safe-space', `computeResultPaths: panelWidth=${panelWidth}, panelHeight=${panelHeight}, exclusions=${exclusions.length}, mt=${mt}`);

  if (exclusions.length === 0) {
    // No exclusions - the entire outline is safe
    debug('safe-space', '  No exclusions, returning outline');
    return [outline];
  }

  const tolerance = 0.001;
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;
  const outlineBounds = getBoundingBox(outline);

  debug('safe-space', `  halfW=${halfW}, halfH=${halfH}`);
  debug('safe-space', `  outlineBounds: x[${outlineBounds.minX},${outlineBounds.maxX}] y[${outlineBounds.minY},${outlineBounds.maxY}]`);

  // Separate edge exclusions from internal slot exclusions
  // Edge exclusions are those that touch the outline boundary and span its full extent
  const edgeExclusions: PathPoint[][] = [];
  const internalExclusions: PathPoint[][] = [];

  for (const exclusion of exclusions) {
    const exBounds = getBoundingBox(exclusion);
    const { spansWidth, spansHeight } = exclusionSpansFullDimension(exclusion, outline, tolerance);

    // Check if this exclusion is along a panel body edge
    const isAtTopEdge = Math.abs(exBounds.maxY - halfH) < tolerance;
    const isAtBottomEdge = Math.abs(exBounds.minY - (-halfH)) < tolerance;
    const isAtLeftEdge = Math.abs(exBounds.minX - (-halfW)) < tolerance;
    const isAtRightEdge = Math.abs(exBounds.maxX - halfW) < tolerance;

    // Edge exclusions: touch body edge AND span full perpendicular extent
    const isEdgeExclusion = (
      (isAtTopEdge && spansWidth) ||
      (isAtBottomEdge && spansWidth) ||
      (isAtLeftEdge && spansHeight) ||
      (isAtRightEdge && spansHeight)
    );

    debug('safe-space', `  Exclusion: x[${exBounds.minX},${exBounds.maxX}] y[${exBounds.minY},${exBounds.maxY}] spansW=${spansWidth} spansH=${spansHeight} atTop=${isAtTopEdge} atBot=${isAtBottomEdge} atL=${isAtLeftEdge} atR=${isAtRightEdge} isEdge=${isEdgeExclusion}`);

    if (isEdgeExclusion) {
      edgeExclusions.push(exclusion);
    } else {
      internalExclusions.push(exclusion);
    }
  }

  debug('safe-space', `  edgeExclusions=${edgeExclusions.length}, internalExclusions=${internalExclusions.length}`);
  debug('safe-space', `  extensions: top=${extensions.top}, bottom=${extensions.bottom}, left=${extensions.left}, right=${extensions.right}`);

  // Compute the BODY safe region (shrunk by edge exclusions)
  // Start with body bounds (not including extensions)
  let bodyMinX = -halfW;
  let bodyMaxX = halfW;
  let bodyMinY = -halfH;
  let bodyMaxY = halfH;

  for (const exclusion of edgeExclusions) {
    const exBounds = getBoundingBox(exclusion);
    const { spansWidth, spansHeight } = exclusionSpansFullDimension(exclusion, outline, tolerance);

    // Shrink the body safe area based on which edge the exclusion is on
    const isAtTopEdge = Math.abs(exBounds.maxY - halfH) < tolerance;
    const isAtBottomEdge = Math.abs(exBounds.minY - (-halfH)) < tolerance;
    const isAtLeftEdge = Math.abs(exBounds.minX - (-halfW)) < tolerance;
    const isAtRightEdge = Math.abs(exBounds.maxX - halfW) < tolerance;

    if (isAtTopEdge && spansWidth) {
      bodyMaxY = Math.min(bodyMaxY, exBounds.minY);
    }
    if (isAtBottomEdge && spansWidth) {
      bodyMinY = Math.max(bodyMinY, exBounds.maxY);
    }
    if (isAtLeftEdge && spansHeight) {
      bodyMinX = Math.max(bodyMinX, exBounds.maxX);
    }
    if (isAtRightEdge && spansHeight) {
      bodyMaxX = Math.min(bodyMaxX, exBounds.minX);
    }
  }

  debug('safe-space', `  Body safe region: x[${bodyMinX},${bodyMaxX}] y[${bodyMinY},${bodyMaxY}]`);

  // Collect all safe regions (body + extensions)
  interface Region { minX: number; maxX: number; minY: number; maxY: number }
  const safeRegions: Region[] = [];

  // Add body safe region if valid
  if (bodyMaxX > bodyMinX && bodyMaxY > bodyMinY) {
    safeRegions.push({ minX: bodyMinX, maxX: bodyMaxX, minY: bodyMinY, maxY: bodyMaxY });
  }

  // Add extension safe regions
  // Extensions span the FULL panel dimension (not constrained by perpendicular edge margins)
  // because they sit beyond the body edge where finger joints are located.
  // However, extensions need MT margin from their outer edge for structural integrity.
  // So: extension safe height = extension - MT (only if extension > MT)

  // Get MT from the function context - we need to pass it or compute it
  // For now, we can infer it from the body margins (they are 2×MT, so margin/2 = MT)
  // But safer to just check if the usable space is positive

  // Extension safe regions need MT margin from the BODY edge (where joints are),
  // but go all the way to the outer edge (which is open/free).
  // Safe dimension = extension - MT, only add if this is positive (extension > MT)

  if (extensions.top > 0 && extensions.top > mt) {
    // Top extension: starts MT above body edge, goes to outer edge
    safeRegions.push({
      minX: -halfW,
      maxX: halfW,
      minY: halfH + mt,  // Body edge + MT margin (away from joint)
      maxY: halfH + extensions.top,  // Outer edge (no margin needed)
    });
    debug('safe-space', `  Added top extension region: x[${-halfW},${halfW}] y[${halfH + mt},${halfH + extensions.top}]`);
  } else if (extensions.top > 0) {
    debug('safe-space', `  Skipped top extension region: extension ${extensions.top} <= mt ${mt}`);
  }

  if (extensions.bottom > 0 && extensions.bottom > mt) {
    safeRegions.push({
      minX: -halfW,
      maxX: halfW,
      minY: -halfH - extensions.bottom,  // Outer edge (no margin needed)
      maxY: -halfH - mt,  // Body edge - MT margin (away from joint)
    });
    debug('safe-space', `  Added bottom extension region: x[${-halfW},${halfW}] y[${-halfH - extensions.bottom},${-halfH - mt}]`);
  } else if (extensions.bottom > 0) {
    debug('safe-space', `  Skipped bottom extension region: extension ${extensions.bottom} <= mt ${mt}`);
  }

  if (extensions.left > 0 && extensions.left > mt) {
    safeRegions.push({
      minX: -halfW - extensions.left,  // Outer edge (no margin needed)
      maxX: -halfW - mt,  // Body edge - MT margin (away from joint)
      minY: -halfH,
      maxY: halfH,
    });
    debug('safe-space', `  Added left extension region: x[${-halfW - extensions.left},${-halfW - mt}] y[${-halfH},${halfH}]`);
  } else if (extensions.left > 0) {
    debug('safe-space', `  Skipped left extension region: extension ${extensions.left} <= mt ${mt}`);
  }

  if (extensions.right > 0 && extensions.right > mt) {
    safeRegions.push({
      minX: halfW + mt,  // Body edge + MT margin (away from joint)
      maxX: halfW + extensions.right,  // Outer edge (no margin needed)
      minY: -halfH,
      maxY: halfH,
    });
    debug('safe-space', `  Added right extension region: x[${halfW + mt},${halfW + extensions.right}] y[${-halfH},${halfH}]`);
  } else if (extensions.right > 0) {
    debug('safe-space', `  Skipped right extension region: extension ${extensions.right} <= mt ${mt}`);
  }

  debug('safe-space', `  Total safe regions before slot processing: ${safeRegions.length}`);

  // Check if we have any valid safe regions
  if (safeRegions.length === 0) {
    debug('safe-space', `  No valid safe regions after edge exclusions`);
    return [];
  }

  // If no internal exclusions, return the safe regions as-is
  if (internalExclusions.length === 0) {
    debug('safe-space', `  No internal exclusions, returning ${safeRegions.length} regions`);
    return safeRegions.map(boundsToPath);
  }

  // Now handle internal exclusions (slots) that might split safe regions
  let regions = safeRegions;

  for (const exclusion of internalExclusions) {
    const exBounds = getBoundingBox(exclusion);
    const newRegions: Region[] = [];

    for (const region of regions) {
      // Check if this exclusion overlaps with this region
      if (!rectanglesOverlap(region, exBounds, tolerance)) {
        // No overlap - keep region as is
        newRegions.push(region);
        continue;
      }

      // Determine if exclusion spans full dimension of THIS region
      const spansRegionWidth = exBounds.minX <= region.minX + tolerance &&
                                exBounds.maxX >= region.maxX - tolerance;
      const spansRegionHeight = exBounds.minY <= region.minY + tolerance &&
                                 exBounds.maxY >= region.maxY - tolerance;

      // The exclusion overlaps this region - split it
      if (spansRegionWidth) {
        // Horizontal split - create regions above and below
        if (exBounds.maxY < region.maxY - tolerance) {
          newRegions.push({
            minX: region.minX,
            maxX: region.maxX,
            minY: exBounds.maxY,
            maxY: region.maxY,
          });
        }
        if (exBounds.minY > region.minY + tolerance) {
          newRegions.push({
            minX: region.minX,
            maxX: region.maxX,
            minY: region.minY,
            maxY: exBounds.minY,
          });
        }
      } else if (spansRegionHeight) {
        // Vertical split - create regions left and right
        if (exBounds.maxX < region.maxX - tolerance) {
          newRegions.push({
            minX: exBounds.maxX,
            maxX: region.maxX,
            minY: region.minY,
            maxY: region.maxY,
          });
        }
        if (exBounds.minX > region.minX + tolerance) {
          newRegions.push({
            minX: region.minX,
            maxX: exBounds.minX,
            minY: region.minY,
            maxY: region.maxY,
          });
        }
      } else {
        // Partial overlap - exclusion is a "hole" in the region
        const exArea = (exBounds.maxX - exBounds.minX) * (exBounds.maxY - exBounds.minY);
        const regArea = (region.maxX - region.minX) * (region.maxY - region.minY);

        if (exArea < regArea * 0.2) {
          // Small hole - keep region (exclusion shown separately)
          newRegions.push(region);
        } else {
          // Large hole - split into sub-regions around it
          if (exBounds.maxY < region.maxY - tolerance) {
            newRegions.push({
              minX: region.minX,
              maxX: region.maxX,
              minY: exBounds.maxY,
              maxY: region.maxY,
            });
          }
          if (exBounds.minY > region.minY + tolerance) {
            newRegions.push({
              minX: region.minX,
              maxX: region.maxX,
              minY: region.minY,
              maxY: exBounds.minY,
            });
          }
          if (exBounds.minX > region.minX + tolerance) {
            newRegions.push({
              minX: region.minX,
              maxX: exBounds.minX,
              minY: Math.max(region.minY, exBounds.minY),
              maxY: Math.min(region.maxY, exBounds.maxY),
            });
          }
          if (exBounds.maxX < region.maxX - tolerance) {
            newRegions.push({
              minX: exBounds.maxX,
              maxX: region.maxX,
              minY: Math.max(region.minY, exBounds.minY),
              maxY: Math.min(region.maxY, exBounds.maxY),
            });
          }
        }
      }
    }

    regions = newRegions;
  }

  // Filter out invalid or tiny regions
  const validRegions = regions.filter(r =>
    r.maxX - r.minX > tolerance && r.maxY - r.minY > tolerance
  );

  // Convert regions to paths
  return validRegions.map(boundsToPath);
}

// =============================================================================
// Main Calculation Function
// =============================================================================

/**
 * Calculate the complete safe space for a panel
 *
 * @param panel - The panel to calculate safe space for
 * @param faces - Face configurations (for determining which edges have joints)
 * @param config - Box configuration (for material thickness)
 * @returns SafeSpaceRegion with outline, exclusions, and reserved regions
 */
export function calculateSafeSpace(
  panel: PanelPath,
  faces: FaceConfig[],
  config: BoxConfig
): SafeSpaceRegion {
  const { materialThickness } = config;

  debug('safe-space', `calculateSafeSpace: panel=${panel.source.faceId || panel.source.axis} dims=${panel.width}x${panel.height} mt=${materialThickness}`);
  debug('safe-space', `  edgeExtensions: top=${panel.edgeExtensions?.top ?? 0}, bottom=${panel.edgeExtensions?.bottom ?? 0}, left=${panel.edgeExtensions?.left ?? 0}, right=${panel.edgeExtensions?.right ?? 0}`);

  // Determine edge margins based on panel type
  let edgeMargins: Record<EdgePosition, number>;

  if (panel.source.type === 'face' && panel.source.faceId) {
    edgeMargins = getFaceEdgeMargins(panel.source.faceId, faces, materialThickness);
  } else if (panel.source.type === 'divider') {
    edgeMargins = getDividerEdgeMargins(materialThickness);
  } else {
    // Unknown panel type - use conservative margins
    edgeMargins = getDividerEdgeMargins(materialThickness);
  }

  // Get edge extensions from panel (default to 0 if not present)
  const edgeExtensions: Record<EdgePosition, number> = {
    top: panel.edgeExtensions?.top ?? 0,
    bottom: panel.edgeExtensions?.bottom ?? 0,
    left: panel.edgeExtensions?.left ?? 0,
    right: panel.edgeExtensions?.right ?? 0,
  };

  // Debug: Always log for face panels
  if (panel.source.type === 'face') {
    debug('safe-space', `Panel ${panel.source.faceId}: dims=${panel.width}x${panel.height}`);
    debug('safe-space', `  extensions: top=${edgeExtensions.top}, bottom=${edgeExtensions.bottom}, left=${edgeExtensions.left}, right=${edgeExtensions.right}`);
    debug('safe-space', `  margins: top=${edgeMargins.top}, bottom=${edgeMargins.bottom}, left=${edgeMargins.left}, right=${edgeMargins.right}`);
  }

  // Calculate the main safe space outline (full panel including extensions)
  // Note: panel.width/height are body dimensions, extensions are added
  const outline = calculateSafeOutline(
    panel.width,
    panel.height,
    edgeExtensions
  );

  debug('safe-space', `Safe outline: ${outline.length} points: ${JSON.stringify(outline)}`);

  // Get joint exclusions (regions where finger joints are)
  const jointExclusions = createJointExclusions(
    panel.width,
    panel.height,
    edgeMargins,
    edgeExtensions
  );

  // Get slot exclusions and their reserved regions
  const { exclusions: slotExclusions, reserved: slotReserved } = getSlotExclusions(panel, materialThickness);

  // Combine all exclusions (joints + slots)
  const exclusions = [...jointExclusions, ...slotExclusions];

  // Create reserved regions for edge joints (for UI display)
  const edgeReserved = createEdgeReservedRegions(
    panel.width,
    panel.height,
    edgeMargins,
    edgeExtensions
  );

  // Combine all reserved regions
  const reserved = [...edgeReserved, ...slotReserved];

  // Compute the actual safe area result paths
  const resultPaths = computeResultPaths(outline, exclusions, panel.width, panel.height, edgeExtensions, materialThickness);

  debug('safe-space', `Result paths: ${resultPaths.length} safe rectangles`);

  return {
    outline,
    exclusions,
    reserved,
    resultPaths,
  };
}

/**
 * Check if a point is inside the safe space (not in any exclusion)
 */
export function isPointInSafeSpace(
  x: number,
  y: number,
  safeSpace: SafeSpaceRegion
): boolean {
  // First check if point is inside the safe outline
  if (!isPointInPolygon(x, y, safeSpace.outline)) {
    return false;
  }

  // Then check it's not inside any exclusion
  for (const exclusion of safeSpace.exclusions) {
    if (isPointInPolygon(x, y, exclusion)) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a rectangle is fully within the safe space
 */
export function isRectInSafeSpace(
  rectX: number,
  rectY: number,
  rectWidth: number,
  rectHeight: number,
  safeSpace: SafeSpaceRegion
): boolean {
  // Check all four corners
  const corners = [
    { x: rectX, y: rectY },
    { x: rectX + rectWidth, y: rectY },
    { x: rectX, y: rectY + rectHeight },
    { x: rectX + rectWidth, y: rectY + rectHeight },
  ];

  for (const corner of corners) {
    if (!isPointInSafeSpace(corner.x, corner.y, safeSpace)) {
      return false;
    }
  }

  return true;
}

/**
 * Point-in-polygon test using ray casting algorithm
 */
function isPointInPolygon(x: number, y: number, polygon: PathPoint[]): boolean {
  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    if (
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Get the reason why a point is in a reserved region
 */
export function getReservedReason(
  x: number,
  y: number,
  safeSpace: SafeSpaceRegion
): string | null {
  for (const reserved of safeSpace.reserved) {
    if (isPointInPolygon(x, y, reserved.polygon)) {
      return reserved.reason;
    }
  }
  return null;
}
