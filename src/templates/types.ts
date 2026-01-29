/**
 * Project Template Types
 *
 * Templates are parameterized action sequences that can be replayed
 * with different variable values (dimensions, subdivision counts).
 */

import { Axis, EngineAction } from '../engine/types';

/**
 * Template action - may include subdivision configuration for parameterization
 */
export interface TemplateAction {
  type: EngineAction['type'];
  targetId: string;
  payload: Record<string, unknown>;

  /**
   * For subdivision actions: marks this as generating a count variable.
   * The axis determines the variable name (e.g., 'yCount' for Y-axis subdivisions).
   */
  subdivisionConfig?: {
    axis: Axis;
    defaultCount: number;
    variableName?: string; // Override default name (e.g., "Drawer Count" instead of "Y Divisions")
    positionFormula: 'equal-spacing';
  };
}

/**
 * Project template definition
 */
export interface ProjectTemplate {
  id: string;
  name: string;
  description?: string;
  category?: 'storage' | 'organization' | 'general';
  thumbnail?: string;

  /**
   * Initial assembly dimensions (always parameterizable)
   */
  initialAssembly: {
    width: number;
    height: number;
    depth: number;
    materialThickness: number;
    fingerWidth: number;
    fingerGap: number;
  };

  /**
   * The action sequence - THIS is the source of truth.
   * Variables are derived by analyzing this sequence.
   */
  actionSequence: TemplateAction[];
}

/**
 * Dimension variable configuration
 */
export interface DimensionVariable {
  default: number;
  min: number;
  max: number;
}

/**
 * Subdivision variable configuration
 */
export interface SubdivisionVariable {
  variableName: string;
  axis: Axis;
  default: number;
  min: number;
  max: number;
}

/**
 * Variables derived from a template's action sequence
 */
export interface DerivedVariables {
  /** Always present - width, height, depth */
  dimensions: {
    width: DimensionVariable;
    height: DimensionVariable;
    depth: DimensionVariable;
  };

  /** Only present if actionSequence contains subdivision actions */
  subdivisions?: Record<Axis, SubdivisionVariable>;
}

/**
 * Values provided when instantiating a template
 */
export interface InstantiationValues {
  /** Dimensions (always present) */
  width: number;
  height: number;
  depth: number;

  /** Subdivision counts (only for axes that have subdivisionConfig) */
  subdivisionCounts?: Partial<Record<Axis, number>>;
}
