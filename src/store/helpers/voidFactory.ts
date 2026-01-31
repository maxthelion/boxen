import { Void, Bounds, AssemblyConfig } from '../../types';
import { BoundsOps } from '../../utils/bounds';

// =============================================================================
// Void Factory Functions
// =============================================================================

/**
 * Create a simple root void without lid inset considerations
 */
export const createSimpleRootVoid = (width: number, height: number, depth: number): Void => ({
  id: 'root',
  bounds: { x: 0, y: 0, z: 0, w: width, h: height, d: depth },
  children: [],
});

/**
 * Create root void with lid inset structure
 * When lids are inset, creates children: lid cap voids + main interior void
 */
export const createRootVoidWithInsets = (
  width: number,
  height: number,
  depth: number,
  assembly: AssemblyConfig,
  existingChildren?: Void[]
): Void => {
  const positiveInset = assembly.lids.positive.inset;
  const negativeInset = assembly.lids.negative.inset;

  // If no insets, return simple root void (preserving existing children)
  if (positiveInset === 0 && negativeInset === 0) {
    return {
      id: 'root',
      bounds: { x: 0, y: 0, z: 0, w: width, h: height, d: depth },
      children: existingChildren || [],
    };
  }

  // Calculate main interior and cap bounds using BoundsOps helper
  const outerBounds: Bounds = { x: 0, y: 0, z: 0, w: width, h: height, d: depth };
  const { main: mainBounds, positiveCap: positiveCapBounds, negativeCap: negativeCapBounds } =
    BoundsOps.calculateInsetRegions(outerBounds, assembly.assemblyAxis, positiveInset, negativeInset);

  // Build children array
  // Note: We do NOT set splitAxis/splitPosition on lid inset voids because
  // they are not physical divider panels - they're just the space between
  // the inset lid and the outer box edge.
  const children: Void[] = [];

  // Add negative cap void first (at lower position)
  if (negativeCapBounds) {
    children.push({
      id: 'lid-inset-negative',
      bounds: negativeCapBounds,
      children: [],
      lidInsetSide: 'negative',
    });
  }

  // Add main interior void (contains existing user subdivisions)
  children.push({
    id: 'main-interior',
    bounds: mainBounds,
    children: existingChildren || [],
    isMainInterior: true,
  });

  // Add positive cap void last (at higher position)
  if (positiveCapBounds) {
    children.push({
      id: 'lid-inset-positive',
      bounds: positiveCapBounds,
      children: [],
      lidInsetSide: 'positive',
    });
  }

  return {
    id: 'root',
    bounds: { x: 0, y: 0, z: 0, w: width, h: height, d: depth },
    children,
  };
};

/**
 * Get the main interior void (either root or the main-interior child if insets exist)
 */
export const getMainInteriorVoid = (root: Void): Void => {
  const mainInterior = root.children.find(c => c.isMainInterior);
  return mainInterior || root;
};

/**
 * Helper to get existing user subdivisions (excludes lid inset voids)
 */
export const getUserSubdivisions = (root: Void): Void[] => {
  // If root has a main-interior child, return its children
  const mainInterior = root.children.find(c => c.isMainInterior);
  if (mainInterior) {
    return mainInterior.children;
  }
  // Otherwise, return root's children (filtering out any lid inset voids just in case)
  return root.children.filter(c => !c.lidInsetSide);
};
