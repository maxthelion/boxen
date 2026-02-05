/**
 * All Corners Detection and Eligibility System
 *
 * This module extends the fillet system to handle ANY corner in panel geometry,
 * not just the 4 outer panel corners. It supports:
 * - Outline corners (including those from edge extensions and custom paths)
 * - Cutout/hole corners (interior corners)
 * - Both convex and concave corners
 *
 * Corner IDs use a path-based format:
 * - Outline corners: "outline:index" (e.g., "outline:5")
 * - Hole corners: "hole:holeId:index" (e.g., "hole:cutout-1:2")
 *
 * Full corner key format (including panel): "panelId:outline:index" or "panelId:hole:holeId:index"
 */

import { Point2D } from '../engine/types';

/**
 * Types of corners based on their geometric location
 */
export type CornerLocation = 'outline' | 'hole';

/**
 * Corner type based on angle (convex = exterior, concave = interior)
 */
export type CornerType = 'convex' | 'concave';

/**
 * Unique identifier for any corner in panel geometry
 * Format: "outline:index" or "hole:holeId:index"
 */
export type AllCornerId = string;

/**
 * Full corner key including panel ID
 * Format: "panelId:outline:index" or "panelId:hole:holeId:index"
 */
export type AllCornerKey = string;

/**
 * Detailed information about a detected corner
 */
export interface AllCornerInfo {
  /** Unique corner ID within the panel */
  id: AllCornerId;
  /** Location type (outline or hole) */
  location: CornerLocation;
  /** For holes, the hole ID */
  holeId?: string;
  /** Index in the path points array */
  pathIndex: number;
  /** 2D position of the corner */
  position: Point2D;
  /** Interior angle in radians (< PI = convex, > PI = concave) */
  angle: number;
  /** Corner type based on angle */
  type: CornerType;
  /** Length of incoming edge at this corner */
  incomingEdgeLength: number;
  /** Length of outgoing edge at this corner */
  outgoingEdgeLength: number;
}

/**
 * Eligibility information for a corner
 */
export interface AllCornerEligibility extends AllCornerInfo {
  /** Whether this corner can be filleted */
  eligible: boolean;
  /** Reason for ineligibility */
  reason?: 'forbidden-area' | 'mechanical-joint' | 'too-small' | 'near-other-fillet';
  /** Maximum fillet radius allowed at this corner */
  maxRadius: number;
}

/**
 * Configuration for corner detection
 */
export interface CornerDetectionConfig {
  /** Material thickness in mm */
  materialThickness: number;
  /** Minimum edge length to consider (edges shorter than this are skipped) */
  minEdgeLength?: number;
  /** Angle threshold in radians - angles closer to PI than this are considered "straight" */
  straightAngleThreshold?: number;
}

/**
 * Calculate the interior angle at a vertex given three points
 * Returns angle in radians (0 to 2*PI)
 */
function calculateInteriorAngle(
  prev: Point2D,
  current: Point2D,
  next: Point2D
): number {
  // Vectors from current point to adjacent points
  const v1 = { x: prev.x - current.x, y: prev.y - current.y };
  const v2 = { x: next.x - current.x, y: next.y - current.y };

  // Calculate angle using atan2 for correct quadrant handling
  const angle1 = Math.atan2(v1.y, v1.x);
  const angle2 = Math.atan2(v2.y, v2.x);

  // Calculate the signed angle between vectors
  let angle = angle2 - angle1;

  // Normalize to [0, 2*PI]
  while (angle < 0) angle += 2 * Math.PI;
  while (angle > 2 * Math.PI) angle -= 2 * Math.PI;

  return angle;
}

/**
 * Calculate edge length between two points
 */
function edgeLength(p1: Point2D, p2: Point2D): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate max fillet radius for a corner based on adjacent edge lengths and angle
 *
 * A fillet of radius R at angle θ consumes R × tan(θ/2) along each adjacent edge.
 * Therefore: maxRadius = min(edge1, edge2) / tan(θ/2)
 *
 * For 90° corners: maxRadius ≈ min(edge1, edge2)
 * For 45° corners: maxRadius ≈ min(edge1, edge2) × 0.41
 * For 135° corners: maxRadius ≈ min(edge1, edge2) × 2.41
 */
export function calculateMaxFilletRadius(
  incomingEdgeLength: number,
  outgoingEdgeLength: number,
  angle: number
): number {
  // Guard: minimum edge length to avoid degenerate cases
  const minEdgeLength = 0.1;
  const safeIncoming = Math.max(Math.abs(incomingEdgeLength), minEdgeLength);
  const safeOutgoing = Math.max(Math.abs(outgoingEdgeLength), minEdgeLength);

  // Normalize angle to [0, 2*PI] range
  let normalizedAngle = angle % (2 * Math.PI);
  if (normalizedAngle < 0) normalizedAngle += 2 * Math.PI;

  // Guard: clamp angle to avoid singularities at 0, PI, and 2*PI
  // These would cause tan to be 0 or infinite
  const minAngle = 0.01; // ~0.5 degrees
  const maxAngle = Math.PI - 0.01;
  const safeAngle = Math.max(minAngle, Math.min(normalizedAngle, maxAngle));

  // The interior angle for fillet calculation
  // For a 90° corner, the exterior angle is 90°, so we use PI - angle for convex corners
  const exteriorAngle = Math.PI - safeAngle;

  // Handle nearly straight corners (exterior angle close to 0)
  if (Math.abs(exteriorAngle) < 0.01) {
    // Nearly straight line - return a large but finite value
    // (infinite would cause issues downstream)
    return 1000;
  }

  const halfAngle = Math.abs(exteriorAngle) / 2;
  const tanHalfAngle = Math.tan(halfAngle);

  // Guard: avoid division by very small tan values
  if (!Number.isFinite(tanHalfAngle) || tanHalfAngle <= 0.001) {
    // Return 0 for angles where fillet cannot be computed
    return 0;
  }

  const minEdge = Math.min(safeIncoming, safeOutgoing);

  // Use a safety factor to ensure fillets don't consume the entire edge
  // This leaves room for adjacent operations and prevents edge cases
  const safetyFactor = 0.8;

  const result = (minEdge * safetyFactor) / tanHalfAngle;

  // Guard: ensure finite positive result
  return Number.isFinite(result) && result > 0 ? result : 0;
}

/**
 * Detect all corners in a path (outline or hole)
 */
export function detectCornersInPath(
  points: Point2D[],
  location: CornerLocation,
  holeId: string | undefined,
  config: CornerDetectionConfig
): AllCornerInfo[] {
  if (points.length < 3) return [];

  const minEdgeLength = config.minEdgeLength ?? config.materialThickness * 0.5;
  const straightThreshold = config.straightAngleThreshold ?? Math.PI * 0.1; // ~18 degrees from straight

  const corners: AllCornerInfo[] = [];

  for (let i = 0; i < points.length; i++) {
    const prevIdx = (i - 1 + points.length) % points.length;
    const nextIdx = (i + 1) % points.length;

    const prev = points[prevIdx];
    const current = points[i];
    const next = points[nextIdx];

    // Calculate edge lengths
    const inLength = edgeLength(prev, current);
    const outLength = edgeLength(current, next);

    // Skip corners with very short edges (likely part of finger joints)
    if (inLength < minEdgeLength || outLength < minEdgeLength) {
      continue;
    }

    // Calculate interior angle
    const angle = calculateInteriorAngle(prev, current, next);

    // Skip nearly straight corners (close to 180 degrees = PI radians)
    if (Math.abs(angle - Math.PI) < straightThreshold) {
      continue;
    }

    // Determine corner type
    // For counter-clockwise winding (standard for outlines), angle < PI = convex, angle > PI = concave
    // For holes (typically clockwise winding), it's reversed
    let type: CornerType;
    if (location === 'outline') {
      type = angle < Math.PI ? 'convex' : 'concave';
    } else {
      // Holes have opposite winding, so flip the interpretation
      type = angle < Math.PI ? 'concave' : 'convex';
    }

    // Create corner ID
    const id: AllCornerId = holeId
      ? `hole:${holeId}:${i}`
      : `outline:${i}`;

    corners.push({
      id,
      location,
      holeId,
      pathIndex: i,
      position: { x: current.x, y: current.y },
      angle,
      type,
      incomingEdgeLength: inLength,
      outgoingEdgeLength: outLength,
    });
  }

  return corners;
}

/**
 * Detect all corners in a panel (outline + all holes)
 */
export function detectAllPanelCorners(
  outline: Point2D[],
  holes: Array<{ id: string; path: Point2D[] }>,
  config: CornerDetectionConfig
): AllCornerInfo[] {
  const corners: AllCornerInfo[] = [];

  // Detect outline corners
  const outlineCorners = detectCornersInPath(outline, 'outline', undefined, config);
  corners.push(...outlineCorners);

  // Detect hole corners
  for (const hole of holes) {
    const holeCorners = detectCornersInPath(hole.path, 'hole', hole.id, config);
    corners.push(...holeCorners);
  }

  return corners;
}

/**
 * Parse an AllCornerKey into its components
 */
export function parseAllCornerKey(key: AllCornerKey): {
  panelId: string;
  location: CornerLocation;
  holeId?: string;
  pathIndex: number;
} | null {
  const parts = key.split(':');

  if (parts.length < 3) return null;

  const panelId = parts[0];
  const location = parts[1] as CornerLocation;

  if (location === 'outline') {
    const pathIndex = parseInt(parts[2], 10);
    if (isNaN(pathIndex)) return null;
    return { panelId, location, pathIndex };
  } else if (location === 'hole') {
    if (parts.length < 4) return null;
    const holeId = parts[2];
    const pathIndex = parseInt(parts[3], 10);
    if (isNaN(pathIndex)) return null;
    return { panelId, location, holeId, pathIndex };
  }

  return null;
}

/**
 * Create an AllCornerKey from components
 */
export function makeAllCornerKey(
  panelId: string,
  location: CornerLocation,
  pathIndex: number,
  holeId?: string
): AllCornerKey {
  if (location === 'outline') {
    return `${panelId}:outline:${pathIndex}`;
  } else {
    if (!holeId) throw new Error('holeId required for hole corners');
    return `${panelId}:hole:${holeId}:${pathIndex}`;
  }
}

/**
 * Create an AllCornerId from components (without panel ID)
 */
export function makeAllCornerId(
  location: CornerLocation,
  pathIndex: number,
  holeId?: string
): AllCornerId {
  if (location === 'outline') {
    return `outline:${pathIndex}`;
  } else {
    if (!holeId) throw new Error('holeId required for hole corners');
    return `hole:${holeId}:${pathIndex}`;
  }
}

/**
 * Check if a corner is in a forbidden area (mechanical joints, slots, etc.)
 *
 * Forbidden areas include:
 * - Finger joint regions (edges with tabs/slots)
 * - Slot hole boundaries
 * - Areas within materialThickness of joint margins
 */
export interface ForbiddenArea {
  /** Type of forbidden area */
  type: 'finger-joint' | 'slot' | 'joint-margin';
  /** Bounding box of the forbidden area */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

/**
 * Check if a point is inside a forbidden area
 */
export function isInForbiddenArea(
  point: Point2D,
  forbiddenAreas: ForbiddenArea[],
  tolerance: number = 0.5
): { inForbidden: boolean; reason?: string } {
  for (const area of forbiddenAreas) {
    if (
      point.x >= area.bounds.minX - tolerance &&
      point.x <= area.bounds.maxX + tolerance &&
      point.y >= area.bounds.minY - tolerance &&
      point.y <= area.bounds.maxY + tolerance
    ) {
      return { inForbidden: true, reason: area.type };
    }
  }
  return { inForbidden: false };
}

/**
 * Compute eligibility for all corners in a panel
 */
export function computeAllCornerEligibility(
  corners: AllCornerInfo[],
  forbiddenAreas: ForbiddenArea[],
  config: CornerDetectionConfig
): AllCornerEligibility[] {
  const MIN_FILLET_RADIUS = 1; // mm

  return corners.map((corner): AllCornerEligibility => {
    // Check forbidden areas
    const forbiddenCheck = isInForbiddenArea(corner.position, forbiddenAreas);
    if (forbiddenCheck.inForbidden) {
      return {
        ...corner,
        eligible: false,
        reason: forbiddenCheck.reason === 'finger-joint'
          ? 'mechanical-joint'
          : 'forbidden-area',
        maxRadius: 0,
      };
    }

    // Calculate max radius based on geometry
    const maxRadius = calculateMaxFilletRadius(
      corner.incomingEdgeLength,
      corner.outgoingEdgeLength,
      corner.angle
    );

    // Check minimum radius
    if (maxRadius < MIN_FILLET_RADIUS) {
      return {
        ...corner,
        eligible: false,
        reason: 'too-small',
        maxRadius: 0,
      };
    }

    return {
      ...corner,
      eligible: true,
      maxRadius,
    };
  });
}

/**
 * Apply a fillet to a corner, returning the new points that replace the corner
 */
export function applyFilletToCorner(
  points: Point2D[],
  cornerIndex: number,
  radius: number,
  segments: number = 8
): Point2D[] {
  if (points.length < 3 || radius <= 0) {
    return [points[cornerIndex]];
  }

  const prevIdx = (cornerIndex - 1 + points.length) % points.length;
  const nextIdx = (cornerIndex + 1) % points.length;

  const prev = points[prevIdx];
  const corner = points[cornerIndex];
  const next = points[nextIdx];

  // Calculate vectors from corner to adjacent points
  const toPrev = { x: prev.x - corner.x, y: prev.y - corner.y };
  const toNext = { x: next.x - corner.x, y: next.y - corner.y };

  // Normalize vectors
  const lenPrev = Math.sqrt(toPrev.x * toPrev.x + toPrev.y * toPrev.y);
  const lenNext = Math.sqrt(toNext.x * toNext.x + toNext.y * toNext.y);

  if (lenPrev < 0.001 || lenNext < 0.001) {
    return [corner];
  }

  const normPrev = { x: toPrev.x / lenPrev, y: toPrev.y / lenPrev };
  const normNext = { x: toNext.x / lenNext, y: toNext.y / lenNext };

  // Clamp radius to available edge lengths
  const effectiveRadius = Math.min(radius, lenPrev * 0.8, lenNext * 0.8);
  if (effectiveRadius < 0.5) {
    return [corner];
  }

  // Calculate arc start and end points
  const arcStart: Point2D = {
    x: corner.x + normPrev.x * effectiveRadius,
    y: corner.y + normPrev.y * effectiveRadius,
  };
  const arcEnd: Point2D = {
    x: corner.x + normNext.x * effectiveRadius,
    y: corner.y + normNext.y * effectiveRadius,
  };

  // Calculate arc center
  const midX = (arcStart.x + arcEnd.x) / 2;
  const midY = (arcStart.y + arcEnd.y) / 2;

  const toMid = { x: midX - corner.x, y: midY - corner.y };
  const lenToMid = Math.sqrt(toMid.x * toMid.x + toMid.y * toMid.y);

  if (lenToMid < 0.001) {
    return [arcStart, arcEnd];
  }

  const normToMid = { x: toMid.x / lenToMid, y: toMid.y / lenToMid };

  // Calculate chord length and center distance
  const chordLen = Math.sqrt(
    (arcEnd.x - arcStart.x) ** 2 + (arcEnd.y - arcStart.y) ** 2
  );
  const halfChord = chordLen / 2;
  const centerToChordDist = Math.sqrt(
    Math.max(0, effectiveRadius * effectiveRadius - halfChord * halfChord)
  );

  const centerDist = lenToMid + centerToChordDist;
  const center: Point2D = {
    x: corner.x + normToMid.x * centerDist,
    y: corner.y + normToMid.y * centerDist,
  };

  // Calculate start and end angles
  const startAngle = Math.atan2(arcStart.y - center.y, arcStart.x - center.x);
  const endAngle = Math.atan2(arcEnd.y - center.y, arcEnd.x - center.x);

  // Determine arc direction (shorter arc)
  let angleDiff = endAngle - startAngle;
  while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
  while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

  // Generate arc points
  const arcPoints: Point2D[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = startAngle + angleDiff * t;
    arcPoints.push({
      x: center.x + effectiveRadius * Math.cos(angle),
      y: center.y + effectiveRadius * Math.sin(angle),
    });
  }

  return arcPoints;
}
