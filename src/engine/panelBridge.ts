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
  PanelSource,
  PanelHole as StorePanelHole,
  AssemblyConfig as StoreAssemblyConfig,
} from '../types';
import { AssemblyNode } from './nodes/AssemblyNode';
import { VoidNode } from './nodes/VoidNode';
import { SceneNode } from './nodes/SceneNode';
import { FaceId, PanelSnapshot, FacePanelSnapshot, DividerPanelSnapshot } from './types';

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
 * Used when engine is source of truth and store needs to read void state.
 */
export function voidNodeToVoid(voidNode: VoidNode): Void {
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
 * Sync engine VoidNode tree from store Void tree
 * Used when store is source of truth (current state during migration).
 *
 * This recursively updates the engine's void tree to match the store's void tree,
 * preserving node structure but updating bounds and split info.
 */
export function syncVoidNodeFromStoreVoid(
  voidNode: VoidNode,
  storeVoid: Void,
  materialThickness: number
): void {
  // Update bounds
  voidNode.setBounds({
    x: storeVoid.bounds.x,
    y: storeVoid.bounds.y,
    z: storeVoid.bounds.z,
    w: storeVoid.bounds.w,
    h: storeVoid.bounds.h,
    d: storeVoid.bounds.d,
  });

  // Update split info if present
  if (storeVoid.splitAxis) {
    voidNode.setSplitInfo({
      axis: storeVoid.splitAxis,
      position: storeVoid.splitPosition!,
      mode: storeVoid.splitPositionMode || 'percentage',
      percentage: storeVoid.splitPercentage,
    });
  }

  // Handle children - this is complex because we need to sync the tree structure
  const storeChildren = storeVoid.children || [];
  const engineVoidChildren = voidNode.getVoidChildren();

  // If store has children but engine doesn't (or different count), rebuild
  if (storeChildren.length !== engineVoidChildren.length) {
    // Clear existing children
    voidNode.clearSubdivision();

    // Create new children if store has them
    if (storeChildren.length > 0) {
      // Extract split positions from children (children after first have split info)
      const positions: number[] = [];
      const axis = storeChildren[1]?.splitAxis;

      if (axis) {
        for (let i = 1; i < storeChildren.length; i++) {
          const pos = storeChildren[i].splitPosition;
          if (pos !== undefined) {
            positions.push(pos);
          }
        }

        if (positions.length > 0) {
          // Use subdivideMultiple to create matching structure
          const newChildren = voidNode.subdivideMultiple(axis, positions, materialThickness);

          // Recursively sync each child
          for (let i = 0; i < storeChildren.length; i++) {
            syncVoidNodeFromStoreVoid(newChildren[i], storeChildren[i], materialThickness);
          }
        }
      }
    }
  } else if (storeChildren.length > 0) {
    // Same number of children - recursively sync each
    for (let i = 0; i < storeChildren.length; i++) {
      syncVoidNodeFromStoreVoid(engineVoidChildren[i], storeChildren[i], materialThickness);
    }
  }

  // TODO: Handle sub-assemblies
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

// =============================================================================
// Engine Panel Snapshot to Store PanelPath Conversion
// =============================================================================

/**
 * Convert an engine PanelSnapshot to a store PanelPath
 * This allows the engine to generate panels directly without panelGenerator.ts
 */
export function panelSnapshotToPanelPath(snapshot: PanelSnapshot): PanelPath {
  const { id, kind, props, derived } = snapshot;

  // Build source based on panel kind
  let source: PanelSource;
  if (kind === 'face-panel') {
    const faceSnapshot = snapshot as FacePanelSnapshot;
    source = {
      type: 'face',
      faceId: faceSnapshot.props.faceId,
    };
  } else {
    const dividerSnapshot = snapshot as DividerPanelSnapshot;
    source = {
      type: 'divider',
      subdivisionId: dividerSnapshot.props.voidId,
      axis: dividerSnapshot.props.axis,
    };
  }

  // Convert engine PanelHole[] to store PanelHole[]
  const holes: StorePanelHole[] = derived.outline.holes.map(hole => {
    // Map engine source type to store HoleType
    const holeType = hole.source.type === 'custom' ? 'custom' : 'slot';

    // Map engine source type to store source type
    const sourceTypeMap: Record<string, 'divider-slot' | 'lid-slot' | 'extension-slot' | 'decorative' | 'functional'> = {
      'divider-slot': 'divider-slot',
      'sub-assembly-slot': 'divider-slot', // Sub-assembly slots are similar to divider slots
      'custom': 'decorative',
    };

    return {
      id: hole.id,
      type: holeType,
      path: {
        points: hole.path,
        closed: true,
      },
      source: {
        type: sourceTypeMap[hole.source.type] || 'functional',
        sourceId: hole.source.sourceId,
      },
    };
  });

  return {
    id,
    source,
    outline: {
      points: derived.outline.points,
      closed: true,
    },
    holes,
    width: derived.width,
    height: derived.height,
    thickness: derived.thickness,
    position: derived.worldTransform.position,
    rotation: derived.worldTransform.rotation,
    visible: props.visible,
    edgeExtensions: props.edgeExtensions,
  };
}

/**
 * Generate panels using engine nodes directly (without panelGenerator.ts)
 * This is the new engine-first approach.
 */
export function generatePanelsFromEngine(assembly: AssemblyNode): PanelCollection {
  // Get all panel snapshots from the assembly
  const panelSnapshots = assembly.getPanels();

  // Convert to store PanelPath format
  const panels = panelSnapshots.map(panelSnapshotToPanelPath);

  return {
    panels,
    augmentations: [],
    generatedAt: Date.now(),
  };
}

/**
 * Generate panels using engine for entire scene
 */
export function generatePanelsFromEngineScene(scene: SceneNode): PanelCollection {
  const allPanels: PanelPath[] = [];

  for (const assembly of scene.assemblies) {
    const collection = generatePanelsFromEngine(assembly);
    allPanels.push(...collection.panels);
  }

  return {
    panels: allPanels,
    augmentations: [],
    generatedAt: Date.now(),
  };
}
