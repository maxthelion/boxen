/**
 * Corner finishing utilities - chamfers and fillets
 */

import { PathPoint, CornerFinish, CornerFinishType } from '../types';

export type { CornerFinishType, CornerFinish };

export interface DetectedCorner {
  id: string;
  index: number;  // Index in the points array
  position: { x: number; y: number };
  angle: number;  // Interior angle in radians
  eligible: boolean;
  maxRadius: number;
  incomingEdgeLength: number;
  outgoingEdgeLength: number;
}

/**
 * Calculate the angle between two vectors
 */
const angleBetweenVectors = (
  v1: { x: number; y: number },
  v2: { x: number; y: number }
): number => {
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

  if (mag1 === 0 || mag2 === 0) return 0;

  const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return Math.acos(cosAngle);
};

/**
 * Calculate normalized edge vectors and clamped radius for corner operations.
 * Used by both applyChamfer and applyFillet.
 *
 * @returns null if either edge has zero length, otherwise the computed vectors and radius
 */
const computeCornerVectors = (
  corner: PathPoint,
  prevPoint: PathPoint,
  nextPoint: PathPoint,
  radius: number
): {
  inNorm: { x: number; y: number };
  outNorm: { x: number; y: number };
  clampedRadius: number;
} | null => {
  // Direction vectors
  const inVec = { x: corner.x - prevPoint.x, y: corner.y - prevPoint.y };
  const outVec = { x: nextPoint.x - corner.x, y: nextPoint.y - corner.y };

  // Calculate lengths
  const inLen = Math.sqrt(inVec.x * inVec.x + inVec.y * inVec.y);
  const outLen = Math.sqrt(outVec.x * outVec.x + outVec.y * outVec.y);

  if (inLen === 0 || outLen === 0) return null;

  // Normalize
  const inNorm = { x: inVec.x / inLen, y: inVec.y / inLen };
  const outNorm = { x: outVec.x / outLen, y: outVec.y / outLen };

  // Clamp radius to not exceed half of either edge
  const clampedRadius = Math.min(radius, inLen * 0.5, outLen * 0.5);

  return { inNorm, outNorm, clampedRadius };
};

/**
 * Detect corners in a panel outline
 *
 * A corner is any vertex where the angle changes significantly (not straight)
 */
export const detectCorners = (
  points: PathPoint[],
  panelWidth: number,
  panelHeight: number,
  materialThickness: number
): DetectedCorner[] => {
  if (points.length < 3) return [];

  const corners: DetectedCorner[] = [];
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  // Threshold for corner detection (degrees from straight = 180)
  const angleThreshold = Math.PI * 0.9; // About 162 degrees

  for (let i = 0; i < points.length; i++) {
    const prevIdx = (i - 1 + points.length) % points.length;
    const nextIdx = (i + 1) % points.length;

    const prev = points[prevIdx];
    const curr = points[i];
    const next = points[nextIdx];

    // Vectors for incoming and outgoing edges
    const inVec = { x: curr.x - prev.x, y: curr.y - prev.y };
    const outVec = { x: next.x - curr.x, y: next.y - curr.y };

    // Edge lengths
    const inLength = Math.sqrt(inVec.x * inVec.x + inVec.y * inVec.y);
    const outLength = Math.sqrt(outVec.x * outVec.x + outVec.y * outVec.y);

    // Skip very short edges (likely part of finger joints)
    if (inLength < materialThickness * 0.5 || outLength < materialThickness * 0.5) {
      continue;
    }

    // Calculate interior angle
    const angle = angleBetweenVectors(inVec, outVec);

    // Only detect corners where angle is less than threshold (not nearly straight)
    if (angle > angleThreshold) continue;

    // Check if this corner is at the panel boundary (eligible for finishing)
    const atEdge = (
      Math.abs(curr.x - halfW) < 1 ||
      Math.abs(curr.x + halfW) < 1 ||
      Math.abs(curr.y - halfH) < 1 ||
      Math.abs(curr.y + halfH) < 1
    );

    // Check if this is an outer corner (not part of finger joint pattern)
    // Outer corners typically have both adjacent edges going in different primary directions
    const isOuterCorner = atEdge && inLength > materialThickness && outLength > materialThickness;

    // Maximum radius is limited by the shorter of the two adjacent edges
    const maxRadius = Math.min(inLength, outLength) * 0.4; // 40% of shorter edge

    // Corner is eligible if it's at the panel boundary and not too small
    const eligible = isOuterCorner && maxRadius >= 1;

    corners.push({
      id: `corner-${i}`,
      index: i,
      position: { x: curr.x, y: curr.y },
      angle,
      eligible,
      maxRadius,
      incomingEdgeLength: inLength,
      outgoingEdgeLength: outLength,
    });
  }

  return corners;
};

/**
 * Detect only the 4 main panel corners (simplified version)
 */
export const detectMainCorners = (
  panelWidth: number,
  panelHeight: number,
  materialThickness: number
): DetectedCorner[] => {
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  // Default max radius based on material thickness
  const defaultMaxRadius = Math.min(halfW, halfH) * 0.3;

  return [
    {
      id: 'corner-tl',
      index: -1,
      position: { x: -halfW, y: halfH },
      angle: Math.PI / 2,
      eligible: true,
      maxRadius: defaultMaxRadius,
      incomingEdgeLength: panelWidth,
      outgoingEdgeLength: panelHeight,
    },
    {
      id: 'corner-tr',
      index: -1,
      position: { x: halfW, y: halfH },
      angle: Math.PI / 2,
      eligible: true,
      maxRadius: defaultMaxRadius,
      incomingEdgeLength: panelHeight,
      outgoingEdgeLength: panelWidth,
    },
    {
      id: 'corner-br',
      index: -1,
      position: { x: halfW, y: -halfH },
      angle: Math.PI / 2,
      eligible: true,
      maxRadius: defaultMaxRadius,
      incomingEdgeLength: panelWidth,
      outgoingEdgeLength: panelHeight,
    },
    {
      id: 'corner-bl',
      index: -1,
      position: { x: -halfW, y: -halfH },
      angle: Math.PI / 2,
      eligible: true,
      maxRadius: defaultMaxRadius,
      incomingEdgeLength: panelHeight,
      outgoingEdgeLength: panelWidth,
    },
  ];
};

/**
 * Apply a chamfer to a corner
 *
 * Replaces the corner point with two points creating a 45-degree cut
 */
export const applyChamfer = (
  corner: PathPoint,
  prevPoint: PathPoint,
  nextPoint: PathPoint,
  radius: number
): PathPoint[] => {
  const vectors = computeCornerVectors(corner, prevPoint, nextPoint, radius);
  if (!vectors) return [corner];

  const { inNorm, outNorm, clampedRadius } = vectors;

  // Calculate the two chamfer points
  const p1: PathPoint = {
    x: corner.x - inNorm.x * clampedRadius,
    y: corner.y - inNorm.y * clampedRadius,
  };

  const p2: PathPoint = {
    x: corner.x + outNorm.x * clampedRadius,
    y: corner.y + outNorm.y * clampedRadius,
  };

  return [p1, p2];
};

/**
 * Apply a fillet (rounded corner) to a corner
 *
 * Replaces the corner point with an arc approximation
 */
export const applyFillet = (
  corner: PathPoint,
  prevPoint: PathPoint,
  nextPoint: PathPoint,
  radius: number,
  segments: number = 8
): PathPoint[] => {
  const vectors = computeCornerVectors(corner, prevPoint, nextPoint, radius);
  if (!vectors) return [corner];

  const { inNorm, outNorm, clampedRadius } = vectors;

  // Calculate the two tangent points (where the arc starts and ends)
  const startPoint: PathPoint = {
    x: corner.x - inNorm.x * clampedRadius,
    y: corner.y - inNorm.y * clampedRadius,
  };

  const endPoint: PathPoint = {
    x: corner.x + outNorm.x * clampedRadius,
    y: corner.y + outNorm.y * clampedRadius,
  };

  // Calculate the arc center
  // The center is at distance radius from both the start and end points
  // It's perpendicular to each edge at the tangent points

  // Perpendicular directions (inward toward center)
  const perpIn = { x: inNorm.y, y: -inNorm.x };
  const perpOut = { x: -outNorm.y, y: outNorm.x };

  // Cross product to determine which side the center is on
  const cross = inNorm.x * outNorm.y - inNorm.y * outNorm.x;

  // Adjust perpendicular based on corner direction (convex vs concave)
  const inwardPerpIn = cross > 0 ? perpIn : { x: -perpIn.x, y: -perpIn.y };
  const inwardPerpOut = cross > 0 ? perpOut : { x: -perpOut.x, y: -perpOut.y };

  // Calculate center (average of the two perpendicular approaches)
  const center: PathPoint = {
    x: (startPoint.x + inwardPerpIn.x * clampedRadius + endPoint.x + inwardPerpOut.x * clampedRadius) / 2,
    y: (startPoint.y + inwardPerpIn.y * clampedRadius + endPoint.y + inwardPerpOut.y * clampedRadius) / 2,
  };

  // Calculate start and end angles
  const startAngle = Math.atan2(startPoint.y - center.y, startPoint.x - center.x);
  const endAngle = Math.atan2(endPoint.y - center.y, endPoint.x - center.x);

  // Determine arc direction
  let angleDiff = endAngle - startAngle;
  if (cross > 0) {
    if (angleDiff > 0) angleDiff -= 2 * Math.PI;
  } else {
    if (angleDiff < 0) angleDiff += 2 * Math.PI;
  }

  // Generate arc points
  const points: PathPoint[] = [startPoint];

  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const angle = startAngle + angleDiff * t;
    points.push({
      x: center.x + Math.cos(angle) * clampedRadius,
      y: center.y + Math.sin(angle) * clampedRadius,
    });
  }

  points.push(endPoint);

  return points;
};

/**
 * Apply corner finishes to a panel outline
 */
export const applyCornerFinishes = (
  points: PathPoint[],
  finishes: CornerFinish[],
  corners: DetectedCorner[]
): PathPoint[] => {
  if (finishes.length === 0) return points;

  const result: PathPoint[] = [];
  const finishMap = new Map(finishes.map(f => [f.cornerId, f]));

  for (let i = 0; i < points.length; i++) {
    const corner = corners.find(c => c.index === i);
    const finish = corner ? finishMap.get(corner.id) : undefined;

    if (finish && finish.type !== 'none' && finish.radius > 0) {
      const prevIdx = (i - 1 + points.length) % points.length;
      const nextIdx = (i + 1) % points.length;

      const prevPoint = points[prevIdx];
      const currPoint = points[i];
      const nextPoint = points[nextIdx];

      if (finish.type === 'chamfer') {
        const chamferPoints = applyChamfer(currPoint, prevPoint, nextPoint, finish.radius);
        result.push(...chamferPoints);
      } else if (finish.type === 'fillet') {
        const filletPoints = applyFillet(currPoint, prevPoint, nextPoint, finish.radius);
        result.push(...filletPoints);
      }
    } else {
      result.push(points[i]);
    }
  }

  return result;
};
