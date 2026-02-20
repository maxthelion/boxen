/**
 * Editor State Machine
 *
 * Pure reducer function with no React dependencies.
 * Handles all three editing modes: Operation, Draft, and Edit Session.
 *
 * This is the core logic that can be unit tested without React.
 */

import {
  EditorState,
  EditorAction,
  initialEditorState,
  MicroEdit,
} from './types';

// =============================================================================
// Main Reducer
// =============================================================================

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    // =========================================================================
    // Mode Transitions
    // =========================================================================

    case 'START_OPERATION':
      return {
        ...state,
        mode: 'operation',
        originView: state.activeView,
        operation: {
          id: action.operationId,
          params: action.params ?? {},
        },
        // Clear other modes
        draft: undefined,
        editSession: undefined,
      };

    case 'START_DRAFT':
      return {
        ...state,
        mode: 'draft',
        originView: state.activeView,
        draft: {
          type: action.draftType,
          target: action.target,
          points: [],
        },
        // Clear other modes
        operation: undefined,
        editSession: undefined,
      };

    case 'START_EDIT_SESSION':
      return {
        ...state,
        mode: 'editing',
        originView: state.activeView,
        editSession: {
          targetId: action.targetId,
          targetType: action.targetType,
          initialSnapshot: action.snapshot,
          history: [],
          historyIndex: -1,
        },
        // Clear other modes
        operation: undefined,
        draft: undefined,
      };

    // =========================================================================
    // Operation Mode Actions
    // =========================================================================

    case 'UPDATE_PARAMS':
      if (state.mode !== 'operation' || !state.operation) {
        return state;
      }
      return {
        ...state,
        operation: {
          ...state.operation,
          params: { ...state.operation.params, ...action.params },
        },
      };

    // =========================================================================
    // Draft Mode Actions
    // =========================================================================

    case 'ADD_DRAFT_POINT':
      if (state.mode !== 'draft' || !state.draft) {
        return state;
      }
      return {
        ...state,
        draft: {
          ...state.draft,
          points: [...state.draft.points, action.point],
        },
      };

    case 'UPDATE_DRAFT_POINT':
      if (state.mode !== 'draft' || !state.draft) {
        return state;
      }
      if (action.index < 0 || action.index >= state.draft.points.length) {
        return state;
      }
      return {
        ...state,
        draft: {
          ...state.draft,
          points: state.draft.points.map((p, i) =>
            i === action.index ? action.point : p
          ),
        },
      };

    case 'REMOVE_DRAFT_POINT':
      if (state.mode !== 'draft' || !state.draft) {
        return state;
      }
      if (action.index < 0 || action.index >= state.draft.points.length) {
        return state;
      }
      return {
        ...state,
        draft: {
          ...state.draft,
          points: state.draft.points.filter((_, i) => i !== action.index),
        },
      };

    case 'UPDATE_DRAFT_TARGET':
      if (state.mode !== 'draft' || !state.draft) {
        return state;
      }
      return {
        ...state,
        draft: {
          ...state.draft,
          target: { ...state.draft.target, ...action.targetUpdate },
        },
      };

    // =========================================================================
    // Edit Session Actions
    // =========================================================================

    case 'RECORD_EDIT':
      if (state.mode !== 'editing' || !state.editSession) {
        return state;
      }
      // When recording a new edit, truncate any redo history
      const newHistory = state.editSession.history.slice(0, state.editSession.historyIndex + 1);
      return {
        ...state,
        editSession: {
          ...state.editSession,
          history: [...newHistory, action.edit],
          historyIndex: newHistory.length, // Point to the new edit
        },
      };

    // =========================================================================
    // Universal Actions
    // =========================================================================

    case 'UNDO':
      return handleUndo(state);

    case 'REDO':
      return handleRedo(state);

    case 'COMMIT':
      // Commit resets to idle - the actual commit logic happens in the hook
      return {
        ...state,
        mode: 'idle',
        operation: undefined,
        draft: undefined,
        editSession: undefined,
      };

    case 'CANCEL':
      // Cancel resets to idle - the actual restore logic happens in the hook
      return {
        ...state,
        mode: 'idle',
        operation: undefined,
        draft: undefined,
        editSession: undefined,
      };

    case 'SET_VIEW':
      return {
        ...state,
        activeView: action.view,
      };

    default:
      return state;
  }
}

// =============================================================================
// Undo/Redo Handlers
// =============================================================================

function handleUndo(state: EditorState): EditorState {
  switch (state.mode) {
    case 'draft':
      // Pop last point from draft buffer
      if (!state.draft || state.draft.points.length === 0) {
        return state;
      }
      return {
        ...state,
        draft: {
          ...state.draft,
          points: state.draft.points.slice(0, -1),
        },
      };

    case 'editing':
      // Step back through edit history
      if (!state.editSession || state.editSession.historyIndex < 0) {
        return state;
      }
      return {
        ...state,
        editSession: {
          ...state.editSession,
          historyIndex: state.editSession.historyIndex - 1,
        },
      };

    case 'operation':
      // Operations don't have undo - user should cancel or adjust params
      return state;

    default:
      return state;
  }
}

function handleRedo(state: EditorState): EditorState {
  switch (state.mode) {
    case 'draft':
      // Draft mode doesn't have redo - points are permanently removed on undo
      return state;

    case 'editing':
      // Step forward through edit history
      if (!state.editSession) {
        return state;
      }
      const maxIndex = state.editSession.history.length - 1;
      if (state.editSession.historyIndex >= maxIndex) {
        return state;
      }
      return {
        ...state,
        editSession: {
          ...state.editSession,
          historyIndex: state.editSession.historyIndex + 1,
        },
      };

    default:
      return state;
  }
}

// =============================================================================
// Helper Functions (Pure, Testable)
// =============================================================================

/**
 * Check if undo is available in the current mode
 */
export function canUndo(state: EditorState): boolean {
  switch (state.mode) {
    case 'draft':
      return !!state.draft && state.draft.points.length > 0;

    case 'editing':
      return !!state.editSession && state.editSession.historyIndex >= 0;

    default:
      return false;
  }
}

/**
 * Check if redo is available in the current mode
 */
export function canRedo(state: EditorState): boolean {
  switch (state.mode) {
    case 'editing':
      if (!state.editSession) return false;
      return state.editSession.historyIndex < state.editSession.history.length - 1;

    default:
      return false;
  }
}

/**
 * Check if the current mode has something to commit
 */
export function canCommit(state: EditorState): boolean {
  switch (state.mode) {
    case 'operation':
      // Operations can always be committed (engine validates)
      return !!state.operation;

    case 'draft':
      // Draft needs at least some points (exact minimum depends on draft type)
      if (!state.draft) return false;
      switch (state.draft.type) {
        case 'polyline':
        case 'edge-path':
          return state.draft.points.length >= 2;
        case 'polygon':
          return state.draft.points.length >= 3;
        case 'rectangle':
        case 'circle':
          return state.draft.points.length >= 2; // Start and end points
        default:
          return state.draft.points.length > 0;
      }

    case 'editing':
      // Edit sessions can always be committed (even with no changes)
      return !!state.editSession;

    default:
      return false;
  }
}

/**
 * Get operation parameters (if in operation mode)
 */
export function getOperationParams(state: EditorState): Record<string, unknown> | null {
  if (state.mode !== 'operation' || !state.operation) {
    return null;
  }
  return state.operation.params;
}

/**
 * Get draft points (if in draft mode)
 */
export function getDraftPoints(state: EditorState): readonly import('../types').PathPoint[] {
  if (state.mode !== 'draft' || !state.draft) {
    return [];
  }
  return state.draft.points;
}

/**
 * Get the edits to apply from edit session (up to current history index)
 */
export function getActiveEdits(state: EditorState): readonly MicroEdit[] {
  if (state.mode !== 'editing' || !state.editSession) {
    return [];
  }
  return state.editSession.history.slice(0, state.editSession.historyIndex + 1);
}

/**
 * Get the initial snapshot from edit session (for cancel/restore)
 */
export function getInitialSnapshot(state: EditorState): unknown | null {
  if (state.mode !== 'editing' || !state.editSession) {
    return null;
  }
  return state.editSession.initialSnapshot;
}

/**
 * Check if the current mode is view-restricted
 */
export function isViewRestricted(state: EditorState): boolean {
  // Some modes only work in specific views
  if (state.mode === 'draft') {
    // Draft mode is 2D only
    return true;
  }
  if (state.mode === 'editing') {
    // Edit sessions are view-specific
    return true;
  }
  return false;
}

/**
 * Check if view switch is allowed
 */
export function canSwitchView(state: EditorState, targetView: '2d' | '3d'): boolean {
  if (state.mode === 'idle') {
    return true;
  }
  if (!isViewRestricted(state)) {
    return true;
  }
  // Restricted modes can't switch views
  return state.activeView === targetView;
}

/**
 * Create initial state (useful for testing)
 */
export function createInitialState(overrides?: Partial<EditorState>): EditorState {
  return {
    ...initialEditorState,
    ...overrides,
  };
}
