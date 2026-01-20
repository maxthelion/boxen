import { create } from 'zustand';
import { BoxState, BoxActions, FaceId, Void, Bounds, Subdivision, SubdivisionPreview, SelectionMode, SubAssemblyType, SubAssembly, Face } from '../types';

const generateId = () => Math.random().toString(36).substr(2, 9);

const createRootVoid = (width: number, height: number, depth: number): Void => ({
  id: 'root',
  bounds: { x: 0, y: 0, z: 0, w: width, h: height, d: depth },
  children: [],
});

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
  },
  faces: initialFaces(),
  rootVoid: createRootVoid(100, 100, 100),
  selectionMode: 'void' as SelectionMode,
  selectedVoidId: null,
  selectedSubAssemblyId: null,
  selectedPanelId: null,
  selectedAssemblyId: null,
  subdivisionPreview: null,

  setConfig: (newConfig) =>
    set((state) => {
      const config = { ...state.config, ...newConfig };
      return {
        config,
        rootVoid: createRootVoid(config.width, config.height, config.depth),
        selectedVoidId: null,
        selectedSubAssemblyId: null,
        selectedPanelId: null,
        selectedAssemblyId: null,
        subdivisionPreview: null,
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
      subdivisionPreview: null,  // Clear preview when selection changes
    }),

  selectPanel: (panelId) =>
    set({
      selectedPanelId: panelId,
      selectedVoidId: null,
      selectedSubAssemblyId: null,
      selectedAssemblyId: null,
      subdivisionPreview: null,
    }),

  selectAssembly: (assemblyId) =>
    set({
      selectedAssemblyId: assemblyId,
      selectedVoidId: null,
      selectedSubAssemblyId: null,
      selectedPanelId: null,
      subdivisionPreview: null,
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
      const { axis, count } = preview;

      // Create N+1 child voids for N divisions
      const children: Void[] = [];

      for (let i = 0; i <= count; i++) {
        const start = i / (count + 1);
        const end = (i + 1) / (count + 1);

        let childBounds: Bounds;
        let splitPos: number | undefined;
        let splitAxis: 'x' | 'y' | 'z' | undefined;

        switch (axis) {
          case 'x':
            childBounds = {
              ...bounds,
              x: bounds.x + start * bounds.w,
              w: (end - start) * bounds.w,
            };
            if (i > 0) {
              splitPos = bounds.x + start * bounds.w;
              splitAxis = axis;
            }
            break;
          case 'y':
            childBounds = {
              ...bounds,
              y: bounds.y + start * bounds.h,
              h: (end - start) * bounds.h,
            };
            if (i > 0) {
              splitPos = bounds.y + start * bounds.h;
              splitAxis = axis;
            }
            break;
          case 'z':
            childBounds = {
              ...bounds,
              z: bounds.z + start * bounds.d,
              d: (end - start) * bounds.d,
            };
            if (i > 0) {
              splitPos = bounds.z + start * bounds.d;
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
      rootVoid: createRootVoid(state.config.width, state.config.height, state.config.depth),
      selectedVoidId: null,
      selectedSubAssemblyId: null,
      selectedPanelId: null,
      selectedAssemblyId: null,
      subdivisionPreview: null,
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
      subdivisionPreview: null,
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
}));
