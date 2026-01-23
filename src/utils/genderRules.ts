/**
 * Gender Rules for Finger Joints
 *
 * Determines whether an edge should have tabs (male) or slots (female).
 * The rules ensure that mating edges always have opposite genders.
 */

import {
  FaceId,
  AssemblyConfig,
  JointGender,
  Face,
  getFaceRole,
  getLidSide,
  getWallPriority,
} from '../types';

/**
 * Get the adjacent face for a given edge position.
 */
export const getAdjacentFace = (
  faceId: FaceId,
  edgePosition: 'top' | 'bottom' | 'left' | 'right'
): FaceId => {
  // Map each face + edge position to its adjacent face
  const adjacencyMap: Record<FaceId, Record<string, FaceId>> = {
    front: { top: 'top', bottom: 'bottom', left: 'left', right: 'right' },
    back: { top: 'top', bottom: 'bottom', left: 'right', right: 'left' },
    left: { top: 'top', bottom: 'bottom', left: 'back', right: 'front' },
    right: { top: 'top', bottom: 'bottom', left: 'front', right: 'back' },
    top: { top: 'back', bottom: 'front', left: 'left', right: 'right' },
    bottom: { top: 'front', bottom: 'back', left: 'left', right: 'right' },
  };
  return adjacencyMap[faceId][edgePosition];
};

/**
 * Get the gender of a lid face based on its tab direction config.
 * tabs-out = male (tabs protrude)
 * tabs-in = female (slots receive tabs)
 */
export const getLidGender = (
  faceId: FaceId,
  assembly: AssemblyConfig
): JointGender | null => {
  const side = getLidSide(faceId, assembly.assemblyAxis);
  if (!side) return null; // Not a lid

  const lidConfig = assembly.lids[side];
  return lidConfig.tabDirection === 'tabs-out' ? 'male' : 'female';
};

/**
 * Determine the gender for an edge joint.
 *
 * Rules (in order of precedence):
 * 1. If adjacent face is not solid → null (straight edge, no joint)
 * 2. If this face is a lid → use lid's configured gender
 * 3. If adjacent face is a lid → opposite of lid's gender
 * 4. Wall-to-wall → lower priority face gets male, higher gets female
 *
 * @param faceId - The face this edge belongs to
 * @param edgePosition - Which edge on the face (top/bottom/left/right)
 * @param faces - All faces in the assembly (to check solid state)
 * @param assembly - Assembly configuration
 * @returns JointGender or null if no joint (straight edge)
 */
export const getEdgeGender = (
  faceId: FaceId,
  edgePosition: 'top' | 'bottom' | 'left' | 'right',
  faces: Face[],
  assembly: AssemblyConfig
): JointGender | null => {
  const adjacentFaceId = getAdjacentFace(faceId, edgePosition);
  const adjacentFace = faces.find((f) => f.id === adjacentFaceId);

  // Rule 1: If adjacent face is not solid, no joint needed
  if (!adjacentFace?.solid) {
    return null;
  }

  const thisRole = getFaceRole(faceId, assembly.assemblyAxis);
  const adjacentRole = getFaceRole(adjacentFaceId, assembly.assemblyAxis);

  // Rule 2: If this face is a lid, use its configured gender
  if (thisRole === 'lid') {
    return getLidGender(faceId, assembly);
  }

  // Rule 3: If adjacent face is a lid, use opposite of its gender
  if (adjacentRole === 'lid') {
    const lidGender = getLidGender(adjacentFaceId, assembly);
    if (lidGender) {
      return lidGender === 'male' ? 'female' : 'male';
    }
  }

  // Rule 4: Wall-to-wall - lower priority = male, higher priority = female
  const thisPriority = getWallPriority(faceId);
  const adjacentPriority = getWallPriority(adjacentFaceId);

  return thisPriority < adjacentPriority ? 'male' : 'female';
};

/**
 * Get the gender for a divider edge.
 * Dividers always have male joints (tabs) on edges that meet solid faces.
 *
 * @param meetsSolidFace - Whether this edge meets a solid outer face
 * @returns 'male' if it meets a solid face, null if edge meets open face
 */
export const getDividerEdgeGender = (
  meetsSolidFace: boolean
): JointGender | null => {
  // Dividers always have male joints (tabs extending out)
  // When meeting an open face, no joint needed (straight edge)
  return meetsSolidFace ? 'male' : null;
};

/**
 * Get all edge genders for a face panel.
 * Useful for rendering the full panel outline.
 */
export const getAllEdgeGenders = (
  faceId: FaceId,
  faces: Face[],
  assembly: AssemblyConfig
): Record<'top' | 'bottom' | 'left' | 'right', JointGender | null> => {
  return {
    top: getEdgeGender(faceId, 'top', faces, assembly),
    bottom: getEdgeGender(faceId, 'bottom', faces, assembly),
    left: getEdgeGender(faceId, 'left', faces, assembly),
    right: getEdgeGender(faceId, 'right', faces, assembly),
  };
};

/**
 * Check if two faces should have opposing genders at their shared edge.
 * Used for validation/debugging to ensure joint compatibility.
 */
export const validateMatingGenders = (
  face1: FaceId,
  face1Edge: 'top' | 'bottom' | 'left' | 'right',
  faces: Face[],
  assembly: AssemblyConfig
): boolean => {
  const face2 = getAdjacentFace(face1, face1Edge);

  // Check if both faces are solid (exist as panels)
  const face1Solid = faces.find((f) => f.id === face1)?.solid ?? false;
  const face2Solid = faces.find((f) => f.id === face2)?.solid ?? false;

  // If either face is open, no validation needed (no mating edge exists)
  if (!face1Solid || !face2Solid) return true;

  const gender1 = getEdgeGender(face1, face1Edge, faces, assembly);

  // Find which edge of face2 connects to face1
  const face2Edge = findConnectingEdge(face2, face1);
  const gender2 = getEdgeGender(face2, face2Edge, faces, assembly);

  // Both should be null (no joint) or opposite genders
  if (gender1 === null && gender2 === null) return true;
  if (gender1 === null || gender2 === null) return false;
  return gender1 !== gender2;
};

/**
 * Find which edge of targetFace connects to sourceFace.
 */
const findConnectingEdge = (
  targetFace: FaceId,
  sourceFace: FaceId
): 'top' | 'bottom' | 'left' | 'right' => {
  const edges: Array<'top' | 'bottom' | 'left' | 'right'> = [
    'top',
    'bottom',
    'left',
    'right',
  ];
  for (const edge of edges) {
    if (getAdjacentFace(targetFace, edge) === sourceFace) {
      return edge;
    }
  }
  // This shouldn't happen with valid face pairs
  throw new Error(`No connecting edge found between ${targetFace} and ${sourceFace}`);
};
