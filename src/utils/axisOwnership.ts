/**
 * Axis Ownership Model
 *
 * A unified model for determining finger joint geometry and extension overlaps
 * based on "ownership" of sections along shared axes.
 *
 * Core Concept:
 * Each edge where two panels meet has an axis running along it. This axis has
 * points that divide it into sections. Each section is "owned" by one panel,
 * which determines the joint geometry:
 * - Owner panel has a TAB (material extends outward)
 * - Non-owner panel has a SLOT (material is cut inward)
 *
 * Physical Constraints:
 * - Each axis has a physical width equal to materialThickness
 * - Two parallel axes cannot be placed closer than materialThickness apart
 *   (there must be material between them for structural integrity)
 * - The only exception is when axes are at exactly the same position,
 *   which creates a CROSS JOINT (two dividers intersecting)
 *
 * Subdivision Spacing Rules:
 * - When a void is subdivided, the divider panel creates an axis
 * - Adjacent voids cannot have subdivisions within materialThickness of this axis
 * - Subdivisions at exactly the same position merge into a cross joint
 * - Minimum spacing between non-crossing subdivisions: materialThickness
 */

import { FaceId, Face, AssemblyConfig, EdgeExtensions, JointGender } from '../types';
import { getEdgeGender, getAdjacentFace } from './genderRules';

// =============================================================================
// Types
// =============================================================================

export type OwnershipReason =
  | 'gender'           // Normal gender rule (male = tabs, female = slots)
  | 'open_face'        // Other face is open/removed
  | 'extension_beyond' // This face extends further than the other
  | 'extension_claim'; // Female extension into male territory

export interface AxisSection {
  start: number;           // Position along axis
  end: number;             // Position along axis
  owner: FaceId;           // Which panel owns this section
  reason: OwnershipReason;
}

/**
 * Represents a shared edge between two panels
 */
export interface JointAxis {
  axisId: string;                    // e.g., "front-left-vertical"
  faceA: FaceId;                     // First face
  faceB: FaceId;                     // Second face
  direction: 'x' | 'y' | 'z';        // Physical axis direction
  baseStart: number;                 // Normal joint start position
  baseEnd: number;                   // Normal joint end position
  faceAExtension: number;            // How far face A extends beyond baseEnd
  faceBExtension: number;            // How far face B extends beyond baseEnd
  sections: AxisSection[];           // Computed ownership for each section
}

export interface EdgeExtensionInfo {
  faceId: FaceId;
  edgePosition: 'top' | 'bottom' | 'left' | 'right';
  extension: number;
}

// =============================================================================
// Axis Identification
// =============================================================================

/**
 * Get the axis ID for a shared edge between two faces
 */
export const getAxisId = (faceA: FaceId, faceB: FaceId, axisDirection: 'x' | 'y' | 'z'): string => {
  // Sort faces alphabetically for consistent ID
  const sorted = [faceA, faceB].sort();
  return `${sorted[0]}-${sorted[1]}-${axisDirection}`;
};

/**
 * Identify all joint axes in the box
 * Returns the 12 edges where panels meet
 */
export const getAllJointAxes = (): Array<{ faceA: FaceId; faceB: FaceId; direction: 'x' | 'y' | 'z'; edgeOnA: 'top' | 'bottom' | 'left' | 'right'; edgeOnB: 'top' | 'bottom' | 'left' | 'right' }> => {
  return [
    // Front face edges
    { faceA: 'front', faceB: 'top', direction: 'x', edgeOnA: 'top', edgeOnB: 'bottom' },
    { faceA: 'front', faceB: 'bottom', direction: 'x', edgeOnA: 'bottom', edgeOnB: 'top' },
    { faceA: 'front', faceB: 'left', direction: 'y', edgeOnA: 'left', edgeOnB: 'right' },
    { faceA: 'front', faceB: 'right', direction: 'y', edgeOnA: 'right', edgeOnB: 'left' },
    // Back face edges
    { faceA: 'back', faceB: 'top', direction: 'x', edgeOnA: 'top', edgeOnB: 'top' },
    { faceA: 'back', faceB: 'bottom', direction: 'x', edgeOnA: 'bottom', edgeOnB: 'bottom' },
    { faceA: 'back', faceB: 'left', direction: 'y', edgeOnA: 'right', edgeOnB: 'left' },
    { faceA: 'back', faceB: 'right', direction: 'y', edgeOnA: 'left', edgeOnB: 'right' },
    // Remaining edges (top/bottom to left/right)
    { faceA: 'top', faceB: 'left', direction: 'z', edgeOnA: 'left', edgeOnB: 'top' },
    { faceA: 'top', faceB: 'right', direction: 'z', edgeOnA: 'right', edgeOnB: 'top' },
    { faceA: 'bottom', faceB: 'left', direction: 'z', edgeOnA: 'left', edgeOnB: 'bottom' },
    { faceA: 'bottom', faceB: 'right', direction: 'z', edgeOnA: 'right', edgeOnB: 'bottom' },
  ];
};

/**
 * Get the physical axis direction for a shared edge
 */
export const getSharedEdgeAxis = (faceA: FaceId, faceB: FaceId): 'x' | 'y' | 'z' | null => {
  const axes = getAllJointAxes();
  const axis = axes.find(
    a => (a.faceA === faceA && a.faceB === faceB) || (a.faceA === faceB && a.faceB === faceA)
  );
  return axis?.direction ?? null;
};

// =============================================================================
// Extension Detection
// =============================================================================

/**
 * Get the extension amount for a face on a specific edge
 */
export const getFaceExtensionForEdge = (
  faceId: FaceId,
  edgePosition: 'top' | 'bottom' | 'left' | 'right',
  extensions: Record<FaceId, EdgeExtensions>
): number => {
  const ext = extensions[faceId];
  if (!ext) return 0;
  return ext[edgePosition] ?? 0;
};

/**
 * Get the corresponding edge on the other face
 * When face A's edge X meets face B, what edge of B is that?
 */
export const getCorrespondingEdge = (
  faceId: FaceId,
  edgePosition: 'top' | 'bottom' | 'left' | 'right'
): { adjacentFace: FaceId; adjacentEdge: 'top' | 'bottom' | 'left' | 'right' } => {
  const adjacentFace = getAdjacentFace(faceId, edgePosition);

  // Find which edge of the adjacent face connects back
  const axes = getAllJointAxes();
  const axis = axes.find(
    a => (a.faceA === faceId && a.faceB === adjacentFace) || (a.faceA === adjacentFace && a.faceB === faceId)
  );

  if (!axis) {
    throw new Error(`No axis found between ${faceId} and ${adjacentFace}`);
  }

  const adjacentEdge = axis.faceA === adjacentFace ? axis.edgeOnA : axis.edgeOnB;
  return { adjacentFace, adjacentEdge };
};

// =============================================================================
// Ownership Computation
// =============================================================================

/**
 * Compute section ownership for an axis
 *
 * Rules (in priority order):
 * 1. Open face rule: If one face is removed/open, the solid face owns ALL sections
 * 2. Gender rule: Male panels (tabs-out) own sections by default
 * 3. Extension beyond neighbor: Panel extending further owns the new sections
 * 4. Female extension claim: If female extends into male territory, female claims ownership
 */
export const computeAxisOwnership = (
  faceA: FaceId,
  faceB: FaceId,
  edgeOnA: 'top' | 'bottom' | 'left' | 'right',
  edgeOnB: 'top' | 'bottom' | 'left' | 'right',
  faces: Face[],
  assembly: AssemblyConfig,
  extensions: Record<FaceId, EdgeExtensions>,
  fingerPoints: number[],  // Regular finger joint division points
  baseStart: number,       // Start of normal joint region
  baseEnd: number          // End of normal joint region
): AxisSection[] => {
  const faceAConfig = faces.find(f => f.id === faceA);
  const faceBConfig = faces.find(f => f.id === faceB);

  const faceASolid = faceAConfig?.solid ?? false;
  const faceBSolid = faceBConfig?.solid ?? false;

  // Rule 1: Open face rule
  if (!faceASolid && faceBSolid) {
    // Face A is open, face B owns everything
    return [{
      start: baseStart,
      end: baseEnd,
      owner: faceB,
      reason: 'open_face'
    }];
  }
  if (faceASolid && !faceBSolid) {
    // Face B is open, face A owns everything
    return [{
      start: baseStart,
      end: baseEnd,
      owner: faceA,
      reason: 'open_face'
    }];
  }
  if (!faceASolid && !faceBSolid) {
    // Both open - no joint needed
    return [];
  }

  // Get gender from existing gender rules
  const genderA = getEdgeGender(faceA, edgeOnA, faces, assembly);
  const genderB = getEdgeGender(faceB, edgeOnB, faces, assembly);

  // Determine base owner from gender (male owns tabs)
  const baseOwner = genderA === 'male' ? faceA : faceB;

  // Get extensions
  const extA = getFaceExtensionForEdge(faceA, edgeOnA, extensions);
  const extB = getFaceExtensionForEdge(faceB, edgeOnB, extensions);

  // Build all boundary points (sorted)
  const allPoints = new Set<number>();
  allPoints.add(baseStart);
  allPoints.add(baseEnd);
  fingerPoints.forEach(p => allPoints.add(p));

  // Add extension boundaries if they extend past baseEnd
  if (extA > 0) {
    allPoints.add(baseEnd + extA);
  }
  if (extB > 0) {
    allPoints.add(baseEnd + extB);
  }

  const sortedPoints = Array.from(allPoints).sort((a, b) => a - b);

  // Build sections between points
  const sections: AxisSection[] = [];

  for (let i = 0; i < sortedPoints.length - 1; i++) {
    const sectionStart = sortedPoints[i];
    const sectionEnd = sortedPoints[i + 1];
    const sectionMid = (sectionStart + sectionEnd) / 2;

    let owner: FaceId;
    let reason: OwnershipReason;

    // Determine ownership for this section
    if (sectionMid <= baseEnd) {
      // Within normal joint region - use finger pattern based on gender
      // For alternating fingers, check if this section index is even or odd
      const sectionIndex = i;
      const isEvenSection = sectionIndex % 2 === 0;

      // Male face owns even sections (starts with a tab), female owns odd
      owner = isEvenSection ? baseOwner : (baseOwner === faceA ? faceB : faceA);
      reason = 'gender';
    } else {
      // Extension region - beyond normal joint
      const faceAReachesHere = baseEnd + extA >= sectionEnd;
      const faceBReachesHere = baseEnd + extB >= sectionEnd;

      if (faceAReachesHere && !faceBReachesHere) {
        // Only face A reaches this section
        owner = faceA;
        reason = 'extension_beyond';
      } else if (faceBReachesHere && !faceAReachesHere) {
        // Only face B reaches this section
        owner = faceB;
        reason = 'extension_beyond';
      } else if (faceAReachesHere && faceBReachesHere) {
        // Both reach here - apply priority rules
        // Rule 4: Female extension into male territory claims ownership
        if (genderA === 'female' && genderB === 'male') {
          owner = faceA;
          reason = 'extension_claim';
        } else if (genderB === 'female' && genderA === 'male') {
          owner = faceB;
          reason = 'extension_claim';
        } else {
          // Same gender or both null - use existing priority
          owner = baseOwner;
          reason = 'gender';
        }
      } else {
        // Neither reaches here (shouldn't happen if points are correct)
        owner = baseOwner;
        reason = 'gender';
      }
    }

    sections.push({ start: sectionStart, end: sectionEnd, owner, reason });
  }

  // Merge adjacent sections with same owner
  const mergedSections: AxisSection[] = [];
  for (const section of sections) {
    const last = mergedSections[mergedSections.length - 1];
    if (last && last.owner === section.owner && last.reason === section.reason && last.end === section.start) {
      last.end = section.end;
    } else {
      mergedSections.push({ ...section });
    }
  }

  return mergedSections;
};

// =============================================================================
// Overlap Resolution
// =============================================================================

/**
 * Check if two extended panels would overlap at a corner
 */
export const checkExtensionOverlap = (
  faceA: FaceId,
  faceB: FaceId,
  extensions: Record<FaceId, EdgeExtensions>
): { overlaps: boolean; axisDirection: 'x' | 'y' | 'z' | null } => {
  const axisDirection = getSharedEdgeAxis(faceA, faceB);
  if (!axisDirection) {
    return { overlaps: false, axisDirection: null };
  }

  const axes = getAllJointAxes();
  const axis = axes.find(
    a => (a.faceA === faceA && a.faceB === faceB) || (a.faceA === faceB && a.faceB === faceA)
  );

  if (!axis) {
    return { overlaps: false, axisDirection: null };
  }

  const edgeOnA = axis.faceA === faceA ? axis.edgeOnA : axis.edgeOnB;
  const edgeOnB = axis.faceA === faceB ? axis.edgeOnA : axis.edgeOnB;

  const extA = getFaceExtensionForEdge(faceA, edgeOnA, extensions);
  const extB = getFaceExtensionForEdge(faceB, edgeOnB, extensions);

  // Overlaps if both have positive extensions on the same edge direction
  return {
    overlaps: extA > 0 && extB > 0,
    axisDirection
  };
};

/**
 * Determine which face should "give way" at an overlapping corner
 * Returns the face that should be shortened/notched
 */
export const getOverlapLoser = (
  faceA: FaceId,
  faceB: FaceId,
  faces: Face[],
  assembly: AssemblyConfig,
  edgeOnA: 'top' | 'bottom' | 'left' | 'right',
  edgeOnB: 'top' | 'bottom' | 'left' | 'right'
): FaceId => {
  // Get genders
  const genderA = getEdgeGender(faceA, edgeOnA, faces, assembly);
  const genderB = getEdgeGender(faceB, edgeOnB, faces, assembly);

  // Male extends, female receives
  // So female should "give way" (have slot, be shorter)
  if (genderA === 'male' && genderB === 'female') {
    return faceB;  // B gives way
  }
  if (genderB === 'male' && genderA === 'female') {
    return faceA;  // A gives way
  }

  // Same gender - use priority (front/back over left/right)
  const isPrimary = (f: FaceId) => f === 'front' || f === 'back';
  if (isPrimary(faceA) && !isPrimary(faceB)) {
    return faceB;  // A is primary, B gives way
  }
  if (isPrimary(faceB) && !isPrimary(faceA)) {
    return faceA;  // B is primary, A gives way
  }

  // Alphabetical tiebreaker
  return faceA < faceB ? faceB : faceA;
};

/**
 * Calculate the notch/shortening needed for a panel at an overlapping corner
 * Returns the amount to shorten the edge by (in the perpendicular direction)
 */
export const calculateOverlapNotch = (
  losingFace: FaceId,
  winningFace: FaceId,
  extensions: Record<FaceId, EdgeExtensions>,
  materialThickness: number,
  edgeOnLoser: 'top' | 'bottom' | 'left' | 'right',
  edgeOnWinner: 'top' | 'bottom' | 'left' | 'right'
): { notchDepth: number; notchLength: number } => {
  // The loser's extension needs to be shortened by the material thickness
  // to accommodate the winner's tab
  const winnerExt = getFaceExtensionForEdge(winningFace, edgeOnWinner, extensions);
  const loserExt = getFaceExtensionForEdge(losingFace, edgeOnLoser, extensions);

  // The notch is materialThickness wide (depth into the loser's panel)
  // and as long as the overlap region
  const overlapLength = Math.min(winnerExt, loserExt);

  return {
    notchDepth: materialThickness,
    notchLength: overlapLength
  };
};

// =============================================================================
// Exports for Panel Generator
// =============================================================================

export interface OverlapInfo {
  hasOverlap: boolean;
  isLoser: boolean;
  notchDepth: number;
  notchLength: number;
  perpFaceId: FaceId | null;
}

/**
 * Get overlap info for a specific corner of a panel
 * Used by panelGenerator to determine corner geometry
 */
export const getCornerOverlapInfo = (
  faceId: FaceId,
  cornerEdges: { horizontal: 'top' | 'bottom'; vertical: 'left' | 'right' },
  faces: Face[],
  assembly: AssemblyConfig,
  extensions: Record<FaceId, EdgeExtensions>,
  materialThickness: number
): { horizontal: OverlapInfo; vertical: OverlapInfo } => {
  // Get the perpendicular faces for each edge
  const horizontalAdj = getAdjacentFace(faceId, cornerEdges.horizontal);
  const verticalAdj = getAdjacentFace(faceId, cornerEdges.vertical);

  // Check horizontal overlap (this face's horizontal edge vs perpendicular face's extension)
  const horizontalInfo = getOverlapInfoForEdge(
    faceId,
    verticalAdj,  // The perpendicular face that might also be extending on the horizontal edge
    cornerEdges.horizontal,
    faces,
    assembly,
    extensions,
    materialThickness
  );

  // Check vertical overlap
  const verticalInfo = getOverlapInfoForEdge(
    faceId,
    horizontalAdj,
    cornerEdges.vertical,
    faces,
    assembly,
    extensions,
    materialThickness
  );

  return { horizontal: horizontalInfo, vertical: verticalInfo };
};

const getOverlapInfoForEdge = (
  faceId: FaceId,
  perpFaceId: FaceId,
  edgePosition: 'top' | 'bottom' | 'left' | 'right',
  faces: Face[],
  assembly: AssemblyConfig,
  extensions: Record<FaceId, EdgeExtensions>,
  materialThickness: number
): OverlapInfo => {
  const myExt = getFaceExtensionForEdge(faceId, edgePosition, extensions);

  // Find which edge of the perp face corresponds to the same extension direction
  const perpEdge = findPerpFaceMatchingEdge(faceId, perpFaceId, edgePosition);
  if (!perpEdge) {
    return { hasOverlap: false, isLoser: false, notchDepth: 0, notchLength: 0, perpFaceId: null };
  }

  const perpExt = getFaceExtensionForEdge(perpFaceId, perpEdge, extensions);

  if (myExt <= 0 || perpExt <= 0) {
    return { hasOverlap: false, isLoser: false, notchDepth: 0, notchLength: 0, perpFaceId: null };
  }

  // Both have extensions - there's an overlap
  const loser = getOverlapLoser(faceId, perpFaceId, faces, assembly, edgePosition, perpEdge);
  const isLoser = loser === faceId;

  if (isLoser) {
    const { notchDepth, notchLength } = calculateOverlapNotch(
      faceId,
      perpFaceId,
      extensions,
      materialThickness,
      edgePosition,
      perpEdge
    );
    return { hasOverlap: true, isLoser: true, notchDepth, notchLength, perpFaceId };
  }

  return { hasOverlap: true, isLoser: false, notchDepth: 0, notchLength: 0, perpFaceId };
};

/**
 * Find which edge of the perpendicular face corresponds to the same extension direction
 * e.g., if front face extends bottom, left face would also extend bottom to meet it
 */
const findPerpFaceMatchingEdge = (
  faceId: FaceId,
  perpFaceId: FaceId,
  edgePosition: 'top' | 'bottom' | 'left' | 'right'
): 'top' | 'bottom' | 'left' | 'right' | null => {
  // The perpendicular face shares a corner, so when faceId extends on edgePosition,
  // the perp face would need to extend on the same physical direction

  // Map from face + edge to physical direction
  const edgeToPhysical: Record<FaceId, Record<string, 'up' | 'down' | 'left' | 'right' | 'forward' | 'back'>> = {
    front: { top: 'up', bottom: 'down', left: 'left', right: 'right' },
    back: { top: 'up', bottom: 'down', left: 'right', right: 'left' },
    left: { top: 'up', bottom: 'down', left: 'back', right: 'forward' },
    right: { top: 'up', bottom: 'down', left: 'forward', right: 'back' },
    top: { top: 'back', bottom: 'forward', left: 'left', right: 'right' },
    bottom: { top: 'forward', bottom: 'back', left: 'left', right: 'right' },
  };

  const physicalDir = edgeToPhysical[faceId]?.[edgePosition];
  if (!physicalDir) return null;

  // Find which edge of perpFaceId points in the same physical direction
  const perpEdges = edgeToPhysical[perpFaceId];
  if (!perpEdges) return null;

  for (const [edge, dir] of Object.entries(perpEdges)) {
    if (dir === physicalDir) {
      return edge as 'top' | 'bottom' | 'left' | 'right';
    }
  }

  return null;
};

// =============================================================================
// Axis Spacing Constraints
// =============================================================================

/**
 * Minimum distance between parallel axes (subdivision positions)
 * Two subdivisions must be at least this far apart, or at exactly the same position
 */
export const MIN_AXIS_SPACING = (materialThickness: number): number => materialThickness;

/**
 * Tolerance for considering two positions as "the same" (for cross joints)
 * If two subdivisions are within this tolerance, they form a cross joint
 */
export const CROSS_JOINT_TOLERANCE = 0.001; // mm

/**
 * Check if two subdivision positions would create a valid configuration
 * Returns the type of configuration or an error if invalid
 */
export type AxisSpacingResult =
  | { valid: true; type: 'separate' }      // Far enough apart, no interaction
  | { valid: true; type: 'cross_joint' }   // Same position, forms a cross
  | { valid: false; reason: 'too_close'; minDistance: number };

export const checkAxisSpacing = (
  position1: number,
  position2: number,
  materialThickness: number
): AxisSpacingResult => {
  const distance = Math.abs(position1 - position2);
  const minSpacing = MIN_AXIS_SPACING(materialThickness);

  // Check if they're at the same position (cross joint)
  if (distance < CROSS_JOINT_TOLERANCE) {
    return { valid: true, type: 'cross_joint' };
  }

  // Check if they're far enough apart
  if (distance >= minSpacing) {
    return { valid: true, type: 'separate' };
  }

  // Too close but not a cross joint
  return {
    valid: false,
    reason: 'too_close',
    minDistance: minSpacing
  };
};

/**
 * Find valid positions for a new subdivision given existing subdivisions
 * Returns ranges where a new subdivision can be placed
 */
export interface ValidRange {
  start: number;
  end: number;
}

export const findValidSubdivisionRanges = (
  existingPositions: number[],
  voidStart: number,
  voidEnd: number,
  materialThickness: number
): ValidRange[] => {
  if (existingPositions.length === 0) {
    // No existing subdivisions - entire void is valid
    return [{ start: voidStart, end: voidEnd }];
  }

  const minSpacing = MIN_AXIS_SPACING(materialThickness);
  const sorted = [...existingPositions].sort((a, b) => a - b);
  const ranges: ValidRange[] = [];

  // Check range before first subdivision
  const firstExclusion = sorted[0] - minSpacing;
  if (firstExclusion > voidStart) {
    ranges.push({ start: voidStart, end: firstExclusion });
  }

  // Check ranges between subdivisions
  for (let i = 0; i < sorted.length - 1; i++) {
    const gapStart = sorted[i] + minSpacing;
    const gapEnd = sorted[i + 1] - minSpacing;
    if (gapEnd > gapStart) {
      ranges.push({ start: gapStart, end: gapEnd });
    }
  }

  // Check range after last subdivision
  const lastExclusion = sorted[sorted.length - 1] + minSpacing;
  if (lastExclusion < voidEnd) {
    ranges.push({ start: lastExclusion, end: voidEnd });
  }

  // Also include the exact positions of existing subdivisions (for cross joints)
  // These are point ranges (start === end)
  for (const pos of sorted) {
    ranges.push({ start: pos, end: pos });
  }

  return ranges;
};

/**
 * Snap a proposed subdivision position to a valid location
 * Prefers cross joints when close to existing subdivisions
 */
export const snapToValidPosition = (
  proposedPosition: number,
  existingPositions: number[],
  voidStart: number,
  voidEnd: number,
  materialThickness: number
): number => {
  const minSpacing = MIN_AXIS_SPACING(materialThickness);

  // Check if we're close enough to an existing position to snap to cross joint
  for (const existing of existingPositions) {
    if (Math.abs(proposedPosition - existing) < minSpacing / 2) {
      return existing; // Snap to cross joint
    }
  }

  // Check if we're in a valid range
  for (const existing of existingPositions) {
    const distance = Math.abs(proposedPosition - existing);
    if (distance < minSpacing && distance >= CROSS_JOINT_TOLERANCE) {
      // Too close - push away from the existing position
      if (proposedPosition < existing) {
        return Math.max(voidStart, existing - minSpacing);
      } else {
        return Math.min(voidEnd, existing + minSpacing);
      }
    }
  }

  // Position is valid as-is
  return Math.max(voidStart, Math.min(voidEnd, proposedPosition));
};
