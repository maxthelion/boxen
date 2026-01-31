import { StateCreator } from 'zustand';
import { EdgeStatusInfo } from '../../types';

// =============================================================================
// Edge Selection Slice - Edge selection for inset/outset tool
// =============================================================================

export interface EdgeSelectionSlice {
  // State
  selectedEdges: Set<string>;  // Format: "panelId:edge" e.g. "uuid:top"
  hoveredEdge: string | null;  // Format: "panelId:edge"

  // Actions
  selectEdge: (panelId: string, edge: string, additive?: boolean) => void;
  deselectEdge: (panelId: string, edge: string) => void;
  clearEdgeSelection: () => void;
  selectPanelEdges: (panelId: string, edgeStatuses: EdgeStatusInfo[]) => void;
  setHoveredEdge: (panelId: string | null, edge: string | null) => void;
}

// Type for full store state needed by this slice
type FullStoreState = EdgeSelectionSlice & {
  selectedVoidIds: Set<string>;
  selectedPanelIds: Set<string>;
  selectedSubAssemblyIds: Set<string>;
  selectedAssemblyId: string | null;
};

export const createEdgeSelectionSlice: StateCreator<
  FullStoreState,
  [],
  [],
  EdgeSelectionSlice
> = (set) => ({
  // Initial state
  selectedEdges: new Set<string>(),
  hoveredEdge: null,

  // Actions
  selectEdge: (panelId, edge, additive = false) =>
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

  deselectEdge: (panelId, edge) =>
    set((state) => {
      const edgeKey = `${panelId}:${edge}`;
      const newSet = new Set(state.selectedEdges);
      newSet.delete(edgeKey);
      return { selectedEdges: newSet };
    }),

  clearEdgeSelection: () =>
    set({ selectedEdges: new Set<string>() }),

  selectPanelEdges: (panelId, edgeStatuses) =>
    set((state) => {
      // Filter to non-locked edges and create edge keys
      const eligibleEdgeKeys = edgeStatuses
        .filter(s => s.status !== 'locked')
        .map(s => `${panelId}:${s.position}`);

      // Add to existing selection
      const newSet = new Set([...state.selectedEdges, ...eligibleEdgeKeys]);
      return { selectedEdges: newSet };
    }),

  setHoveredEdge: (panelId, edge) =>
    set({ hoveredEdge: panelId && edge ? `${panelId}:${edge}` : null }),
});
