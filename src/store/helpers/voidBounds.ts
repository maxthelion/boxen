import { Void, Bounds } from '../../types';
import { getBoundsStart, getBoundsSize, calculateChildRegionBounds } from '../../utils/bounds';

// =============================================================================
// Void Bounds Calculation Functions
// =============================================================================

/**
 * Recalculate void bounds when dimensions change
 * For percentage-based subdivisions, recalculates splitPosition from splitPercentage
 * For absolute subdivisions, clamps position to valid range
 */
export const recalculateVoidBounds = (
  node: Void,
  parentBounds: Bounds,
  materialThickness: number
): Void => {
  // If this node has no children, just update its bounds to match parent
  if (node.children.length === 0) {
    return {
      ...node,
      bounds: { ...parentBounds },
    };
  }

  // This node has children - they were created by subdivisions
  // Find the split axis from the first child that has one
  const firstChildWithSplit = node.children.find(c => c.splitAxis);
  if (!firstChildWithSplit || !firstChildWithSplit.splitAxis) {
    // Children exist but no split info (e.g., lid inset children) - preserve structure
    return {
      ...node,
      bounds: { ...parentBounds },
      children: node.children.map(child => {
        // For lid inset voids, recalculate their bounds based on position
        if (child.lidInsetSide || child.isMainInterior) {
          // These are handled separately, just preserve them
          return child;
        }
        return recalculateVoidBounds(child, child.bounds, materialThickness);
      }),
    };
  }

  const axis = firstChildWithSplit.splitAxis;
  const mt = materialThickness;

  // Get dimension info for this axis
  const parentStart = getBoundsStart(parentBounds, axis);
  const parentSize = getBoundsSize(parentBounds, axis);
  const parentEnd = parentStart + parentSize;

  // Recalculate split positions for children
  // Children are ordered from low to high along the split axis
  // Only children after the first have splitPosition (child 0 doesn't have a divider before it)
  const newChildren: Void[] = [];
  const splitPositions: number[] = [];

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];

    if (child.splitAxis && child.splitPosition !== undefined) {
      let newPosition: number;

      if (child.splitPositionMode === 'percentage' && child.splitPercentage !== undefined) {
        // Calculate new position from percentage
        newPosition = parentStart + child.splitPercentage * parentSize;
      } else {
        // Absolute mode - keep the position but clamp to valid range
        // Calculate valid range: after previous divider + mt, before end - mt
        const minPos = (splitPositions.length > 0 ? splitPositions[splitPositions.length - 1] : parentStart) + mt;
        const maxPos = parentEnd - mt;
        newPosition = Math.max(minPos, Math.min(maxPos, child.splitPosition));
      }

      splitPositions.push(newPosition);
    }
  }

  // Now create new children with updated bounds
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];

    // Calculate region bounds for this child using consolidated helper
    const childBounds = calculateChildRegionBounds(
      parentBounds,
      axis,
      i,
      node.children.length,
      splitPositions,
      mt
    );

    // Recursively update this child
    const updatedChild = recalculateVoidBounds(
      {
        ...child,
        splitPosition: i > 0 ? splitPositions[i - 1] : child.splitPosition,
      },
      childBounds,
      materialThickness
    );

    newChildren.push(updatedChild);
  }

  return {
    ...node,
    bounds: { ...parentBounds },
    children: newChildren,
  };
};

/**
 * Get all leaf voids (voids with no children - these are selectable)
 */
export const getLeafVoids = (root: Void): Void[] => {
  const children = root.children || [];
  if (children.length === 0) {
    return [root];
  }
  return children.flatMap(getLeafVoids);
};

/**
 * Check if a void should be visible given the visibility settings
 * Visibility is now managed by adding/removing from hiddenVoidIds during isolate
 */
export const isVoidVisible = (
  voidId: string,
  _rootVoid: Void,
  hiddenVoidIds: Set<string>,
  _isolatedVoidId: string | null
): boolean => {
  return !hiddenVoidIds.has(voidId);
};

/**
 * Check if a sub-assembly should be visible given the visibility settings
 * Visibility is now managed by adding/removing from hiddenSubAssemblyIds during isolate
 */
export const isSubAssemblyVisible = (
  subAssemblyId: string,
  hiddenSubAssemblyIds: Set<string>,
  _isolatedSubAssemblyId: string | null
): boolean => {
  return !hiddenSubAssemblyIds.has(subAssemblyId);
};
