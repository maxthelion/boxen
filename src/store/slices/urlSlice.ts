import { StateCreator } from 'zustand';
import { Void, BoxConfig, Face, EdgeExtensions, PanelCollection } from '../../types';
import { loadFromUrl, saveToUrl as saveStateToUrl, getShareableUrl as getShareUrl, ProjectState, getPanelCanonicalKeyFromPath, serializePanelOperations, deserializePanelOperations } from '../../utils/urlState';
import { syncStoreToEngine, getEngine, getEngineSnapshot, resetEngine, notifyEngineStateChanged } from '../../engine';
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
> = (set) => ({
  // Actions
  loadFromUrl: () => {
    const loaded = loadFromUrl();
    if (!loaded) return false;

    // Reset engine to start fresh (prevents merging with current scene)
    resetEngine();

    // Initialize engine with loaded config, void tree, and panel operations
    syncStoreToEngine(loaded.config, loaded.faces, loaded.rootVoid, undefined, loaded.panelOperations);

    // Apply edge extensions using canonical keys
    const engine = getEngine();
    const edgeExtensionsMap = loaded.edgeExtensions;

    if (Object.keys(edgeExtensionsMap).length > 0) {
      // Build canonical key → panel mapping from freshly created engine panels
      const newPanels = engine.generatePanelsFromNodes();
      const keyToPanel = new Map<string, import('../../types').PanelPath>();
      for (const p of newPanels.panels) {
        keyToPanel.set(getPanelCanonicalKeyFromPath(p), p);
      }

      // Apply edge extensions using canonical keys to resolve to current UUIDs
      for (const [key, ext] of Object.entries(edgeExtensionsMap)) {
        const panel = keyToPanel.get(key);
        if (panel) {
          engine.assembly?.setPanelEdgeExtensions(panel.id, ext);
        }
      }
    }

    // Notify React that engine state changed (extensions were applied after syncStoreToEngine)
    notifyEngineStateChanged();

    // Generate panel collection from engine (includes extensions)
    const collection = engine.generatePanelsFromNodes();

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

    // Get panels from engine to collect edge extensions (using canonical keys)
    const engine = getEngine();
    const panelCollection = engine.generatePanelsFromNodes();

    const edgeExtensions: Record<string, EdgeExtensions> = {};
    for (const panel of panelCollection.panels) {
      if (panel.edgeExtensions &&
          (panel.edgeExtensions.top !== 0 ||
           panel.edgeExtensions.bottom !== 0 ||
           panel.edgeExtensions.left !== 0 ||
           panel.edgeExtensions.right !== 0)) {
        edgeExtensions[getPanelCanonicalKeyFromPath(panel)] = panel.edgeExtensions;
      }
    }

    // Serialize panel operations (fillets, cutouts, edge paths) from assembly snapshot
    const sceneSnapshot = engine.getSnapshot();
    const assemblySnapshot = sceneSnapshot.children?.[0] as AssemblySnapshot | undefined;
    const serializedOps = assemblySnapshot ? serializePanelOperations(assemblySnapshot) : undefined;
    const panelOperations = serializedOps ? deserializePanelOperations(serializedOps) : undefined;

    const projectState: ProjectState = {
      config: engineSnapshot.config,
      faces: engineSnapshot.faces,
      rootVoid: engineSnapshot.rootVoid,
      edgeExtensions,
      panelOperations,
    };

    saveStateToUrl(projectState);
  },

  getShareableUrl: () => {
    // Read from engine (source of truth) instead of store state
    const engineSnapshot = getEngineSnapshot();
    if (!engineSnapshot) return '';

    // Get panels from engine to collect edge extensions (using canonical keys)
    const engine = getEngine();
    const panelCollection = engine.generatePanelsFromNodes();

    const edgeExtensions: Record<string, EdgeExtensions> = {};
    for (const panel of panelCollection.panels) {
      if (panel.edgeExtensions &&
          (panel.edgeExtensions.top !== 0 ||
           panel.edgeExtensions.bottom !== 0 ||
           panel.edgeExtensions.left !== 0 ||
           panel.edgeExtensions.right !== 0)) {
        edgeExtensions[getPanelCanonicalKeyFromPath(panel)] = panel.edgeExtensions;
      }
    }

    // Serialize panel operations (fillets, cutouts, edge paths) from assembly snapshot
    const sceneSnapshot = engine.getSnapshot();
    const assemblySnapshot = sceneSnapshot.children?.[0] as AssemblySnapshot | undefined;
    const serializedOps = assemblySnapshot ? serializePanelOperations(assemblySnapshot) : undefined;
    const panelOperations = serializedOps ? deserializePanelOperations(serializedOps) : undefined;

    const projectState: ProjectState = {
      config: engineSnapshot.config,
      faces: engineSnapshot.faces,
      rootVoid: engineSnapshot.rootVoid,
      edgeExtensions,
      panelOperations,
    };

    return getShareUrl(projectState);
  },
});
