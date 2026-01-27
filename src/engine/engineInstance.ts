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
import { Face, BoxConfig } from '../types';

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
 */
export function syncStoreToEngine(config: BoxConfig, faces: Face[]): void {
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
  }
}
