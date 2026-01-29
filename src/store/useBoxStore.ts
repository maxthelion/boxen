import { create } from 'zustand';
import { BoxState, BoxActions, FaceId, Void, Bounds, Subdivision, SelectionMode, SubAssembly, Face, AssemblyAxis, LidTabDirection, defaultAssemblyConfig, AssemblyConfig, PanelCollection, PanelPath, PanelHole, PanelAugmentation, defaultEdgeExtensions, EdgeExtensions, CreateSubAssemblyOptions, FaceOffsets, defaultFaceOffsets, SplitPositionMode, ViewMode, EditorTool, BoxConfig, createAllSolidFaces, MAIN_FACE_PANEL_IDS, OperationId, INITIAL_OPERATION_STATE } from '../types';
import { getOperation, operationHasPreview, operationIsImmediate } from '../operations';
import { loadFromUrl, saveToUrl as saveStateToUrl, getShareableUrl as getShareUrl, ProjectState } from '../utils/urlState';
import { generatePanelCollection } from '../utils/panelGenerator';
import { syncStoreToEngine, getEngine, ensureEngine, ensureEngineInitialized, getEngineSnapshot, dispatchToEngine, notifyEngineStateChanged } from '../engine';
import { logPushPull, startPushPullDebug } from '../utils/pushPullDebug';
import { startExtendModeDebug, finishExtendModeDebug } from '../utils/extendModeDebug';
import { BoundsOps, getBoundsStart, getBoundsSize, setBoundsRegion, calculateChildRegionBounds, calculatePreviewPositions, InsetRegions } from '../utils/bounds';
import { VoidTree } from '../utils/voidTree';

// Re-export bounds helpers for external use
export { getBoundsStart, getBoundsSize, setBoundsRegion, calculateChildRegionBounds, calculatePreviewPositions };

const generateId = () => Math.random().toString(36).substr(2, 9);

// =============================================================================
// Model State Access - Engine is Source of Truth
// =============================================================================
//
// During the store-state-migration (Phase 4), we're transitioning from store-owned
// model state to engine-owned state. This helper provides a unified way to access
// model state, preferring engine over store cache.
//
// Usage in actions:
//   const modelState = getModelState(state);
//   const { config, faces, rootVoid } = modelState;
//
// Once migration is complete, store.config/faces/rootVoid will be removed and
// this helper will only read from engine.
// =============================================================================

interface ModelState {
  config: BoxConfig;
  faces: Face[];
  rootVoid: Void;
}

/**
 * Get model state from engine (preferred) with fallback to store state.
 * This is used during the transition period where both exist.
 *
 * @param storeState - The current store state (for fallback)
 * @returns Model state from engine if available, otherwise from store
 */
function getModelState(storeState: BoxState): ModelState {
  // Ensure engine is initialized
  ensureEngine();

  // Try to get state from engine (source of truth)
  const engineSnapshot = getEngineSnapshot();
  if (engineSnapshot) {
    return engineSnapshot;
  }

  // Fallback to store state (during transition/initialization)
  return {
    config: storeState.config,
    faces: storeState.faces,
    rootVoid: storeState.rootVoid,
  };
}

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

// =============================================================================
// Panel ID Lookup (from Engine)
// =============================================================================
//
// Panel IDs are UUIDs, not deterministic strings. To find a panel by its
// semantic properties (void ID, axis, etc.), we must look it up from the
// engine's generated panels using PanelPath.source metadata.
// =============================================================================

/**
 * Build a lookup map from child void ID to its divider panel ID.
 *
 * Divider panels are associated with child voids that have split info.
 * The panel's source.subdivisionId is the PARENT void's ID (the void being subdivided),
 * so we need to match by axis and position to find the right child.
 */
export function buildDividerPanelLookup(panels: PanelPath[]): Map<string, string> {
  const lookup = new Map<string, string>();

  for (const panel of panels) {
    if (panel.source.type === 'divider' && panel.source.subdivisionId) {
      // Key format: "parentVoidId-axis-position"
      // This matches how getDividerPanels in BoxTree.tsx builds its lookup
      const key = `${panel.source.subdivisionId}-${panel.source.axis}-${panel.source.position}`;
      lookup.set(key, panel.id);
    }
  }

  return lookup;
}

/**
 * Get the divider panel ID for a child void that has split info.
 * Returns null if no matching panel is found.
 *
 * @param panels - All panels from engine.generatePanelsFromNodes()
 * @param parentVoidId - The ID of the parent void (void being subdivided)
 * @param axis - The split axis
 * @param position - The split position
 */
export function getDividerPanelId(
  panels: PanelPath[],
  parentVoidId: string,
  axis: 'x' | 'y' | 'z',
  position: number
): string | null {
  const panel = panels.find(p =>
    p.source.type === 'divider' &&
    p.source.subdivisionId === parentVoidId &&
    p.source.axis === axis &&
    p.source.position === position
  );
  return panel?.id ?? null;
}

/**
 * Get all divider panel IDs from the engine panels.
 */
export function getAllDividerPanelIdsFromEngine(panels: PanelPath[]): string[] {
  return panels
    .filter(p => p.source.type === 'divider')
    .map(p => p.id);
}

// =============================================================================
// Selection Manager
// =============================================================================
//
// Selection has two related concepts:
// 1. Actual Selection - what the user actually selected (assembly, sub-assembly, or panels)
//    This is what operations apply to.
// 2. Visual Selection - which panels should appear selected in the UI
//    When an assembly is selected, all its component panels appear visually selected.
//
// The SelectionManager computes visual selection from actual selection.
// =============================================================================

/**
 * Get the assembly ID that a panel belongs to.
 * - Face panels of main assembly: 'main'
 * - Face panels of sub-assembly: the sub-assembly ID (extracted from panel ID)
 * - Divider panels: 'main' (all dividers belong to main assembly currently)
 */
export const getAssemblyIdForPanel = (panelId: string): string => {
  // Sub-assembly face panel: subasm-{subAssemblyId}-face-{faceId}
  const subAsmMatch = panelId.match(/^subasm-(.+)-face-(front|back|left|right|top|bottom)$/);
  if (subAsmMatch) {
    return subAsmMatch[1];
  }

  // Main assembly face panel (face-{faceId}) or divider panel (divider-...)
  return 'main';
};

/**
 * Selection state from the store (actual selection)
 */
export interface ActualSelection {
  selectedPanelIds: Set<string>;
  selectedAssemblyId: string | null;
  selectedSubAssemblyIds: Set<string>;
}

/**
 * Compute the set of panel IDs that should appear visually selected.
 *
 * Visual selection includes:
 * - Directly selected panels (from selectedPanelIds)
 * - All panels belonging to selected assemblies/sub-assemblies
 *
 * @param selection - The actual selection state from the store
 * @param allPanelIds - All panel IDs currently in the scene
 * @returns Set of panel IDs that should appear visually selected
 */
export const computeVisuallySelectedPanelIds = (
  selection: ActualSelection,
  allPanelIds: string[]
): Set<string> => {
  const visuallySelected = new Set<string>();

  // Add directly selected panels
  for (const panelId of selection.selectedPanelIds) {
    visuallySelected.add(panelId);
  }

  // If an assembly is selected, add all its panels
  if (selection.selectedAssemblyId) {
    for (const panelId of allPanelIds) {
      if (getAssemblyIdForPanel(panelId) === selection.selectedAssemblyId) {
        visuallySelected.add(panelId);
      }
    }
  }

  // Add panels from selected sub-assemblies
  for (const subAsmId of selection.selectedSubAssemblyIds) {
    for (const panelId of allPanelIds) {
      if (getAssemblyIdForPanel(panelId) === subAsmId) {
        visuallySelected.add(panelId);
      }
    }
  }

  return visuallySelected;
};

/**
 * Check if a panel should appear selected in the 3D view.
 *
 * In 3D, we show visual cascade: when an assembly is selected,
 * all its component panels appear selected to show what the assembly contains.
 *
 * The tree view should NOT use this - it shows actual selection only.
 */
export const isPanelSelectedIn3DView = (
  panelId: string,
  selection: ActualSelection
): boolean => {
  // Direct panel selection
  if (selection.selectedPanelIds.has(panelId)) {
    return true;
  }

  // Assembly cascade - panel appears selected if its assembly is selected
  const panelAssemblyId = getAssemblyIdForPanel(panelId);

  if (selection.selectedAssemblyId === panelAssemblyId) {
    return true;
  }

  // Sub-assembly cascade
  if (panelAssemblyId !== 'main' && selection.selectedSubAssemblyIds.has(panelAssemblyId)) {
    return true;
  }

  return false;
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
  selectedAssemblyId: null,  // No assembly selected by default
  // Hover state
  hoveredVoidId: null,
  hoveredPanelId: null,
  hoveredAssemblyId: null,
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
  showDebugAnchors: false,
  // 2D Sketch View state
  viewMode: '3d',
  sketchPanelId: null,
  // Tool state
  activeTool: 'select' as EditorTool,
  selectedCornerIds: new Set<string>(),
  // Edge selection state (for inset/outset tool)
  selectedEdges: new Set<string>(),  // Format: "panelId:edge" e.g. "uuid:top"
  hoveredEdge: null as string | null,  // Format: "panelId:edge"
  // Operation state
  operationState: {
    activeOperation: null,
    phase: 'idle',
    params: {},
  },

  setConfig: (newConfig) =>
    set((state) => {
      // Get current model state from engine (source of truth)
      const modelState = getModelState(state);
      const oldConfig = modelState.config;
      const oldRootVoid = modelState.rootVoid;

      // Merge new config with old
      const config = { ...oldConfig, ...newConfig };

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
        const mainInterior = getMainInteriorVoid(oldRootVoid);
        const hasInsets = mainInterior.id !== oldRootVoid.id;

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
            { ...oldRootVoid, bounds: newRootBounds },
            newRootBounds,
            config.materialThickness
          );
        }

        return {
          config,
          rootVoid: newRootVoid,
          panelsDirty: true,
        };
      }

      // Only non-structural config changes (materialThickness, fingerWidth, etc.)
      return {
        config,
        panelsDirty: true,
      };
    }),

  toggleFace: (faceId) => {
    // Track whether engine state changed so we can notify AFTER store update
    let engineStateChanged = false;

    set((state) => {
      // Ensure engine is initialized before dispatching
      ensureEngine();
      const engine = getEngine();

      const action = {
        type: 'TOGGLE_FACE' as const,
        targetId: 'main-assembly',
        payload: { faceId },
      };

      // Check if there's an active parameter operation - dispatch to preview if so
      const { activeOperation } = state.operationState;
      const hasActivePreview = activeOperation && engine.hasPreview();

      if (hasActivePreview) {
        // Dispatch to preview scene
        engine.dispatch(action, { preview: true });
        engineStateChanged = true;

        // Get updated faces from preview
        const snapshot = engine.getSnapshot();
        return {
          faces: snapshot.faces,
        };
      }

      // No active operation - dispatch normally
      const result = dispatchToEngine(action);

      if (!result.success || !result.snapshot) {
        // Fallback to local update if dispatch failed
        // Get model state from engine (source of truth)
        const modelState = getModelState(state);
        return {
          faces: modelState.faces.map((face) =>
            face.id === faceId ? { ...face, solid: !face.solid } : face
          ),
        };
      }

      return {
        faces: result.snapshot.faces,
      };
    });

    // Notify React AFTER store update completes
    if (engineStateChanged) {
      notifyEngineStateChanged();
    }
  },

  setSelectionMode: (mode) =>
    set({
      selectionMode: mode,
      selectedVoidIds: new Set<string>(),
      selectedSubAssemblyIds: new Set<string>(),
      selectedPanelIds: new Set<string>(),
      selectedAssemblyId: null,
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
        selectedEdges: new Set<string>(),
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
          selectedEdges: new Set<string>(),
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
        selectedEdges: new Set<string>(),
        selectedAssemblyId: null,
      };
    }),

  selectAssembly: (assemblyId) =>
    set({
      selectedAssemblyId: assemblyId,
      selectedVoidIds: new Set<string>(),
      selectedSubAssemblyIds: new Set<string>(),
      selectedPanelIds: new Set<string>(),
      selectedEdges: new Set<string>(),
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

  // Edge selection (for inset/outset tool)
  selectEdge: (panelId: string, edge: string, additive = false) =>
    set((state) => {
      const edgeKey = `${panelId}:${edge}`;
      const newSet = new Set(additive ? state.selectedEdges : []);
      if (newSet.has(edgeKey)) {
        newSet.delete(edgeKey);
      } else {
        newSet.add(edgeKey);
      }
      // When selecting edges, clear other selection types (unless additive)
      if (additive) {
        return { selectedEdges: newSet };
      }
      return {
        selectedEdges: newSet,
        selectedVoidIds: new Set<string>(),
        selectedPanelIds: new Set<string>(),
        selectedSubAssemblyIds: new Set<string>(),
        selectedAssemblyId: null,
      };
    }),

  deselectEdge: (panelId: string, edge: string) =>
    set((state) => {
      const edgeKey = `${panelId}:${edge}`;
      const newSet = new Set(state.selectedEdges);
      newSet.delete(edgeKey);
      return { selectedEdges: newSet };
    }),

  clearEdgeSelection: () =>
    set({ selectedEdges: new Set<string>() }),

  setHoveredEdge: (panelId: string | null, edge: string | null) =>
    set({ hoveredEdge: panelId && edge ? `${panelId}:${edge}` : null }),

  setSubAssemblyPreview: (preview) =>
    set({ subAssemblyPreview: preview }),

  removeVoid: (voidId) =>
    set((state) => {
      // Get model state from engine (source of truth)
      const modelState = getModelState(state);
      const parent = findParent(modelState.rootVoid, voidId);
      if (!parent) return state;

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
        panelsDirty: true,
      };
    }),

  resetVoids: () =>
    set((state) => {
      // Get model state from engine (source of truth)
      const modelState = getModelState(state);
      const { config } = modelState;

      return {
        rootVoid: createRootVoidWithInsets(config.width, config.height, config.depth, config.assembly),
        selectedVoidIds: new Set<string>(),
        selectedSubAssemblyIds: new Set<string>(),
        selectedPanelIds: new Set<string>(),
        selectedAssemblyId: null,
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
      };
    }),

  // Sub-assembly actions
  createSubAssembly: (voidId, options) =>
    set((state) => {
      // Ensure engine is initialized
      ensureEngine();

      const clearance = options?.clearance ?? 2; // Default 2mm clearance
      const assemblyAxis = options?.assemblyAxis ?? 'y'; // Default Y axis

      // Dispatch to engine
      const result = dispatchToEngine({
        type: 'CREATE_SUB_ASSEMBLY',
        targetId: 'main-assembly',
        payload: { voidId, clearance, assemblyAxis },
      });

      if (!result.success || !result.snapshot) {
        // Fallback to local creation if dispatch failed
        // Get model state from engine (source of truth)
        const modelState = getModelState(state);
        const { config, rootVoid } = modelState;

        const targetVoid = findVoid(rootVoid, voidId);
        if (!targetVoid || targetVoid.children.length > 0 || targetVoid.subAssembly) {
          return state;
        }

        const faceOffsets = options?.faceOffsets ?? { front: 0, back: 0, left: 0, right: 0, top: 0, bottom: 0 };
        const { bounds } = targetVoid;
        const mt = config.materialThickness;

        const outerWidth = bounds.w - (clearance * 2) + faceOffsets.left + faceOffsets.right;
        const outerHeight = bounds.h - (clearance * 2) + faceOffsets.top + faceOffsets.bottom;
        const outerDepth = bounds.d - (clearance * 2) + faceOffsets.front + faceOffsets.back;

        const interiorWidth = outerWidth - (2 * mt);
        const interiorHeight = outerHeight - (2 * mt);
        const interiorDepth = outerDepth - (2 * mt);

        if (interiorWidth <= 0 || interiorHeight <= 0 || interiorDepth <= 0) {
          return state;
        }

        const subAssembly: SubAssembly = {
          id: generateId(),
          clearance,
          faceOffsets,
          faces: createAllSolidFaces(),
          materialThickness: mt,
          rootVoid: {
            id: 'sub-root-' + generateId(),
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

        const newRootVoid = VoidTree.update(rootVoid, voidId, (v) => ({
          ...v,
          subAssembly,
        }));

        return {
          rootVoid: newRootVoid,
          selectedVoidIds: new Set<string>(),
          selectedSubAssemblyIds: new Set([subAssembly.id]),
          panelsDirty: true,
        };
      }

      // Find the created sub-assembly ID from the snapshot
      const createdVoid = findVoid(result.snapshot.rootVoid, voidId);
      const subAssemblyId = createdVoid?.subAssembly?.id;

      return {
        rootVoid: result.snapshot.rootVoid,
        selectedVoidIds: new Set<string>(),
        selectedSubAssemblyIds: subAssemblyId ? new Set([subAssemblyId]) : new Set<string>(),
        panelsDirty: true,
      };
    }),

  purgeVoid: (voidId) =>
    set((state) => {
      // Ensure engine is initialized
      ensureEngine();

      // Dispatch to engine
      const result = dispatchToEngine({
        type: 'PURGE_VOID',
        targetId: 'main-assembly',
        payload: { voidId },
      });

      if (!result.success || !result.snapshot) {
        // Fallback to local update if dispatch failed
        // Get model state from engine (source of truth)
        const modelState = getModelState(state);
        const newRootVoid = VoidTree.update(modelState.rootVoid, voidId, (v) => ({
          ...v,
          children: [],
          subAssembly: undefined,
        }));
        return {
          rootVoid: newRootVoid,
          selectedVoidIds: new Set<string>(),
          selectedSubAssemblyIds: new Set<string>(),
          panelsDirty: true,
        };
      }

      return {
        rootVoid: result.snapshot.rootVoid,
        selectedVoidIds: new Set<string>(),
        selectedSubAssemblyIds: new Set<string>(),
        panelsDirty: true,
      };
    }),

  toggleSubAssemblyFace: (subAssemblyId, faceId) =>
    set((state) => {
      // Ensure engine is initialized
      ensureEngine();

      // Dispatch to engine
      const result = dispatchToEngine({
        type: 'TOGGLE_SUB_ASSEMBLY_FACE',
        targetId: 'main-assembly',
        payload: { subAssemblyId, faceId },
      });

      if (!result.success || !result.snapshot) {
        // Fallback to local update if dispatch failed
        // Get model state from engine (source of truth)
        const modelState = getModelState(state);
        const { rootVoid } = modelState;

        const found = findSubAssembly(rootVoid, subAssemblyId);
        if (!found) return state;

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
          rootVoid: updateSubAssemblyInVoid(rootVoid),
          panelsDirty: true,
        };
      }

      return {
        rootVoid: result.snapshot.rootVoid,
        panelsDirty: true,
      };
    }),

  setSubAssemblyClearance: (subAssemblyId, clearance) =>
    set((state) => {
      // Ensure engine is initialized
      ensureEngine();

      // Dispatch to engine
      const result = dispatchToEngine({
        type: 'SET_SUB_ASSEMBLY_CLEARANCE',
        targetId: 'main-assembly',
        payload: { subAssemblyId, clearance: Math.max(0, clearance) },
      });

      if (!result.success || !result.snapshot) {
        // Fallback to local update if dispatch failed
        // Get model state from engine (source of truth)
        const modelState = getModelState(state);
        const { rootVoid } = modelState;

        const updateSubAssemblyInVoid = (v: Void): Void => {
          if (v.subAssembly?.id === subAssemblyId) {
            const newClearance = Math.max(0, clearance);
            const mt = v.subAssembly.materialThickness;
            const faceOffsets = v.subAssembly.faceOffsets || { left: 0, right: 0, top: 0, bottom: 0, front: 0, back: 0 };

            const outerWidth = v.bounds.w - (newClearance * 2) + faceOffsets.left + faceOffsets.right;
            const outerHeight = v.bounds.h - (newClearance * 2) + faceOffsets.top + faceOffsets.bottom;
            const outerDepth = v.bounds.d - (newClearance * 2) + faceOffsets.front + faceOffsets.back;

            const interiorWidth = outerWidth - (2 * mt);
            const interiorHeight = outerHeight - (2 * mt);
            const interiorDepth = outerDepth - (2 * mt);

            if (interiorWidth <= 0 || interiorHeight <= 0 || interiorDepth <= 0) {
              return v;
            }

            return {
              ...v,
              subAssembly: {
                ...v.subAssembly,
                clearance: newClearance,
                rootVoid: {
                  ...v.subAssembly.rootVoid,
                  bounds: { x: 0, y: 0, z: 0, w: interiorWidth, h: interiorHeight, d: interiorDepth },
                  children: [],
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
          rootVoid: updateSubAssemblyInVoid(rootVoid),
          panelsDirty: true,
        };
      }

      return {
        rootVoid: result.snapshot.rootVoid,
        panelsDirty: true,
      };
    }),

  removeSubAssembly: (voidId) =>
    set((state) => {
      // Get model state from engine (source of truth)
      const modelState = getModelState(state);
      const { rootVoid } = modelState;

      // Find the sub-assembly ID from the void
      const targetVoid = findVoid(rootVoid, voidId);
      const subAssemblyId = targetVoid?.subAssembly?.id;

      if (!subAssemblyId) {
        return state; // No sub-assembly to remove
      }

      // Ensure engine is initialized
      ensureEngine();

      // Dispatch to engine
      const result = dispatchToEngine({
        type: 'REMOVE_SUB_ASSEMBLY',
        targetId: 'main-assembly',
        payload: { subAssemblyId },
      });

      if (!result.success || !result.snapshot) {
        // Fallback to local removal if dispatch failed
        const newRootVoid = VoidTree.update(rootVoid, voidId, (v) => ({
          ...v,
          subAssembly: undefined,
        }));

        return {
          rootVoid: newRootVoid,
          selectedVoidIds: new Set<string>(),
          selectedSubAssemblyIds: new Set<string>(),
          panelsDirty: true,
        };
      }

      return {
        rootVoid: result.snapshot.rootVoid,
        selectedVoidIds: new Set<string>(),
        selectedSubAssemblyIds: new Set<string>(),
        panelsDirty: true,
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
      // Get model state from engine (source of truth)
      const modelState = getModelState(state);
      const rootVoid = modelState.rootVoid;

      const isolatedVoid = findVoid(rootVoid, voidId);
      if (!isolatedVoid) return state;

      // Get all void IDs that should remain visible (isolated + descendants)
      const visibleVoidIds = new Set(getVoidSubtreeIds(isolatedVoid));

      // Get all void IDs in the tree
      const allVoidIds = getVoidSubtreeIds(rootVoid);

      // Build new hidden sets
      const newHiddenVoidIds = new Set(state.hiddenVoidIds);
      const newIsolateHiddenVoidIds = new Set<string>();
      const newHiddenFaceIds = new Set(state.hiddenFaceIds);
      const newIsolateHiddenFaceIds = new Set<string>();
      const newHiddenSubAssemblyIds = new Set(state.hiddenSubAssemblyIds);
      const newIsolateHiddenSubAssemblyIds = new Set<string>();

      // Hide voids that should not be visible
      for (const id of allVoidIds) {
        if (!visibleVoidIds.has(id) && !state.hiddenVoidIds.has(id)) {
          newHiddenVoidIds.add(id);
          newIsolateHiddenVoidIds.add(id);
        }
      }

      // Hide divider panels whose parent void is not visible
      // (divider.source.subdivisionId = parent void ID)
      const engine = getEngine();
      const panels = engine.generatePanelsFromNodes().panels;
      for (const panel of panels) {
        if (panel.source.type === 'divider' && panel.source.subdivisionId) {
          // Show divider only if its parent void (subdivisionId) is visible
          if (!visibleVoidIds.has(panel.source.subdivisionId) && !state.hiddenFaceIds.has(panel.id)) {
            newHiddenFaceIds.add(panel.id);
            newIsolateHiddenFaceIds.add(panel.id);
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
      const allSubAssemblies = getAllSubAssemblies(rootVoid);
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
      // Get model state from engine (source of truth)
      const modelState = getModelState(state);
      const rootVoid = modelState.rootVoid;

      const newHiddenVoidIds = new Set(state.hiddenVoidIds);
      const newIsolateHiddenVoidIds = new Set<string>();
      const newHiddenFaceIds = new Set(state.hiddenFaceIds);
      const newIsolateHiddenFaceIds = new Set<string>();
      const newHiddenSubAssemblyIds = new Set(state.hiddenSubAssemblyIds);
      const newIsolateHiddenSubAssemblyIds = new Set<string>();

      // Hide all voids
      const allVoidIds = getVoidSubtreeIds(rootVoid);
      for (const id of allVoidIds) {
        if (!state.hiddenVoidIds.has(id)) {
          newHiddenVoidIds.add(id);
          newIsolateHiddenVoidIds.add(id);
        }
      }

      // Hide all divider panels (isolating sub-assembly means hiding main assembly dividers)
      const engine = getEngine();
      const panels = engine.generatePanelsFromNodes().panels;
      for (const panel of panels) {
        if (panel.source.type === 'divider' && !state.hiddenFaceIds.has(panel.id)) {
          newHiddenFaceIds.add(panel.id);
          newIsolateHiddenFaceIds.add(panel.id);
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
      const allSubAssemblies = getAllSubAssemblies(rootVoid);
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
      // Get model state from engine (source of truth)
      const modelState = getModelState(state);
      const rootVoid = modelState.rootVoid;

      const newHiddenVoidIds = new Set(state.hiddenVoidIds);
      const newIsolateHiddenVoidIds = new Set<string>();
      const newHiddenFaceIds = new Set(state.hiddenFaceIds);
      const newIsolateHiddenFaceIds = new Set<string>();
      const newHiddenSubAssemblyIds = new Set(state.hiddenSubAssemblyIds);
      const newIsolateHiddenSubAssemblyIds = new Set<string>();

      // Hide all voids
      const allVoidIds = getVoidSubtreeIds(rootVoid);
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
      const engine = getEngine();
      const panels = engine.generatePanelsFromNodes().panels;
      for (const panel of panels) {
        if (panel.source.type === 'divider' && panel.id !== panelId && !state.hiddenFaceIds.has(panel.id)) {
          newHiddenFaceIds.add(panel.id);
          newIsolateHiddenFaceIds.add(panel.id);
        }
      }

      // Hide all sub-assemblies and their panels
      const allSubAssemblies = getAllSubAssemblies(rootVoid);
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
      // Get model state from engine (source of truth)
      const modelState = getModelState(state);
      const { config, rootVoid } = modelState;

      const newAssembly: AssemblyConfig = {
        ...config.assembly,
        assemblyAxis: axis,
      };

      // Rebuild the void structure with the new axis
      // Preserve user subdivisions from the main interior
      const userSubdivisions = getUserSubdivisions(rootVoid);
      const newRootVoid = createRootVoidWithInsets(
        config.width,
        config.height,
        config.depth,
        newAssembly,
        userSubdivisions
      );

      return {
        config: {
          ...config,
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
      // Get model state from engine (source of truth)
      const modelState = getModelState(state);
      const { config, rootVoid } = modelState;

      const newInset = direction === 'tabs-in' ? 0 : config.assembly.lids[side].inset;
      const newAssembly: AssemblyConfig = {
        ...config.assembly,
        lids: {
          ...config.assembly.lids,
          [side]: {
            ...config.assembly.lids[side],
            tabDirection: direction,
            // If setting tabs-in and there's an inset, reset inset to 0
            // (tabs-in doesn't work with inset)
            inset: newInset,
          },
        },
      };

      // Rebuild the void structure if inset changed
      const userSubdivisions = getUserSubdivisions(rootVoid);
      const newRootVoid = createRootVoidWithInsets(
        config.width,
        config.height,
        config.depth,
        newAssembly,
        userSubdivisions
      );

      return {
        config: {
          ...config,
          assembly: newAssembly,
        },
        rootVoid: newRootVoid,
        panelsDirty: true,  // Mark panels as needing regeneration
      };
    }),

  /**
   * @deprecated Lid inset is deprecated. Use push-pull adjust mode instead.
   * See docs/lid-analysis.md for details on the deprecation.
   */
  setLidInset: (side, inset) =>
    set((state) => {
      console.warn('setLidInset is deprecated. Use push-pull adjust mode instead.');
      // Get model state from engine (source of truth)
      const modelState = getModelState(state);
      const { config, rootVoid } = modelState;

      const newInset = Math.max(0, inset);
      const newAssembly: AssemblyConfig = {
        ...config.assembly,
        lids: {
          ...config.assembly.lids,
          [side]: {
            ...config.assembly.lids[side],
            inset: newInset,
            // If setting inset > 0, force tabs-out (tabs-in doesn't work with inset)
            tabDirection: newInset > 0 ? 'tabs-out' : config.assembly.lids[side].tabDirection,
          },
        },
      };

      // Rebuild the void structure with the new insets
      // Preserve user subdivisions from the main interior
      const userSubdivisions = getUserSubdivisions(rootVoid);
      const newRootVoid = createRootVoidWithInsets(
        config.width,
        config.height,
        config.depth,
        newAssembly,
        userSubdivisions
      );

      return {
        config: {
          ...config,
          assembly: newAssembly,
        },
        rootVoid: newRootVoid,
        // Clear selection when void structure changes
        selectedVoidIds: new Set<string>(),
        selectedPanelIds: new Set<string>(),
        panelsDirty: true,
      };
    }),

  setFeetConfig: (feetConfig) =>
    set((state) => {
      // Ensure engine is initialized
      ensureEngine();

      // Convert store feet config to engine format
      const engineFeetConfig = feetConfig ? {
        enabled: feetConfig.enabled,
        height: feetConfig.height,
        width: feetConfig.width,
        inset: feetConfig.inset,
        gap: 0, // Engine expects gap field
      } : null;

      // Dispatch to engine
      const result = dispatchToEngine({
        type: 'SET_FEET_CONFIG',
        targetId: 'main-assembly',
        payload: engineFeetConfig,
      });

      if (!result.success || !result.snapshot) {
        // Fallback to local update if dispatch failed
        // Get model state from engine (source of truth)
        const modelState = getModelState(state);
        const { config } = modelState;

        return {
          config: {
            ...config,
            assembly: {
              ...config.assembly,
              feet: feetConfig,
            },
          },
          panelsDirty: true,
        };
      }

      return {
        config: result.snapshot.config,
        panelsDirty: true,
      };
    }),

  setFaceOffset: (faceId, offset, mode) =>
    set((state) => {
      // Get model state from engine (source of truth)
      const modelState = getModelState(state);
      const { config, rootVoid } = modelState;

      // Both modes resize the bounding box, but differ in how children are handled
      let newWidth = config.width;
      let newHeight = config.height;
      let newDepth = config.depth;

      // Calculate new dimensions
      switch (faceId) {
        case 'front':
        case 'back':
          newDepth = Math.max(config.materialThickness * 3, config.depth + offset);
          break;
        case 'left':
        case 'right':
          newWidth = Math.max(config.materialThickness * 3, config.width + offset);
          break;
        case 'top':
        case 'bottom':
          newHeight = Math.max(config.materialThickness * 3, config.height + offset);
          break;
      }

      const newConfig = {
        ...config,
        width: newWidth,
        height: newHeight,
        depth: newDepth,
      };

      // Calculate new root bounds
      const newRootBounds: Bounds = { x: 0, y: 0, z: 0, w: newWidth, h: newHeight, d: newDepth };

      if (mode === 'scale') {
        // Scale mode: Scale all children proportionally
        const scaleX = newWidth / config.width;
        const scaleY = newHeight / config.height;
        const scaleZ = newDepth / config.depth;

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
          ...scaleVoidBounds(rootVoid),
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

        const deltaW = newWidth - config.width;
        const deltaH = newHeight - config.height;
        const deltaD = newDepth - config.depth;

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
              if (v.bounds.x + v.bounds.w >= config.width - 0.1) {
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
              if (v.bounds.y + v.bounds.h >= config.height - 0.1) {
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
              if (v.bounds.z + v.bounds.d >= config.depth - 0.1) {
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
          ...adjustVoidBounds(rootVoid),
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
      // Get model state from engine (source of truth)
      const modelState = getModelState(state);
      const { config, faces, rootVoid } = modelState;

      // Make the outer face open and create a divider at the inset position
      // This creates a new subdivision at the inset depth

      // First, toggle the face to open
      const newFaces = faces.map(f =>
        f.id === faceId ? { ...f, solid: false } : f
      );

      // Determine the axis and position for the new divider
      let axis: 'x' | 'y' | 'z';
      let position: number;

      switch (faceId) {
        case 'front':
          axis = 'z';
          position = config.depth - insetAmount;
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
          position = config.width - insetAmount;
          break;
        case 'top':
          axis = 'y';
          position = config.height - insetAmount;
          break;
        case 'bottom':
          axis = 'y';
          position = insetAmount;
          break;
      }

      // Create the subdivision in the root void
      const mt = config.materialThickness;
      const halfMt = mt / 2;
      const { width, height, depth } = config;

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
        ...rootVoid,
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
      };
    }),

  // Assembly config actions for sub-assemblies
  setSubAssemblyAxis: (subAssemblyId, axis) =>
    set((state) => {
      // Ensure engine is initialized
      ensureEngine();

      // Dispatch to engine
      const result = dispatchToEngine({
        type: 'SET_SUB_ASSEMBLY_AXIS',
        targetId: 'main-assembly',
        payload: { subAssemblyId, axis },
      });

      if (!result.success || !result.snapshot) {
        // Fallback to local update if dispatch failed
        // Get model state from engine (source of truth)
        const modelState = getModelState(state);
        const { rootVoid } = modelState;

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
          rootVoid: updateSubAssemblyInVoid(rootVoid),
          panelsDirty: true,
        };
      }

      return {
        rootVoid: result.snapshot.rootVoid,
        panelsDirty: true,
      };
    }),

  setSubAssemblyLidTabDirection: (subAssemblyId, side, direction) =>
    set((state) => {
      // Ensure engine is initialized
      ensureEngine();

      // Dispatch to engine
      const result = dispatchToEngine({
        type: 'SET_SUB_ASSEMBLY_LID_TAB_DIRECTION',
        targetId: 'main-assembly',
        payload: { subAssemblyId, side, tabDirection: direction },
      });

      if (!result.success || !result.snapshot) {
        // Fallback to local update if dispatch failed
        // Get model state from engine (source of truth)
        const modelState = getModelState(state);
        const { rootVoid } = modelState;

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
          rootVoid: updateSubAssemblyInVoid(rootVoid),
          panelsDirty: true,
        };
      }

      return {
        rootVoid: result.snapshot.rootVoid,
        panelsDirty: true,
      };
    }),

  /**
   * @deprecated Lid inset is deprecated. Use push-pull adjust mode instead.
   * See docs/lid-analysis.md for details on the deprecation.
   */
  setSubAssemblyLidInset: (subAssemblyId, side, inset) =>
    set((state) => {
      console.warn('setSubAssemblyLidInset is deprecated. Use push-pull adjust mode instead.');
      // Get model state from engine (source of truth)
      const modelState = getModelState(state);
      const { rootVoid } = modelState;

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
        rootVoid: updateSubAssemblyInVoid(rootVoid),
        panelsDirty: true,
      };
    }),

  // Panel path actions
  // Note: Panels are now generated by the engine and accessed via useEnginePanels() hook.
  // This action ensures the engine is initialized and updates store.panelCollection for backward compatibility.
  generatePanels: () => {
    // Ensure engine has an assembly
    ensureEngine();

    // Force engine to regenerate panels from its nodes
    const engine = getEngine();
    const collection = engine.generatePanelsFromNodes();

    // Update store's panelCollection for backward compatibility
    set({ panelCollection: collection, panelsDirty: false });
  },

  // Legacy panel actions - these are deprecated and will be removed
  // The engine now owns panel state, use useEnginePanels() hook instead

  addPanelHole: (_panelId: string, _hole: PanelHole) => {
    console.warn('addPanelHole is deprecated - engine now owns panel state');
  },

  removePanelHole: (_panelId: string, _holeId: string) => {
    console.warn('removePanelHole is deprecated - engine now owns panel state');
  },

  addAugmentation: (_augmentation: PanelAugmentation) => {
    console.warn('addAugmentation is deprecated - engine now owns panel state');
  },

  removeAugmentation: (_augmentationId: string) => {
    console.warn('removeAugmentation is deprecated - engine now owns panel state');
  },

  togglePanelVisibility: (panelId: string) =>
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

      // Ensure engine is initialized
      ensureEngine();

      // Dispatch the edge extension update to the engine
      const engine = getEngine();
      dispatchToEngine({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: { panelId, edge, value },
      });

      // Regenerate panels from engine nodes
      const collection = engine.generatePanelsFromNodes();

      return {
        panelCollection: collection,
      };
    }),

  setDividerPosition: (subdivisionId, newPosition) =>
    set((state) => {
      // Get model state from engine (source of truth)
      const modelState = getModelState(state);
      const mt = modelState.config.materialThickness;
      const rootVoid = modelState.rootVoid;

      // The subdivision ID is like "abc123-split", the void ID is "abc123"
      const voidId = subdivisionId.replace('-split', '');

      // Find the void that has this split position
      const targetVoid = findVoid(rootVoid, voidId);
      if (!targetVoid || !targetVoid.splitPosition || !targetVoid.splitAxis) {
        return state;
      }

      // Find the parent to get sibling voids
      const parent = findParent(rootVoid, voidId);
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

      const newRootVoid = updateVoidPosition(rootVoid);

      // Regenerate panels
      const collection = generatePanelCollection(
        modelState.faces,
        newRootVoid,
        modelState.config,
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
      // Get model state from engine (source of truth)
      const modelState = getModelState(state);
      const rootVoid = modelState.rootVoid;

      // The subdivision ID is like "abc123-split", the void ID is "abc123"
      const voidId = subdivisionId.replace('-split', '');

      // Find the void that has this split position
      const targetVoid = findVoid(rootVoid, voidId);
      if (!targetVoid || !targetVoid.splitPosition || !targetVoid.splitAxis) {
        return state;
      }

      // Find the parent to calculate percentage if switching to percentage mode
      const parent = findParent(rootVoid, voidId);
      if (!parent) return state;

      const axis = targetVoid.splitAxis;
      const parentStart = getBoundsStart(parent.bounds, axis);
      const parentSize = getBoundsSize(parent.bounds, axis);

      // Calculate percentage from current position
      const percentage = (targetVoid.splitPosition - parentStart) / parentSize;

      // Update the void in the tree
      const newRootVoid = VoidTree.update(rootVoid, voidId, (v) => ({
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

    // Initialize engine with loaded config (not defaults)
    // This ensures the engine matches the loaded state
    syncStoreToEngine(loaded.config, loaded.faces, loaded.rootVoid);

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
    // Read from engine (source of truth) instead of store state
    const engineSnapshot = getEngineSnapshot();
    if (!engineSnapshot) return;

    // Get panels from engine to collect edge extensions
    const engine = getEngine();
    const panelCollection = engine.generatePanelsFromNodes();

    const edgeExtensions: Record<string, EdgeExtensions> = {};
    for (const panel of panelCollection.panels) {
      if (panel.edgeExtensions &&
          (panel.edgeExtensions.top !== 0 ||
           panel.edgeExtensions.bottom !== 0 ||
           panel.edgeExtensions.left !== 0 ||
           panel.edgeExtensions.right !== 0)) {
        edgeExtensions[panel.id] = panel.edgeExtensions;
      }
    }

    const projectState: ProjectState = {
      config: engineSnapshot.config,
      faces: engineSnapshot.faces,
      rootVoid: engineSnapshot.rootVoid,
      edgeExtensions,
    };

    saveStateToUrl(projectState);
  },

  getShareableUrl: () => {
    // Read from engine (source of truth) instead of store state
    const engineSnapshot = getEngineSnapshot();
    if (!engineSnapshot) return '';

    // Get panels from engine to collect edge extensions
    const engine = getEngine();
    const panelCollection = engine.generatePanelsFromNodes();

    const edgeExtensions: Record<string, EdgeExtensions> = {};
    for (const panel of panelCollection.panels) {
      if (panel.edgeExtensions &&
          (panel.edgeExtensions.top !== 0 ||
           panel.edgeExtensions.bottom !== 0 ||
           panel.edgeExtensions.left !== 0 ||
           panel.edgeExtensions.right !== 0)) {
        edgeExtensions[panel.id] = panel.edgeExtensions;
      }
    }

    const projectState: ProjectState = {
      config: engineSnapshot.config,
      faces: engineSnapshot.faces,
      rootVoid: engineSnapshot.rootVoid,
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

  // ==========================================================================
  // Operation Actions - Unified operation system
  // ==========================================================================

  startOperation: (operationId: OperationId) =>
    set((state) => {
      const operation = getOperation(operationId);

      // For parameter operations, start engine preview
      if (operationHasPreview(operationId)) {
        const engine = getEngine();
        engine.startPreview();
      }

      return {
        operationState: {
          activeOperation: operationId,
          phase: 'active',
          params: {},
        },
      };
    }),

  updateOperationParams: (params: Record<string, unknown>) => {
    // Track whether engine state changed so we can notify AFTER store update
    let engineStateChanged = false;

    set((state) => {
      const { activeOperation } = state.operationState;
      if (!activeOperation) return state;

      const newParams = { ...state.operationState.params, ...params };
      const engine = getEngine();
      const operation = getOperation(activeOperation);

      // Use registry-defined preview action creator if available
      if (operation.createPreviewAction) {
        // Build context for operations that need it (e.g., push-pull needs dimensions)
        const snapshot = engine.getSnapshot();
        const assembly = snapshot.children?.[0];
        const context = assembly
          ? { dimensions: { width: assembly.props.width, height: assembly.props.height, depth: assembly.props.depth } }
          : undefined;

        const action = operation.createPreviewAction(newParams, context);
        if (action) {
          // Restart preview to get fresh clone
          // Note: Panel IDs are stable across clones (cached on VoidNode), so no remapping needed
          engine.discardPreview();
          engine.startPreview();
          engine.dispatch(action, { preview: true });
          engineStateChanged = true;
        }
      }

      return {
        operationState: {
          ...state.operationState,
          params: newParams,
        },
      };
    });

    // Notify React AFTER store update completes, so components see
    // both updated engine state AND updated store state (remapped selection)
    if (engineStateChanged) {
      notifyEngineStateChanged();
    }
  },

  applyOperation: () => {
    // Track whether engine state changed so we can notify AFTER store update
    let engineStateChanged = false;

    set((state) => {
      const { activeOperation } = state.operationState;
      if (!activeOperation) return state;

      // For parameter operations, commit the preview
      if (operationHasPreview(activeOperation)) {
        const engine = getEngine();
        engine.commitPreview();

        // Sync engine state back to store so future operations use the committed state
        const engineSnapshot = getEngineSnapshot();
        if (engineSnapshot) {
          // Mark that engine state changed (notify AFTER set() completes)
          engineStateChanged = true;

          // Panel IDs are stable across preview/commit (cached on VoidNode),
          // so no remapping needed - keep selectedPanelIds as-is
          return {
            config: engineSnapshot.config,
            faces: engineSnapshot.faces,
            rootVoid: engineSnapshot.rootVoid,
            operationState: INITIAL_OPERATION_STATE,
            selectedPanelIds: state.selectedPanelIds,
            panelsDirty: true,
          };
        }
      }

      return {
        operationState: INITIAL_OPERATION_STATE,
        panelsDirty: true,
      };
    });

    // Notify React AFTER store update completes
    if (engineStateChanged) {
      notifyEngineStateChanged();
    }
  },

  cancelOperation: () => {
    // Track whether engine state changed so we can notify AFTER store update
    let engineStateChanged = false;

    set((state) => {
      const { activeOperation } = state.operationState;
      if (!activeOperation) return state;

      // For parameter operations, discard the preview
      if (operationHasPreview(activeOperation)) {
        const engine = getEngine();
        engine.discardPreview();
        // Mark that engine state changed (notify AFTER set() completes)
        engineStateChanged = true;
      }

      return {
        operationState: INITIAL_OPERATION_STATE,
      };
    });

    // Notify React AFTER store update completes
    if (engineStateChanged) {
      notifyEngineStateChanged();
    }
  },
}));
