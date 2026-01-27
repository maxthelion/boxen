/**
 * Operation Validation - Check if operations can be performed
 *
 * Validates:
 * - Selection requirements (type, count)
 * - Operation-specific conditions
 */

import { OperationId, ValidationResult } from './types';
import { getOperation, OperationDefinition } from './registry';

// ==========================================================================
// Selection State (interface for what store provides)
// ==========================================================================

export interface SelectionState {
  selectedVoidIds: Set<string>;
  selectedPanelIds: Set<string>;
  selectedCornerIds: Set<string>;
  selectedSubAssemblyIds: Set<string>;
}

// ==========================================================================
// Validation Functions
// ==========================================================================

/**
 * Check if the current selection meets an operation's requirements
 */
export function meetsSelectionRequirements(
  operation: OperationDefinition,
  selection: SelectionState
): ValidationResult {
  const selectionCount = getSelectionCount(operation.selectionType, selection);

  if (selectionCount < operation.minSelection) {
    return {
      valid: false,
      reason: `Select ${operation.minSelection === 1 ? 'a' : operation.minSelection} ${operation.selectionType}${operation.minSelection > 1 ? 's' : ''}`,
    };
  }

  if (selectionCount > operation.maxSelection) {
    return {
      valid: false,
      reason: `Too many ${operation.selectionType}s selected (max ${operation.maxSelection})`,
    };
  }

  return { valid: true };
}

/**
 * Check if an operation can be started with current selection
 */
export function canStartOperation(
  operationId: OperationId,
  selection: SelectionState,
  currentView: '2d' | '3d'
): ValidationResult {
  const operation = getOperation(operationId);

  // Check view availability
  if (!operation.availableIn.includes(currentView)) {
    return {
      valid: false,
      reason: `${operation.name} is not available in ${currentView} view`,
    };
  }

  // Check selection requirements
  return meetsSelectionRequirements(operation, selection);
}

/**
 * Get the count of selected items for a selection type
 */
function getSelectionCount(
  selectionType: string,
  selection: SelectionState
): number {
  switch (selectionType) {
    case 'void':
      return selection.selectedVoidIds.size;
    case 'panel':
      return selection.selectedPanelIds.size;
    case 'corner':
      return selection.selectedCornerIds.size;
    case 'assembly':
      return selection.selectedSubAssemblyIds.size;
    case 'none':
      return 0; // No selection needed
    default:
      return 0;
  }
}

/**
 * Get the selected items for an operation's selection type
 */
export function getSelectedItems(
  selectionType: string,
  selection: SelectionState
): string[] {
  switch (selectionType) {
    case 'void':
      return Array.from(selection.selectedVoidIds);
    case 'panel':
      return Array.from(selection.selectedPanelIds);
    case 'corner':
      return Array.from(selection.selectedCornerIds);
    case 'assembly':
      return Array.from(selection.selectedSubAssemblyIds);
    default:
      return [];
  }
}

// ==========================================================================
// Operation-Specific Validation
// ==========================================================================

/**
 * Additional validation for specific operations
 * Called after basic selection validation passes
 */
export function validateOperationSpecific(
  operationId: OperationId,
  selection: SelectionState,
  context: {
    // Add context data as needed
    isFacePanel?: (panelId: string) => boolean;
    isLeafVoid?: (voidId: string) => boolean;
    hasSubAssembly?: (voidId: string) => boolean;
    arePanelsParallel?: (panel1Id: string, panel2Id: string) => boolean;
  }
): ValidationResult {

  switch (operationId) {
    case 'push-pull': {
      // Push-pull only works on face panels
      const panelId = Array.from(selection.selectedPanelIds)[0];
      if (context.isFacePanel && !context.isFacePanel(panelId)) {
        return { valid: false, reason: 'Select a face panel (not a divider)' };
      }
      return { valid: true };
    }

    case 'subdivide': {
      // Subdivide only works on leaf voids
      const voidId = Array.from(selection.selectedVoidIds)[0];
      if (context.isLeafVoid && !context.isLeafVoid(voidId)) {
        return { valid: false, reason: 'Select a void without subdivisions' };
      }
      return { valid: true };
    }

    case 'subdivide-two-panel': {
      // Two panels must be parallel
      const panels = Array.from(selection.selectedPanelIds);
      if (panels.length === 2 && context.arePanelsParallel) {
        if (!context.arePanelsParallel(panels[0], panels[1])) {
          return { valid: false, reason: 'Select two parallel panels' };
        }
      }
      return { valid: true };
    }

    case 'create-sub-assembly': {
      // Can only create sub-assembly in a leaf void without existing sub-assembly
      const voidId = Array.from(selection.selectedVoidIds)[0];
      if (context.isLeafVoid && !context.isLeafVoid(voidId)) {
        return { valid: false, reason: 'Select a void without subdivisions' };
      }
      if (context.hasSubAssembly && context.hasSubAssembly(voidId)) {
        return { valid: false, reason: 'Void already has a sub-assembly' };
      }
      return { valid: true };
    }

    case 'remove-subdivision': {
      // Can only remove from subdivided voids (non-leaf)
      const voidId = Array.from(selection.selectedVoidIds)[0];
      if (context.isLeafVoid && context.isLeafVoid(voidId)) {
        return { valid: false, reason: 'Select a void with subdivisions' };
      }
      return { valid: true };
    }

    case 'remove-sub-assembly': {
      // Can only remove from voids with sub-assembly
      const voidId = Array.from(selection.selectedVoidIds)[0];
      if (context.hasSubAssembly && !context.hasSubAssembly(voidId)) {
        return { valid: false, reason: 'Void does not have a sub-assembly' };
      }
      return { valid: true };
    }

    default:
      return { valid: true };
  }
}
