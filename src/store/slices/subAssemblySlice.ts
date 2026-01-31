import { StateCreator } from 'zustand';
import { Void, BoxConfig, Face, FaceId, AssemblyAxis, LidTabDirection, SubAssembly, CreateSubAssemblyOptions, createAllSolidFaces } from '../../types';
import { ensureEngine, dispatchToEngine } from '../../engine';
import { VoidTree } from '../../utils/voidTree';
import { getModelState } from '../helpers/modelState';

const findVoid = VoidTree.find;
const findSubAssembly = VoidTree.findSubAssembly;

const generateId = () => Math.random().toString(36).substr(2, 9);

// =============================================================================
// Sub-Assembly Slice - Sub-assembly creation and configuration
// =============================================================================

export interface SubAssemblySlice {
  // Actions
  createSubAssembly: (voidId: string, options?: CreateSubAssemblyOptions) => void;
  toggleSubAssemblyFace: (subAssemblyId: string, faceId: FaceId) => void;
  setSubAssemblyClearance: (subAssemblyId: string, clearance: number) => void;
  removeSubAssembly: (voidId: string) => void;
  setSubAssemblyAxis: (subAssemblyId: string, axis: AssemblyAxis) => void;
  setSubAssemblyLidTabDirection: (subAssemblyId: string, side: 'positive' | 'negative', direction: LidTabDirection) => void;
}

// Type for full store state needed by this slice
type FullStoreState = SubAssemblySlice & {
  config: BoxConfig;
  faces: Face[];
  rootVoid: Void;
  selectedVoidIds: Set<string>;
  selectedSubAssemblyIds: Set<string>;
  selectedPanelIds: Set<string>;
  panelsDirty?: boolean;
};

export const createSubAssemblySlice: StateCreator<
  FullStoreState,
  [],
  [],
  SubAssemblySlice
> = (set) => ({
  // Actions
  createSubAssembly: (voidId, options) =>
    set((state) => {
      // Ensure engine is initialized
      ensureEngine();

      const clearance = options?.clearance ?? 2; // Default 2mm clearance
      const assemblyAxis = options?.assemblyAxis ?? 'y'; // Default Y axis

      // Dispatch to engine
      const result = dispatchToEngine({
        type: 'CREATE_SUB_ASSEMBLY',
        targetId: 'main-assembly',
        payload: { voidId, clearance, assemblyAxis },
      });

      if (!result.success || !result.snapshot) {
        // Fallback to local creation if dispatch failed
        const modelState = getModelState(state);
        const { config, rootVoid } = modelState;

        const targetVoid = findVoid(rootVoid, voidId);
        if (!targetVoid || targetVoid.children.length > 0 || targetVoid.subAssembly) {
          return state;
        }

        const faceOffsets = options?.faceOffsets ?? { front: 0, back: 0, left: 0, right: 0, top: 0, bottom: 0 };
        const { bounds } = targetVoid;
        const mt = config.materialThickness;

        const outerWidth = bounds.w - (clearance * 2) + faceOffsets.left + faceOffsets.right;
        const outerHeight = bounds.h - (clearance * 2) + faceOffsets.top + faceOffsets.bottom;
        const outerDepth = bounds.d - (clearance * 2) + faceOffsets.front + faceOffsets.back;

        const interiorWidth = outerWidth - (2 * mt);
        const interiorHeight = outerHeight - (2 * mt);
        const interiorDepth = outerDepth - (2 * mt);

        if (interiorWidth <= 0 || interiorHeight <= 0 || interiorDepth <= 0) {
          return state;
        }

        const subAssembly: SubAssembly = {
          id: generateId(),
          clearance,
          faceOffsets,
          faces: createAllSolidFaces(),
          materialThickness: mt,
          rootVoid: {
            id: 'sub-root-' + generateId(),
            bounds: { x: 0, y: 0, z: 0, w: interiorWidth, h: interiorHeight, d: interiorDepth },
            children: [],
          },
          assembly: {
            assemblyAxis,
            lids: {
              positive: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
              negative: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
            },
          },
        };

        const newRootVoid = VoidTree.update(rootVoid, voidId, (v) => ({
          ...v,
          subAssembly,
        }));

        return {
          rootVoid: newRootVoid,
          selectedVoidIds: new Set<string>(),
          selectedSubAssemblyIds: new Set([subAssembly.id]),
          panelsDirty: true,
        };
      }

      // Find the created sub-assembly ID from the snapshot
      const createdVoid = findVoid(result.snapshot.rootVoid, voidId);
      const subAssemblyId = createdVoid?.subAssembly?.id;

      return {
        rootVoid: result.snapshot.rootVoid,
        selectedVoidIds: new Set<string>(),
        selectedSubAssemblyIds: subAssemblyId ? new Set([subAssemblyId]) : new Set<string>(),
        panelsDirty: true,
      };
    }),

  toggleSubAssemblyFace: (subAssemblyId, faceId) =>
    set((state) => {
      // Ensure engine is initialized
      ensureEngine();

      // Dispatch to engine
      const result = dispatchToEngine({
        type: 'TOGGLE_SUB_ASSEMBLY_FACE',
        targetId: 'main-assembly',
        payload: { subAssemblyId, faceId },
      });

      if (!result.success || !result.snapshot) {
        // Fallback to local update if dispatch failed
        const modelState = getModelState(state);
        const { rootVoid } = modelState;

        const found = findSubAssembly(rootVoid, subAssemblyId);
        if (!found) return state;

        const updateSubAssemblyInVoid = (v: Void): Void => {
          if (v.subAssembly?.id === subAssemblyId) {
            return {
              ...v,
              subAssembly: {
                ...v.subAssembly,
                faces: v.subAssembly.faces.map((f) =>
                  f.id === faceId ? { ...f, solid: !f.solid } : f
                ),
              },
            };
          }
          return {
            ...v,
            children: v.children.map(updateSubAssemblyInVoid),
            subAssembly: v.subAssembly ? {
              ...v.subAssembly,
              rootVoid: updateSubAssemblyInVoid(v.subAssembly.rootVoid),
            } : undefined,
          };
        };

        return {
          rootVoid: updateSubAssemblyInVoid(rootVoid),
          panelsDirty: true,
        };
      }

      return {
        rootVoid: result.snapshot.rootVoid,
        panelsDirty: true,
      };
    }),

  setSubAssemblyClearance: (subAssemblyId, clearance) =>
    set((state) => {
      // Ensure engine is initialized
      ensureEngine();

      // Dispatch to engine
      const result = dispatchToEngine({
        type: 'SET_SUB_ASSEMBLY_CLEARANCE',
        targetId: 'main-assembly',
        payload: { subAssemblyId, clearance: Math.max(0, clearance) },
      });

      if (!result.success || !result.snapshot) {
        // Fallback to local update if dispatch failed
        const modelState = getModelState(state);
        const { rootVoid } = modelState;

        const updateSubAssemblyInVoid = (v: Void): Void => {
          if (v.subAssembly?.id === subAssemblyId) {
            const newClearance = Math.max(0, clearance);
            const mt = v.subAssembly.materialThickness;
            const faceOffsets = v.subAssembly.faceOffsets || { left: 0, right: 0, top: 0, bottom: 0, front: 0, back: 0 };

            const outerWidth = v.bounds.w - (newClearance * 2) + faceOffsets.left + faceOffsets.right;
            const outerHeight = v.bounds.h - (newClearance * 2) + faceOffsets.top + faceOffsets.bottom;
            const outerDepth = v.bounds.d - (newClearance * 2) + faceOffsets.front + faceOffsets.back;

            const interiorWidth = outerWidth - (2 * mt);
            const interiorHeight = outerHeight - (2 * mt);
            const interiorDepth = outerDepth - (2 * mt);

            if (interiorWidth <= 0 || interiorHeight <= 0 || interiorDepth <= 0) {
              return v;
            }

            return {
              ...v,
              subAssembly: {
                ...v.subAssembly,
                clearance: newClearance,
                rootVoid: {
                  ...v.subAssembly.rootVoid,
                  bounds: { x: 0, y: 0, z: 0, w: interiorWidth, h: interiorHeight, d: interiorDepth },
                  children: [],
                },
              },
            };
          }
          return {
            ...v,
            children: v.children.map(updateSubAssemblyInVoid),
          };
        };

        return {
          rootVoid: updateSubAssemblyInVoid(rootVoid),
          panelsDirty: true,
        };
      }

      return {
        rootVoid: result.snapshot.rootVoid,
        panelsDirty: true,
      };
    }),

  removeSubAssembly: (voidId) =>
    set((state) => {
      // Get model state from engine (source of truth)
      const modelState = getModelState(state);
      const { rootVoid } = modelState;

      // Find the sub-assembly ID from the void
      const targetVoid = findVoid(rootVoid, voidId);
      const subAssemblyId = targetVoid?.subAssembly?.id;

      if (!subAssemblyId) {
        return state; // No sub-assembly to remove
      }

      // Ensure engine is initialized
      ensureEngine();

      // Dispatch to engine
      const result = dispatchToEngine({
        type: 'REMOVE_SUB_ASSEMBLY',
        targetId: 'main-assembly',
        payload: { subAssemblyId },
      });

      if (!result.success || !result.snapshot) {
        // Fallback to local removal if dispatch failed
        const newRootVoid = VoidTree.update(rootVoid, voidId, (v) => ({
          ...v,
          subAssembly: undefined,
        }));

        return {
          rootVoid: newRootVoid,
          selectedVoidIds: new Set<string>(),
          selectedSubAssemblyIds: new Set<string>(),
          panelsDirty: true,
        };
      }

      return {
        rootVoid: result.snapshot.rootVoid,
        selectedVoidIds: new Set<string>(),
        selectedSubAssemblyIds: new Set<string>(),
        panelsDirty: true,
      };
    }),

  setSubAssemblyAxis: (subAssemblyId, axis) =>
    set((state) => {
      // Ensure engine is initialized
      ensureEngine();

      // Dispatch to engine
      const result = dispatchToEngine({
        type: 'SET_SUB_ASSEMBLY_AXIS',
        targetId: 'main-assembly',
        payload: { subAssemblyId, axis },
      });

      if (!result.success || !result.snapshot) {
        // Fallback to local update if dispatch failed
        const modelState = getModelState(state);
        const { rootVoid } = modelState;

        const updateSubAssemblyInVoid = (v: Void): Void => {
          if (v.subAssembly?.id === subAssemblyId) {
            return {
              ...v,
              subAssembly: {
                ...v.subAssembly,
                assembly: {
                  ...v.subAssembly.assembly,
                  assemblyAxis: axis,
                },
              },
            };
          }
          return {
            ...v,
            children: v.children.map(updateSubAssemblyInVoid),
            subAssembly: v.subAssembly ? {
              ...v.subAssembly,
              rootVoid: updateSubAssemblyInVoid(v.subAssembly.rootVoid),
            } : undefined,
          };
        };

        return {
          rootVoid: updateSubAssemblyInVoid(rootVoid),
          panelsDirty: true,
        };
      }

      return {
        rootVoid: result.snapshot.rootVoid,
        panelsDirty: true,
      };
    }),

  setSubAssemblyLidTabDirection: (subAssemblyId, side, direction) =>
    set((state) => {
      // Ensure engine is initialized
      ensureEngine();

      // Dispatch to engine
      const result = dispatchToEngine({
        type: 'SET_SUB_ASSEMBLY_LID_TAB_DIRECTION',
        targetId: 'main-assembly',
        payload: { subAssemblyId, side, tabDirection: direction },
      });

      if (!result.success || !result.snapshot) {
        // Fallback to local update if dispatch failed
        const modelState = getModelState(state);
        const { rootVoid } = modelState;

        const updateSubAssemblyInVoid = (v: Void): Void => {
          if (v.subAssembly?.id === subAssemblyId) {
            return {
              ...v,
              subAssembly: {
                ...v.subAssembly,
                assembly: {
                  ...v.subAssembly.assembly,
                  lids: {
                    ...v.subAssembly.assembly.lids,
                    [side]: {
                      ...v.subAssembly.assembly.lids[side],
                      tabDirection: direction,
                    },
                  },
                },
              },
            };
          }
          return {
            ...v,
            children: v.children.map(updateSubAssemblyInVoid),
            subAssembly: v.subAssembly ? {
              ...v.subAssembly,
              rootVoid: updateSubAssemblyInVoid(v.subAssembly.rootVoid),
            } : undefined,
          };
        };

        return {
          rootVoid: updateSubAssemblyInVoid(rootVoid),
          panelsDirty: true,
        };
      }

      return {
        rootVoid: result.snapshot.rootVoid,
        panelsDirty: true,
      };
    }),
});
