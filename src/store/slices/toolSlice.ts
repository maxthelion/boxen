import { StateCreator } from 'zustand';
import { EditorTool } from '../../types';

// =============================================================================
// Tool Slice - Editor tool selection and corner selection for 2D editing
// =============================================================================

export interface ToolSlice {
  // State
  activeTool: EditorTool;
  selectedCornerIds: Set<string>;

  // Actions
  setActiveTool: (tool: EditorTool) => void;
  selectCorner: (cornerId: string, addToSelection?: boolean) => void;
  selectCorners: (cornerIds: string[]) => void;
  clearCornerSelection: () => void;
}

export const createToolSlice: StateCreator<ToolSlice, [], [], ToolSlice> = (set) => ({
  // Initial state
  activeTool: 'select',
  selectedCornerIds: new Set<string>(),

  // Actions
  setActiveTool: (tool) =>
    set({
      activeTool: tool,
      // Clear corner selection when switching tools
      selectedCornerIds: new Set<string>(),
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
});
