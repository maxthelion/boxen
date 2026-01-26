/**
 * VoidTree - Consolidated operations for the void tree structure
 *
 * This namespace provides THE single way to:
 * - Traverse the void tree (find, findParent, etc.)
 * - Modify the void tree (update, clone, subdivide)
 * - Query the void tree (getSubtreeIds, getAncestorIds, etc.)
 *
 * All void operations should go through this namespace to ensure
 * consistent behavior and prevent bugs from duplicate implementations.
 */

import { Void, Bounds, SubAssembly } from '../types';
import { BoundsOps } from './bounds';

/**
 * Generate a unique ID for new voids
 */
const generateId = (): string => {
  return Math.random().toString(36).substring(2, 9);
};

// ============================================================================
// TRAVERSAL OPERATIONS
// ============================================================================

/**
 * Find a void by ID in the tree (including inside sub-assemblies)
 */
const find = (root: Void, id: string): Void | null => {
  if (root.id === id) return root;
  for (const child of (root.children || [])) {
    const found = find(child, id);
    if (found) return found;
  }
  // Also search inside sub-assembly's void structure
  if (root.subAssembly) {
    const found = find(root.subAssembly.rootVoid, id);
    if (found) return found;
  }
  return null;
};

/**
 * Find parent of a void (including inside sub-assemblies)
 */
const findParent = (root: Void, id: string): Void | null => {
  for (const child of (root.children || [])) {
    if (child.id === id) return root;
    const found = findParent(child, id);
    if (found) return found;
  }
  // Also search inside sub-assembly's void structure
  if (root.subAssembly) {
    if (root.subAssembly.rootVoid.id === id) return root.subAssembly.rootVoid;
    const found = findParent(root.subAssembly.rootVoid, id);
    if (found) return found;
  }
  return null;
};

/**
 * Get all void IDs in a subtree (including the root)
 */
const getSubtreeIds = (root: Void): string[] => {
  const ids = [root.id];
  for (const child of (root.children || [])) {
    ids.push(...getSubtreeIds(child));
  }
  return ids;
};

/**
 * Get ancestor IDs of a void (path from root to the void, excluding the void itself)
 */
const getAncestorIds = (root: Void, targetId: string): string[] => {
  const path: string[] = [];

  const findPath = (node: Void, target: string): boolean => {
    if (node.id === target) return true;
    for (const child of (node.children || [])) {
      if (findPath(child, target)) {
        path.unshift(node.id);
        return true;
      }
    }
    return false;
  };

  findPath(root, targetId);
  return path;
};

/**
 * Find a sub-assembly by ID in the void tree
 */
const findSubAssembly = (root: Void, subAssemblyId: string): { void: Void; subAssembly: SubAssembly } | null => {
  if (root.subAssembly?.id === subAssemblyId) {
    return { void: root, subAssembly: root.subAssembly };
  }
  for (const child of (root.children || [])) {
    const found = findSubAssembly(child, subAssemblyId);
    if (found) return found;
  }
  // Also search within sub-assembly's own voids
  if (root.subAssembly) {
    const found = findSubAssembly(root.subAssembly.rootVoid, subAssemblyId);
    if (found) return found;
  }
  return null;
};

/**
 * Get all sub-assemblies from the void tree
 */
const getAllSubAssemblies = (root: Void): { voidId: string; subAssembly: SubAssembly; bounds: Bounds }[] => {
  const result: { voidId: string; subAssembly: SubAssembly; bounds: Bounds }[] = [];

  const traverse = (node: Void) => {
    if (node.subAssembly) {
      result.push({
        voidId: node.id,
        subAssembly: node.subAssembly,
        bounds: node.bounds,
      });
      // Also traverse the sub-assembly's internal structure
      traverse(node.subAssembly.rootVoid);
    }
    for (const child of (node.children || [])) {
      traverse(child);
    }
  };

  traverse(root);
  return result;
};

// ============================================================================
// MUTATION OPERATIONS (immutable - return new trees)
// ============================================================================

/**
 * Deep clone a void tree (including sub-assemblies)
 */
const clone = (v: Void): Void => ({
  ...v,
  bounds: { ...v.bounds },
  children: (v.children || []).map(clone),
  subAssembly: v.subAssembly ? {
    ...v.subAssembly,
    faces: (v.subAssembly.faces || []).map(f => ({ ...f })),
    rootVoid: clone(v.subAssembly.rootVoid),
  } : undefined,
});

/**
 * Update a void in the tree immutably (including inside sub-assemblies)
 */
const update = (root: Void, id: string, updater: (v: Void) => Void): Void => {
  if (root.id === id) {
    return updater(clone(root));
  }
  return {
    ...root,
    bounds: { ...root.bounds },
    children: (root.children || []).map(child => update(child, id, updater)),
    // Also update inside sub-assembly's void structure
    subAssembly: root.subAssembly ? {
      ...root.subAssembly,
      rootVoid: update(root.subAssembly.rootVoid, id, updater),
    } : undefined,
  };
};

// ============================================================================
// SUBDIVISION OPERATIONS
// ============================================================================

/**
 * Create child voids for a subdivision
 *
 * This is THE single implementation for creating subdivided voids.
 * Both UI paths (void selection and two-panel selection) should use this.
 *
 * @param parentBounds - Bounds of the void being subdivided
 * @param axis - Axis along which to subdivide ('x', 'y', or 'z')
 * @param positions - Array of split positions (absolute coordinates)
 * @param materialThickness - Thickness of divider panels
 * @returns Array of child voids
 */
const createSubdivisionChildren = (
  parentBounds: Bounds,
  axis: 'x' | 'y' | 'z',
  positions: number[],
  materialThickness: number
): Void[] => {
  const children: Void[] = [];
  const count = positions.length;  // Number of dividers
  const dimStart = BoundsOps.getStart(parentBounds, axis);
  const dimSize = BoundsOps.getSize(parentBounds, axis);

  for (let i = 0; i <= count; i++) {
    const childBounds = BoundsOps.calculateChildRegion(
      parentBounds,
      axis,
      i,
      count + 1,  // count is number of dividers, we have count+1 regions
      positions,
      materialThickness
    );

    // Set split info for children after the first (they have a divider before them)
    const splitPos = i > 0 ? positions[i - 1] : undefined;
    const splitAxis = i > 0 ? axis : undefined;

    // Calculate percentage for this split position
    let splitPercentage: number | undefined;
    if (splitPos !== undefined) {
      splitPercentage = (splitPos - dimStart) / dimSize;
    }

    children.push({
      id: generateId(),
      bounds: childBounds,
      children: [],
      splitAxis,
      splitPosition: splitPos,
      splitPositionMode: splitPos !== undefined ? 'percentage' : undefined,
      splitPercentage,
    });
  }

  return children;
};

/**
 * Subdivide a void in the tree
 *
 * This is THE single way to subdivide a void. Both UI paths should call this.
 *
 * @param root - Root of the void tree
 * @param voidId - ID of the void to subdivide
 * @param axis - Axis along which to subdivide
 * @param positions - Array of split positions (absolute coordinates)
 * @param materialThickness - Thickness of divider panels
 * @returns New root void with the subdivision applied, or null if invalid
 */
const subdivide = (
  root: Void,
  voidId: string,
  axis: 'x' | 'y' | 'z',
  positions: number[],
  materialThickness: number
): Void | null => {
  const targetVoid = find(root, voidId);
  if (!targetVoid || targetVoid.children.length > 0) {
    return null;  // Can't subdivide non-existent or already-subdivided void
  }

  const children = createSubdivisionChildren(
    targetVoid.bounds,
    axis,
    positions,
    materialThickness
  );

  return update(root, voidId, (v) => ({
    ...v,
    children,
  }));
};

/**
 * Remove subdivision from a void (remove all children)
 *
 * @param root - Root of the void tree
 * @param voidId - ID of a child void (will remove all siblings too)
 * @returns New root void with subdivision removed, or null if invalid
 */
const removeSubdivision = (root: Void, voidId: string): Void | null => {
  const parent = findParent(root, voidId);
  if (!parent) return null;

  return update(root, parent.id, (v) => ({
    ...v,
    children: [],
  }));
};

// ============================================================================
// EXPORT NAMESPACE
// ============================================================================

export const VoidTree = {
  // Traversal
  find,
  findParent,
  getSubtreeIds,
  getAncestorIds,
  findSubAssembly,
  getAllSubAssemblies,

  // Mutation
  clone,
  update,

  // Subdivision
  createSubdivisionChildren,
  subdivide,
  removeSubdivision,

  // Utilities
  generateId,
} as const;

// Also export individual functions for backwards compatibility during migration
export {
  find as findVoid,
  findParent,
  getSubtreeIds as getVoidSubtreeIds,
  getAncestorIds as getVoidAncestorIds,
  getAllSubAssemblies,
};
