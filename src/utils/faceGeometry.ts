/**
 * faceGeometry.ts - Single source of truth for face/edge adjacency relationships
 *
 * This module defines how the 6 faces of a box connect to each other.
 * All face-edge adjacency lookups should use this module to avoid duplication.
 */

import { FaceId } from '../types';

// Edge position type (matches engine/types.ts)
export type EdgePosition = 'top' | 'bottom' | 'left' | 'right';

// Axis type for 3D coordinates
export type Axis = 'x' | 'y' | 'z';

// =============================================================================
// Face Edge Adjacency - Which face each edge of a panel meets
// =============================================================================

/**
 * For each face, maps edge positions to the adjacent face they connect to.
 * This is the canonical source for face-edge relationships.
 *
 * Example: front.top connects to top face, front.left connects to left face
 */
export const FACE_EDGE_ADJACENCY: Record<FaceId, Record<EdgePosition, FaceId>> = {
  front: { top: 'top', bottom: 'bottom', left: 'left', right: 'right' },
  back: { top: 'top', bottom: 'bottom', left: 'right', right: 'left' },
  left: { top: 'top', bottom: 'bottom', left: 'back', right: 'front' },
  right: { top: 'top', bottom: 'bottom', left: 'front', right: 'back' },
  top: { top: 'back', bottom: 'front', left: 'left', right: 'right' },
  bottom: { top: 'front', bottom: 'back', left: 'left', right: 'right' },
};

/**
 * Get the adjacent face for a given face and edge position.
 */
export const getAdjacentFace = (faceId: FaceId, edgePosition: EdgePosition): FaceId => {
  return FACE_EDGE_ADJACENCY[faceId][edgePosition];
};

// =============================================================================
// Edge Orientation - Whether an edge runs horizontally or vertically
// =============================================================================

/**
 * Maps each edge position to whether it's horizontal (true) or vertical (false).
 * Horizontal = runs along the width of the panel (top/bottom edges)
 * Vertical = runs along the height of the panel (left/right edges)
 */
export const EDGE_IS_HORIZONTAL: Record<EdgePosition, boolean> = {
  top: true,
  bottom: true,
  left: false,
  right: false,
};

/**
 * Check if an edge position represents a horizontal edge.
 */
export const isHorizontalEdge = (edgePosition: EdgePosition): boolean => {
  return EDGE_IS_HORIZONTAL[edgePosition];
};

// =============================================================================
// Edge Info - Combined adjacency and orientation data
// =============================================================================

export interface EdgeInfo {
  position: EdgePosition;
  adjacentFaceId: FaceId;
  isHorizontal: boolean;
}

/**
 * Get all edge info for a face panel.
 * Returns adjacency and orientation for each of the 4 edges.
 */
export const getFaceEdges = (faceId: FaceId): EdgeInfo[] => {
  const adjacency = FACE_EDGE_ADJACENCY[faceId];
  const positions: EdgePosition[] = ['top', 'bottom', 'left', 'right'];

  return positions.map(position => ({
    position,
    adjacentFaceId: adjacency[position],
    isHorizontal: EDGE_IS_HORIZONTAL[position],
  }));
};

// =============================================================================
// Mating Edge Position - Which edge of the adjacent face connects back
// =============================================================================

/**
 * Maps from (face, edge) to which edge of the adjacent face connects back.
 * This is the inverse relationship.
 *
 * Example: front.top connects to top face, and top.bottom connects back to front
 */
export const MATING_EDGE_POSITION: Record<FaceId, Record<EdgePosition, EdgePosition>> = {
  front: { top: 'bottom', bottom: 'top', left: 'right', right: 'left' },
  back: { top: 'top', bottom: 'bottom', left: 'left', right: 'right' },
  left: { top: 'left', bottom: 'left', left: 'right', right: 'left' },
  right: { top: 'right', bottom: 'right', left: 'right', right: 'left' },
  top: { top: 'top', bottom: 'top', left: 'top', right: 'top' },
  bottom: { top: 'bottom', bottom: 'bottom', left: 'bottom', right: 'bottom' },
};

/**
 * Get which edge of the adjacent face connects back to this face's edge.
 *
 * @param faceId - The source face
 * @param edgePosition - The edge on the source face
 * @returns The edge position on the adjacent face that connects back
 */
export const getMatingEdge = (faceId: FaceId, edgePosition: EdgePosition): EdgePosition => {
  return MATING_EDGE_POSITION[faceId][edgePosition];
};

// =============================================================================
// Joint Axis - Which world axis a joint runs along
// =============================================================================

/**
 * Maps (face, edge) to the world axis that joint runs along.
 *
 * Example: The joint between front.top and top.bottom runs along the X axis
 */
export const JOINT_AXIS: Record<FaceId, Record<EdgePosition, Axis>> = {
  front: { top: 'x', bottom: 'x', left: 'y', right: 'y' },
  back: { top: 'x', bottom: 'x', left: 'y', right: 'y' },
  left: { top: 'z', bottom: 'z', left: 'y', right: 'y' },
  right: { top: 'z', bottom: 'z', left: 'y', right: 'y' },
  top: { top: 'x', bottom: 'x', left: 'z', right: 'z' },
  bottom: { top: 'x', bottom: 'x', left: 'z', right: 'z' },
};

/**
 * Get the world axis that a joint runs along.
 */
export const getJointAxis = (faceId: FaceId, edgePosition: EdgePosition): Axis => {
  return JOINT_AXIS[faceId][edgePosition];
};

// =============================================================================
// Divider Edge Adjacency - Which faces divider panel edges meet
// =============================================================================

/**
 * For divider panels, maps (divider axis, edge position) to the face it meets.
 * Dividers are oriented perpendicular to their axis.
 */
export const DIVIDER_EDGE_ADJACENCY: Record<Axis, Record<EdgePosition, FaceId>> = {
  x: { top: 'top', bottom: 'bottom', left: 'back', right: 'front' },
  y: { top: 'back', bottom: 'front', left: 'left', right: 'right' },
  z: { top: 'top', bottom: 'bottom', left: 'left', right: 'right' },
};

/**
 * Get the face that a divider panel edge meets.
 */
export const getDividerAdjacentFace = (axis: Axis, edgePosition: EdgePosition): FaceId => {
  return DIVIDER_EDGE_ADJACENCY[axis][edgePosition];
};

// =============================================================================
// All Edge Positions - Utility constant
// =============================================================================

export const ALL_EDGE_POSITIONS: EdgePosition[] = ['top', 'bottom', 'left', 'right'];
export const ALL_FACE_IDS: FaceId[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];
