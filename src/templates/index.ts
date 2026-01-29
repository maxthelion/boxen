/**
 * Templates Module - Public API
 *
 * Project templates are parameterized action sequences that can be
 * replayed with different variable values (dimensions, subdivision counts).
 */

// Types
export type {
  ProjectTemplate,
  TemplateAction,
  DerivedVariables,
  DimensionVariable,
  SubdivisionVariable,
  InstantiationValues,
} from './types';

// Variable derivation
export { deriveVariables, getDefaultValues } from './deriveVariables';

// Template engine
export {
  instantiateTemplate,
  instantiateTemplateIntoPreview,
  computeSubdivisionPositions,
} from './templateEngine';

// Built-in templates
export { builtinTemplates, getTemplateById, getAllTemplates } from './builtinTemplates';
