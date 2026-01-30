/**
 * Operation Registry - Defines all available operations
 *
 * IMPORTANT: Before modifying this file, read .claude/rules/operations.md
 * which describes the pattern for adding new operations.
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
import { EngineAction, FaceId, Axis, FeetConfig } from '../engine/types';

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
      // Uses same axes format as subdivide-grid
      const { voidId, axes } = params as {
        voidId?: string;
        axes?: { axis: Axis; positions: number[] }[];
      };

      if (!voidId || !axes?.length) return null;

      // Filter out axes with empty positions
      const validAxes = axes.filter(a => a.positions && a.positions.length > 0);
      if (validAxes.length === 0) return null;

      // If only one axis with positions, use ADD_SUBDIVISIONS
      if (validAxes.length === 1) {
        return {
          type: 'ADD_SUBDIVISIONS',
          targetId: 'main-assembly',
          payload: { voidId, axis: validAxes[0].axis, positions: validAxes[0].positions },
        };
      }

      // Multi-axis: use ADD_GRID_SUBDIVISION
      return {
        type: 'ADD_GRID_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId, axes: validAxes },
      };
    },
  },

  'subdivide-grid': {
    id: 'subdivide-grid',
    name: 'Subdivide Grid',
    type: 'parameter',
    selectionType: 'void',
    minSelection: 1,
    maxSelection: 1,
    availableIn: ['3d'],
    description: 'Add a grid of dividers on multiple axes',
    shortcut: 'g',
    createPreviewAction: (params) => {
      const { voidId, axes } = params as {
        voidId?: string;
        axes?: { axis: Axis; positions: number[] }[];
      };

      if (!voidId || !axes?.length) return null;

      // Filter out axes with empty positions
      const validAxes = axes.filter(a => a.positions && a.positions.length > 0);
      if (validAxes.length === 0) return null;

      // If only one axis with positions, use ADD_SUBDIVISIONS for backwards compatibility
      if (validAxes.length === 1) {
        return {
          type: 'ADD_SUBDIVISIONS',
          targetId: 'main-assembly',
          payload: { voidId, axis: validAxes[0].axis, positions: validAxes[0].positions },
        };
      }

      // Multi-axis: use ADD_GRID_SUBDIVISION
      return {
        type: 'ADD_GRID_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId, axes: validAxes },
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

  'configure': {
    id: 'configure',
    name: 'Configure',
    type: 'parameter',
    selectionType: 'none',  // Accepts either assembly or panel selection
    minSelection: 0,  // No minimum - will prompt for selection
    maxSelection: 1,
    availableIn: ['3d'],
    description: 'Configure assembly or face settings',
    shortcut: 'g',
    createPreviewAction: (params) => {
      const {
        // Assembly params
        thickness,
        fingerWidth,
        fingerGap,
        assemblyAxis,
        lidPositiveTabDirection,
        lidPositiveInset,
        lidNegativeTabDirection,
        lidNegativeInset,
        feet,
        // Face params
        faceId,
        faceSolid,
        faceTabDirection,
        faceLidSide,
      } = params as {
        thickness?: number;
        fingerWidth?: number;
        fingerGap?: number;
        assemblyAxis?: Axis;
        lidPositiveTabDirection?: 'tabs-in' | 'tabs-out';
        lidPositiveInset?: number;
        lidNegativeTabDirection?: 'tabs-in' | 'tabs-out';
        lidNegativeInset?: number;
        feet?: FeetConfig;
        // Face-specific params
        faceId?: FaceId;
        faceSolid?: boolean;
        faceTabDirection?: 'tabs-in' | 'tabs-out';
        faceLidSide?: 'positive' | 'negative';
      };

      // Face configuration mode - use CONFIGURE_FACE action
      if (faceId !== undefined) {
        return {
          type: 'CONFIGURE_FACE',
          targetId: 'main-assembly',
          payload: {
            faceId,
            ...(faceSolid !== undefined && { solid: faceSolid }),
            ...(faceTabDirection !== undefined && { lidTabDirection: faceTabDirection }),
          },
        };
      }

      // Assembly configuration mode
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
          ...(feet !== undefined && { feet }),
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

  'inset-outset': {
    id: 'inset-outset',
    name: 'Inset/Outset',
    type: 'parameter',
    selectionType: 'edge',
    minSelection: 1,
    maxSelection: Infinity,
    availableIn: ['3d'],
    description: 'Extend or retract panel edges',
    shortcut: 'i',
    createPreviewAction: (params) => {
      const { edges, offset, baseExtensions } = params as {
        edges?: string[];  // Format: "panelId:edge"
        offset?: number;
        baseExtensions?: Record<string, number>;  // Map of "panelId:edge" to base value
      };

      if (!edges?.length || offset === undefined) return null;

      // Convert edge keys to extension objects
      // Use base value + offset (delta model), falling back to just offset if no base
      const extensions = edges.map(edgeKey => {
        const [panelId, edge] = edgeKey.split(':');
        const baseValue = baseExtensions?.[edgeKey] ?? 0;
        return {
          panelId,
          edge: edge as 'top' | 'bottom' | 'left' | 'right',
          value: baseValue + offset,
        };
      });

      return {
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: 'main-assembly',
        payload: { extensions },
      };
    },
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

  'move': {
    id: 'move',
    name: 'Move',
    type: 'parameter',
    selectionType: 'panel',
    minSelection: 1,
    maxSelection: Infinity, // Allow multiple panels
    availableIn: ['3d'],
    description: 'Move divider panels along their axis',
    shortcut: 'm',
    createPreviewAction: (params) => {
      const { moves } = params as { moves?: { subdivisionId: string; newPosition: number }[] };
      if (!moves?.length) return null;

      return {
        type: 'MOVE_SUBDIVISIONS',
        targetId: 'main-assembly',
        payload: { moves },
      };
    },
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

// ==========================================================================
// Tool to Operation Mapping
// ==========================================================================

/**
 * Maps editor tool IDs to their corresponding operation IDs.
 * Not all tools map to operations (e.g., 'select' is just selection mode).
 */
const TOOL_TO_OPERATION: Record<string, OperationId | null> = {
  'select': null,
  'rectangle': null,
  'circle': null,
  'path': null,
  'inset': 'inset-outset',
  'push-pull': 'push-pull',
  'subdivide': 'subdivide',
  'move': 'move',
  'sub-box': 'create-sub-assembly',
  'configure': 'configure',
  'scale': 'scale',
  'chamfer': 'chamfer-fillet',
};

/**
 * Get the operation ID for an editor tool, if any.
 */
export function getOperationForTool(toolId: string): OperationId | null {
  return TOOL_TO_OPERATION[toolId] ?? null;
}

// ==========================================================================
// Selection Expansion - Parent/Child Relationships
// ==========================================================================

/**
 * Selection type hierarchy for expansion.
 * When an operation needs a child type, selecting a parent can expand to children.
 *
 * Hierarchy:
 *   assembly → panel → edge
 *   assembly → panel → corner
 *   assembly → void
 */
const SELECTION_PARENTS: Record<SelectionType, SelectionType[]> = {
  'edge': ['panel', 'assembly'],    // Panels and assemblies can expand to edges
  'corner': ['panel', 'assembly'],  // Panels and assemblies can expand to corners
  'panel': ['assembly'],            // Assemblies can expand to panels
  'void': ['assembly'],             // Assemblies can expand to voids
  'assembly': [],                   // No parent
  'none': [],                       // N/A
};

/**
 * Check if a selection type can be expanded to the target type.
 * For example, 'panel' can expand to 'edge' (panel is parent of edge).
 */
export function canExpandSelection(
  fromType: SelectionType,
  toType: SelectionType
): boolean {
  const parents = SELECTION_PARENTS[toType];
  return parents.includes(fromType);
}

/**
 * Check if an operation allows additional selections based on current count.
 */
export function operationAllowsMoreSelections(
  id: OperationId,
  currentCount: number
): boolean {
  const op = OPERATION_DEFINITIONS[id];
  return currentCount < op.maxSelection;
}

/**
 * Check if an operation's selection requirements are met.
 */
export function operationSelectionValid(
  id: OperationId,
  currentCount: number
): boolean {
  const op = OPERATION_DEFINITIONS[id];
  return currentCount >= op.minSelection && currentCount <= op.maxSelection;
}

/**
 * Get selection behavior for an operation when a specific item type is clicked.
 * Returns:
 *   - 'select': Direct selection of the clicked type
 *   - 'expand': Expand clicked item to child selections
 *   - 'ignore': Operation doesn't accept this selection type
 */
export function getSelectionBehavior(
  operationId: OperationId,
  clickedType: SelectionType,
  currentSelectionCount: number
): 'select' | 'expand' | 'ignore' {
  const op = OPERATION_DEFINITIONS[operationId];

  // Check if we've hit max selections
  if (currentSelectionCount >= op.maxSelection) {
    return 'ignore';
  }

  // Direct match - operation wants this type
  if (op.selectionType === clickedType) {
    return 'select';
  }

  // Check if clicked type is a parent that can expand to what operation needs
  if (canExpandSelection(clickedType, op.selectionType)) {
    return 'expand';
  }

  return 'ignore';
}

/**
 * Get selection behavior for a tool (looks up the operation for the tool).
 * Returns null if the tool doesn't have an associated operation.
 */
export function getSelectionBehaviorForTool(
  toolId: string,
  clickedType: SelectionType,
  currentSelectionCount: number
): 'select' | 'expand' | 'ignore' | null {
  const operationId = getOperationForTool(toolId);
  if (!operationId) {
    return null; // Tool doesn't have an operation, use default behavior
  }
  return getSelectionBehavior(operationId, clickedType, currentSelectionCount);
}

/**
 * Check if a tool's operation allows more selections.
 */
export function toolAllowsMoreSelections(
  toolId: string,
  currentCount: number
): boolean {
  const operationId = getOperationForTool(toolId);
  if (!operationId) {
    return true; // No operation = no limit
  }
  return operationAllowsMoreSelections(operationId, currentCount);
}
