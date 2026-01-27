/**
 * Panel Bridge - Converts between engine types and store types
 *
 * This module provides:
 * - Void tree conversion (VoidNode ↔ Void)
 * - Panel snapshot conversion (PanelSnapshot → PanelPath)
 * - Engine-first panel generation
 */

import {
  Void,
  PanelCollection,
  PanelPath,
  PanelSource,
  PanelHole as StorePanelHole,
} from '../types';
import { AssemblyNode } from './nodes/AssemblyNode';
import { VoidNode } from './nodes/VoidNode';
import { PanelSnapshot, FacePanelSnapshot, DividerPanelSnapshot } from './types';

// =============================================================================
// Void Tree Conversion
// =============================================================================

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
