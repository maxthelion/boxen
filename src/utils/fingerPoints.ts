/**
 * Finger Point Calculator
 *
 * Calculates finger joint transition points at the assembly level.
 * All edges parallel to an axis share the same finger points, guaranteeing alignment.
 */

import {
  AxisFingerPoints,
  AssemblyFingerData,
  FingerPointConfig,
  BoxConfig,
  getAxisDimension,
} from '../types';

/**
 * Calculate finger points for a single axis.
 *
 * @param axisLength - The dimension along this axis (width, height, or depth)
 * @param config - Finger point configuration
 * @returns Finger points for this axis
 */
export const calculateAxisFingerPoints = (
  axis: 'x' | 'y' | 'z',
  axisLength: number,
  config: FingerPointConfig
): AxisFingerPoints => {
  const { materialThickness, fingerLength, minDistance } = config;

  // Maximum joint length accounts for perpendicular panels at each end
  const maxJointLength = axisLength - (2 * materialThickness);

  // If maxJointLength is too small, return empty points (straight edge)
  if (maxJointLength <= 0) {
    return {
      axis,
      points: [],
      innerOffset: 0,
      fingerLength: 0,
      maxJointLength: 0,
    };
  }

  // Usable length after reserving minimum gap at both ends
  const usableLength = maxJointLength - (2 * minDistance);

  // If usable length is too small for even one finger, return empty
  if (usableLength < fingerLength) {
    return {
      axis,
      points: [],
      innerOffset: minDistance,
      fingerLength: 0,
      maxJointLength,
    };
  }

  // Calculate how many sections fit
  let numSections = Math.floor(usableLength / fingerLength);

  // Ensure odd number of sections for symmetry (OUT-IN-OUT pattern)
  if (numSections % 2 === 0) {
    numSections = numSections - 1;
  }

  // Ensure at least 1 section
  if (numSections < 1) {
    numSections = 1;
  }

  // Calculate actual finger length to use (may be slightly larger than config)
  const actualFingerLength = usableLength / numSections;

  // Calculate remainder and distribute to both ends
  // Note: With the adjusted fingerLength, there's no remainder,
  // but we keep innerOffset as the base minDistance
  const innerOffset = minDistance;

  // Generate transition points
  // Points mark transitions between finger (OUT) and hole (IN) states
  // Pattern: [gap] OUT [point] IN [point] OUT [point] IN [point] OUT [gap]
  const points: number[] = [];
  for (let i = 1; i < numSections; i++) {
    // Each point is at innerOffset + i * actualFingerLength
    points.push(innerOffset + (i * actualFingerLength));
  }

  return {
    axis,
    points,
    innerOffset,
    fingerLength: actualFingerLength,
    maxJointLength,
  };
};

/**
 * Calculate finger points for all 3 axes of an assembly.
 *
 * @param boxConfig - The box configuration
 * @returns Finger data for all axes
 */
export const calculateAssemblyFingerPoints = (
  boxConfig: BoxConfig
): AssemblyFingerData => {
  const config: FingerPointConfig = {
    materialThickness: boxConfig.materialThickness,
    fingerLength: boxConfig.fingerWidth,
    // Convert fingerGap (multiplier) to minDistance (absolute)
    minDistance: boxConfig.fingerGap * boxConfig.fingerWidth,
  };

  return {
    x: calculateAxisFingerPoints('x', boxConfig.width, config),
    y: calculateAxisFingerPoints('y', boxConfig.height, config),
    z: calculateAxisFingerPoints('z', boxConfig.depth, config),
  };
};

/**
 * Calculate finger points for a sub-assembly based on its bounds.
 *
 * @param bounds - The sub-assembly bounding box
 * @param materialThickness - Material thickness
 * @param fingerWidth - Target finger width
 * @param fingerGap - Corner gap multiplier
 * @returns Finger data for all axes
 */
export const calculateSubAssemblyFingerPoints = (
  bounds: { w: number; h: number; d: number },
  materialThickness: number,
  fingerWidth: number,
  fingerGap: number
): AssemblyFingerData => {
  const config: FingerPointConfig = {
    materialThickness,
    fingerLength: fingerWidth,
    minDistance: fingerGap * fingerWidth,
  };

  return {
    x: calculateAxisFingerPoints('x', bounds.w, config),
    y: calculateAxisFingerPoints('y', bounds.h, config),
    z: calculateAxisFingerPoints('z', bounds.d, config),
  };
};

/**
 * Get finger points that fall within a given range.
 * Used for inset panels where only part of the joint is valid.
 *
 * @param axisPoints - The full axis finger points
 * @param startPos - Start position along axis (relative to MT-inset edge)
 * @param endPos - End position along axis
 * @returns Filtered array of finger points within range
 */
export const getFingerPointsInRange = (
  axisPoints: AxisFingerPoints,
  startPos: number,
  endPos: number
): number[] => {
  // Filter points to those within the range
  return axisPoints.points.filter(p => p >= startPos && p <= endPos);
};

/**
 * Determine if the first section at a position is a finger (OUT) or hole (IN).
 *
 * The pattern always starts with OUT (finger) at the beginning of the joint.
 * - Position < first point: OUT
 * - Between points: alternates IN, OUT, IN, OUT, ...
 * - Position > last point: OUT (if odd number of transitions)
 *
 * @param position - Position along the axis to check
 * @param axisPoints - The axis finger points
 * @returns 'finger' or 'hole'
 */
export const getSectionTypeAtPosition = (
  position: number,
  axisPoints: AxisFingerPoints
): 'finger' | 'hole' => {
  const { points, innerOffset } = axisPoints;

  // Before the first transition, it's always a finger
  if (points.length === 0 || position < points[0]) {
    return 'finger';
  }

  // Count how many transition points we've passed
  let transitionsPassed = 0;
  for (const p of points) {
    if (position >= p) {
      transitionsPassed++;
    } else {
      break;
    }
  }

  // Even number of transitions passed = finger, odd = hole
  return transitionsPassed % 2 === 0 ? 'finger' : 'hole';
};

/**
 * Generate extended finger points beyond the bounding box.
 * Used when panels extend past the normal assembly boundary.
 *
 * @param axisPoints - The base axis finger points
 * @param extensionAmount - How far beyond maxJointLength to extend
 * @returns Array of additional finger points beyond the normal range
 */
export const generateExtendedFingerPoints = (
  axisPoints: AxisFingerPoints,
  extensionAmount: number
): number[] => {
  if (extensionAmount <= 0 || axisPoints.fingerLength <= 0) {
    return [];
  }

  const { maxJointLength, innerOffset, fingerLength, points } = axisPoints;

  // The last normal section ends at maxJointLength - innerOffset
  // Continue the pattern beyond that
  const extendedPoints: number[] = [];

  // Determine where the pattern would continue from
  // The pattern continues at fingerLength intervals
  const lastNormalPosition = maxJointLength - innerOffset;
  let nextPosition = lastNormalPosition + fingerLength;

  // Determine if the next point should maintain the alternating pattern
  // At maxJointLength - innerOffset, we're at the end of the last finger section
  // So the next transition would be to a hole, then finger, etc.

  while (nextPosition <= maxJointLength + extensionAmount) {
    extendedPoints.push(nextPosition);
    nextPosition += fingerLength;
  }

  return extendedPoints;
};
