import {
  BoxState,
  BoxConfig,
  Void,
  SelectionMode,
  ViewMode,
  EditorTool,
  BoxActions,
  defaultAssemblyConfig,
  createAllSolidFaces,
  INITIAL_OPERATION_STATE,
} from '../types';

// =============================================================================
// Initial State Values
// =============================================================================

export const defaultConfig: BoxConfig = {
  width: 100,
  height: 100,
  depth: 100,
  materialThickness: 3,
  fingerWidth: 10,
  fingerGap: 1.5, // Corner gap as multiplier of fingerWidth
  assembly: defaultAssemblyConfig,
};

// Create a simple root void without lid inset considerations
export const createSimpleRootVoid = (width: number, height: number, depth: number): Void => ({
  id: 'root',
  bounds: { x: 0, y: 0, z: 0, w: width, h: height, d: depth },
  children: [],
});

export const initialState: Omit<BoxState, keyof BoxActions> = {
  config: defaultConfig,
  faces: createAllSolidFaces(),
  rootVoid: createSimpleRootVoid(100, 100, 100),
  selectionMode: null as SelectionMode,
  selectedVoidIds: new Set<string>(),
  selectedSubAssemblyIds: new Set<string>(),
  selectedPanelIds: new Set<string>(),
  selectedAssemblyId: null,
  // Hover state
  hoveredVoidId: null,
  hoveredPanelId: null,
  hoveredAssemblyId: null,
  subAssemblyPreview: null,
  hiddenVoidIds: new Set<string>(),
  isolatedVoidId: null,
  isolateHiddenVoidIds: new Set<string>(),
  hiddenSubAssemblyIds: new Set<string>(),
  isolatedSubAssemblyId: null,
  isolateHiddenSubAssemblyIds: new Set<string>(),
  hiddenFaceIds: new Set<string>(),
  isolatedPanelId: null,
  isolateHiddenFaceIds: new Set<string>(),
  showDebugAnchors: false,
  // 2D Sketch View state
  viewMode: '3d' as ViewMode,
  sketchPanelId: null,
  // Tool state
  activeTool: 'select' as EditorTool,
  selectedCornerIds: new Set<string>(),
  // Edge selection state (for inset/outset tool)
  selectedEdges: new Set<string>(),
  hoveredEdge: null as string | null,
  // Operation state
  operationState: INITIAL_OPERATION_STATE,
};
