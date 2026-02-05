import { StateCreator } from 'zustand';
import { Void, BoxConfig, Face, EdgeExtensions, defaultEdgeExtensions, PanelCollection } from '../../types';
import { loadFromUrl, saveToUrl as saveStateToUrl, getShareableUrl as getShareUrl, ProjectState, DeserializedPanelOps } from '../../utils/urlState';
import { generatePanelCollection } from '../../utils/panelGenerator';
import { syncStoreToEngine, getEngine, getEngineSnapshot, resetEngine } from '../../engine';
import type { AssemblySnapshot } from '../../engine/types';

// =============================================================================
// URL Slice - Save/load state from URL for sharing
// =============================================================================

export interface UrlSlice {
  // Actions
  loadFromUrl: () => boolean;
  saveToUrl: () => void;
  getShareableUrl: () => string;
}

// Type for full store state needed by this slice
type FullStoreState = UrlSlice & {
  config: BoxConfig;
  faces: Face[];
  rootVoid: Void;
  panelCollection?: PanelCollection;
  panelsDirty?: boolean;
  selectedVoidIds: Set<string>;
  selectedPanelIds: Set<string>;
  selectedAssemblyId: string | null;
  selectedSubAssemblyIds: Set<string>;
};

export const createUrlSlice: StateCreator<
  FullStoreState,
  [],
  [],
  UrlSlice
> = (set, get) => ({
  // Actions
  loadFromUrl: () => {
    const loaded = loadFromUrl();
    if (!loaded) return false;

    // Reset engine to start fresh (prevents merging with current scene)
    resetEngine();

    // Apply loaded state
    const state = get();

    // Initialize engine with loaded config (not defaults)
    // This ensures the engine matches the loaded state
    syncStoreToEngine(loaded.config, loaded.faces, loaded.rootVoid);

    // Collect edge extensions from loaded data
    const edgeExtensionsMap = loaded.edgeExtensions;

    // Create panels with loaded extensions
    const panelsWithExtensions = state.panelCollection?.panels.map(panel => ({
      ...panel,
      edgeExtensions: edgeExtensionsMap[panel.id] ?? defaultEdgeExtensions,
    }));

    // Generate new panel collection with loaded config
    const collection = generatePanelCollection(
      loaded.faces,
      loaded.rootVoid,
      loaded.config,
      1,
      panelsWithExtensions
    );

    // Apply edge extensions to newly generated panels
    if (collection && Object.keys(edgeExtensionsMap).length > 0) {
      collection.panels = collection.panels.map(panel => ({
        ...panel,
        edgeExtensions: edgeExtensionsMap[panel.id] ?? panel.edgeExtensions,
      }));
    }

    set({
      config: loaded.config,
      faces: loaded.faces,
      rootVoid: loaded.rootVoid,
      panelCollection: collection,
      panelsDirty: false,
      selectedVoidIds: new Set<string>(),
      selectedPanelIds: new Set<string>(),
      selectedAssemblyId: null,
      selectedSubAssemblyIds: new Set<string>(),
    });

    return true;
  },

  saveToUrl: () => {
    // Read from engine (source of truth) instead of store state
    const engineSnapshot = getEngineSnapshot();
    if (!engineSnapshot) return;

    // Get panels from engine to collect edge extensions
    const engine = getEngine();
    const panelCollection = engine.generatePanelsFromNodes();

    const edgeExtensions: Record<string, EdgeExtensions> = {};
    for (const panel of panelCollection.panels) {
      if (panel.edgeExtensions &&
          (panel.edgeExtensions.top !== 0 ||
           panel.edgeExtensions.bottom !== 0 ||
           panel.edgeExtensions.left !== 0 ||
           panel.edgeExtensions.right !== 0)) {
        edgeExtensions[panel.id] = panel.edgeExtensions;
      }
    }

    const projectState: ProjectState = {
      config: engineSnapshot.config,
      faces: engineSnapshot.faces,
      rootVoid: engineSnapshot.rootVoid,
      edgeExtensions,
    };

    saveStateToUrl(projectState);
  },

  getShareableUrl: () => {
    // Read from engine (source of truth) instead of store state
    const engineSnapshot = getEngineSnapshot();
    if (!engineSnapshot) return '';

    // Get panels from engine to collect edge extensions
    const engine = getEngine();
    const panelCollection = engine.generatePanelsFromNodes();

    const edgeExtensions: Record<string, EdgeExtensions> = {};
    for (const panel of panelCollection.panels) {
      if (panel.edgeExtensions &&
          (panel.edgeExtensions.top !== 0 ||
           panel.edgeExtensions.bottom !== 0 ||
           panel.edgeExtensions.left !== 0 ||
           panel.edgeExtensions.right !== 0)) {
        edgeExtensions[panel.id] = panel.edgeExtensions;
      }
    }

    const projectState: ProjectState = {
      config: engineSnapshot.config,
      faces: engineSnapshot.faces,
      rootVoid: engineSnapshot.rootVoid,
      edgeExtensions,
    };

    return getShareUrl(projectState);
  },
});
