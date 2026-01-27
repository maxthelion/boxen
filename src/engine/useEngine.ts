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

import { useRef, useMemo, useEffect } from 'react';
import { Engine, createEngine } from './Engine';
import { useBoxStore } from '../store/useBoxStore';
import { SceneSnapshot, MaterialConfig, FeetConfig } from './types';

/**
 * Hook to access the engine and its snapshot
 */
export function useEngine() {
  // Create engine once
  const engineRef = useRef<Engine | null>(null);
  if (!engineRef.current) {
    engineRef.current = createEngine();
  }
  const engine = engineRef.current;

  // Get store state
  const config = useBoxStore((s) => s.config);
  const faces = useBoxStore((s) => s.faces);

  // Sync store state to engine
  useEffect(() => {
    const material: MaterialConfig = {
      thickness: config.materialThickness,
      fingerWidth: config.fingerWidth,
      fingerGap: config.fingerGap,
    };

    // If no assembly exists, create one
    if (!engine.assembly) {
      const assembly = engine.createAssembly(
        config.width,
        config.height,
        config.depth,
        material
      );

      // Sync face configurations
      for (const face of faces) {
        assembly.setFaceSolid(face.id, face.solid);
      }

      // Sync assembly config
      assembly.setAssemblyAxis(config.assembly.assemblyAxis);
      assembly.setLidConfig('positive', config.assembly.lids.positive);
      assembly.setLidConfig('negative', config.assembly.lids.negative);

      if (config.assembly.feet) {
        // Convert from store FeetConfig to engine FeetConfig
        const engineFeet: FeetConfig = {
          enabled: config.assembly.feet.enabled,
          height: config.assembly.feet.height,
          inset: config.assembly.feet.inset,
          gap: 0, // Not in store type, default to 0
        };
        assembly.setFeet(engineFeet);
      }
    } else {
      // Update existing assembly
      const assembly = engine.assembly;

      // Update dimensions
      assembly.setDimensions({
        width: config.width,
        height: config.height,
        depth: config.depth,
      });

      // Update material
      assembly.setMaterial(material);

      // Update faces
      for (const face of faces) {
        assembly.setFaceSolid(face.id, face.solid);
      }

      // Update assembly config
      assembly.setAssemblyAxis(config.assembly.assemblyAxis);
      assembly.setLidConfig('positive', config.assembly.lids.positive);
      assembly.setLidConfig('negative', config.assembly.lids.negative);

      if (config.assembly.feet) {
        // Convert from store FeetConfig to engine FeetConfig
        const engineFeet: FeetConfig = {
          enabled: config.assembly.feet.enabled,
          height: config.assembly.feet.height,
          inset: config.assembly.feet.inset,
          gap: 0, // Not in store type, default to 0
        };
        assembly.setFeet(engineFeet);
      } else {
        assembly.setFeet(null);
      }
    }
  }, [engine, config, faces]);

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
  const engineRef = useRef<Engine | null>(null);
  if (!engineRef.current) {
    engineRef.current = createEngine();
  }
  return engineRef.current;
}
