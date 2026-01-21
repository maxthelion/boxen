export interface Point {
  x: number;
  y: number;
}

export interface FingerJointConfig {
  edgeLength: number;
  fingerWidth: number;
  materialThickness: number;
  isTabOut: boolean;
  kerf: number;
  yUp?: boolean;  // If true, use Y-up coordinate system (Three.js), otherwise Y-down (SVG)
  cornerGapMultiplier?: number;  // Gap at corners as multiplier of fingerWidth (default: 1.5)
  // For anchored generation: generate pattern based on originalLength with offset
  originalLength?: number;  // The "base" length for finger pattern calculation (before extensions)
  patternOffset?: number;   // Offset into the pattern (positive = start has moved inward/shrunk)
}

export const generateFingerJointPath = (
  start: Point,
  end: Point,
  config: FingerJointConfig
): Point[] => {
  const { fingerWidth, materialThickness, isTabOut } = config;

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const actualLength = Math.sqrt(dx * dx + dy * dy);

  if (actualLength < 0.001) return [start, end];

  const unitX = dx / actualLength;
  const unitY = dy / actualLength;

  // Perpendicular direction depends on coordinate system
  const perpX = config.yUp ? -unitY : unitY;
  const perpY = config.yUp ? unitX : -unitX;

  // Use originalLength for pattern calculation if provided
  const patternLength = config.originalLength ?? config.edgeLength;

  // Pattern offset: how much the start has moved inward (shrunk)
  // Positive offset means the start moved toward the end (shrinking from start)
  const patternOffset = config.patternOffset ?? 0;

  // Corner gap to keep fingers away from corners
  const gapMultiplier = config.cornerGapMultiplier ?? 1.5;
  const cornerGap = fingerWidth * gapMultiplier;
  const usableLength = patternLength - (cornerGap * 2);

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
  const cornerGapActual = patternToActual(cornerGap);
  if (cornerGapActual !== null && cornerGapActual > 0.001) {
    points.push({
      x: start.x + unitX * cornerGapActual,
      y: start.y + unitY * cornerGapActual,
    });
  }

  // Generate fingers
  for (let i = 0; i < numFingers; i++) {
    const isEvenPosition = i % 2 === 0;
    const fingerStartPattern = cornerGap + i * actualFingerWidth;
    const fingerEndPattern = cornerGap + (i + 1) * actualFingerWidth;

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
  const endGapPattern = patternLength - cornerGap;
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
