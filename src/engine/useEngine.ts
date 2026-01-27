/**
 * useEngine - React hook for the OO model engine
 *
 * This hook provides access to the engine instance and snapshot.
 * Note: Store actions now handle syncing to engine, so this hook
 * just provides read access.
 */

import { Engine } from './Engine';
import { getEngine } from './engineInstance';
import { useEngineState } from './useEngineState';
import { SceneSnapshot } from './types';

/**
 * Hook to access the engine and its snapshot
 */
export function useEngine() {
  // Get singleton engine instance
  const engine = getEngine();

  // Get snapshot from engine state (already cached and reactive)
  const state = useEngineState();
  const snapshot: SceneSnapshot = state?.snapshot ?? engine.getSnapshot();

  return {
    engine,
    snapshot,
  };
}

/**
 * Hook to just get the engine instance (for dispatching actions)
 */
export function useEngineInstance(): Engine {
  return getEngine();
}
