import { create } from 'zustand';
import { createAllSolidFaces, INITIAL_OPERATION_STATE } from '../types';

// Import all slices
import { createConfigSlice, ConfigSlice } from './slices/configSlice';
import { createSelectionSlice, SelectionSlice } from './slices/selectionSlice';
import { createEdgeSelectionSlice, EdgeSelectionSlice } from './slices/edgeSelectionSlice';
import { createVisibilitySlice, VisibilitySlice } from './slices/visibilitySlice';
import { createVoidSlice, VoidSlice } from './slices/voidSlice';
import { createSubAssemblySlice, SubAssemblySlice } from './slices/subAssemblySlice';
import { createPanelSlice, PanelSlice } from './slices/panelSlice';
import { createViewSlice, ViewSlice } from './slices/viewSlice';
import { createToolSlice, ToolSlice } from './slices/toolSlice';
import { createOperationSlice, OperationSlice } from './slices/operationSlice';
import { createUrlSlice, UrlSlice } from './slices/urlSlice';

// Import helpers for re-export
import { createSimpleRootVoid } from './helpers/voidFactory';
import { defaultConfig } from './initialState';

// =============================================================================
// Combined Store Type
// =============================================================================

export type BoxStore = ConfigSlice &
  SelectionSlice &
  EdgeSelectionSlice &
  VisibilitySlice &
  VoidSlice &
  SubAssemblySlice &
  PanelSlice &
  ViewSlice &
  ToolSlice &
  OperationSlice &
  UrlSlice;

// =============================================================================
// Create the Store
// =============================================================================

export const useBoxStore = create<BoxStore>()((...a) => ({
  // Spread slices - order matters for initial state
  ...createConfigSlice(...a),
  ...createSelectionSlice(...a),
  ...createEdgeSelectionSlice(...a),
  ...createVisibilitySlice(...a),
  ...createVoidSlice(...a),
  ...createSubAssemblySlice(...a),
  ...createPanelSlice(...a),
  ...createViewSlice(...a),
  ...createToolSlice(...a),
  ...createOperationSlice(...a),
  ...createUrlSlice(...a),

  // Override initial state that slices don't set correctly
  config: defaultConfig,
  faces: createAllSolidFaces(),
  rootVoid: createSimpleRootVoid(100, 100, 100),
  operationState: INITIAL_OPERATION_STATE,
}));

// =============================================================================
// Re-export helpers for backward compatibility
// =============================================================================

// Void factory helpers
export { getMainInteriorVoid } from './helpers/voidFactory';

// Void bounds helpers
export {
  getLeafVoids,
  isVoidVisible,
  isSubAssemblyVisible,
} from './helpers/voidBounds';

// Panel lookup helpers
export {
  buildDividerPanelLookup,
  getDividerPanelId,
  getAllDividerPanelIdsFromEngine,
} from './helpers/panelLookup';

// Selection helpers
export {
  getAssemblyIdForPanel,
  computeVisuallySelectedPanelIds,
  isPanelSelectedIn3DView,
  getAllSubdivisions,
  type ActualSelection,
} from './helpers/selection';

// Re-export from VoidTree for backwards compatibility
import { VoidTree } from '../utils/voidTree';
export const findVoid = VoidTree.find;
export const getVoidSubtreeIds = VoidTree.getSubtreeIds;
export const getVoidAncestorIds = VoidTree.getAncestorIds;
export const getAllSubAssemblies = VoidTree.getAllSubAssemblies;

// Re-export bounds helpers for external use
export { getBoundsStart, getBoundsSize, setBoundsRegion, calculateChildRegionBounds, calculatePreviewPositions } from '../utils/bounds';
