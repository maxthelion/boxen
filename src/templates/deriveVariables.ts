/**
 * Derive Variables from Template
 *
 * Scans a template's action sequence to discover configurable variables:
 * - Dimensions are always present
 * - Subdivision counts are derived from actions with subdivisionConfig
 */

import { Axis } from '../engine/types';
import { ProjectTemplate, DerivedVariables, SubdivisionVariable } from './types';

/**
 * Get human-readable axis name
 */
function axisName(axis: Axis): string {
  switch (axis) {
    case 'x':
      return 'X';
    case 'y':
      return 'Y';
    case 'z':
      return 'Z';
  }
}

/**
 * Derive configurable variables from a template's action sequence
 */
export function deriveVariables(template: ProjectTemplate): DerivedVariables {
  const variables: DerivedVariables = {
    dimensions: {
      width: {
        default: template.initialAssembly.width,
        min: 50,
        max: 500,
      },
      height: {
        default: template.initialAssembly.height,
        min: 50,
        max: 500,
      },
      depth: {
        default: template.initialAssembly.depth,
        min: 50,
        max: 500,
      },
    },
  };

  // Scan action sequence for subdivision configs
  for (const action of template.actionSequence) {
    if (action.subdivisionConfig) {
      const { axis, defaultCount, variableName } = action.subdivisionConfig;

      if (!variables.subdivisions) {
        variables.subdivisions = {} as Record<Axis, SubdivisionVariable>;
      }

      variables.subdivisions[axis] = {
        variableName: variableName || `${axisName(axis)} Divisions`,
        axis,
        default: defaultCount,
        min: 1,
        max: 10,
      };
    }
  }

  return variables;
}

/**
 * Get default instantiation values from a template
 */
export function getDefaultValues(template: ProjectTemplate): {
  width: number;
  height: number;
  depth: number;
  subdivisionCounts: Partial<Record<Axis, number>>;
} {
  const variables = deriveVariables(template);

  const subdivisionCounts: Partial<Record<Axis, number>> = {};
  if (variables.subdivisions) {
    for (const [axis, config] of Object.entries(variables.subdivisions)) {
      subdivisionCounts[axis as Axis] = config.default;
    }
  }

  return {
    width: variables.dimensions.width.default,
    height: variables.dimensions.height.default,
    depth: variables.dimensions.depth.default,
    subdivisionCounts,
  };
}
