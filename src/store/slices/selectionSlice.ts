import { StateCreator } from 'zustand';
import { SelectionMode, SubAssemblyPreview, EditorTool } from '../../types';
import { getOperation, getOperationForTool } from '../../operations';

// =============================================================================
// Selection Slice - Void, panel, assembly, and sub-assembly selection
// =============================================================================

export interface SelectionSlice {
  // State
  selectionMode: SelectionMode;
  selectedVoidIds: Set<string>;
  selectedSubAssemblyIds: Set<string>;
  selectedPanelIds: Set<string>;
  selectedAssemblyId: string | null;
  // Hover state
  hoveredVoidId: string | null;
  hoveredPanelId: string | null;
  hoveredAssemblyId: string | null;
  subAssemblyPreview: SubAssemblyPreview | null;

  // Actions
  setSelectionMode: (mode: SelectionMode) => void;
  selectVoid: (voidId: string | null, additive?: boolean) => void;
  selectPanel: (panelId: string | null, additive?: boolean) => void;
  selectAssembly: (assemblyId: string | null) => void;
  selectSubAssembly: (subAssemblyId: string | null, additive?: boolean) => void;
  clearSelection: () => void;
  setHoveredVoid: (voidId: string | null) => void;
  setHoveredPanel: (panelId: string | null) => void;
  setHoveredAssembly: (assemblyId: string | null) => void;
  setSubAssemblyPreview: (preview: SubAssemblyPreview | null) => void;
}

// Type for full store state needed by this slice
type FullStoreState = SelectionSlice & {
  selectedEdges: Set<string>;
  activeTool: EditorTool;
};

export const createSelectionSlice: StateCreator<
  FullStoreState,
  [],
  [],
  SelectionSlice
> = (set) => ({
  // Initial state
  selectionMode: null,
  selectedVoidIds: new Set<string>(),
  selectedSubAssemblyIds: new Set<string>(),
  selectedPanelIds: new Set<string>(),
  selectedAssemblyId: null,
  hoveredVoidId: null,
  hoveredPanelId: null,
  hoveredAssemblyId: null,
  subAssemblyPreview: null,

  // Actions
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
      // Check if active tool requires edge selection - if so, preserve edges
      const opId = getOperationForTool(state.activeTool);
      const preserveEdges = opId && getOperation(opId).selectionType === 'edge';
      return {
        selectedPanelIds: newSet,
        selectedVoidIds: new Set<string>(),
        selectedSubAssemblyIds: new Set<string>(),
        selectedEdges: preserveEdges ? state.selectedEdges : new Set<string>(),
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

  setSubAssemblyPreview: (preview) =>
    set({ subAssemblyPreview: preview }),
});
