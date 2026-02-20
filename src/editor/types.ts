/**
 * Editor State Machine Types
 *
 * Defines the state and actions for the unified editing system.
 * All types are pure TypeScript with no React dependencies.
 */

import { PathPoint } from '../types';

// =============================================================================
// Core Types
// =============================================================================

export type EditorMode = 'idle' | 'operation' | 'draft' | 'editing';

export type ViewType = '2d' | '3d';

export type EdgePosition = 'top' | 'bottom' | 'left' | 'right';

// =============================================================================
// Operation Mode Types
// =============================================================================

export interface OperationState {
  id: string;
  params: Record<string, unknown>;
}

// =============================================================================
// Draft Mode Types
// =============================================================================

export type DraftType = 'polyline' | 'polygon' | 'rectangle' | 'circle' | 'edge-path' | 'freeform-polygon';

/**
 * Path drawing mode for the path tool.
 * - 'forked': Started on boundary line, will modify edge when merged back
 * - 'polygon': Started in open/safe space, creates a closed shape for boolean ops
 */
export type PathDrawMode = 'forked' | 'polygon';

export interface DraftTarget {
  panelId: string;
  edge?: EdgePosition;
  /** For path tool: which mode the draft is in */
  pathMode?: PathDrawMode;
  /** For forked mode: the fork start point on the boundary (SVG coordinates) */
  forkStart?: { x: number; y: number };
  /** For edge-path drafts: whether to mirror the path around the midpoint (t=0.5) */
  mirrored?: boolean;
}

export interface DraftState {
  type: DraftType;
  target: DraftTarget;
  points: PathPoint[];
}

// =============================================================================
// Edit Session Types
// =============================================================================

export type MicroEditType = 'move-node' | 'add-node' | 'delete-node' | 'set-property';

export interface MicroEdit {
  type: MicroEditType;
  // Node edits
  nodeIndex?: number;
  fromPoint?: PathPoint;
  toPoint?: PathPoint;
  // Property edits
  property?: string;
  fromValue?: unknown;
  toValue?: unknown;
}

export interface EditSessionState {
  targetId: string;
  targetType: 'path' | 'cutout' | 'edge';
  initialSnapshot: unknown;
  history: MicroEdit[];
  historyIndex: number; // -1 means no edits, 0 means first edit applied, etc.
}

// =============================================================================
// Editor State
// =============================================================================

export interface EditorState {
  mode: EditorMode;

  // View tracking
  activeView: ViewType;
  originView: ViewType; // View that started the current mode

  // Mode-specific state (only one is active at a time)
  operation?: OperationState;
  draft?: DraftState;
  editSession?: EditSessionState;
}

// =============================================================================
// Editor Actions
// =============================================================================

export type EditorAction =
  // Mode transitions
  | { type: 'START_OPERATION'; operationId: string; params?: Record<string, unknown> }
  | { type: 'START_DRAFT'; draftType: DraftType; target: DraftTarget }
  | { type: 'START_EDIT_SESSION'; targetId: string; targetType: EditSessionState['targetType']; snapshot: unknown }

  // Operation mode actions
  | { type: 'UPDATE_PARAMS'; params: Record<string, unknown> }

  // Draft mode actions
  | { type: 'ADD_DRAFT_POINT'; point: PathPoint }
  | { type: 'UPDATE_DRAFT_POINT'; index: number; point: PathPoint }
  | { type: 'REMOVE_DRAFT_POINT'; index: number }
  | { type: 'UPDATE_DRAFT_TARGET'; targetUpdate: Partial<DraftTarget> }

  // Edit session actions
  | { type: 'RECORD_EDIT'; edit: MicroEdit }

  // Universal actions
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'COMMIT' }
  | { type: 'CANCEL' }
  | { type: 'SET_VIEW'; view: ViewType };

// =============================================================================
// Initial State
// =============================================================================

export const initialEditorState: EditorState = {
  mode: 'idle',
  activeView: '3d',
  originView: '3d',
};
