import { create } from 'zustand';
import { BoxState, BoxActions, FaceId, Void, Bounds, Subdivision, SubdivisionPreview, SelectionMode, SubAssemblyType, SubAssembly, Face, AssemblyAxis, LidTabDirection, defaultAssemblyConfig, AssemblyConfig, PanelCollection, PanelPath, PanelHole, PanelAugmentation, defaultEdgeExtensions, EdgeExtensions } from '../types';
import { loadFromUrl, saveToUrl as saveStateToUrl, getShareableUrl as getShareUrl, ProjectState } from '../utils/urlState';
import { generatePanelCollection } from '../utils/panelGenerator';

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
        bounds: parentBounds,  // Bounds of the parent void (where the divider can move)
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
  selectedVoidIds: new Set<string>(),
  selectedSubAssemblyIds: new Set<string>(),
  selectedPanelIds: new Set<string>(),
  selectedAssemblyId: 'main',  // Default to main assembly selected
  // Hover state
  hoveredVoidId: null,
  hoveredPanelId: null,
  subdivisionPreview: null,
  hiddenVoidIds: new Set<string>(),
  isolatedVoidId: null,
  hiddenSubAssemblyIds: new Set<string>(),
  isolatedSubAssemblyId: null,
  hiddenFaceIds: new Set<string>(),
  panelCollection: null,
  panelsDirty: true,  // Start dirty so panels get generated on first use

  setConfig: (newConfig) =>
    set((state) => {
      const config = { ...state.config, ...newConfig };
      return {
        config,
        rootVoid: createRootVoidWithInsets(config.width, config.height, config.depth, config.assembly),
        selectedVoidIds: new Set<string>(),
        selectedSubAssemblyIds: new Set<string>(),
        selectedPanelIds: new Set<string>(),
        selectedAssemblyId: null,
        subdivisionPreview: null,
        hiddenVoidIds: new Set<string>(),
        isolatedVoidId: null,
        hiddenSubAssemblyIds: new Set<string>(),
        isolatedSubAssemblyId: null,
        hiddenFaceIds: new Set<string>(),
        panelsDirty: true,  // Mark panels as needing regeneration
      };
    }),

  toggleFace: (faceId) =>
    set((state) => ({
      faces: state.faces.map((face) =>
        face.id === faceId ? { ...face, solid: !face.solid } : face
      ),
      subdivisionPreview: null,  // Clear preview when faces change
      panelsDirty: true,  // Mark panels as needing regeneration
    })),

  setSelectionMode: (mode) =>
    set({
      selectionMode: mode,
      selectedVoidIds: new Set<string>(),
      selectedSubAssemblyIds: new Set<string>(),
      selectedPanelIds: new Set<string>(),
      selectedAssemblyId: null,
      subdivisionPreview: null,
    }),

  selectVoid: (voidId, additive = false) =>
    set((state) => {
      if (voidId === null) {
        return { selectedVoidIds: new Set<string>() };
      }
      const newSet = new Set(additive ? state.selectedVoidIds : []);
      if (newSet.has(voidId)) {
        newSet.delete(voidId);
      } else {
        newSet.add(voidId);
      }
      return {
        selectedVoidIds: newSet,
        // Clear other selection types if not additive
        ...(additive ? {} : {
          selectedSubAssemblyIds: new Set<string>(),
          selectedPanelIds: new Set<string>(),
          selectedAssemblyId: null,
        }),
      };
    }),

  selectPanel: (panelId, additive = false) =>
    set((state) => {
      if (panelId === null) {
        return { selectedPanelIds: new Set<string>() };
      }
      const newSet = new Set(additive ? state.selectedPanelIds : []);
      if (newSet.has(panelId)) {
        newSet.delete(panelId);
      } else {
        newSet.add(panelId);
      }
      return {
        selectedPanelIds: newSet,
        // Clear other selection types if not additive
        ...(additive ? {} : {
          selectedVoidIds: new Set<string>(),
          selectedSubAssemblyIds: new Set<string>(),
          selectedAssemblyId: null,
        }),
      };
    }),

  selectAssembly: (assemblyId) =>
    set({
      selectedAssemblyId: assemblyId,
      selectedVoidIds: new Set<string>(),
      selectedSubAssemblyIds: new Set<string>(),
      selectedPanelIds: new Set<string>(),
      // Keep subdivisionPreview - don't clear on selection change
    }),

  selectSubAssembly: (subAssemblyId, additive = false) =>
    set((state) => {
      if (subAssemblyId === null) {
        return { selectedSubAssemblyIds: new Set<string>() };
      }
      const newSet = new Set(additive ? state.selectedSubAssemblyIds : []);
      if (newSet.has(subAssemblyId)) {
        newSet.delete(subAssemblyId);
      } else {
        newSet.add(subAssemblyId);
      }
      return {
        selectedSubAssemblyIds: newSet,
        // Clear other selection types if not additive
        ...(additive ? {} : {
          selectedVoidIds: new Set<string>(),
          selectedPanelIds: new Set<string>(),
          selectedAssemblyId: null,
        }),
      };
    }),

  clearSelection: () =>
    set({
      selectedVoidIds: new Set<string>(),
      selectedSubAssemblyIds: new Set<string>(),
      selectedPanelIds: new Set<string>(),
      selectedAssemblyId: null,
    }),

  setHoveredVoid: (voidId) =>
    set({ hoveredVoidId: voidId }),

  setHoveredPanel: (panelId) =>
    set({ hoveredPanelId: panelId }),

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
        selectedVoidIds: new Set<string>(),
        selectedPanelIds: new Set<string>(),
        subdivisionPreview: null,
        panelsDirty: true,  // Mark panels as needing regeneration
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
        selectedVoidIds: new Set<string>(),
        selectedPanelIds: new Set<string>(),
        subdivisionPreview: null,
        panelsDirty: true,  // Mark panels as needing regeneration
      };
    }),

  resetVoids: () =>
    set((state) => ({
      rootVoid: createRootVoidWithInsets(state.config.width, state.config.height, state.config.depth, state.config.assembly),
      selectedVoidIds: new Set<string>(),
      selectedSubAssemblyIds: new Set<string>(),
      selectedPanelIds: new Set<string>(),
      selectedAssemblyId: null,
      subdivisionPreview: null,
      hiddenVoidIds: new Set<string>(),
      isolatedVoidId: null,
      hiddenSubAssemblyIds: new Set<string>(),
      isolatedSubAssemblyId: null,
      hiddenFaceIds: new Set<string>(),
      panelsDirty: true,  // Mark panels as needing regeneration
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
        selectedVoidIds: new Set<string>(),
        selectedSubAssemblyIds: new Set([subAssembly.id]),
        subdivisionPreview: null,
        panelsDirty: true,  // Mark panels as needing regeneration
      };
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
        panelsDirty: true,  // Mark panels as needing regeneration
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
        panelsDirty: true,  // Mark panels as needing regeneration
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
        selectedVoidIds: new Set<string>(),
        selectedSubAssemblyIds: new Set<string>(),
        subdivisionPreview: null,
        panelsDirty: true,  // Mark panels as needing regeneration
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
        selectedVoidIds: new Set<string>(),
        selectedPanelIds: new Set<string>(),
        panelsDirty: true,  // Mark panels as needing regeneration
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
        panelsDirty: true,  // Mark panels as needing regeneration
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
        selectedVoidIds: new Set<string>(),
        selectedPanelIds: new Set<string>(),
        panelsDirty: true,  // Mark panels as needing regeneration
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
        panelsDirty: true,  // Mark panels as needing regeneration
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
        panelsDirty: true,  // Mark panels as needing regeneration
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
        panelsDirty: true,  // Mark panels as needing regeneration
      };
    }),

  // Panel path actions
  generatePanels: () =>
    set((state) => {
      // Generate panel paths from current configuration
      // Pass existing panels to preserve edge extensions during regeneration
      const collection = generatePanelCollection(
        state.faces,
        state.rootVoid,
        state.config,
        1,  // Scale factor (1 = mm)
        state.panelCollection?.panels
      );

      return {
        panelCollection: collection,
        panelsDirty: false,
      };
    }),

  clearPanels: () =>
    set({
      panelCollection: null,
      panelsDirty: true,
    }),

  updatePanelPath: (panelId, updates) =>
    set((state) => {
      if (!state.panelCollection) return state;

      return {
        panelCollection: {
          ...state.panelCollection,
          panels: state.panelCollection.panels.map((panel) =>
            panel.id === panelId ? { ...panel, ...updates } : panel
          ),
        },
      };
    }),

  addPanelHole: (panelId, hole) =>
    set((state) => {
      if (!state.panelCollection) return state;

      return {
        panelCollection: {
          ...state.panelCollection,
          panels: state.panelCollection.panels.map((panel) =>
            panel.id === panelId
              ? { ...panel, holes: [...panel.holes, hole] }
              : panel
          ),
        },
      };
    }),

  removePanelHole: (panelId, holeId) =>
    set((state) => {
      if (!state.panelCollection) return state;

      return {
        panelCollection: {
          ...state.panelCollection,
          panels: state.panelCollection.panels.map((panel) =>
            panel.id === panelId
              ? { ...panel, holes: panel.holes.filter((h) => h.id !== holeId) }
              : panel
          ),
        },
      };
    }),

  addAugmentation: (augmentation) =>
    set((state) => {
      if (!state.panelCollection) return state;

      // Add augmentation to the collection
      const newAugmentations = [...state.panelCollection.augmentations, augmentation];

      // Also add the hole to the target panel
      const newPanels = state.panelCollection.panels.map((panel) =>
        panel.id === augmentation.panelId
          ? { ...panel, holes: [...panel.holes, augmentation.hole] }
          : panel
      );

      return {
        panelCollection: {
          ...state.panelCollection,
          panels: newPanels,
          augmentations: newAugmentations,
        },
      };
    }),

  removeAugmentation: (augmentationId) =>
    set((state) => {
      if (!state.panelCollection) return state;

      const augmentation = state.panelCollection.augmentations.find(
        (a) => a.id === augmentationId
      );
      if (!augmentation) return state;

      // Remove augmentation from the collection
      const newAugmentations = state.panelCollection.augmentations.filter(
        (a) => a.id !== augmentationId
      );

      // Also remove the hole from the target panel
      const newPanels = state.panelCollection.panels.map((panel) =>
        panel.id === augmentation.panelId
          ? { ...panel, holes: panel.holes.filter((h) => h.id !== augmentation.hole.id) }
          : panel
      );

      return {
        panelCollection: {
          ...state.panelCollection,
          panels: newPanels,
          augmentations: newAugmentations,
        },
      };
    }),

  togglePanelVisibility: (panelId) =>
    set((state) => {
      if (!state.panelCollection) return state;

      return {
        panelCollection: {
          ...state.panelCollection,
          panels: state.panelCollection.panels.map((panel) =>
            panel.id === panelId ? { ...panel, visible: !panel.visible } : panel
          ),
        },
      };
    }),

  setEdgeExtension: (panelId, edge, value) =>
    set((state) => {
      if (!state.panelCollection) return state;

      // First, update the extension value on the panel
      const updatedPanels = state.panelCollection.panels.map((panel) =>
        panel.id === panelId
          ? {
              ...panel,
              edgeExtensions: {
                ...(panel.edgeExtensions || defaultEdgeExtensions),
                [edge]: value,
              },
            }
          : panel
      );

      // Now regenerate panels with the updated extensions
      const collection = generatePanelCollection(
        state.faces,
        state.rootVoid,
        state.config,
        1,
        updatedPanels  // Pass updated panels to preserve new extensions
      );

      return {
        panelCollection: collection,
      };
    }),

  setDividerPosition: (subdivisionId, newPosition) =>
    set((state) => {
      const mt = state.config.materialThickness;

      // The subdivision ID is like "abc123-split", the void ID is "abc123"
      const voidId = subdivisionId.replace('-split', '');

      // Find the void that has this split position
      const targetVoid = findVoid(state.rootVoid, voidId);
      if (!targetVoid || !targetVoid.splitPosition || !targetVoid.splitAxis) {
        return state;
      }

      // Find the parent to get sibling voids
      const parent = findParent(state.rootVoid, voidId);
      if (!parent) return state;

      const axis = targetVoid.splitAxis;

      // Find the index of this void in the parent's children
      const voidIndex = parent.children.findIndex(c => c.id === voidId);
      if (voidIndex === -1) return state;

      // Calculate bounds constraints
      // Previous divider position (or parent start)
      const parentStart = axis === 'x' ? parent.bounds.x :
                          axis === 'y' ? parent.bounds.y : parent.bounds.z;
      const parentEnd = axis === 'x' ? parent.bounds.x + parent.bounds.w :
                        axis === 'y' ? parent.bounds.y + parent.bounds.h :
                        parent.bounds.z + parent.bounds.d;

      // Find min position (previous divider + material thickness, or parent start + min void size)
      const prevVoid = voidIndex > 0 ? parent.children[voidIndex - 1] : null;
      const minPos = prevVoid?.splitPosition
        ? prevVoid.splitPosition + mt + 1  // At least 1mm void space
        : parentStart + mt / 2 + 1;

      // Find max position (next divider - material thickness, or parent end - min void size)
      const nextVoid = voidIndex < parent.children.length - 1 ? parent.children[voidIndex + 1] : null;
      const maxPos = nextVoid?.splitPosition
        ? nextVoid.splitPosition - mt - 1
        : parentEnd - mt / 2 - 1;

      // Clamp new position to valid range
      const clampedPosition = Math.max(minPos, Math.min(maxPos, newPosition));

      // Update the void tree
      const updateVoidPosition = (node: Void): Void => {
        if (node.id === parent.id) {
          // This is the parent - update its children
          const newChildren = parent.children.map((child) => {
            if (child.id === voidId) {
              // Update this void's splitPosition
              return { ...child, splitPosition: clampedPosition };
            }
            return child;
          });

          // Recalculate bounds for all children
          const recalculatedChildren = newChildren.map((child, idx) => {
            // Calculate region start
            const regionStart = idx === 0
              ? parentStart
              : (newChildren[idx - 1].splitPosition ?? parentStart) + mt / 2;

            // Calculate region end
            const regionEnd = child.splitPosition
              ? child.splitPosition - mt / 2
              : parentEnd;

            const regionSize = regionEnd - regionStart;

            let newBounds: Bounds;
            switch (axis) {
              case 'x':
                newBounds = { ...child.bounds, x: regionStart, w: regionSize };
                break;
              case 'y':
                newBounds = { ...child.bounds, y: regionStart, h: regionSize };
                break;
              case 'z':
                newBounds = { ...child.bounds, z: regionStart, d: regionSize };
                break;
            }

            // Recursively update nested children's bounds if they exist
            let updatedChildren = child.children;
            if (child.children.length > 0) {
              // Recalculate nested children bounds based on the new parent bounds
              updatedChildren = recalculateNestedBounds(child.children, newBounds, child.splitAxis);
            }

            return { ...child, bounds: newBounds, children: updatedChildren };
          });

          return { ...node, children: recalculatedChildren };
        }

        return {
          ...node,
          children: node.children.map(updateVoidPosition),
        };
      };

      // Helper to recalculate nested void bounds when their parent's bounds change
      const recalculateNestedBounds = (children: Void[], parentBounds: Bounds, splitAxis?: 'x' | 'y' | 'z'): Void[] => {
        if (!splitAxis || children.length === 0) return children;

        const dimStart = splitAxis === 'x' ? parentBounds.x : splitAxis === 'y' ? parentBounds.y : parentBounds.z;
        const dimEnd = splitAxis === 'x' ? parentBounds.x + parentBounds.w :
                       splitAxis === 'y' ? parentBounds.y + parentBounds.h :
                       parentBounds.z + parentBounds.d;

        return children.map((child, idx) => {
          // Calculate region for this child
          const regionStart = idx === 0
            ? dimStart
            : (children[idx - 1].splitPosition ?? dimStart) + mt / 2;

          const regionEnd = child.splitPosition
            ? child.splitPosition - mt / 2
            : dimEnd;

          const regionSize = regionEnd - regionStart;

          let newBounds: Bounds;
          switch (splitAxis) {
            case 'x':
              newBounds = { ...parentBounds, x: regionStart, w: regionSize };
              break;
            case 'y':
              newBounds = { ...parentBounds, y: regionStart, h: regionSize };
              break;
            case 'z':
              newBounds = { ...parentBounds, z: regionStart, d: regionSize };
              break;
          }

          // Recursively update this child's children
          const updatedChildren = child.children.length > 0
            ? recalculateNestedBounds(child.children, newBounds, child.splitAxis)
            : child.children;

          return { ...child, bounds: newBounds, children: updatedChildren };
        });
      };

      const newRootVoid = updateVoidPosition(state.rootVoid);

      // Regenerate panels
      const collection = generatePanelCollection(
        state.faces,
        newRootVoid,
        state.config,
        1,
        state.panelCollection?.panels
      );

      return {
        rootVoid: newRootVoid,
        panelCollection: collection,
      };
    }),

  // URL state management
  loadFromUrl: () => {
    const loaded = loadFromUrl();
    if (!loaded) return false;

    // Apply loaded state
    const state = get();

    // Collect edge extensions from loaded data
    const edgeExtensionsMap = loaded.edgeExtensions;

    // Create panels with loaded extensions
    const panelsWithExtensions = state.panelCollection?.panels.map(panel => ({
      ...panel,
      edgeExtensions: edgeExtensionsMap[panel.id] ?? defaultEdgeExtensions,
    }));

    // Generate new panel collection with loaded config
    const collection = generatePanelCollection(
      loaded.faces,
      loaded.rootVoid,
      loaded.config,
      1,
      panelsWithExtensions
    );

    // Apply edge extensions to newly generated panels
    if (collection && Object.keys(edgeExtensionsMap).length > 0) {
      collection.panels = collection.panels.map(panel => ({
        ...panel,
        edgeExtensions: edgeExtensionsMap[panel.id] ?? panel.edgeExtensions,
      }));
    }

    set({
      config: loaded.config,
      faces: loaded.faces,
      rootVoid: loaded.rootVoid,
      panelCollection: collection,
      panelsDirty: false,
      selectedVoidIds: new Set<string>(),
      selectedPanelIds: new Set<string>(),
      selectedAssemblyId: null,
      selectedSubAssemblyIds: new Set<string>(),
    });

    return true;
  },

  saveToUrl: () => {
    const state = get();

    // Collect edge extensions from panels
    const edgeExtensions: Record<string, EdgeExtensions> = {};
    if (state.panelCollection) {
      for (const panel of state.panelCollection.panels) {
        if (panel.edgeExtensions &&
            (panel.edgeExtensions.top !== 0 ||
             panel.edgeExtensions.bottom !== 0 ||
             panel.edgeExtensions.left !== 0 ||
             panel.edgeExtensions.right !== 0)) {
          edgeExtensions[panel.id] = panel.edgeExtensions;
        }
      }
    }

    const projectState: ProjectState = {
      config: state.config,
      faces: state.faces,
      rootVoid: state.rootVoid,
      edgeExtensions,
    };

    saveStateToUrl(projectState);
  },

  getShareableUrl: () => {
    const state = get();

    // Collect edge extensions from panels
    const edgeExtensions: Record<string, EdgeExtensions> = {};
    if (state.panelCollection) {
      for (const panel of state.panelCollection.panels) {
        if (panel.edgeExtensions &&
            (panel.edgeExtensions.top !== 0 ||
             panel.edgeExtensions.bottom !== 0 ||
             panel.edgeExtensions.left !== 0 ||
             panel.edgeExtensions.right !== 0)) {
          edgeExtensions[panel.id] = panel.edgeExtensions;
        }
      }
    }

    const projectState: ProjectState = {
      config: state.config,
      faces: state.faces,
      rootVoid: state.rootVoid,
      edgeExtensions,
    };

    return getShareUrl(projectState);
  },
}));
