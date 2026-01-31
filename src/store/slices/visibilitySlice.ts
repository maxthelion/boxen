import { StateCreator } from 'zustand';
import { Void, MAIN_FACE_PANEL_IDS } from '../../types';
import { getEngine } from '../../engine';
import { VoidTree } from '../../utils/voidTree';
import { getModelState } from '../helpers/modelState';

// Re-export from VoidTree for backwards compatibility
const getVoidSubtreeIds = VoidTree.getSubtreeIds;
const getAllSubAssemblies = VoidTree.getAllSubAssemblies;
const findVoid = VoidTree.find;

// =============================================================================
// Visibility Slice - Void, sub-assembly, and panel visibility controls
// =============================================================================

export interface VisibilitySlice {
  // State
  hiddenVoidIds: Set<string>;
  isolatedVoidId: string | null;
  isolateHiddenVoidIds: Set<string>;
  hiddenSubAssemblyIds: Set<string>;
  isolatedSubAssemblyId: string | null;
  isolateHiddenSubAssemblyIds: Set<string>;
  hiddenFaceIds: Set<string>;
  isolatedPanelId: string | null;
  isolateHiddenFaceIds: Set<string>;

  // Actions
  toggleVoidVisibility: (voidId: string) => void;
  setIsolatedVoid: (voidId: string | null) => void;
  toggleSubAssemblyVisibility: (subAssemblyId: string) => void;
  setIsolatedSubAssembly: (subAssemblyId: string | null) => void;
  toggleFaceVisibility: (faceId: string) => void;
  setIsolatedPanel: (panelId: string | null) => void;
}

// Type for full store state needed by this slice
type FullStoreState = VisibilitySlice & {
  config: import('../../types').BoxConfig;
  faces: import('../../types').Face[];
  rootVoid: Void;
};

export const createVisibilitySlice: StateCreator<
  FullStoreState,
  [],
  [],
  VisibilitySlice
> = (set) => ({
  // Initial state
  hiddenVoidIds: new Set<string>(),
  isolatedVoidId: null,
  isolateHiddenVoidIds: new Set<string>(),
  hiddenSubAssemblyIds: new Set<string>(),
  isolatedSubAssemblyId: null,
  isolateHiddenSubAssemblyIds: new Set<string>(),
  hiddenFaceIds: new Set<string>(),
  isolatedPanelId: null,
  isolateHiddenFaceIds: new Set<string>(),

  // Actions
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
});
