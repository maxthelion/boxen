import { StateCreator } from 'zustand';
import { EditorTool } from '../../types';
import { CornerEligibility } from '../../engine/types';

// =============================================================================
// Tool Slice - Editor tool selection and corner selection for 2D/3D editing
// =============================================================================

export interface ToolSlice {
  // State
  activeTool: EditorTool;
  selectedCornerIds: Set<string>;  // Format: "panelId:corner" e.g. "uuid:left:top"
  hoveredCorner: string | null;    // Format: "panelId:corner"

  // Actions
  setActiveTool: (tool: EditorTool) => void;
  selectCorner: (cornerId: string, addToSelection?: boolean) => void;
  selectCorners: (cornerIds: string[]) => void;
  clearCornerSelection: () => void;
  selectPanelCorners: (panelId: string, cornerEligibility: CornerEligibility[]) => void;
  setHoveredCorner: (cornerId: string | null) => void;
}

export const createToolSlice: StateCreator<ToolSlice, [], [], ToolSlice> = (set) => ({
  // Initial state
  activeTool: 'select',
  selectedCornerIds: new Set<string>(),
  hoveredCorner: null,

  // Actions
  setActiveTool: (tool) =>
    set({
      activeTool: tool,
      // Clear corner selection when switching tools
      selectedCornerIds: new Set<string>(),
      hoveredCorner: null,
    }),

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

  // Select all eligible corners for a panel (for fillet tool)
  selectPanelCorners: (panelId: string, cornerEligibility: CornerEligibility[]) =>
    set((state) => {
      // Only add eligible corners to the selection
      const eligibleCornerKeys = cornerEligibility
        .filter(e => e.eligible)
        .map(e => `${panelId}:${e.corner}`);

      // Add to existing selection
      const newSet = new Set([...state.selectedCornerIds, ...eligibleCornerKeys]);
      return { selectedCornerIds: newSet };
    }),

  setHoveredCorner: (cornerId: string | null) =>
    set({ hoveredCorner: cornerId }),
});
