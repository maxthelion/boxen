import { StateCreator } from 'zustand';
import { EditorTool } from '../../types';
import { CornerEligibility, AllCornerEligibility, AllCornerId } from '../../engine/types';

// =============================================================================
// Tool Slice - Editor tool selection and corner selection for 2D/3D editing
// =============================================================================

export interface ToolSlice {
  // State
  activeTool: EditorTool;
  selectedCornerIds: Set<string>;  // Format: "panelId:corner" e.g. "uuid:left:top" (4 outer corners)
  hoveredCorner: string | null;    // Format: "panelId:corner"
  selectedAllCornerIds: Set<string>;  // Format: "panelId:cornerId" e.g. "uuid:outline:5" (any corner in geometry)
  hoveredAllCorner: string | null;    // Format: "panelId:cornerId"

  // Actions
  setActiveTool: (tool: EditorTool) => void;
  selectCorner: (cornerId: string, addToSelection?: boolean) => void;
  selectCorners: (cornerIds: string[]) => void;
  clearCornerSelection: () => void;
  selectPanelCorners: (panelId: string, cornerEligibility: CornerEligibility[], additive?: boolean) => void;
  setHoveredCorner: (cornerId: string | null) => void;
  // All-corners fillet actions
  selectAllCorner: (panelId: string, cornerId: AllCornerId, addToSelection?: boolean) => void;
  selectAllCorners: (cornerKeys: string[]) => void;  // Format: "panelId:cornerId"
  clearAllCornerSelection: () => void;
  selectPanelAllCorners: (panelId: string, allCornerEligibility: AllCornerEligibility[], additive?: boolean) => void;
  setHoveredAllCorner: (cornerKey: string | null) => void;
}

export const createToolSlice: StateCreator<ToolSlice, [], [], ToolSlice> = (set) => ({
  // Initial state
  activeTool: 'select',
  selectedCornerIds: new Set<string>(),
  hoveredCorner: null,
  selectedAllCornerIds: new Set<string>(),
  hoveredAllCorner: null,

  // Actions
  setActiveTool: (tool) =>
    set({
      activeTool: tool,
      // Clear corner selection when switching tools
      selectedCornerIds: new Set<string>(),
      hoveredCorner: null,
      selectedAllCornerIds: new Set<string>(),
      hoveredAllCorner: null,
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
  selectPanelCorners: (panelId: string, cornerEligibility: CornerEligibility[], additive = false) =>
    set((state) => {
      // Only add eligible corners to the selection
      const eligibleCornerKeys = cornerEligibility
        .filter(e => e.eligible)
        .map(e => `${panelId}:${e.corner}`);

      if (additive) {
        // Shift-click: Check if this panel's corners are already selected - if so, deselect them
        const panelCornersSelected = eligibleCornerKeys.every(key => state.selectedCornerIds.has(key));
        if (panelCornersSelected && eligibleCornerKeys.length > 0) {
          // Toggle off - remove this panel's corners
          const newSet = new Set(state.selectedCornerIds);
          for (const key of eligibleCornerKeys) {
            newSet.delete(key);
          }
          return { selectedCornerIds: newSet };
        }
        // Add to existing selection
        const newSet = new Set([...state.selectedCornerIds, ...eligibleCornerKeys]);
        return { selectedCornerIds: newSet };
      }

      // Non-additive: Replace selection with this panel's corners
      return { selectedCornerIds: new Set(eligibleCornerKeys) };
    }),

  setHoveredCorner: (cornerId: string | null) =>
    set({ hoveredCorner: cornerId }),

  // All-corners fillet actions
  selectAllCorner: (panelId: string, cornerId: AllCornerId, addToSelection = false) =>
    set((state) => {
      const cornerKey = `${panelId}:${cornerId}`;
      if (addToSelection) {
        const newSet = new Set(state.selectedAllCornerIds);
        if (newSet.has(cornerKey)) {
          newSet.delete(cornerKey);
        } else {
          newSet.add(cornerKey);
        }
        return { selectedAllCornerIds: newSet };
      } else {
        return { selectedAllCornerIds: new Set([cornerKey]) };
      }
    }),

  selectAllCorners: (cornerKeys: string[]) =>
    set({ selectedAllCornerIds: new Set(cornerKeys) }),

  clearAllCornerSelection: () =>
    set({ selectedAllCornerIds: new Set<string>() }),

  // Select all eligible corners for a panel (for fillet-all tool)
  selectPanelAllCorners: (panelId: string, allCornerEligibility: AllCornerEligibility[], additive = false) =>
    set((state) => {
      // Only add eligible corners to the selection
      const eligibleCornerKeys = allCornerEligibility
        .filter(e => e.eligible)
        .map(e => `${panelId}:${e.id}`);

      if (additive) {
        // Shift-click: Check if this panel's corners are already selected - if so, deselect them
        const panelCornersSelected = eligibleCornerKeys.every(key => state.selectedAllCornerIds.has(key));
        if (panelCornersSelected && eligibleCornerKeys.length > 0) {
          // Toggle off - remove this panel's corners
          const newSet = new Set(state.selectedAllCornerIds);
          for (const key of eligibleCornerKeys) {
            newSet.delete(key);
          }
          return { selectedAllCornerIds: newSet };
        }
        // Add to existing selection
        const newSet = new Set([...state.selectedAllCornerIds, ...eligibleCornerKeys]);
        return { selectedAllCornerIds: newSet };
      }

      // Non-additive: Replace selection with this panel's corners
      return { selectedAllCornerIds: new Set(eligibleCornerKeys) };
    }),

  setHoveredAllCorner: (cornerKey: string | null) =>
    set({ hoveredAllCorner: cornerKey }),
});
