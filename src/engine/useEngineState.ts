/**
 * useEngineState - Hook to access engine state for React rendering
 *
 * This hook provides:
 * - Engine model state (config, faces, voids, panels) in store-compatible format
 * - Automatic re-rendering when engine state changes
 * - Type-safe access to engine data
 *
 * This is part of Phase 10: Making React render from engine state instead of store state.
 */

import { useSyncExternalStore } from 'react';
import { getEngine } from './engineInstance';
import { SceneSnapshot, AssemblySnapshot, PanelSnapshot, VoidSnapshot } from './types';
import { BoxConfig, Face, FaceId, FaceConfig, Void, SubAssembly, PanelCollection, PanelPath, defaultFaceOffsets } from '../types';
import { panelSnapshotToPanelPath } from './panelBridge';
import { calculateSafeSpace } from './safeSpace';
import { debug } from '../utils/debug';

// =============================================================================
// Engine State Types
// =============================================================================

/**
 * Engine model state in store-compatible format
 * This is what components will read from instead of useBoxStore
 */
export interface EngineModelState {
  // Box configuration
  config: BoxConfig;
  // Face configurations
  faces: Face[];
  // Void tree (store format)
  rootVoid: Void;
  // Generated panels (store format)
  panelCollection: PanelCollection;
  // Raw engine snapshot (for advanced usage)
  snapshot: SceneSnapshot;
}

// =============================================================================
// Snapshot Conversion Helpers
// =============================================================================

/**
 * Convert engine VoidSnapshot to store Void format
 * Exported for use by getEngineSnapshot() in engineInstance.ts
 */
export function voidSnapshotToVoid(snapshot: VoidSnapshot): Void {
  debug('sub-assembly', `voidSnapshotToVoid: ${snapshot.id}, children: ${snapshot.children.map(c => c.kind).join(', ')}`);

  const storeVoid: Void = {
    id: snapshot.id,
    bounds: {
      x: snapshot.derived.bounds.x,
      y: snapshot.derived.bounds.y,
      z: snapshot.derived.bounds.z,
      w: snapshot.derived.bounds.w,
      h: snapshot.derived.bounds.h,
      d: snapshot.derived.bounds.d,
    },
    splitAxis: snapshot.props.splitAxis,
    splitPosition: snapshot.props.splitPosition,
    splitPositionMode: snapshot.props.splitPositionMode,
    splitPercentage: snapshot.props.splitPercentage,
    gridSubdivision: snapshot.props.gridSubdivision,
    children: snapshot.children
      .filter((c): c is VoidSnapshot => c.kind === 'void')
      .map(voidSnapshotToVoid),
  };

  // Convert sub-assembly if present
  const subAssemblySnapshot = snapshot.children.find(
    (c): c is AssemblySnapshot => c.kind === 'sub-assembly'
  );

  if (subAssemblySnapshot) {
    debug('sub-assembly', `  Found sub-assembly: ${subAssemblySnapshot.id}`);
    storeVoid.subAssembly = assemblySnapshotToSubAssembly(subAssemblySnapshot);
  }

  return storeVoid;
}

/**
 * Convert engine AssemblySnapshot (sub-assembly) to store SubAssembly format
 */
function assemblySnapshotToSubAssembly(snapshot: AssemblySnapshot): SubAssembly {
  const { props } = snapshot;

  // Find the root void in the sub-assembly's children
  const rootVoidSnapshot = snapshot.children.find(
    (c): c is VoidSnapshot => c.kind === 'void'
  );

  if (!rootVoidSnapshot) {
    throw new Error(`Sub-assembly ${snapshot.id} has no root void`);
  }

  return {
    id: snapshot.id,
    clearance: props.clearance ?? 1,
    faceOffsets: { ...defaultFaceOffsets },
    faces: props.faces.map(f => ({ id: f.id, solid: f.solid })),
    rootVoid: voidSnapshotToVoid(rootVoidSnapshot),
    materialThickness: props.material.thickness,
    assembly: {
      assemblyAxis: props.assembly.assemblyAxis,
      lids: {
        positive: {
          enabled: true,
          tabDirection: props.assembly.lids.positive.tabDirection,
          inset: props.assembly.lids.positive.inset,
        },
        negative: {
          enabled: true,
          tabDirection: props.assembly.lids.negative.tabDirection,
          inset: props.assembly.lids.negative.inset,
        },
      },
    },
  };
}

/**
 * Convert engine AssemblySnapshot to store-compatible BoxConfig
 * Exported for use by getEngineSnapshot() in engineInstance.ts
 */
export function assemblySnapshotToConfig(snapshot: AssemblySnapshot): BoxConfig {
  const { props } = snapshot;
  return {
    width: props.width,
    height: props.height,
    depth: props.depth,
    materialThickness: props.material.thickness,
    fingerWidth: props.material.fingerWidth,
    fingerGap: props.material.fingerGap,
    assembly: {
      assemblyAxis: props.assembly.assemblyAxis,
      lids: {
        positive: {
          enabled: true,
          tabDirection: props.assembly.lids.positive.tabDirection,
          inset: props.assembly.lids.positive.inset,
        },
        negative: {
          enabled: true,
          tabDirection: props.assembly.lids.negative.tabDirection,
          inset: props.assembly.lids.negative.inset,
        },
      },
      feet: props.feet ? {
        enabled: props.feet.enabled,
        height: props.feet.height,
        width: 20, // Default, not in engine
        inset: props.feet.inset,
      } : undefined,
    },
  };
}

/**
 * Convert engine FaceConfig[] to store Face[]
 * Exported for use by getEngineSnapshot() in engineInstance.ts
 */
export function faceConfigsToFaces(configs: { id: FaceId; solid: boolean }[]): Face[] {
  return configs.map(fc => ({
    id: fc.id,
    solid: fc.solid,
  }));
}

/**
 * Convert engine panel snapshots to store PanelCollection
 * Also calculates safe space for each panel
 */
function panelSnapshotsToPanelCollection(
  panels: PanelSnapshot[],
  faces: FaceConfig[],
  config: BoxConfig
): PanelCollection {
  const convertedPanels = panels.map(panelSnapshotToPanelPath);

  // Calculate safe space for each panel
  for (const panel of convertedPanels) {
    panel.safeSpace = calculateSafeSpace(panel, faces, config);
  }

  return {
    panels: convertedPanels,
    augmentations: [],
    generatedAt: Date.now(),
  };
}

// =============================================================================
// State Subscription System
// =============================================================================

let stateVersion = 0;
let cachedState: EngineModelState | null = null;
let cachedMainPanels: PanelCollection | null = null;
let cachedMainConfig: BoxConfig | null = null;
const listeners = new Set<() => void>();

/**
 * Get the current engine state version
 * Used by useSyncExternalStore for efficient re-renders
 */
function getStateVersion(): number {
  return stateVersion;
}

/**
 * Subscribe to engine state changes
 */
function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/**
 * Notify all subscribers that engine state changed
 * Call this after any engine mutation
 */
export function notifyEngineStateChanged(): void {
  stateVersion++;
  cachedState = null;
  cachedMainPanels = null;
  cachedMainConfig = null;
  cachedMainVoidTree = null;
  listeners.forEach(cb => cb());
}

/**
 * Get current engine model state
 * Returns cached version if available
 */
function getEngineModelState(): EngineModelState | null {
  const engine = getEngine();
  const assembly = engine.assembly;

  if (!assembly) {
    return null;
  }

  // Return cached state if version hasn't changed
  if (cachedState) {
    return cachedState;
  }

  // Get fresh snapshot
  const snapshot = engine.getSnapshot();
  const assemblySnapshot = snapshot.children[0] as AssemblySnapshot | undefined;

  if (!assemblySnapshot) {
    return null;
  }

  // Convert to store-compatible format
  const config = assemblySnapshotToConfig(assemblySnapshot);
  const faces = faceConfigsToFaces(assemblySnapshot.props.faces);

  // Get root void from assembly children
  const rootVoidSnapshot = assemblySnapshot.children[0] as VoidSnapshot | undefined;
  const rootVoid = rootVoidSnapshot
    ? voidSnapshotToVoid(rootVoidSnapshot)
    : { id: 'root', bounds: { x: 0, y: 0, z: 0, w: 0, h: 0, d: 0 }, children: [] };

  // Get panels (with safe space calculation)
  const faceConfigs: FaceConfig[] = assemblySnapshot.props.faces.map(f => ({ id: f.id, solid: f.solid }));
  const panelCollection = panelSnapshotsToPanelCollection(assemblySnapshot.derived.panels, faceConfigs, config);

  cachedState = {
    config,
    faces,
    rootVoid,
    panelCollection,
    snapshot,
  };

  return cachedState;
}

// =============================================================================
// React Hooks
// =============================================================================

/**
 * Hook to get engine model state
 * Automatically re-renders when engine state changes
 *
 * Usage:
 * ```tsx
 * const { config, faces, rootVoid, panelCollection } = useEngineState();
 * ```
 */
export function useEngineState(): EngineModelState | null {
  // getSnapshot must return a cached/stable value
  // getEngineModelState() already returns cachedState when available
  return useSyncExternalStore(
    subscribe,
    getEngineModelState,
    getEngineModelState
  );
}

// Stable default values to avoid creating new objects on each render
const EMPTY_FACES: Face[] = [];

/**
 * Hook to get just the config
 */
export function useEngineConfig(): BoxConfig | null {
  const state = useEngineState();
  return state?.config ?? null;
}

/**
 * Hook to get just the faces
 */
export function useEngineFaces(): Face[] {
  const state = useEngineState();
  return state?.faces ?? EMPTY_FACES;
}

/**
 * Hook to get just the void tree
 */
export function useEngineVoidTree(): Void | null {
  const state = useEngineState();
  return state?.rootVoid ?? null;
}

/**
 * Hook to get just the panel collection
 */
export function useEnginePanels(): PanelCollection | null {
  const state = useEngineState();
  return state?.panelCollection ?? null;
}

/**
 * Hook to get a specific panel by ID
 */
export function useEnginePanel(panelId: string): PanelPath | null {
  const state = useEngineState();
  return state?.panelCollection?.panels.find(p => p.id === panelId) ?? null;
}

/**
 * Get main scene panels (cached)
 */
function getMainPanels(): PanelCollection | null {
  if (cachedMainPanels) {
    return cachedMainPanels;
  }

  const engine = getEngine();
  const mainScene = engine.getMainScene();
  const assemblySnapshot = mainScene.serialize().children[0] as AssemblySnapshot | undefined;
  if (!assemblySnapshot) return null;

  const config = assemblySnapshotToConfig(assemblySnapshot);
  const faceConfigs: FaceConfig[] = assemblySnapshot.props.faces.map(f => ({ id: f.id, solid: f.solid }));
  cachedMainPanels = panelSnapshotsToPanelCollection(assemblySnapshot.derived.panels, faceConfigs, config);
  return cachedMainPanels;
}

/**
 * Get main scene config (cached)
 */
function getMainConfig(): BoxConfig | null {
  if (cachedMainConfig) {
    return cachedMainConfig;
  }

  const engine = getEngine();
  const mainScene = engine.getMainScene();
  const assemblySnapshot = mainScene.serialize().children[0] as AssemblySnapshot | undefined;
  if (!assemblySnapshot) return null;

  cachedMainConfig = assemblySnapshotToConfig(assemblySnapshot);
  return cachedMainConfig;
}

// Cache for main scene void tree
let cachedMainVoidTree: Void | null = null;

/**
 * Get main scene void tree (cached)
 */
function getMainVoidTree(): Void | null {
  if (cachedMainVoidTree) {
    return cachedMainVoidTree;
  }

  const engine = getEngine();
  const mainScene = engine.getMainScene();
  const assemblySnapshot = mainScene.serialize().children[0] as AssemblySnapshot | undefined;
  if (!assemblySnapshot) return null;

  const rootVoidSnapshot = assemblySnapshot.children[0] as VoidSnapshot | undefined;
  if (!rootVoidSnapshot) return null;

  cachedMainVoidTree = voidSnapshotToVoid(rootVoidSnapshot);
  return cachedMainVoidTree;
}

/**
 * Hook to get panels from the MAIN scene (ignoring preview)
 * Useful for getting original state during preview operations
 */
export function useEngineMainPanels(): PanelCollection | null {
  return useSyncExternalStore(
    subscribe,
    getMainPanels,
    () => null // Server render returns null
  );
}

/**
 * Hook to get config from the MAIN scene (ignoring preview)
 * Useful for getting original dimensions during preview operations
 */
export function useEngineMainConfig(): BoxConfig | null {
  return useSyncExternalStore(
    subscribe,
    getMainConfig,
    () => null // Server render returns null
  );
}

/**
 * Hook to get void tree from the MAIN scene (ignoring preview)
 * Useful for UI state that shouldn't change during hover previews
 */
export function useEngineMainVoidTree(): Void | null {
  return useSyncExternalStore(
    subscribe,
    getMainVoidTree,
    () => null // Server render returns null
  );
}

// =============================================================================
// Eligibility Hooks (for stable UI during operations)
// =============================================================================

import { AllCornerEligibility, EdgeStatusInfo } from './types';
import { useMemo } from 'react';

/**
 * Panel eligibility data from the MAIN scene.
 * Use this for determining which corners/edges can be selected,
 * so eligibility doesn't change when preview applies modifications.
 */
export interface PanelEligibility {
  /** All corners in the panel with their eligibility status */
  corners: AllCornerEligibility[];
  /** Edge statuses (for inset/outset eligibility) */
  edges: EdgeStatusInfo[];
}

const EMPTY_ELIGIBILITY: PanelEligibility = {
  corners: [],
  edges: [],
};

/**
 * Hook to get eligibility data for a panel from the MAIN scene.
 *
 * This is the recommended way to get corner/edge eligibility for operations.
 * Using main scene ensures eligibility stays stable during preview - corners
 * don't disappear when a fillet is applied to the preview, edges don't change
 * status when an extension is previewed, etc.
 *
 * @param panelId - The panel ID to get eligibility for
 * @returns PanelEligibility with corners and edges from main scene
 *
 * @example
 * ```tsx
 * function CornerSelector({ panelId }) {
 *   const { corners } = usePanelEligibility(panelId);
 *   const eligibleCorners = corners.filter(c => c.eligible);
 *   return eligibleCorners.map(corner => (
 *     <CornerButton key={corner.id} corner={corner} />
 *   ));
 * }
 * ```
 */
export function usePanelEligibility(panelId: string | undefined): PanelEligibility {
  const mainPanels = useEngineMainPanels();

  return useMemo(() => {
    if (!panelId || !mainPanels) {
      return EMPTY_ELIGIBILITY;
    }

    const mainPanel = mainPanels.panels.find(p => p.id === panelId);
    if (!mainPanel) {
      return EMPTY_ELIGIBILITY;
    }

    return {
      corners: mainPanel.allCornerEligibility ?? [],
      edges: mainPanel.edgeStatuses ?? [],
    };
  }, [panelId, mainPanels]);
}
