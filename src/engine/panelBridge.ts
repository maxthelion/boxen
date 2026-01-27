/**
 * Panel Bridge - Connects engine to existing panelGenerator
 *
 * This bridge allows the engine to generate panels using the existing
 * panelGenerator.ts logic. It converts between engine types and store types.
 *
 * This is a temporary solution for Phase 3. Eventually, the panel generation
 * logic will be moved into the engine's panel node classes.
 */

import { generatePanelCollection } from '../utils/panelGenerator';
import {
  Face,
  Void,
  BoxConfig,
  PanelCollection,
  PanelPath,
  AssemblyConfig as StoreAssemblyConfig,
} from '../types';
import { AssemblyNode } from './nodes/AssemblyNode';
import { VoidNode } from './nodes/VoidNode';
import { SceneNode } from './nodes/SceneNode';
import { FaceId } from './types';

/**
 * Convert engine AssemblyNode to store BoxConfig
 */
function assemblyToBoxConfig(assembly: AssemblyNode): BoxConfig {
  const material = assembly.material;
  const assemblyConfig = assembly.assemblyConfig;

  // Convert engine AssemblyConfig to store AssemblyConfig
  const storeAssembly: StoreAssemblyConfig = {
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
  };

  // Add feet if present
  if (assembly.feet) {
    storeAssembly.feet = {
      enabled: assembly.feet.enabled,
      height: assembly.feet.height,
      width: 20, // Default width, not in engine type
      inset: assembly.feet.inset,
    };
  }

  return {
    width: assembly.width,
    height: assembly.height,
    depth: assembly.depth,
    materialThickness: material.thickness,
    fingerWidth: material.fingerWidth,
    fingerGap: material.fingerGap,
    assembly: storeAssembly,
  };
}

/**
 * Convert engine AssemblyNode faces to store Face[]
 */
function assemblyToFaces(assembly: AssemblyNode): Face[] {
  const faceIds: FaceId[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];
  return faceIds.map(id => ({
    id,
    solid: assembly.isFaceSolid(id),
  }));
}

/**
 * Convert engine VoidNode tree to store Void tree
 */
function voidNodeToVoid(voidNode: VoidNode): Void {
  const bounds = voidNode.bounds;

  const storeVoid: Void = {
    id: voidNode.id,
    bounds: {
      x: bounds.x,
      y: bounds.y,
      z: bounds.z,
      w: bounds.w,
      h: bounds.h,
      d: bounds.d,
    },
    children: [],
  };

  // Add split info if present
  if (voidNode.splitAxis) {
    storeVoid.splitAxis = voidNode.splitAxis;
    storeVoid.splitPosition = voidNode.splitPosition;
    storeVoid.splitPositionMode = voidNode.splitPositionMode;
    storeVoid.splitPercentage = voidNode.splitPercentage;
  }

  // Convert children
  for (const child of voidNode.children) {
    if (child instanceof VoidNode) {
      storeVoid.children.push(voidNodeToVoid(child));
    }
    // TODO: Handle sub-assemblies in voids
  }

  return storeVoid;
}

/**
 * Generate panels for an assembly using the existing panelGenerator
 */
export function generatePanelsForAssembly(
  assembly: AssemblyNode,
  existingPanels?: PanelPath[]
): PanelCollection {
  const config = assemblyToBoxConfig(assembly);
  const faces = assemblyToFaces(assembly);
  const rootVoid = voidNodeToVoid(assembly.rootVoid);

  return generatePanelCollection(faces, rootVoid, config, 1, existingPanels);
}

/**
 * Generate panels for an assembly using an external void tree
 * This allows the store to provide its rootVoid (with subdivisions)
 * while the engine provides config and faces.
 */
export function generatePanelsWithVoid(
  assembly: AssemblyNode,
  storeRootVoid: Void,
  existingPanels?: PanelPath[]
): PanelCollection {
  const config = assemblyToBoxConfig(assembly);
  const faces = assemblyToFaces(assembly);

  return generatePanelCollection(faces, storeRootVoid, config, 1, existingPanels);
}

/**
 * Generate panels for an entire scene
 */
export function generatePanelsForScene(
  scene: SceneNode,
  existingPanels?: PanelPath[]
): PanelCollection {
  const allPanels: PanelPath[] = [];

  for (const assembly of scene.assemblies) {
    const collection = generatePanelsForAssembly(assembly, existingPanels);
    allPanels.push(...collection.panels);
  }

  return {
    panels: allPanels,
    augmentations: [],
    generatedAt: Date.now(),
  };
}
