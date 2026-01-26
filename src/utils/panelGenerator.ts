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
import { startDebugLog, addPanelDebug, PanelDebugInfo, CornerDebugInfo } from './extensionDebug';

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

// Determine if this face has priority over the perpendicular face at a meeting corner
// When two faces both extend the same edge direction and meet, one must give way.
// Priority rule: front/back (main faces) take priority over left/right (side faces)
// This matches typical box construction where front/back are full width.
const hasPriorityOverPerpFace = (
  faceId: FaceId,
  perpFaceId: FaceId
): boolean => {
  // Priority order: front/back are "primary", left/right are "secondary"
  const isPrimary = (f: FaceId) => f === 'front' || f === 'back';

  if (isPrimary(faceId) && !isPrimary(perpFaceId)) return true;
  if (!isPrimary(faceId) && isPrimary(perpFaceId)) return false;

  // Same tier: use alphabetical order as tiebreaker
  return faceId < perpFaceId;
};

// Get the perpendicular face ID for a given edge
const getPerpFaceId = (
  faceId: FaceId,
  edgePosition: 'top' | 'bottom' | 'left' | 'right',
  cornerSide: 'start' | 'end'
): FaceId | null => {
  const edges = getFaceEdges(faceId);

  let perpEdgePosition: 'top' | 'bottom' | 'left' | 'right';
  if (edgePosition === 'top' || edgePosition === 'bottom') {
    perpEdgePosition = cornerSide === 'start' ? 'left' : 'right';
  } else {
    perpEdgePosition = cornerSide === 'start' ? 'bottom' : 'top';
  }

  const perpEdgeInfo = edges.find(e => e.position === perpEdgePosition);
  return perpEdgeInfo?.adjacentFaceId || null;
};

// Get extension values from perpendicular faces on the SAME named edge
// This is for detecting when two perpendicular panels both extend in the same direction
// and their extensions meet at a shared corner.
// For example: Front extends bottom, Left also extends bottom - they meet at bottom-left corner
// Returns both the extension amount AND the perpendicular face ID for priority checking
const getPerpendicularFaceExtensionOnSameEdge = (
  faceId: FaceId,
  edgePosition: 'top' | 'bottom' | 'left' | 'right',  // The edge being extended
  cornerSide: 'start' | 'end',  // Which corner of the edge to check
  existingPanels?: PanelPath[]
): { extension: number; perpFaceId: FaceId | null } => {
  if (!existingPanels) return { extension: 0, perpFaceId: null };

  const edges = getFaceEdges(faceId);

  // Determine which perpendicular face to check based on corner
  // For horizontal edges (top/bottom): start=left side, end=right side
  // For vertical edges (left/right): start=bottom, end=top (in 2D panel coordinates)
  let perpEdgePosition: 'top' | 'bottom' | 'left' | 'right';
  if (edgePosition === 'top' || edgePosition === 'bottom') {
    perpEdgePosition = cornerSide === 'start' ? 'left' : 'right';
  } else {
    perpEdgePosition = cornerSide === 'start' ? 'bottom' : 'top';
  }

  // Get the face at the perpendicular edge
  const perpEdgeInfo = edges.find(e => e.position === perpEdgePosition);
  if (!perpEdgeInfo) return { extension: 0, perpFaceId: null };

  const perpFaceId = perpEdgeInfo.adjacentFaceId;
  const perpPanel = existingPanels.find(p => p.source.faceId === perpFaceId);
  if (!perpPanel) return { extension: 0, perpFaceId };

  // Check if that perpendicular panel has an extension on the SAME named edge
  // The edge name mapping depends on the geometric relationship
  // This is a simplified mapping - the perpendicular face's edge that would meet
  // our extension is the same named edge in most cases
  return { extension: perpPanel.edgeExtensions[edgePosition] || 0, perpFaceId };
};

// Get required auto-extensions from adjacent face offsets
// When an adjacent face has a positive offset (moved outward), this panel's edge
// that connects to it needs to be extended to meet the new position
const getAutoExtensionsFromFaceOffsets = (
  faceId: FaceId,
  config: BoxConfig
): EdgeExtensions => {
  const faceOffsets = config.assembly.faceOffsets;
  if (!faceOffsets) return defaultEdgeExtensions;

  const edges = getFaceEdges(faceId);
  const autoExtensions: EdgeExtensions = { top: 0, bottom: 0, left: 0, right: 0 };

  for (const edge of edges) {
    const adjacentFaceId = edge.adjacentFaceId;
    const adjacentOffset = faceOffsets[adjacentFaceId] || 0;

    // Only auto-extend if adjacent face has positive offset (moved outward)
    if (adjacentOffset > 0) {
      autoExtensions[edge.position] = adjacentOffset;
    }
  }

  return autoExtensions;
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
  // locked = male joint (tabs out), cannot move
  // outward-only = female joint (slots), can extend outward only
  // unlocked = open face (straight edge), can move in or out
  status: 'locked' | 'outward-only' | 'unlocked';
}

// For divider panels - dividers always have slots (female joints), never tabs
export const getDividerEdgeStatuses = (
  meetsTop: boolean,    // meets solid top face
  meetsBottom: boolean,
  meetsLeft: boolean,
  meetsRight: boolean
): EdgeStatusInfo[] => {
  // Dividers always have slots (female joints) where they meet solid faces
  // They can always extend outward on those edges
  // Edges meeting open faces are unlocked (straight edge)
  return [
    { position: 'top', status: meetsTop ? 'outward-only' : 'unlocked' },
    { position: 'bottom', status: meetsBottom ? 'outward-only' : 'unlocked' },
    { position: 'left', status: meetsLeft ? 'outward-only' : 'unlocked' },
    { position: 'right', status: meetsRight ? 'outward-only' : 'unlocked' },
  ];
};

// For face panels - determine edge status based on joint type
export const getFaceEdgeStatuses = (
  faceId: FaceId,
  faces: Face[],
  assembly: AssemblyConfig
): EdgeStatusInfo[] => {
  const edges = getFaceEdges(faceId);

  return edges.map((edge) => {
    const adjacentFace = faces.find((f) => f.id === edge.adjacentFaceId);
    const isSolidAdjacent = adjacentFace?.solid ?? false;

    // If adjacent face is open, edge is unlocked (straight edge)
    if (!isSolidAdjacent) {
      return {
        position: edge.position,
        adjacentFaceId: edge.adjacentFaceId,
        status: 'unlocked' as const,
      };
    }

    // Adjacent face is solid - check if this edge has tabs (male) or slots (female)
    const tabsOut = shouldTabOut(faceId, edge.adjacentFaceId, assembly);

    // tabsOut === true: male joint (tabs extending out) - locked
    // tabsOut === false: female joint (slots receiving tabs) - outward-only
    // tabsOut === null: straight edge (e.g., inset lid) - unlocked
    let status: 'locked' | 'outward-only' | 'unlocked';
    if (tabsOut === true) {
      status = 'locked';
    } else if (tabsOut === false) {
      status = 'outward-only';
    } else {
      status = 'unlocked';
    }

    return {
      position: edge.position,
      adjacentFaceId: edge.adjacentFaceId,
      status,
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

  // Get face offset (positive = outward from box center)
  const faceOffset = (assembly.faceOffsets?.[faceId] || 0) * scale;

  // Note: Wall panels with feet extend downward from their original position.
  // The 2D panel geometry has feet extending below -halfH, with center at (0,0).
  // No 3D position offset is needed - the panel is already correctly positioned
  // with top at +halfH and bottom extending down with feet.

  switch (faceId) {
    case 'front':
      // +Z is outward for front face
      return {
        position: [0, 0, halfD - mt / 2 + faceOffset],
        rotation: [0, 0, 0],
      };
    case 'back':
      // -Z is outward for back face
      return {
        position: [0, 0, -halfD + mt / 2 - faceOffset],
        rotation: [0, Math.PI, 0],
      };
    case 'left':
      // -X is outward for left face
      return {
        position: [-halfW + mt / 2 - faceOffset, 0, 0],
        rotation: [0, -Math.PI / 2, 0],
      };
    case 'right':
      // +X is outward for right face
      return {
        position: [halfW - mt / 2 + faceOffset, 0, 0],
        rotation: [0, Math.PI / 2, 0],
      };
    case 'top':
      // +Y is outward for top face, but also adjust for lid inset
      return {
        position: [0, halfH - mt / 2 - getLidInset('positive') + faceOffset, 0],
        rotation: [-Math.PI / 2, 0, 0],
      };
    case 'bottom':
      // -Y is outward for bottom face, but also adjust for lid inset
      return {
        position: [0, -halfH + mt / 2 + getLidInset('negative') - faceOffset, 0],
        rotation: [Math.PI / 2, 0, 0],
      };
  }
};

// =============================================================================
// Feet Path Generation
// =============================================================================

/**
 * Generate a feet path for an edge
 * Creates two feet at the corners with a gap in the middle
 *
 * The path goes (for bottom edge, right to left):
 * 1. Down from start corner by (materialThickness + feetHeight)
 * 2. Horizontal for foot width
 * 3. Up by feetHeight (back to materialThickness level)
 * 4. Horizontal across gap to other foot
 * 5. Down by feetHeight
 * 6. Horizontal for foot width
 * 7. Up to end corner
 */
const generateFeetPath = (
  startX: number,      // X position of start corner (right side for bottom edge)
  endX: number,        // X position of end corner (left side for bottom edge)
  baseY: number,       // Y position of the finger joint edge (original panel bottom)
  feetConfig: { height: number; width: number; inset: number },
  materialThickness: number
): Point[] => {
  const { height: feetHeight, width: footWidth, inset } = feetConfig;

  // The feet extend from baseY down
  // First extend by materialThickness to clear the joint, then by feetHeight for the feet
  const jointClearanceY = baseY - materialThickness;  // Level where joint is cleared
  const feetBottomY = jointClearanceY - feetHeight;   // Bottom of feet

  // Foot positions (accounting for inset from panel edges)
  // For bottom edge going right to left: startX is positive (right), endX is negative (left)
  const rightFootOuterX = startX - inset;
  const rightFootInnerX = rightFootOuterX - footWidth;
  const leftFootInnerX = endX + inset + footWidth;
  const leftFootOuterX = endX + inset;

  // Generate the path points
  const points: Point[] = [];

  // Start at right corner, at the joint level (finger pattern ends here)
  // 1. Go down to feet bottom at right foot outer edge
  points.push({ x: rightFootOuterX, y: baseY });
  points.push({ x: rightFootOuterX, y: feetBottomY });

  // 2. Go left along feet bottom for foot width
  points.push({ x: rightFootInnerX, y: feetBottomY });

  // 3. Go up to joint clearance level
  points.push({ x: rightFootInnerX, y: jointClearanceY });

  // 4. Go left across the gap to left foot inner edge
  points.push({ x: leftFootInnerX, y: jointClearanceY });

  // 5. Go down to feet bottom
  points.push({ x: leftFootInnerX, y: feetBottomY });

  // 6. Go left along feet bottom for foot width
  points.push({ x: leftFootOuterX, y: feetBottomY });

  // 7. Go up to joint level at left corner
  points.push({ x: leftFootOuterX, y: baseY });

  return points;
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
  fingerData?: AssemblyFingerData | null,
  feetEdge?: 'top' | 'bottom' | 'left' | 'right' | null,  // Which edge has feet
  feetConfig?: { height: number; width: number; inset: number } | null
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

  // Calculate extension amounts based on edge type:
  // - Open edge (no adjacent solid face): can extend in any direction
  // - Female joint (has slots, not tabs): can extend outward only (positive extension)
  // - Male joint (has tabs): cannot extend
  const getExtension = (position: 'top' | 'bottom' | 'left' | 'right', ext: number): number => {
    const isOpen = edgeIsUnlocked(position);
    const hasTabs = edgeHasTabs(position);

    // Open face - can extend in any direction
    if (isOpen) return ext;

    // Female joint (solid adjacent, but slots not tabs) - can extend outward only
    // Positive extensions are outward for all edges
    if (!hasTabs && ext > 0) return ext;

    // Male joint or negative extension on female joint - no extension
    return 0;
  };

  const extTop = getExtension('top', edgeExtensions.top);
  const extBottom = getExtension('bottom', edgeExtensions.bottom);
  const extLeft = getExtension('left', edgeExtensions.left);
  const extRight = getExtension('right', edgeExtensions.right);

  // Finger corners - ALWAYS use full insets for consistent finger alignment
  // This ensures fingers on perpendicular edges don't shift when a face is removed
  // NOTE: These must NOT include extensions - finger positions must be consistent
  // across all panels for proper joint alignment
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
  // EXTENSION RULE: When an edge is extended, that edge goes to full width (no perpendicular insets)
  // EXCEPTION: If the perpendicular face ALSO extends the same edge, they meet and need joints

  // Check if perpendicular panels also have extensions on the same edge (would create a meeting)
  // For top edge: check if left panel has 'top' extension (at start/left corner)
  //               check if right panel has 'top' extension (at end/right corner)
  // Each call returns both the extension amount AND the perpendicular face ID for priority checking
  const leftPanelTopExtResult = getPerpendicularFaceExtensionOnSameEdge(faceId, 'top', 'start', existingPanels);
  const rightPanelTopExtResult = getPerpendicularFaceExtensionOnSameEdge(faceId, 'top', 'end', existingPanels);
  const leftPanelBottomExtResult = getPerpendicularFaceExtensionOnSameEdge(faceId, 'bottom', 'start', existingPanels);
  const rightPanelBottomExtResult = getPerpendicularFaceExtensionOnSameEdge(faceId, 'bottom', 'end', existingPanels);
  const bottomPanelLeftExtResult = getPerpendicularFaceExtensionOnSameEdge(faceId, 'left', 'start', existingPanels);
  const topPanelLeftExtResult = getPerpendicularFaceExtensionOnSameEdge(faceId, 'left', 'end', existingPanels);
  const bottomPanelRightExtResult = getPerpendicularFaceExtensionOnSameEdge(faceId, 'right', 'start', existingPanels);
  const topPanelRightExtResult = getPerpendicularFaceExtensionOnSameEdge(faceId, 'right', 'end', existingPanels);

  // Extract extension amounts for backward compatibility
  const leftPanelTopExt = leftPanelTopExtResult.extension;
  const rightPanelTopExt = rightPanelTopExtResult.extension;
  const leftPanelBottomExt = leftPanelBottomExtResult.extension;
  const rightPanelBottomExt = rightPanelBottomExtResult.extension;
  const bottomPanelLeftExt = bottomPanelLeftExtResult.extension;
  const topPanelLeftExt = topPanelLeftExtResult.extension;
  const bottomPanelRightExt = bottomPanelRightExtResult.extension;
  const topPanelRightExt = topPanelRightExtResult.extension;

  // Helper to get X position for corners
  // When top or bottom is extended at this corner, skip the left/right inset for that edge
  // UNLESS the perpendicular panel also has an extension on the same edge (meeting case)
  const getCornerX = (
    side: 'left' | 'right',
    thisEdgeExt: number,  // Extension on the horizontal edge at this corner (extTop or extBottom)
    perpEdgeExt: number,  // Extension on the perpendicular face's same-named edge
    ownExt: number        // Extension on this side's edge (extLeft or extRight)
  ): number => {
    const baseX = side === 'left' ? -halfW : halfW;
    const isSolid = side === 'left' ? leftIsSolid : rightIsSolid;
    const hasTabs = side === 'left' ? leftHasTabs : rightHasTabs;
    const insetDir = side === 'left' ? 1 : -1;
    const extDir = side === 'left' ? -1 : 1;

    // Determine if we should skip the inset for full-width extension
    // Skip inset if: horizontal edge has extension AND perpendicular doesn't have matching extension
    const hasNonMeetingExtension = thisEdgeExt > 0 && perpEdgeExt <= 0;

    // Apply inset if:
    // 1. Adjacent face has tabs (normal case)
    // 2. AND NOT (this edge extends without meeting perpendicular extension)
    const applyInset = (isSolid && hasTabs) && !hasNonMeetingExtension;

    return baseX + (applyInset ? insetDir * materialThickness : 0) + extDir * ownExt;
  };

  // Helper to get Y position for corners
  // When left or right is extended at this corner, skip the top/bottom inset for that edge
  // UNLESS the perpendicular panel also has an extension on the same edge (meeting case)
  const getCornerY = (
    side: 'top' | 'bottom',
    thisEdgeExt: number,  // Extension on the vertical edge at this corner (extLeft or extRight)
    perpEdgeExt: number,  // Extension on the perpendicular face's same-named edge
    ownExt: number        // Extension on this side's edge (extTop or extBottom)
  ): number => {
    const baseY = side === 'top' ? halfH : -halfH;
    const isSolid = side === 'top' ? topIsSolid : bottomIsSolid;
    const hasTabs = side === 'top' ? topHasTabs : bottomHasTabs;
    const insetDir = side === 'top' ? -1 : 1;
    const extDir = side === 'top' ? 1 : -1;

    // Determine if we should skip the inset for full-width extension
    // Skip inset if: vertical edge has extension AND perpendicular doesn't have matching extension
    const hasNonMeetingExtension = thisEdgeExt > 0 && perpEdgeExt <= 0;

    // Apply inset if:
    // 1. Adjacent face has tabs (normal case)
    // 2. AND NOT (this edge extends without meeting perpendicular extension)
    const applyInset = (isSolid && hasTabs) && !hasNonMeetingExtension;

    return baseY + (applyInset ? insetDir * materialThickness : 0) + extDir * ownExt;
  };

  // For L-shaped extensions, we need both the "main body" corners (with insets)
  // and the "extension" corners (full width). The outline will include step transitions.

  // Main body corners - always apply insets where adjacent face has tabs
  const mainCorners: Record<string, Point> = {
    topLeft: {
      x: -halfW + (leftIsSolid && leftHasTabs ? materialThickness : 0),
      y: halfH - (topIsSolid && topHasTabs ? materialThickness : 0)
    },
    topRight: {
      x: halfW - (rightIsSolid && rightHasTabs ? materialThickness : 0),
      y: halfH - (topIsSolid && topHasTabs ? materialThickness : 0)
    },
    bottomRight: {
      x: halfW - (rightIsSolid && rightHasTabs ? materialThickness : 0),
      y: -halfH + (bottomIsSolid && bottomHasTabs ? materialThickness : 0)
    },
    bottomLeft: {
      x: -halfW + (leftIsSolid && leftHasTabs ? materialThickness : 0),
      y: -halfH + (bottomIsSolid && bottomHasTabs ? materialThickness : 0)
    },
  };

  // Check individual corner meeting conditions using the correct perpendicular face for priority
  // A meeting only affects THIS panel if it does NOT have priority (i.e., it must give way)
  // Use the perpFaceId from each specific meeting check to determine priority correctly
  const topLeftMeetsOnTop = extTop > 0 && leftPanelTopExt > 0 &&
    (leftPanelTopExtResult.perpFaceId ? !hasPriorityOverPerpFace(faceId, leftPanelTopExtResult.perpFaceId) : false);
  const topRightMeetsOnTop = extTop > 0 && rightPanelTopExt > 0 &&
    (rightPanelTopExtResult.perpFaceId ? !hasPriorityOverPerpFace(faceId, rightPanelTopExtResult.perpFaceId) : false);
  const bottomLeftMeetsOnBottom = extBottom > 0 && leftPanelBottomExt > 0 &&
    (leftPanelBottomExtResult.perpFaceId ? !hasPriorityOverPerpFace(faceId, leftPanelBottomExtResult.perpFaceId) : false);
  const bottomRightMeetsOnBottom = extBottom > 0 && rightPanelBottomExt > 0 &&
    (rightPanelBottomExtResult.perpFaceId ? !hasPriorityOverPerpFace(faceId, rightPanelBottomExtResult.perpFaceId) : false);
  const topLeftMeetsOnLeft = extLeft > 0 && topPanelLeftExt > 0 &&
    (topPanelLeftExtResult.perpFaceId ? !hasPriorityOverPerpFace(faceId, topPanelLeftExtResult.perpFaceId) : false);
  const bottomLeftMeetsOnLeft = extLeft > 0 && bottomPanelLeftExt > 0 &&
    (bottomPanelLeftExtResult.perpFaceId ? !hasPriorityOverPerpFace(faceId, bottomPanelLeftExtResult.perpFaceId) : false);
  const topRightMeetsOnRight = extRight > 0 && topPanelRightExt > 0 &&
    (topPanelRightExtResult.perpFaceId ? !hasPriorityOverPerpFace(faceId, topPanelRightExtResult.perpFaceId) : false);
  const bottomRightMeetsOnRight = extRight > 0 && bottomPanelRightExt > 0 &&
    (bottomPanelRightExtResult.perpFaceId ? !hasPriorityOverPerpFace(faceId, bottomPanelRightExtResult.perpFaceId) : false);

  // Check if each extension goes full width (no meeting with perpendicular panel where we must give way)
  const topGoesFullWidth = extTop > 0 && !topLeftMeetsOnTop && !topRightMeetsOnTop;
  const bottomGoesFullWidth = extBottom > 0 && !bottomLeftMeetsOnBottom && !bottomRightMeetsOnBottom;
  const leftGoesFullWidth = extLeft > 0 && !topLeftMeetsOnLeft && !bottomLeftMeetsOnLeft;
  const rightGoesFullWidth = extRight > 0 && !topRightMeetsOnRight && !bottomRightMeetsOnRight;

  // Calculate overlap inset for corners where this panel is the "loser"
  // When both panels extend the same edge and this panel doesn't have priority,
  // the PERPENDICULAR edge at that corner needs to be inset by materialThickness
  // to make room for the winner's material in 3D space.
  //
  // Key insight: When we "lose" on a horizontal edge (top/bottom), the winner's
  // material occupies the corner, so we need to INSET the X coordinate.
  // When we "lose" on a vertical edge (left/right), we need to INSET the Y coordinate.
  const getOverlapInset = (
    meetsOnHorizontal: boolean,  // Meeting detected on horizontal edge (top/bottom)
    meetsOnVertical: boolean,    // Meeting detected on vertical edge (left/right)
    horizontalExt: number,       // Extension on horizontal edge (top/bottom)
    verticalExt: number          // Extension on vertical edge (left/right)
  ): { insetX: number; insetY: number } => {
    // Meeting on horizontal edge → winner's material at corner → inset X (perpendicular)
    const insetX = (meetsOnHorizontal && horizontalExt > 0) ? materialThickness : 0;
    // Meeting on vertical edge → winner's material at corner → inset Y (perpendicular)
    const insetY = (meetsOnVertical && verticalExt > 0) ? materialThickness : 0;
    return { insetX, insetY };
  };

  // Get inset for each corner
  const topLeftInset = getOverlapInset(topLeftMeetsOnTop, topLeftMeetsOnLeft, extTop, extLeft);
  const topRightInset = getOverlapInset(topRightMeetsOnTop, topRightMeetsOnRight, extTop, extRight);
  const bottomRightInset = getOverlapInset(bottomRightMeetsOnBottom, bottomRightMeetsOnRight, extBottom, extRight);
  const bottomLeftInset = getOverlapInset(bottomLeftMeetsOnBottom, bottomLeftMeetsOnLeft, extBottom, extLeft);

  // Extension corners - where extended edges end
  //
  // For each corner, X and Y are determined independently:
  // - X depends on: vertical extension (left/right) and whether we LOSE on HORIZONTAL edge
  //   - Losing on horizontal edge = perpendicular panel occupies corner = stay inset in X
  // - Y depends on: horizontal extension (top/bottom) and whether we LOSE on VERTICAL edge
  //   - Losing on vertical edge = perpendicular panel occupies corner = stay inset in Y
  //
  // Key insight: X and Y are INDEPENDENT. We can extend in Y while staying inset in X, and vice versa.
  //
  // For X coordinate at corner:
  // - If vertical edge extends AND we win on that edge → full width in X direction
  // - If horizontal edge extends AND we win on that edge → full width in X direction
  // - If we lose on horizontal edge → stay inset in X (perpendicular panel has priority)
  // - If none of the above → use mainCorners (normal inset)
  //
  // For Y coordinate at corner:
  // - If horizontal edge extends → extend to that position (Y direction)
  // - If we lose on vertical edge → stay inset in Y
  // - Otherwise → use mainCorners (normal inset)

  const extCorners: Record<string, Point> = {
    topLeft: {
      // X: Go full width if we win on top or left edge
      // If we LOSE on horizontal (top) edge while extending, we need to NOTCH (inset by MT)
      // to make room for the winner's extension material
      x: (extTop > 0 && !topLeftMeetsOnTop) || (extLeft > 0 && !topLeftMeetsOnLeft)
        ? -halfW - extLeft  // Full width (winner)
        : (topLeftMeetsOnTop && extTop > 0)
          ? -halfW + materialThickness - extLeft  // Notched: inset by MT from outer edge
          : mainCorners.topLeft.x - extLeft,  // Normal (no extension or no meeting)
      // Y: Extend to top + extTop if we're extending top; stay inset if we lose on left
      y: (extTop > 0)
        ? (topLeftMeetsOnLeft ? mainCorners.topLeft.y + extTop : halfH + extTop)  // Extend Y, inset Y only if lose on left
        : (extLeft > 0)
          ? halfH + extTop  // Extending left, Y goes to full height + any top ext
          : mainCorners.topLeft.y + extTop  // No extension wins, stay at mainCorners
    },
    topRight: {
      // X: Similar logic - notch if we lose on horizontal (top) edge
      x: (extTop > 0 && !topRightMeetsOnTop) || (extRight > 0 && !topRightMeetsOnRight)
        ? halfW + extRight  // Full width (winner)
        : (topRightMeetsOnTop && extTop > 0)
          ? halfW - materialThickness + extRight  // Notched: inset by MT from outer edge
          : mainCorners.topRight.x + extRight,  // Normal
      y: (extTop > 0)
        ? (topRightMeetsOnRight ? mainCorners.topRight.y + extTop : halfH + extTop)
        : (extRight > 0)
          ? halfH + extTop
          : mainCorners.topRight.y + extTop
    },
    bottomRight: {
      // X: Notch if we lose on horizontal (bottom) edge
      x: (extBottom > 0 && !bottomRightMeetsOnBottom) || (extRight > 0 && !bottomRightMeetsOnRight)
        ? halfW + extRight  // Full width (winner)
        : (bottomRightMeetsOnBottom && extBottom > 0)
          ? halfW - materialThickness + extRight  // Notched: inset by MT from outer edge
          : mainCorners.bottomRight.x + extRight,  // Normal
      y: (extBottom > 0)
        ? (bottomRightMeetsOnRight ? mainCorners.bottomRight.y - extBottom : -halfH - extBottom)
        : (extRight > 0)
          ? -halfH - extBottom
          : mainCorners.bottomRight.y - extBottom
    },
    bottomLeft: {
      // X: Notch if we lose on horizontal (bottom) edge
      x: (extBottom > 0 && !bottomLeftMeetsOnBottom) || (extLeft > 0 && !bottomLeftMeetsOnLeft)
        ? -halfW - extLeft  // Full width (winner)
        : (bottomLeftMeetsOnBottom && extBottom > 0)
          ? -halfW + materialThickness - extLeft  // Notched: inset by MT from outer edge
          : mainCorners.bottomLeft.x - extLeft,  // Normal
      y: (extBottom > 0)
        ? (bottomLeftMeetsOnLeft ? mainCorners.bottomLeft.y - extBottom : -halfH - extBottom)
        : (extLeft > 0)
          ? -halfH - extBottom
          : mainCorners.bottomLeft.y - extBottom
    },
  };

  // Capture debug information for extension overlap analysis
  if (extTop > 0 || extBottom > 0 || extLeft > 0 || extRight > 0) {
    const cornerDebugInfos: CornerDebugInfo[] = [
      {
        corner: 'topLeft',
        meetsOnHorizontal: topLeftMeetsOnTop,
        meetsOnVertical: topLeftMeetsOnLeft,
        perpFaceIdHorizontal: leftPanelTopExtResult.perpFaceId,
        perpFaceIdVertical: topPanelLeftExtResult.perpFaceId,
        hasPriorityHorizontal: leftPanelTopExtResult.perpFaceId ? hasPriorityOverPerpFace(faceId, leftPanelTopExtResult.perpFaceId) : null,
        hasPriorityVertical: topPanelLeftExtResult.perpFaceId ? hasPriorityOverPerpFace(faceId, topPanelLeftExtResult.perpFaceId) : null,
        goesFullWidth: topGoesFullWidth || leftGoesFullWidth,
        finalX: extCorners.topLeft.x,
        finalY: extCorners.topLeft.y,
        usedMainCornersX: !((extTop > 0 && !topLeftMeetsOnTop) || (extLeft > 0 && !topLeftMeetsOnLeft)),
        usedMainCornersY: !(extTop > 0) && !(extLeft > 0),
        notchedX: topLeftMeetsOnTop && extTop > 0,  // Notched X due to losing on horizontal edge
        notchedY: topLeftMeetsOnLeft && extLeft > 0,  // Notched Y due to losing on vertical edge
      },
      {
        corner: 'topRight',
        meetsOnHorizontal: topRightMeetsOnTop,
        meetsOnVertical: topRightMeetsOnRight,
        perpFaceIdHorizontal: rightPanelTopExtResult.perpFaceId,
        perpFaceIdVertical: topPanelRightExtResult.perpFaceId,
        hasPriorityHorizontal: rightPanelTopExtResult.perpFaceId ? hasPriorityOverPerpFace(faceId, rightPanelTopExtResult.perpFaceId) : null,
        hasPriorityVertical: topPanelRightExtResult.perpFaceId ? hasPriorityOverPerpFace(faceId, topPanelRightExtResult.perpFaceId) : null,
        goesFullWidth: topGoesFullWidth || rightGoesFullWidth,
        finalX: extCorners.topRight.x,
        finalY: extCorners.topRight.y,
        usedMainCornersX: !((extTop > 0 && !topRightMeetsOnTop) || (extRight > 0 && !topRightMeetsOnRight)),
        usedMainCornersY: !(extTop > 0) && !(extRight > 0),
        notchedX: topRightMeetsOnTop && extTop > 0,
        notchedY: topRightMeetsOnRight && extRight > 0,
      },
      {
        corner: 'bottomRight',
        meetsOnHorizontal: bottomRightMeetsOnBottom,
        meetsOnVertical: bottomRightMeetsOnRight,
        perpFaceIdHorizontal: rightPanelBottomExtResult.perpFaceId,
        perpFaceIdVertical: bottomPanelRightExtResult.perpFaceId,
        hasPriorityHorizontal: rightPanelBottomExtResult.perpFaceId ? hasPriorityOverPerpFace(faceId, rightPanelBottomExtResult.perpFaceId) : null,
        hasPriorityVertical: bottomPanelRightExtResult.perpFaceId ? hasPriorityOverPerpFace(faceId, bottomPanelRightExtResult.perpFaceId) : null,
        goesFullWidth: bottomGoesFullWidth || rightGoesFullWidth,
        finalX: extCorners.bottomRight.x,
        finalY: extCorners.bottomRight.y,
        usedMainCornersX: !((extBottom > 0 && !bottomRightMeetsOnBottom) || (extRight > 0 && !bottomRightMeetsOnRight)),
        usedMainCornersY: !(extBottom > 0) && !(extRight > 0),
        notchedX: bottomRightMeetsOnBottom && extBottom > 0,
        notchedY: bottomRightMeetsOnRight && extRight > 0,
      },
      {
        corner: 'bottomLeft',
        meetsOnHorizontal: bottomLeftMeetsOnBottom,
        meetsOnVertical: bottomLeftMeetsOnLeft,
        perpFaceIdHorizontal: leftPanelBottomExtResult.perpFaceId,
        perpFaceIdVertical: bottomPanelLeftExtResult.perpFaceId,
        hasPriorityHorizontal: leftPanelBottomExtResult.perpFaceId ? hasPriorityOverPerpFace(faceId, leftPanelBottomExtResult.perpFaceId) : null,
        hasPriorityVertical: bottomPanelLeftExtResult.perpFaceId ? hasPriorityOverPerpFace(faceId, bottomPanelLeftExtResult.perpFaceId) : null,
        goesFullWidth: bottomGoesFullWidth || leftGoesFullWidth,
        finalX: extCorners.bottomLeft.x,
        finalY: extCorners.bottomLeft.y,
        usedMainCornersX: !((extBottom > 0 && !bottomLeftMeetsOnBottom) || (extLeft > 0 && !bottomLeftMeetsOnLeft)),
        usedMainCornersY: !(extBottom > 0) && !(extLeft > 0),
        notchedX: bottomLeftMeetsOnBottom && extBottom > 0,
        notchedY: bottomLeftMeetsOnLeft && extLeft > 0,
      },
    ];

    const panelDebug: PanelDebugInfo = {
      faceId,
      extensions: { top: extTop, bottom: extBottom, left: extLeft, right: extRight },
      perpExtensions: {
        leftPanelTop: leftPanelTopExt,
        rightPanelTop: rightPanelTopExt,
        leftPanelBottom: leftPanelBottomExt,
        rightPanelBottom: rightPanelBottomExt,
        topPanelLeft: topPanelLeftExt,
        bottomPanelLeft: bottomPanelLeftExt,
        topPanelRight: topPanelRightExt,
        bottomPanelRight: bottomPanelRightExt,
      },
      corners: cornerDebugInfos,
      mainCorners: {
        topLeft: { x: mainCorners.topLeft.x, y: mainCorners.topLeft.y },
        topRight: { x: mainCorners.topRight.x, y: mainCorners.topRight.y },
        bottomRight: { x: mainCorners.bottomRight.x, y: mainCorners.bottomRight.y },
        bottomLeft: { x: mainCorners.bottomLeft.x, y: mainCorners.bottomLeft.y },
      },
      extCorners: {
        topLeft: { x: extCorners.topLeft.x, y: extCorners.topLeft.y },
        topRight: { x: extCorners.topRight.x, y: extCorners.topRight.y },
        bottomRight: { x: extCorners.bottomRight.x, y: extCorners.bottomRight.y },
        bottomLeft: { x: extCorners.bottomLeft.x, y: extCorners.bottomLeft.y },
      },
    };
    addPanelDebug(panelDebug);
  }

  // Determine actual outline corners - use extension corners if there's an extension,
  // otherwise use main corners
  const outlineCorners: Record<string, Point> = {
    topLeft: (extTop > 0 || extLeft > 0) ? extCorners.topLeft : mainCorners.topLeft,
    topRight: (extTop > 0 || extRight > 0) ? extCorners.topRight : mainCorners.topRight,
    bottomRight: (extBottom > 0 || extRight > 0) ? extCorners.bottomRight : mainCorners.bottomRight,
    bottomLeft: (extBottom > 0 || extLeft > 0) ? extCorners.bottomLeft : mainCorners.bottomLeft,
  };

  // Step points for L-shaped transitions
  // These are needed when an extended edge (full width) connects to a non-extended edge (with inset)
  const stepPoints: Record<string, { before?: Point; after?: Point }> = {
    topLeft: {},
    topRight: {},
    bottomRight: {},
    bottomLeft: {},
  };

  // Bottom-left corner: if bottom extends full width but left doesn't (or has inset)
  if (bottomGoesFullWidth && extLeft <= 0 && (leftIsSolid && leftHasTabs)) {
    // Coming from bottom edge (at full width) to left edge (with inset)
    // Need step: (-halfW, -halfH) -> (-halfW + inset, -halfH) -> up the left edge
    stepPoints.bottomLeft.after = { x: mainCorners.bottomLeft.x, y: -halfH };
  }
  if (leftGoesFullWidth && extBottom <= 0 && (bottomIsSolid && bottomHasTabs)) {
    // Coming from left edge (at full width) to bottom edge (with inset)
    stepPoints.bottomLeft.before = { x: -halfW, y: mainCorners.bottomLeft.y };
  }

  // Bottom-right corner
  if (bottomGoesFullWidth && extRight <= 0 && (rightIsSolid && rightHasTabs)) {
    stepPoints.bottomRight.before = { x: mainCorners.bottomRight.x, y: -halfH };
  }
  if (rightGoesFullWidth && extBottom <= 0 && (bottomIsSolid && bottomHasTabs)) {
    stepPoints.bottomRight.after = { x: halfW, y: mainCorners.bottomRight.y };
  }

  // Top-right corner
  if (topGoesFullWidth && extRight <= 0 && (rightIsSolid && rightHasTabs)) {
    stepPoints.topRight.after = { x: mainCorners.topRight.x, y: halfH };
  }
  if (rightGoesFullWidth && extTop <= 0 && (topIsSolid && topHasTabs)) {
    stepPoints.topRight.before = { x: halfW, y: mainCorners.topRight.y };
  }

  // Top-left corner
  if (topGoesFullWidth && extLeft <= 0 && (leftIsSolid && leftHasTabs)) {
    stepPoints.topLeft.before = { x: mainCorners.topLeft.x, y: halfH };
  }
  if (leftGoesFullWidth && extTop <= 0 && (topIsSolid && topHasTabs)) {
    stepPoints.topLeft.after = { x: -halfW, y: mainCorners.topLeft.y };
  }

  // Edge configs with both outline corners (for panel shape) and finger corners (for finger calculation)
  // Include step point keys for L-shaped transitions
  const edgeConfigs = [
    {
      start: outlineCorners.topLeft, end: outlineCorners.topRight,
      fingerStart: fingerCorners.topLeft, fingerEnd: fingerCorners.topRight,
      edgeInfo: edges.find((e) => e.position === 'top')!,
      startExt: { perpendicular: extLeft, parallel: extTop },
      endExt: { perpendicular: extRight, parallel: extTop },
      startCorner: 'topLeft' as const,
      endCorner: 'topRight' as const,
    },
    {
      start: outlineCorners.topRight, end: outlineCorners.bottomRight,
      fingerStart: fingerCorners.topRight, fingerEnd: fingerCorners.bottomRight,
      edgeInfo: edges.find((e) => e.position === 'right')!,
      startExt: { perpendicular: extTop, parallel: extRight },
      endExt: { perpendicular: extBottom, parallel: extRight },
      startCorner: 'topRight' as const,
      endCorner: 'bottomRight' as const,
    },
    {
      start: outlineCorners.bottomRight, end: outlineCorners.bottomLeft,
      fingerStart: fingerCorners.bottomRight, fingerEnd: fingerCorners.bottomLeft,
      edgeInfo: edges.find((e) => e.position === 'bottom')!,
      startExt: { perpendicular: extRight, parallel: extBottom },
      endExt: { perpendicular: extLeft, parallel: extBottom },
      startCorner: 'bottomRight' as const,
      endCorner: 'bottomLeft' as const,
    },
    {
      start: outlineCorners.bottomLeft, end: outlineCorners.topLeft,
      fingerStart: fingerCorners.bottomLeft, fingerEnd: fingerCorners.topLeft,
      edgeInfo: edges.find((e) => e.position === 'left')!,
      startExt: { perpendicular: extBottom, parallel: extLeft },
      endExt: { perpendicular: extTop, parallel: extLeft },
      startCorner: 'bottomLeft' as const,
      endCorner: 'topLeft' as const,
    },
  ];

  const outlinePoints: PathPoint[] = [];

  for (const { start, end, fingerStart, fingerEnd, edgeInfo, startExt, endExt, startCorner, endCorner } of edgeConfigs) {
    const adjacentFace = faces.find((f) => f.id === edgeInfo.adjacentFaceId);
    const isSolidAdjacent = adjacentFace?.solid ?? false;
    const hasFingers = edgeHasFingers(edgeInfo.position);

    // Check if this edge has been extended outward (parallel extension > 0)
    // When extended, the outline should be straight - finger joints become slot holes
    const hasParallelExtension = (startExt.parallel > 0) || (endExt.parallel > 0);
    const parallelExt = startExt.parallel > 0 ? startExt.parallel : endExt.parallel;

    // Get step points for L-shaped transitions at corners
    const startStepAfter = stepPoints[startCorner]?.after;
    const endStepBefore = stepPoints[endCorner]?.before;

    let points: Point[];
    let usedFingerTransitions = false; // Track if adjustedPoints handled L-shape transitions

    // Use pre-calculated assembly finger points for aligned finger joints
    // BUT NOT if the edge has been extended (those get slot holes instead)
    if (fingerData && isSolidAdjacent && hasFingers && !hasParallelExtension) {
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

        // If outline corners differ from finger corners, add L-shaped step transitions
        // This happens when an extension goes to full width but fingers stay at inset position
        const adjustedPoints: Point[] = [];

        // Get actual start/end points of the finger path (may differ from fingerStart/fingerEnd)
        const fingerPathStart = fingerPathPoints[0];
        const fingerPathEnd = fingerPathPoints[fingerPathPoints.length - 1];

        const startDiffX = Math.abs(start.x - fingerPathStart.x);
        const startDiffY = Math.abs(start.y - fingerPathStart.y);
        const needsStartTransition = startDiffX > 0.01 || startDiffY > 0.01;

        if (needsStartTransition) {
          // Add start point (extended corner)
          adjustedPoints.push(start);

          // Add intermediate point(s) to create L-shape instead of diagonal
          // Use actual fingerPathStart coordinates to ensure proper alignment
          if (isHorizontalEdge) {
            // Horizontal edge: step along X first (parallel to edge), then Y
            if (startDiffX > 0.01) {
              adjustedPoints.push({ x: fingerPathStart.x, y: start.y });
            }
          } else {
            // Vertical edge: step along Y first (parallel to edge), then X
            if (startDiffY > 0.01) {
              adjustedPoints.push({ x: start.x, y: fingerPathStart.y });
            }
          }
        }

        // Add all finger path points
        adjustedPoints.push(...fingerPathPoints);

        // Add L-shaped transition from finger end to outline end
        const endDiffX = Math.abs(end.x - fingerPathEnd.x);
        const endDiffY = Math.abs(end.y - fingerPathEnd.y);
        const needsEndTransition = endDiffX > 0.01 || endDiffY > 0.01;

        if (needsEndTransition) {
          // Add intermediate point(s) for L-shape
          // Use actual fingerPathEnd coordinates to ensure proper alignment
          if (isHorizontalEdge) {
            // Horizontal edge: step along Y first (perpendicular), then X
            if (endDiffY > 0.01) {
              adjustedPoints.push({ x: fingerPathEnd.x, y: end.y });
            }
          } else {
            // Vertical edge: step along X first (perpendicular), then Y
            if (endDiffX > 0.01) {
              adjustedPoints.push({ x: end.x, y: fingerPathEnd.y });
            }
          }

          // Add end point (extended corner)
          adjustedPoints.push(end);
        }

        points = adjustedPoints;
        usedFingerTransitions = true; // adjustedPoints already handles L-shape transitions
      } else {
        // Gender is null = straight edge
        points = [start, end];
      }
    } else if (hasParallelExtension) {
      // Edge with extension - straight edge (finger joints become slot holes)
      points = [start, end];
    } else {
      // No finger data or not a solid adjacent face - straight edge
      points = [start, end];
    }

    // Insert step points for L-shaped transitions
    // Only apply when NOT using finger transitions (which already handle L-shapes)
    if (!usedFingerTransitions) {
      // Step after start: insert right after the start corner
      if (startStepAfter) {
        // Find where to insert (after start point)
        const newPoints: Point[] = [points[0], startStepAfter];
        for (let i = 1; i < points.length; i++) {
          newPoints.push(points[i]);
        }
        points = newPoints;
      }
      // Step before end: insert right before the end corner
      if (endStepBefore) {
        // Insert before the last point
        const newPoints: Point[] = [];
        for (let i = 0; i < points.length - 1; i++) {
          newPoints.push(points[i]);
        }
        newPoints.push(endStepBefore);
        newPoints.push(points[points.length - 1]);
        points = newPoints;
      }
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

  // Post-process: Insert feet path if needed
  // The feet replace the bottom edge segment (from bottomRight to bottomLeft)
  if (feetEdge === 'bottom' && feetConfig) {
    // Find the bottom corners in the outline
    // bottomRight is around index where right edge ends / bottom edge starts
    // bottomLeft is around index where bottom edge ends / left edge starts
    const baseY = fingerCorners.bottomRight.y;

    // Find the approximate bottomRight and bottomLeft positions
    const bottomRightX = fingerCorners.bottomRight.x;
    const bottomLeftX = fingerCorners.bottomLeft.x;

    // Find indices of points near bottom corners
    let bottomRightIdx = -1;
    let bottomLeftIdx = -1;
    const tolerance = 0.1;

    for (let i = 0; i < outlinePoints.length; i++) {
      const p = outlinePoints[i];
      // Look for points at the bottom Y level
      if (Math.abs(p.y - baseY) < tolerance) {
        if (Math.abs(p.x - bottomRightX) < tolerance && bottomRightIdx === -1) {
          bottomRightIdx = i;
        }
        if (Math.abs(p.x - bottomLeftX) < tolerance) {
          bottomLeftIdx = i;
        }
      }
    }

    // If we found both corners, replace the segment between them with feet path
    if (bottomRightIdx !== -1 && bottomLeftIdx !== -1 && bottomRightIdx < bottomLeftIdx) {
      const feetPath = generateFeetPath(
        bottomRightX,
        bottomLeftX,
        baseY,
        feetConfig,
        materialThickness
      );

      // Remove the old bottom segment and insert feet path
      const beforeBottom = outlinePoints.slice(0, bottomRightIdx);
      const afterBottom = outlinePoints.slice(bottomLeftIdx + 1);

      // Rebuild outline: before + feet path + after
      outlinePoints.length = 0;
      outlinePoints.push(...beforeBottom);
      outlinePoints.push(...feetPath);
      outlinePoints.push(...afterBottom);
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
              // Note: Do NOT apply slotCenterOffset here. The finger positions are already
              // in absolute coordinates (0 to maxJoint), and the effectiveLow/effectiveHigh
              // range already accounts for where the divider actually extends.
              // Adding slotCenterOffset would double-count the offset, causing slots to
              // appear outside the panel bounds for nested subdivisions.
              const offsetStart = clippedStart - maxJoint / 2;
              const offsetEnd = clippedEnd - maxJoint / 2;

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

// Generate slot holes for edges that have been extended outward
// When an edge is extended (e.g., for feet or via 2D editor), the finger pattern
// becomes slot holes at the original edge position instead of being part of the outline
const generateExtensionSlotHoles = (
  faceId: FaceId,
  faces: Face[],
  config: BoxConfig,
  edgeExtensions: EdgeExtensions,
  fingerData?: AssemblyFingerData | null
): PanelHole[] => {
  const holes: PanelHole[] = [];
  if (!fingerData) return holes;

  const { materialThickness, assembly } = config;
  const dims = getFaceDimensions(faceId, config);
  const edges = getFaceEdges(faceId);
  const halfW = dims.width / 2;
  const halfH = dims.height / 2;

  // Get extensions
  const extTop = edgeExtensions.top ?? 0;
  const extBottom = edgeExtensions.bottom ?? 0;
  const extLeft = edgeExtensions.left ?? 0;
  const extRight = edgeExtensions.right ?? 0;

  // Check which perpendicular edges have tabs
  const edgeHasTabs = (position: 'top' | 'bottom' | 'left' | 'right'): boolean => {
    const edgeInfo = edges.find(e => e.position === position)!;
    const adjacentFace = faces.find(f => f.id === edgeInfo.adjacentFaceId);
    const isSolidAdjacent = adjacentFace?.solid ?? false;
    const tabOut = shouldTabOut(faceId, edgeInfo.adjacentFaceId, assembly);
    return isSolidAdjacent && tabOut === true;
  };

  const topHasTabs = edgeHasTabs('top');
  const bottomHasTabs = edgeHasTabs('bottom');
  const leftHasTabs = edgeHasTabs('left');
  const rightHasTabs = edgeHasTabs('right');

  // Process each edge
  for (const edgeInfo of edges) {
    const position = edgeInfo.position;
    const adjacentFace = faces.find(f => f.id === edgeInfo.adjacentFaceId);
    const isSolidAdjacent = adjacentFace?.solid ?? false;

    // Get extension for this edge
    const extension = edgeExtensions[position] ?? 0;

    // Check if this edge is male (tabs-out) or female (slots-in)
    // We only need slot holes for female edges - male edges lose their tabs when extended
    // and the connection breaks (the adjacent panel would need to change, not us)
    const tabOut = shouldTabOut(faceId, edgeInfo.adjacentFaceId, assembly);
    // Female edge: adjacent face is solid AND we're NOT tabbing out (we receive tabs)
    // Also need to handle tabOut === null (inset lid case) - treat as needing holes if there's extension
    const isFemaleEdge = isSolidAdjacent && (tabOut === false || tabOut === null);

    // Only generate slot holes if:
    // 1. The edge has a positive outward extension
    // 2. The adjacent face is solid (there would have been finger joints)
    // 3. The edge is female (receiving tabs from adjacent panel)
    if (extension <= 0 || !isSolidAdjacent || !isFemaleEdge) continue;

    // Get the axis and finger data for this edge
    const axis = getEdgeAxis(faceId, position);
    const axisFingerPoints = fingerData[axis];
    if (!axisFingerPoints) continue;

    const { points: transitionPoints, innerOffset, fingerLength } = axisFingerPoints;
    if (fingerLength <= 0) continue;

    // Determine which perpendicular edges have tabs
    const isHorizontalEdge = position === 'top' || position === 'bottom';
    let lowHasTabs: boolean;
    let highHasTabs: boolean;
    if (isHorizontalEdge) {
      lowHasTabs = leftHasTabs;
      highHasTabs = rightHasTabs;
    } else {
      lowHasTabs = bottomHasTabs;
      highHasTabs = topHasTabs;
    }

    // Calculate the edge positions in axis coordinates
    const { startPos, endPos } = getEdgeAxisPositions(faceId, position, config, lowHasTabs, highHasTabs);
    // Normalize to minPos/maxPos since edge direction varies (bottom/right edges run in negative direction)
    const minPos = Math.min(startPos, endPos);
    const maxPos = Math.max(startPos, endPos);

    // Calculate the slot position (perpendicular to the edge, at the original edge position)
    // The original edge position is at ±halfW or ±halfH minus the extension
    // But actually, slots should be inset by materialThickness/2 from the original edge
    let slotPosition: number;
    switch (position) {
      case 'top':
        // Original top edge was at halfH, now extended to halfH + extTop
        // Slot center should be at the original edge position: halfH - mt/2 (for mt-wide slot centered on edge)
        slotPosition = halfH - materialThickness / 2;
        break;
      case 'bottom':
        slotPosition = -halfH + materialThickness / 2;
        break;
      case 'right':
        slotPosition = halfW - materialThickness / 2;
        break;
      case 'left':
        slotPosition = -halfW + materialThickness / 2;
        break;
    }

    // Determine axis dimension for calculating maxJoint
    let axisDim: number;
    switch (axis) {
      case 'x': axisDim = config.width; break;
      case 'y': axisDim = config.height; break;
      case 'z': axisDim = config.depth; break;
    }
    const maxJoint = axisDim - 2 * materialThickness;

    // Create section boundaries
    const allBoundaries = [innerOffset, ...transitionPoints, maxJoint - innerOffset];

    // Generate slots at finger positions (even-indexed sections where tabs go)
    let slotIndex = 0;
    for (let i = 0; i < allBoundaries.length - 1; i++) {
      if (i % 2 === 0) {  // Finger/tab section
        const sectionStart = allBoundaries[i];
        const sectionEnd = allBoundaries[i + 1];

        // Check if section is within the edge range (using normalized min/max)
        if (sectionStart < minPos || sectionEnd > maxPos) continue;

        // Convert from axis coords (0 to maxJoint) to 2D panel coords (centered)
        const halfPanelDim = isHorizontalEdge ? halfW - materialThickness : halfH - materialThickness;
        const offsetStart = sectionStart - maxJoint / 2;
        const offsetEnd = sectionEnd - maxJoint / 2;

        let holePoints: PathPoint[];
        if (isHorizontalEdge) {
          // Horizontal edge (top/bottom): slot runs horizontally
          holePoints = [
            { x: offsetStart, y: slotPosition - materialThickness / 2 },
            { x: offsetEnd, y: slotPosition - materialThickness / 2 },
            { x: offsetEnd, y: slotPosition + materialThickness / 2 },
            { x: offsetStart, y: slotPosition + materialThickness / 2 },
          ];
        } else {
          // Vertical edge (left/right): slot runs vertically
          holePoints = [
            { x: slotPosition - materialThickness / 2, y: offsetStart },
            { x: slotPosition + materialThickness / 2, y: offsetStart },
            { x: slotPosition + materialThickness / 2, y: offsetEnd },
            { x: slotPosition - materialThickness / 2, y: offsetEnd },
          ];
        }

        holes.push({
          id: `extension-slot-${faceId}-${position}-${slotIndex}`,
          type: 'slot',
          path: { points: holePoints, closed: true },
          source: {
            type: 'extension-slot',
            sourceId: `${faceId}-${position}`,
          },
        });
        slotIndex++;
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

  // Use existing extensions (no auto-extensions - face offsets only move position, not extend)
  const extensions = existingExtensions ?? defaultEdgeExtensions;

  // Determine if this panel should have feet
  const feetConfig = config.assembly.feet;
  const isWall = getFaceRole(faceId, config.assembly.assemblyAxis) === 'wall';
  const shouldHaveFeet = feetConfig?.enabled && feetConfig.height > 0 && isWall &&
    (config.assembly.assemblyAxis === 'y' || config.assembly.assemblyAxis === 'x');

  // Determine feet edge (bottom edge for Y and X axis assemblies)
  const feetEdge = shouldHaveFeet ? 'bottom' as const : null;
  const feetParams = shouldHaveFeet && feetConfig ? {
    height: feetConfig.height,
    width: feetConfig.width,
    inset: feetConfig.inset,
  } : null;

  const dims = getFaceDimensions(faceId, config);

  // Calculate feet extension FIRST so we can use it for slot hole generation
  const feetExtension = shouldHaveFeet && feetConfig ? (config.materialThickness + feetConfig.height) : 0;

  // Create extensions that include feet for slot hole generation
  const extensionsWithFeet: EdgeExtensions = shouldHaveFeet ? {
    ...extensions,
    bottom: (extensions.bottom ?? 0) + feetExtension,
  } : { ...extensions };

  const outlinePoints = generateFacePanelOutline(
    faceId, faces, config, extensions, existingPanels, fingerData,
    feetEdge, feetParams
  );
  const dividerHoles = generateDividerSlotHoles(faceId, faces, rootVoid, config, existingPanels, fingerData);
  const lidHoles = generateLidSlotHoles(faceId, faces, config);
  // Pass extensionsWithFeet so slot holes are generated for feet edge
  const extensionHoles = generateExtensionSlotHoles(faceId, faces, config, extensionsWithFeet, fingerData);
  const { position, rotation } = getFaceTransform(faceId, config, scale);

  const source: PanelSource = {
    type: 'face',
    faceId,
  };

  // Calculate actual dimensions including all extensions and feet
  const actualWidth = dims.width + (extensions.left ?? 0) + (extensions.right ?? 0);
  const actualHeight = dims.height + (extensions.top ?? 0) + (extensions.bottom ?? 0) + feetExtension;

  return {
    id: `face-${faceId}`,
    source,
    outline: { points: outlinePoints, closed: true },
    holes: [...dividerHoles, ...lidHoles, ...extensionHoles],
    width: actualWidth,
    height: actualHeight,
    thickness: config.materialThickness,
    position,
    rotation,
    label: faceId.toUpperCase(),
    visible: true,
    edgeExtensions: extensionsWithFeet,
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
  // EXTENSION RULE: When an edge is extended, that edge goes to full width (no perpendicular insets)
  // Helper to get X position for corners (same pattern as face panels)
  const getCornerX = (
    side: 'left' | 'right',
    hasTopExt: boolean,
    hasBottomExt: boolean,
    ownExt: number
  ): number => {
    const baseX = side === 'left' ? -halfW : halfW;
    const meetsFace = side === 'left' ? meetsFaceLeft : meetsFaceRight;
    const insetDir = side === 'left' ? 1 : -1;
    const extDir = side === 'left' ? -1 : 1;

    // Apply inset only if meets face AND no extension on the edges meeting this corner
    const applyInset = meetsFace && !hasTopExt && !hasBottomExt;

    return baseX + (applyInset ? insetDir * materialThickness : 0) + extDir * ownExt;
  };

  // Helper to get Y position for corners
  const getCornerY = (
    side: 'top' | 'bottom',
    hasLeftExt: boolean,
    hasRightExt: boolean,
    ownExt: number
  ): number => {
    const baseY = side === 'top' ? halfH : -halfH;
    const meetsFace = side === 'top' ? meetsFaceTop : meetsFaceBottom;
    const insetDir = side === 'top' ? -1 : 1;
    const extDir = side === 'top' ? 1 : -1;

    // Apply inset only if meets face AND no extension on the edges meeting this corner
    const applyInset = meetsFace && !hasLeftExt && !hasRightExt;

    return baseY + (applyInset ? insetDir * materialThickness : 0) + extDir * ownExt;
  };

  const corners: Record<string, Point> = {
    topLeft: {
      x: getCornerX('left', extTop > 0, false, extLeft),
      y: getCornerY('top', extLeft > 0, false, extTop),
    },
    topRight: {
      x: getCornerX('right', extTop > 0, false, extRight),
      y: getCornerY('top', false, extRight > 0, extTop),
    },
    bottomRight: {
      x: getCornerX('right', false, extBottom > 0, extRight),
      y: getCornerY('bottom', false, extRight > 0, extBottom),
    },
    bottomLeft: {
      x: getCornerX('left', false, extBottom > 0, extLeft),
      y: getCornerY('bottom', extLeft > 0, false, extBottom),
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
  // Start debug logging for extension overlap analysis
  startDebugLog();

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

  // Second pass: generate face panels
  // IMPORTANT: For extension overlap detection, we need to see ALL panels' extensions,
  // not just the ones generated so far in this pass. Use existingPanels (from previous render)
  // to look up extensions, which contains all stored extension values.
  const faceIds: FaceId[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];
  const generatedFacePanels: PanelPath[] = [];
  for (const faceId of faceIds) {
    const panelId = `face-${faceId}`;
    // Use existingPanels (parameter) for extension lookups - has ALL panels' stored extensions
    // Use allExistingPanels for other purposes like generated geometry
    const allExistingPanels = [...dividerPanels, ...generatedFacePanels];
    const panel = generateFacePanel(faceId, faces, rootVoid, config, scale, getExistingExtensions(panelId), existingPanels ?? allExistingPanels, fingerData);
    if (panel) {
      generatedFacePanels.push(panel);
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
