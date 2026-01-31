import { StateCreator } from 'zustand';
import { ViewMode, EditorTool } from '../../types';

// =============================================================================
// View Slice - 2D/3D view mode and sketch view state
// =============================================================================

export interface ViewSlice {
  // State
  viewMode: ViewMode;
  sketchPanelId: string | null;
  showDebugAnchors: boolean;

  // Actions
  setViewMode: (mode: ViewMode) => void;
  enterSketchView: (panelId: string) => void;
  exitSketchView: () => void;
  toggleDebugAnchors: () => void;
}

export const createViewSlice: StateCreator<
  ViewSlice & { activeTool: EditorTool; selectedCornerIds: Set<string>; selectedPanelIds: Set<string>; selectedVoidIds: Set<string>; selectedSubAssemblyIds: Set<string>; selectedAssemblyId: string | null },
  [],
  [],
  ViewSlice
> = (set) => ({
  // Initial state
  viewMode: '3d',
  sketchPanelId: null,
  showDebugAnchors: false,

  // Actions
  setViewMode: (mode) =>
    set({ viewMode: mode }),

  enterSketchView: (panelId) =>
    set({
      viewMode: '2d',
      sketchPanelId: panelId,
      // Select the panel being edited
      selectedPanelIds: new Set([panelId]),
      selectedVoidIds: new Set<string>(),
      selectedSubAssemblyIds: new Set<string>(),
      selectedAssemblyId: null,
    }),

  exitSketchView: () =>
    set({
      viewMode: '3d',
      sketchPanelId: null,
      activeTool: 'select',
      selectedCornerIds: new Set<string>(),
    }),

  toggleDebugAnchors: () =>
    set((state) => ({
      showDebugAnchors: !state.showDebugAnchors,
    })),
});
