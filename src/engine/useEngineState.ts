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
import { BoxConfig, Face, FaceId, Void, PanelCollection, PanelPath } from '../types';
import { panelSnapshotToPanelPath } from './panelBridge';

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
 */
function voidSnapshotToVoid(snapshot: VoidSnapshot): Void {
  return {
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
    children: snapshot.children
      .filter((c): c is VoidSnapshot => c.kind === 'void')
      .map(voidSnapshotToVoid),
  };
}

/**
 * Convert engine AssemblySnapshot to store-compatible BoxConfig
 */
function assemblySnapshotToConfig(snapshot: AssemblySnapshot): BoxConfig {
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
 */
function faceConfigsToFaces(configs: { id: FaceId; solid: boolean }[]): Face[] {
  return configs.map(fc => ({
    id: fc.id,
    solid: fc.solid,
  }));
}

/**
 * Convert engine panel snapshots to store PanelCollection
 */
function panelSnapshotsToPanelCollection(panels: PanelSnapshot[]): PanelCollection {
  return {
    panels: panels.map(panelSnapshotToPanelPath),
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

  // Get panels
  const panelCollection = panelSnapshotsToPanelCollection(assemblySnapshot.derived.panels);

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

  cachedMainPanels = panelSnapshotsToPanelCollection(assemblySnapshot.derived.panels);
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
