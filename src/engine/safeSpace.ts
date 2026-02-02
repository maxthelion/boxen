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
// Path Analysis Types
// =============================================================================

/**
 * Result of analyzing a drawn path to determine its type and behavior.
 *
 * This is used to route drawn shapes to the appropriate storage:
 * - Edge path: modifies panel edge outline
 * - Cutout: creates hole in panel
 * - Additive path: extends panel beyond boundary (on open edges)
 */
export interface PathAnalysis {
  /**
   * Whether any point of the path exactly touches the safe space border.
   * If true, the path should be treated as an edge path modification.
   */
  touchesSafeSpaceBorder: boolean;

  /**
   * Which edge(s) the path borders, if any.
   * A path may touch multiple edges (e.g., corner modifications).
   */
  borderedEdges: EdgePosition[];

  /**
   * Whether the path is entirely within the safe space.
   * If true and doesn't touch border, it's a subtractive cutout.
   */
  whollyInSafeSpace: boolean;

  /**
   * Whether the path extends beyond the safe space on an open edge.
   * If true, the path can be additive (extending panel) or subtractive.
   */
  spansOpenEdge: boolean;

  /**
   * Which open edges the path spans, if any.
   */
  openEdgesSpanned: EdgePosition[];

  /**
   * Whether the path touches a closed edge (edge with joints on all sides).
   * Closed edges cannot have edge paths - only interior cutouts are allowed.
   */
  touchesClosedEdge: boolean;
}

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
 * Check if a rectangle is fully within the safe space.
 * Note: rectX, rectY are the CENTER of the rectangle (matching cutout coordinate system).
 */
export function isRectInSafeSpace(
  centerX: number,
  centerY: number,
  rectWidth: number,
  rectHeight: number,
  safeSpace: SafeSpaceRegion
): boolean {
  // Calculate corners from center
  const halfW = rectWidth / 2;
  const halfH = rectHeight / 2;
  const corners = [
    { x: centerX - halfW, y: centerY - halfH },
    { x: centerX + halfW, y: centerY - halfH },
    { x: centerX - halfW, y: centerY + halfH },
    { x: centerX + halfW, y: centerY + halfH },
  ];

  for (const corner of corners) {
    if (!isPointInSafeSpace(corner.x, corner.y, safeSpace)) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a circle is fully within the safe space.
 * Samples points around the circle perimeter to check containment.
 */
export function isCircleInSafeSpace(
  centerX: number,
  centerY: number,
  radius: number,
  safeSpace: SafeSpaceRegion
): boolean {
  // Check center point
  if (!isPointInSafeSpace(centerX, centerY, safeSpace)) {
    return false;
  }

  // Sample points around the circle (8 points should be sufficient for our use case)
  const numSamples = 8;
  for (let i = 0; i < numSamples; i++) {
    const angle = (i / numSamples) * Math.PI * 2;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    if (!isPointInSafeSpace(x, y, safeSpace)) {
      return false;
    }
  }

  return true;
}

// =============================================================================
// Path Analysis
// =============================================================================

/**
 * Analyze a drawn path to determine how it should be handled.
 *
 * This function examines where a path lies relative to the safe space:
 * - Paths that exactly touch the safe space border → edge path modifications
 * - Paths wholly inside safe space → subtractive cutouts
 * - Paths that extend beyond safe space on open edges → additive/subtractive options
 * - Paths on closed edges (joints on all sides) → cannot be edge paths
 *
 * @param points - The drawn path points in panel coordinates
 * @param safeSpace - The safe space region for the panel
 * @param edgeMargins - Which edges have joints (margin > 0 means joints)
 * @param panelWidth - Panel body width (excluding extensions)
 * @param panelHeight - Panel body height (excluding extensions)
 * @param tolerance - Tolerance for "touching" detection (default 0.001)
 */
export function analyzePath(
  points: PathPoint[],
  safeSpace: SafeSpaceRegion,
  edgeMargins: Record<EdgePosition, number>,
  panelWidth: number,
  panelHeight: number,
  tolerance: number = 0.001
): PathAnalysis {
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  // Identify which edges are open (no joints)
  const openEdges: EdgePosition[] = [];
  const closedEdges: EdgePosition[] = [];
  for (const edge of ['top', 'bottom', 'left', 'right'] as EdgePosition[]) {
    if (edgeMargins[edge] === 0) {
      openEdges.push(edge);
    } else {
      closedEdges.push(edge);
    }
  }

  // Get safe space boundary (the inner edge of the joint margins)
  const safeMinX = -halfW + (edgeMargins.left > 0 ? edgeMargins.left : 0);
  const safeMaxX = halfW - (edgeMargins.right > 0 ? edgeMargins.right : 0);
  const safeMinY = -halfH + (edgeMargins.bottom > 0 ? edgeMargins.bottom : 0);
  const safeMaxY = halfH - (edgeMargins.top > 0 ? edgeMargins.top : 0);

  // Body boundary (the panel edge before extensions)
  const bodyMinX = -halfW;
  const bodyMaxX = halfW;
  const bodyMinY = -halfH;
  const bodyMaxY = halfH;

  const borderedEdges: EdgePosition[] = [];
  const openEdgesSpanned: EdgePosition[] = [];
  let touchesSafeSpaceBorder = false;
  let whollyInSafeSpace = true;
  let spansOpenEdge = false;
  let touchesClosedEdge = false;

  for (const point of points) {
    const { x, y } = point;

    // Check if point is in safe space
    const inSafeSpace = isPointInSafeSpace(x, y, safeSpace);
    if (!inSafeSpace) {
      whollyInSafeSpace = false;
    }

    // Check if point touches safe space border (inner edge of joint margins)
    // For open edges, the "border" is the body edge
    const touchesTopBorder = Math.abs(y - safeMaxY) < tolerance && edgeMargins.top > 0;
    const touchesBottomBorder = Math.abs(y - safeMinY) < tolerance && edgeMargins.bottom > 0;
    const touchesLeftBorder = Math.abs(x - safeMinX) < tolerance && edgeMargins.left > 0;
    const touchesRightBorder = Math.abs(x - safeMaxX) < tolerance && edgeMargins.right > 0;

    // For open edges, check if point touches the body edge
    const touchesTopBody = Math.abs(y - bodyMaxY) < tolerance && edgeMargins.top === 0;
    const touchesBottomBody = Math.abs(y - bodyMinY) < tolerance && edgeMargins.bottom === 0;
    const touchesLeftBody = Math.abs(x - bodyMinX) < tolerance && edgeMargins.left === 0;
    const touchesRightBody = Math.abs(x - bodyMaxX) < tolerance && edgeMargins.right === 0;

    // Record which edges are bordered
    if (touchesTopBorder || touchesTopBody) {
      if (!borderedEdges.includes('top')) borderedEdges.push('top');
      if (touchesTopBorder) touchesSafeSpaceBorder = true;
      if (touchesTopBody) {
        if (!openEdgesSpanned.includes('top')) openEdgesSpanned.push('top');
      }
    }
    if (touchesBottomBorder || touchesBottomBody) {
      if (!borderedEdges.includes('bottom')) borderedEdges.push('bottom');
      if (touchesBottomBorder) touchesSafeSpaceBorder = true;
      if (touchesBottomBody) {
        if (!openEdgesSpanned.includes('bottom')) openEdgesSpanned.push('bottom');
      }
    }
    if (touchesLeftBorder || touchesLeftBody) {
      if (!borderedEdges.includes('left')) borderedEdges.push('left');
      if (touchesLeftBorder) touchesSafeSpaceBorder = true;
      if (touchesLeftBody) {
        if (!openEdgesSpanned.includes('left')) openEdgesSpanned.push('left');
      }
    }
    if (touchesRightBorder || touchesRightBody) {
      if (!borderedEdges.includes('right')) borderedEdges.push('right');
      if (touchesRightBorder) touchesSafeSpaceBorder = true;
      if (touchesRightBody) {
        if (!openEdgesSpanned.includes('right')) openEdgesSpanned.push('right');
      }
    }

    // Check if point extends beyond body boundary (only valid on open edges)
    const beyondTop = y > bodyMaxY + tolerance;
    const beyondBottom = y < bodyMinY - tolerance;
    const beyondLeft = x < bodyMinX - tolerance;
    const beyondRight = x > bodyMaxX + tolerance;

    if (beyondTop && edgeMargins.top === 0) {
      spansOpenEdge = true;
      if (!openEdgesSpanned.includes('top')) openEdgesSpanned.push('top');
    }
    if (beyondBottom && edgeMargins.bottom === 0) {
      spansOpenEdge = true;
      if (!openEdgesSpanned.includes('bottom')) openEdgesSpanned.push('bottom');
    }
    if (beyondLeft && edgeMargins.left === 0) {
      spansOpenEdge = true;
      if (!openEdgesSpanned.includes('left')) openEdgesSpanned.push('left');
    }
    if (beyondRight && edgeMargins.right === 0) {
      spansOpenEdge = true;
      if (!openEdgesSpanned.includes('right')) openEdgesSpanned.push('right');
    }

    // Check if point is in a closed edge region (joints on all sides)
    // A point touches a closed edge if it's in the joint margin of a jointed edge
    for (const edge of closedEdges) {
      switch (edge) {
        case 'top':
          if (y > safeMaxY - tolerance) touchesClosedEdge = true;
          break;
        case 'bottom':
          if (y < safeMinY + tolerance) touchesClosedEdge = true;
          break;
        case 'left':
          if (x < safeMinX + tolerance) touchesClosedEdge = true;
          break;
        case 'right':
          if (x > safeMaxX - tolerance) touchesClosedEdge = true;
          break;
      }
    }
  }

  return {
    touchesSafeSpaceBorder,
    borderedEdges,
    whollyInSafeSpace,
    spansOpenEdge,
    openEdgesSpanned,
    touchesClosedEdge,
  };
}

/**
 * Get edge margins for a face panel (convenience function for analyzePath).
 * This is a re-export of the internal function for external use.
 */
export function getEdgeMarginsForFace(
  faceId: string,
  faces: FaceConfig[],
  materialThickness: number
): Record<EdgePosition, number> {
  return getFaceEdgeMargins(faceId, faces, materialThickness);
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

// =============================================================================
// Edge Path Conversion
// =============================================================================

/**
 * Edge path point for custom edge geometry.
 * Duplicated here to avoid circular dependency with types.ts
 */
interface EdgePathPoint {
  t: number;      // 0-1 normalized position along edge
  offset: number; // mm, perpendicular offset from edge line
}

/**
 * Custom edge path for panel edge customization.
 */
interface CustomEdgePathResult {
  edge: EdgePosition;
  baseOffset: number;
  points: EdgePathPoint[];
  mirrored: boolean;
}

/**
 * Convert a rectangle that touches the safe space border into a CustomEdgePath.
 *
 * The rectangle creates a notch in the panel edge. The edge path defines
 * the complete edge outline from t=0 to t=1, with the notch where the
 * rectangle intersects.
 *
 * @param rectMinX - Rectangle left x coordinate
 * @param rectMaxX - Rectangle right x coordinate
 * @param rectMinY - Rectangle bottom y coordinate
 * @param rectMaxY - Rectangle top y coordinate
 * @param borderedEdge - Which edge the rectangle touches
 * @param panelWidth - Panel body width (not including extensions)
 * @param panelHeight - Panel body height (not including extensions)
 * @returns CustomEdgePath for the edge, or null if invalid
 */
export function rectToEdgePath(
  rectMinX: number,
  rectMaxX: number,
  rectMinY: number,
  rectMaxY: number,
  borderedEdge: EdgePosition,
  panelWidth: number,
  panelHeight: number
): CustomEdgePathResult | null {
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  // Clamp rectangle to panel bounds to avoid invalid t values
  const clampedMinX = Math.max(rectMinX, -halfW);
  const clampedMaxX = Math.min(rectMaxX, halfW);
  const clampedMinY = Math.max(rectMinY, -halfH);
  const clampedMaxY = Math.min(rectMaxY, halfH);

  // Check if clamped rectangle is valid
  if (clampedMaxX <= clampedMinX || clampedMaxY <= clampedMinY) {
    return null;
  }

  const points: EdgePathPoint[] = [];

  switch (borderedEdge) {
    case 'top': {
      // Top edge: t goes from 0 (left, x=-halfW) to 1 (right, x=+halfW)
      // Panel edge is at y = halfH
      // Notch depth is how far down the rectangle goes from panel edge
      const t_start = (clampedMinX + halfW) / panelWidth;
      const t_end = (clampedMaxX + halfW) / panelWidth;
      const notchDepth = clampedMinY - halfH; // Negative (inward)

      // Define complete edge path with notch
      points.push({ t: 0, offset: 0 });          // Start at left corner
      points.push({ t: t_start, offset: 0 });    // Before notch
      points.push({ t: t_start, offset: notchDepth }); // Down into notch
      points.push({ t: t_end, offset: notchDepth });   // Across notch bottom
      points.push({ t: t_end, offset: 0 });      // Back up
      points.push({ t: 1, offset: 0 });          // End at right corner
      break;
    }

    case 'bottom': {
      // Bottom edge: t goes from 0 (left, x=-halfW) to 1 (right, x=+halfW)
      // Panel edge is at y = -halfH
      // Notch depth is how far up the rectangle goes from panel edge
      const t_start = (clampedMinX + halfW) / panelWidth;
      const t_end = (clampedMaxX + halfW) / panelWidth;
      const notchDepth = -(clampedMaxY - (-halfH)); // Negative (inward from bottom)

      points.push({ t: 0, offset: 0 });
      points.push({ t: t_start, offset: 0 });
      points.push({ t: t_start, offset: notchDepth });
      points.push({ t: t_end, offset: notchDepth });
      points.push({ t: t_end, offset: 0 });
      points.push({ t: 1, offset: 0 });
      break;
    }

    case 'left': {
      // Left edge: t goes from 0 (bottom, y=-halfH) to 1 (top, y=+halfH)
      // Panel edge is at x = -halfW
      // Notch depth is how far right the rectangle goes from panel edge
      const t_start = (clampedMinY + halfH) / panelHeight;
      const t_end = (clampedMaxY + halfH) / panelHeight;
      const notchDepth = -(clampedMaxX - (-halfW)); // Negative (inward from left)

      points.push({ t: 0, offset: 0 });
      points.push({ t: t_start, offset: 0 });
      points.push({ t: t_start, offset: notchDepth });
      points.push({ t: t_end, offset: notchDepth });
      points.push({ t: t_end, offset: 0 });
      points.push({ t: 1, offset: 0 });
      break;
    }

    case 'right': {
      // Right edge: t goes from 0 (bottom, y=-halfH) to 1 (top, y=+halfH)
      // Panel edge is at x = halfW
      // Notch depth is how far left the rectangle goes from panel edge
      const t_start = (clampedMinY + halfH) / panelHeight;
      const t_end = (clampedMaxY + halfH) / panelHeight;
      const notchDepth = clampedMinX - halfW; // Negative (inward from right)

      points.push({ t: 0, offset: 0 });
      points.push({ t: t_start, offset: 0 });
      points.push({ t: t_start, offset: notchDepth });
      points.push({ t: t_end, offset: notchDepth });
      points.push({ t: t_end, offset: 0 });
      points.push({ t: 1, offset: 0 });
      break;
    }
  }

  return {
    edge: borderedEdge,
    baseOffset: 0,
    points,
    mirrored: false, // User placed the shape at a specific location
  };
}

/**
 * Convert a circle that touches the safe space border into a CustomEdgePath.
 *
 * The circle creates a curved notch (approximated with line segments) in the
 * panel edge.
 *
 * @param centerX - Circle center x coordinate
 * @param centerY - Circle center y coordinate
 * @param radius - Circle radius
 * @param borderedEdge - Which edge the circle touches
 * @param panelWidth - Panel body width
 * @param panelHeight - Panel body height
 * @param segments - Number of segments to approximate the arc (default 8)
 * @returns CustomEdgePath for the edge, or null if invalid
 */
export function circleToEdgePath(
  centerX: number,
  centerY: number,
  radius: number,
  borderedEdge: EdgePosition,
  panelWidth: number,
  panelHeight: number,
  segments: number = 8
): CustomEdgePathResult | null {
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  const points: EdgePathPoint[] = [];

  switch (borderedEdge) {
    case 'top': {
      // Circle creates a notch in top edge. Find where circle intersects the edge (y = halfH)
      // and only trace the arc between those intersection points.
      const dy = halfH - centerY;
      const discrim = radius * radius - dy * dy;
      if (discrim < 0) return null; // Circle doesn't reach the edge

      // X coordinates where circle intersects the edge
      const dx = Math.sqrt(discrim);
      const leftX = Math.max(centerX - dx, -halfW);
      const rightX = Math.min(centerX + dx, halfW);
      if (leftX >= rightX) return null;

      const t_start = (leftX + halfW) / panelWidth;
      const t_end = (rightX + halfW) / panelWidth;

      points.push({ t: 0, offset: 0 });
      points.push({ t: t_start, offset: 0 });

      // Trace arc from left intersection to right intersection, going through the bottom
      // We want the arc portion that goes INTO the panel (below the edge)
      const startAngle = Math.atan2(halfH - centerY, leftX - centerX);
      const endAngle = Math.atan2(halfH - centerY, rightX - centerX);

      // Calculate the angular distance going the "long way" (through bottom of circle)
      // Short way: startAngle → endAngle directly (goes through top if center is below edge)
      // Long way: startAngle → bottom → endAngle (what we want for a notch)
      let angleSpan = startAngle - endAngle;
      if (angleSpan > 0 && angleSpan < Math.PI) {
        // Short path goes through top of circle, we need long path through bottom
        angleSpan = -(2 * Math.PI - angleSpan);
      }

      for (let i = 0; i <= segments; i++) {
        const angle = startAngle - (angleSpan * i / segments);
        const arcX = centerX + radius * Math.cos(angle);
        const arcY = centerY + radius * Math.sin(angle);
        const t = (Math.max(-halfW, Math.min(halfW, arcX)) + halfW) / panelWidth;
        const offset = arcY - halfH; // Negative = into the panel
        points.push({ t, offset });
      }

      points.push({ t: t_end, offset: 0 });
      points.push({ t: 1, offset: 0 });
      break;
    }

    case 'bottom': {
      // Circle creates a notch in bottom edge. Find where circle intersects the edge (y = -halfH)
      // and only trace the arc between those intersection points.
      const dy = -halfH - centerY;
      const discrim = radius * radius - dy * dy;
      if (discrim < 0) return null; // Circle doesn't reach the edge

      // X coordinates where circle intersects the edge
      const dx = Math.sqrt(discrim);
      const leftX = Math.max(centerX - dx, -halfW);
      const rightX = Math.min(centerX + dx, halfW);
      if (leftX >= rightX) return null;

      const t_start = (leftX + halfW) / panelWidth;
      const t_end = (rightX + halfW) / panelWidth;

      points.push({ t: 0, offset: 0 });
      points.push({ t: t_start, offset: 0 });

      // Trace arc from left intersection to right intersection, going through the top
      // (the part that goes INTO the panel from the bottom edge)
      const startAngle = Math.atan2(-halfH - centerY, leftX - centerX);
      const endAngle = Math.atan2(-halfH - centerY, rightX - centerX);

      // Calculate the angular distance going the "long way" (through top of circle)
      let angleSpan = endAngle - startAngle;
      if (angleSpan < 0) {
        angleSpan = angleSpan + 2 * Math.PI;
      }
      if (angleSpan < Math.PI) {
        // Short path, need long path through top
        angleSpan = -(2 * Math.PI - angleSpan);
      }

      for (let i = 0; i <= segments; i++) {
        const angle = startAngle + (angleSpan * i / segments);
        const arcX = centerX + radius * Math.cos(angle);
        const arcY = centerY + radius * Math.sin(angle);
        const t = (Math.max(-halfW, Math.min(halfW, arcX)) + halfW) / panelWidth;
        const offset = -(arcY - (-halfH)); // Negative = into the panel from bottom
        points.push({ t, offset });
      }

      points.push({ t: t_end, offset: 0 });
      points.push({ t: 1, offset: 0 });
      break;
    }

    case 'left': {
      // Circle creates a notch in left edge. Find where circle intersects the edge (x = -halfW)
      // and only trace the arc between those intersection points.
      const dx = -halfW - centerX;
      const discrim = radius * radius - dx * dx;
      if (discrim < 0) return null; // Circle doesn't reach the edge

      // Y coordinates where circle intersects the edge
      const dy = Math.sqrt(discrim);
      const bottomY = Math.max(centerY - dy, -halfH);
      const topY = Math.min(centerY + dy, halfH);
      if (bottomY >= topY) return null;

      const t_start = (bottomY + halfH) / panelHeight;
      const t_end = (topY + halfH) / panelHeight;

      points.push({ t: 0, offset: 0 });
      points.push({ t: t_start, offset: 0 });

      // Trace arc from bottom intersection to top intersection, going through the right
      // (the part that goes INTO the panel from the left edge)
      const startAngle = Math.atan2(bottomY - centerY, -halfW - centerX);
      const endAngle = Math.atan2(topY - centerY, -halfW - centerX);

      // For left edge, we want to go the "long way" through the right side
      let angleSpan = endAngle - startAngle;
      if (angleSpan < 0) {
        angleSpan = angleSpan + 2 * Math.PI;
      }
      // If angleSpan goes the short way (through left/exterior), take long way (through right/interior)
      if (angleSpan > Math.PI) {
        angleSpan = -(2 * Math.PI - angleSpan);
      }

      for (let i = 0; i <= segments; i++) {
        const angle = startAngle + (angleSpan * i / segments);
        const arcX = centerX + radius * Math.cos(angle);
        const arcY = centerY + radius * Math.sin(angle);
        const t = (Math.max(-halfH, Math.min(halfH, arcY)) + halfH) / panelHeight;
        const offset = -(arcX - (-halfW)); // Negative = into the panel from left
        points.push({ t, offset });
      }

      points.push({ t: t_end, offset: 0 });
      points.push({ t: 1, offset: 0 });
      break;
    }

    case 'right': {
      // Circle creates a notch in right edge. Find where circle intersects the edge (x = halfW)
      // and only trace the arc between those intersection points.
      const dx = halfW - centerX;
      const discrim = radius * radius - dx * dx;
      if (discrim < 0) return null; // Circle doesn't reach the edge

      // Y coordinates where circle intersects the edge
      const dy = Math.sqrt(discrim);
      const bottomY = Math.max(centerY - dy, -halfH);
      const topY = Math.min(centerY + dy, halfH);
      if (bottomY >= topY) return null;

      const t_start = (bottomY + halfH) / panelHeight;
      const t_end = (topY + halfH) / panelHeight;

      points.push({ t: 0, offset: 0 });
      points.push({ t: t_start, offset: 0 });

      // Trace arc from bottom intersection to top intersection, going through the left
      // (the part that goes INTO the panel from the right edge)
      const startAngle = Math.atan2(bottomY - centerY, halfW - centerX);
      const endAngle = Math.atan2(topY - centerY, halfW - centerX);

      // For right edge, we want to go the "long way" through the left side
      let angleSpan = endAngle - startAngle;
      if (angleSpan < 0) {
        angleSpan = angleSpan + 2 * Math.PI;
      }
      // If angleSpan goes the short way (through right/exterior), take long way (through left/interior)
      if (angleSpan > Math.PI) {
        angleSpan = -(2 * Math.PI - angleSpan);
      }

      for (let i = 0; i <= segments; i++) {
        const angle = startAngle + (angleSpan * i / segments);
        const arcX = centerX + radius * Math.cos(angle);
        const arcY = centerY + radius * Math.sin(angle);
        const t = (Math.max(-halfH, Math.min(halfH, arcY)) + halfH) / panelHeight;
        const offset = arcX - halfW; // Negative = into the panel from right
        points.push({ t, offset });
      }

      points.push({ t: t_end, offset: 0 });
      points.push({ t: 1, offset: 0 });
      break;
    }
  }

  return {
    edge: borderedEdge,
    baseOffset: 0,
    points,
    mirrored: false,
  };
}

/**
 * Merge two edge paths for the same edge.
 *
 * When multiple shapes modify the same edge, their paths are merged:
 * - Straight sections (offset=0) from one path don't override modifications from the other
 * - Modified sections (offset!=0) from the new path take precedence in overlapping regions
 * - The result contains all modifications from both paths
 *
 * @param existing - The existing edge path (may be null)
 * @param newPath - The new edge path to merge in
 * @returns Merged edge path
 */
export function mergeEdgePaths(
  existing: CustomEdgePathResult | null,
  newPath: CustomEdgePathResult
): CustomEdgePathResult {
  if (!existing) {
    return newPath;
  }

  // Both paths must be for the same edge
  if (existing.edge !== newPath.edge) {
    console.warn('Cannot merge edge paths for different edges');
    return newPath;
  }

  // Extract modified regions from each path
  // A region is "modified" if it has points with offset != 0
  const existingModifications = extractModifiedRegions(existing.points);
  const newModifications = extractModifiedRegions(newPath.points);

  // Merge modifications: new takes precedence in overlapping regions
  const mergedModifications = mergeModifications(existingModifications, newModifications);

  // Build the merged path from the modifications
  const mergedPoints = buildPathFromModifications(mergedModifications);

  return {
    edge: newPath.edge,
    baseOffset: Math.min(existing.baseOffset, newPath.baseOffset), // Use most inward offset
    points: mergedPoints,
    mirrored: false, // Merged paths are never mirrored
  };
}

/**
 * A modification region on an edge path
 */
interface ModificationRegion {
  tStart: number;
  tEnd: number;
  points: EdgePathPoint[]; // Points in this region (including start/end at offset=0)
}

/**
 * Extract regions where the path has modifications (offset != 0)
 */
function extractModifiedRegions(points: EdgePathPoint[]): ModificationRegion[] {
  const regions: ModificationRegion[] = [];
  let currentRegion: EdgePathPoint[] | null = null;
  let regionStart = 0;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const isModified = Math.abs(pt.offset) > 0.001;
    const prevIsModified = i > 0 && Math.abs(points[i - 1].offset) > 0.001;

    if (isModified && !currentRegion) {
      // Start of a modified region - include the preceding straight point
      currentRegion = [];
      if (i > 0) {
        currentRegion.push(points[i - 1]);
        regionStart = points[i - 1].t;
      } else {
        regionStart = pt.t;
      }
      currentRegion.push(pt);
    } else if (isModified && currentRegion) {
      // Continue modified region
      currentRegion.push(pt);
    } else if (!isModified && prevIsModified && currentRegion) {
      // End of modified region - include this straight point
      currentRegion.push(pt);
      regions.push({
        tStart: regionStart,
        tEnd: pt.t,
        points: currentRegion,
      });
      currentRegion = null;
    }
  }

  // Handle region that extends to the end
  if (currentRegion && currentRegion.length > 0) {
    const lastPt = points[points.length - 1];
    regions.push({
      tStart: regionStart,
      tEnd: lastPt.t,
      points: currentRegion,
    });
  }

  return regions;
}

/**
 * Merge modification regions, with new regions taking precedence
 */
function mergeModifications(
  existing: ModificationRegion[],
  newMods: ModificationRegion[]
): ModificationRegion[] {
  // Combine all regions
  const allRegions = [...existing, ...newMods];

  if (allRegions.length === 0) {
    return [];
  }

  // Sort by start position
  allRegions.sort((a, b) => a.tStart - b.tStart);

  const merged: ModificationRegion[] = [];

  for (const region of allRegions) {
    const isNew = newMods.includes(region);

    if (merged.length === 0) {
      merged.push(region);
      continue;
    }

    const last = merged[merged.length - 1];
    const lastIsNew = newMods.includes(last);

    // Check for overlap
    if (region.tStart < last.tEnd) {
      // Overlapping regions
      if (isNew && !lastIsNew) {
        // New region takes precedence - split the existing region
        if (region.tStart > last.tStart) {
          // Keep the non-overlapping part of the existing region
          const truncatedPoints = last.points.filter(p => p.t <= region.tStart);
          if (truncatedPoints.length > 1) {
            merged[merged.length - 1] = {
              tStart: last.tStart,
              tEnd: region.tStart,
              points: truncatedPoints,
            };
          } else {
            merged.pop();
          }
        } else {
          merged.pop();
        }
        merged.push(region);
      } else if (!isNew && lastIsNew) {
        // Existing region, but new already has precedence - skip overlapping part
        if (region.tEnd > last.tEnd) {
          // Keep the non-overlapping part of the existing region
          const remainingPoints = region.points.filter(p => p.t >= last.tEnd);
          if (remainingPoints.length > 1) {
            merged.push({
              tStart: last.tEnd,
              tEnd: region.tEnd,
              points: remainingPoints,
            });
          }
        }
        // Otherwise skip entirely
      } else {
        // Both same source - later one wins (shouldn't happen often)
        merged.pop();
        merged.push(region);
      }
    } else {
      // No overlap
      merged.push(region);
    }
  }

  return merged;
}

/**
 * Build a complete edge path from modification regions
 */
function buildPathFromModifications(modifications: ModificationRegion[]): EdgePathPoint[] {
  if (modifications.length === 0) {
    // No modifications - straight edge
    return [
      { t: 0, offset: 0 },
      { t: 1, offset: 0 },
    ];
  }

  const points: EdgePathPoint[] = [];

  // Start at t=0 if first modification doesn't start there
  if (modifications[0].tStart > 0.001) {
    points.push({ t: 0, offset: 0 });
  }

  for (let i = 0; i < modifications.length; i++) {
    const region = modifications[i];

    // Add straight section before this region if needed
    if (points.length > 0) {
      const lastT = points[points.length - 1].t;
      if (region.tStart > lastT + 0.001) {
        // Add point at start of region at offset 0
        points.push({ t: region.tStart, offset: 0 });
      }
    }

    // Add all points from this region (skip duplicates)
    for (const pt of region.points) {
      const lastPt = points[points.length - 1];
      if (!lastPt || Math.abs(pt.t - lastPt.t) > 0.001 || Math.abs(pt.offset - lastPt.offset) > 0.001) {
        points.push(pt);
      }
    }
  }

  // End at t=1 if last modification doesn't end there
  const lastPt = points[points.length - 1];
  if (lastPt.t < 0.999) {
    if (Math.abs(lastPt.offset) > 0.001) {
      points.push({ t: lastPt.t, offset: 0 });
    }
    points.push({ t: 1, offset: 0 });
  }

  return points;
}

/**
 * Create an additive edge path that extends the panel outward.
 *
 * For shapes that span an open edge and should add material (tabs/extensions),
 * this creates a path with positive offsets.
 *
 * @param rectMinX - Rectangle left x coordinate
 * @param rectMaxX - Rectangle right x coordinate
 * @param rectMinY - Rectangle bottom y coordinate
 * @param rectMaxY - Rectangle top y coordinate
 * @param borderedEdge - Which edge the rectangle touches
 * @param panelWidth - Panel body width
 * @param panelHeight - Panel body height
 * @returns CustomEdgePath with positive offsets, or null if invalid
 */
export function rectToAdditiveEdgePath(
  rectMinX: number,
  rectMaxX: number,
  rectMinY: number,
  rectMaxY: number,
  borderedEdge: EdgePosition,
  panelWidth: number,
  panelHeight: number
): CustomEdgePathResult | null {
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  const points: EdgePathPoint[] = [];

  switch (borderedEdge) {
    case 'top': {
      // Additive on top: shape extends above the panel edge (y > halfH)
      // The extension height is how far above the panel edge
      const t_start = Math.max(0, (rectMinX + halfW) / panelWidth);
      const t_end = Math.min(1, (rectMaxX + halfW) / panelWidth);
      const extensionHeight = rectMaxY - halfH; // Positive (outward)

      if (extensionHeight <= 0) return null; // Not actually extending outward

      points.push({ t: 0, offset: 0 });
      points.push({ t: t_start, offset: 0 });
      points.push({ t: t_start, offset: extensionHeight });
      points.push({ t: t_end, offset: extensionHeight });
      points.push({ t: t_end, offset: 0 });
      points.push({ t: 1, offset: 0 });
      break;
    }

    case 'bottom': {
      // Additive on bottom: shape extends below the panel edge (y < -halfH)
      const t_start = Math.max(0, (rectMinX + halfW) / panelWidth);
      const t_end = Math.min(1, (rectMaxX + halfW) / panelWidth);
      const extensionHeight = (-halfH) - rectMinY; // Positive (outward from bottom)

      if (extensionHeight <= 0) return null;

      points.push({ t: 0, offset: 0 });
      points.push({ t: t_start, offset: 0 });
      points.push({ t: t_start, offset: extensionHeight });
      points.push({ t: t_end, offset: extensionHeight });
      points.push({ t: t_end, offset: 0 });
      points.push({ t: 1, offset: 0 });
      break;
    }

    case 'left': {
      // Additive on left: shape extends left of panel edge (x < -halfW)
      const t_start = Math.max(0, (rectMinY + halfH) / panelHeight);
      const t_end = Math.min(1, (rectMaxY + halfH) / panelHeight);
      const extensionWidth = (-halfW) - rectMinX; // Positive (outward from left)

      if (extensionWidth <= 0) return null;

      points.push({ t: 0, offset: 0 });
      points.push({ t: t_start, offset: 0 });
      points.push({ t: t_start, offset: extensionWidth });
      points.push({ t: t_end, offset: extensionWidth });
      points.push({ t: t_end, offset: 0 });
      points.push({ t: 1, offset: 0 });
      break;
    }

    case 'right': {
      // Additive on right: shape extends right of panel edge (x > halfW)
      const t_start = Math.max(0, (rectMinY + halfH) / panelHeight);
      const t_end = Math.min(1, (rectMaxY + halfH) / panelHeight);
      const extensionWidth = rectMaxX - halfW; // Positive (outward from right)

      if (extensionWidth <= 0) return null;

      points.push({ t: 0, offset: 0 });
      points.push({ t: t_start, offset: 0 });
      points.push({ t: t_start, offset: extensionWidth });
      points.push({ t: t_end, offset: extensionWidth });
      points.push({ t: t_end, offset: 0 });
      points.push({ t: 1, offset: 0 });
      break;
    }
  }

  return {
    edge: borderedEdge,
    baseOffset: 0,
    points,
    mirrored: false,
  };
}

/**
 * Create an additive edge path from a circle that extends outward.
 */
export function circleToAdditiveEdgePath(
  centerX: number,
  centerY: number,
  radius: number,
  borderedEdge: EdgePosition,
  panelWidth: number,
  panelHeight: number,
  segments: number = 8
): CustomEdgePathResult | null {
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  const points: EdgePathPoint[] = [];

  switch (borderedEdge) {
    case 'top': {
      // Circle extending above top edge. Find where circle intersects the edge (y = halfH)
      // and trace the arc between those points going through the TOP (outside the panel).
      const dy = halfH - centerY;
      const discrim = radius * radius - dy * dy;
      if (discrim < 0) return null; // Circle doesn't cross the edge

      // Check if circle actually extends above the edge
      if (centerY + radius <= halfH) return null;

      const dx = Math.sqrt(discrim);
      const leftX = Math.max(centerX - dx, -halfW);
      const rightX = Math.min(centerX + dx, halfW);
      if (leftX >= rightX) return null;

      const t_start = (leftX + halfW) / panelWidth;
      const t_end = (rightX + halfW) / panelWidth;

      points.push({ t: 0, offset: 0 });
      points.push({ t: t_start, offset: 0 });

      // Trace arc from left to right, going through the TOP (above the edge)
      const startAngle = Math.atan2(halfH - centerY, leftX - centerX);
      const endAngle = Math.atan2(halfH - centerY, rightX - centerX);

      // For extension, we need the LONG way (through the top of circle, outside the panel)
      // First compute the short way, then take the opposite
      let angleSpan = endAngle - startAngle;
      if (angleSpan < -Math.PI) angleSpan += 2 * Math.PI;
      if (angleSpan > Math.PI) angleSpan -= 2 * Math.PI;
      // Now take the long way (opposite direction)
      if (angleSpan > 0) angleSpan -= 2 * Math.PI;
      else angleSpan += 2 * Math.PI;

      for (let i = 0; i <= segments; i++) {
        const angle = startAngle + (angleSpan * i / segments);
        const arcX = centerX + radius * Math.cos(angle);
        const arcY = centerY + radius * Math.sin(angle);
        const t = Math.max(0, Math.min(1, (arcX + halfW) / panelWidth));
        const offset = Math.max(0, arcY - halfH); // Positive = extending above
        points.push({ t, offset });
      }

      points.push({ t: t_end, offset: 0 });
      points.push({ t: 1, offset: 0 });
      break;
    }

    case 'bottom': {
      // Circle extending below bottom edge. Find where circle intersects the edge (y = -halfH)
      const dy = -halfH - centerY;
      const discrim = radius * radius - dy * dy;
      if (discrim < 0) return null;

      // Check if circle actually extends below the edge
      if (centerY - radius >= -halfH) return null;

      const dx = Math.sqrt(discrim);
      const leftX = Math.max(centerX - dx, -halfW);
      const rightX = Math.min(centerX + dx, halfW);
      if (leftX >= rightX) return null;

      const t_start = (leftX + halfW) / panelWidth;
      const t_end = (rightX + halfW) / panelWidth;

      points.push({ t: 0, offset: 0 });
      points.push({ t: t_start, offset: 0 });

      // Trace arc from left to right, going through the BOTTOM (below the edge)
      const startAngle = Math.atan2(-halfH - centerY, leftX - centerX);
      const endAngle = Math.atan2(-halfH - centerY, rightX - centerX);

      // For extension, we need the LONG way (through bottom of circle, outside the panel)
      let angleSpan = endAngle - startAngle;
      if (angleSpan < -Math.PI) angleSpan += 2 * Math.PI;
      if (angleSpan > Math.PI) angleSpan -= 2 * Math.PI;
      // Take the long way
      if (angleSpan > 0) angleSpan -= 2 * Math.PI;
      else angleSpan += 2 * Math.PI;

      for (let i = 0; i <= segments; i++) {
        const angle = startAngle + (angleSpan * i / segments);
        const arcX = centerX + radius * Math.cos(angle);
        const arcY = centerY + radius * Math.sin(angle);
        const t = Math.max(0, Math.min(1, (arcX + halfW) / panelWidth));
        const offset = Math.max(0, (-halfH) - arcY); // Positive = extending below
        points.push({ t, offset });
      }

      points.push({ t: t_end, offset: 0 });
      points.push({ t: 1, offset: 0 });
      break;
    }

    case 'left': {
      // Circle extending left of left edge. Find where circle intersects the edge (x = -halfW)
      const dx = -halfW - centerX;
      const discrim = radius * radius - dx * dx;
      if (discrim < 0) return null;

      // Check if circle actually extends left of the edge
      if (centerX - radius >= -halfW) return null;

      const dy = Math.sqrt(discrim);
      const bottomY = Math.max(centerY - dy, -halfH);
      const topY = Math.min(centerY + dy, halfH);
      if (bottomY >= topY) return null;

      const t_start = (bottomY + halfH) / panelHeight;
      const t_end = (topY + halfH) / panelHeight;

      points.push({ t: 0, offset: 0 });
      points.push({ t: t_start, offset: 0 });

      // Trace arc from bottom to top, going through the LEFT (outside the panel)
      const startAngle = Math.atan2(bottomY - centerY, -halfW - centerX);
      const endAngle = Math.atan2(topY - centerY, -halfW - centerX);

      // For extension, we need the LONG way (through left of circle, outside the panel)
      let angleSpan = endAngle - startAngle;
      if (angleSpan < -Math.PI) angleSpan += 2 * Math.PI;
      if (angleSpan > Math.PI) angleSpan -= 2 * Math.PI;
      // Take the long way
      if (angleSpan > 0) angleSpan -= 2 * Math.PI;
      else angleSpan += 2 * Math.PI;

      for (let i = 0; i <= segments; i++) {
        const angle = startAngle + (angleSpan * i / segments);
        const arcX = centerX + radius * Math.cos(angle);
        const arcY = centerY + radius * Math.sin(angle);
        const t = Math.max(0, Math.min(1, (arcY + halfH) / panelHeight));
        const offset = Math.max(0, (-halfW) - arcX); // Positive = extending left
        points.push({ t, offset });
      }

      points.push({ t: t_end, offset: 0 });
      points.push({ t: 1, offset: 0 });
      break;
    }

    case 'right': {
      // Circle extending right of right edge. Find where circle intersects the edge (x = halfW)
      const dx = halfW - centerX;
      const discrim = radius * radius - dx * dx;
      if (discrim < 0) return null;

      // Check if circle actually extends right of the edge
      if (centerX + radius <= halfW) return null;

      const dy = Math.sqrt(discrim);
      const bottomY = Math.max(centerY - dy, -halfH);
      const topY = Math.min(centerY + dy, halfH);
      if (bottomY >= topY) return null;

      const t_start = (bottomY + halfH) / panelHeight;
      const t_end = (topY + halfH) / panelHeight;

      points.push({ t: 0, offset: 0 });
      points.push({ t: t_start, offset: 0 });

      // Trace arc from bottom to top, going through the RIGHT (outside the panel)
      const startAngle = Math.atan2(bottomY - centerY, halfW - centerX);
      const endAngle = Math.atan2(topY - centerY, halfW - centerX);

      // For extension, we need the LONG way (through right of circle, outside the panel)
      let angleSpan = endAngle - startAngle;
      if (angleSpan < -Math.PI) angleSpan += 2 * Math.PI;
      if (angleSpan > Math.PI) angleSpan -= 2 * Math.PI;
      // Take the long way
      if (angleSpan > 0) angleSpan -= 2 * Math.PI;
      else angleSpan += 2 * Math.PI;

      for (let i = 0; i <= segments; i++) {
        const angle = startAngle + (angleSpan * i / segments);
        const arcX = centerX + radius * Math.cos(angle);
        const arcY = centerY + radius * Math.sin(angle);
        const t = Math.max(0, Math.min(1, (arcY + halfH) / panelHeight));
        const offset = Math.max(0, arcX - halfW); // Positive = extending right
        points.push({ t, offset });
      }

      points.push({ t: t_end, offset: 0 });
      points.push({ t: 1, offset: 0 });
      break;
    }
  }

  return {
    edge: borderedEdge,
    baseOffset: 0,
    points,
    mirrored: false,
  };
}

// =============================================================================
// Extract Edge Path from Modified Safe Area
// =============================================================================

/**
 * Extract the edge path along a specific edge from a modified safe area polygon.
 *
 * This is the key function for the boolean-based edge modification system.
 * It takes a polygon (the modified safe area after boolean operations) and
 * extracts the boundary along a specific edge as a CustomEdgePath.
 *
 * Algorithm:
 * 1. Find all polygon vertices that lie on or near the specified edge
 * 2. Sort them by position along the edge
 * 3. Convert to {t, offset} format
 * 4. Handle transitions where the polygon boundary enters/exits the edge region
 *
 * @param polygon - The modified safe area polygon
 * @param edge - Which edge to extract ('top', 'bottom', 'left', 'right')
 * @param panelWidth - Panel body width (not including extensions)
 * @param panelHeight - Panel body height (not including extensions)
 * @returns CustomEdgePath for the edge, or null if no modification
 */
export function extractEdgePathFromPolygon(
  polygon: PathPoint[],
  edge: EdgePosition,
  panelWidth: number,
  panelHeight: number
): CustomEdgePathResult | null {
  if (!polygon || polygon.length < 3) {
    return null;
  }

  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;
  const tolerance = 0.001;

  // Determine the edge line position and perpendicular direction
  // edgePos: the coordinate of the original panel body edge
  // perpAxis: which axis is perpendicular to the edge
  // along: which axis runs along the edge
  let edgePos: number;
  let perpAxis: 'x' | 'y';
  let alongAxis: 'x' | 'y';
  let alongMin: number;
  let alongMax: number;
  let outwardDirection: number; // +1 if positive values are outward, -1 if negative

  switch (edge) {
    case 'top':
      edgePos = halfH;
      perpAxis = 'y';
      alongAxis = 'x';
      alongMin = -halfW;
      alongMax = halfW;
      outwardDirection = 1; // y > halfH is outward
      break;
    case 'bottom':
      edgePos = -halfH;
      perpAxis = 'y';
      alongAxis = 'x';
      alongMin = -halfW;
      alongMax = halfW;
      outwardDirection = -1; // y < -halfH is outward
      break;
    case 'left':
      edgePos = -halfW;
      perpAxis = 'x';
      alongAxis = 'y';
      alongMin = -halfH;
      alongMax = halfH;
      outwardDirection = -1; // x < -halfW is outward
      break;
    case 'right':
      edgePos = halfW;
      perpAxis = 'x';
      alongAxis = 'y';
      alongMin = -halfH;
      alongMax = halfH;
      outwardDirection = 1; // x > halfW is outward
      break;
  }

  const alongRange = alongMax - alongMin;

  // Find all segments of the polygon that are "on the edge side"
  // A segment is relevant if it passes through or is on the edge side of the body
  interface EdgePoint {
    t: number;  // 0-1 along the edge
    offset: number;  // perpendicular offset from body edge
  }

  const edgePoints: EdgePoint[] = [];

  // Walk through the polygon and extract points near this edge
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];

    const p1Along = alongAxis === 'x' ? p1.x : p1.y;
    const p1Perp = perpAxis === 'y' ? p1.y : p1.x;
    const p2Along = alongAxis === 'x' ? p2.x : p2.y;
    const p2Perp = perpAxis === 'y' ? p2.y : p2.x;

    // Skip segments entirely outside the edge's along-range
    if (Math.max(p1Along, p2Along) < alongMin - tolerance ||
        Math.min(p1Along, p2Along) > alongMax + tolerance) {
      continue;
    }

    // Check if point is on the "edge side" (outward from body edge)
    const p1OnEdgeSide = outwardDirection > 0
      ? p1Perp >= edgePos - tolerance
      : p1Perp <= edgePos + tolerance;

    // If point is on the edge side, add it
    if (p1OnEdgeSide && p1Along >= alongMin - tolerance && p1Along <= alongMax + tolerance) {
      const t = (Math.max(alongMin, Math.min(alongMax, p1Along)) - alongMin) / alongRange;
      const offset = (p1Perp - edgePos) * outwardDirection;
      edgePoints.push({ t, offset });
    }

    // Check for intersection with the edge line
    if ((p1Perp < edgePos && p2Perp > edgePos) || (p1Perp > edgePos && p2Perp < edgePos)) {
      // Segment crosses the edge line - find intersection
      const ratio = (edgePos - p1Perp) / (p2Perp - p1Perp);
      const intersectAlong = p1Along + ratio * (p2Along - p1Along);
      if (intersectAlong >= alongMin - tolerance && intersectAlong <= alongMax + tolerance) {
        const t = (Math.max(alongMin, Math.min(alongMax, intersectAlong)) - alongMin) / alongRange;
        edgePoints.push({ t, offset: 0 });
      }
    }
  }

  if (edgePoints.length < 2) {
    // Not enough points to form an edge path
    return null;
  }

  // Sort by t value
  edgePoints.sort((a, b) => a.t - b.t);

  // Remove consecutive duplicates
  const uniquePoints: EdgePoint[] = [];
  for (const pt of edgePoints) {
    const last = uniquePoints[uniquePoints.length - 1];
    if (!last || Math.abs(pt.t - last.t) > tolerance || Math.abs(pt.offset - last.offset) > tolerance) {
      uniquePoints.push(pt);
    }
  }

  // Check if this is just a straight edge (all offsets ≈ 0)
  const hasModification = uniquePoints.some(p => Math.abs(p.offset) > tolerance);
  if (!hasModification) {
    return null; // No modification needed
  }

  // Build the final edge path, ensuring we start and end at t=0 and t=1
  const finalPoints: EdgePathPoint[] = [];

  // Add start point if needed
  if (uniquePoints[0].t > tolerance) {
    finalPoints.push({ t: 0, offset: 0 });
  }

  // Add all unique points
  for (const pt of uniquePoints) {
    finalPoints.push({ t: pt.t, offset: pt.offset });
  }

  // Add end point if needed
  if (uniquePoints[uniquePoints.length - 1].t < 1 - tolerance) {
    finalPoints.push({ t: 1, offset: 0 });
  }

  return {
    edge,
    baseOffset: 0,
    points: finalPoints,
    mirrored: false,
  };
}
