/**
 * Editor Module
 *
 * Unified editing system for all interaction modes:
 * - Operation: Discrete parameter changes (inset, fillet)
 * - Draft: Creating new geometry (drawing tools)
 * - Edit Session: Modifying existing geometry (node editing)
 */

// Types
export * from './types';

// State machine (pure, testable)
export {
  editorReducer,
  canUndo,
  canRedo,
  canCommit,
  getOperationParams,
  getDraftPoints,
  getActiveEdits,
  getInitialSnapshot,
  canSwitchView,
  createInitialState,
} from './EditorStateMachine';

// React integration
export { EditorProvider, useEditor, useEditorOptional } from './EditorContext';
export { useEditorKeyboard } from './useEditorKeyboard';
export type { EditorContextValue } from './useEditorContext';
