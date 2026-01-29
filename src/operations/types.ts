/**
 * Operation Types - Core type definitions for the operations system
 *
 * Operations are user actions that modify the model. They follow a consistent
 * lifecycle with preview support.
 */

import { FaceId, Axis } from '../engine/types';

// ==========================================================================
// Operation Identifiers
// ==========================================================================

/**
 * All available operation IDs
 */
export type OperationId =
  // Parameter operations (have preview phase)
  | 'push-pull'
  | 'subdivide'
  | 'subdivide-two-panel'
  | 'subdivide-grid'
  | 'create-sub-assembly'
  | 'configure'
  | 'scale'
  | 'chamfer-fillet'
  | 'move'
  | 'inset-outset'
  // Immediate operations (execute instantly)
  | 'toggle-face'
  | 'remove-subdivision'
  | 'remove-sub-assembly'
  // View operations (no model change)
  | 'edit-in-2d';

/**
 * Operation type categories
 */
export type OperationType = 'parameter' | 'immediate' | 'view';

/**
 * Selection target type
 */
export type SelectionType = 'void' | 'panel' | 'corner' | 'assembly' | 'edge' | 'none';

// ==========================================================================
// Operation Phase
// ==========================================================================

/**
 * Operation lifecycle phases
 */
export type OperationPhase = 'idle' | 'awaiting-selection' | 'active';

// ==========================================================================
// Operation Parameters
// ==========================================================================

/**
 * Parameters for push-pull operation
 */
export interface PushPullParams {
  faceId: FaceId;
  offset: number;
  mode: 'scale' | 'extend';
}

/**
 * Parameters for subdivide operation
 */
export interface SubdivideParams {
  voidId: string;
  axis: Axis;
  count: number;
  positions: number[];
}

/**
 * Parameters for subdivide-two-panel operation
 */
export interface SubdivideTwoPanelParams {
  panel1Id: string;
  panel2Id: string;
  axis: Axis;
  count: number;
  positions: number[];
}

/**
 * Parameters for subdivide-grid operation (multi-axis)
 */
export interface SubdivideGridParams {
  voidId: string;
  axes: { axis: Axis; count: number; positions: number[] }[];
}

/**
 * Parameters for create-sub-assembly operation
 */
export interface CreateSubAssemblyParams {
  voidId: string;
  clearance: number;
  assemblyAxis: Axis;
}

/**
 * Parameters for configure-assembly operation (no dimensions - use scale for that)
 */
export interface ConfigureAssemblyParams {
  thickness?: number;
  fingerWidth?: number;
  fingerGap?: number;
  assemblyAxis?: Axis;
  lidPositiveTabDirection?: 'tabs-in' | 'tabs-out';
  lidPositiveInset?: number;
  lidNegativeTabDirection?: 'tabs-in' | 'tabs-out';
  lidNegativeInset?: number;
}

/**
 * Parameters for scale operation
 */
export interface ScaleParams {
  width?: number;
  height?: number;
  depth?: number;
}

/**
 * Parameters for chamfer-fillet operation
 */
export interface ChamferFilletParams {
  cornerIds: string[];
  radius: number;
  type: 'chamfer' | 'fillet';
}

/**
 * Parameters for inset-outset operation
 */
export interface InsetOutsetParams {
  /** Selected edges in format "panelId:edge" */
  edges: string[];
  /** Extension value (positive = outward, negative = inward) */
  offset: number;
}

/**
 * Parameters for toggle-face operation
 */
export interface ToggleFaceParams {
  faceId: FaceId;
}

/**
 * Parameters for remove-subdivision operation
 */
export interface RemoveSubdivisionParams {
  voidId: string;
}

/**
 * Parameters for remove-sub-assembly operation
 */
export interface RemoveSubAssemblyParams {
  voidId: string;
}

/**
 * Parameters for edit-in-2d operation
 */
export interface EditIn2DParams {
  panelId: string;
}

/**
 * Parameters for move operation
 */
export interface MoveParams {
  /** Map of subdivision ID to new position (absolute coordinate) */
  moves: { subdivisionId: string; newPosition: number }[];
}

/**
 * Union of all operation parameters
 */
export type OperationParams =
  | PushPullParams
  | SubdivideParams
  | SubdivideTwoPanelParams
  | SubdivideGridParams
  | CreateSubAssemblyParams
  | ConfigureAssemblyParams
  | ScaleParams
  | ChamferFilletParams
  | InsetOutsetParams
  | ToggleFaceParams
  | RemoveSubdivisionParams
  | RemoveSubAssemblyParams
  | EditIn2DParams
  | MoveParams;

// ==========================================================================
// Operation State
// ==========================================================================

/**
 * Current operation state stored in the UI store
 */
export interface OperationState {
  /** Currently active operation, or null if idle */
  activeOperation: OperationId | null;
  /** Current phase of the operation lifecycle */
  phase: OperationPhase;
  /** Operation-specific parameters */
  params: Record<string, unknown>;
}

/**
 * Initial operation state
 */
export const INITIAL_OPERATION_STATE: OperationState = {
  activeOperation: null,
  phase: 'idle',
  params: {},
};

// ==========================================================================
// Validation
// ==========================================================================

/**
 * Result of operation validation
 */
export interface ValidationResult {
  valid: boolean;
  reason?: string;
}
