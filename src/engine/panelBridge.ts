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
  SubAssembly,
  PanelCollection,
  PanelPath,
  PanelSource,
  PanelHole as StorePanelHole,
  defaultFaceOffsets,
  FaceConfig,
  BoxConfig,
} from '../types';
import { AssemblyNode } from './nodes/AssemblyNode';
import { VoidNode } from './nodes/VoidNode';
import { SubAssemblyNode } from './nodes/SubAssemblyNode';
import { PanelSnapshot, FacePanelSnapshot, DividerPanelSnapshot } from './types';
import { debug, enableDebugTag } from '../utils/debug';
import { calculateSafeSpace } from './safeSpace';

// Enable debug tags
enableDebugTag('panel-gen');
enableDebugTag('sub-assembly');

// =============================================================================
// Void Tree Conversion
// =============================================================================

/**
 * Convert engine VoidNode tree to store Void tree
 * Used when engine is source of truth and store needs to read void state.
 */
export function voidNodeToVoid(voidNode: VoidNode): Void {
  const bounds = voidNode.bounds;

  debug('sub-assembly', `voidNodeToVoid: Converting void ${voidNode.id}`);
  debug('sub-assembly', `  hasSubAssembly: ${voidNode.hasSubAssembly}`);
  debug('sub-assembly', `  children count: ${voidNode.children.length}`);
  debug('sub-assembly', `  children kinds: ${voidNode.children.map(c => c.kind).join(', ')}`);

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

  // Add grid subdivision info if present
  if (voidNode.gridSubdivision) {
    storeVoid.gridSubdivision = voidNode.gridSubdivision;
  }

  // Convert children
  for (const child of voidNode.children) {
    if (child instanceof VoidNode) {
      storeVoid.children.push(voidNodeToVoid(child));
    }
  }

  // Convert sub-assembly if present
  const subAssemblyNode = voidNode.getSubAssembly();
  debug('sub-assembly', `  getSubAssembly() returned: ${subAssemblyNode ? subAssemblyNode.id : 'null'}`);

  if (subAssemblyNode && subAssemblyNode instanceof SubAssemblyNode) {
    debug('sub-assembly', `  Converting sub-assembly ${subAssemblyNode.id}`);
    storeVoid.subAssembly = subAssemblyNodeToSubAssembly(subAssemblyNode);
    debug('sub-assembly', `  storeVoid.subAssembly set: ${!!storeVoid.subAssembly}`);
  }

  return storeVoid;
}

/**
 * Convert engine SubAssemblyNode to store SubAssembly
 */
function subAssemblyNodeToSubAssembly(node: SubAssemblyNode): SubAssembly {
  const engineConfig = node.assemblyConfig;

  return {
    id: node.id,
    clearance: node.clearance,
    faceOffsets: { ...defaultFaceOffsets }, // Sub-assemblies don't currently support per-face offsets
    faces: node.getFaces().map(f => ({ id: f.id, solid: f.solid })),
    rootVoid: voidNodeToVoid(node.rootVoid),
    materialThickness: node.material.thickness,
    assembly: {
      assemblyAxis: engineConfig.assemblyAxis,
      lids: {
        positive: {
          enabled: true,  // Sub-assemblies have solid lids by default
          tabDirection: engineConfig.lids.positive.tabDirection,
          inset: engineConfig.lids.positive.inset,
        },
        negative: {
          enabled: true,
          tabDirection: engineConfig.lids.negative.tabDirection,
          inset: engineConfig.lids.negative.inset,
        },
      },
    },
  };
}

/**
 * Helper to sync only children/grandchildren without re-syncing splitInfo.
 * Used after subdivideMultiple/subdivideGrid which already set splitInfo correctly.
 */
function syncVoidChildrenOnly(
  voidNode: VoidNode,
  storeVoid: Void,
  materialThickness: number
): void {
  // Only sync nested children if the store void has them
  if (storeVoid.children && storeVoid.children.length > 0) {
    // If the store child has children, we need to recursively sync them
    const engineChildren = voidNode.getVoidChildren();
    if (engineChildren.length === storeVoid.children.length) {
      for (let i = 0; i < storeVoid.children.length; i++) {
        syncVoidNodeFromStoreVoid(engineChildren[i], storeVoid.children[i], materialThickness);
      }
    }
  }
  // TODO: Handle sub-assemblies
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
      // Check if this is a grid subdivision (multi-axis)
      if (storeVoid.gridSubdivision) {
        // Use subdivideGrid for multi-axis subdivisions
        const gridAxes = storeVoid.gridSubdivision.axes.map(axis => ({
          axis,
          positions: storeVoid.gridSubdivision!.positions[axis] || [],
        }));

        voidNode.subdivideGrid(gridAxes, materialThickness);

        // Recursively sync grandchildren only (subdivideGrid handles the immediate structure)
        const newChildren = voidNode.getVoidChildren();
        for (let i = 0; i < Math.min(storeChildren.length, newChildren.length); i++) {
          syncVoidChildrenOnly(newChildren[i], storeChildren[i], materialThickness);
        }
      } else {
        // Single-axis subdivision: extract split positions from children
        // Note: splitAxis/splitPosition are stored on the FIRST child (index 0)
        const positions: number[] = [];
        const axis = storeChildren[0]?.splitAxis;

        if (axis) {
          // Collect positions from all children that have splitPosition
          for (const child of storeChildren) {
            const pos = child.splitPosition;
            if (pos !== undefined) {
              positions.push(pos);
            }
          }

          if (positions.length > 0) {
            // Use subdivideMultiple to create matching structure
            // This already sets splitInfo correctly on children[1+]
            const newChildren = voidNode.subdivideMultiple(axis, positions, materialThickness);

            // Recursively sync grandchildren only (not splitInfo, as subdivideMultiple handled it)
            for (let i = 0; i < storeChildren.length; i++) {
              syncVoidChildrenOnly(newChildren[i], storeChildren[i], materialThickness);
            }
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
      subAssemblyId: faceSnapshot.props.assemblyId,
    };
  } else {
    const dividerSnapshot = snapshot as DividerPanelSnapshot;
    source = {
      type: 'divider',
      subdivisionId: dividerSnapshot.props.voidId,
      axis: dividerSnapshot.props.axis,
      position: dividerSnapshot.props.position,
    };
  }

  // Convert engine PanelHole[] to store PanelHole[]
  const holes: StorePanelHole[] = derived.outline.holes.map(hole => {
    // Map engine source type to store HoleType
    const holeType = (hole.source.type === 'custom' || hole.source.type === 'cutout') ? 'custom' : 'slot';

    // Map engine source type to store source type
    const sourceTypeMap: Record<string, 'divider-slot' | 'lid-slot' | 'extension-slot' | 'decorative' | 'functional'> = {
      'divider-slot': 'divider-slot',
      'sub-assembly-slot': 'divider-slot', // Sub-assembly slots are similar to divider slots
      'extension-slot': 'extension-slot',
      'cutout': 'decorative',  // User cutouts are decorative holes
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

  // Convert engine EdgeStatusInfo to store EdgeStatusInfo
  const edgeStatuses = derived.edgeStatuses?.map(status => ({
    position: status.position as 'top' | 'bottom' | 'left' | 'right',
    status: status.status as 'locked' | 'outward-only' | 'unlocked',
    adjacentFaceId: status.adjacentFaceId,
  }));

  // Pass through corner eligibility from engine
  const cornerEligibility = derived.cornerEligibility;
  const allCornerEligibility = derived.allCornerEligibility;

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
    edgeStatuses,
    cornerEligibility,
    allCornerEligibility,
    customEdgePaths: props.customEdgePaths,
  };
}

/**
 * Generate panels using engine nodes directly (without panelGenerator.ts)
 * This is the new engine-first approach.
 */
export function generatePanelsFromEngine(assembly: AssemblyNode): PanelCollection {
  // Get all panel snapshots from the assembly
  const panelSnapshots = assembly.getPanels();
  const subdivisions = assembly.getSubdivisions();

  // Debug: Log panel generation details
  debug('panel-gen', `=== Panel Generation ===`);
  debug('panel-gen', `Assembly: ${assembly.width}x${assembly.height}x${assembly.depth}, mt=${assembly.material.thickness}`);
  debug('panel-gen', `Subdivisions: ${subdivisions.length}`);
  for (const sub of subdivisions) {
    const b = sub.bounds;
    debug('panel-gen', `  Sub: ${sub.id} (${sub.axis}-axis at ${sub.position}) bounds=[${b.x.toFixed(1)},${b.y.toFixed(1)},${b.z.toFixed(1)} ${b.w.toFixed(1)}x${b.h.toFixed(1)}x${b.d.toFixed(1)}]`);
  }
  debug('panel-gen', `Total panels: ${panelSnapshots.length}`);

  for (const snapshot of panelSnapshots) {
    const holesCount = snapshot.derived.outline.holes.length;
    const dims = `${snapshot.derived.width.toFixed(1)}x${snapshot.derived.height.toFixed(1)}`;

    if (snapshot.kind === 'divider-panel') {
      const divSnapshot = snapshot as DividerPanelSnapshot;
      debug('panel-gen', `  DIVIDER: ${snapshot.id} (${divSnapshot.props.axis}-axis at ${divSnapshot.props.position}) dims=${dims} holes=${holesCount}`);
    } else {
      const faceSnapshot = snapshot as FacePanelSnapshot;
      debug('panel-gen', `  FACE: ${snapshot.id} (${faceSnapshot.props.faceId}) dims=${dims} holes=${holesCount}`);
    }

    // Log hole details
    for (const hole of snapshot.derived.outline.holes) {
      const pathPoints = hole.path.length;
      debug('panel-gen', `    Hole: ${hole.id} (${hole.source.type}) points=${pathPoints}`);
    }
  }

  // Convert to store PanelPath format
  const panels = panelSnapshots.map(panelSnapshotToPanelPath);

  // Get faces and config for safe space calculation
  const faces: FaceConfig[] = assembly.getFaces().map(f => ({
    id: f.id,
    solid: f.solid,
  }));

  // Build a BoxConfig-compatible object for safe space calculation
  // Note: engine's AssemblyConfig doesn't have 'enabled' on lids, so we add it
  const engineConfig = assembly.assemblyConfig;
  const config: BoxConfig = {
    width: assembly.width,
    height: assembly.height,
    depth: assembly.depth,
    materialThickness: assembly.material.thickness,
    fingerWidth: assembly.material.fingerWidth,
    fingerGap: assembly.material.fingerGap,
    assembly: {
      assemblyAxis: engineConfig.assemblyAxis,
      lids: {
        positive: {
          enabled: true,
          tabDirection: engineConfig.lids.positive.tabDirection,
          inset: engineConfig.lids.positive.inset,
        },
        negative: {
          enabled: true,
          tabDirection: engineConfig.lids.negative.tabDirection,
          inset: engineConfig.lids.negative.inset,
        },
      },
    },
  };

  // Calculate safe space for each panel
  for (const panel of panels) {
    panel.safeSpace = calculateSafeSpace(panel, faces, config);
  }

  return {
    panels,
    augmentations: [],
    generatedAt: Date.now(),
  };
}
