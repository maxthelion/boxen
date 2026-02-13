import { StateCreator } from 'zustand';
import { validateRecipe, executeRecipe, RecipeError } from '../../builder/recipe';
import {
  resetEngine,
  assemblySnapshotToConfig,
  faceConfigsToFaces,
  voidSnapshotToVoid,
  syncStoreToEngine,
  notifyEngineStateChanged,
} from '../../engine';
import type { AssemblySnapshot, VoidSnapshot } from '../../engine/types';
import type { BoxConfig, Face, Void, PanelCollection } from '../../types';

// =============================================================================
// Design Slice — AI Design panel state
// =============================================================================

/** Snapshot of store state for Cancel revert */
interface PreDesignState {
  config: BoxConfig;
  faces: Face[];
  rootVoid: Void;
  /** URL search params at time of opening the panel */
  urlSearch: string;
}

export interface DesignSlice {
  // State
  designPanelOpen: boolean;
  designPrompt: string;
  designLoading: boolean;
  designError: string | null;
  preDesignState: PreDesignState | null;

  // Actions
  openDesignPanel: () => void;
  closeDesignPanel: () => void;
  setDesignPrompt: (prompt: string) => void;
  submitDesign: () => Promise<void>;
  cancelDesign: () => void;
}

type FullStoreState = DesignSlice & {
  config: BoxConfig;
  faces: Face[];
  rootVoid: Void;
  panelCollection?: PanelCollection;
  panelsDirty?: boolean;
  selectedVoidIds: Set<string>;
  selectedPanelIds: Set<string>;
  selectedAssemblyId: string | null;
  selectedSubAssemblyIds: Set<string>;
  setConfig: (config: BoxConfig) => void;
  generatePanels: () => void;
  saveToUrl: () => void;
};

export const createDesignSlice: StateCreator<
  FullStoreState,
  [],
  [],
  DesignSlice
> = (set, get) => ({
  // Initial state
  designPanelOpen: false,
  designPrompt: '',
  designLoading: false,
  designError: null,
  preDesignState: null,

  // Actions
  openDesignPanel: () => {
    const state = get();
    set({
      designPanelOpen: true,
      designError: null,
      preDesignState: {
        config: state.config,
        faces: [...state.faces],
        rootVoid: state.rootVoid,
        urlSearch: window.location.search,
      },
    });
  },

  closeDesignPanel: () =>
    set({
      designPanelOpen: false,
      designPrompt: '',
      designLoading: false,
      designError: null,
      preDesignState: null,
    }),

  setDesignPrompt: (prompt) => set({ designPrompt: prompt }),

  submitDesign: async () => {
    const prompt = get().designPrompt.trim();
    if (!prompt) return;

    set({ designLoading: true, designError: null });

    try {
      // Call the API
      const response = await fetch('/api/design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error || `Request failed (${response.status})`
        );
      }

      const data = (await response.json()) as { recipe?: unknown; error?: string };
      if (data.error) {
        throw new Error(data.error);
      }
      if (!data.recipe) {
        throw new Error('No recipe in response');
      }

      // Validate and execute recipe
      const recipe = validateRecipe(data.recipe);
      const { engine: newEngine } = executeRecipe(recipe);

      // Apply new engine state (follows handleLoadProject pattern in App.tsx)
      resetEngine();

      const snapshot = newEngine.getSnapshot();
      const assemblySnapshot = snapshot.children.find(
        (c): c is AssemblySnapshot => c.kind === 'assembly'
      );

      if (assemblySnapshot) {
        const rootVoidSnapshot = assemblySnapshot.children.find(
          (c): c is VoidSnapshot => c.kind === 'void'
        );

        const config = assemblySnapshotToConfig(assemblySnapshot);
        const faces = faceConfigsToFaces(assemblySnapshot.props.faces);
        const rootVoid = rootVoidSnapshot
          ? voidSnapshotToVoid(rootVoidSnapshot)
          : { id: 'root', bounds: { x: 0, y: 0, z: 0, w: 0, h: 0, d: 0 }, children: [] };

        // Sync store state
        set({
          config,
          faces,
          rootVoid,
          selectedVoidIds: new Set<string>(),
          selectedPanelIds: new Set<string>(),
          selectedAssemblyId: null,
          selectedSubAssemblyIds: new Set<string>(),
        });

        // Sync store state into the global engine (recipe created a separate engine)
        syncStoreToEngine(config, faces, rootVoid);
        notifyEngineStateChanged();

        // Regenerate panels from new state
        get().generatePanels();
        get().saveToUrl();
      }

      set({ designLoading: false });
    } catch (err) {
      const message =
        err instanceof RecipeError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'An unexpected error occurred';
      set({ designLoading: false, designError: message });
    }
  },

  cancelDesign: () => {
    const preState = get().preDesignState;
    if (preState) {
      // Restore previous state
      resetEngine();

      set({
        config: preState.config,
        faces: preState.faces,
        rootVoid: preState.rootVoid,
        selectedVoidIds: new Set<string>(),
        selectedPanelIds: new Set<string>(),
        selectedAssemblyId: null,
        selectedSubAssemblyIds: new Set<string>(),
      });

      get().generatePanels();

      // Restore URL
      const url = new URL(window.location.href);
      const oldUrl = new URL(url.origin + preState.urlSearch);
      const pParam = oldUrl.searchParams.get('p');
      if (pParam) {
        url.searchParams.set('p', pParam);
      } else {
        url.searchParams.delete('p');
      }
      window.history.replaceState(null, '', url.toString());
    }

    set({
      designPanelOpen: false,
      designPrompt: '',
      designLoading: false,
      designError: null,
      preDesignState: null,
    });
  },
});
