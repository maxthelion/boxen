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
    // 1×MT for the joint region itself, plus 1×MT clearance margin
    margins[edge] = faceEdgeHasJoints(faceId, edge, faces) ? materialThickness * 2 : 0;
  }

  return margins;
}

/**
 * Get edge margins for a divider panel (joints on all edges)
 * Uses 2×MT: 1×MT for joint region + 1×MT clearance margin
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
 * Calculate the safe space outline based on edge margins
 *
 * Note: panelWidth and panelHeight are the BODY dimensions (without extensions).
 * Extensions are additional material added beyond the body.
 * The safe space is based on the body, inset by margins where joints exist.
 */
function calculateSafeOutline(
  panelWidth: number,
  panelHeight: number,
  edgeMargins: Record<EdgePosition, number>
): PathPoint[] {
  // panelWidth/Height are already the body dimensions (without extensions)
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  // Safe space is inset from body edges by their margins
  const safeLeft = -halfW + edgeMargins.left;
  const safeRight = halfW - edgeMargins.right;
  const safeBottom = -halfH + edgeMargins.bottom;
  const safeTop = halfH - edgeMargins.top;

  // Return clockwise polygon
  return [
    { x: safeLeft, y: safeTop },
    { x: safeRight, y: safeTop },
    { x: safeRight, y: safeBottom },
    { x: safeLeft, y: safeBottom },
  ];
}

/**
 * Create reserved regions for edge joints
 *
 * Note: panelWidth and panelHeight are the BODY dimensions (without extensions).
 */
function createEdgeReservedRegions(
  panelWidth: number,
  panelHeight: number,
  edgeMargins: Record<EdgePosition, number>
): ReservedRegion[] {
  const reserved: ReservedRegion[] = [];

  // panelWidth/Height are already the body dimensions
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  // Create reserved region for each edge with joints
  if (edgeMargins.top > 0) {
    reserved.push({
      type: 'joint-edge',
      polygon: [
        { x: -halfW, y: halfH },
        { x: halfW, y: halfH },
        { x: halfW, y: halfH - edgeMargins.top },
        { x: -halfW, y: halfH - edgeMargins.top },
      ],
      reason: 'Reserved for finger joints',
    });
  }

  if (edgeMargins.bottom > 0) {
    reserved.push({
      type: 'joint-edge',
      polygon: [
        { x: -halfW, y: -halfH + edgeMargins.bottom },
        { x: halfW, y: -halfH + edgeMargins.bottom },
        { x: halfW, y: -halfH },
        { x: -halfW, y: -halfH },
      ],
      reason: 'Reserved for finger joints',
    });
  }

  if (edgeMargins.left > 0) {
    reserved.push({
      type: 'joint-edge',
      polygon: [
        { x: -halfW, y: halfH },
        { x: -halfW + edgeMargins.left, y: halfH },
        { x: -halfW + edgeMargins.left, y: -halfH },
        { x: -halfW, y: -halfH },
      ],
      reason: 'Reserved for finger joints',
    });
  }

  if (edgeMargins.right > 0) {
    reserved.push({
      type: 'joint-edge',
      polygon: [
        { x: halfW - edgeMargins.right, y: halfH },
        { x: halfW, y: halfH },
        { x: halfW, y: -halfH },
        { x: halfW - edgeMargins.right, y: -halfH },
      ],
      reason: 'Reserved for finger joints',
    });
  }

  return reserved;
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

  // Calculate the main safe space outline
  // Note: panel.width/height are body dimensions, not including extensions
  const outline = calculateSafeOutline(
    panel.width,
    panel.height,
    edgeMargins
  );

  debug('safe-space', `Safe outline: ${outline.length} points: ${JSON.stringify(outline)}`);

  // Get slot exclusions and their reserved regions
  const { exclusions, reserved: slotReserved } = getSlotExclusions(panel, materialThickness);

  // Create reserved regions for edge joints
  const edgeReserved = createEdgeReservedRegions(
    panel.width,
    panel.height,
    edgeMargins
  );

  // Combine all reserved regions
  const reserved = [...edgeReserved, ...slotReserved];

  return {
    outline,
    exclusions,
    reserved,
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
