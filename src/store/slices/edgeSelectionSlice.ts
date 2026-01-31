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
  selectPanelEdges: (panelId: string, edgeStatuses: EdgeStatusInfo[], additive?: boolean) => void;
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

  selectPanelEdges: (panelId, edgeStatuses, additive = false) =>
    set((state) => {
      // Filter to non-locked edges and create edge keys
      const eligibleEdgeKeys = edgeStatuses
        .filter(s => s.status !== 'locked')
        .map(s => `${panelId}:${s.position}`);

      if (additive) {
        // Shift-click: Check if this panel's edges are already selected - if so, deselect them
        const panelEdgesSelected = eligibleEdgeKeys.every(key => state.selectedEdges.has(key));
        if (panelEdgesSelected && eligibleEdgeKeys.length > 0) {
          // Toggle off - remove this panel's edges
          const newSet = new Set(state.selectedEdges);
          for (const key of eligibleEdgeKeys) {
            newSet.delete(key);
          }
          return { selectedEdges: newSet };
        }
        // Add to existing selection
        const newSet = new Set([...state.selectedEdges, ...eligibleEdgeKeys]);
        return { selectedEdges: newSet };
      }

      // Non-additive: Replace selection with this panel's edges
      return {
        selectedEdges: new Set(eligibleEdgeKeys),
        selectedVoidIds: new Set<string>(),
        selectedPanelIds: new Set<string>(),
        selectedSubAssemblyIds: new Set<string>(),
        selectedAssemblyId: null,
      };
    }),

  setHoveredEdge: (panelId, edge) =>
    set({ hoveredEdge: panelId && edge ? `${panelId}:${edge}` : null }),
});
