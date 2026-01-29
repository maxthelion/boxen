/**
 * Operation Registry - Defines all available operations
 *
 * Each operation definition specifies:
 * - Selection requirements (what type, how many)
 * - Operation type (parameter, immediate, view)
 * - Where it's available (2D, 3D views)
 */

import {
  OperationId,
  OperationType,
  SelectionType,
} from './types';
import { EngineAction, FaceId, Axis } from '../engine/types';

// ==========================================================================
// Operation Definition
// ==========================================================================

export interface OperationDefinition {
  /** Unique identifier */
  id: OperationId;
  /** Display name */
  name: string;
  /** Operation category */
  type: OperationType;
  /** What type of selection is required */
  selectionType: SelectionType;
  /** Minimum number of items that must be selected */
  minSelection: number;
  /** Maximum number of items that can be selected (use Infinity for unlimited) */
  maxSelection: number;
  /** Views where this operation is available */
  availableIn: ('2d' | '3d')[];
  /** Description shown in tooltips */
  description?: string;
  /** Keyboard shortcut */
  shortcut?: string;
  /**
   * For parameter operations: creates the engine action for preview
   * Returns null if params are incomplete (preview cannot be shown yet)
   */
  createPreviewAction?: (params: Record<string, unknown>, context?: PreviewActionContext) => EngineAction | null;
}

/**
 * Context passed to createPreviewAction for operations that need additional data
 */
export interface PreviewActionContext {
  /** Current box dimensions from engine snapshot */
  dimensions?: { width: number; height: number; depth: number };
}

// ==========================================================================
// Operation Definitions
// ==========================================================================

export const OPERATION_DEFINITIONS: Record<OperationId, OperationDefinition> = {
  // Parameter operations (have preview phase)
  'push-pull': {
    id: 'push-pull',
    name: 'Push/Pull',
    type: 'parameter',
    selectionType: 'panel',
    minSelection: 1,
    maxSelection: 1,
    availableIn: ['3d'],
    description: 'Extend or contract a face panel',
    shortcut: 'p',
    createPreviewAction: (params, context) => {
      const { faceId, offset, mode } = params as {
        faceId?: FaceId;
        offset?: number;
        mode?: 'scale' | 'extend';
      };

      if (!faceId || offset === undefined || !mode || !context?.dimensions) return null;

      const { width, height, depth } = context.dimensions;
      let newWidth = width, newHeight = height, newDepth = depth;

      // Apply offset based on face
      switch (faceId) {
        case 'left':
        case 'right':
          newWidth = width + offset;
          break;
        case 'top':
        case 'bottom':
          newHeight = height + offset;
          break;
        case 'front':
        case 'back':
          newDepth = depth + offset;
          break;
      }

      return {
        type: 'SET_DIMENSIONS',
        targetId: 'main-assembly',
        payload: { width: newWidth, height: newHeight, depth: newDepth },
      };
    },
  },

  'subdivide': {
    id: 'subdivide',
    name: 'Subdivide',
    type: 'parameter',
    selectionType: 'void',
    minSelection: 1,
    maxSelection: 1,
    availableIn: ['3d'],
    description: 'Add dividers to split a void',
    shortcut: 's',
    createPreviewAction: (params) => {
      const { voidId, axis, positions } = params as {
        voidId?: string;
        axis?: Axis;
        positions?: number[];
      };

      if (!voidId || !axis || !positions?.length) return null;

      return {
        type: 'ADD_SUBDIVISIONS',
        targetId: 'main-assembly',
        payload: { voidId, axis, positions },
      };
    },
  },

  'subdivide-two-panel': {
    id: 'subdivide-two-panel',
    name: 'Subdivide (Two Panel)',
    type: 'parameter',
    selectionType: 'panel',
    minSelection: 2,
    maxSelection: 2,
    availableIn: ['3d'],
    description: 'Subdivide the void between two parallel panels',
    createPreviewAction: (params) => {
      // Same as subdivide - once we have the voidId from analysis, it's the same action
      const { voidId, axis, positions } = params as {
        voidId?: string;
        axis?: Axis;
        positions?: number[];
      };

      if (!voidId || !axis || !positions?.length) return null;

      return {
        type: 'ADD_SUBDIVISIONS',
        targetId: 'main-assembly',
        payload: { voidId, axis, positions },
      };
    },
  },

  'create-sub-assembly': {
    id: 'create-sub-assembly',
    name: 'Create Sub-Assembly',
    type: 'parameter',
    selectionType: 'void',
    minSelection: 1,
    maxSelection: 1,
    availableIn: ['3d'],
    description: 'Create a drawer, tray, or insert in a void',
    createPreviewAction: (params) => {
      const { voidId, clearance } = params as {
        voidId?: string;
        clearance?: number;
      };

      if (!voidId) return null;

      return {
        type: 'CREATE_SUB_ASSEMBLY',
        targetId: 'main-assembly',
        payload: {
          voidId,
          clearance: clearance ?? 2,
        },
      };
    },
  },

  'configure-assembly': {
    id: 'configure-assembly',
    name: 'Configure Assembly',
    type: 'parameter',
    selectionType: 'assembly',
    minSelection: 1,
    maxSelection: 1,
    availableIn: ['3d'],
    description: 'Configure assembly orientation, material, and joints',
    shortcut: 'g',
    createPreviewAction: (params) => {
      const {
        thickness,
        fingerWidth,
        fingerGap,
        assemblyAxis,
        lidPositiveTabDirection,
        lidPositiveInset,
        lidNegativeTabDirection,
        lidNegativeInset,
      } = params as {
        thickness?: number;
        fingerWidth?: number;
        fingerGap?: number;
        assemblyAxis?: Axis;
        lidPositiveTabDirection?: 'tabs-in' | 'tabs-out';
        lidPositiveInset?: number;
        lidNegativeTabDirection?: 'tabs-in' | 'tabs-out';
        lidNegativeInset?: number;
      };

      // Build material config if any material properties are set
      const materialConfig: { thickness?: number; fingerWidth?: number; fingerGap?: number } = {};
      if (thickness !== undefined) materialConfig.thickness = thickness;
      if (fingerWidth !== undefined) materialConfig.fingerWidth = fingerWidth;
      if (fingerGap !== undefined) materialConfig.fingerGap = fingerGap;

      // Build lid configs if any lid properties are set
      const lids: {
        positive?: { tabDirection?: 'tabs-in' | 'tabs-out'; inset?: number };
        negative?: { tabDirection?: 'tabs-in' | 'tabs-out'; inset?: number };
      } = {};
      if (lidPositiveTabDirection !== undefined || lidPositiveInset !== undefined) {
        lids.positive = {};
        if (lidPositiveTabDirection !== undefined) lids.positive.tabDirection = lidPositiveTabDirection;
        if (lidPositiveInset !== undefined) lids.positive.inset = lidPositiveInset;
      }
      if (lidNegativeTabDirection !== undefined || lidNegativeInset !== undefined) {
        lids.negative = {};
        if (lidNegativeTabDirection !== undefined) lids.negative.tabDirection = lidNegativeTabDirection;
        if (lidNegativeInset !== undefined) lids.negative.inset = lidNegativeInset;
      }

      return {
        type: 'CONFIGURE_ASSEMBLY',
        targetId: 'main-assembly',
        payload: {
          ...(Object.keys(materialConfig).length > 0 && { materialConfig }),
          ...(assemblyAxis !== undefined && { assemblyAxis }),
          ...(Object.keys(lids).length > 0 && { lids }),
        },
      };
    },
  },

  'scale': {
    id: 'scale',
    name: 'Scale',
    type: 'parameter',
    selectionType: 'assembly',
    minSelection: 1,
    maxSelection: 1,
    availableIn: ['3d'],
    description: 'Change assembly dimensions',
    shortcut: 'r',
    createPreviewAction: (params) => {
      const { width, height, depth } = params as {
        width?: number;
        height?: number;
        depth?: number;
      };

      return {
        type: 'SET_DIMENSIONS',
        targetId: 'main-assembly',
        payload: {
          ...(width !== undefined && { width }),
          ...(height !== undefined && { height }),
          ...(depth !== undefined && { depth }),
        },
      };
    },
  },

  'chamfer-fillet': {
    id: 'chamfer-fillet',
    name: 'Chamfer/Fillet',
    type: 'parameter',
    selectionType: 'corner',
    minSelection: 1,
    maxSelection: Infinity,
    availableIn: ['2d'],
    description: 'Add chamfers or fillets to corners',
    shortcut: 'c',
  },

  // Immediate operations (no preview)
  'toggle-face': {
    id: 'toggle-face',
    name: 'Toggle Face',
    type: 'immediate',
    selectionType: 'panel',
    minSelection: 1,
    maxSelection: 1,
    availableIn: ['3d'],
    description: 'Toggle a face between solid and open',
    shortcut: 't',
  },

  'remove-subdivision': {
    id: 'remove-subdivision',
    name: 'Remove Subdivision',
    type: 'immediate',
    selectionType: 'void',
    minSelection: 1,
    maxSelection: 1,
    availableIn: ['3d'],
    description: 'Remove a subdivision and merge voids',
    shortcut: 'Delete',
  },

  'remove-sub-assembly': {
    id: 'remove-sub-assembly',
    name: 'Remove Sub-Assembly',
    type: 'immediate',
    selectionType: 'void',
    minSelection: 1,
    maxSelection: 1,
    availableIn: ['3d'],
    description: 'Remove a sub-assembly from a void',
  },

  // View operations (no model change)
  'edit-in-2d': {
    id: 'edit-in-2d',
    name: 'Edit in 2D',
    type: 'view',
    selectionType: 'panel',
    minSelection: 1,
    maxSelection: 1,
    availableIn: ['3d'],
    description: 'Open panel in 2D sketch editor',
    shortcut: 'e',
  },
};

// ==========================================================================
// Registry Helpers
// ==========================================================================

/**
 * Get an operation definition by ID
 */
export function getOperation(id: OperationId): OperationDefinition {
  return OPERATION_DEFINITIONS[id];
}

/**
 * Get all operations of a specific type
 */
export function getOperationsByType(type: OperationType): OperationDefinition[] {
  return Object.values(OPERATION_DEFINITIONS).filter(op => op.type === type);
}

/**
 * Get operations available in a specific view
 */
export function getOperationsForView(view: '2d' | '3d'): OperationDefinition[] {
  return Object.values(OPERATION_DEFINITIONS).filter(op =>
    op.availableIn.includes(view)
  );
}

/**
 * Get operations that match a selection type
 */
export function getOperationsForSelection(
  selectionType: SelectionType
): OperationDefinition[] {
  return Object.values(OPERATION_DEFINITIONS).filter(
    op => op.selectionType === selectionType
  );
}

/**
 * Check if an operation requires a preview phase
 */
export function operationHasPreview(id: OperationId): boolean {
  return OPERATION_DEFINITIONS[id].type === 'parameter';
}

/**
 * Check if an operation is immediate (no preview)
 */
export function operationIsImmediate(id: OperationId): boolean {
  return OPERATION_DEFINITIONS[id].type === 'immediate';
}

/**
 * Check if an operation only changes view (no model)
 */
export function operationIsViewOnly(id: OperationId): boolean {
  return OPERATION_DEFINITIONS[id].type === 'view';
}
