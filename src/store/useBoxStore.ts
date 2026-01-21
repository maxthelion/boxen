import { create } from 'zustand';
import { BoxState, BoxActions, FaceId, Void, Bounds, Subdivision, SubdivisionPreview, SelectionMode, SubAssemblyType, SubAssembly, Face, AssemblyAxis, LidTabDirection, defaultAssemblyConfig, AssemblyConfig } from '../types';

const generateId = () => Math.random().toString(36).substr(2, 9);

// Create a simple root void without lid inset considerations
const createSimpleRootVoid = (width: number, height: number, depth: number): Void => ({
  id: 'root',
  bounds: { x: 0, y: 0, z: 0, w: width, h: height, d: depth },
  children: [],
});

// Create root void with lid inset structure
// When lids are inset, creates children: lid cap voids + main interior void
const createRootVoidWithInsets = (
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

  // Calculate main interior bounds based on assembly axis
  let mainBounds: Bounds;
  let positiveCapBounds: Bounds | null = null;
  let negativeCapBounds: Bounds | null = null;

  switch (assembly.assemblyAxis) {
    case 'y':
      // Top/bottom are lids
      mainBounds = {
        x: 0,
        y: negativeInset,
        z: 0,
        w: width,
        h: height - positiveInset - negativeInset,
        d: depth,
      };
      if (positiveInset > 0) {
        positiveCapBounds = {
          x: 0,
          y: height - positiveInset,
          z: 0,
          w: width,
          h: positiveInset,
          d: depth,
        };
      }
      if (negativeInset > 0) {
        negativeCapBounds = {
          x: 0,
          y: 0,
          z: 0,
          w: width,
          h: negativeInset,
          d: depth,
        };
      }
      break;

    case 'x':
      // Left/right are lids
      mainBounds = {
        x: negativeInset,
        y: 0,
        z: 0,
        w: width - positiveInset - negativeInset,
        h: height,
        d: depth,
      };
      if (positiveInset > 0) {
        positiveCapBounds = {
          x: width - positiveInset,
          y: 0,
          z: 0,
          w: positiveInset,
          h: height,
          d: depth,
        };
      }
      if (negativeInset > 0) {
        negativeCapBounds = {
          x: 0,
          y: 0,
          z: 0,
          w: negativeInset,
          h: height,
          d: depth,
        };
      }
      break;

    case 'z':
      // Front/back are lids
      mainBounds = {
        x: 0,
        y: 0,
        z: negativeInset,
        w: width,
        h: height,
        d: depth - positiveInset - negativeInset,
      };
      if (positiveInset > 0) {
        positiveCapBounds = {
          x: 0,
          y: 0,
          z: depth - positiveInset,
          w: width,
          h: height,
          d: positiveInset,
        };
      }
      if (negativeInset > 0) {
        negativeCapBounds = {
          x: 0,
          y: 0,
          z: 0,
          w: width,
          h: height,
          d: negativeInset,
        };
      }
      break;
  }

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

// Get the main interior void (either root or the main-interior child if insets exist)
export const getMainInteriorVoid = (root: Void): Void => {
  const mainInterior = root.children.find(c => c.isMainInterior);
  return mainInterior || root;
};

// Helper to get existing user subdivisions (excludes lid inset voids)
const getUserSubdivisions = (root: Void): Void[] => {
  // If root has a main-interior child, return its children
  const mainInterior = root.children.find(c => c.isMainInterior);
  if (mainInterior) {
    return mainInterior.children;
  }
  // Otherwise, return root's children (filtering out any lid inset voids just in case)
  return root.children.filter(c => !c.lidInsetSide);
};

const initialFaces = (): { id: FaceId; solid: boolean }[] => [
  { id: 'front', solid: true },
  { id: 'back', solid: true },
  { id: 'left', solid: true },
  { id: 'right', solid: true },
  { id: 'top', solid: true },
  { id: 'bottom', solid: true },
];

// Find a void by ID in the tree
const findVoid = (root: Void, id: string): Void | null => {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findVoid(child, id);
    if (found) return found;
  }
  return null;
};

// Find parent of a void
const findParent = (root: Void, id: string): Void | null => {
  for (const child of root.children) {
    if (child.id === id) return root;
    const found = findParent(child, id);
    if (found) return found;
  }
  return null;
};

// Get all leaf voids (voids with no children - these are selectable)
export const getLeafVoids = (root: Void): Void[] => {
  if (root.children.length === 0) {
    return [root];
  }
  return root.children.flatMap(getLeafVoids);
};

// Get all void IDs in a subtree (including the root)
export const getVoidSubtreeIds = (root: Void): string[] => {
  const ids = [root.id];
  for (const child of root.children) {
    ids.push(...getVoidSubtreeIds(child));
  }
  return ids;
};

// Get ancestor IDs of a void (path from root to the void, excluding the void itself)
export const getVoidAncestorIds = (root: Void, targetId: string): string[] => {
  const path: string[] = [];

  const findPath = (node: Void, target: string): boolean => {
    if (node.id === target) return true;
    for (const child of node.children) {
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

// Check if a void should be visible given the visibility settings
export const isVoidVisible = (
  voidId: string,
  rootVoid: Void,
  hiddenVoidIds: Set<string>,
  isolatedVoidId: string | null
): boolean => {
  // If explicitly hidden, not visible
  if (hiddenVoidIds.has(voidId)) return false;

  // If no isolation, visible (unless hidden)
  if (!isolatedVoidId) return true;

  // If this is the isolated void, visible
  if (voidId === isolatedVoidId) return true;

  // Check if this void is an ancestor of the isolated void
  const ancestorIds = getVoidAncestorIds(rootVoid, isolatedVoidId);
  if (ancestorIds.includes(voidId)) return true;

  // Check if this void is a descendant of the isolated void
  const isolatedVoid = findVoid(rootVoid, isolatedVoidId);
  if (isolatedVoid) {
    const subtreeIds = getVoidSubtreeIds(isolatedVoid);
    if (subtreeIds.includes(voidId)) return true;
  }

  return false;
};

// Check if a sub-assembly should be visible given the visibility settings
export const isSubAssemblyVisible = (
  subAssemblyId: string,
  hiddenSubAssemblyIds: Set<string>,
  isolatedSubAssemblyId: string | null
): boolean => {
  // If explicitly hidden, not visible
  if (hiddenSubAssemblyIds.has(subAssemblyId)) return false;

  // If no isolation, visible (unless hidden)
  if (!isolatedSubAssemblyId) return true;

  // If this is the isolated sub-assembly, visible
  return subAssemblyId === isolatedSubAssemblyId;
};

// Get all subdivisions (non-leaf voids have split info)
export const getAllSubdivisions = (root: Void): Subdivision[] => {
  const subdivisions: Subdivision[] = [];

  const traverse = (node: Void, parentBounds: Bounds) => {
    if (node.splitAxis && node.splitPosition !== undefined) {
      subdivisions.push({
        id: node.id + '-split',
        axis: node.splitAxis,
        position: node.splitPosition,
        bounds: parentBounds,
      });
    }

    for (const child of node.children) {
      traverse(child, node.bounds);
    }
  };

  for (const child of root.children) {
    traverse(child, root.bounds);
  }

  return subdivisions;
};

// Calculate preview positions for a given axis and count
export const calculatePreviewPositions = (
  bounds: Bounds,
  axis: 'x' | 'y' | 'z',
  count: number
): number[] => {
  const positions: number[] = [];

  for (let i = 1; i <= count; i++) {
    const fraction = i / (count + 1);
    switch (axis) {
      case 'x':
        positions.push(bounds.x + fraction * bounds.w);
        break;
      case 'y':
        positions.push(bounds.y + fraction * bounds.h);
        break;
      case 'z':
        positions.push(bounds.z + fraction * bounds.d);
        break;
    }
  }

  return positions;
};

// Deep clone a void tree (including sub-assemblies)
const cloneVoid = (v: Void): Void => ({
  ...v,
  bounds: { ...v.bounds },
  children: v.children.map(cloneVoid),
  subAssembly: v.subAssembly ? {
    ...v.subAssembly,
    faces: v.subAssembly.faces.map(f => ({ ...f })),
    rootVoid: cloneVoid(v.subAssembly.rootVoid),
  } : undefined,
});

// Find a sub-assembly by ID in the void tree
const findSubAssembly = (root: Void, subAssemblyId: string): { void: Void; subAssembly: SubAssembly } | null => {
  if (root.subAssembly?.id === subAssemblyId) {
    return { void: root, subAssembly: root.subAssembly };
  }
  for (const child of root.children) {
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

// Get all sub-assemblies from the void tree
export const getAllSubAssemblies = (root: Void): { voidId: string; subAssembly: SubAssembly; bounds: Bounds }[] => {
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
    for (const child of node.children) {
      traverse(child);
    }
  };

  traverse(root);
  return result;
};

// Update a void in the tree immutably
const updateVoidInTree = (root: Void, id: string, updater: (v: Void) => Void): Void => {
  if (root.id === id) {
    return updater(cloneVoid(root));
  }
  return {
    ...root,
    bounds: { ...root.bounds },
    children: root.children.map(child => updateVoidInTree(child, id, updater)),
  };
};

export const useBoxStore = create<BoxState & BoxActions>((set, get) => ({
  config: {
    width: 100,
    height: 100,
    depth: 100,
    materialThickness: 3,
    fingerWidth: 10,
    fingerGap: 1.5,  // Corner gap as multiplier of fingerWidth
    assembly: defaultAssemblyConfig,
  },
  faces: initialFaces(),
  rootVoid: createSimpleRootVoid(100, 100, 100),
  selectionMode: 'assembly' as SelectionMode,
  selectedVoidId: null,
  selectedSubAssemblyId: null,
  selectedPanelId: null,
  selectedAssemblyId: 'main',  // Default to main assembly selected
  subdivisionPreview: null,
  hiddenVoidIds: new Set<string>(),
  isolatedVoidId: null,
  hiddenSubAssemblyIds: new Set<string>(),
  isolatedSubAssemblyId: null,
  hiddenFaceIds: new Set<string>(),

  setConfig: (newConfig) =>
    set((state) => {
      const config = { ...state.config, ...newConfig };
      return {
        config,
        rootVoid: createRootVoidWithInsets(config.width, config.height, config.depth, config.assembly),
        selectedVoidId: null,
        selectedSubAssemblyId: null,
        selectedPanelId: null,
        selectedAssemblyId: null,
        subdivisionPreview: null,
        hiddenVoidIds: new Set<string>(),
        isolatedVoidId: null,
        hiddenSubAssemblyIds: new Set<string>(),
        isolatedSubAssemblyId: null,
        hiddenFaceIds: new Set<string>(),
      };
    }),

  toggleFace: (faceId) =>
    set((state) => ({
      faces: state.faces.map((face) =>
        face.id === faceId ? { ...face, solid: !face.solid } : face
      ),
      subdivisionPreview: null,  // Clear preview when faces change
    })),

  setSelectionMode: (mode) =>
    set({
      selectionMode: mode,
      selectedVoidId: null,
      selectedSubAssemblyId: null,
      selectedPanelId: null,
      selectedAssemblyId: null,
      subdivisionPreview: null,
    }),

  selectVoid: (voidId) =>
    set({
      selectedVoidId: voidId,
      selectedSubAssemblyId: null,
      selectedPanelId: null,
      selectedAssemblyId: null,
      // Keep subdivisionPreview - don't clear on selection change
    }),

  selectPanel: (panelId) =>
    set({
      selectedPanelId: panelId,
      selectedVoidId: null,
      selectedSubAssemblyId: null,
      selectedAssemblyId: null,
      // Keep subdivisionPreview - don't clear on selection change
    }),

  selectAssembly: (assemblyId) =>
    set({
      selectedAssemblyId: assemblyId,
      selectedVoidId: null,
      selectedSubAssemblyId: null,
      selectedPanelId: null,
      // Keep subdivisionPreview - don't clear on selection change
    }),

  setSubdivisionPreview: (preview) =>
    set({ subdivisionPreview: preview }),

  applySubdivision: () =>
    set((state) => {
      const preview = state.subdivisionPreview;
      if (!preview) return state;

      const targetVoid = findVoid(state.rootVoid, preview.voidId);
      if (!targetVoid || targetVoid.children.length > 0) return state;

      const { bounds } = targetVoid;
      const { axis, count, positions } = preview;
      const mt = state.config.materialThickness;

      // Create N+1 child voids for N divisions
      // Account for material thickness of dividers
      const children: Void[] = [];

      // Get the dimension size along the split axis
      const dimSize = axis === 'x' ? bounds.w : axis === 'y' ? bounds.h : bounds.d;
      const dimStart = axis === 'x' ? bounds.x : axis === 'y' ? bounds.y : bounds.z;

      // Calculate void boundaries accounting for divider thickness
      // Each divider is centered at its position and takes up materialThickness
      for (let i = 0; i <= count; i++) {
        // Start of this void region
        const regionStart = i === 0
          ? dimStart
          : positions[i - 1] + mt / 2;  // After previous divider

        // End of this void region
        const regionEnd = i === count
          ? dimStart + dimSize
          : positions[i] - mt / 2;  // Before next divider

        const regionSize = regionEnd - regionStart;

        let childBounds: Bounds;
        let splitPos: number | undefined;
        let splitAxis: 'x' | 'y' | 'z' | undefined;

        switch (axis) {
          case 'x':
            childBounds = {
              ...bounds,
              x: regionStart,
              w: regionSize,
            };
            if (i > 0) {
              splitPos = positions[i - 1];
              splitAxis = axis;
            }
            break;
          case 'y':
            childBounds = {
              ...bounds,
              y: regionStart,
              h: regionSize,
            };
            if (i > 0) {
              splitPos = positions[i - 1];
              splitAxis = axis;
            }
            break;
          case 'z':
            childBounds = {
              ...bounds,
              z: regionStart,
              d: regionSize,
            };
            if (i > 0) {
              splitPos = positions[i - 1];
              splitAxis = axis;
            }
            break;
        }

        children.push({
          id: generateId(),
          bounds: childBounds,
          children: [],
          splitAxis,
          splitPosition: splitPos,
        });
      }

      const newRootVoid = updateVoidInTree(state.rootVoid, preview.voidId, (v) => ({
        ...v,
        children,
      }));

      return {
        rootVoid: newRootVoid,
        selectedVoidId: null,
        selectedPanelId: null,
        subdivisionPreview: null,
      };
    }),

  removeVoid: (voidId) =>
    set((state) => {
      const parent = findParent(state.rootVoid, voidId);
      if (!parent) return state;

      const newRootVoid = updateVoidInTree(state.rootVoid, parent.id, (v) => ({
        ...v,
        children: [],
      }));

      return {
        rootVoid: newRootVoid,
        selectedVoidId: null,
        selectedPanelId: null,
        subdivisionPreview: null,
      };
    }),

  resetVoids: () =>
    set((state) => ({
      rootVoid: createRootVoidWithInsets(state.config.width, state.config.height, state.config.depth, state.config.assembly),
      selectedVoidId: null,
      selectedSubAssemblyId: null,
      selectedPanelId: null,
      selectedAssemblyId: null,
      subdivisionPreview: null,
      hiddenVoidIds: new Set<string>(),
      isolatedVoidId: null,
      hiddenSubAssemblyIds: new Set<string>(),
      isolatedSubAssemblyId: null,
      hiddenFaceIds: new Set<string>(),
    })),

  // Sub-assembly actions
  createSubAssembly: (voidId, type) =>
    set((state) => {
      const targetVoid = findVoid(state.rootVoid, voidId);
      if (!targetVoid || targetVoid.children.length > 0 || targetVoid.subAssembly) {
        return state; // Can't create sub-assembly in non-leaf void or if one already exists
      }

      const clearance = 2; // Default 2mm clearance
      const { bounds } = targetVoid;

      // Calculate inner dimensions (accounting for clearance on all sides)
      const innerWidth = bounds.w - (clearance * 2);
      const innerHeight = bounds.h - (clearance * 2);
      const innerDepth = bounds.d - (clearance * 2);

      if (innerWidth <= 0 || innerHeight <= 0 || innerDepth <= 0) {
        return state; // Void too small for sub-assembly
      }

      // Create sub-assembly with default faces based on type
      const defaultFaces: Face[] = [
        { id: 'front', solid: type === 'drawer' ? true : true },
        { id: 'back', solid: true },
        { id: 'left', solid: true },
        { id: 'right', solid: true },
        { id: 'top', solid: type === 'drawer' ? false : type === 'tray' ? false : true },
        { id: 'bottom', solid: true },
      ];

      const subAssembly: SubAssembly = {
        id: generateId(),
        type,
        clearance,
        faces: defaultFaces,
        materialThickness: state.config.materialThickness,
        rootVoid: {
          id: 'sub-root-' + generateId(),
          bounds: { x: 0, y: 0, z: 0, w: innerWidth, h: innerHeight, d: innerDepth },
          children: [],
        },
        // Default assembly config for sub-assemblies: Y axis with tabs-out
        assembly: {
          assemblyAxis: 'y',
          lids: {
            positive: { enabled: type !== 'tray' && type !== 'drawer', tabDirection: 'tabs-out', inset: 0 },
            negative: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
          },
        },
      };

      const newRootVoid = updateVoidInTree(state.rootVoid, voidId, (v) => ({
        ...v,
        subAssembly,
      }));

      return {
        rootVoid: newRootVoid,
        selectedVoidId: null,
        selectedSubAssemblyId: subAssembly.id,
        subdivisionPreview: null,
      };
    }),

  selectSubAssembly: (subAssemblyId) =>
    set({
      selectedSubAssemblyId: subAssemblyId,
      selectedVoidId: null,
      selectedPanelId: null,
      selectedAssemblyId: null,
      // Keep subdivisionPreview - don't clear on selection change
    }),

  toggleSubAssemblyFace: (subAssemblyId, faceId) =>
    set((state) => {
      const found = findSubAssembly(state.rootVoid, subAssemblyId);
      if (!found) return state;

      // We need to find the parent void and update it
      const updateSubAssemblyInVoid = (v: Void): Void => {
        if (v.subAssembly?.id === subAssemblyId) {
          return {
            ...v,
            subAssembly: {
              ...v.subAssembly,
              faces: v.subAssembly.faces.map((f) =>
                f.id === faceId ? { ...f, solid: !f.solid } : f
              ),
            },
          };
        }
        return {
          ...v,
          children: v.children.map(updateSubAssemblyInVoid),
          subAssembly: v.subAssembly ? {
            ...v.subAssembly,
            rootVoid: updateSubAssemblyInVoid(v.subAssembly.rootVoid),
          } : undefined,
        };
      };

      return {
        rootVoid: updateSubAssemblyInVoid(state.rootVoid),
      };
    }),

  setSubAssemblyClearance: (subAssemblyId, clearance) =>
    set((state) => {
      const updateSubAssemblyInVoid = (v: Void): Void => {
        if (v.subAssembly?.id === subAssemblyId) {
          const newClearance = Math.max(0, clearance);
          const innerWidth = v.bounds.w - (newClearance * 2);
          const innerHeight = v.bounds.h - (newClearance * 2);
          const innerDepth = v.bounds.d - (newClearance * 2);

          if (innerWidth <= 0 || innerHeight <= 0 || innerDepth <= 0) {
            return v; // Invalid clearance
          }

          return {
            ...v,
            subAssembly: {
              ...v.subAssembly,
              clearance: newClearance,
              rootVoid: {
                ...v.subAssembly.rootVoid,
                bounds: { x: 0, y: 0, z: 0, w: innerWidth, h: innerHeight, d: innerDepth },
                children: [], // Reset children when clearance changes
              },
            },
          };
        }
        return {
          ...v,
          children: v.children.map(updateSubAssemblyInVoid),
        };
      };

      return {
        rootVoid: updateSubAssemblyInVoid(state.rootVoid),
      };
    }),

  removeSubAssembly: (voidId) =>
    set((state) => {
      const newRootVoid = updateVoidInTree(state.rootVoid, voidId, (v) => ({
        ...v,
        subAssembly: undefined,
      }));

      return {
        rootVoid: newRootVoid,
        selectedVoidId: null,
        selectedSubAssemblyId: null,
        subdivisionPreview: null,
      };
    }),

  // Visibility actions
  toggleVoidVisibility: (voidId) =>
    set((state) => {
      const newHiddenVoidIds = new Set(state.hiddenVoidIds);
      if (newHiddenVoidIds.has(voidId)) {
        newHiddenVoidIds.delete(voidId);
      } else {
        newHiddenVoidIds.add(voidId);
      }
      return { hiddenVoidIds: newHiddenVoidIds };
    }),

  setIsolatedVoid: (voidId) =>
    set({ isolatedVoidId: voidId }),

  // Sub-assembly visibility actions
  toggleSubAssemblyVisibility: (subAssemblyId) =>
    set((state) => {
      const newHiddenSubAssemblyIds = new Set(state.hiddenSubAssemblyIds);
      if (newHiddenSubAssemblyIds.has(subAssemblyId)) {
        newHiddenSubAssemblyIds.delete(subAssemblyId);
      } else {
        newHiddenSubAssemblyIds.add(subAssemblyId);
      }
      return { hiddenSubAssemblyIds: newHiddenSubAssemblyIds };
    }),

  setIsolatedSubAssembly: (subAssemblyId) =>
    set({ isolatedSubAssemblyId: subAssemblyId }),

  // Face panel visibility actions
  toggleFaceVisibility: (faceId) =>
    set((state) => {
      const newHiddenFaceIds = new Set(state.hiddenFaceIds);
      if (newHiddenFaceIds.has(faceId)) {
        newHiddenFaceIds.delete(faceId);
      } else {
        newHiddenFaceIds.add(faceId);
      }
      return { hiddenFaceIds: newHiddenFaceIds };
    }),

  // Assembly config actions for main box
  setAssemblyAxis: (axis) =>
    set((state) => {
      const newAssembly: AssemblyConfig = {
        ...state.config.assembly,
        assemblyAxis: axis,
      };

      // Rebuild the void structure with the new axis
      // Preserve user subdivisions from the main interior
      const userSubdivisions = getUserSubdivisions(state.rootVoid);
      const newRootVoid = createRootVoidWithInsets(
        state.config.width,
        state.config.height,
        state.config.depth,
        newAssembly,
        userSubdivisions
      );

      return {
        config: {
          ...state.config,
          assembly: newAssembly,
        },
        rootVoid: newRootVoid,
        // Clear selection when void structure changes
        selectedVoidId: null,
        selectedPanelId: null,
      };
    }),

  setLidTabDirection: (side, direction) =>
    set((state) => {
      const newInset = direction === 'tabs-in' ? 0 : state.config.assembly.lids[side].inset;
      const newAssembly: AssemblyConfig = {
        ...state.config.assembly,
        lids: {
          ...state.config.assembly.lids,
          [side]: {
            ...state.config.assembly.lids[side],
            tabDirection: direction,
            // If setting tabs-in and there's an inset, reset inset to 0
            // (tabs-in doesn't work with inset)
            inset: newInset,
          },
        },
      };

      // Rebuild the void structure if inset changed
      const userSubdivisions = getUserSubdivisions(state.rootVoid);
      const newRootVoid = createRootVoidWithInsets(
        state.config.width,
        state.config.height,
        state.config.depth,
        newAssembly,
        userSubdivisions
      );

      return {
        config: {
          ...state.config,
          assembly: newAssembly,
        },
        rootVoid: newRootVoid,
      };
    }),

  setLidInset: (side, inset) =>
    set((state) => {
      const newInset = Math.max(0, inset);
      const newAssembly: AssemblyConfig = {
        ...state.config.assembly,
        lids: {
          ...state.config.assembly.lids,
          [side]: {
            ...state.config.assembly.lids[side],
            inset: newInset,
            // If setting inset > 0, force tabs-out (tabs-in doesn't work with inset)
            tabDirection: newInset > 0 ? 'tabs-out' : state.config.assembly.lids[side].tabDirection,
          },
        },
      };

      // Rebuild the void structure with the new insets
      // Preserve user subdivisions from the main interior
      const userSubdivisions = getUserSubdivisions(state.rootVoid);
      const newRootVoid = createRootVoidWithInsets(
        state.config.width,
        state.config.height,
        state.config.depth,
        newAssembly,
        userSubdivisions
      );

      return {
        config: {
          ...state.config,
          assembly: newAssembly,
        },
        rootVoid: newRootVoid,
        // Clear selection when void structure changes
        selectedVoidId: null,
        selectedPanelId: null,
      };
    }),

  // Assembly config actions for sub-assemblies
  setSubAssemblyAxis: (subAssemblyId, axis) =>
    set((state) => {
      const updateSubAssemblyInVoid = (v: Void): Void => {
        if (v.subAssembly?.id === subAssemblyId) {
          return {
            ...v,
            subAssembly: {
              ...v.subAssembly,
              assembly: {
                ...v.subAssembly.assembly,
                assemblyAxis: axis,
              },
            },
          };
        }
        return {
          ...v,
          children: v.children.map(updateSubAssemblyInVoid),
          subAssembly: v.subAssembly ? {
            ...v.subAssembly,
            rootVoid: updateSubAssemblyInVoid(v.subAssembly.rootVoid),
          } : undefined,
        };
      };

      return {
        rootVoid: updateSubAssemblyInVoid(state.rootVoid),
      };
    }),

  setSubAssemblyLidTabDirection: (subAssemblyId, side, direction) =>
    set((state) => {
      const updateSubAssemblyInVoid = (v: Void): Void => {
        if (v.subAssembly?.id === subAssemblyId) {
          return {
            ...v,
            subAssembly: {
              ...v.subAssembly,
              assembly: {
                ...v.subAssembly.assembly,
                lids: {
                  ...v.subAssembly.assembly.lids,
                  [side]: {
                    ...v.subAssembly.assembly.lids[side],
                    tabDirection: direction,
                    inset: direction === 'tabs-in' ? 0 : v.subAssembly.assembly.lids[side].inset,
                  },
                },
              },
            },
          };
        }
        return {
          ...v,
          children: v.children.map(updateSubAssemblyInVoid),
          subAssembly: v.subAssembly ? {
            ...v.subAssembly,
            rootVoid: updateSubAssemblyInVoid(v.subAssembly.rootVoid),
          } : undefined,
        };
      };

      return {
        rootVoid: updateSubAssemblyInVoid(state.rootVoid),
      };
    }),

  setSubAssemblyLidInset: (subAssemblyId, side, inset) =>
    set((state) => {
      const updateSubAssemblyInVoid = (v: Void): Void => {
        if (v.subAssembly?.id === subAssemblyId) {
          return {
            ...v,
            subAssembly: {
              ...v.subAssembly,
              assembly: {
                ...v.subAssembly.assembly,
                lids: {
                  ...v.subAssembly.assembly.lids,
                  [side]: {
                    ...v.subAssembly.assembly.lids[side],
                    inset: Math.max(0, inset),
                    tabDirection: inset > 0 ? 'tabs-out' : v.subAssembly.assembly.lids[side].tabDirection,
                  },
                },
              },
            },
          };
        }
        return {
          ...v,
          children: v.children.map(updateSubAssemblyInVoid),
          subAssembly: v.subAssembly ? {
            ...v.subAssembly,
            rootVoid: updateSubAssemblyInVoid(v.subAssembly.rootVoid),
          } : undefined,
        };
      };

      return {
        rootVoid: updateSubAssemblyInVoid(state.rootVoid),
      };
    }),
}));
