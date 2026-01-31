import { StateCreator } from 'zustand';
import { Void, BoxConfig, Face, FaceId, Bounds, SplitPositionMode, PanelCollection } from '../../types';
import { ensureEngine, getEngine, dispatchToEngine, notifyEngineStateChanged, getEngineSnapshot } from '../../engine';
import { VoidTree } from '../../utils/voidTree';
import { getModelState } from '../helpers/modelState';
import { getBoundsStart, getBoundsSize, setBoundsRegion } from '../../utils/bounds';
import { generatePanelCollection } from '../../utils/panelGenerator';

const findVoid = VoidTree.find;
const findParent = VoidTree.findParent;

// =============================================================================
// Panel Slice - Panel generation, face toggling, and divider manipulation
// =============================================================================

export interface PanelSlice {
  // State
  panelCollection?: PanelCollection;
  panelsDirty?: boolean;

  // Actions
  toggleFace: (faceId: FaceId) => void;
  generatePanels: () => void;
  togglePanelVisibility: (panelId: string) => void;
  setEdgeExtension: (panelId: string, edge: 'top' | 'bottom' | 'left' | 'right', value: number) => void;
  setDividerPosition: (subdivisionId: string, newPosition: number) => void;
  setDividerPositionMode: (subdivisionId: string, mode: SplitPositionMode) => void;
}

// Type for full store state needed by this slice
type FullStoreState = PanelSlice & {
  config: BoxConfig;
  faces: Face[];
  rootVoid: Void;
  operationState: import('../../types').OperationState;
};

export const createPanelSlice: StateCreator<
  FullStoreState,
  [],
  [],
  PanelSlice
> = (set) => ({
  // Initial state
  panelCollection: undefined,
  panelsDirty: false,

  // Actions
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

        // Get updated faces from engine snapshot
        const snapshot = getEngineSnapshot();
        if (!snapshot) return state;
        return {
          faces: snapshot.faces,
        };
      }

      // No active operation - dispatch normally
      const result = dispatchToEngine(action);

      if (!result.success || !result.snapshot) {
        // Fallback to local update if dispatch failed
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

  generatePanels: () => {
    // Ensure engine has an assembly
    ensureEngine();

    // Force engine to regenerate panels from its nodes
    const engine = getEngine();
    const collection = engine.generatePanelsFromNodes();

    // Update store's panelCollection for backward compatibility
    set({ panelCollection: collection, panelsDirty: false });
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
          // This is the parent - update its children
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
              updatedChildren = recalculateNestedBounds(child.children, newBounds, child.splitAxis, mt);
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
      const recalculateNestedBounds = (children: Void[], parentBounds: Bounds, splitAxis?: 'x' | 'y' | 'z', matThickness?: number): Void[] => {
        const matT = matThickness ?? mt;
        if (!splitAxis || children.length === 0) return children;

        const dimStart = getBoundsStart(parentBounds, splitAxis);
        const dimEnd = dimStart + getBoundsSize(parentBounds, splitAxis);

        return children.map((child, idx) => {
          // Calculate region for this child
          const regionStart = idx === 0
            ? dimStart
            : (children[idx - 1].splitPosition ?? dimStart) + matT / 2;

          const regionEnd = child.splitPosition
            ? child.splitPosition - matT / 2
            : dimEnd;

          const regionSize = regionEnd - regionStart;
          const newBounds = setBoundsRegion(parentBounds, splitAxis, regionStart, regionSize);

          // Recursively update this child's children
          const updatedChildren = child.children.length > 0
            ? recalculateNestedBounds(child.children, newBounds, child.splitAxis, matT)
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
});
