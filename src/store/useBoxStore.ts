import { create } from 'zustand';
import { BoxState, BoxActions, FaceId, Void, Bounds, Subdivision, SubdivisionPreview, SelectionMode, SubAssembly, Face, AssemblyAxis, LidTabDirection, defaultAssemblyConfig, AssemblyConfig, PanelCollection, PanelPath, PanelHole, PanelAugmentation, defaultEdgeExtensions, EdgeExtensions, CreateSubAssemblyOptions, FaceOffsets, defaultFaceOffsets, SplitPositionMode, ViewMode, EditorTool, PreviewState, BoxConfig, createAllSolidFaces, MAIN_FACE_PANEL_IDS } from '../types';
import { loadFromUrl, saveToUrl as saveStateToUrl, getShareableUrl as getShareUrl, ProjectState } from '../utils/urlState';
import { generatePanelCollection } from '../utils/panelGenerator';
import { syncStoreToEngine, getEngine, getEngineVoidTree, ensureEngineInitialized, getEngineFaces, dispatchToEngine } from '../engine';
import { logPushPull, startPushPullDebug } from '../utils/pushPullDebug';
import { startExtendModeDebug, finishExtendModeDebug } from '../utils/extendModeDebug';
import { appendDebug } from '../utils/debug';
import { BoundsOps, getBoundsStart, getBoundsSize, setBoundsRegion, calculateChildRegionBounds, calculatePreviewPositions, InsetRegions } from '../utils/bounds';
import { VoidTree } from '../utils/voidTree';

// Re-export bounds helpers for external use
export { getBoundsStart, getBoundsSize, setBoundsRegion, calculateChildRegionBounds, calculatePreviewPositions };

const generateId = () => Math.random().toString(36).substr(2, 9);

// =============================================================================

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

// =============================================================================
// Void Tree Functions - Re-exported from utils/voidTree.ts
// =============================================================================

// Re-export for external use
export const findVoid = VoidTree.find;

// Internal alias for convenience
const findParent = VoidTree.findParent;

// Recalculate void bounds when dimensions change
// For percentage-based subdivisions, recalculates splitPosition from splitPercentage
// For absolute subdivisions, clamps position to valid range
const recalculateVoidBounds = (
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

// Get all leaf voids (voids with no children - these are selectable)
export const getLeafVoids = (root: Void): Void[] => {
  const children = root.children || [];
  if (children.length === 0) {
    return [root];
  }
  return children.flatMap(getLeafVoids);
};

// Re-export from VoidTree for backwards compatibility
export const getVoidSubtreeIds = VoidTree.getSubtreeIds;
export const getVoidAncestorIds = VoidTree.getAncestorIds;

// Check if a void should be visible given the visibility settings
// Visibility is now managed by adding/removing from hiddenVoidIds during isolate
export const isVoidVisible = (
  voidId: string,
  _rootVoid: Void,
  hiddenVoidIds: Set<string>,
  _isolatedVoidId: string | null
): boolean => {
  return !hiddenVoidIds.has(voidId);
};

// Check if a sub-assembly should be visible given the visibility settings
// Visibility is now managed by adding/removing from hiddenSubAssemblyIds during isolate
export const isSubAssemblyVisible = (
  subAssemblyId: string,
  hiddenSubAssemblyIds: Set<string>,
  _isolatedSubAssemblyId: string | null
): boolean => {
  return !hiddenSubAssemblyIds.has(subAssemblyId);
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
        positionMode: node.splitPositionMode,
        percentage: node.splitPercentage,
      });
    }

    for (const child of (node.children || [])) {
      traverse(child, node.bounds);
    }
  };

  for (const child of (root.children || [])) {
    traverse(child, root.bounds);
  }

  return subdivisions;
};

// Internal aliases to VoidTree functions
const findSubAssembly = VoidTree.findSubAssembly;

// Re-export from VoidTree for backwards compatibility
export const getAllSubAssemblies = VoidTree.getAllSubAssemblies;

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
  faces: createAllSolidFaces(),
  rootVoid: createSimpleRootVoid(100, 100, 100),
  selectionMode: null as SelectionMode,
  selectedVoidIds: new Set<string>(),
  selectedSubAssemblyIds: new Set<string>(),
  selectedPanelIds: new Set<string>(),
  selectedAssemblyId: 'main',  // Default to main assembly selected
  // Hover state
  hoveredVoidId: null,
  hoveredPanelId: null,
  hoveredAssemblyId: null,
  subdivisionPreview: null,
  subAssemblyPreview: null,
  hiddenVoidIds: new Set<string>(),
  isolatedVoidId: null,
  isolateHiddenVoidIds: new Set<string>(),
  hiddenSubAssemblyIds: new Set<string>(),
  isolatedSubAssemblyId: null,
  isolateHiddenSubAssemblyIds: new Set<string>(),
  hiddenFaceIds: new Set<string>(),
  isolatedPanelId: null,
  isolateHiddenFaceIds: new Set<string>(),
  panelCollection: null,
  panelsDirty: true,  // Start dirty so panels get generated on first use
  showDebugAnchors: false,
  // 2D Sketch View state
  viewMode: '3d',
  sketchPanelId: null,
  // Tool state
  activeTool: 'select' as EditorTool,
  selectedCornerIds: new Set<string>(),
  // Preview state
  previewState: null,
  previewPanelCollection: null,

  setConfig: (newConfig) =>
    set((state) => {
      const config = { ...state.config, ...newConfig };
      const oldConfig = state.config;

      // Ensure engine is initialized before dispatching
      ensureEngineInitialized(state.config, state.faces, state.rootVoid);

      // Route changes through engine (engine is source of truth)
      const engine = getEngine();

      // Check if dimensions changed
      const dimensionsChanged =
        config.width !== oldConfig.width ||
        config.height !== oldConfig.height ||
        config.depth !== oldConfig.depth;

      // Check if material changed
      const materialChanged =
        config.materialThickness !== oldConfig.materialThickness ||
        config.fingerWidth !== oldConfig.fingerWidth ||
        config.fingerGap !== oldConfig.fingerGap;

      // Dispatch dimension changes to engine
      if (dimensionsChanged) {
        engine.dispatch({
          type: 'SET_DIMENSIONS',
          targetId: 'main-assembly',
          payload: { width: config.width, height: config.height, depth: config.depth },
        });
      }

      // Dispatch material changes to engine
      if (materialChanged) {
        engine.dispatch({
          type: 'SET_MATERIAL',
          targetId: 'main-assembly',
          payload: {
            thickness: config.materialThickness,
            fingerWidth: config.fingerWidth,
            fingerGap: config.fingerGap,
          },
        });
      }

      // Check if assembly structure changes (requires reset)
      const axisChanged = config.assembly.assemblyAxis !== oldConfig.assembly.assemblyAxis;
      const positiveLidChanged =
        config.assembly.lids.positive.inset !== oldConfig.assembly.lids.positive.inset ||
        config.assembly.lids.positive.tabDirection !== oldConfig.assembly.lids.positive.tabDirection;
      const negativeLidChanged =
        config.assembly.lids.negative.inset !== oldConfig.assembly.lids.negative.inset ||
        config.assembly.lids.negative.tabDirection !== oldConfig.assembly.lids.negative.tabDirection;

      const assemblyStructureChanged = axisChanged ||
        config.assembly.lids.positive.inset !== oldConfig.assembly.lids.positive.inset ||
        config.assembly.lids.negative.inset !== oldConfig.assembly.lids.negative.inset;

      // Dispatch assembly config changes to engine
      if (axisChanged) {
        engine.dispatch({
          type: 'SET_ASSEMBLY_AXIS',
          targetId: 'main-assembly',
          payload: { axis: config.assembly.assemblyAxis },
        });
      }
      if (positiveLidChanged) {
        engine.dispatch({
          type: 'SET_LID_CONFIG',
          targetId: 'main-assembly',
          payload: { side: 'positive', config: config.assembly.lids.positive },
        });
      }
      if (negativeLidChanged) {
        engine.dispatch({
          type: 'SET_LID_CONFIG',
          targetId: 'main-assembly',
          payload: { side: 'negative', config: config.assembly.lids.negative },
        });
      }

      // If assembly structure changes, reset everything
      if (assemblyStructureChanged) {
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
          isolateHiddenVoidIds: new Set<string>(),
          hiddenSubAssemblyIds: new Set<string>(),
          isolatedSubAssemblyId: null,
          isolateHiddenSubAssemblyIds: new Set<string>(),
          hiddenFaceIds: new Set<string>(),
          isolatedPanelId: null,
          isolateHiddenFaceIds: new Set<string>(),
          panelsDirty: true,
        };
      }

      // If dimensions changed, preserve subdivisions and recalculate bounds
      if (dimensionsChanged) {
        const newRootBounds: Bounds = { x: 0, y: 0, z: 0, w: config.width, h: config.height, d: config.depth };

        // Get the main interior void (where user subdivisions live)
        const mainInterior = getMainInteriorVoid(state.rootVoid);
        const hasInsets = mainInterior.id !== state.rootVoid.id;

        let newRootVoid: Void;

        if (hasInsets) {
          // Has lid insets - need to rebuild root structure with new dimensions
          // but preserve the children of the main interior void
          const positiveInset = config.assembly.lids.positive.inset;
          const negativeInset = config.assembly.lids.negative.inset;
          const axis = config.assembly.assemblyAxis;

          // Calculate new main interior bounds using BoundsOps helper
          const { main: mainBounds } = BoundsOps.calculateInsetRegions(
            newRootBounds, axis, positiveInset, negativeInset
          );

          // Recalculate the main interior's children
          const recalculatedMainInterior = recalculateVoidBounds(
            { ...mainInterior, bounds: mainBounds },
            mainBounds,
            config.materialThickness
          );

          // Rebuild the root with lid caps and recalculated main interior
          newRootVoid = createRootVoidWithInsets(
            config.width, config.height, config.depth, config.assembly
          );
          // Replace the main interior's children with the recalculated ones
          const newMainInterior = newRootVoid.children.find(c => c.isMainInterior);
          if (newMainInterior) {
            newMainInterior.children = recalculatedMainInterior.children;
          }
        } else {
          // No lid insets - recalculate directly from root
          newRootVoid = recalculateVoidBounds(
            { ...state.rootVoid, bounds: newRootBounds },
            newRootBounds,
            config.materialThickness
          );
        }

        return {
          config,
          rootVoid: newRootVoid,
          subdivisionPreview: null,
          panelsDirty: true,
        };
      }

      // Only non-structural config changes (materialThickness, fingerWidth, etc.)
      return {
        config,
        panelsDirty: true,
      };
    }),

  toggleFace: (faceId) =>
    set((state) => {
      // Ensure engine is initialized before dispatching
      ensureEngineInitialized(state.config, state.faces, state.rootVoid);

      // Dispatch to engine and get updated state
      const result = dispatchToEngine({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId },
      });

      if (!result.success || !result.snapshot) {
        // Fallback to local update if dispatch failed
        return {
          faces: state.faces.map((face) =>
            face.id === faceId ? { ...face, solid: !face.solid } : face
          ),
          subdivisionPreview: null,
          previewState: null,
          previewPanelCollection: null,
          panelsDirty: true,
        };
      }

      return {
        faces: result.snapshot.faces,
        subdivisionPreview: null,
        previewState: null,
        previewPanelCollection: null,
        panelsDirty: true,
      };
    }),

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
        return {
          selectedVoidIds: new Set<string>(),
          selectedSubAssemblyIds: new Set<string>(),
          selectedPanelIds: new Set<string>(),
          selectedAssemblyId: null,
        };
      }
      const newSet = new Set(additive ? state.selectedVoidIds : []);
      if (newSet.has(voidId)) {
        newSet.delete(voidId);
      } else {
        newSet.add(voidId);
      }
      // When selecting a void (not additive), clear all other selection types
      if (additive) {
        return { selectedVoidIds: newSet };
      }
      return {
        selectedVoidIds: newSet,
        selectedSubAssemblyIds: new Set<string>(),
        selectedPanelIds: new Set<string>(),
        selectedAssemblyId: null,
      };
    }),

  selectPanel: (panelId, additive = false) =>
    set((state) => {
      if (panelId === null) {
        return {
          selectedPanelIds: new Set<string>(),
          selectedVoidIds: new Set<string>(),
          selectedSubAssemblyIds: new Set<string>(),
          selectedAssemblyId: null,
        };
      }
      const newSet = new Set(additive ? state.selectedPanelIds : []);
      if (newSet.has(panelId)) {
        newSet.delete(panelId);
      } else {
        newSet.add(panelId);
      }
      // When selecting a panel (not additive), clear all other selection types
      if (additive) {
        return { selectedPanelIds: newSet };
      }
      return {
        selectedPanelIds: newSet,
        selectedVoidIds: new Set<string>(),
        selectedSubAssemblyIds: new Set<string>(),
        selectedAssemblyId: null,
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
        return {
          selectedSubAssemblyIds: new Set<string>(),
          selectedVoidIds: new Set<string>(),
          selectedPanelIds: new Set<string>(),
          selectedAssemblyId: null,
        };
      }
      const newSet = new Set(additive ? state.selectedSubAssemblyIds : []);
      if (newSet.has(subAssemblyId)) {
        newSet.delete(subAssemblyId);
      } else {
        newSet.add(subAssemblyId);
      }
      // When selecting a sub-assembly (not additive), clear all other selection types
      if (additive) {
        return { selectedSubAssemblyIds: newSet };
      }
      return {
        selectedSubAssemblyIds: newSet,
        selectedVoidIds: new Set<string>(),
        selectedPanelIds: new Set<string>(),
        selectedAssemblyId: null,
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

  setHoveredAssembly: (assemblyId) =>
    set({ hoveredAssemblyId: assemblyId }),

  setSubdivisionPreview: (preview) =>
    set({ subdivisionPreview: preview }),

  setSubAssemblyPreview: (preview) =>
    set({ subAssemblyPreview: preview }),

  applySubdivision: () =>
    set((state) => {
      const preview = state.subdivisionPreview;
      if (!preview) return state;

      const targetVoid = findVoid(state.rootVoid, preview.voidId);
      if (!targetVoid || targetVoid.children.length > 0) return state;

      const { axis, positions } = preview;

      // Sync current state to engine
      syncStoreToEngine(state.config, state.faces, state.rootVoid);

      // Get assembly ID from engine
      const engine = getEngine();
      const assembly = engine.assembly;
      if (!assembly) return state;

      // Dispatch and get updated state
      const result = dispatchToEngine({
        type: 'ADD_SUBDIVISIONS',
        targetId: assembly.id,
        payload: {
          voidId: preview.voidId,
          axis,
          positions,
        },
      });

      if (!result.success || !result.snapshot) return state;

      return {
        rootVoid: result.snapshot.rootVoid,
        selectedVoidIds: new Set<string>(),
        selectedPanelIds: new Set<string>(),
        subdivisionPreview: null,
        panelsDirty: true,
      };
    }),

  removeVoid: (voidId) =>
    set((state) => {
      const parent = findParent(state.rootVoid, voidId);
      if (!parent) return state;

      // Sync current state to engine
      syncStoreToEngine(state.config, state.faces, state.rootVoid);

      // Get assembly ID from engine
      const engine = getEngine();
      const assembly = engine.assembly;
      if (!assembly) return state;

      // Dispatch and get updated state
      const result = dispatchToEngine({
        type: 'REMOVE_SUBDIVISION',
        targetId: assembly.id,
        payload: {
          voidId: parent.id,
        },
      });

      if (!result.success || !result.snapshot) return state;

      return {
        rootVoid: result.snapshot.rootVoid,
        selectedVoidIds: new Set<string>(),
        selectedPanelIds: new Set<string>(),
        subdivisionPreview: null,
        panelsDirty: true,
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
      isolateHiddenVoidIds: new Set<string>(),
      hiddenSubAssemblyIds: new Set<string>(),
      isolatedSubAssemblyId: null,
      isolateHiddenSubAssemblyIds: new Set<string>(),
      hiddenFaceIds: new Set<string>(),
      isolatedPanelId: null,
      isolateHiddenFaceIds: new Set<string>(),
      panelsDirty: true,  // Mark panels as needing regeneration
    })),

  // Sub-assembly actions
  createSubAssembly: (voidId, options) =>
    set((state) => {
      const targetVoid = findVoid(state.rootVoid, voidId);
      if (!targetVoid || targetVoid.children.length > 0 || targetVoid.subAssembly) {
        return state; // Can't create sub-assembly in non-leaf void or if one already exists
      }

      const clearance = options?.clearance ?? 2; // Default 2mm clearance
      const assemblyAxis = options?.assemblyAxis ?? 'y'; // Default Y axis
      const faceOffsets = options?.faceOffsets ?? { front: 0, back: 0, left: 0, right: 0, top: 0, bottom: 0 };
      const { bounds } = targetVoid;
      const mt = state.config.materialThickness;

      // Calculate outer dimensions (space available after clearance + face offsets)
      // Face offsets adjust individual sides: positive = outset, negative = inset
      const outerWidth = bounds.w - (clearance * 2) + faceOffsets.left + faceOffsets.right;
      const outerHeight = bounds.h - (clearance * 2) + faceOffsets.top + faceOffsets.bottom;
      const outerDepth = bounds.d - (clearance * 2) + faceOffsets.front + faceOffsets.back;

      // Calculate interior dimensions (outer minus walls on each side)
      const interiorWidth = outerWidth - (2 * mt);
      const interiorHeight = outerHeight - (2 * mt);
      const interiorDepth = outerDepth - (2 * mt);

      if (interiorWidth <= 0 || interiorHeight <= 0 || interiorDepth <= 0) {
        return state; // Void too small for sub-assembly
      }

      // Create sub-assembly with all faces solid by default (like main box)
      const subAssembly: SubAssembly = {
        id: generateId(),
        clearance,
        faceOffsets,
        faces: createAllSolidFaces(),
        materialThickness: mt,
        rootVoid: {
          id: 'sub-root-' + generateId(),
          // rootVoid stores INTERIOR dimensions (outer - 2*materialThickness)
          bounds: { x: 0, y: 0, z: 0, w: interiorWidth, h: interiorHeight, d: interiorDepth },
          children: [],
        },
        // Assembly config with provided axis
        assembly: {
          assemblyAxis,
          lids: {
            positive: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
            negative: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
          },
        },
      };

      const newRootVoid = VoidTree.update(state.rootVoid, voidId, (v) => ({
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

  purgeVoid: (voidId) =>
    set((state) => {
      const newRootVoid = VoidTree.update(state.rootVoid, voidId, (v) => ({
        ...v,
        children: [],
        subAssembly: undefined,
      }));

      return {
        rootVoid: newRootVoid,
        selectedVoidIds: new Set<string>(),
        selectedSubAssemblyIds: new Set<string>(),
        subdivisionPreview: null,
        panelsDirty: true,
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
          const mt = v.subAssembly.materialThickness;
          const faceOffsets = v.subAssembly.faceOffsets || { left: 0, right: 0, top: 0, bottom: 0, front: 0, back: 0 };

          // Calculate outer dimensions (space available after clearance + face offsets)
          const outerWidth = v.bounds.w - (newClearance * 2) + faceOffsets.left + faceOffsets.right;
          const outerHeight = v.bounds.h - (newClearance * 2) + faceOffsets.top + faceOffsets.bottom;
          const outerDepth = v.bounds.d - (newClearance * 2) + faceOffsets.front + faceOffsets.back;

          // Calculate interior dimensions (outer minus walls on each side)
          const interiorWidth = outerWidth - (2 * mt);
          const interiorHeight = outerHeight - (2 * mt);
          const interiorDepth = outerDepth - (2 * mt);

          if (interiorWidth <= 0 || interiorHeight <= 0 || interiorDepth <= 0) {
            return v; // Invalid clearance
          }

          return {
            ...v,
            subAssembly: {
              ...v.subAssembly,
              clearance: newClearance,
              rootVoid: {
                ...v.subAssembly.rootVoid,
                bounds: { x: 0, y: 0, z: 0, w: interiorWidth, h: interiorHeight, d: interiorDepth },
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
      const newRootVoid = VoidTree.update(state.rootVoid, voidId, (v) => ({
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
    set((state) => {
      // Un-isolating: restore visibility of elements hidden by isolate
      if (voidId === null) {
        const newHiddenVoidIds = new Set(state.hiddenVoidIds);
        const newHiddenFaceIds = new Set(state.hiddenFaceIds);
        const newHiddenSubAssemblyIds = new Set(state.hiddenSubAssemblyIds);

        // Remove only the IDs that were hidden by the isolate action
        for (const id of state.isolateHiddenVoidIds) {
          newHiddenVoidIds.delete(id);
        }
        for (const id of state.isolateHiddenFaceIds) {
          newHiddenFaceIds.delete(id);
        }
        for (const id of state.isolateHiddenSubAssemblyIds) {
          newHiddenSubAssemblyIds.delete(id);
        }

        return {
          isolatedVoidId: null,
          hiddenVoidIds: newHiddenVoidIds,
          isolateHiddenVoidIds: new Set<string>(),
          hiddenFaceIds: newHiddenFaceIds,
          isolateHiddenFaceIds: new Set<string>(),
          hiddenSubAssemblyIds: newHiddenSubAssemblyIds,
          isolateHiddenSubAssemblyIds: new Set<string>(),
        };
      }

      // Isolating: hide everything except the isolated void and its descendants
      const isolatedVoid = findVoid(state.rootVoid, voidId);
      if (!isolatedVoid) return state;

      // Get all void IDs that should remain visible (isolated + descendants)
      const visibleVoidIds = new Set(getVoidSubtreeIds(isolatedVoid));

      // Get all void IDs in the tree
      const allVoidIds = getVoidSubtreeIds(state.rootVoid);

      // Build new hidden sets
      const newHiddenVoidIds = new Set(state.hiddenVoidIds);
      const newIsolateHiddenVoidIds = new Set<string>();
      const newHiddenFaceIds = new Set(state.hiddenFaceIds);
      const newIsolateHiddenFaceIds = new Set<string>();
      const newHiddenSubAssemblyIds = new Set(state.hiddenSubAssemblyIds);
      const newIsolateHiddenSubAssemblyIds = new Set<string>();

      // Hide voids that should not be visible, and their divider panels
      for (const id of allVoidIds) {
        if (!visibleVoidIds.has(id) && !state.hiddenVoidIds.has(id)) {
          newHiddenVoidIds.add(id);
          newIsolateHiddenVoidIds.add(id);
          // Also hide the divider panel for this void (if it has one)
          const dividerId = `divider-${id}-split`;
          if (!state.hiddenFaceIds.has(dividerId)) {
            newHiddenFaceIds.add(dividerId);
            newIsolateHiddenFaceIds.add(dividerId);
          }
        }
      }

      // Hide face panels for main box (since we're isolating a void, not main box)
      for (const faceId of MAIN_FACE_PANEL_IDS) {
        if (!state.hiddenFaceIds.has(faceId)) {
          newHiddenFaceIds.add(faceId);
          newIsolateHiddenFaceIds.add(faceId);
        }
      }

      // Hide sub-assemblies that are not in the isolated subtree
      const allSubAssemblies = getAllSubAssemblies(state.rootVoid);
      for (const { subAssembly, voidId: parentVoidId } of allSubAssemblies) {
        // Sub-assembly is visible only if its parent void is in the visible subtree
        if (!visibleVoidIds.has(parentVoidId) && !state.hiddenSubAssemblyIds.has(subAssembly.id)) {
          newHiddenSubAssemblyIds.add(subAssembly.id);
          newIsolateHiddenSubAssemblyIds.add(subAssembly.id);
        }
      }

      return {
        isolatedVoidId: voidId,
        hiddenVoidIds: newHiddenVoidIds,
        isolateHiddenVoidIds: newIsolateHiddenVoidIds,
        hiddenFaceIds: newHiddenFaceIds,
        isolateHiddenFaceIds: newIsolateHiddenFaceIds,
        hiddenSubAssemblyIds: newHiddenSubAssemblyIds,
        isolateHiddenSubAssemblyIds: newIsolateHiddenSubAssemblyIds,
      };
    }),

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
    set((state) => {
      // Un-isolating: restore visibility of elements hidden by isolate
      if (subAssemblyId === null) {
        const newHiddenVoidIds = new Set(state.hiddenVoidIds);
        const newHiddenFaceIds = new Set(state.hiddenFaceIds);
        const newHiddenSubAssemblyIds = new Set(state.hiddenSubAssemblyIds);

        // Remove only the IDs that were hidden by the isolate action
        for (const id of state.isolateHiddenVoidIds) {
          newHiddenVoidIds.delete(id);
        }
        for (const id of state.isolateHiddenFaceIds) {
          newHiddenFaceIds.delete(id);
        }
        for (const id of state.isolateHiddenSubAssemblyIds) {
          newHiddenSubAssemblyIds.delete(id);
        }

        return {
          isolatedSubAssemblyId: null,
          hiddenVoidIds: newHiddenVoidIds,
          isolateHiddenVoidIds: new Set<string>(),
          hiddenFaceIds: newHiddenFaceIds,
          isolateHiddenFaceIds: new Set<string>(),
          hiddenSubAssemblyIds: newHiddenSubAssemblyIds,
          isolateHiddenSubAssemblyIds: new Set<string>(),
        };
      }

      // Isolating: hide everything except the isolated sub-assembly
      const newHiddenVoidIds = new Set(state.hiddenVoidIds);
      const newIsolateHiddenVoidIds = new Set<string>();
      const newHiddenFaceIds = new Set(state.hiddenFaceIds);
      const newIsolateHiddenFaceIds = new Set<string>();
      const newHiddenSubAssemblyIds = new Set(state.hiddenSubAssemblyIds);
      const newIsolateHiddenSubAssemblyIds = new Set<string>();

      // Hide all voids and their divider panels
      const allVoidIds = getVoidSubtreeIds(state.rootVoid);
      for (const id of allVoidIds) {
        if (!state.hiddenVoidIds.has(id)) {
          newHiddenVoidIds.add(id);
          newIsolateHiddenVoidIds.add(id);
          // Also hide the divider panel for this void (if it has one)
          const dividerId = `divider-${id}-split`;
          if (!state.hiddenFaceIds.has(dividerId)) {
            newHiddenFaceIds.add(dividerId);
            newIsolateHiddenFaceIds.add(dividerId);
          }
        }
      }

      // Hide all main box face panels
      for (const faceId of MAIN_FACE_PANEL_IDS) {
        if (!state.hiddenFaceIds.has(faceId)) {
          newHiddenFaceIds.add(faceId);
          newIsolateHiddenFaceIds.add(faceId);
        }
      }

      // Hide all other sub-assemblies
      const allSubAssemblies = getAllSubAssemblies(state.rootVoid);
      for (const { subAssembly } of allSubAssemblies) {
        if (subAssembly.id !== subAssemblyId && !state.hiddenSubAssemblyIds.has(subAssembly.id)) {
          newHiddenSubAssemblyIds.add(subAssembly.id);
          newIsolateHiddenSubAssemblyIds.add(subAssembly.id);
        }
      }

      return {
        isolatedSubAssemblyId: subAssemblyId,
        hiddenVoidIds: newHiddenVoidIds,
        isolateHiddenVoidIds: newIsolateHiddenVoidIds,
        hiddenFaceIds: newHiddenFaceIds,
        isolateHiddenFaceIds: newIsolateHiddenFaceIds,
        hiddenSubAssemblyIds: newHiddenSubAssemblyIds,
        isolateHiddenSubAssemblyIds: newIsolateHiddenSubAssemblyIds,
      };
    }),

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

  setIsolatedPanel: (panelId) =>
    set((state) => {
      // Un-isolating: restore visibility of elements hidden by isolate
      if (panelId === null) {
        const newHiddenVoidIds = new Set(state.hiddenVoidIds);
        const newHiddenFaceIds = new Set(state.hiddenFaceIds);
        const newHiddenSubAssemblyIds = new Set(state.hiddenSubAssemblyIds);

        // Remove only the IDs that were hidden by the isolate action
        for (const id of state.isolateHiddenVoidIds) {
          newHiddenVoidIds.delete(id);
        }
        for (const id of state.isolateHiddenFaceIds) {
          newHiddenFaceIds.delete(id);
        }
        for (const id of state.isolateHiddenSubAssemblyIds) {
          newHiddenSubAssemblyIds.delete(id);
        }

        return {
          isolatedPanelId: null,
          hiddenVoidIds: newHiddenVoidIds,
          isolateHiddenVoidIds: new Set<string>(),
          hiddenFaceIds: newHiddenFaceIds,
          isolateHiddenFaceIds: new Set<string>(),
          hiddenSubAssemblyIds: newHiddenSubAssemblyIds,
          isolateHiddenSubAssemblyIds: new Set<string>(),
        };
      }

      // Isolating: hide everything except the isolated panel
      const newHiddenVoidIds = new Set(state.hiddenVoidIds);
      const newIsolateHiddenVoidIds = new Set<string>();
      const newHiddenFaceIds = new Set(state.hiddenFaceIds);
      const newIsolateHiddenFaceIds = new Set<string>();
      const newHiddenSubAssemblyIds = new Set(state.hiddenSubAssemblyIds);
      const newIsolateHiddenSubAssemblyIds = new Set<string>();

      // Hide all voids
      const allVoidIds = getVoidSubtreeIds(state.rootVoid);
      for (const id of allVoidIds) {
        if (!state.hiddenVoidIds.has(id)) {
          newHiddenVoidIds.add(id);
          newIsolateHiddenVoidIds.add(id);
        }
      }

      // Hide all face panels except the isolated one
      for (const faceId of MAIN_FACE_PANEL_IDS) {
        if (faceId !== panelId && !state.hiddenFaceIds.has(faceId)) {
          newHiddenFaceIds.add(faceId);
          newIsolateHiddenFaceIds.add(faceId);
        }
      }

      // Hide all divider panels except the isolated one
      const getAllDividerIds = (node: Void): string[] => {
        const ids: string[] = [];
        for (const child of (node.children || [])) {
          if (child.splitAxis) {
            ids.push(`divider-${child.id}-split`);
          }
          ids.push(...getAllDividerIds(child));
        }
        return ids;
      };
      const allDividerIds = getAllDividerIds(state.rootVoid);
      for (const dividerId of allDividerIds) {
        if (dividerId !== panelId && !state.hiddenFaceIds.has(dividerId)) {
          newHiddenFaceIds.add(dividerId);
          newIsolateHiddenFaceIds.add(dividerId);
        }
      }

      // Hide all sub-assemblies and their panels
      const allSubAssemblies = getAllSubAssemblies(state.rootVoid);
      for (const { subAssembly } of allSubAssemblies) {
        if (!state.hiddenSubAssemblyIds.has(subAssembly.id)) {
          newHiddenSubAssemblyIds.add(subAssembly.id);
          newIsolateHiddenSubAssemblyIds.add(subAssembly.id);
        }
        // Also hide sub-assembly face panels
        for (const face of subAssembly.faces) {
          const subFaceId = `subasm-${subAssembly.id}-face-${face.id}`;
          if (subFaceId !== panelId && !state.hiddenFaceIds.has(subFaceId)) {
            newHiddenFaceIds.add(subFaceId);
            newIsolateHiddenFaceIds.add(subFaceId);
          }
        }
      }

      return {
        isolatedPanelId: panelId,
        hiddenVoidIds: newHiddenVoidIds,
        isolateHiddenVoidIds: newIsolateHiddenVoidIds,
        hiddenFaceIds: newHiddenFaceIds,
        isolateHiddenFaceIds: newIsolateHiddenFaceIds,
        hiddenSubAssemblyIds: newHiddenSubAssemblyIds,
        isolateHiddenSubAssemblyIds: newIsolateHiddenSubAssemblyIds,
      };
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

  setFeetConfig: (feetConfig) =>
    set((state) => ({
      config: {
        ...state.config,
        assembly: {
          ...state.config.assembly,
          feet: feetConfig,
        },
      },
      panelsDirty: true,
    })),

  setFaceOffset: (faceId, offset, mode) =>
    set((state) => {
      // Both modes resize the bounding box, but differ in how children are handled
      let newWidth = state.config.width;
      let newHeight = state.config.height;
      let newDepth = state.config.depth;

      // Calculate new dimensions
      switch (faceId) {
        case 'front':
        case 'back':
          newDepth = Math.max(state.config.materialThickness * 3, state.config.depth + offset);
          break;
        case 'left':
        case 'right':
          newWidth = Math.max(state.config.materialThickness * 3, state.config.width + offset);
          break;
        case 'top':
        case 'bottom':
          newHeight = Math.max(state.config.materialThickness * 3, state.config.height + offset);
          break;
      }

      const newConfig = {
        ...state.config,
        width: newWidth,
        height: newHeight,
        depth: newDepth,
      };

      // Calculate new root bounds
      const newRootBounds: Bounds = { x: 0, y: 0, z: 0, w: newWidth, h: newHeight, d: newDepth };

      if (mode === 'scale') {
        // Scale mode: Scale all children proportionally
        const scaleX = newWidth / state.config.width;
        const scaleY = newHeight / state.config.height;
        const scaleZ = newDepth / state.config.depth;

        const scaleVoidBounds = (v: Void): Void => {
          const scaledBounds: Bounds = {
            x: v.bounds.x * scaleX,
            y: v.bounds.y * scaleY,
            z: v.bounds.z * scaleZ,
            w: v.bounds.w * scaleX,
            h: v.bounds.h * scaleY,
            d: v.bounds.d * scaleZ,
          };

          return {
            ...v,
            bounds: scaledBounds,
            // Scale splitPosition if it exists
            splitPosition: v.splitPosition !== undefined
              ? v.splitPosition * (v.splitAxis === 'x' ? scaleX : v.splitAxis === 'y' ? scaleY : scaleZ)
              : undefined,
            children: (v.children || []).map(scaleVoidBounds),
          };
        };

        const newRootVoid = {
          ...scaleVoidBounds(state.rootVoid),
          bounds: newRootBounds,
        };

        return {
          config: newConfig,
          rootVoid: newRootVoid,
          panelsDirty: true,
        };
      } else {
        // Extend mode: Keep center in place, only the void abutting the face grows
        // Children stay at their absolute positions, but we need to expand the
        // adjacent void to fill the new space

        const deltaW = newWidth - state.config.width;
        const deltaH = newHeight - state.config.height;
        const deltaD = newDepth - state.config.depth;

        // Helper to adjust void bounds based on which face moved
        // Also adjusts splitPosition when voids shift (so divider panels move with their voids)
        const adjustVoidBounds = (v: Void): Void => {
          const newBounds = { ...v.bounds };
          let newSplitPosition = v.splitPosition;

          // For extend mode, we extend in the direction of the face
          // The face that moved outward increases the dimension on that side
          switch (faceId) {
            case 'right':
              // Right face moved: voids at the right edge grow
              if (v.bounds.x + v.bounds.w >= state.config.width - 0.1) {
                newBounds.w += deltaW;
              }
              break;
            case 'left':
              // Left face moved: voids at the left edge grow, others shift
              if (v.bounds.x <= 0.1) {
                newBounds.w += deltaW;
              } else {
                newBounds.x += deltaW;
                // Also shift splitPosition if this void has an X-axis split
                if (v.splitAxis === 'x' && newSplitPosition !== undefined) {
                  newSplitPosition += deltaW;
                }
              }
              break;
            case 'top':
              // Top face moved: voids at the top edge grow
              if (v.bounds.y + v.bounds.h >= state.config.height - 0.1) {
                newBounds.h += deltaH;
              }
              break;
            case 'bottom':
              // Bottom face moved: voids at the bottom edge grow, others shift
              if (v.bounds.y <= 0.1) {
                newBounds.h += deltaH;
              } else {
                newBounds.y += deltaH;
                // Also shift splitPosition if this void has a Y-axis split
                if (v.splitAxis === 'y' && newSplitPosition !== undefined) {
                  newSplitPosition += deltaH;
                }
              }
              break;
            case 'front':
              // Front face moved: voids at the front edge grow
              if (v.bounds.z + v.bounds.d >= state.config.depth - 0.1) {
                newBounds.d += deltaD;
              }
              break;
            case 'back':
              // Back face moved: voids at the back edge grow, others shift
              if (v.bounds.z <= 0.1) {
                newBounds.d += deltaD;
              } else {
                newBounds.z += deltaD;
                // Also shift splitPosition if this void has a Z-axis split
                if (v.splitAxis === 'z' && newSplitPosition !== undefined) {
                  newSplitPosition += deltaD;
                }
              }
              break;
          }

          return {
            ...v,
            bounds: newBounds,
            splitPosition: newSplitPosition,
            children: v.children.map(adjustVoidBounds),
          };
        };

        const newRootVoid = {
          ...adjustVoidBounds(state.rootVoid),
          bounds: newRootBounds,
        };

        return {
          config: newConfig,
          rootVoid: newRootVoid,
          panelsDirty: true,
        };
      }
    }),

  insetFace: (faceId, insetAmount) =>
    set((state) => {
      // Make the outer face open and create a divider at the inset position
      // This creates a new subdivision at the inset depth

      // First, toggle the face to open
      const newFaces = state.faces.map(f =>
        f.id === faceId ? { ...f, solid: false } : f
      );

      // Determine the axis and position for the new divider
      let axis: 'x' | 'y' | 'z';
      let position: number;

      switch (faceId) {
        case 'front':
          axis = 'z';
          position = state.config.depth - insetAmount;
          break;
        case 'back':
          axis = 'z';
          position = insetAmount;
          break;
        case 'left':
          axis = 'x';
          position = insetAmount;
          break;
        case 'right':
          axis = 'x';
          position = state.config.width - insetAmount;
          break;
        case 'top':
          axis = 'y';
          position = state.config.height - insetAmount;
          break;
        case 'bottom':
          axis = 'y';
          position = insetAmount;
          break;
      }

      // Create the subdivision in the root void
      const mt = state.config.materialThickness;
      const halfMt = mt / 2;
      const { width, height, depth } = state.config;

      let child1Bounds: Bounds;
      let child2Bounds: Bounds;

      switch (axis) {
        case 'x':
          child1Bounds = { x: 0, y: 0, z: 0, w: position - halfMt, h: height, d: depth };
          child2Bounds = { x: position + halfMt, y: 0, z: 0, w: width - position - halfMt, h: height, d: depth };
          break;
        case 'y':
          child1Bounds = { x: 0, y: 0, z: 0, w: width, h: position - halfMt, d: depth };
          child2Bounds = { x: 0, y: position + halfMt, z: 0, w: width, h: height - position - halfMt, d: depth };
          break;
        case 'z':
        default:
          child1Bounds = { x: 0, y: 0, z: 0, w: width, h: height, d: position - halfMt };
          child2Bounds = { x: 0, y: 0, z: position + halfMt, w: width, h: height, d: depth - position - halfMt };
          break;
      }

      const newRootVoid: Void = {
        ...state.rootVoid,
        children: [
          {
            id: `void-${Date.now()}-1`,
            bounds: child1Bounds,
            children: [],
            splitAxis: axis,
            splitPosition: position,
          },
          {
            id: `void-${Date.now()}-2`,
            bounds: child2Bounds,
            children: [],
          },
        ],
      };

      return {
        faces: newFaces,
        rootVoid: newRootVoid,
        panelsDirty: true,
        previewState: null,  // Clear preview state when faces change
        previewPanelCollection: null,
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
      // Sync config and faces to engine
      syncStoreToEngine(state.config, state.faces);

      // Generate panels via engine (uses engine's config/faces + store's rootVoid)
      // The engine is now the source of truth for config and faces,
      // while the store remains the source of truth for void tree structure.
      const engine = getEngine();
      const collection = engine.generatePanels(
        state.rootVoid,
        state.panelCollection?.panels
      );

      // Generate panels for all sub-assemblies
      const subAssemblies = getAllSubAssemblies(state.rootVoid);
      for (const { subAssembly, bounds: parentBounds } of subAssemblies) {
        // Create a BoxConfig for the sub-assembly
        // Note: width/height/depth must be INTERIOR dimensions (like main box config)
        // The panel generator positions faces based on interior dimensions
        const subConfig = {
          width: subAssembly.rootVoid.bounds.w,
          height: subAssembly.rootVoid.bounds.h,
          depth: subAssembly.rootVoid.bounds.d,
          materialThickness: subAssembly.materialThickness,
          fingerWidth: state.config.fingerWidth,
          fingerGap: state.config.fingerGap,
          assembly: subAssembly.assembly,
        };

        // Generate panels for this sub-assembly
        const subCollection = generatePanelCollection(
          subAssembly.faces,
          subAssembly.rootVoid,
          subConfig,
          1
        );

        // Calculate sub-assembly center position relative to main box center
        const mainCenterX = state.config.width / 2;
        const mainCenterY = state.config.height / 2;
        const mainCenterZ = state.config.depth / 2;

        // Outer dimensions = interior + 2*materialThickness
        const subOuterW = subConfig.width + 2 * subAssembly.materialThickness;
        const subOuterH = subConfig.height + 2 * subAssembly.materialThickness;
        const subOuterD = subConfig.depth + 2 * subAssembly.materialThickness;

        // Get face offsets (default to 0 if not set)
        const offsets = subAssembly.faceOffsets || { left: 0, right: 0, top: 0, bottom: 0, front: 0, back: 0 };

        // Sub-assembly is positioned inside the parent void with clearance
        // Face offsets shift the base position: positive offset extends outward from clearance boundary
        // Bottom-left-back corner is at (clearance - offset) from parent origin
        const subCenterX = parentBounds.x + subAssembly.clearance - offsets.left + subOuterW / 2;
        const subCenterY = parentBounds.y + subAssembly.clearance - offsets.bottom + subOuterH / 2;
        const subCenterZ = parentBounds.z + subAssembly.clearance - offsets.back + subOuterD / 2;

        // Offset from main box center (panels are centered at origin)
        const offsetX = subCenterX - mainCenterX;
        const offsetY = subCenterY - mainCenterY;
        const offsetZ = subCenterZ - mainCenterZ;

        // Add sub-assembly panels to main collection with adjusted positions and IDs
        for (const panel of subCollection.panels) {
          const offsetPanel = {
            ...panel,
            id: `subasm-${subAssembly.id}-${panel.id}`,
            source: {
              ...panel.source,
              subAssemblyId: subAssembly.id,
            },
            position: [
              panel.position[0] + offsetX,
              panel.position[1] + offsetY,
              panel.position[2] + offsetZ,
            ] as [number, number, number],
          };
          collection.panels.push(offsetPanel);
        }
      }

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
      const parentStart = getBoundsStart(parent.bounds, axis);
      const parentSize = getBoundsSize(parent.bounds, axis);
      const parentEnd = parentStart + parentSize;

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
          // This is the parent - update its children (parentSize already defined above)
          const newChildren = parent.children.map((child) => {
            if (child.id === voidId) {
              // Calculate new percentage from position
              const newPercentage = (clampedPosition - parentStart) / parentSize;
              // Update this void's splitPosition and percentage
              return {
                ...child,
                splitPosition: clampedPosition,
                splitPercentage: newPercentage,
              };
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
            const newBounds = setBoundsRegion(child.bounds, axis, regionStart, regionSize);

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

        const dimStart = getBoundsStart(parentBounds, splitAxis);
        const dimEnd = dimStart + getBoundsSize(parentBounds, splitAxis);

        return children.map((child, idx) => {
          // Calculate region for this child
          const regionStart = idx === 0
            ? dimStart
            : (children[idx - 1].splitPosition ?? dimStart) + mt / 2;

          const regionEnd = child.splitPosition
            ? child.splitPosition - mt / 2
            : dimEnd;

          const regionSize = regionEnd - regionStart;
          const newBounds = setBoundsRegion(parentBounds, splitAxis, regionStart, regionSize);

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

  setDividerPositionMode: (subdivisionId, mode) =>
    set((state) => {
      // The subdivision ID is like "abc123-split", the void ID is "abc123"
      const voidId = subdivisionId.replace('-split', '');

      // Find the void that has this split position
      const targetVoid = findVoid(state.rootVoid, voidId);
      if (!targetVoid || !targetVoid.splitPosition || !targetVoid.splitAxis) {
        return state;
      }

      // Find the parent to calculate percentage if switching to percentage mode
      const parent = findParent(state.rootVoid, voidId);
      if (!parent) return state;

      const axis = targetVoid.splitAxis;
      const parentStart = getBoundsStart(parent.bounds, axis);
      const parentSize = getBoundsSize(parent.bounds, axis);

      // Calculate percentage from current position
      const percentage = (targetVoid.splitPosition - parentStart) / parentSize;

      // Update the void in the tree
      const newRootVoid = VoidTree.update(state.rootVoid, voidId, (v) => ({
        ...v,
        splitPositionMode: mode,
        splitPercentage: percentage,
      }));

      return {
        rootVoid: newRootVoid,
        panelsDirty: true,
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

  toggleDebugAnchors: () =>
    set((state) => ({
      showDebugAnchors: !state.showDebugAnchors,
    })),

  // 2D Sketch View actions
  setViewMode: (mode) =>
    set({ viewMode: mode }),

  enterSketchView: (panelId) =>
    set({
      viewMode: '2d',
      sketchPanelId: panelId,
      // Select the panel being edited
      selectedPanelIds: new Set([panelId]),
      selectedVoidIds: new Set<string>(),
      selectedSubAssemblyIds: new Set<string>(),
      selectedAssemblyId: null,
    }),

  exitSketchView: () =>
    set({
      viewMode: '3d',
      sketchPanelId: null,
      activeTool: 'select',
      selectedCornerIds: new Set<string>(),
    }),

  // Tool actions
  setActiveTool: (tool) =>
    set({
      activeTool: tool,
      // Clear corner selection when switching tools
      selectedCornerIds: new Set<string>(),
    }),

  // Corner selection actions
  selectCorner: (cornerId, addToSelection = false) =>
    set((state) => {
      if (addToSelection) {
        const newSet = new Set(state.selectedCornerIds);
        if (newSet.has(cornerId)) {
          newSet.delete(cornerId);
        } else {
          newSet.add(cornerId);
        }
        return { selectedCornerIds: newSet };
      } else {
        return { selectedCornerIds: new Set([cornerId]) };
      }
    }),

  selectCorners: (cornerIds) =>
    set({ selectedCornerIds: new Set(cornerIds) }),

  clearCornerSelection: () =>
    set({ selectedCornerIds: new Set<string>() }),

  // Preview actions
  startPreview: (type, metadata) =>
    set((state) => {
      startPushPullDebug();
      logPushPull({
        action: 'startPreview',
        faceId: metadata?.faceId,
        mode: metadata?.mode,
        mainState: {
          configDimensions: {
            width: state.config.width,
            height: state.config.height,
            depth: state.config.depth,
          },
        },
      });

      // Deep clone the current state to create an independent preview copy
      const deepCloneVoid = (v: Void): Void => ({
        ...v,
        bounds: { ...v.bounds },
        children: (v.children || []).map(deepCloneVoid),
        subAssembly: v.subAssembly ? {
          ...v.subAssembly,
          faces: (v.subAssembly.faces || []).map(f => ({ ...f })),
          rootVoid: deepCloneVoid(v.subAssembly.rootVoid),
          assembly: {
            ...v.subAssembly.assembly,
            lids: {
              positive: { ...v.subAssembly.assembly.lids.positive },
              negative: { ...v.subAssembly.assembly.lids.negative },
            },
            feet: v.subAssembly.assembly.feet ? { ...v.subAssembly.assembly.feet } : undefined,
            faceOffsets: v.subAssembly.assembly.faceOffsets ? { ...v.subAssembly.assembly.faceOffsets } : undefined,
          },
        } : undefined,
      });

      const previewState: PreviewState = {
        config: {
          ...state.config,
          assembly: {
            ...state.config.assembly,
            lids: {
              positive: { ...state.config.assembly.lids.positive },
              negative: { ...state.config.assembly.lids.negative },
            },
            feet: state.config.assembly.feet ? { ...state.config.assembly.feet } : undefined,
            faceOffsets: state.config.assembly.faceOffsets ? { ...state.config.assembly.faceOffsets } : undefined,
          },
        },
        faces: state.faces.map(f => ({ ...f })),
        rootVoid: deepCloneVoid(state.rootVoid),
        type,
        metadata,
      };

      // Generate panels for the preview state
      const previewCollection = generatePanelCollection(
        previewState.faces,
        previewState.rootVoid,
        previewState.config,
        1 // Scale factor
      );

      // Log panel positions for debugging
      const faceId = metadata?.faceId;
      if (faceId) {
        const mainPanel = state.panelCollection?.panels.find(p => p.id === `face-${faceId}`);
        const previewPanel = previewCollection?.panels.find(p => p.id === `face-${faceId}`);
        logPushPull({
          action: 'startPreview - panels generated',
          faceId,
          panelPosition: {
            mainPanel: mainPanel?.position as [number, number, number],
            previewPanel: previewPanel?.position as [number, number, number],
          },
          previewState: {
            hasPreview: true,
            type,
            configDimensions: {
              width: previewState.config.width,
              height: previewState.config.height,
              depth: previewState.config.depth,
            },
          },
        });
      }

      return {
        previewState,
        previewPanelCollection: previewCollection,
      };
    }),

  updatePreviewFaceOffset: (faceId, offset, mode) =>
    set((state) => {
      if (!state.previewState) {
        logPushPull({
          action: 'updatePreviewFaceOffset - NO PREVIEW STATE',
          faceId,
          offset,
          mode,
        });
        return state;
      }

      logPushPull({
        action: 'updatePreviewFaceOffset - start',
        faceId,
        offset,
        mode,
        mainState: {
          configDimensions: {
            width: state.config.width,
            height: state.config.height,
            depth: state.config.depth,
          },
        },
        previewState: {
          hasPreview: true,
          type: state.previewState.type,
          configDimensions: {
            width: state.previewState.config.width,
            height: state.previewState.config.height,
            depth: state.previewState.config.depth,
          },
        },
      });

      // Apply the offset to the MAIN state dimensions (not preview) to avoid feedback loop
      // The offset is always relative to the original dimensions
      const preview = state.previewState;
      const { width, height, depth } = state.config;  // Use MAIN state, not preview!

      // Calculate dimension changes based on face
      let newWidth = width;
      let newHeight = height;
      let newDepth = depth;

      switch (faceId) {
        case 'front':
        case 'back':
          newDepth = depth + offset;
          break;
        case 'left':
        case 'right':
          newWidth = width + offset;
          break;
        case 'top':
        case 'bottom':
          newHeight = height + offset;
          break;
      }

      // Don't allow negative dimensions
      if (newWidth <= 0 || newHeight <= 0 || newDepth <= 0) return state;

      // Deep clone and scale the void tree
      const deepCloneVoid = (v: Void): Void => ({
        ...v,
        bounds: { ...v.bounds },
        children: (v.children || []).map(deepCloneVoid),
        subAssembly: v.subAssembly ? {
          ...v.subAssembly,
          faces: (v.subAssembly.faces || []).map(f => ({ ...f })),
          rootVoid: deepCloneVoid(v.subAssembly.rootVoid),
          assembly: {
            ...v.subAssembly.assembly,
            lids: {
              positive: { ...v.subAssembly.assembly.lids.positive },
              negative: { ...v.subAssembly.assembly.lids.negative },
            },
          },
        } : undefined,
      });

      let newRootVoid: Void;
      const newRootBounds: Bounds = { x: 0, y: 0, z: 0, w: newWidth, h: newHeight, d: newDepth };
      const mt = state.config.materialThickness;

      if (mode === 'scale') {
        // Scale mode: Use recalculateVoidBounds like setConfig does
        // This properly handles hierarchical constraints and material thickness
        const mainInterior = getMainInteriorVoid(state.rootVoid);
        const hasInsets = mainInterior.id !== state.rootVoid.id;

        if (hasInsets) {
          // Has lid insets - need to rebuild root structure with new dimensions
          const positiveInset = state.config.assembly.lids.positive.inset;
          const negativeInset = state.config.assembly.lids.negative.inset;
          const axis = state.config.assembly.assemblyAxis;

          // Calculate new main interior bounds using BoundsOps helper
          const { main: mainBounds } = BoundsOps.calculateInsetRegions(
            newRootBounds, axis, positiveInset, negativeInset
          );

          // Recalculate the main interior's children
          const recalculatedMainInterior = recalculateVoidBounds(
            { ...mainInterior, bounds: mainBounds },
            mainBounds,
            mt
          );

          // Rebuild the root with lid caps and recalculated main interior
          newRootVoid = createRootVoidWithInsets(
            newWidth, newHeight, newDepth, state.config.assembly
          );
          // Replace the main interior's children with the recalculated ones
          const newMainInterior = newRootVoid.children.find(c => c.isMainInterior);
          if (newMainInterior) {
            newMainInterior.children = recalculatedMainInterior.children;
          }
        } else {
          // No lid insets - recalculate directly from root
          newRootVoid = recalculateVoidBounds(
            { ...state.rootVoid, bounds: newRootBounds },
            newRootBounds,
            mt
          );
        }
      } else {
        // Extend mode: Keep center in place, only the void abutting the face grows
        // Children stay at their absolute positions, but we need to expand the
        // adjacent void to fill the new space (same approach as setFaceOffset)
        const deltaW = newWidth - state.config.width;
        const deltaH = newHeight - state.config.height;
        const deltaD = newDepth - state.config.depth;

        // Debug logging
        startExtendModeDebug(
          faceId,
          offset,
          { width: state.config.width, height: state.config.height, depth: state.config.depth },
          { width: newWidth, height: newHeight, depth: newDepth },
          state.rootVoid
        );

        // Helper to adjust void bounds based on which face moved
        // Also adjusts splitPosition when voids shift (so divider panels move with their voids)
        const adjustVoidBounds = (v: Void): Void => {
          const newBounds = { ...v.bounds };
          let newSplitPosition = v.splitPosition;

          // For extend mode, we extend in the direction of the face
          // The face that moved outward increases the dimension on that side
          switch (faceId) {
            case 'right':
              // Right face moved: voids at the right edge grow
              if (v.bounds.x + v.bounds.w >= state.config.width - 0.1) {
                newBounds.w += deltaW;
              }
              break;
            case 'left':
              // Left face moved: voids at the left edge grow, others shift
              if (v.bounds.x <= 0.1) {
                newBounds.w += deltaW;
              } else {
                newBounds.x += deltaW;
                // Also shift splitPosition if this void has an X-axis split
                if (v.splitAxis === 'x' && newSplitPosition !== undefined) {
                  newSplitPosition += deltaW;
                }
              }
              break;
            case 'top':
              // Top face moved: voids at the top edge grow
              if (v.bounds.y + v.bounds.h >= state.config.height - 0.1) {
                newBounds.h += deltaH;
              }
              break;
            case 'bottom':
              // Bottom face moved: voids at the bottom edge grow, others shift
              if (v.bounds.y <= 0.1) {
                newBounds.h += deltaH;
              } else {
                newBounds.y += deltaH;
                // Also shift splitPosition if this void has a Y-axis split
                if (v.splitAxis === 'y' && newSplitPosition !== undefined) {
                  newSplitPosition += deltaH;
                }
              }
              break;
            case 'front':
              // Front face moved: voids at the front edge grow
              if (v.bounds.z + v.bounds.d >= state.config.depth - 0.1) {
                newBounds.d += deltaD;
              }
              break;
            case 'back':
              // Back face moved: voids at the back edge grow, others shift
              if (v.bounds.z <= 0.1) {
                newBounds.d += deltaD;
              } else {
                newBounds.z += deltaD;
                // Also shift splitPosition if this void has a Z-axis split
                if (v.splitAxis === 'z' && newSplitPosition !== undefined) {
                  newSplitPosition += deltaD;
                }
              }
              break;
          }

          return {
            ...v,
            bounds: newBounds,
            splitPosition: newSplitPosition,
            children: v.children.map(adjustVoidBounds),
          };
        };

        newRootVoid = {
          ...adjustVoidBounds(state.rootVoid),
          bounds: newRootBounds,
        };

        // Finish debug logging
        finishExtendModeDebug(newRootVoid);
      }

      const newConfig: BoxConfig = {
        ...state.config,  // Use MAIN state config as base
        width: newWidth,
        height: newHeight,
        depth: newDepth,
      };

      const newPreviewState: PreviewState = {
        ...preview,
        config: newConfig,
        rootVoid: newRootVoid,
        faces: state.faces.map(f => ({ ...f })),  // Use MAIN state faces
        // Note: centerOffset will be set after we calculate the shift below
      };

      // Regenerate panels for preview
      const previewCollection = generatePanelCollection(
        newPreviewState.faces,
        newPreviewState.rootVoid,
        newPreviewState.config,
        1
      );

      // No center shift - box scales around center, both faces move proportionally.
      // This ensures preview looks the same as the final result (no jump on apply).

      // Log updated panel positions with full detail
      const mainPanelPositions: Record<string, [number, number, number]> = {};
      const previewPanelPositions: Record<string, [number, number, number]> = {};

      if (state.panelCollection) {
        for (const p of state.panelCollection.panels) {
          mainPanelPositions[p.id] = [...p.position] as [number, number, number];
        }
      }
      if (previewCollection) {
        for (const p of previewCollection.panels) {
          previewPanelPositions[p.id] = [...p.position] as [number, number, number];
        }
      }

      logPushPull({
        action: 'updatePreviewFaceOffset - panels regenerated',
        faceId,
        offset,
        mode,
        extra: {
          originalDimensions: { width, height, depth },
          newDimensions: { width: newWidth, height: newHeight, depth: newDepth },
          mainPanelPositions,
          previewPanelPositions,
        },
      });

      return {
        previewState: newPreviewState,
        previewPanelCollection: previewCollection,
      };
    }),

  updatePreviewSubdivision: (preview) =>
    set((state) => {
      if (!state.previewState) return state;

      const { voidId, axis, count, positions } = preview;

      // Start from the ORIGINAL main state rootVoid, not the current preview
      // This ensures we don't accumulate subdivisions on repeated updates
      const baseRootVoid = state.rootVoid;

      const targetVoid = findVoid(baseRootVoid, voidId);
      if (!targetVoid || targetVoid.children.length > 0) {
        // Void not found or already has children - just return current state
        return state;
      }

      const { bounds } = targetVoid;

      // Debug: log the bounds used in updatePreviewSubdivision
      // This helps verify they match the bounds used for position calculation
      const debugLines = [
        '\n=== updatePreviewSubdivision BOUNDS ===',
        `Void ID: ${voidId}`,
        `Found void bounds: x=${bounds.x}, y=${bounds.y}, z=${bounds.z}, w=${bounds.w}, h=${bounds.h}, d=${bounds.d}`,
        `Received positions: [${positions.map((p: number) => p.toFixed(1)).join(', ')}]`,
        `Axis: ${axis}`,
      ];
      appendDebug(debugLines.join('\n'));
      const mt = state.previewState.config.materialThickness;

      // Create N+1 child voids for N divisions using consolidated bounds calculation
      const children: Void[] = [];
      const dimStart = getBoundsStart(bounds, axis);
      const dimSize = getBoundsSize(bounds, axis);

      for (let i = 0; i <= count; i++) {
        const childBounds = calculateChildRegionBounds(
          bounds,
          axis,
          i,
          count + 1,  // count is number of dividers, we have count+1 regions
          positions,
          mt
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

      // Create new rootVoid with the subdivision applied
      const newRootVoid = VoidTree.update(baseRootVoid, voidId, (v) => ({
        ...v,
        children,
      }));

      // Update preview state with new rootVoid and metadata
      const newPreviewState: PreviewState = {
        ...state.previewState,
        rootVoid: newRootVoid,
        metadata: {
          ...state.previewState.metadata,
          voidId,
          subdivisionAxis: axis,
          subdivisionCount: count,
          subdivisionPositions: positions,
        },
      };

      // Generate panels for the preview state
      const previewCollection = generatePanelCollection(
        newPreviewState.faces,
        newPreviewState.rootVoid,
        newPreviewState.config,
        1
      );

      return {
        previewState: newPreviewState,
        previewPanelCollection: previewCollection,
      };
    }),

  updatePreviewSubAssembly: (voidId, clearance, assemblyAxis, faceOffsets) =>
    set((state) => {
      if (!state.previewState) return state;

      // Start from the ORIGINAL main state rootVoid, not the current preview
      // This ensures we don't accumulate sub-assemblies on repeated updates
      const baseRootVoid = state.rootVoid;

      const targetVoid = findVoid(baseRootVoid, voidId);
      if (!targetVoid || targetVoid.children.length > 0 || targetVoid.subAssembly) {
        // Void not found, already has children, or already has sub-assembly
        return state;
      }

      const { bounds } = targetVoid;
      const mt = state.previewState.config.materialThickness;

      // Calculate outer dimensions (space available after clearance + face offsets)
      const outerWidth = bounds.w - (clearance * 2) + faceOffsets.left + faceOffsets.right;
      const outerHeight = bounds.h - (clearance * 2) + faceOffsets.top + faceOffsets.bottom;
      const outerDepth = bounds.d - (clearance * 2) + faceOffsets.front + faceOffsets.back;

      // Calculate interior dimensions (outer minus walls on each side)
      const interiorWidth = outerWidth - (2 * mt);
      const interiorHeight = outerHeight - (2 * mt);
      const interiorDepth = outerDepth - (2 * mt);

      if (interiorWidth <= 0 || interiorHeight <= 0 || interiorDepth <= 0) {
        // Void too small for sub-assembly, clear the preview panels but keep preview state
        return {
          previewPanelCollection: null,
        };
      }

      // Create sub-assembly with all faces solid by default
      const subAssembly: SubAssembly = {
        id: 'preview-subasm-' + generateId(),
        clearance,
        faceOffsets,
        faces: createAllSolidFaces(),
        materialThickness: mt,
        rootVoid: {
          id: 'sub-root-preview-' + generateId(),
          bounds: { x: 0, y: 0, z: 0, w: interiorWidth, h: interiorHeight, d: interiorDepth },
          children: [],
        },
        assembly: {
          assemblyAxis,
          lids: {
            positive: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
            negative: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
          },
        },
      };

      // Create new rootVoid with the sub-assembly
      const newRootVoid = VoidTree.update(baseRootVoid, voidId, (v) => ({
        ...v,
        subAssembly,
      }));

      // Update preview state with new rootVoid and metadata
      const newPreviewState: PreviewState = {
        ...state.previewState,
        rootVoid: newRootVoid,
        metadata: {
          ...state.previewState.metadata,
          voidId,
          subAssemblyClearance: clearance,
          subAssemblyAxis: assemblyAxis,
          subAssemblyFaceOffsets: faceOffsets,
        },
      };

      // Generate panels for the preview state
      const previewCollection = generatePanelCollection(
        newPreviewState.faces,
        newPreviewState.rootVoid,
        newPreviewState.config,
        1
      );

      return {
        previewState: newPreviewState,
        previewPanelCollection: previewCollection,
      };
    }),

  commitPreview: () =>
    set((state) => {
      if (!state.previewState) return state;

      // Copy the preview config/faces/rootVoid to main state
      // Don't copy previewPanelCollection - it has shifted positions for visualization.
      // Instead, mark panels dirty so they get regenerated centered at origin.
      return {
        config: state.previewState.config,
        faces: state.previewState.faces,
        rootVoid: state.previewState.rootVoid,
        panelsDirty: true,  // Regenerate panels centered at origin
        previewState: null,
        previewPanelCollection: null,
      };
    }),

  cancelPreview: () =>
    set({
      previewState: null,
      previewPanelCollection: null,
    }),
}));
