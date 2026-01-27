/**
 * useEngine - React hook for the OO model engine
 *
 * This hook:
 * - Creates and maintains an engine instance
 * - Syncs store state to the engine
 * - Provides engine snapshot for rendering
 *
 * Phase 2: Engine mirrors store state (store is still source of truth)
 * Phase 3: Engine becomes source of truth, store is derived
 */

import { useMemo, useEffect } from 'react';
import { Engine } from './Engine';
import { getEngine, syncStoreToEngine } from './engineInstance';
import { useBoxStore } from '../store/useBoxStore';
import { SceneSnapshot } from './types';

/**
 * Hook to access the engine and its snapshot
 */
export function useEngine() {
  // Get singleton engine instance
  const engine = getEngine();

  // Get store state
  const config = useBoxStore((s) => s.config);
  const faces = useBoxStore((s) => s.faces);

  // Sync store state to engine when it changes
  useEffect(() => {
    syncStoreToEngine(config, faces);
  }, [config, faces]);

  // Get snapshot (memoized based on engine dirty state)
  const snapshot = useMemo<SceneSnapshot>(() => {
    return engine.getSnapshot();
  }, [engine, config, faces]); // Recompute when config/faces change

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
