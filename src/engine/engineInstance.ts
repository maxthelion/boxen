/**
 * Engine Instance - Singleton engine for the application
 *
 * This module provides a single engine instance that can be used by:
 * - useEngine hook (for React components)
 * - useBoxStore (for panel generation)
 *
 * This avoids circular dependencies between the hook and store.
 */

import { Engine, createEngine } from './Engine';
import { MaterialConfig, FeetConfig } from './types';
import { Face, BoxConfig, Void } from '../types';
import { syncVoidNodeFromStoreVoid, voidNodeToVoid } from './panelBridge';

// Singleton engine instance
let engineInstance: Engine | null = null;

/**
 * Get the singleton engine instance
 * Creates it on first access
 */
export function getEngine(): Engine {
  if (!engineInstance) {
    engineInstance = createEngine();
  }
  return engineInstance;
}

/**
 * Reset the engine instance (useful for testing)
 */
export function resetEngine(): void {
  engineInstance = null;
}

/**
 * Sync store state to engine
 * Called before panel generation to ensure engine is up to date
 *
 * @param config - Box configuration
 * @param faces - Face configurations
 * @param rootVoid - Optional void tree to sync (if provided, syncs void structure)
 */
export function syncStoreToEngine(config: BoxConfig, faces: Face[], rootVoid?: Void): void {
  const engine = getEngine();

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
      const engineFeet: FeetConfig = {
        enabled: config.assembly.feet.enabled,
        height: config.assembly.feet.height,
        inset: config.assembly.feet.inset,
        gap: 0,
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
      const engineFeet: FeetConfig = {
        enabled: config.assembly.feet.enabled,
        height: config.assembly.feet.height,
        inset: config.assembly.feet.inset,
        gap: 0,
      };
      assembly.setFeet(engineFeet);
    } else {
      assembly.setFeet(null);
    }

    // Sync void tree if provided
    if (rootVoid) {
      syncVoidNodeFromStoreVoid(assembly.rootVoid, rootVoid, config.materialThickness);
    }
  }
}

/**
 * Get the current void tree from engine as a store Void
 * Useful for reading engine's void state after modifications
 */
export function getEngineVoidTree(): Void | null {
  const engine = getEngine();
  const assembly = engine.assembly;
  if (!assembly) return null;
  return voidNodeToVoid(assembly.rootVoid);
}

/**
 * Ensure the engine has an assembly initialized
 * Call this before dispatching actions to the engine
 *
 * @param config - Box configuration (used to create assembly if needed)
 * @param faces - Face configurations
 * @param rootVoid - Optional void tree to sync
 */
export function ensureEngineInitialized(config: BoxConfig, faces: Face[], rootVoid?: Void): void {
  syncStoreToEngine(config, faces, rootVoid);
}

/**
 * Get the current box config from engine
 * Returns null if engine has no assembly
 */
export function getEngineConfig(): BoxConfig | null {
  const engine = getEngine();
  const assembly = engine.assembly;
  if (!assembly) return null;

  const assemblyConfig = assembly.assemblyConfig;

  return {
    width: assembly.width,
    height: assembly.height,
    depth: assembly.depth,
    materialThickness: assembly.material.thickness,
    fingerWidth: assembly.material.fingerWidth,
    fingerGap: assembly.material.fingerGap,
    assembly: {
      assemblyAxis: assemblyConfig.assemblyAxis,
      lids: {
        positive: {
          enabled: true,
          tabDirection: assemblyConfig.lids.positive.tabDirection,
          inset: assemblyConfig.lids.positive.inset,
        },
        negative: {
          enabled: true,
          tabDirection: assemblyConfig.lids.negative.tabDirection,
          inset: assemblyConfig.lids.negative.inset,
        },
      },
      feet: assembly.feet ? {
        enabled: assembly.feet.enabled,
        height: assembly.feet.height,
        width: 20, // Default width, not stored in engine
        inset: assembly.feet.inset,
      } : undefined,
    },
  };
}

/**
 * Get the current faces from engine
 * Returns null if engine has no assembly
 */
export function getEngineFaces(): Face[] | null {
  const engine = getEngine();
  const assembly = engine.assembly;
  if (!assembly) return null;

  const faceIds = ['front', 'back', 'left', 'right', 'top', 'bottom'] as const;
  return faceIds.map(id => ({
    id,
    solid: assembly.isFaceSolid(id),
  }));
}

// =============================================================================
// Unified State Snapshot
// =============================================================================

/**
 * Complete engine state in store-compatible format
 */
export interface EngineStateSnapshot {
  config: BoxConfig;
  faces: Face[];
  rootVoid: Void;
}

/**
 * Result of dispatching an action to the engine
 */
export interface DispatchResult {
  success: boolean;
  snapshot: EngineStateSnapshot | null;
}

/**
 * Get the complete engine state as a store-compatible snapshot
 * Returns null if engine has no assembly
 */
export function getEngineSnapshot(): EngineStateSnapshot | null {
  const config = getEngineConfig();
  const faces = getEngineFaces();
  const rootVoid = getEngineVoidTree();

  if (!config || !faces || !rootVoid) return null;

  return { config, faces, rootVoid };
}

/**
 * Dispatch an action to the engine and return the updated state
 * This is the primary interface for store → engine communication
 *
 * @param action - The engine action to dispatch
 * @returns DispatchResult with success flag and updated state snapshot
 */
export function dispatchToEngine(action: import('./types').EngineAction): DispatchResult {
  const engine = getEngine();
  const success = engine.dispatch(action);

  if (!success) {
    return { success: false, snapshot: null };
  }

  const snapshot = getEngineSnapshot();
  return { success: true, snapshot };
}
