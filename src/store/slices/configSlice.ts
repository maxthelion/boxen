import { StateCreator } from 'zustand';
import { Void, BoxConfig, Face, FaceId, Bounds, AssemblyAxis, AssemblyConfig, LidTabDirection, FeetConfig } from '../../types';
import { ensureEngine, getEngine, dispatchToEngine } from '../../engine';
import { getModelState } from '../helpers/modelState';
import { createRootVoidWithInsets, getMainInteriorVoid, getUserSubdivisions } from '../helpers/voidFactory';
import { recalculateVoidBounds } from '../helpers/voidBounds';
import { BoundsOps } from '../../utils/bounds';

// =============================================================================
// Config Slice - Box configuration, assembly settings, face offsets
// =============================================================================

export interface ConfigSlice {
  // State
  config: BoxConfig;
  faces: Face[];
  rootVoid: Void;

  // Actions
  setConfig: (config: Partial<BoxConfig>) => void;
  setAssemblyAxis: (axis: AssemblyAxis) => void;
  setLidTabDirection: (side: 'positive' | 'negative', direction: LidTabDirection) => void;
  setFeetConfig: (feetConfig: FeetConfig) => void;
  setFaceOffset: (faceId: FaceId, offset: number, mode: 'scale' | 'extend') => void;
  insetFace: (faceId: FaceId, insetAmount: number) => void;
}

// Type for full store state needed by this slice
type FullStoreState = ConfigSlice & {
  selectedVoidIds: Set<string>;
  selectedSubAssemblyIds: Set<string>;
  selectedPanelIds: Set<string>;
  selectedAssemblyId: string | null;
  hiddenVoidIds: Set<string>;
  isolatedVoidId: string | null;
  isolateHiddenVoidIds: Set<string>;
  hiddenSubAssemblyIds: Set<string>;
  isolatedSubAssemblyId: string | null;
  isolateHiddenSubAssemblyIds: Set<string>;
  hiddenFaceIds: Set<string>;
  isolatedPanelId: string | null;
  isolateHiddenFaceIds: Set<string>;
  panelsDirty?: boolean;
};

export const createConfigSlice: StateCreator<
  FullStoreState,
  [],
  [],
  ConfigSlice
> = (set) => ({
  // Initial state - will be overwritten by initialState
  config: {} as BoxConfig,
  faces: [],
  rootVoid: {} as Void,

  // Actions
  setConfig: (newConfig) =>
    set((state) => {
      // Get current model state from engine (source of truth)
      const modelState = getModelState(state);
      const oldConfig = modelState.config;
      const oldRootVoid = modelState.rootVoid;

      // Merge new config with old
      const config = { ...oldConfig, ...newConfig };

      // Route changes through engine (engine is source of truth)
      const engine = getEngine();

      // Check if dimensions changed
      const dimensionsChanged =
        config.width !== oldConfig.width ||
        config.height !== oldConfig.height ||
        config.depth !== oldConfig.depth;

      // Check if material changed
      const materialChanged =
        config.materialThickness !== oldConfig.materialThickness ||
        config.fingerWidth !== oldConfig.fingerWidth ||
        config.fingerGap !== oldConfig.fingerGap;

      // Dispatch dimension changes to engine
      if (dimensionsChanged) {
        engine.dispatch({
          type: 'SET_DIMENSIONS',
          targetId: 'main-assembly',
          payload: { width: config.width, height: config.height, depth: config.depth },
        });
      }

      // Dispatch material changes to engine
      if (materialChanged) {
        engine.dispatch({
          type: 'SET_MATERIAL',
          targetId: 'main-assembly',
          payload: {
            thickness: config.materialThickness,
            fingerWidth: config.fingerWidth,
            fingerGap: config.fingerGap,
          },
        });
      }

      // Check if assembly structure changes (requires reset)
      const axisChanged = config.assembly.assemblyAxis !== oldConfig.assembly.assemblyAxis;
      const positiveLidChanged =
        config.assembly.lids.positive.inset !== oldConfig.assembly.lids.positive.inset ||
        config.assembly.lids.positive.tabDirection !== oldConfig.assembly.lids.positive.tabDirection;
      const negativeLidChanged =
        config.assembly.lids.negative.inset !== oldConfig.assembly.lids.negative.inset ||
        config.assembly.lids.negative.tabDirection !== oldConfig.assembly.lids.negative.tabDirection;

      const assemblyStructureChanged = axisChanged ||
        config.assembly.lids.positive.inset !== oldConfig.assembly.lids.positive.inset ||
        config.assembly.lids.negative.inset !== oldConfig.assembly.lids.negative.inset;

      // Dispatch assembly config changes to engine
      if (axisChanged) {
        engine.dispatch({
          type: 'SET_ASSEMBLY_AXIS',
          targetId: 'main-assembly',
          payload: { axis: config.assembly.assemblyAxis },
        });
      }
      if (positiveLidChanged) {
        engine.dispatch({
          type: 'SET_LID_CONFIG',
          targetId: 'main-assembly',
          payload: { side: 'positive', config: config.assembly.lids.positive },
        });
      }
      if (negativeLidChanged) {
        engine.dispatch({
          type: 'SET_LID_CONFIG',
          targetId: 'main-assembly',
          payload: { side: 'negative', config: config.assembly.lids.negative },
        });
      }

      // If assembly structure changes, reset everything
      if (assemblyStructureChanged) {
        return {
          config,
          rootVoid: createRootVoidWithInsets(config.width, config.height, config.depth, config.assembly),
          selectedVoidIds: new Set<string>(),
          selectedSubAssemblyIds: new Set<string>(),
          selectedPanelIds: new Set<string>(),
          selectedAssemblyId: null,
          hiddenVoidIds: new Set<string>(),
          isolatedVoidId: null,
          isolateHiddenVoidIds: new Set<string>(),
          hiddenSubAssemblyIds: new Set<string>(),
          isolatedSubAssemblyId: null,
          isolateHiddenSubAssemblyIds: new Set<string>(),
          hiddenFaceIds: new Set<string>(),
          isolatedPanelId: null,
          isolateHiddenFaceIds: new Set<string>(),
          panelsDirty: true,
        };
      }

      // If dimensions changed, preserve subdivisions and recalculate bounds
      if (dimensionsChanged) {
        const newRootBounds: Bounds = { x: 0, y: 0, z: 0, w: config.width, h: config.height, d: config.depth };

        // Get the main interior void (where user subdivisions live)
        const mainInterior = getMainInteriorVoid(oldRootVoid);
        const hasInsets = mainInterior.id !== oldRootVoid.id;

        let newRootVoid: Void;

        if (hasInsets) {
          // Has lid insets - need to rebuild root structure with new dimensions
          // but preserve the children of the main interior void
          const positiveInset = config.assembly.lids.positive.inset;
          const negativeInset = config.assembly.lids.negative.inset;
          const axis = config.assembly.assemblyAxis;

          // Calculate new main interior bounds using BoundsOps helper
          const { main: mainBounds } = BoundsOps.calculateInsetRegions(
            newRootBounds, axis, positiveInset, negativeInset
          );

          // Recalculate the main interior's children
          const recalculatedMainInterior = recalculateVoidBounds(
            { ...mainInterior, bounds: mainBounds },
            mainBounds,
            config.materialThickness
          );

          // Rebuild the root with lid caps and recalculated main interior
          newRootVoid = createRootVoidWithInsets(
            config.width, config.height, config.depth, config.assembly
          );
          // Replace the main interior's children with the recalculated ones
          const newMainInterior = newRootVoid.children.find(c => c.isMainInterior);
          if (newMainInterior) {
            newMainInterior.children = recalculatedMainInterior.children;
          }
        } else {
          // No lid insets - recalculate directly from root
          newRootVoid = recalculateVoidBounds(
            { ...oldRootVoid, bounds: newRootBounds },
            newRootBounds,
            config.materialThickness
          );
        }

        return {
          config,
          rootVoid: newRootVoid,
          panelsDirty: true,
        };
      }

      // Only non-structural config changes (materialThickness, fingerWidth, etc.)
      return {
        config,
        panelsDirty: true,
      };
    }),

  setAssemblyAxis: (axis) =>
    set((state) => {
      // Get model state from engine (source of truth)
      const modelState = getModelState(state);
      const { config, rootVoid } = modelState;

      const newAssembly: AssemblyConfig = {
        ...config.assembly,
        assemblyAxis: axis,
      };

      // Rebuild the void structure with the new axis
      // Preserve user subdivisions from the main interior
      const userSubdivisions = getUserSubdivisions(rootVoid);
      const newRootVoid = createRootVoidWithInsets(
        config.width,
        config.height,
        config.depth,
        newAssembly,
        userSubdivisions
      );

      return {
        config: {
          ...config,
          assembly: newAssembly,
        },
        rootVoid: newRootVoid,
        // Clear selection when void structure changes
        selectedVoidIds: new Set<string>(),
        selectedPanelIds: new Set<string>(),
        panelsDirty: true,
      };
    }),

  setLidTabDirection: (side, direction) =>
    set((state) => {
      // Get model state from engine (source of truth)
      const modelState = getModelState(state);
      const { config, rootVoid } = modelState;

      const newInset = direction === 'tabs-in' ? 0 : config.assembly.lids[side].inset;
      const newAssembly: AssemblyConfig = {
        ...config.assembly,
        lids: {
          ...config.assembly.lids,
          [side]: {
            ...config.assembly.lids[side],
            tabDirection: direction,
            // If setting tabs-in and there's an inset, reset inset to 0
            // (tabs-in doesn't work with inset)
            inset: newInset,
          },
        },
      };

      // Rebuild the void structure if inset changed
      const userSubdivisions = getUserSubdivisions(rootVoid);
      const newRootVoid = createRootVoidWithInsets(
        config.width,
        config.height,
        config.depth,
        newAssembly,
        userSubdivisions
      );

      return {
        config: {
          ...config,
          assembly: newAssembly,
        },
        rootVoid: newRootVoid,
        panelsDirty: true,
      };
    }),

  setFeetConfig: (feetConfig) =>
    set((state) => {
      // Ensure engine is initialized
      ensureEngine();

      // Convert store feet config to engine format
      const engineFeetConfig = feetConfig ? {
        enabled: feetConfig.enabled,
        height: feetConfig.height,
        width: feetConfig.width,
        inset: feetConfig.inset,
        gap: 0, // Engine expects gap field
      } : null;

      // Dispatch to engine
      const result = dispatchToEngine({
        type: 'SET_FEET_CONFIG',
        targetId: 'main-assembly',
        payload: engineFeetConfig,
      });

      if (!result.success || !result.snapshot) {
        // Fallback to local update if dispatch failed
        const modelState = getModelState(state);
        const { config } = modelState;

        return {
          config: {
            ...config,
            assembly: {
              ...config.assembly,
              feet: feetConfig,
            },
          },
          panelsDirty: true,
        };
      }

      return {
        config: result.snapshot.config,
        panelsDirty: true,
      };
    }),

  setFaceOffset: (faceId, offset, mode) =>
    set((state) => {
      // Get model state from engine (source of truth)
      const modelState = getModelState(state);
      const { config, rootVoid } = modelState;

      // Both modes resize the bounding box, but differ in how children are handled
      let newWidth = config.width;
      let newHeight = config.height;
      let newDepth = config.depth;

      // Calculate new dimensions
      switch (faceId) {
        case 'front':
        case 'back':
          newDepth = Math.max(config.materialThickness * 3, config.depth + offset);
          break;
        case 'left':
        case 'right':
          newWidth = Math.max(config.materialThickness * 3, config.width + offset);
          break;
        case 'top':
        case 'bottom':
          newHeight = Math.max(config.materialThickness * 3, config.height + offset);
          break;
      }

      const newConfig = {
        ...config,
        width: newWidth,
        height: newHeight,
        depth: newDepth,
      };

      // Calculate new root bounds
      const newRootBounds: Bounds = { x: 0, y: 0, z: 0, w: newWidth, h: newHeight, d: newDepth };

      if (mode === 'scale') {
        // Scale mode: Scale all children proportionally
        const scaleX = newWidth / config.width;
        const scaleY = newHeight / config.height;
        const scaleZ = newDepth / config.depth;

        const scaleVoidBounds = (v: Void): Void => {
          const scaledBounds: Bounds = {
            x: v.bounds.x * scaleX,
            y: v.bounds.y * scaleY,
            z: v.bounds.z * scaleZ,
            w: v.bounds.w * scaleX,
            h: v.bounds.h * scaleY,
            d: v.bounds.d * scaleZ,
          };

          return {
            ...v,
            bounds: scaledBounds,
            // Scale splitPosition if it exists
            splitPosition: v.splitPosition !== undefined
              ? v.splitPosition * (v.splitAxis === 'x' ? scaleX : v.splitAxis === 'y' ? scaleY : scaleZ)
              : undefined,
            children: (v.children || []).map(scaleVoidBounds),
          };
        };

        const newRootVoid = {
          ...scaleVoidBounds(rootVoid),
          bounds: newRootBounds,
        };

        return {
          config: newConfig,
          rootVoid: newRootVoid,
          panelsDirty: true,
        };
      } else {
        // Extend mode: Keep center in place, only the void abutting the face grows
        // Children stay at their absolute positions, but we need to expand the
        // adjacent void to fill the new space

        const deltaW = newWidth - config.width;
        const deltaH = newHeight - config.height;
        const deltaD = newDepth - config.depth;

        // Helper to adjust void bounds based on which face moved
        // Also adjusts splitPosition when voids shift (so divider panels move with their voids)
        const adjustVoidBounds = (v: Void): Void => {
          const newBounds = { ...v.bounds };
          let newSplitPosition = v.splitPosition;

          // For extend mode, we extend in the direction of the face
          // The face that moved outward increases the dimension on that side
          switch (faceId) {
            case 'right':
              // Right face moved: voids at the right edge grow
              if (v.bounds.x + v.bounds.w >= config.width - 0.1) {
                newBounds.w += deltaW;
              }
              break;
            case 'left':
              // Left face moved: voids at the left edge grow, others shift
              if (v.bounds.x <= 0.1) {
                newBounds.w += deltaW;
              } else {
                newBounds.x += deltaW;
                // Also shift splitPosition if this void has an X-axis split
                if (v.splitAxis === 'x' && newSplitPosition !== undefined) {
                  newSplitPosition += deltaW;
                }
              }
              break;
            case 'top':
              // Top face moved: voids at the top edge grow
              if (v.bounds.y + v.bounds.h >= config.height - 0.1) {
                newBounds.h += deltaH;
              }
              break;
            case 'bottom':
              // Bottom face moved: voids at the bottom edge grow, others shift
              if (v.bounds.y <= 0.1) {
                newBounds.h += deltaH;
              } else {
                newBounds.y += deltaH;
                // Also shift splitPosition if this void has a Y-axis split
                if (v.splitAxis === 'y' && newSplitPosition !== undefined) {
                  newSplitPosition += deltaH;
                }
              }
              break;
            case 'front':
              // Front face moved: voids at the front edge grow
              if (v.bounds.z + v.bounds.d >= config.depth - 0.1) {
                newBounds.d += deltaD;
              }
              break;
            case 'back':
              // Back face moved: voids at the back edge grow, others shift
              if (v.bounds.z <= 0.1) {
                newBounds.d += deltaD;
              } else {
                newBounds.z += deltaD;
                // Also shift splitPosition if this void has a Z-axis split
                if (v.splitAxis === 'z' && newSplitPosition !== undefined) {
                  newSplitPosition += deltaD;
                }
              }
              break;
          }

          return {
            ...v,
            bounds: newBounds,
            splitPosition: newSplitPosition,
            children: v.children.map(adjustVoidBounds),
          };
        };

        const newRootVoid = {
          ...adjustVoidBounds(rootVoid),
          bounds: newRootBounds,
        };

        return {
          config: newConfig,
          rootVoid: newRootVoid,
          panelsDirty: true,
        };
      }
    }),

  insetFace: (faceId, insetAmount) =>
    set((state) => {
      // Get model state from engine (source of truth)
      const modelState = getModelState(state);
      const { config, faces, rootVoid } = modelState;

      // Make the outer face open and create a divider at the inset position
      // This creates a new subdivision at the inset depth

      // First, toggle the face to open
      const newFaces = faces.map(f =>
        f.id === faceId ? { ...f, solid: false } : f
      );

      // Determine the axis and position for the new divider
      let axis: 'x' | 'y' | 'z';
      let position: number;

      switch (faceId) {
        case 'front':
          axis = 'z';
          position = config.depth - insetAmount;
          break;
        case 'back':
          axis = 'z';
          position = insetAmount;
          break;
        case 'left':
          axis = 'x';
          position = insetAmount;
          break;
        case 'right':
          axis = 'x';
          position = config.width - insetAmount;
          break;
        case 'top':
          axis = 'y';
          position = config.height - insetAmount;
          break;
        case 'bottom':
        default:
          axis = 'y';
          position = insetAmount;
          break;
      }

      // Create the subdivision in the root void
      const mt = config.materialThickness;
      const halfMt = mt / 2;
      const { width, height, depth } = config;

      let child1Bounds: Bounds;
      let child2Bounds: Bounds;

      switch (axis) {
        case 'x':
          child1Bounds = { x: 0, y: 0, z: 0, w: position - halfMt, h: height, d: depth };
          child2Bounds = { x: position + halfMt, y: 0, z: 0, w: width - position - halfMt, h: height, d: depth };
          break;
        case 'y':
          child1Bounds = { x: 0, y: 0, z: 0, w: width, h: position - halfMt, d: depth };
          child2Bounds = { x: 0, y: position + halfMt, z: 0, w: width, h: height - position - halfMt, d: depth };
          break;
        case 'z':
        default:
          child1Bounds = { x: 0, y: 0, z: 0, w: width, h: height, d: position - halfMt };
          child2Bounds = { x: 0, y: 0, z: position + halfMt, w: width, h: height, d: depth - position - halfMt };
          break;
      }

      const newRootVoid: Void = {
        ...rootVoid,
        children: [
          {
            id: `void-${Date.now()}-1`,
            bounds: child1Bounds,
            children: [],
            splitAxis: axis,
            splitPosition: position,
          },
          {
            id: `void-${Date.now()}-2`,
            bounds: child2Bounds,
            children: [],
          },
        ],
      };

      return {
        faces: newFaces,
        rootVoid: newRootVoid,
      };
    }),
});
