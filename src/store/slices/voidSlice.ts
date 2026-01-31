import { StateCreator } from 'zustand';
import { Void, BoxConfig, Face } from '../../types';
import { ensureEngine, getEngine, dispatchToEngine } from '../../engine';
import { VoidTree } from '../../utils/voidTree';
import { getModelState } from '../helpers/modelState';
import { createRootVoidWithInsets } from '../helpers/voidFactory';

const findParent = VoidTree.findParent;

// =============================================================================
// Void Slice - Void removal, reset, and purge actions
// =============================================================================

export interface VoidSlice {
  // Actions
  removeVoid: (voidId: string) => void;
  resetVoids: () => void;
  purgeVoid: (voidId: string) => void;
}

// Type for full store state needed by this slice
type FullStoreState = VoidSlice & {
  config: BoxConfig;
  faces: Face[];
  rootVoid: Void;
  selectedVoidIds: Set<string>;
  selectedSubAssemblyIds: Set<string>;
  selectedPanelIds: Set<string>;
  selectedAssemblyId: string | null;
  hiddenVoidIds: Set<string>;
  isolatedVoidId: string | null;
  isolateHiddenVoidIds: Set<string>;
  hiddenSubAssemblyIds: Set<string>;
  isolatedSubAssemblyId: string | null;
  isolateHiddenSubAssemblyIds: Set<string>;
  hiddenFaceIds: Set<string>;
  isolatedPanelId: string | null;
  isolateHiddenFaceIds: Set<string>;
  panelsDirty?: boolean;
};

export const createVoidSlice: StateCreator<
  FullStoreState,
  [],
  [],
  VoidSlice
> = (set) => ({
  // Actions
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
});
