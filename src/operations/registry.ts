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
