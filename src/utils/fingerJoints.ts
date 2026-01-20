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
}

export const generateFingerJointPath = (
  start: Point,
  end: Point,
  config: FingerJointConfig
): Point[] => {
  const { edgeLength, fingerWidth, materialThickness, isTabOut, kerf } = config;

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length < 0.001) return [start, end];

  const unitX = dx / length;
  const unitY = dy / length;

  // Perpendicular direction depends on coordinate system
  // For Y-down (SVG): perpendicular to the left = (unitY, -unitX) points outward
  // For Y-up (Three.js): perpendicular to the right = (-unitY, unitX) points outward
  const perpX = config.yUp ? -unitY : unitY;
  const perpY = config.yUp ? unitX : -unitX;

  // Corner gap to keep fingers away from corners - 1.5x finger width on each end
  const cornerGap = fingerWidth * 1.5;
  const usableLength = edgeLength - (cornerGap * 2);

  // If usable length is too small, just return a straight edge
  if (usableLength < fingerWidth) {
    return [start, end];
  }

  // Calculate number of fingers - ensure at least 1 and use odd number for symmetry
  let numFingers = Math.max(1, Math.floor(usableLength / fingerWidth));
  // Make it odd so we start and end with the same type
  if (numFingers % 2 === 0) numFingers++;

  const actualFingerWidth = usableLength / numFingers;

  // Tab depth should be exactly material thickness (kerf is for cutting compensation)
  const depth = materialThickness;

  const points: Point[] = [start];

  // Add straight segment at start (corner gap)
  const cornerGapEndPt: Point = {
    x: start.x + unitX * cornerGap,
    y: start.y + unitY * cornerGap,
  };
  points.push(cornerGapEndPt);

  for (let i = 0; i < numFingers; i++) {
    // Even positions (0, 2, 4...) are where tabs/slots go
    // Odd positions (1, 3, 5...) are straight on both faces
    const isEvenPosition = i % 2 === 0;
    const fingerStart = cornerGap + i * actualFingerWidth;
    const fingerEnd = cornerGap + (i + 1) * actualFingerWidth;

    const startPt: Point = {
      x: start.x + unitX * fingerStart,
      y: start.y + unitY * fingerStart,
    };

    const endPt: Point = {
      x: start.x + unitX * fingerEnd,
      y: start.y + unitY * fingerEnd,
    };

    if (isEvenPosition && isTabOut) {
      // This face has tabs OUT at even positions
      // Adjacent face will have slots IN at these same positions
      points.push({
        x: startPt.x + perpX * depth,
        y: startPt.y + perpY * depth,
      });
      points.push({
        x: endPt.x + perpX * depth,
        y: endPt.y + perpY * depth,
      });
      points.push(endPt);
    } else if (isEvenPosition && !isTabOut) {
      // This face has slots IN at even positions
      // To receive tabs from adjacent face at these same positions
      points.push({
        x: startPt.x - perpX * depth,
        y: startPt.y - perpY * depth,
      });
      points.push({
        x: endPt.x - perpX * depth,
        y: endPt.y - perpY * depth,
      });
      points.push(endPt);
    } else {
      // Odd positions are straight - these interlock with adjacent face
      points.push(endPt);
    }
  }

  // The end point is already added as part of the last finger iteration
  // Just need to ensure we end at the actual end point
  // Remove the last point if it's not already at the end, and add end
  if (points[points.length - 1].x !== end.x || points[points.length - 1].y !== end.y) {
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
