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
import { MaterialConfig, FeetConfig, AssemblySnapshot, VoidSnapshot } from './types';
import { Face, BoxConfig, Void, PanelPath } from '../types';
import { syncVoidNodeFromStoreVoid, voidNodeToVoid } from './panelBridge';
import {
  notifyEngineStateChanged,
  voidSnapshotToVoid,
  assemblySnapshotToConfig,
  faceConfigsToFaces,
} from './useEngineState';

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

// Default configuration for new assemblies
const DEFAULT_CONFIG = {
  width: 100,
  height: 100,
  depth: 100,
  materialThickness: 3,
  fingerWidth: 10,
  fingerGap: 1.5,
};

/**
 * Ensure the engine has an assembly, creating one with defaults if needed.
 * This is the new initialization approach that doesn't require store state.
 *
 * Returns the engine for chaining.
 */
export function ensureEngine(): Engine {
  const engine = getEngine();

  // If no assembly exists, create one with default config
  if (!engine.assembly) {
    const material: MaterialConfig = {
      thickness: DEFAULT_CONFIG.materialThickness,
      fingerWidth: DEFAULT_CONFIG.fingerWidth,
      fingerGap: DEFAULT_CONFIG.fingerGap,
    };

    engine.createAssembly(
      DEFAULT_CONFIG.width,
      DEFAULT_CONFIG.height,
      DEFAULT_CONFIG.depth,
      material
    );
  }

  return engine;
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
 * @param existingPanels - Optional existing panels to sync edge extensions from
 */
export function syncStoreToEngine(
  config: BoxConfig,
  faces: Face[],
  rootVoid?: Void,
  existingPanels?: PanelPath[]
): void {
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
        width: config.assembly.feet.width,
        inset: config.assembly.feet.inset,
        gap: 0,
      };
      assembly.setFeet(engineFeet);
    }

    // Sync edge extensions from existing panels (on first creation)
    if (existingPanels) {
      for (const panel of existingPanels) {
        if (panel.edgeExtensions) {
          assembly.setPanelEdgeExtensions(panel.id, panel.edgeExtensions);
        }
      }
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
        width: config.assembly.feet.width,
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

    // Sync edge extensions from existing panels
    if (existingPanels) {
      for (const panel of existingPanels) {
        if (panel.edgeExtensions) {
          assembly.setPanelEdgeExtensions(panel.id, panel.edgeExtensions);
        }
      }
    }
  }

  // Notify React components that engine state changed
  notifyEngineStateChanged();
}

/**
 * Get the current void tree from engine as a store Void
 *
 * @deprecated Use getEngineSnapshot().rootVoid instead.
 * This function accesses live nodes directly, which doesn't align with the
 * OO architecture where React should only see serialized snapshots.
 * Kept for backward compatibility but getEngineSnapshot() now uses
 * the snapshot-based conversion path.
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
 * @param existingPanels - Optional existing panels to sync edge extensions from
 */
export function ensureEngineInitialized(
  config: BoxConfig,
  faces: Face[],
  rootVoid?: Void,
  existingPanels?: PanelPath[]
): void {
  syncStoreToEngine(config, faces, rootVoid, existingPanels);
}

/**
 * Get the current box config from engine
 *
 * @deprecated Use getEngineSnapshot().config instead.
 * This function accesses live nodes directly, which doesn't align with the
 * OO architecture where React should only see serialized snapshots.
 * Kept for backward compatibility but getEngineSnapshot() now uses
 * the snapshot-based conversion path.
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
 *
 * @deprecated Use getEngineSnapshot().faces instead.
 * This function accesses live nodes directly, which doesn't align with the
 * OO architecture where React should only see serialized snapshots.
 * Kept for backward compatibility but getEngineSnapshot() now uses
 * the snapshot-based conversion path.
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
 * Uses the snapshot-based conversion path (aligned with OO architecture)
 * Returns null if engine has no assembly
 */
export function getEngineSnapshot(): EngineStateSnapshot | null {
  const engine = getEngine();
  const sceneSnapshot = engine.getSnapshot();
  const assemblySnapshot = sceneSnapshot.children[0] as AssemblySnapshot | undefined;

  if (!assemblySnapshot) return null;

  const rootVoidSnapshot = assemblySnapshot.children.find(
    (c): c is VoidSnapshot => c.kind === 'void'
  );

  if (!rootVoidSnapshot) return null;

  // Use snapshot-based converters (same ones used by useEngineState hooks)
  return {
    config: assemblySnapshotToConfig(assemblySnapshot),
    faces: faceConfigsToFaces(assemblySnapshot.props.faces),
    rootVoid: voidSnapshotToVoid(rootVoidSnapshot),
  };
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

  // Notify React components that engine state changed
  notifyEngineStateChanged();

  const snapshot = getEngineSnapshot();
  return { success: true, snapshot };
}
