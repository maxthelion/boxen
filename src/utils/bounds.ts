/**
 * Bounds - Consolidated operations for 3D bounding box math
 *
 * This namespace provides THE single way to:
 * - Access bounds properties by axis
 * - Modify bounds regions
 * - Calculate child region bounds for subdivisions
 *
 * All bounds operations should go through this namespace to ensure
 * consistent behavior and prevent bugs from duplicate implementations.
 */

import { Bounds } from '../types';

// ============================================================================
// ACCESSORS
// ============================================================================

/**
 * Get the start position of bounds along an axis
 */
const getStart = (bounds: Bounds, axis: 'x' | 'y' | 'z'): number =>
  axis === 'x' ? bounds.x : axis === 'y' ? bounds.y : bounds.z;

/**
 * Get the size of bounds along an axis
 */
const getSize = (bounds: Bounds, axis: 'x' | 'y' | 'z'): number =>
  axis === 'x' ? bounds.w : axis === 'y' ? bounds.h : bounds.d;

/**
 * Get the end position of bounds along an axis (start + size)
 */
const getEnd = (bounds: Bounds, axis: 'x' | 'y' | 'z'): number =>
  getStart(bounds, axis) + getSize(bounds, axis);

// ============================================================================
// MUTATORS (immutable - return new bounds)
// ============================================================================

/**
 * Create new bounds with a region set along an axis
 */
const setRegion = (
  bounds: Bounds,
  axis: 'x' | 'y' | 'z',
  start: number,
  size: number
): Bounds => {
  switch (axis) {
    case 'x': return { ...bounds, x: start, w: size };
    case 'y': return { ...bounds, y: start, h: size };
    case 'z': return { ...bounds, z: start, d: size };
  }
};

/**
 * Clone bounds (shallow copy)
 */
const clone = (bounds: Bounds): Bounds => ({ ...bounds });

// ============================================================================
// SUBDIVISION OPERATIONS
// ============================================================================

/**
 * Calculate the bounds for a child region within a subdivided void.
 *
 * This is THE single implementation for calculating subdivision region bounds.
 * Both void subdivision and panel generation should use this.
 *
 * @param parentBounds - The parent void's bounds
 * @param axis - The axis along which the void is subdivided
 * @param index - The index of this child region (0-based)
 * @param count - Total number of child regions
 * @param positions - Array of split positions (divider centers)
 * @param materialThickness - Thickness of dividers
 * @returns The bounds for this child region
 */
const calculateChildRegion = (
  parentBounds: Bounds,
  axis: 'x' | 'y' | 'z',
  index: number,
  count: number,
  positions: number[],
  materialThickness: number
): Bounds => {
  const dimStart = getStart(parentBounds, axis);
  const dimSize = getSize(parentBounds, axis);
  const mt = materialThickness;

  // Start of this void region
  const regionStart = index === 0
    ? dimStart
    : positions[index - 1] + mt / 2;  // After previous divider

  // End of this void region
  const regionEnd = index === count - 1
    ? dimStart + dimSize
    : positions[index] - mt / 2;  // Before next divider

  const regionSize = regionEnd - regionStart;

  return setRegion(parentBounds, axis, regionStart, regionSize);
};

/**
 * Calculate evenly spaced division positions along an axis
 *
 * @param bounds - The bounds to divide
 * @param axis - The axis along which to divide
 * @param count - Number of dividers (creates count+1 regions)
 * @returns Array of split positions (absolute coordinates)
 */
const calculateEvenDivisions = (
  bounds: Bounds,
  axis: 'x' | 'y' | 'z',
  count: number
): number[] => {
  const positions: number[] = [];
  const start = getStart(bounds, axis);
  const size = getSize(bounds, axis);

  for (let i = 1; i <= count; i++) {
    const fraction = i / (count + 1);
    positions.push(start + fraction * size);
  }

  return positions;
};

// ============================================================================
// EXPORT NAMESPACE
// ============================================================================

export const BoundsOps = {
  // Accessors
  getStart,
  getSize,
  getEnd,

  // Mutators
  setRegion,
  clone,

  // Subdivision
  calculateChildRegion,
  calculateEvenDivisions,
} as const;

// Also export individual functions for backwards compatibility during migration
export {
  getStart as getBoundsStart,
  getSize as getBoundsSize,
  setRegion as setBoundsRegion,
  calculateChildRegion as calculateChildRegionBounds,
  calculateEvenDivisions as calculatePreviewPositions,
};
