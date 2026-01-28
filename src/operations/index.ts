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

// Validation (basic)
export {
  meetsSelectionRequirements,
  canStartOperation,
  getSelectedItems,
  validateOperationSpecific,
  type SelectionState,
} from './validation';

// Validation (declarative system)
export {
  // Types
  type SelectionTargetType,
  type SelectionRequirement,
  type SelectionConstraint,
  type SelectionValidationResult,
  type DerivedSelectionState,
  type ValidationContext,
  // Requirement functions
  getSelectionRequirements,
  // Validation functions
  validateSelection,
  validateSubdivideSelection,
  validateSubdivideTwoPanelSelection,
  validatePushPullSelection,
  validateCreateSubAssemblySelection,
  validateToggleFaceSelection,
  // Helper functions
  getFaceNormalAxis,
  getPanelNormalAxis,
  getPerpendicularAxes,
  areOpposingFaces,
  isLeafVoid,
  findVoidById,
  findVoidBetweenPanels,
  getValidSubdivisionAxes,
  getPanelDescription,
  getMainInteriorVoid,
} from './validators';
