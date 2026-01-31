import { BoxConfig, Face, Void } from '../../types';
import { ensureEngine, getEngineSnapshot } from '../../engine';

// =============================================================================
// Model State Access - Engine is Source of Truth
// =============================================================================
//
// During the store-state-migration (Phase 4), we're transitioning from store-owned
// model state to engine-owned state. This helper provides a unified way to access
// model state, preferring engine over store cache.
//
// Usage in actions:
//   const modelState = getModelState(state);
//   const { config, faces, rootVoid } = modelState;
//
// Once migration is complete, store.config/faces/rootVoid will be removed and
// this helper will only read from engine.
// =============================================================================

export interface ModelState {
  config: BoxConfig;
  faces: Face[];
  rootVoid: Void;
}

/**
 * Minimal store state interface required by getModelState
 */
export interface StoreStateWithModel {
  config: BoxConfig;
  faces: Face[];
  rootVoid: Void;
}

/**
 * Get model state from engine (preferred) with fallback to store state.
 * This is used during the transition period where both exist.
 *
 * @param storeState - The current store state (for fallback)
 * @returns Model state from engine if available, otherwise from store
 */
export function getModelState(storeState: StoreStateWithModel): ModelState {
  // Ensure engine is initialized
  ensureEngine();

  // Try to get state from engine (source of truth)
  const engineSnapshot = getEngineSnapshot();
  if (engineSnapshot) {
    return engineSnapshot;
  }

  // Fallback to store state (during transition/initialization)
  return {
    config: storeState.config,
    faces: storeState.faces,
    rootVoid: storeState.rootVoid,
  };
}
