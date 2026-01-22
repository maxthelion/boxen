// Panel Generator - Creates PanelPath objects from box configuration
// These paths are the source of truth for both 3D rendering and SVG export

import {
  BoxConfig,
  Face,
  FaceId,
  Void,
  PanelPath,
  PanelHole,
  PathPoint,
  PanelCollection,
  PanelSource,
  AssemblyConfig,
  EdgeExtensions,
  getFaceRole,
  getLidSide,
  getWallPriority,
  defaultEdgeExtensions,
} from '../types';
import { generateFingerJointPath, Point } from './fingerJoints';
import { getAllSubdivisions } from '../store/useBoxStore';

// =============================================================================
// Helpers
// =============================================================================

interface FaceDimensions {
  width: number;
  height: number;
}

export const getFaceDimensions = (
  faceId: FaceId,
  config: BoxConfig
): FaceDimensions => {
  switch (faceId) {
    case 'front':
    case 'back':
      return { width: config.width, height: config.height };
    case 'left':
    case 'right':
      return { width: config.depth, height: config.height };
    case 'top':
    case 'bottom':
      return { width: config.width, height: config.depth };
  }
};

export interface EdgeInfo {
  adjacentFaceId: FaceId;
  isHorizontal: boolean;
  position: 'top' | 'bottom' | 'left' | 'right';
}

export const getFaceEdges = (faceId: FaceId): EdgeInfo[] => {
  switch (faceId) {
    case 'front':
      return [
        { adjacentFaceId: 'top', isHorizontal: true, position: 'top' },
        { adjacentFaceId: 'bottom', isHorizontal: true, position: 'bottom' },
        { adjacentFaceId: 'left', isHorizontal: false, position: 'left' },
        { adjacentFaceId: 'right', isHorizontal: false, position: 'right' },
      ];
    case 'back':
      return [
        { adjacentFaceId: 'top', isHorizontal: true, position: 'top' },
        { adjacentFaceId: 'bottom', isHorizontal: true, position: 'bottom' },
        { adjacentFaceId: 'right', isHorizontal: false, position: 'left' },
        { adjacentFaceId: 'left', isHorizontal: false, position: 'right' },
      ];
    case 'left':
      return [
        { adjacentFaceId: 'top', isHorizontal: true, position: 'top' },
        { adjacentFaceId: 'bottom', isHorizontal: true, position: 'bottom' },
        { adjacentFaceId: 'back', isHorizontal: false, position: 'left' },
        { adjacentFaceId: 'front', isHorizontal: false, position: 'right' },
      ];
    case 'right':
      return [
        { adjacentFaceId: 'top', isHorizontal: true, position: 'top' },
        { adjacentFaceId: 'bottom', isHorizontal: true, position: 'bottom' },
        { adjacentFaceId: 'front', isHorizontal: false, position: 'left' },
        { adjacentFaceId: 'back', isHorizontal: false, position: 'right' },
      ];
    case 'top':
      return [
        { adjacentFaceId: 'back', isHorizontal: true, position: 'top' },
        { adjacentFaceId: 'front', isHorizontal: true, position: 'bottom' },
        { adjacentFaceId: 'left', isHorizontal: false, position: 'left' },
        { adjacentFaceId: 'right', isHorizontal: false, position: 'right' },
      ];
    case 'bottom':
      return [
        { adjacentFaceId: 'front', isHorizontal: true, position: 'top' },
        { adjacentFaceId: 'back', isHorizontal: true, position: 'bottom' },
        { adjacentFaceId: 'left', isHorizontal: false, position: 'left' },
        { adjacentFaceId: 'right', isHorizontal: false, position: 'right' },
      ];
  }
};

// Get which edge of the adjacent face corresponds to this face's edge
// For example: top face's right edge connects to right face's top edge
export const getAdjacentEdgePosition = (
  faceId: FaceId,
  edgePosition: 'top' | 'bottom' | 'left' | 'right'
): 'top' | 'bottom' | 'left' | 'right' => {
  // This mapping defines which edge of the adjacent face connects back to this face
  // Derived from getFaceEdges: if face A's edge X connects to face B,
  // then face B's edge Y connects back to face A (found by looking up B in getFaceEdges)
  const mapping: Record<FaceId, Record<string, 'top' | 'bottom' | 'left' | 'right'>> = {
    front: { top: 'bottom', bottom: 'top', left: 'right', right: 'left' },
    back: { top: 'top', bottom: 'bottom', left: 'right', right: 'left' },
    left: { top: 'left', bottom: 'left', left: 'right', right: 'left' },
    right: { top: 'right', bottom: 'right', left: 'right', right: 'left' },
    top: { top: 'top', bottom: 'top', left: 'top', right: 'top' },
    bottom: { top: 'bottom', bottom: 'bottom', left: 'bottom', right: 'bottom' },
  };
  return mapping[faceId][edgePosition];
};

// Get the extension value from an adjacent face's edge that connects to this face
const getAdjacentFaceExtension = (
  faceId: FaceId,
  edgePosition: 'top' | 'bottom' | 'left' | 'right',
  existingPanels?: PanelPath[]
): number => {
  if (!existingPanels) return 0;

  const edges = getFaceEdges(faceId);
  const edgeInfo = edges.find(e => e.position === edgePosition);
  if (!edgeInfo) return 0;

  const adjacentFaceId = edgeInfo.adjacentFaceId;
  const adjacentPanel = existingPanels.find(p => p.source.faceId === adjacentFaceId);
  if (!adjacentPanel) return 0;

  const adjacentEdgePosition = getAdjacentEdgePosition(faceId, edgePosition);
  return adjacentPanel.edgeExtensions[adjacentEdgePosition] || 0;
};

// Get extensions from adjacent face that affect each end of this edge
// When an adjacent face contracts its perpendicular edges, it affects the shared edge length
const getAdjacentFacePerpendicularExtensions = (
  faceId: FaceId,
  edgePosition: 'top' | 'bottom' | 'left' | 'right',
  existingPanels?: PanelPath[]
): { startExt: number; endExt: number } => {
  if (!existingPanels) return { startExt: 0, endExt: 0 };

  const edges = getFaceEdges(faceId);
  const edgeInfo = edges.find(e => e.position === edgePosition);
  if (!edgeInfo) return { startExt: 0, endExt: 0 };

  const adjacentFaceId = edgeInfo.adjacentFaceId;
  const adjacentPanel = existingPanels.find(p => p.source.faceId === adjacentFaceId);
  if (!adjacentPanel) return { startExt: 0, endExt: 0 };

  // Map which edges of the adjacent face affect the start/end of this edge
  // This depends on the geometric relationship between the faces
  const perpMapping: Record<FaceId, Record<string, { start: 'top' | 'bottom' | 'left' | 'right'; end: 'top' | 'bottom' | 'left' | 'right' }>> = {
    // For front face edges, which adjacent face edges affect start/end
    front: {
      top: { start: 'left', end: 'right' },      // top edge: left corner to right corner
      bottom: { start: 'left', end: 'right' },
      left: { start: 'top', end: 'bottom' },     // left edge: top corner to bottom corner
      right: { start: 'top', end: 'bottom' },
    },
    back: {
      top: { start: 'right', end: 'left' },      // back is mirrored
      bottom: { start: 'right', end: 'left' },
      left: { start: 'top', end: 'bottom' },
      right: { start: 'top', end: 'bottom' },
    },
    left: {
      top: { start: 'left', end: 'right' },
      bottom: { start: 'left', end: 'right' },
      left: { start: 'top', end: 'bottom' },
      right: { start: 'top', end: 'bottom' },
    },
    right: {
      top: { start: 'right', end: 'left' },      // right face orientation
      bottom: { start: 'right', end: 'left' },
      left: { start: 'top', end: 'bottom' },
      right: { start: 'top', end: 'bottom' },
    },
    top: {
      top: { start: 'left', end: 'right' },
      bottom: { start: 'left', end: 'right' },
      left: { start: 'top', end: 'bottom' },
      right: { start: 'top', end: 'bottom' },
    },
    bottom: {
      top: { start: 'left', end: 'right' },
      bottom: { start: 'left', end: 'right' },
      left: { start: 'bottom', end: 'top' },     // bottom face is flipped
      right: { start: 'bottom', end: 'top' },
    },
  };

  const mapping = perpMapping[faceId]?.[edgePosition];
  if (!mapping) return { startExt: 0, endExt: 0 };

  return {
    startExt: adjacentPanel.edgeExtensions[mapping.start] || 0,
    endExt: adjacentPanel.edgeExtensions[mapping.end] || 0,
  };
};

// =============================================================================
// Edge Status Utilities - Determine which edges are locked (finger joints) vs unlocked (straight)
// =============================================================================

export interface EdgeStatusInfo {
  position: 'top' | 'bottom' | 'left' | 'right';
  adjacentFaceId?: FaceId;
  status: 'locked' | 'unlocked';  // unlocked = straight edge only
}

// For divider panels - edge is unlocked only if it's straight (meets open face)
export const getDividerEdgeStatuses = (
  meetsTop: boolean,    // meets solid top face
  meetsBottom: boolean,
  meetsLeft: boolean,
  meetsRight: boolean
): EdgeStatusInfo[] => {
  // V1: Edge is LOCKED if it has tabs (meets solid face)
  // Edge is UNLOCKED only if straight (meets open face)
  return [
    { position: 'top', status: meetsTop ? 'locked' : 'unlocked' },
    { position: 'bottom', status: meetsBottom ? 'locked' : 'unlocked' },
    { position: 'left', status: meetsLeft ? 'locked' : 'unlocked' },
    { position: 'right', status: meetsRight ? 'locked' : 'unlocked' },
  ];
};

// For face panels - edge is unlocked only if adjacent face is open
export const getFaceEdgeStatuses = (
  faceId: FaceId,
  faces: Face[],
  _assembly: AssemblyConfig  // Reserved for V2: may need for tab direction logic
): EdgeStatusInfo[] => {
  const edges = getFaceEdges(faceId);

  return edges.map((edge) => {
    const adjacentFace = faces.find((f) => f.id === edge.adjacentFaceId);
    const isSolidAdjacent = adjacentFace?.solid ?? false;

    // V1: Edge is LOCKED if adjacent face is solid (has finger joint)
    // Edge is UNLOCKED only if adjacent face is open (straight edge)
    return {
      position: edge.position,
      adjacentFaceId: edge.adjacentFaceId,
      status: isSolidAdjacent ? 'locked' : 'unlocked',
    };
  });
};

// Dynamic tab direction logic based on assembly configuration
const shouldTabOut = (
  faceId: FaceId,
  adjacentFaceId: FaceId,
  assembly: AssemblyConfig
): boolean | null => {
  const myRole = getFaceRole(faceId, assembly.assemblyAxis);
  const adjRole = getFaceRole(adjacentFaceId, assembly.assemblyAxis);

  // Wall-to-Wall: use priority system (lower priority tabs OUT)
  if (myRole === 'wall' && adjRole === 'wall') {
    return getWallPriority(faceId) < getWallPriority(adjacentFaceId);
  }

  // Lid-to-Wall interactions
  if (myRole === 'lid') {
    const side = getLidSide(faceId, assembly.assemblyAxis);
    if (side) {
      return assembly.lids[side].tabDirection === 'tabs-out';
    }
    return false;
  }

  // Wall-to-Lid interactions
  if (adjRole === 'lid') {
    const side = getLidSide(adjacentFaceId, assembly.assemblyAxis);
    if (side) {
      if (assembly.lids[side].inset > 0) {
        return null; // Straight edge for inset lids
      }
      return assembly.lids[side].tabDirection === 'tabs-in';
    }
    return false;
  }

  return false;
};

// Get face 3D position and rotation for rendering
const getFaceTransform = (
  faceId: FaceId,
  config: BoxConfig,
  scale: number
): { position: [number, number, number]; rotation: [number, number, number] } => {
  const { width, height, depth, materialThickness, assembly } = config;
  const halfW = (width * scale) / 2;
  const halfH = (height * scale) / 2;
  const halfD = (depth * scale) / 2;
  const mt = materialThickness * scale;

  // Get lid insets for positioning lid faces
  const getLidInset = (side: 'positive' | 'negative'): number => {
    return (assembly.lids[side].inset || 0) * scale;
  };

  switch (faceId) {
    case 'front':
      return {
        position: [0, 0, halfD - mt / 2],
        rotation: [0, 0, 0],
      };
    case 'back':
      return {
        position: [0, 0, -halfD + mt / 2],
        rotation: [0, Math.PI, 0],
      };
    case 'left':
      return {
        position: [-halfW + mt / 2, 0, 0],
        rotation: [0, -Math.PI / 2, 0],
      };
    case 'right':
      return {
        position: [halfW - mt / 2, 0, 0],
        rotation: [0, Math.PI / 2, 0],
      };
    case 'top':
      // Adjust for lid inset (moves down into the box)
      return {
        position: [0, halfH - mt / 2 - getLidInset('positive'), 0],
        rotation: [-Math.PI / 2, 0, 0],
      };
    case 'bottom':
      // Adjust for lid inset (moves up into the box)
      return {
        position: [0, -halfH + mt / 2 + getLidInset('negative'), 0],
        rotation: [Math.PI / 2, 0, 0],
      };
  }
};

// =============================================================================
// Face Panel Generation
// =============================================================================

const generateFacePanelOutline = (
  faceId: FaceId,
  faces: Face[],
  config: BoxConfig,
  edgeExtensions: EdgeExtensions = defaultEdgeExtensions,
  existingPanels?: PanelPath[]
): PathPoint[] => {
  const dims = getFaceDimensions(faceId, config);
  const edges = getFaceEdges(faceId);
  const { materialThickness, fingerWidth, fingerGap, assembly } = config;

  const halfW = dims.width / 2;
  const halfH = dims.height / 2;

  // Check if adjacent face has any contraction that affects the shared edge
  // This includes both the connecting edge AND perpendicular edges that shorten the overlap
  const getAdjacentContractions = (position: 'top' | 'bottom' | 'left' | 'right'): { direct: number; startPerp: number; endPerp: number } => {
    const directExt = getAdjacentFaceExtension(faceId, position, existingPanels);
    const perpExts = getAdjacentFacePerpendicularExtensions(faceId, position, existingPanels);
    return {
      direct: directExt,
      startPerp: perpExts.startExt,
      endPerp: perpExts.endExt,
    };
  };

  // Check if adjacent face has any contraction (direct or perpendicular)
  const adjacentHasAnyContraction = (position: 'top' | 'bottom' | 'left' | 'right'): boolean => {
    const contractions = getAdjacentContractions(position);
    return contractions.direct < 0 || contractions.startPerp < 0 || contractions.endPerp < 0;
  };

  // Determine which edges have tabs extending outward (locked edges)
  const edgeHasTabs = (position: 'top' | 'bottom' | 'left' | 'right'): boolean => {
    const edgeInfo = edges.find(e => e.position === position)!;
    const adjacentFace = faces.find(f => f.id === edgeInfo.adjacentFaceId);
    const isSolidAdjacent = adjacentFace?.solid ?? false;
    const tabOut = shouldTabOut(faceId, edgeInfo.adjacentFaceId, assembly);
    return isSolidAdjacent && tabOut === true;
  };

  // Check if edge is unlocked (straight, no finger joints)
  const edgeIsUnlocked = (position: 'top' | 'bottom' | 'left' | 'right'): boolean => {
    const edgeInfo = edges.find(e => e.position === position)!;
    const adjacentFace = faces.find(f => f.id === edgeInfo.adjacentFaceId);
    return !(adjacentFace?.solid ?? false);
  };

  // Check if edge should have finger joints (may be partial if adjacent has perpendicular contraction)
  const edgeHasFingers = (position: 'top' | 'bottom' | 'left' | 'right'): boolean => {
    const edgeInfo = edges.find(e => e.position === position)!;
    const adjacentFace = faces.find(f => f.id === edgeInfo.adjacentFaceId);
    return adjacentFace?.solid ?? false;
  };

  const topHasTabs = edgeHasTabs('top');
  const bottomHasTabs = edgeHasTabs('bottom');
  const leftHasTabs = edgeHasTabs('left');
  const rightHasTabs = edgeHasTabs('right');

  // Calculate extension amounts (only apply to unlocked edges)
  const extTop = edgeIsUnlocked('top') ? edgeExtensions.top : 0;
  const extBottom = edgeIsUnlocked('bottom') ? edgeExtensions.bottom : 0;
  const extLeft = edgeIsUnlocked('left') ? edgeExtensions.left : 0;
  const extRight = edgeIsUnlocked('right') ? edgeExtensions.right : 0;

  // Original corners (without extensions) - used for finger pattern calculation
  // This ensures fingers maintain their original spacing regardless of extensions
  const originalCorners: Record<string, Point> = {
    topLeft: {
      x: -halfW + (leftHasTabs ? materialThickness : 0),
      y: halfH - (topHasTabs ? materialThickness : 0)
    },
    topRight: {
      x: halfW - (rightHasTabs ? materialThickness : 0),
      y: halfH - (topHasTabs ? materialThickness : 0)
    },
    bottomRight: {
      x: halfW - (rightHasTabs ? materialThickness : 0),
      y: -halfH + (bottomHasTabs ? materialThickness : 0)
    },
    bottomLeft: {
      x: -halfW + (leftHasTabs ? materialThickness : 0),
      y: -halfH + (bottomHasTabs ? materialThickness : 0)
    },
  };

  // Actual corners (with extensions) - used for panel outline
  const corners: Record<string, Point> = {
    topLeft: {
      x: originalCorners.topLeft.x - extLeft,
      y: originalCorners.topLeft.y + extTop
    },
    topRight: {
      x: originalCorners.topRight.x + extRight,
      y: originalCorners.topRight.y + extTop
    },
    bottomRight: {
      x: originalCorners.bottomRight.x + extRight,
      y: originalCorners.bottomRight.y - extBottom
    },
    bottomLeft: {
      x: originalCorners.bottomLeft.x - extLeft,
      y: originalCorners.bottomLeft.y - extBottom
    },
  };

  // Edge configs with both actual and original corners
  const edgeConfigs = [
    {
      start: corners.topLeft, end: corners.topRight,
      originalStart: originalCorners.topLeft, originalEnd: originalCorners.topRight,
      edgeInfo: edges.find((e) => e.position === 'top')!,
      startExt: { perpendicular: extLeft, parallel: extTop },
      endExt: { perpendicular: extRight, parallel: extTop }
    },
    {
      start: corners.topRight, end: corners.bottomRight,
      originalStart: originalCorners.topRight, originalEnd: originalCorners.bottomRight,
      edgeInfo: edges.find((e) => e.position === 'right')!,
      startExt: { perpendicular: extTop, parallel: extRight },
      endExt: { perpendicular: extBottom, parallel: extRight }
    },
    {
      start: corners.bottomRight, end: corners.bottomLeft,
      originalStart: originalCorners.bottomRight, originalEnd: originalCorners.bottomLeft,
      edgeInfo: edges.find((e) => e.position === 'bottom')!,
      startExt: { perpendicular: extRight, parallel: extBottom },
      endExt: { perpendicular: extLeft, parallel: extBottom }
    },
    {
      start: corners.bottomLeft, end: corners.topLeft,
      originalStart: originalCorners.bottomLeft, originalEnd: originalCorners.topLeft,
      edgeInfo: edges.find((e) => e.position === 'left')!,
      startExt: { perpendicular: extBottom, parallel: extLeft },
      endExt: { perpendicular: extTop, parallel: extLeft }
    },
  ];

  const outlinePoints: PathPoint[] = [];

  for (const { start, end, originalStart, originalEnd, edgeInfo, startExt, endExt } of edgeConfigs) {
    const adjacentFace = faces.find((f) => f.id === edgeInfo.adjacentFaceId);
    const isSolidAdjacent = adjacentFace?.solid ?? false;
    const hasFingers = edgeHasFingers(edgeInfo.position);
    const tabOutResult = (isSolidAdjacent && hasFingers) ? shouldTabOut(faceId, edgeInfo.adjacentFaceId, assembly) : null;

    let points: Point[];

    if (tabOutResult !== null && hasFingers) {
      // Generate fingers based on ORIGINAL edge length to maintain consistent spacing
      const originalEdgeLength = Math.sqrt(
        Math.pow(originalEnd.x - originalStart.x, 2) +
        Math.pow(originalEnd.y - originalStart.y, 2)
      );

      // Calculate corner inset for adjusted gap multiplier
      const isHorizontalEdge = edgeInfo.position === 'top' || edgeInfo.position === 'bottom';
      const cornerInset = isHorizontalEdge
        ? Math.max(leftHasTabs ? materialThickness : 0, rightHasTabs ? materialThickness : 0)
        : Math.max(topHasTabs ? materialThickness : 0, bottomHasTabs ? materialThickness : 0);
      const adjustedGapMultiplier = Math.max(0, fingerGap - cornerInset / fingerWidth);

      // Generate finger pattern based on original corners
      const fingerPoints = generateFingerJointPath(originalStart, originalEnd, {
        edgeLength: originalEdgeLength,
        fingerWidth,
        materialThickness,
        isTabOut: tabOutResult,
        kerf: 0,
        yUp: true,
        cornerGapMultiplier: adjustedGapMultiplier,
      });

      // Check if perpendicular edges have negative extensions (contractions)
      // that would clip the finger pattern
      const startContraction = startExt.perpendicular < 0 ? Math.abs(startExt.perpendicular) : 0;
      const endContraction = endExt.perpendicular < 0 ? Math.abs(endExt.perpendicular) : 0;

      if (startContraction > 0 || endContraction > 0) {
        // Clip the finger pattern where adjacent edges are contracted
        // Filter out points that fall outside the actual edge bounds
        const isVertical = edgeInfo.position === 'left' || edgeInfo.position === 'right';

        const clippedPoints: Point[] = [];
        for (let i = 0; i < fingerPoints.length; i++) {
          const p = fingerPoints[i];
          let inBounds = true;

          if (isVertical) {
            // Vertical edge: check Y bounds
            const minY = Math.min(start.y, end.y);
            const maxY = Math.max(start.y, end.y);
            inBounds = p.y >= minY - 0.01 && p.y <= maxY + 0.01;
          } else {
            // Horizontal edge: check X bounds
            const minX = Math.min(start.x, end.x);
            const maxX = Math.max(start.x, end.x);
            inBounds = p.x >= minX - 0.01 && p.x <= maxX + 0.01;
          }

          if (inBounds) {
            clippedPoints.push(p);
          } else if (clippedPoints.length > 0) {
            // Add the boundary point if we're transitioning out of bounds
            const lastInBounds = clippedPoints[clippedPoints.length - 1];
            if (isVertical) {
              const boundaryY = p.y < Math.min(start.y, end.y) ? Math.min(start.y, end.y) : Math.max(start.y, end.y);
              if (Math.abs(lastInBounds.y - boundaryY) > 0.01) {
                clippedPoints.push({ x: lastInBounds.x, y: boundaryY });
              }
            } else {
              const boundaryX = p.x < Math.min(start.x, end.x) ? Math.min(start.x, end.x) : Math.max(start.x, end.x);
              if (Math.abs(lastInBounds.x - boundaryX) > 0.01) {
                clippedPoints.push({ x: boundaryX, y: lastInBounds.y });
              }
            }
          }
        }

        // Ensure the path starts and ends at the actual corners
        if (clippedPoints.length > 0) {
          // Add start corner if needed
          const firstPoint = clippedPoints[0];
          if (Math.abs(firstPoint.x - start.x) > 0.01 || Math.abs(firstPoint.y - start.y) > 0.01) {
            clippedPoints.unshift(start);
          }
          // Add end corner if needed
          const lastPoint = clippedPoints[clippedPoints.length - 1];
          if (Math.abs(lastPoint.x - end.x) > 0.01 || Math.abs(lastPoint.y - end.y) > 0.01) {
            clippedPoints.push(end);
          }
          points = clippedPoints;
        } else {
          // All fingers clipped, just use straight edge
          points = [start, end];
        }
      } else {
        points = fingerPoints;
      }
    } else {
      points = [start, end];
    }

    // For first edge, add all points including start
    // For subsequent edges, check if we need to add the corner point
    if (outlinePoints.length === 0) {
      // First edge: add all points
      for (let i = 0; i < points.length; i++) {
        outlinePoints.push(points[i]);
      }
    } else {
      // Subsequent edges: ensure corner continuity
      const lastOutlinePoint = outlinePoints[outlinePoints.length - 1];
      const edgeStartPoint = points[0];

      // Check if the last outline point matches the edge start point (the corner)
      const tolerance = 0.001;
      const cornerMatches =
        Math.abs(lastOutlinePoint.x - edgeStartPoint.x) < tolerance &&
        Math.abs(lastOutlinePoint.y - edgeStartPoint.y) < tolerance;

      if (!cornerMatches) {
        // Corner doesn't match - the previous edge didn't end at the corner
        // Add the corner point explicitly
        outlinePoints.push(edgeStartPoint);
      }

      // Skip the first point (corner) and add the rest
      for (let i = 1; i < points.length; i++) {
        outlinePoints.push(points[i]);
      }
    }
  }

  return outlinePoints;
};

// Generate slot holes for dividers that meet this face
const generateDividerSlotHoles = (
  faceId: FaceId,
  faces: Face[],
  rootVoid: Void,
  config: BoxConfig,
  existingPanels?: PanelPath[]
): PanelHole[] => {
  const holes: PanelHole[] = [];
  const { materialThickness, fingerWidth, fingerGap, width, height, depth } = config;
  const subdivisions = getAllSubdivisions(rootVoid);
  const isFaceSolid = (id: FaceId) => faces.find(f => f.id === id)?.solid ?? false;
  const tolerance = 0.01;

  // Helper to get divider's edge extensions
  const getDividerExtensions = (subId: string): EdgeExtensions => {
    if (!existingPanels) return defaultEdgeExtensions;
    // Match the divider panel ID format
    const dividerPanel = existingPanels.find(p => p.id === `divider-${subId}`);
    return dividerPanel?.edgeExtensions ?? defaultEdgeExtensions;
  };

  for (const sub of subdivisions) {
    let slotX: number | null = null;
    let slotY: number | null = null;
    let slotLength: number = 0;
    let isHorizontal: boolean = false;
    let startInset: number = 0;  // Inset at start of slot (mm)
    let endInset: number = 0;    // Inset at end of slot (mm)
    let extensionStart: number = 0;  // Extension at start of slot edge
    let extensionEnd: number = 0;    // Extension at end of slot edge
    let slotCenterOffset: number = 0;  // Offset to center slots within bounds

    const { bounds, position, axis } = sub;
    const extensions = getDividerExtensions(sub.id);

    // Helper to check if divider meets an outer face
    const meetsBottom = bounds.y < tolerance;
    const meetsTop = bounds.y + bounds.h > height - tolerance;
    const meetsLeft = bounds.x < tolerance;
    const meetsRight = bounds.x + bounds.w > width - tolerance;
    const meetsBack = bounds.z < tolerance;
    const meetsFront = bounds.z + bounds.d > depth - tolerance;

    // For divider edges: determine which unlocked edges affect the slot endpoints
    // The divider's edge meeting this face - extensions on perpendicular unlocked edges affect length
    const getExtForEdge = (edgeName: 'top' | 'bottom' | 'left' | 'right', meetsCondition: boolean): number => {
      // If the perpendicular face is solid, edge is locked, no extension applies
      // If perpendicular face is open, edge is unlocked, extension applies
      return meetsCondition ? 0 : extensions[edgeName];
    };

    // Check if this subdivision touches this face
    // For each case, calculate slotCenterOffset to position slots within sub-void bounds
    switch (faceId) {
      case 'front':
        if (meetsFront) {
          if (axis === 'x') {
            slotX = position - width / 2;
            slotLength = bounds.h;
            isHorizontal = false;
            // Vertical slot runs in Y direction - offset based on bounds.y
            slotCenterOffset = (bounds.y + bounds.h / 2) - height / 2;
            // Vertical slot: start=bottom, end=top
            startInset = meetsBottom && isFaceSolid('bottom') ? materialThickness : 0;
            endInset = meetsTop && isFaceSolid('top') ? materialThickness : 0;
            // For X-axis divider meeting front: right edge meets front face
            // Slot runs vertically (bottom to top), extensions: bottom/top affect length
            extensionStart = getExtForEdge('bottom', meetsBottom && isFaceSolid('bottom'));
            extensionEnd = getExtForEdge('top', meetsTop && isFaceSolid('top'));
          } else if (axis === 'y') {
            slotY = position - height / 2;
            slotLength = bounds.w;
            isHorizontal = true;
            // Horizontal slot runs in X direction - offset based on bounds.x
            slotCenterOffset = (bounds.x + bounds.w / 2) - width / 2;
            // Horizontal slot: start=left, end=right
            startInset = meetsLeft && isFaceSolid('left') ? materialThickness : 0;
            endInset = meetsRight && isFaceSolid('right') ? materialThickness : 0;
            extensionStart = getExtForEdge('left', meetsLeft && isFaceSolid('left'));
            extensionEnd = getExtForEdge('right', meetsRight && isFaceSolid('right'));
          }
        }
        break;
      case 'back':
        if (meetsBack) {
          if (axis === 'x') {
            slotX = -(position - width / 2);
            slotLength = bounds.h;
            isHorizontal = false;
            // Vertical slot runs in Y direction - offset based on bounds.y
            slotCenterOffset = (bounds.y + bounds.h / 2) - height / 2;
            startInset = meetsBottom && isFaceSolid('bottom') ? materialThickness : 0;
            endInset = meetsTop && isFaceSolid('top') ? materialThickness : 0;
            extensionStart = getExtForEdge('bottom', meetsBottom && isFaceSolid('bottom'));
            extensionEnd = getExtForEdge('top', meetsTop && isFaceSolid('top'));
          } else if (axis === 'y') {
            slotY = position - height / 2;
            slotLength = bounds.w;
            isHorizontal = true;
            // Horizontal slot runs in X direction (mirrored) - offset based on bounds.x
            slotCenterOffset = -((bounds.x + bounds.w / 2) - width / 2);
            startInset = meetsLeft && isFaceSolid('left') ? materialThickness : 0;
            endInset = meetsRight && isFaceSolid('right') ? materialThickness : 0;
            extensionStart = getExtForEdge('left', meetsLeft && isFaceSolid('left'));
            extensionEnd = getExtForEdge('right', meetsRight && isFaceSolid('right'));
          }
        }
        break;
      case 'left':
        if (meetsLeft) {
          if (axis === 'z') {
            slotX = position - depth / 2;
            slotLength = bounds.h;
            isHorizontal = false;
            // Vertical slot runs in Y direction - offset based on bounds.y
            slotCenterOffset = (bounds.y + bounds.h / 2) - height / 2;
            startInset = meetsBottom && isFaceSolid('bottom') ? materialThickness : 0;
            endInset = meetsTop && isFaceSolid('top') ? materialThickness : 0;
            extensionStart = getExtForEdge('bottom', meetsBottom && isFaceSolid('bottom'));
            extensionEnd = getExtForEdge('top', meetsTop && isFaceSolid('top'));
          } else if (axis === 'y') {
            slotY = position - height / 2;
            slotLength = bounds.d;
            isHorizontal = true;
            // Horizontal slot runs in Z direction - offset based on bounds.z
            slotCenterOffset = (bounds.z + bounds.d / 2) - depth / 2;
            // Horizontal slot on left: start=back, end=front
            startInset = meetsBack && isFaceSolid('back') ? materialThickness : 0;
            endInset = meetsFront && isFaceSolid('front') ? materialThickness : 0;
            // For Y-axis divider: left edge, slots run front-to-back
            // In divider's 2D: "left" corresponds to back, "right" to front
            extensionStart = getExtForEdge('left', meetsBack && isFaceSolid('back'));
            extensionEnd = getExtForEdge('right', meetsFront && isFaceSolid('front'));
          }
        }
        break;
      case 'right':
        if (meetsRight) {
          if (axis === 'z') {
            slotX = -(position - depth / 2);
            slotLength = bounds.h;
            isHorizontal = false;
            // Vertical slot runs in Y direction - offset based on bounds.y
            slotCenterOffset = (bounds.y + bounds.h / 2) - height / 2;
            startInset = meetsBottom && isFaceSolid('bottom') ? materialThickness : 0;
            endInset = meetsTop && isFaceSolid('top') ? materialThickness : 0;
            extensionStart = getExtForEdge('bottom', meetsBottom && isFaceSolid('bottom'));
            extensionEnd = getExtForEdge('top', meetsTop && isFaceSolid('top'));
          } else if (axis === 'y') {
            slotY = position - height / 2;
            slotLength = bounds.d;
            isHorizontal = true;
            // Horizontal slot runs in Z direction (mirrored) - offset based on bounds.z
            slotCenterOffset = -((bounds.z + bounds.d / 2) - depth / 2);
            // Horizontal slot on right: start=front, end=back (mirrored from left)
            startInset = meetsFront && isFaceSolid('front') ? materialThickness : 0;
            endInset = meetsBack && isFaceSolid('back') ? materialThickness : 0;
            extensionStart = getExtForEdge('right', meetsFront && isFaceSolid('front'));
            extensionEnd = getExtForEdge('left', meetsBack && isFaceSolid('back'));
          }
        }
        break;
      case 'top':
        if (meetsTop) {
          if (axis === 'x') {
            slotX = position - width / 2;
            slotLength = bounds.d;
            isHorizontal = false;
            // Vertical slot runs in Z direction (mapped to local Y) - offset based on bounds.z
            // Top face rotation [-π/2, 0, 0]: local Y → world -Z
            // So negative slotY = positive world Z (toward front)
            slotCenterOffset = -((bounds.z + bounds.d / 2) - depth / 2);
            // For top: start=front (positive local Y maps to back), end=back
            startInset = meetsFront && isFaceSolid('front') ? materialThickness : 0;
            endInset = meetsBack && isFaceSolid('back') ? materialThickness : 0;
            extensionStart = getExtForEdge('right', meetsFront && isFaceSolid('front'));
            extensionEnd = getExtForEdge('left', meetsBack && isFaceSolid('back'));
          } else if (axis === 'z') {
            // Top face rotation [-π/2, 0, 0]: local Y → world -Z
            // To place slot at world Z = position, need slotY = -(position - depth/2)
            slotY = -(position - depth / 2);
            slotLength = bounds.w;
            isHorizontal = true;
            // Horizontal slot runs in X direction - offset based on bounds.x
            slotCenterOffset = (bounds.x + bounds.w / 2) - width / 2;
            startInset = meetsLeft && isFaceSolid('left') ? materialThickness : 0;
            endInset = meetsRight && isFaceSolid('right') ? materialThickness : 0;
            extensionStart = getExtForEdge('left', meetsLeft && isFaceSolid('left'));
            extensionEnd = getExtForEdge('right', meetsRight && isFaceSolid('right'));
          }
        }
        break;
      case 'bottom':
        if (meetsBottom) {
          if (axis === 'x') {
            slotX = position - width / 2;
            slotLength = bounds.d;
            isHorizontal = false;
            // Vertical slot runs in Z direction (mapped to local Y) - offset based on bounds.z
            // Bottom face rotation [π/2, 0, 0]: local Y → world +Z
            // So positive slotY = positive world Z (toward front)
            slotCenterOffset = (bounds.z + bounds.d / 2) - depth / 2;
            // For bottom: start=back (negative local Y), end=front (positive local Y)
            startInset = meetsBack && isFaceSolid('back') ? materialThickness : 0;
            endInset = meetsFront && isFaceSolid('front') ? materialThickness : 0;
            extensionStart = getExtForEdge('left', meetsBack && isFaceSolid('back'));
            extensionEnd = getExtForEdge('right', meetsFront && isFaceSolid('front'));
          } else if (axis === 'z') {
            // Bottom face rotation [π/2, 0, 0]: local Y → world +Z
            // To place slot at world Z = position, need slotY = position - depth/2
            slotY = position - depth / 2;
            slotLength = bounds.w;
            isHorizontal = true;
            // Horizontal slot runs in X direction - offset based on bounds.x
            slotCenterOffset = (bounds.x + bounds.w / 2) - width / 2;
            startInset = meetsLeft && isFaceSolid('left') ? materialThickness : 0;
            endInset = meetsRight && isFaceSolid('right') ? materialThickness : 0;
            extensionStart = getExtForEdge('left', meetsLeft && isFaceSolid('left'));
            extensionEnd = getExtForEdge('right', meetsRight && isFaceSolid('right'));
          }
        }
        break;
    }

    // Generate finger slot holes
    if (slotX !== null || slotY !== null) {
      // Calculate effective length (after subtracting insets)
      const effectiveLength = slotLength - startInset - endInset;
      const halfSlotLength = slotLength / 2;

      // Use Math.max of corner insets for gap adjustment (matches FaceWithFingers)
      const cornerGapBase = fingerWidth * fingerGap;
      const maxInset = Math.max(startInset, endInset);
      const adjustedCornerGap = Math.max(0, cornerGapBase - maxInset);

      // Usable length for fingers (based on original, not extended)
      const usableLength = effectiveLength - (adjustedCornerGap * 2);

      if (usableLength < fingerWidth) continue;  // Too short for slots

      // Calculate number of fingers - must be odd for symmetry
      let numFingers = Math.max(1, Math.floor(usableLength / fingerWidth));
      if (numFingers % 2 === 0) numFingers++;  // Ensure odd for symmetry

      const actualFingerWidth = usableLength / numFingers;

      // Pattern offset: how much the start has moved due to extension
      // Negative extension = shrink = start moved inward = positive offset (skip into pattern)
      const patternOffset = -extensionStart;

      // Actual slot region bounds (with extensions applied)
      const actualHalfLength = halfSlotLength + extensionStart + (extensionEnd - extensionStart) / 2;
      const actualStart = -halfSlotLength - extensionStart;
      const actualEnd = halfSlotLength + extensionEnd;

      // Starting position for finger region in original pattern
      const fingerRegionStart = -halfSlotLength + startInset + adjustedCornerGap;

      for (let i = 0; i < numFingers; i++) {
        if (i % 2 === 0) {
          // Calculate slot position in original pattern coordinates
          const patternStart = fingerRegionStart + i * actualFingerWidth;
          const patternEnd = patternStart + actualFingerWidth;

          // Convert to actual coordinates (apply offset)
          const slotStart = patternStart;
          const slotEnd = patternEnd;

          // Skip slots entirely outside actual bounds
          if (slotEnd < actualStart || slotStart > actualEnd) continue;

          // Clip slot to actual bounds
          const clippedStart = Math.max(slotStart, actualStart);
          const clippedEnd = Math.min(slotEnd, actualEnd);

          // Skip if clipped slot is too small
          if (clippedEnd - clippedStart < 0.1) continue;

          // Apply center offset to position slots within sub-void bounds
          const offsetStart = clippedStart + slotCenterOffset;
          const offsetEnd = clippedEnd + slotCenterOffset;

          let holePoints: PathPoint[];
          if (isHorizontal) {
            // Horizontal slot
            const y = slotY!;
            holePoints = [
              { x: offsetStart, y: y - materialThickness / 2 },
              { x: offsetEnd, y: y - materialThickness / 2 },
              { x: offsetEnd, y: y + materialThickness / 2 },
              { x: offsetStart, y: y + materialThickness / 2 },
            ];
          } else {
            // Vertical slot
            const x = slotX!;
            holePoints = [
              { x: x - materialThickness / 2, y: offsetStart },
              { x: x + materialThickness / 2, y: offsetStart },
              { x: x + materialThickness / 2, y: offsetEnd },
              { x: x - materialThickness / 2, y: offsetEnd },
            ];
          }

          holes.push({
            id: `divider-slot-${sub.id}-${i}`,
            type: 'slot',
            path: { points: holePoints, closed: true },
            source: {
              type: 'divider-slot',
              sourceId: sub.id,
            },
          });
        }
      }
    }
  }

  return holes;
};

// Generate slot holes for lid tabs on wall faces
const generateLidSlotHoles = (
  faceId: FaceId,
  faces: Face[],
  config: BoxConfig
): PanelHole[] => {
  const holes: PanelHole[] = [];
  const { assembly, materialThickness, fingerWidth, fingerGap, width, height, depth } = config;
  const isFaceSolid = (id: FaceId) => faces.find(f => f.id === id)?.solid ?? false;

  // Only walls get slots for lid tabs
  if (getFaceRole(faceId, assembly.assemblyAxis) !== 'wall') return [];

  const dims = getFaceDimensions(faceId, config);

  for (const side of ['positive', 'negative'] as const) {
    const lidConfig = assembly.lids[side];

    // Only process if lid has tabs-out AND is inset
    // Non-inset lids have their tabs/slots handled by edge finger joints
    // Inset lids need internal slot holes since the wall edge is straight
    if (lidConfig.tabDirection !== 'tabs-out') continue;
    if (lidConfig.inset <= 0) continue;  // Skip non-inset lids

    let slotPosition: number;
    let slotLength: number;
    let isHorizontal: boolean;
    let startInset: number = 0;
    let endInset: number = 0;

    switch (assembly.assemblyAxis) {
      case 'y':
        // Top/bottom are lids
        if (side === 'positive') {
          slotPosition = dims.height / 2 - materialThickness / 2 - lidConfig.inset;
        } else {
          slotPosition = -dims.height / 2 + materialThickness / 2 + lidConfig.inset;
        }
        isHorizontal = true;
        if (faceId === 'front' || faceId === 'back') {
          slotLength = width;
          startInset = isFaceSolid('left') ? materialThickness : 0;
          endInset = isFaceSolid('right') ? materialThickness : 0;
        } else {
          slotLength = depth;
          if (faceId === 'left') {
            startInset = isFaceSolid('back') ? materialThickness : 0;
            endInset = isFaceSolid('front') ? materialThickness : 0;
          } else {
            startInset = isFaceSolid('front') ? materialThickness : 0;
            endInset = isFaceSolid('back') ? materialThickness : 0;
          }
        }
        break;

      case 'x':
        // Left/right are lids
        if (side === 'positive') {
          slotPosition = dims.width / 2 - materialThickness / 2 - lidConfig.inset;
        } else {
          slotPosition = -dims.width / 2 + materialThickness / 2 + lidConfig.inset;
        }
        isHorizontal = false;
        slotLength = height;
        startInset = isFaceSolid('bottom') ? materialThickness : 0;
        endInset = isFaceSolid('top') ? materialThickness : 0;
        break;

      case 'z':
        // Front/back are lids
        if (faceId === 'left' || faceId === 'right') {
          if (side === 'positive') {
            slotPosition = dims.width / 2 - materialThickness / 2 - lidConfig.inset;
          } else {
            slotPosition = -dims.width / 2 + materialThickness / 2 + lidConfig.inset;
          }
          isHorizontal = false;
          slotLength = height;
          startInset = isFaceSolid('bottom') ? materialThickness : 0;
          endInset = isFaceSolid('top') ? materialThickness : 0;
        } else {
          if (side === 'positive') {
            slotPosition = dims.height / 2 - materialThickness / 2 - lidConfig.inset;
          } else {
            slotPosition = -dims.height / 2 + materialThickness / 2 + lidConfig.inset;
          }
          isHorizontal = true;
          slotLength = width;
          startInset = isFaceSolid('left') ? materialThickness : 0;
          endInset = isFaceSolid('right') ? materialThickness : 0;
        }
        break;

      default:
        continue;
    }

    // Calculate effective length (after subtracting insets)
    const effectiveLength = slotLength - startInset - endInset;
    const halfSlotLength = slotLength / 2;

    // Use Math.max of corner insets for gap adjustment
    const cornerGapBase = fingerWidth * fingerGap;
    const maxInset = Math.max(startInset, endInset);
    const adjustedCornerGap = Math.max(0, cornerGapBase - maxInset);

    // Usable length for fingers
    const usableLength = effectiveLength - (adjustedCornerGap * 2);

    if (usableLength < fingerWidth) continue;  // Too short for slots

    let numFingers = Math.max(1, Math.floor(usableLength / fingerWidth));
    if (numFingers % 2 === 0) numFingers++;  // Ensure odd for symmetry

    const actualFingerWidth = usableLength / numFingers;

    // Starting position for finger region
    const fingerRegionStart = -halfSlotLength + startInset + adjustedCornerGap;

    for (let i = 0; i < numFingers; i++) {
      if (i % 2 === 0) {
        const slotStart = fingerRegionStart + i * actualFingerWidth;
        const slotEnd = slotStart + actualFingerWidth;

        let holePoints: PathPoint[];
        if (isHorizontal) {
          holePoints = [
            { x: slotStart, y: slotPosition - materialThickness / 2 },
            { x: slotEnd, y: slotPosition - materialThickness / 2 },
            { x: slotEnd, y: slotPosition + materialThickness / 2 },
            { x: slotStart, y: slotPosition + materialThickness / 2 },
          ];
        } else {
          holePoints = [
            { x: slotPosition - materialThickness / 2, y: slotStart },
            { x: slotPosition + materialThickness / 2, y: slotStart },
            { x: slotPosition + materialThickness / 2, y: slotEnd },
            { x: slotPosition - materialThickness / 2, y: slotEnd },
          ];
        }

        holes.push({
          id: `lid-slot-${side}-${i}`,
          type: 'slot',
          path: { points: holePoints, closed: true },
          source: {
            type: 'lid-slot',
            sourceId: side,
          },
        });
      }
    }
  }

  return holes;
};

const generateFacePanel = (
  faceId: FaceId,
  faces: Face[],
  rootVoid: Void,
  config: BoxConfig,
  scale: number = 1,
  existingExtensions?: EdgeExtensions,
  existingPanels?: PanelPath[]
): PanelPath | null => {
  const face = faces.find((f) => f.id === faceId);
  if (!face || !face.solid) return null;

  const extensions = existingExtensions ?? defaultEdgeExtensions;
  const dims = getFaceDimensions(faceId, config);
  const outlinePoints = generateFacePanelOutline(faceId, faces, config, extensions, existingPanels);
  const dividerHoles = generateDividerSlotHoles(faceId, faces, rootVoid, config, existingPanels);
  const lidHoles = generateLidSlotHoles(faceId, faces, config);
  const { position, rotation } = getFaceTransform(faceId, config, scale);

  const source: PanelSource = {
    type: 'face',
    faceId,
  };

  return {
    id: `face-${faceId}`,
    source,
    outline: { points: outlinePoints, closed: true },
    holes: [...dividerHoles, ...lidHoles],
    width: dims.width,
    height: dims.height,
    thickness: config.materialThickness,
    position,
    rotation,
    label: faceId.toUpperCase(),
    visible: true,
    edgeExtensions: { ...extensions },
  };
};

// =============================================================================
// Divider Panel Generation
// =============================================================================

const generateDividerPanel = (
  subdivision: { id: string; axis: 'x' | 'y' | 'z'; position: number; bounds: any },
  faces: Face[],
  config: BoxConfig,
  scale: number = 1,
  existingExtensions?: EdgeExtensions
): PanelPath => {
  const { materialThickness, fingerWidth, fingerGap, width, height, depth } = config;
  const { bounds, axis, position } = subdivision;
  const isFaceSolid = (faceId: FaceId) => faces.find(f => f.id === faceId)?.solid ?? false;
  const tolerance = 0.01;
  const extensions = existingExtensions ?? defaultEdgeExtensions;

  // Calculate panel dimensions based on axis
  let panelWidth: number;
  let panelHeight: number;
  let meetsTop: boolean;
  let meetsBottom: boolean;
  let meetsLeft: boolean;
  let meetsRight: boolean;

  switch (axis) {
    case 'x':
      panelWidth = bounds.d;
      panelHeight = bounds.h;
      meetsTop = isFaceSolid('top') && bounds.y + bounds.h >= height - tolerance;
      meetsBottom = isFaceSolid('bottom') && bounds.y <= tolerance;
      meetsLeft = isFaceSolid('back') && bounds.z <= tolerance;
      meetsRight = isFaceSolid('front') && bounds.z + bounds.d >= depth - tolerance;
      break;
    case 'y':
      panelWidth = bounds.w;
      panelHeight = bounds.d;
      meetsTop = isFaceSolid('back') && bounds.z <= tolerance;
      meetsBottom = isFaceSolid('front') && bounds.z + bounds.d >= depth - tolerance;
      meetsLeft = isFaceSolid('left') && bounds.x <= tolerance;
      meetsRight = isFaceSolid('right') && bounds.x + bounds.w >= width - tolerance;
      break;
    case 'z':
      panelWidth = bounds.w;
      panelHeight = bounds.h;
      meetsTop = isFaceSolid('top') && bounds.y + bounds.h >= height - tolerance;
      meetsBottom = isFaceSolid('bottom') && bounds.y <= tolerance;
      meetsLeft = isFaceSolid('left') && bounds.x <= tolerance;
      meetsRight = isFaceSolid('right') && bounds.x + bounds.w >= width - tolerance;
      break;
  }

  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  // Calculate extension amounts (only apply to unlocked/straight edges)
  const extTop = !meetsTop ? extensions.top : 0;
  const extBottom = !meetsBottom ? extensions.bottom : 0;
  const extLeft = !meetsLeft ? extensions.left : 0;
  const extRight = !meetsRight ? extensions.right : 0;

  // Original corners (without extensions) - used for finger pattern calculation
  const origCorners: Record<string, Point> = {
    topLeft: {
      x: -halfW + (meetsLeft ? materialThickness : 0),
      y: halfH - (meetsTop ? materialThickness : 0),
    },
    topRight: {
      x: halfW - (meetsRight ? materialThickness : 0),
      y: halfH - (meetsTop ? materialThickness : 0),
    },
    bottomRight: {
      x: halfW - (meetsRight ? materialThickness : 0),
      y: -halfH + (meetsBottom ? materialThickness : 0),
    },
    bottomLeft: {
      x: -halfW + (meetsLeft ? materialThickness : 0),
      y: -halfH + (meetsBottom ? materialThickness : 0),
    },
  };

  // Actual corners with extensions applied
  const corners: Record<string, Point> = {
    topLeft: {
      x: origCorners.topLeft.x - extLeft,
      y: origCorners.topLeft.y + extTop,
    },
    topRight: {
      x: origCorners.topRight.x + extRight,
      y: origCorners.topRight.y + extTop,
    },
    bottomRight: {
      x: origCorners.bottomRight.x + extRight,
      y: origCorners.bottomRight.y - extBottom,
    },
    bottomLeft: {
      x: origCorners.bottomLeft.x - extLeft,
      y: origCorners.bottomLeft.y - extBottom,
    },
  };

  // Calculate original edge lengths (for finger pattern generation)
  const origTopLength = Math.abs(origCorners.topRight.x - origCorners.topLeft.x);
  const origBottomLength = Math.abs(origCorners.bottomRight.x - origCorners.bottomLeft.x);
  const origLeftLength = Math.abs(origCorners.topLeft.y - origCorners.bottomLeft.y);
  const origRightLength = Math.abs(origCorners.topRight.y - origCorners.bottomRight.y);

  // For each edge, calculate the patternOffset (how far into the original pattern to start)
  // When an edge shrinks (negative extension), the start moves inward, so patternOffset is positive
  // patternOffset = -extension (convert negative shrink to positive offset)
  //
  // Top edge: goes left→right. If left is unlocked, left extension affects start
  // Right edge: goes top→bottom. If top is unlocked, top extension affects start
  // Bottom edge: goes right→left. If right is unlocked, right extension affects start
  // Left edge: goes bottom→top. If bottom is unlocked, bottom extension affects start

  const edgeConfigs = [
    {
      start: corners.topLeft, end: corners.topRight,
      hasTabs: meetsTop, position: 'top' as const,
      originalLength: origTopLength,
      // Top edge goes left→right, left extension affects start
      // Negative extension = shrink = positive offset
      patternOffset: !meetsLeft ? -extLeft : 0,
    },
    {
      start: corners.topRight, end: corners.bottomRight,
      hasTabs: meetsRight, position: 'right' as const,
      originalLength: origRightLength,
      // Right edge goes top→bottom, top extension affects start
      patternOffset: !meetsTop ? -extTop : 0,
    },
    {
      start: corners.bottomRight, end: corners.bottomLeft,
      hasTabs: meetsBottom, position: 'bottom' as const,
      originalLength: origBottomLength,
      // Bottom edge goes right→left, right extension affects start
      patternOffset: !meetsRight ? -extRight : 0,
    },
    {
      start: corners.bottomLeft, end: corners.topLeft,
      hasTabs: meetsLeft, position: 'left' as const,
      originalLength: origLeftLength,
      // Left edge goes bottom→top, bottom extension affects start
      patternOffset: !meetsBottom ? -extBottom : 0,
    },
  ];

  const outlinePoints: PathPoint[] = [];

  for (const { start, end, hasTabs, position: edgePosition, originalLength, patternOffset } of edgeConfigs) {
    const actualLength = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));

    let points: Point[];
    if (hasTabs) {
      // Calculate corner inset for adjusted gap multiplier
      const isHorizontalEdge = edgePosition === 'top' || edgePosition === 'bottom';
      const cornerInset = isHorizontalEdge
        ? Math.max(meetsLeft ? materialThickness : 0, meetsRight ? materialThickness : 0)
        : Math.max(meetsTop ? materialThickness : 0, meetsBottom ? materialThickness : 0);
      const adjustedGapMultiplier = Math.max(0, fingerGap - cornerInset / fingerWidth);

      points = generateFingerJointPath(start, end, {
        edgeLength: actualLength,
        fingerWidth,
        materialThickness,
        isTabOut: true,
        kerf: 0,
        yUp: true,
        cornerGapMultiplier: adjustedGapMultiplier,
        originalLength: originalLength,
        patternOffset: patternOffset,
      });
    } else {
      points = [start, end];
    }

    const startIndex = outlinePoints.length === 0 ? 0 : 1;
    for (let i = startIndex; i < points.length; i++) {
      outlinePoints.push(points[i]);
    }
  }

  // Calculate 3D position
  // The divider must be positioned at the split position on its axis,
  // and centered within its parent void's bounds on the other two axes.
  let panelPosition: [number, number, number];
  let panelRotation: [number, number, number];

  const scaledPos = position * scale;
  const halfWidth = (width * scale) / 2;
  const halfHeight = (height * scale) / 2;
  const halfDepth = (depth * scale) / 2;

  // Calculate the center of the parent bounds in box-centered coordinates
  const boundsCenterX = (bounds.x + bounds.w / 2) * scale - halfWidth;
  const boundsCenterY = (bounds.y + bounds.h / 2) * scale - halfHeight;
  const boundsCenterZ = (bounds.z + bounds.d / 2) * scale - halfDepth;

  switch (axis) {
    case 'x':
      // X-axis divider: positioned at splitPosition on X, centered on Y and Z within bounds
      panelPosition = [scaledPos - halfWidth, boundsCenterY, boundsCenterZ];
      panelRotation = [0, Math.PI / 2, 0];
      break;
    case 'y':
      // Y-axis divider: positioned at splitPosition on Y, centered on X and Z within bounds
      panelPosition = [boundsCenterX, scaledPos - halfHeight, boundsCenterZ];
      panelRotation = [Math.PI / 2, 0, 0];
      break;
    case 'z':
      // Z-axis divider: positioned at splitPosition on Z, centered on X and Y within bounds
      panelPosition = [boundsCenterX, boundsCenterY, scaledPos - halfDepth];
      panelRotation = [0, 0, 0];
      break;
  }

  const source: PanelSource = {
    type: 'divider',
    subdivisionId: subdivision.id,
    axis,
  };

  return {
    id: `divider-${subdivision.id}`,
    source,
    outline: { points: outlinePoints, closed: true },
    holes: [], // Divider intersection slots would go here
    width: panelWidth,
    height: panelHeight,
    thickness: materialThickness,
    position: panelPosition,
    rotation: panelRotation,
    label: `DIV-${axis.toUpperCase()}@${position.toFixed(1)}mm`,
    visible: true,
    edgeExtensions: { ...extensions },
  };
};

// =============================================================================
// Main Generation Function
// =============================================================================

export const generatePanelCollection = (
  faces: Face[],
  rootVoid: Void,
  config: BoxConfig,
  scale: number = 1,
  existingPanels?: PanelPath[]
): PanelCollection => {
  const panels: PanelPath[] = [];

  // Helper to get existing extensions for a panel
  const getExistingExtensions = (panelId: string): EdgeExtensions | undefined => {
    if (!existingPanels) return undefined;
    const existing = existingPanels.find(p => p.id === panelId);
    return existing?.edgeExtensions;
  };

  // Generate face panels
  // First pass: generate divider panels to get their extensions
  const dividerPanels: PanelPath[] = [];
  const subdivisions = getAllSubdivisions(rootVoid);
  for (const sub of subdivisions) {
    const panelId = `divider-${sub.id}`;
    const panel = generateDividerPanel(sub, faces, config, scale, getExistingExtensions(panelId));
    dividerPanels.push(panel);
  }

  // Second pass: generate face panels with divider extension info
  const faceIds: FaceId[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];
  for (const faceId of faceIds) {
    const panelId = `face-${faceId}`;
    const panel = generateFacePanel(faceId, faces, rootVoid, config, scale, getExistingExtensions(panelId), dividerPanels);
    if (panel) {
      panels.push(panel);
    }
  }

  // Add divider panels (already generated above)
  for (const dividerPanel of dividerPanels) {
    panels.push(dividerPanel);
  }

  return {
    panels,
    augmentations: [],
    generatedAt: Date.now(),
  };
};
