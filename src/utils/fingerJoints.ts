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

  // Perpendicular pointing outward (for clockwise winding in SVG)
  // For SVG with Y-down, perpendicular to the left of direction is outward
  const perpX = unitY;
  const perpY = -unitX;

  // Calculate number of fingers - ensure at least 1 and use odd number for symmetry
  let numFingers = Math.max(1, Math.floor(edgeLength / fingerWidth));
  // Make it odd so we start and end with the same type
  if (numFingers % 2 === 0) numFingers++;

  const actualFingerWidth = edgeLength / numFingers;

  // Tab depth should be exactly material thickness (kerf is for cutting compensation)
  const depth = materialThickness;

  const points: Point[] = [start];

  for (let i = 0; i < numFingers; i++) {
    // Even positions (0, 2, 4...) are where tabs/slots go
    // Odd positions (1, 3, 5...) are straight on both faces
    const isEvenPosition = i % 2 === 0;
    const fingerStart = i * actualFingerWidth;
    const fingerEnd = (i + 1) * actualFingerWidth;

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
