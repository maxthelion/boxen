/**
 * Operations Module
 *
 * Centralized system for all user operations that modify the model.
 * Provides:
 * - Type definitions
 * - Operation registry with definitions
 * - Validation utilities
 */

// Types
export * from './types';

// Registry
export {
  OPERATION_DEFINITIONS,
  getOperation,
  getOperationsByType,
  getOperationsForView,
  getOperationsForSelection,
  operationHasPreview,
  operationIsImmediate,
  operationIsViewOnly,
  type OperationDefinition,
} from './registry';

// Validation
export {
  meetsSelectionRequirements,
  canStartOperation,
  getSelectedItems,
  validateOperationSpecific,
  type SelectionState,
} from './validation';
