// Re-export all helpers
export {
  getModelState,
  type ModelState,
} from './modelState';

export {
  createSimpleRootVoid,
  createRootVoidWithInsets,
  getMainInteriorVoid,
  getUserSubdivisions,
} from './voidFactory';

export {
  recalculateVoidBounds,
  getLeafVoids,
  isVoidVisible,
  isSubAssemblyVisible,
} from './voidBounds';

export {
  buildDividerPanelLookup,
  getDividerPanelId,
  getAllDividerPanelIdsFromEngine,
} from './panelLookup';

export {
  getAssemblyIdForPanel,
  computeVisuallySelectedPanelIds,
  isPanelSelectedIn3DView,
  getAllSubdivisions,
  type ActualSelection,
} from './selection';
