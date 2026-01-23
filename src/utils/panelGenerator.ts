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
  AssemblyFingerData,
  EdgeExtensions,
  getFaceRole,
  getLidSide,
  getWallPriority,
  getEdgeAxis,
  defaultEdgeExtensions,
} from '../types';
import { generateFingerJointPath, generateFingerJointPathV2, Point } from './fingerJoints';
import { calculateAssemblyFingerPoints } from './fingerPoints';
import { getEdgeGender, getAdjacentFace } from './genderRules';
import { getAllSubdivisions } from '../store/useBoxStore';

// Helper to get edge axis position range for finger system
// Returns [startPos, endPos] along the axis where:
// - startPos corresponds to the 2D edge start point
// - endPos corresponds to the 2D edge end point
// This accounts for the fact that edges follow a clockwise pattern around each face,
// so bottom/right edges run in the negative direction along their axis.
const getEdgeAxisPositions = (
  faceId: FaceId,
  edgePosition: 'top' | 'bottom' | 'left' | 'right',
  config: BoxConfig,
  lowHasTabs: boolean,   // Does the LOW end of the axis have tabs (left/bottom side)
  highHasTabs: boolean   // Does the HIGH end of the axis have tabs (right/top side)
): { startPos: number; endPos: number } => {
  const { width, height, depth, materialThickness } = config;
  const mt = materialThickness;

  // Get the axis for this edge
  const axis = getEdgeAxis(faceId, edgePosition);

  // Calculate the low and high positions along the axis
  // lowPos = left/bottom side of axis (negative direction)
  // highPos = right/top side of axis (positive direction)
  let lowPos: number;
  let highPos: number;

  switch (axis) {
    case 'x': {
      const maxJoint = width - 2 * mt;
      lowPos = lowHasTabs ? 0 : -mt;
      highPos = highHasTabs ? maxJoint : maxJoint + mt;
      break;
    }
    case 'y': {
      const maxJoint = height - 2 * mt;
      lowPos = lowHasTabs ? 0 : -mt;
      highPos = highHasTabs ? maxJoint : maxJoint + mt;
      break;
    }
    case 'z': {
      const maxJoint = depth - 2 * mt;
      lowPos = lowHasTabs ? 0 : -mt;
      highPos = highHasTabs ? maxJoint : maxJoint + mt;
      break;
    }
  }

  // Edges follow clockwise pattern in 2D:
  // - top edge: left-to-right (low to high along axis)
  // - right edge: top-to-bottom (high to low along axis)
  // - bottom edge: right-to-left (high to low along axis)
  // - left edge: bottom-to-top (low to high along axis)
  // So for bottom/right edges, we need to swap the positions
  const runsNegative = edgePosition === 'bottom' || edgePosition === 'right';

  if (runsNegative) {
    // 2D edge start is at high position, end is at low position
    return { startPos: highPos, endPos: lowPos };
  } else {
    // 2D edge start is at low position, end is at high position
    return { startPos: lowPos, endPos: highPos };
  }
};

// Helper to get the outward direction for an edge
// Outward means away from the panel center, in 2D panel space
const getEdgeOutwardDirection = (
  edgePosition: 'top' | 'bottom' | 'left' | 'right'
): Point => {
  switch (edgePosition) {
    case 'top': return { x: 0, y: 1 };
    case 'bottom': return { x: 0, y: -1 };
    case 'left': return { x: -1, y: 0 };
    case 'right': return { x: 1, y: 0 };
  }
};

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
  existingPanels?: PanelPath[],
  fingerData?: AssemblyFingerData | null
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

  // Check which adjacent faces are solid (for outline calculation)
  const topIsSolid = edgeHasFingers('top');
  const bottomIsSolid = edgeHasFingers('bottom');
  const leftIsSolid = edgeHasFingers('left');
  const rightIsSolid = edgeHasFingers('right');

  // Calculate extension amounts (only apply to unlocked edges)
  const extTop = edgeIsUnlocked('top') ? edgeExtensions.top : 0;
  const extBottom = edgeIsUnlocked('bottom') ? edgeExtensions.bottom : 0;
  const extLeft = edgeIsUnlocked('left') ? edgeExtensions.left : 0;
  const extRight = edgeIsUnlocked('right') ? edgeExtensions.right : 0;

  // Finger corners - ALWAYS use full insets for consistent finger alignment
  // This ensures fingers on perpendicular edges don't shift when a face is removed
  const fingerCorners: Record<string, Point> = {
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

  // Outline corners - account for open faces (no inset where face is removed)
  // When an adjacent face is removed, the edge extends to the full dimension
  const outlineCorners: Record<string, Point> = {
    topLeft: {
      x: -halfW + (leftIsSolid && leftHasTabs ? materialThickness : 0) - extLeft,
      y: halfH - (topIsSolid && topHasTabs ? materialThickness : 0) + extTop
    },
    topRight: {
      x: halfW - (rightIsSolid && rightHasTabs ? materialThickness : 0) + extRight,
      y: halfH - (topIsSolid && topHasTabs ? materialThickness : 0) + extTop
    },
    bottomRight: {
      x: halfW - (rightIsSolid && rightHasTabs ? materialThickness : 0) + extRight,
      y: -halfH + (bottomIsSolid && bottomHasTabs ? materialThickness : 0) - extBottom
    },
    bottomLeft: {
      x: -halfW + (leftIsSolid && leftHasTabs ? materialThickness : 0) - extLeft,
      y: -halfH + (bottomIsSolid && bottomHasTabs ? materialThickness : 0) - extBottom
    },
  };

  // Edge configs with both outline corners (for panel shape) and finger corners (for finger calculation)
  const edgeConfigs = [
    {
      start: outlineCorners.topLeft, end: outlineCorners.topRight,
      fingerStart: fingerCorners.topLeft, fingerEnd: fingerCorners.topRight,
      edgeInfo: edges.find((e) => e.position === 'top')!,
      startExt: { perpendicular: extLeft, parallel: extTop },
      endExt: { perpendicular: extRight, parallel: extTop }
    },
    {
      start: outlineCorners.topRight, end: outlineCorners.bottomRight,
      fingerStart: fingerCorners.topRight, fingerEnd: fingerCorners.bottomRight,
      edgeInfo: edges.find((e) => e.position === 'right')!,
      startExt: { perpendicular: extTop, parallel: extRight },
      endExt: { perpendicular: extBottom, parallel: extRight }
    },
    {
      start: outlineCorners.bottomRight, end: outlineCorners.bottomLeft,
      fingerStart: fingerCorners.bottomRight, fingerEnd: fingerCorners.bottomLeft,
      edgeInfo: edges.find((e) => e.position === 'bottom')!,
      startExt: { perpendicular: extRight, parallel: extBottom },
      endExt: { perpendicular: extLeft, parallel: extBottom }
    },
    {
      start: outlineCorners.bottomLeft, end: outlineCorners.topLeft,
      fingerStart: fingerCorners.bottomLeft, fingerEnd: fingerCorners.topLeft,
      edgeInfo: edges.find((e) => e.position === 'left')!,
      startExt: { perpendicular: extBottom, parallel: extLeft },
      endExt: { perpendicular: extTop, parallel: extLeft }
    },
  ];

  const outlinePoints: PathPoint[] = [];

  for (const { start, end, fingerStart, fingerEnd, edgeInfo, startExt, endExt } of edgeConfigs) {
    const adjacentFace = faces.find((f) => f.id === edgeInfo.adjacentFaceId);
    const isSolidAdjacent = adjacentFace?.solid ?? false;
    const hasFingers = edgeHasFingers(edgeInfo.position);

    let points: Point[];

    // Use pre-calculated assembly finger points for aligned finger joints
    if (fingerData && isSolidAdjacent && hasFingers) {
      const gender = getEdgeGender(faceId, edgeInfo.position, faces, assembly);

      if (gender !== null) {
        const axis = getEdgeAxis(faceId, edgeInfo.position);
        const axisFingerPoints = fingerData[axis];
        const outwardDirection = getEdgeOutwardDirection(edgeInfo.position);

        // Determine which perpendicular edges have tabs at low/high ends of the axis
        // This is independent of edge direction - it's about physical position on the axis:
        // - Horizontal edges (X axis): low=left, high=right
        // - Vertical edges (Y axis): low=bottom, high=top
        const isHorizontalEdge = edgeInfo.position === 'top' || edgeInfo.position === 'bottom';
        let lowHasTabs: boolean;
        let highHasTabs: boolean;
        if (isHorizontalEdge) {
          lowHasTabs = leftHasTabs;   // Low end of X axis = left side
          highHasTabs = rightHasTabs; // High end of X axis = right side
        } else {
          lowHasTabs = bottomHasTabs; // Low end of Y axis = bottom side
          highHasTabs = topHasTabs;   // High end of Y axis = top side
        }

        const { startPos, endPos } = getEdgeAxisPositions(faceId, edgeInfo.position, config, lowHasTabs, highHasTabs);

        // Use fingerStart/fingerEnd for finger pattern generation (consistent alignment)
        // Then handle any difference from outline corners as straight segments
        const fingerPathPoints = generateFingerJointPathV2(fingerStart, fingerEnd, {
          fingerPoints: axisFingerPoints,
          gender,
          materialThickness,
          edgeStartPos: startPos,
          edgeEndPos: endPos,
          yUp: true,
          outwardDirection,
        });

        // If outline corners differ from finger corners, add straight segments
        const adjustedPoints: Point[] = [];

        // Add segment from outline start to finger start if different
        const startDiffX = Math.abs(start.x - fingerStart.x);
        const startDiffY = Math.abs(start.y - fingerStart.y);
        if (startDiffX > 0.01 || startDiffY > 0.01) {
          adjustedPoints.push(start);
        }

        // Add all finger path points
        adjustedPoints.push(...fingerPathPoints);

        // Add segment from finger end to outline end if different
        const endDiffX = Math.abs(end.x - fingerEnd.x);
        const endDiffY = Math.abs(end.y - fingerEnd.y);
        if (endDiffX > 0.01 || endDiffY > 0.01) {
          adjustedPoints.push(end);
        }

        points = adjustedPoints;
      } else {
        // Gender is null = straight edge
        points = [start, end];
      }
    } else {
      // No finger data or not a solid adjacent face - straight edge
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
  existingPanels?: PanelPath[],
  fingerData?: AssemblyFingerData | null
): PanelHole[] => {
  const holes: PanelHole[] = [];
  const { materialThickness, fingerWidth, fingerGap, width, height, depth, assembly } = config;
  const subdivisions = getAllSubdivisions(rootVoid);
  const isFaceSolid = (id: FaceId) => faces.find(f => f.id === id)?.solid ?? false;
  const tolerance = 0.01;

  // Get lid inset values based on assembly axis
  const getLidInset = (side: 'positive' | 'negative'): number => {
    return assembly.lids[side].inset || 0;
  };

  // Calculate boundary thresholds accounting for lid insets
  const topInset = assembly.assemblyAxis === 'y' ? getLidInset('positive') : 0;
  const bottomInset = assembly.assemblyAxis === 'y' ? getLidInset('negative') : 0;
  const leftInset = assembly.assemblyAxis === 'x' ? getLidInset('negative') : 0;
  const rightInset = assembly.assemblyAxis === 'x' ? getLidInset('positive') : 0;
  const frontInset = assembly.assemblyAxis === 'z' ? getLidInset('positive') : 0;
  const backInset = assembly.assemblyAxis === 'z' ? getLidInset('negative') : 0;

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

    // Helper to check if divider meets an outer face (accounting for lid insets)
    const meetsBottom = bounds.y <= bottomInset + tolerance;
    const meetsTop = bounds.y + bounds.h >= height - topInset - tolerance;
    const meetsLeft = bounds.x <= leftInset + tolerance;
    const meetsRight = bounds.x + bounds.w >= width - rightInset - tolerance;
    const meetsBack = bounds.z <= backInset + tolerance;
    const meetsFront = bounds.z + bounds.d >= depth - frontInset - tolerance;

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

    // Generate finger slot holes using V2 finger points for alignment
    if (slotX !== null || slotY !== null) {
      // Determine which assembly axis the slot runs along
      // This is based on face orientation and divider axis
      let slotAxis: 'x' | 'y' | 'z';
      let axisDim: number;

      if (isHorizontal) {
        // Horizontal slot - determine axis based on face
        if (faceId === 'left' || faceId === 'right') {
          slotAxis = 'z';  // Horizontal slots on left/right run along Z
          axisDim = depth;
        } else {
          slotAxis = 'x';  // Horizontal slots on front/back/top/bottom run along X
          axisDim = width;
        }
      } else {
        // Vertical slot - determine axis based on face
        if (faceId === 'top' || faceId === 'bottom') {
          slotAxis = 'z';  // Vertical slots on top/bottom run along Z
          axisDim = depth;
        } else {
          slotAxis = 'y';  // Vertical slots on front/back/left/right run along Y
          axisDim = height;
        }
      }

      const maxJoint = axisDim - 2 * materialThickness;
      const halfPanelDim = (axisDim - 2 * materialThickness) / 2;

      // Use V2 finger points if available
      if (fingerData && fingerData[slotAxis]) {
        const axisFingerPoints = fingerData[slotAxis];
        const { points: transitionPoints, innerOffset, fingerLength } = axisFingerPoints;

        if (fingerLength > 0 && maxJoint > 2 * innerOffset) {
          // Calculate the axis position range for this slot based on divider bounds
          // Void bounds are in absolute box coordinates (0 to dim)
          // Finger points use 0-based coords where 0 = interior surface (at mt from outer wall)
          //
          // Key insight: Same logic as getEdgeAxisInfo for divider panels:
          // - If at wall AND meets solid face: use 0 or maxJoint
          // - If at wall AND open face: use -mt or maxJoint + mt
          // - If not at wall: use actual position
          const tolerance = 0.01;
          let boundsStart: number;  // Low end of divider along slot axis
          let boundsEnd: number;    // High end of divider along slot axis

          if (slotAxis === 'x') {
            const atLowWall = bounds.x <= materialThickness + tolerance;
            const atHighWall = bounds.x + bounds.w >= width - materialThickness - tolerance;
            // startInset > 0 means divider meets solid face at low end
            boundsStart = atLowWall ? (startInset > 0 ? 0 : -materialThickness) : (bounds.x - materialThickness);
            boundsEnd = atHighWall ? (endInset > 0 ? maxJoint : maxJoint + materialThickness) : (bounds.x + bounds.w - materialThickness);
          } else if (slotAxis === 'y') {
            const atLowWall = bounds.y <= materialThickness + tolerance;
            const atHighWall = bounds.y + bounds.h >= height - materialThickness - tolerance;
            boundsStart = atLowWall ? (startInset > 0 ? 0 : -materialThickness) : (bounds.y - materialThickness);
            boundsEnd = atHighWall ? (endInset > 0 ? maxJoint : maxJoint + materialThickness) : (bounds.y + bounds.h - materialThickness);
          } else {
            const atLowWall = bounds.z <= materialThickness + tolerance;
            const atHighWall = bounds.z + bounds.d >= depth - materialThickness + tolerance;
            boundsStart = atLowWall ? (startInset > 0 ? 0 : -materialThickness) : (bounds.z - materialThickness);
            boundsEnd = atHighWall ? (endInset > 0 ? maxJoint : maxJoint + materialThickness) : (bounds.z + bounds.d - materialThickness);
          }

          // Apply divider edge extensions to the bounds range
          // Extensions: positive = outward (grow), negative = inward (shrink)
          // If extensionStart < 0 (shrinking), boundsStart increases (slot starts later)
          // If extensionEnd < 0 (shrinking), boundsEnd decreases (slot ends earlier)
          boundsStart -= extensionStart;
          boundsEnd += extensionEnd;

          // The effective range accounts for corner insets
          // When meeting solid face, start at 0 (not -mt + mt = 0)
          const effectiveLow = startInset > 0 ? Math.max(0, boundsStart) : boundsStart;
          const effectiveHigh = endInset > 0 ? Math.min(maxJoint, boundsEnd) : boundsEnd;

          // Generate slots at finger positions (where divider tabs will be)
          // Finger pattern: starts with finger (OUT) at innerOffset, alternates at each transition
          // Slots go where fingers are (even-indexed sections: 0, 2, 4, ...)

          // Create section boundaries including start/end
          const allBoundaries = [innerOffset, ...transitionPoints, maxJoint - innerOffset];

          let slotIndex = 0;
          for (let i = 0; i < allBoundaries.length - 1; i++) {
            if (i % 2 === 0) {  // Finger section (where divider tabs go)
              const sectionStart = allBoundaries[i];
              const sectionEnd = allBoundaries[i + 1];

              // Only include COMPLETE finger sections fully within the effective range
              // Partial fingers/slots are not allowed - skip if section extends beyond range
              if (sectionStart < effectiveLow || sectionEnd > effectiveHigh) continue;

              // No clipping - section is fully within range
              const clippedStart = sectionStart;
              const clippedEnd = sectionEnd;

              // Convert from 0-based axis coords to 2D panel coords (centered)
              // 0-based coords: 0 to maxJoint
              // 2D panel coords: -halfPanelDim to +halfPanelDim
              const panel2DStart = clippedStart - maxJoint / 2;
              const panel2DEnd = clippedEnd - maxJoint / 2;

              // Apply slotCenterOffset for dividers that don't span full axis
              const offsetStart = panel2DStart + slotCenterOffset;
              const offsetEnd = panel2DEnd + slotCenterOffset;

              let holePoints: PathPoint[];
              if (isHorizontal) {
                const y = slotY!;
                holePoints = [
                  { x: offsetStart, y: y - materialThickness / 2 },
                  { x: offsetEnd, y: y - materialThickness / 2 },
                  { x: offsetEnd, y: y + materialThickness / 2 },
                  { x: offsetStart, y: y + materialThickness / 2 },
                ];
              } else {
                const x = slotX!;
                holePoints = [
                  { x: x - materialThickness / 2, y: offsetStart },
                  { x: x + materialThickness / 2, y: offsetStart },
                  { x: x + materialThickness / 2, y: offsetEnd },
                  { x: x - materialThickness / 2, y: offsetEnd },
                ];
              }

              holes.push({
                id: `divider-slot-${sub.id}-${slotIndex}`,
                type: 'slot',
                path: { points: holePoints, closed: true },
                source: {
                  type: 'divider-slot',
                  sourceId: sub.id,
                },
              });
              slotIndex++;
            }
          }
        }
      } else {
        // Fallback to V1 calculation if no finger data
        const effectiveLength = slotLength - startInset - endInset;
        const halfSlotLength = slotLength / 2;
        const cornerGapBase = fingerWidth * fingerGap;
        const maxInset = Math.max(startInset, endInset);
        const adjustedCornerGap = Math.max(0, cornerGapBase - maxInset);
        const usableLength = effectiveLength - (adjustedCornerGap * 2);

        if (usableLength < fingerWidth) continue;

        let numFingers = Math.max(1, Math.floor(usableLength / fingerWidth));
        if (numFingers % 2 === 0) numFingers++;

        const actualFingerWidth = usableLength / numFingers;
        const actualStart = -halfSlotLength - extensionStart;
        const actualEnd = halfSlotLength + extensionEnd;
        const fingerRegionStart = -halfSlotLength + startInset + adjustedCornerGap;

        for (let i = 0; i < numFingers; i++) {
          if (i % 2 === 0) {
            const patternStart = fingerRegionStart + i * actualFingerWidth;
            const patternEnd = patternStart + actualFingerWidth;

            if (patternEnd < actualStart || patternStart > actualEnd) continue;

            const clippedStart = Math.max(patternStart, actualStart);
            const clippedEnd = Math.min(patternEnd, actualEnd);

            if (clippedEnd - clippedStart < 0.1) continue;

            const offsetStart = clippedStart + slotCenterOffset;
            const offsetEnd = clippedEnd + slotCenterOffset;

            let holePoints: PathPoint[];
            if (isHorizontal) {
              const y = slotY!;
              holePoints = [
                { x: offsetStart, y: y - materialThickness / 2 },
                { x: offsetEnd, y: y - materialThickness / 2 },
                { x: offsetEnd, y: y + materialThickness / 2 },
                { x: offsetStart, y: y + materialThickness / 2 },
              ];
            } else {
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
  existingPanels?: PanelPath[],
  fingerData?: AssemblyFingerData | null
): PanelPath | null => {
  const face = faces.find((f) => f.id === faceId);
  if (!face || !face.solid) return null;

  const extensions = existingExtensions ?? defaultEdgeExtensions;
  const dims = getFaceDimensions(faceId, config);
  const outlinePoints = generateFacePanelOutline(faceId, faces, config, extensions, existingPanels, fingerData);
  const dividerHoles = generateDividerSlotHoles(faceId, faces, rootVoid, config, existingPanels, fingerData);
  const lidHoles = generateLidSlotHoles(faceId, faces, config, fingerData);
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

// Generate slot holes in a divider panel where child dividers connect
const generateDividerToSlotHoles = (
  subdivision: { id: string; axis: 'x' | 'y' | 'z'; position: number; bounds: any },
  allSubdivisions: { id: string; axis: 'x' | 'y' | 'z'; position: number; bounds: any }[],
  config: BoxConfig,
  faces: Face[]
): PanelHole[] => {
  const holes: PanelHole[] = [];
  const { materialThickness, fingerWidth, fingerGap, width, height, depth } = config;
  const mt = materialThickness;
  const tolerance = 0.01;
  const { bounds, axis, position } = subdivision;
  const isFaceSolid = (faceId: FaceId) => faces.find(f => f.id === faceId)?.solid ?? false;

  // Find child dividers that connect to this divider
  // A child divider connects if:
  // 1. It's on a perpendicular axis
  // 2. One of its bounds edges (adjusted for mt/2) equals this divider's position
  // 3. Its position falls within this divider's bounds on that axis

  for (const child of allSubdivisions) {
    if (child.id === subdivision.id) continue;
    if (child.axis === axis) continue; // Must be perpendicular

    let connectsToThis = false;
    let slotPosition: number = 0; // Position along this divider's surface (in panel local coords)
    let slotLength: number = 0;
    let cornerInsetStart: number = 0; // Inset at start of slot (if child meets outer face)
    let cornerInsetEnd: number = 0;   // Inset at end of slot (if child meets outer face)
    let isHorizontal: boolean = false;

    // Check if child's bounds edge (with mt/2 adjustment) matches this divider's position
    // Child bounds are offset by mt/2 from the actual divider positions:
    // - child.bounds start edge corresponds to divider at (bounds.start - mt/2)
    // - child.bounds end edge corresponds to divider at (bounds.end + mt/2)

    switch (axis) {
      case 'y':
        // This is a Y-axis divider (horizontal shelf) at `position` on Y-axis
        // Panel dimensions: width = bounds.w (X), height = bounds.d (Z)
        // Child X-axis dividers connect if their Y-bounds edge touches this Y position
        if (child.axis === 'x') {
          // Check if child's Y bounds edge (adjusted) matches this divider's Y position
          const childYMin = child.bounds.y - mt / 2;
          const childYMax = child.bounds.y + child.bounds.h + mt / 2;

          if (Math.abs(childYMin - position) < tolerance || Math.abs(childYMax - position) < tolerance) {
            if (bounds.x <= child.position && child.position <= bounds.x + bounds.w) {
              connectsToThis = true;
              slotPosition = child.position - (bounds.x + bounds.w / 2);
              // Child X-divider's edge runs along Z; check if it meets back/front outer faces
              slotLength = child.bounds.d;
              // Child's "left" edge (in panel coords) is back face, "right" is front face
              cornerInsetStart = (isFaceSolid('back') && child.bounds.z <= tolerance) ? mt : 0;
              cornerInsetEnd = (isFaceSolid('front') && child.bounds.z + child.bounds.d >= depth - tolerance) ? mt : 0;
              isHorizontal = false;
            }
          }
        } else if (child.axis === 'z') {
          const childYMin = child.bounds.y - mt / 2;
          const childYMax = child.bounds.y + child.bounds.h + mt / 2;

          if (Math.abs(childYMin - position) < tolerance || Math.abs(childYMax - position) < tolerance) {
            if (bounds.z <= child.position && child.position <= bounds.z + bounds.d) {
              connectsToThis = true;
              slotPosition = child.position - (bounds.z + bounds.d / 2);
              slotLength = child.bounds.w;
              // Child Z-divider's edge runs along X; check if it meets left/right outer faces
              cornerInsetStart = (isFaceSolid('left') && child.bounds.x <= tolerance) ? mt : 0;
              cornerInsetEnd = (isFaceSolid('right') && child.bounds.x + child.bounds.w >= width - tolerance) ? mt : 0;
              isHorizontal = true;
            }
          }
        }
        break;

      case 'x':
        // This is an X-axis divider (vertical partition) at `position` on X-axis
        // Panel dimensions: width = bounds.d (Z), height = bounds.h (Y)
        if (child.axis === 'y') {
          const childXMin = child.bounds.x - mt / 2;
          const childXMax = child.bounds.x + child.bounds.w + mt / 2;

          if (Math.abs(childXMin - position) < tolerance || Math.abs(childXMax - position) < tolerance) {
            if (bounds.y <= child.position && child.position <= bounds.y + bounds.h) {
              connectsToThis = true;
              slotPosition = child.position - (bounds.y + bounds.h / 2);
              slotLength = child.bounds.d;
              // Child Y-divider's edge runs along Z; check if it meets back/front outer faces
              cornerInsetStart = (isFaceSolid('back') && child.bounds.z <= tolerance) ? mt : 0;
              cornerInsetEnd = (isFaceSolid('front') && child.bounds.z + child.bounds.d >= depth - tolerance) ? mt : 0;
              isHorizontal = true;
            }
          }
        } else if (child.axis === 'z') {
          const childXMin = child.bounds.x - mt / 2;
          const childXMax = child.bounds.x + child.bounds.w + mt / 2;

          if (Math.abs(childXMin - position) < tolerance || Math.abs(childXMax - position) < tolerance) {
            if (bounds.z <= child.position && child.position <= bounds.z + bounds.d) {
              connectsToThis = true;
              slotPosition = child.position - (bounds.z + bounds.d / 2);
              slotLength = child.bounds.h;
              // Child Z-divider's edge runs along Y; check if it meets top/bottom outer faces
              cornerInsetStart = (isFaceSolid('bottom') && child.bounds.y <= tolerance) ? mt : 0;
              cornerInsetEnd = (isFaceSolid('top') && child.bounds.y + child.bounds.h >= height - tolerance) ? mt : 0;
              isHorizontal = false;
            }
          }
        }
        break;

      case 'z':
        // This is a Z-axis divider at `position` on Z-axis
        // Panel dimensions: width = bounds.w (X), height = bounds.h (Y)
        if (child.axis === 'x') {
          const childZMin = child.bounds.z - mt / 2;
          const childZMax = child.bounds.z + child.bounds.d + mt / 2;

          if (Math.abs(childZMin - position) < tolerance || Math.abs(childZMax - position) < tolerance) {
            if (bounds.x <= child.position && child.position <= bounds.x + bounds.w) {
              connectsToThis = true;
              slotPosition = child.position - (bounds.x + bounds.w / 2);
              slotLength = child.bounds.h;
              // Child X-divider's edge runs along Y; check if it meets top/bottom outer faces
              cornerInsetStart = (isFaceSolid('bottom') && child.bounds.y <= tolerance) ? mt : 0;
              cornerInsetEnd = (isFaceSolid('top') && child.bounds.y + child.bounds.h >= height - tolerance) ? mt : 0;
              isHorizontal = false;
            }
          }
        } else if (child.axis === 'y') {
          const childZMin = child.bounds.z - mt / 2;
          const childZMax = child.bounds.z + child.bounds.d + mt / 2;

          if (Math.abs(childZMin - position) < tolerance || Math.abs(childZMax - position) < tolerance) {
            if (bounds.y <= child.position && child.position <= bounds.y + bounds.h) {
              connectsToThis = true;
              slotPosition = child.position - (bounds.y + bounds.h / 2);
              slotLength = child.bounds.w;
              // Child Y-divider's edge runs along X; check if it meets left/right outer faces
              cornerInsetStart = (isFaceSolid('left') && child.bounds.x <= tolerance) ? mt : 0;
              cornerInsetEnd = (isFaceSolid('right') && child.bounds.x + child.bounds.w >= width - tolerance) ? mt : 0;
              isHorizontal = true;
            }
          }
        }
        break;
    }

    if (connectsToThis && slotLength > 0) {
      // Calculate effective edge length (same as child's finger pattern)
      // Account for corner insets where child meets outer faces
      const effectiveLength = slotLength - cornerInsetStart - cornerInsetEnd;
      const halfEffectiveLength = effectiveLength / 2;

      // Use the same corner gap adjustment as the finger pattern
      const maxCornerInset = Math.max(cornerInsetStart, cornerInsetEnd);
      const adjustedGapMultiplier = Math.max(0, fingerGap - maxCornerInset / fingerWidth);
      const cornerGap = adjustedGapMultiplier * fingerWidth;
      const usableLength = effectiveLength - cornerGap * 2;

      if (usableLength < fingerWidth) continue;

      let numFingers = Math.max(1, Math.floor(usableLength / fingerWidth));
      if (numFingers % 2 === 0) numFingers++;

      const actualFingerWidth = usableLength / numFingers;

      // Center offset: the effective region is shifted by (cornerInsetStart - cornerInsetEnd) / 2
      const centerOffset = (cornerInsetStart - cornerInsetEnd) / 2;
      const fingerRegionStart = -halfEffectiveLength + cornerGap + centerOffset;

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
            id: `divider-slot-${subdivision.id}-${child.id}-${i}`,
            type: 'slot',
            path: { points: holePoints, closed: true },
            source: {
              type: 'divider-slot',
              sourceId: child.id,
            },
          });
        }
      }
    }
  }

  return holes;
};

const generateDividerPanel = (
  subdivision: { id: string; axis: 'x' | 'y' | 'z'; position: number; bounds: any },
  faces: Face[],
  config: BoxConfig,
  scale: number = 1,
  existingExtensions?: EdgeExtensions,
  allSubdivisions?: { id: string; axis: 'x' | 'y' | 'z'; position: number; bounds: any }[],
  fingerData?: AssemblyFingerData | null
): PanelPath => {
  const { materialThickness, fingerWidth, fingerGap, width, height, depth, assembly } = config;
  const { bounds, axis, position } = subdivision;
  const isFaceSolid = (faceId: FaceId) => faces.find(f => f.id === faceId)?.solid ?? false;
  const tolerance = 0.01;
  const extensions = existingExtensions ?? defaultEdgeExtensions;

  // Get lid inset values based on assembly axis
  // These affect where the divider "meets" a lid face
  const getLidInset = (side: 'positive' | 'negative'): number => {
    return assembly.lids[side].inset || 0;
  };

  // Calculate boundary thresholds accounting for lid insets
  // For Y-axis assembly: top/bottom are lids
  // For X-axis assembly: left/right are lids
  // For Z-axis assembly: front/back are lids
  const topInset = assembly.assemblyAxis === 'y' ? getLidInset('positive') : 0;
  const bottomInset = assembly.assemblyAxis === 'y' ? getLidInset('negative') : 0;
  const leftInset = assembly.assemblyAxis === 'x' ? getLidInset('negative') : 0;
  const rightInset = assembly.assemblyAxis === 'x' ? getLidInset('positive') : 0;
  const frontInset = assembly.assemblyAxis === 'z' ? getLidInset('positive') : 0;
  const backInset = assembly.assemblyAxis === 'z' ? getLidInset('negative') : 0;

  // Check if an edge meets another divider panel
  // edgeAxis: the axis perpendicular to the edge (the axis another divider would need to be on)
  // edgePosition: the position along that axis where this edge is
  // thisPosition: this divider's position on its own axis (for checking bounds overlap)
  // thisAxis: this divider's axis
  const meetsOtherDivider = (
    edgeAxis: 'x' | 'y' | 'z',
    edgePosition: number,
    thisPosition: number,
    thisAxis: 'x' | 'y' | 'z'
  ): boolean => {
    if (!allSubdivisions) return false;

    for (const other of allSubdivisions) {
      if (other.id === subdivision.id) continue; // Skip self
      if (other.axis !== edgeAxis) continue; // Must be on the perpendicular axis

      // Check if other divider's position matches this edge's position
      if (Math.abs(other.position - edgePosition) > tolerance) continue;

      // Check if other divider's bounds contain this divider's position
      // The other divider's bounds define where it exists, and this divider
      // must pass through that space
      let containsThis = false;
      switch (thisAxis) {
        case 'x':
          // This is an X-axis divider at position `thisPosition` on X
          // Other divider must have bounds that span this X position
          containsThis = other.bounds.x <= thisPosition && thisPosition <= other.bounds.x + other.bounds.w;
          break;
        case 'y':
          // This is a Y-axis divider at position `thisPosition` on Y
          containsThis = other.bounds.y <= thisPosition && thisPosition <= other.bounds.y + other.bounds.h;
          break;
        case 'z':
          // This is a Z-axis divider at position `thisPosition` on Z
          containsThis = other.bounds.z <= thisPosition && thisPosition <= other.bounds.z + other.bounds.d;
          break;
      }

      if (containsThis) return true;
    }
    return false;
  };

  // Calculate panel dimensions based on axis
  let panelWidth: number;
  let panelHeight: number;

  // Track outer face contacts separately from divider contacts
  // - meetsFace*: edge meets a solid outer face (panel corners should be inset)
  // - meetsDivider*: edge meets another divider (no corner inset, but has finger joints)
  // - meetsTop/Bottom/Left/Right: combined (has finger joints)
  let meetsFaceTop: boolean;
  let meetsFaceBottom: boolean;
  let meetsFaceLeft: boolean;
  let meetsFaceRight: boolean;
  let meetsDividerTop: boolean;
  let meetsDividerBottom: boolean;
  let meetsDividerLeft: boolean;
  let meetsDividerRight: boolean;

  // When checking if an edge meets another divider, we need to account for material thickness.
  // The bounds are offset from split positions by mt/2:
  // - For "start" edges (bounds.x, bounds.y, bounds.z): the divider is at edge - mt/2
  // - For "end" edges (bounds.x + bounds.w, etc.): the divider is at edge + mt/2
  const mt = materialThickness;

  switch (axis) {
    case 'x':
      panelWidth = bounds.d;
      panelHeight = bounds.h;
      // Check outer faces separately from other dividers
      // Account for lid insets: divider meets lid if it reaches the inset position
      meetsFaceTop = isFaceSolid('top') && bounds.y + bounds.h >= height - topInset - tolerance;
      meetsFaceBottom = isFaceSolid('bottom') && bounds.y <= bottomInset + tolerance;
      meetsFaceLeft = isFaceSolid('back') && bounds.z <= backInset + tolerance;
      meetsFaceRight = isFaceSolid('front') && bounds.z + bounds.d >= depth - frontInset - tolerance;
      // For divider checks, adjust edge positions by mt/2 to match divider positions
      meetsDividerTop = meetsOtherDivider('y', bounds.y + bounds.h + mt / 2, position, axis);
      meetsDividerBottom = meetsOtherDivider('y', bounds.y - mt / 2, position, axis);
      meetsDividerLeft = meetsOtherDivider('z', bounds.z - mt / 2, position, axis);
      meetsDividerRight = meetsOtherDivider('z', bounds.z + bounds.d + mt / 2, position, axis);
      break;
    case 'y':
      panelWidth = bounds.w;
      panelHeight = bounds.d;
      // Y-axis dividers: top/bottom mapped to back/front, left/right mapped to left/right
      meetsFaceTop = isFaceSolid('back') && bounds.z <= backInset + tolerance;
      meetsFaceBottom = isFaceSolid('front') && bounds.z + bounds.d >= depth - frontInset - tolerance;
      meetsFaceLeft = isFaceSolid('left') && bounds.x <= leftInset + tolerance;
      meetsFaceRight = isFaceSolid('right') && bounds.x + bounds.w >= width - rightInset - tolerance;
      meetsDividerTop = meetsOtherDivider('z', bounds.z - mt / 2, position, axis);
      meetsDividerBottom = meetsOtherDivider('z', bounds.z + bounds.d + mt / 2, position, axis);
      meetsDividerLeft = meetsOtherDivider('x', bounds.x - mt / 2, position, axis);
      meetsDividerRight = meetsOtherDivider('x', bounds.x + bounds.w + mt / 2, position, axis);
      break;
    case 'z':
    default:
      panelWidth = bounds.w;
      panelHeight = bounds.h;
      // Account for lid insets
      meetsFaceTop = isFaceSolid('top') && bounds.y + bounds.h >= height - topInset - tolerance;
      meetsFaceBottom = isFaceSolid('bottom') && bounds.y <= bottomInset + tolerance;
      meetsFaceLeft = isFaceSolid('left') && bounds.x <= leftInset + tolerance;
      meetsFaceRight = isFaceSolid('right') && bounds.x + bounds.w >= width - rightInset - tolerance;
      meetsDividerTop = meetsOtherDivider('y', bounds.y + bounds.h + mt / 2, position, axis);
      meetsDividerBottom = meetsOtherDivider('y', bounds.y - mt / 2, position, axis);
      meetsDividerLeft = meetsOtherDivider('x', bounds.x - mt / 2, position, axis);
      meetsDividerRight = meetsOtherDivider('x', bounds.x + bounds.w + mt / 2, position, axis);
      break;
  }

  // Combined: has finger joints if meets either face or divider
  const meetsTop = meetsFaceTop || meetsDividerTop;
  const meetsBottom = meetsFaceBottom || meetsDividerBottom;
  const meetsLeft = meetsFaceLeft || meetsDividerLeft;
  const meetsRight = meetsFaceRight || meetsDividerRight;

  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  // Calculate extension amounts (only apply to unlocked/straight edges)
  const extTop = !meetsTop ? extensions.top : 0;
  const extBottom = !meetsBottom ? extensions.bottom : 0;
  const extLeft = !meetsLeft ? extensions.left : 0;
  const extRight = !meetsRight ? extensions.right : 0;

  // Original corners (without extensions) - used for finger pattern calculation
  // Corner insets only apply when meeting OUTER FACES (not other dividers)
  // When meeting another divider, the panel extends to its full size
  const origCorners: Record<string, Point> = {
    topLeft: {
      x: -halfW + (meetsFaceLeft ? materialThickness : 0),
      y: halfH - (meetsFaceTop ? materialThickness : 0),
    },
    topRight: {
      x: halfW - (meetsFaceRight ? materialThickness : 0),
      y: halfH - (meetsFaceTop ? materialThickness : 0),
    },
    bottomRight: {
      x: halfW - (meetsFaceRight ? materialThickness : 0),
      y: -halfH + (meetsFaceBottom ? materialThickness : 0),
    },
    bottomLeft: {
      x: -halfW + (meetsFaceLeft ? materialThickness : 0),
      y: -halfH + (meetsFaceBottom ? materialThickness : 0),
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

  // Determine which axis finger points to use for each edge based on divider orientation
  // and calculate axis positions for V2 finger generation.
  //
  // IMPORTANT: Axis positions use a 0-based coordinate system matching face panels:
  // - 0 = start of finger region (at interior wall, after corner inset)
  // - maxJoint = end of finger region
  // - -mt or maxJoint + mt when perpendicular edge is open (extends beyond finger region)
  //
  // The perpendicular meetsFace flags determine whether corners are inset (same as face panels).
  const getEdgeAxisInfo = (edgePos: 'top' | 'bottom' | 'left' | 'right'): {
    axis: 'x' | 'y' | 'z';
    startPos: number;
    endPos: number;
  } => {
    const isHorizontal = edgePos === 'top' || edgePos === 'bottom';
    const mt = materialThickness;
    const tolerance = 0.001;

    // Calculate maxJoint for each axis
    const maxJointX = width - 2 * mt;
    const maxJointY = height - 2 * mt;
    const maxJointZ = depth - 2 * mt;

    // Helper to calculate axis positions using the same 0-based system as face panels
    const calcAxisPositions = (
      boundsLow: number,      // bounds.x/y/z (in box coords)
      boundsSize: number,     // bounds.w/h/d
      maxJoint: number,       // maxJoint for this axis
      axisDim: number,        // width/height/depth
      meetsLow: boolean,      // meetsFace at low end (left/bottom/back)
      meetsHigh: boolean      // meetsFace at high end (right/top/front)
    ): { startPos: number; endPos: number } => {
      // Check if divider reaches each wall (interior surface at mt from outer edge)
      const atLowWall = boundsLow <= mt + tolerance;
      const atHighWall = boundsLow + boundsSize >= axisDim - mt - tolerance;

      let startPos: number;
      let endPos: number;

      // Low end (left/bottom side of axis) - same logic as face panels
      if (atLowWall) {
        // Divider is at the wall - use face panel logic
        // meetsLow = true means perpendicular face is solid, corner is inset, use 0
        // meetsLow = false means perpendicular face is open, panel extends to edge, use -mt
        startPos = meetsLow ? 0 : -mt;
      } else {
        // Divider doesn't reach the wall - use actual position in 0-based coords
        startPos = boundsLow - mt;
      }

      // High end (right/top side of axis) - same logic as face panels
      if (atHighWall) {
        // Divider is at the wall - use face panel logic
        endPos = meetsHigh ? maxJoint : maxJoint + mt;
      } else {
        // Divider doesn't reach the wall - use actual position in 0-based coords
        endPos = boundsLow + boundsSize - mt;
      }

      return { startPos, endPos };
    };

    // Map divider axis + edge position to assembly axis and bounds positions
    switch (axis) {
      case 'x': // YZ plane divider - width=depth(Z), height=height(Y)
        if (isHorizontal) {
          // Horizontal edges run along Z axis
          const { startPos, endPos } = calcAxisPositions(
            bounds.z, bounds.d, maxJointZ, depth,
            meetsFaceLeft, meetsFaceRight  // "left/right" in 2D = back/front in Z
          );
          return { axis: 'z', startPos, endPos };
        } else {
          // Vertical edges run along Y axis
          const { startPos, endPos } = calcAxisPositions(
            bounds.y, bounds.h, maxJointY, height,
            meetsFaceBottom, meetsFaceTop  // bottom/top in 2D = bottom/top in Y
          );
          return { axis: 'y', startPos, endPos };
        }
      case 'y': // XZ plane divider - width=width(X), height=depth(Z)
        if (isHorizontal) {
          // Horizontal edges run along X axis
          const { startPos, endPos } = calcAxisPositions(
            bounds.x, bounds.w, maxJointX, width,
            meetsFaceLeft, meetsFaceRight  // left/right in 2D = left/right in X
          );
          return { axis: 'x', startPos, endPos };
        } else {
          // Vertical edges run along Z axis
          const { startPos, endPos } = calcAxisPositions(
            bounds.z, bounds.d, maxJointZ, depth,
            meetsFaceBottom, meetsFaceTop  // bottom/top in 2D = back/front in Z
          );
          return { axis: 'z', startPos, endPos };
        }
      case 'z': // XY plane divider - width=width(X), height=height(Y)
      default:
        if (isHorizontal) {
          // Horizontal edges run along X axis
          const { startPos, endPos } = calcAxisPositions(
            bounds.x, bounds.w, maxJointX, width,
            meetsFaceLeft, meetsFaceRight  // left/right in 2D = left/right in X
          );
          return { axis: 'x', startPos, endPos };
        } else {
          // Vertical edges run along Y axis
          const { startPos, endPos } = calcAxisPositions(
            bounds.y, bounds.h, maxJointY, height,
            meetsFaceBottom, meetsFaceTop  // bottom/top in 2D = bottom/top in Y
          );
          return { axis: 'y', startPos, endPos };
        }
    }
  };

  const edgeConfigs = [
    {
      start: corners.topLeft, end: corners.topRight,
      hasTabs: meetsTop, position: 'top' as const,
      meetsFace: meetsFaceTop,
      originalLength: origTopLength,
      // Top edge goes left→right, left extension affects start
      // Negative extension = shrink = positive offset
      patternOffset: !meetsLeft ? -extLeft : 0,
      axisInfo: getEdgeAxisInfo('top'),
    },
    {
      start: corners.topRight, end: corners.bottomRight,
      hasTabs: meetsRight, position: 'right' as const,
      meetsFace: meetsFaceRight,
      originalLength: origRightLength,
      // Right edge goes top→bottom, top extension affects start
      patternOffset: !meetsTop ? -extTop : 0,
      axisInfo: getEdgeAxisInfo('right'),
    },
    {
      start: corners.bottomRight, end: corners.bottomLeft,
      hasTabs: meetsBottom, position: 'bottom' as const,
      meetsFace: meetsFaceBottom,
      originalLength: origBottomLength,
      // Bottom edge goes right→left, right extension affects start
      patternOffset: !meetsRight ? -extRight : 0,
      axisInfo: getEdgeAxisInfo('bottom'),
    },
    {
      start: corners.bottomLeft, end: corners.topLeft,
      hasTabs: meetsLeft, position: 'left' as const,
      meetsFace: meetsFaceLeft,
      originalLength: origLeftLength,
      // Left edge goes bottom→top, bottom extension affects start
      patternOffset: !meetsBottom ? -extBottom : 0,
      axisInfo: getEdgeAxisInfo('left'),
    },
  ];

  const outlinePoints: PathPoint[] = [];

  for (const { start, end, hasTabs, position: edgePosition, meetsFace, originalLength, patternOffset, axisInfo } of edgeConfigs) {
    let points: Point[];

    if (hasTabs) {
      // Use V2 finger generation for edges meeting outer faces (for alignment with face slots)
      if (meetsFace && fingerData) {
        const axisFingerPoints = fingerData[axisInfo.axis];
        const outwardDirection = getEdgeOutwardDirection(edgePosition);

        // For bottom/right edges, the 2D path runs in the negative direction
        // so we need to swap start/end positions
        const runsNegative = edgePosition === 'bottom' || edgePosition === 'right';

        // Adjust axis positions for edge extensions
        // Extensions on perpendicular edges affect where this edge starts/ends along its axis
        // The axis positions are in the 0-based finger coordinate system
        let axisLowAdjust = 0;   // Adjustment to low end of axis (bottom/left/back)
        let axisHighAdjust = 0;  // Adjustment to high end of axis (top/right/front)

        // Determine which perpendicular extensions affect this edge based on divider orientation
        // and which axis the edge runs along
        if (axis === 'x') {
          // X-axis divider (YZ plane): horizontal=Z, vertical=Y
          if (edgePosition === 'top' || edgePosition === 'bottom') {
            // Horizontal edge runs along Z: left/right extensions affect Z range
            axisLowAdjust = extLeft;   // Left in 2D = back in Z
            axisHighAdjust = extRight; // Right in 2D = front in Z
          } else {
            // Vertical edge runs along Y: top/bottom extensions affect Y range
            axisLowAdjust = extBottom;
            axisHighAdjust = extTop;
          }
        } else if (axis === 'y') {
          // Y-axis divider (XZ plane): horizontal=X, vertical=Z
          if (edgePosition === 'top' || edgePosition === 'bottom') {
            // Horizontal edge runs along X: left/right extensions affect X range
            axisLowAdjust = extLeft;
            axisHighAdjust = extRight;
          } else {
            // Vertical edge runs along Z: top/bottom extensions affect Z range
            axisLowAdjust = extBottom; // Bottom in 2D = back in Z
            axisHighAdjust = extTop;   // Top in 2D = front in Z
          }
        } else {
          // Z-axis divider (XY plane): horizontal=X, vertical=Y
          if (edgePosition === 'top' || edgePosition === 'bottom') {
            // Horizontal edge runs along X: left/right extensions affect X range
            axisLowAdjust = extLeft;
            axisHighAdjust = extRight;
          } else {
            // Vertical edge runs along Y: top/bottom extensions affect Y range
            axisLowAdjust = extBottom;
            axisHighAdjust = extTop;
          }
        }

        // Apply adjustments to axis positions
        // Positive extension = edge extends further = axis range increases
        const adjustedStartPos = axisInfo.startPos - axisLowAdjust;
        const adjustedEndPos = axisInfo.endPos + axisHighAdjust;

        const edgeStartPos = runsNegative ? adjustedEndPos : adjustedStartPos;
        const edgeEndPos = runsNegative ? adjustedStartPos : adjustedEndPos;

        points = generateFingerJointPathV2(start, end, {
          fingerPoints: axisFingerPoints,
          gender: 'male', // Dividers always have tabs (male) going into face slots
          materialThickness,
          edgeStartPos,
          edgeEndPos,
          yUp: true,
          outwardDirection,
        });
      } else {
        // Use V1 for edges meeting other dividers (no alignment requirement)
        const actualLength = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
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
      }
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

  // Generate slot holes for child dividers that connect to this divider
  const dividerSlots = allSubdivisions
    ? generateDividerToSlotHoles(subdivision, allSubdivisions, config, faces)
    : [];

  return {
    id: `divider-${subdivision.id}`,
    source,
    outline: { points: outlinePoints, closed: true },
    holes: dividerSlots,
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

  // Calculate assembly-level finger points for aligned finger joints
  const fingerData = calculateAssemblyFingerPoints(config);

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
    const panel = generateDividerPanel(sub, faces, config, scale, getExistingExtensions(panelId), subdivisions, fingerData);
    dividerPanels.push(panel);
  }

  // Second pass: generate face panels with divider extension info
  const faceIds: FaceId[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];
  for (const faceId of faceIds) {
    const panelId = `face-${faceId}`;
    const panel = generateFacePanel(faceId, faces, rootVoid, config, scale, getExistingExtensions(panelId), dividerPanels, fingerData);
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
