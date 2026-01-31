import { StateCreator } from 'zustand';
import { OperationId, OperationState, INITIAL_OPERATION_STATE, BoxConfig, Face, Void } from '../../types';
import { getOperation, operationHasPreview } from '../../operations';
import { getEngine, getEngineSnapshot, notifyEngineStateChanged } from '../../engine';

// =============================================================================
// Operation Slice - Unified operation system for model modifications
// =============================================================================

export interface OperationSlice {
  // State
  operationState: OperationState;

  // Actions
  startOperation: (operationId: OperationId) => void;
  updateOperationParams: (params: Record<string, unknown>) => void;
  applyOperation: () => void;
  cancelOperation: () => void;
}

// Type for full store state needed by this slice
type FullStoreState = OperationSlice & {
  config: BoxConfig;
  faces: Face[];
  rootVoid: Void;
  selectedPanelIds: Set<string>;
  panelsDirty?: boolean;
};

export const createOperationSlice: StateCreator<
  FullStoreState,
  [],
  [],
  OperationSlice
> = (set) => ({
  // Initial state
  operationState: INITIAL_OPERATION_STATE,

  // Actions
  startOperation: (operationId: OperationId) =>
    set(() => {
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
        const assemblyId = newParams.assemblyId as string | undefined;

        // Find the target assembly - either main assembly or a sub-assembly
        let targetAssembly = snapshot.children?.[0]; // Default to main assembly

        if (assemblyId && assemblyId !== 'main-assembly' && targetAssembly) {
          // Look for sub-assembly in the void tree
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const findSubAssembly = (children: any[]): typeof targetAssembly | undefined => {
            for (const child of children || []) {
              // Sub-assemblies have kind: 'sub-assembly' in their snapshot
              if (child.kind === 'sub-assembly' && child.id === assemblyId) {
                return child;
              }
              // Check nested children (voids can contain sub-assemblies)
              if (child.children) {
                const found = findSubAssembly(child.children);
                if (found) return found;
              }
            }
            return undefined;
          };

          // Search within the main assembly's children (voids)
          const subAsm = findSubAssembly(targetAssembly.children);
          if (subAsm) {
            targetAssembly = subAsm;
          }
        }

        const context = targetAssembly
          ? {
              dimensions: { width: targetAssembly.props.width, height: targetAssembly.props.height, depth: targetAssembly.props.depth },
              assemblyId: assemblyId ?? 'main-assembly',
            }
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
});
