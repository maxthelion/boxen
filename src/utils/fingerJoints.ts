export interface Point {
  x: number;
  y: number;
}

/**
 * Compute edge direction vectors from start to end points.
 * Returns null if the edge has negligible length.
 */
const computeEdgeDirection = (
  start: Point,
  end: Point
): { unitX: number; unitY: number; actualLength: number } | null => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const actualLength = Math.sqrt(dx * dx + dy * dy);

  if (actualLength < 0.001) return null;

  const unitX = dx / actualLength;
  const unitY = dy / actualLength;

  return { unitX, unitY, actualLength };
};

export interface FingerJointConfig {
  edgeLength: number;
  fingerWidth: number;
  materialThickness: number;
  isTabOut: boolean;
  kerf: number;
  yUp?: boolean;  // If true, use Y-up coordinate system (Three.js), otherwise Y-down (SVG)
  cornerGapMultiplier?: number;  // Gap at corners as multiplier of fingerWidth (default: 1.5)
  // Asymmetric corner gaps - add extra gap when perpendicular edge doesn't have tabs
  // (panel extends to box edge and contains the anchor sphere)
  startCornerExtra?: number;  // Extra gap at start (in mm, added to base corner gap)
  endCornerExtra?: number;    // Extra gap at end (in mm, added to base corner gap)
  // For anchored generation: generate pattern based on originalLength with offset
  originalLength?: number;  // The "base" length for finger pattern calculation (before extensions)
  patternOffset?: number;   // Offset into the pattern (positive = start has moved inward/shrunk)
  // Invert perpendicular direction without changing tab/slot positions
  // Used when generating patterns from canonical direction for reversed edges
  invertPerpendicular?: boolean;
}

export const generateFingerJointPath = (
  start: Point,
  end: Point,
  config: FingerJointConfig
): Point[] => {
  const { fingerWidth, materialThickness, isTabOut } = config;

  const direction = computeEdgeDirection(start, end);
  if (!direction) return [start, end];

  const { unitX, unitY, actualLength } = direction;

  // Perpendicular direction depends on coordinate system
  // invertPerpendicular flips the direction for canonical direction generation
  const perpSign = config.invertPerpendicular ? -1 : 1;
  const perpX = perpSign * (config.yUp ? -unitY : unitY);
  const perpY = perpSign * (config.yUp ? unitX : -unitX);

  // Use originalLength for pattern calculation if provided
  const patternLength = config.originalLength ?? config.edgeLength;

  // Pattern offset: how much the start has moved inward (shrunk)
  // Positive offset means the start moved toward the end (shrinking from start)
  const patternOffset = config.patternOffset ?? 0;

  // Corner gap to keep fingers away from corners
  // Asymmetric gaps: add extra when perpendicular edge doesn't have tabs
  // (panel extends to box edge and contains the anchor sphere)
  const gapMultiplier = config.cornerGapMultiplier ?? 1.5;
  const baseCornerGap = fingerWidth * gapMultiplier;
  const startCornerGap = baseCornerGap + (config.startCornerExtra ?? 0);
  const endCornerGap = baseCornerGap + (config.endCornerExtra ?? 0);
  const usableLength = patternLength - startCornerGap - endCornerGap;

  // If usable length is too small, just return a straight edge
  if (usableLength < fingerWidth) {
    return [start, end];
  }

  // Calculate number of fingers based on pattern length
  let numFingers = Math.max(1, Math.floor(usableLength / fingerWidth));
  if (numFingers % 2 === 0) numFingers++;

  const actualFingerWidth = usableLength / numFingers;
  const depth = materialThickness;

  // Helper to convert pattern position to actual position along the edge
  // patternPos is position in the original (non-offset) pattern
  // Returns position along the actual edge, or null if outside
  const patternToActual = (patternPos: number): number | null => {
    const actualPos = patternPos - patternOffset;
    if (actualPos < -0.001 || actualPos > actualLength + 0.001) return null;
    return Math.max(0, Math.min(actualLength, actualPos));
  };

  const points: Point[] = [];

  // Start point
  points.push(start);

  // Corner gap at start - only if visible after offset
  const cornerGapActual = patternToActual(startCornerGap);
  if (cornerGapActual !== null && cornerGapActual > 0.001) {
    points.push({
      x: start.x + unitX * cornerGapActual,
      y: start.y + unitY * cornerGapActual,
    });
  }

  // Generate fingers
  for (let i = 0; i < numFingers; i++) {
    const isEvenPosition = i % 2 === 0;
    const fingerStartPattern = startCornerGap + i * actualFingerWidth;
    const fingerEndPattern = startCornerGap + (i + 1) * actualFingerWidth;

    const fingerStartActual = patternToActual(fingerStartPattern);
    const fingerEndActual = patternToActual(fingerEndPattern);

    // Skip fingers entirely outside the actual edge
    if (fingerStartActual === null && fingerEndActual === null) continue;
    if (fingerEndPattern < patternOffset) continue;  // Entirely before actual start
    if (fingerStartPattern > patternOffset + actualLength) continue;  // Entirely after actual end

    // Clamp to actual edge bounds
    const clampedStart = fingerStartActual !== null ? fingerStartActual : 0;
    const clampedEnd = fingerEndActual !== null ? fingerEndActual : actualLength;

    if (isEvenPosition) {
      // Tab or slot position
      const offsetX = isTabOut ? perpX * depth : -perpX * depth;
      const offsetY = isTabOut ? perpY * depth : -perpY * depth;

      const fStartPt: Point = {
        x: start.x + unitX * clampedStart,
        y: start.y + unitY * clampedStart,
      };
      const fEndPt: Point = {
        x: start.x + unitX * clampedEnd,
        y: start.y + unitY * clampedEnd,
      };

      // Check if finger start is visible (not clipped)
      const startVisible = fingerStartActual !== null && fingerStartActual >= 0;
      // Check if finger end is visible (not clipped)
      const endVisible = fingerEndActual !== null && fingerEndActual <= actualLength;

      if (startVisible) {
        // Full finger start - step to the offset
        const lastPt = points[points.length - 1];
        if (Math.abs(fStartPt.x - lastPt.x) > 0.001 || Math.abs(fStartPt.y - lastPt.y) > 0.001) {
          points.push(fStartPt);
        }
        points.push({ x: fStartPt.x + offsetX, y: fStartPt.y + offsetY });
      } else {
        // Finger is clipped at start - start already at offset level
        points.push({ x: fStartPt.x + offsetX, y: fStartPt.y + offsetY });
      }

      if (endVisible) {
        // Full finger end - step back from offset
        points.push({ x: fEndPt.x + offsetX, y: fEndPt.y + offsetY });
        points.push(fEndPt);
      } else {
        // Finger is clipped at end - stay at offset level
        points.push({ x: fEndPt.x + offsetX, y: fEndPt.y + offsetY });
      }
    } else {
      // Straight section (odd position)
      const fEndPt: Point = {
        x: start.x + unitX * clampedEnd,
        y: start.y + unitY * clampedEnd,
      };
      const lastPt = points[points.length - 1];
      if (Math.abs(fEndPt.x - lastPt.x) > 0.001 || Math.abs(fEndPt.y - lastPt.y) > 0.001) {
        points.push(fEndPt);
      }
    }
  }

  // Corner gap at end - only if visible
  const endGapPattern = patternLength - endCornerGap;
  const endGapActual = patternToActual(endGapPattern);
  if (endGapActual !== null && endGapActual < actualLength - 0.001) {
    const lastPt = points[points.length - 1];
    const gapPt = {
      x: start.x + unitX * endGapActual,
      y: start.y + unitY * endGapActual,
    };
    if (Math.abs(gapPt.x - lastPt.x) > 0.001 || Math.abs(gapPt.y - lastPt.y) > 0.001) {
      points.push(gapPt);
    }
  }

  // End point
  const lastPt = points[points.length - 1];
  if (Math.abs(end.x - lastPt.x) > 0.001 || Math.abs(end.y - lastPt.y) > 0.001) {
    points.push(end);
  }

  return points;
};

export const generateStraightEdge = (start: Point, end: Point): Point[] => {
  return [start, end];
};

export type EdgeType = 'finger-out' | 'finger-in' | 'straight';

export const getEdgePath = (
  start: Point,
  end: Point,
  edgeType: EdgeType,
  config: Omit<FingerJointConfig, 'isTabOut'>
): Point[] => {
  const edgeLength = Math.sqrt(
    Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
  );

  switch (edgeType) {
    case 'finger-out':
      return generateFingerJointPath(start, end, {
        ...config,
        edgeLength,
        isTabOut: true,
      });
    case 'finger-in':
      return generateFingerJointPath(start, end, {
        ...config,
        edgeLength,
        isTabOut: false,
      });
    case 'straight':
    default:
      return generateStraightEdge(start, end);
  }
};

// =============================================================================
// V2: Assembly-level finger point based path generation
// =============================================================================

import { AxisFingerPoints, JointGender } from '../types';
import { debug, enableDebugTag } from './debug';

enableDebugTag('finger-blocking');

export interface FingerJointConfigV2 {
  fingerPoints: AxisFingerPoints;   // Pre-calculated finger points for this axis
  gender: JointGender;              // 'male' (tabs out) or 'female' (slots in)
  materialThickness: number;
  edgeStartPos: number;             // Start position of this edge along the axis
  edgeEndPos: number;               // End position of this edge along the axis
  yUp?: boolean;                    // Coordinate system (default: true for Three.js)
  outwardDirection?: Point;         // Explicit outward direction for tabs (normalized vector)
  fingerBlockingRanges?: { start: number; end: number }[];  // Axis positions where fingers should be skipped (e.g., cross-lap positions)
}

/**
 * Generate finger joint path using pre-calculated assembly finger points.
 *
 * This is the V2 implementation that uses centralized finger point data
 * to ensure all parallel edges have aligned finger positions.
 *
 * @param start - Start point of the edge in 2D panel coordinates
 * @param end - End point of the edge in 2D panel coordinates
 * @param config - Configuration with pre-calculated finger points
 * @returns Array of points forming the finger joint path
 */
export const generateFingerJointPathV2 = (
  start: Point,
  end: Point,
  config: FingerJointConfigV2
): Point[] => {
  const { fingerPoints, gender, materialThickness } = config;
  const { points: transitionPoints, innerOffset, fingerLength, maxJointLength } = fingerPoints;

  const direction = computeEdgeDirection(start, end);
  if (!direction) return [start, end];

  const { unitX, unitY, actualLength } = direction;

  // Perpendicular direction (for tab/slot depth)
  // If outwardDirection is provided, use it; otherwise compute from edge direction
  let perpX: number;
  let perpY: number;

  if (config.outwardDirection) {
    // Use explicit outward direction
    perpX = config.outwardDirection.x;
    perpY = config.outwardDirection.y;
  } else {
    // Compute from edge direction (default behavior)
    const yUp = config.yUp ?? true;
    perpX = yUp ? -unitY : unitY;
    perpY = yUp ? unitX : -unitX;
  }

  // Tab depth direction based on gender
  // Male (tabs out): positive offset (tabs extend outward)
  // Female (slots in): negative offset (slots go inward)
  const depth = materialThickness;
  const depthSign = gender === 'male' ? 1 : -1;

  // If no finger points, return straight edge
  if (transitionPoints.length === 0 || fingerLength <= 0) {
    return [start, end];
  }

  // Map edge positions to axis positions
  // edgeStartPos/edgeEndPos are positions along the axis
  // We need to map axis positions to positions along this edge
  const { edgeStartPos, edgeEndPos } = config;
  const edgeAxisLength = Math.abs(edgeEndPos - edgeStartPos);

  // Direction: is edgeEndPos > edgeStartPos (positive direction)?
  const isPositiveDirection = edgeEndPos > edgeStartPos;

  // Helper: Convert axis position to edge position (0 to actualLength)
  const axisToEdge = (axisPos: number): number => {
    if (isPositiveDirection) {
      return ((axisPos - edgeStartPos) / edgeAxisLength) * actualLength;
    } else {
      return ((edgeStartPos - axisPos) / edgeAxisLength) * actualLength;
    }
  };

  // Helper: Get point at edge position
  const pointAtEdge = (edgePos: number, offset: number = 0): Point => {
    const clampedPos = Math.max(0, Math.min(actualLength, edgePos));
    return {
      x: start.x + unitX * clampedPos + perpX * offset,
      y: start.y + unitY * clampedPos + perpY * offset,
    };
  };

  // Filter transition points to those within this edge's range
  const minAxisPos = Math.min(edgeStartPos, edgeEndPos);
  const maxAxisPos = Math.max(edgeStartPos, edgeEndPos);

  // Calculate the finger region boundaries (innerOffset gaps at both ends)
  const fingerRegionStart = innerOffset;
  const fingerRegionEnd = maxJointLength - innerOffset;

  // Build all section boundaries in axis coordinates
  // Sections alternate: finger (0), hole (1), finger (2), etc.
  const allBoundaries = [fingerRegionStart, ...transitionPoints, fingerRegionEnd];

  // Define sections with their axis positions and finger status
  interface Section {
    startAxis: number;
    endAxis: number;
    isFinger: boolean;
  }

  const allSections: Section[] = [];
  for (let i = 0; i < allBoundaries.length - 1; i++) {
    allSections.push({
      startAxis: allBoundaries[i],
      endAxis: allBoundaries[i + 1],
      isFinger: i % 2 === 0,  // Even indices are finger sections
    });
  }

  // Filter to sections that are COMPLETELY within the edge's axis range
  // Partial fingers are not allowed - skip sections that extend beyond the edge
  const blockingRanges = config.fingerBlockingRanges || [];

  if (blockingRanges.length > 0) {
    debug('finger-blocking', `V2 finger generation with blockingRanges: ${blockingRanges.map(r => `[${r.start.toFixed(1)}, ${r.end.toFixed(1)}]`).join(', ')}`);
    debug('finger-blocking', `  edgeStartPos=${edgeStartPos.toFixed(1)}, edgeEndPos=${edgeEndPos.toFixed(1)}, minAxis=${minAxisPos.toFixed(1)}, maxAxis=${maxAxisPos.toFixed(1)}`);
  }

  const validSections = allSections.filter(section => {
    // Check basic edge range
    if (section.startAxis < minAxisPos || section.endAxis > maxAxisPos) {
      return false;
    }

    // For finger sections, also check blocking ranges (e.g., cross-lap positions)
    if (section.isFinger && blockingRanges.length > 0) {
      const isBlocked = blockingRanges.some(range =>
        section.startAxis < range.end && section.endAxis > range.start
      );
      if (isBlocked) {
        debug('finger-blocking', `  BLOCKED finger section [${section.startAxis.toFixed(1)}, ${section.endAxis.toFixed(1)}]`);
        return false;
      }
    }

    return true;
  });

  // If no valid sections, return straight edge
  const hasFingerSections = validSections.some(s => s.isFinger);
  if (!hasFingerSections) {
    return [start, end];
  }

  // Build the path
  const pathPoints: Point[] = [];

  // Start point
  pathPoints.push(start);

  // Sort valid sections by edge position for proper path generation
  const sortedSections = validSections
    .map(section => ({
      ...section,
      startEdge: axisToEdge(section.startAxis),
      endEdge: axisToEdge(section.endAxis),
    }))
    .sort((a, b) => Math.min(a.startEdge, a.endEdge) - Math.min(b.startEdge, b.endEdge));

  // Track where we need to draw
  let currentEdgePos = 0;

  for (const section of sortedSections) {
    // Get edge positions (handle reversed edges)
    const sectionStartEdge = Math.min(section.startEdge, section.endEdge);
    const sectionEndEdge = Math.max(section.startEdge, section.endEdge);

    // Skip sections with negligible length
    if (sectionEndEdge - sectionStartEdge < 0.001) continue;

    // Add straight segment from current position to section start if needed
    if (sectionStartEdge > currentEdgePos + 0.001) {
      pathPoints.push(pointAtEdge(sectionStartEdge));
    }

    if (section.isFinger) {
      // Finger section: generate tab (male) or slot (female)
      pathPoints.push(pointAtEdge(sectionStartEdge, depth * depthSign));
      pathPoints.push(pointAtEdge(sectionEndEdge, depth * depthSign));
      pathPoints.push(pointAtEdge(sectionEndEdge));
    } else {
      // Hole section: straight line
      const endPt = pointAtEdge(sectionEndEdge);
      const lastPt = pathPoints[pathPoints.length - 1];
      if (Math.abs(endPt.x - lastPt.x) > 0.001 || Math.abs(endPt.y - lastPt.y) > 0.001) {
        pathPoints.push(endPt);
      }
    }

    currentEdgePos = sectionEndEdge;
  }

  // Ensure we end at the end point
  const lastPt = pathPoints[pathPoints.length - 1];
  if (Math.abs(end.x - lastPt.x) > 0.001 || Math.abs(end.y - lastPt.y) > 0.001) {
    pathPoints.push(end);
  }

  // Remove duplicate consecutive points
  const cleanedPoints: Point[] = [pathPoints[0]];
  for (let i = 1; i < pathPoints.length; i++) {
    const prev = cleanedPoints[cleanedPoints.length - 1];
    const curr = pathPoints[i];
    if (Math.abs(curr.x - prev.x) > 0.001 || Math.abs(curr.y - prev.y) > 0.001) {
      cleanedPoints.push(curr);
    }
  }

  return cleanedPoints;
};
