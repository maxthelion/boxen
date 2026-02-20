/**
 * Editor Context Hook
 *
 * Thin React wrapper around the pure EditorStateMachine.
 * Connects state machine to the engine for preview/commit operations.
 */

import { useReducer, useCallback, useEffect, useMemo } from 'react';
import {
  editorReducer,
  canUndo,
  canRedo,
  canCommit,
  getDraftPoints,
  canSwitchView,
} from './EditorStateMachine';
import {
  EditorState,
  initialEditorState,
  DraftType,
  DraftTarget,
  MicroEdit,
  ViewType,
  EditSessionState,
} from './types';
import { PathPoint } from '../types';
import { getEngine, notifyEngineStateChanged } from '../engine';
import { getOperation } from '../operations/registry';
import { OperationId } from '../operations/types';

export interface EditorContextValue {
  // State
  mode: EditorState['mode'];
  isActive: boolean;
  activeView: ViewType;
  originView: ViewType;

  // Operation mode
  operationId: string | undefined;
  operationParams: Record<string, unknown>;

  // Draft mode
  draftType: DraftType | undefined;
  draftTarget: DraftTarget | undefined;
  draftPoints: readonly PathPoint[];

  // Edit session mode
  editTargetId: string | undefined;
  editTargetType: EditSessionState['targetType'] | undefined;

  // Capabilities
  canUndo: boolean;
  canRedo: boolean;
  canCommit: boolean;
  canSwitchToView: (view: ViewType) => boolean;

  // Actions
  startOperation: (operationId: string, params?: Record<string, unknown>) => void;
  updateParams: (params: Record<string, unknown>) => void;
  startDraft: (type: DraftType, target: DraftTarget) => void;
  addDraftPoint: (point: PathPoint) => void;
  updateDraftPoint: (index: number, point: PathPoint) => void;
  removeDraftPoint: (index: number) => void;
  updateDraftTarget: (targetUpdate: Partial<DraftTarget>) => void;
  startEditSession: (targetId: string, targetType: EditSessionState['targetType'], snapshot: unknown) => void;
  recordEdit: (edit: MicroEdit) => void;
  undo: () => void;
  redo: () => void;
  commit: () => void;
  cancel: () => void;
  setView: (view: ViewType) => void;
}

export function useEditorContext(): EditorContextValue {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);

  // ===========================================================================
  // Engine Integration for Operation Mode
  // ===========================================================================

  // Sync operation params to engine preview
  useEffect(() => {
    if (state.mode !== 'operation' || !state.operation) {
      return;
    }

    const engine = getEngine();

    // Try to get operation definition - may not exist for all operation IDs
    let opDef;
    try {
      opDef = getOperation(state.operation.id as OperationId);
    } catch {
      // Operation ID not in registry
      return;
    }

    if (!opDef?.createPreviewAction) {
      return;
    }

    const action = opDef.createPreviewAction(state.operation.params);
    if (!action) {
      return;
    }

    // Start preview if not already active
    if (!engine.hasPreview()) {
      engine.startPreview();
    }

    // Dispatch action to preview scene
    engine.dispatch(action, { preview: true });
    notifyEngineStateChanged();
  }, [state.mode, state.operation?.id, state.operation?.params]);

  // ===========================================================================
  // Commit Handler
  // ===========================================================================

  const commit = useCallback(() => {
    const engine = getEngine();

    if (state.mode === 'operation') {
      // Commit the preview to the main scene
      engine.commitPreview();
      notifyEngineStateChanged();
    } else if (state.mode === 'draft' && state.draft) {
      // Create operation from draft based on draft type
      if (state.draft.type === 'edge-path' && state.draft.target.edge) {
        // Convert draft points to EdgePathPoints and dispatch SET_EDGE_PATH
        const rawPoints = state.draft.points.map(p => ({
          t: p.x,      // x stores the t value (0-1 along edge)
          offset: p.y, // y stores the offset (perpendicular distance)
        }));

        if (rawPoints.length >= 2) {
          // Find the t-range of the new path (without sorting - preserve click order)
          const tValues = rawPoints.map(p => p.t);
          const firstT = Math.min(...tValues);
          const lastT = Math.max(...tValues);

          // Get existing edge path for this edge (to merge with)
          const panelId = state.draft.target.panelId;
          const edge = state.draft.target.edge;
          const snapshot = engine.getSnapshot();
          const assembly = snapshot.children[0];
          let existingPath: { t: number; offset: number }[] = [];

          if (assembly && 'derived' in assembly) {
            const panels = assembly.derived.panels || [];
            const panel = panels.find((p: { id: string }) => p.id === panelId);
            if (panel && 'props' in panel) {
              const customEdgePaths = (panel.props as { customEdgePaths?: Array<{ edge: string; points: Array<{ t: number; offset: number }> }> }).customEdgePaths || [];
              const existingEdgePath = customEdgePaths.find(p => p.edge === edge);
              if (existingEdgePath) {
                existingPath = existingEdgePath.points;
              }
            }
          }

          // Merge: keep existing points outside the new path's t-range
          const mergedPoints: { t: number; offset: number }[] = [];

          // Add existing points BEFORE the new path starts
          for (const p of existingPath) {
            if (p.t < firstT - 0.001) {
              mergedPoints.push(p);
            }
          }

          // If there's a gap between existing points and new path, add anchor
          if (mergedPoints.length === 0 && firstT > 0.001) {
            // No existing points before - preserve existing path's start offset if available
            if (existingPath.length > 0) {
              const sorted = [...existingPath].sort((a, b) => a.t - b.t);
              // Add anchor at t=0 preserving existing path's start
              if (sorted[0].t < 0.001) {
                mergedPoints.push({ t: 0, offset: sorted[0].offset });
              } else {
                mergedPoints.push({ t: 0, offset: 0 });
              }
            } else {
              mergedPoints.push({ t: 0, offset: 0 });
            }
          }

          // Add all the new custom path points (preserve click order)
          mergedPoints.push(...rawPoints);

          // Add existing points AFTER the new path ends
          for (const p of existingPath) {
            if (p.t > lastT + 0.001) {
              mergedPoints.push(p);
            }
          }

          // If there's a gap after new path, add anchor at t=1
          const hasPointsAfter = mergedPoints.some(p => p.t > lastT + 0.001);
          if (!hasPointsAfter && lastT < 0.999) {
            // Check if existing path had points after that we should preserve
            if (existingPath.length > 0) {
              const sorted = [...existingPath].sort((a, b) => a.t - b.t);
              if (sorted[sorted.length - 1].t > 0.999) {
                mergedPoints.push({ t: 1, offset: sorted[sorted.length - 1].offset });
              } else {
                mergedPoints.push({ t: 1, offset: 0 });
              }
            } else {
              mergedPoints.push({ t: 1, offset: 0 });
            }
          }

          // Note: We do NOT sort the final merged points by t.
          // The user's points are kept in click order, which preserves
          // their intended path shape (e.g., peaks, zigzags).
          // Existing points before/after are already in order.

          engine.dispatch({
            type: 'SET_EDGE_PATH',
            targetId: 'main-assembly',
            payload: {
              panelId: state.draft.target.panelId,
              path: {
                edge: state.draft.target.edge,
                baseOffset: 0, // Default: no offset from joint face
                points: mergedPoints,
                mirrored: state.draft.target.mirrored ?? false,
              },
            },
          });
          notifyEngineStateChanged();
        }
      } else {
        // Other draft types (polyline, polygon, etc.) - to be implemented
        console.log('Draft commit:', state.draft.type, state.draft.points);
      }
    } else if (state.mode === 'editing' && state.editSession) {
      // Edit session commits the current state (edits are already applied)
      // No additional engine action needed - state is already live
      console.log('Edit session commit:', state.editSession.targetId);
    }

    dispatch({ type: 'COMMIT' });
  }, [state]);

  // ===========================================================================
  // Cancel Handler
  // ===========================================================================

  const cancel = useCallback(() => {
    const engine = getEngine();

    if (state.mode === 'operation') {
      // Discard the preview
      engine.discardPreview();
      notifyEngineStateChanged();
    } else if (state.mode === 'editing' && state.editSession) {
      // Restore initial snapshot
      // This will be expanded when we implement snapshot restoration
      console.log('Restoring snapshot for:', state.editSession.targetId);
      // TODO: Implement snapshot restoration
      // engine.restoreSnapshot(state.editSession.initialSnapshot);
    }
    // Draft mode: nothing to restore - just discard the buffer

    dispatch({ type: 'CANCEL' });
  }, [state]);

  // ===========================================================================
  // Action Dispatchers
  // ===========================================================================

  const startOperation = useCallback((operationId: string, params?: Record<string, unknown>) => {
    dispatch({ type: 'START_OPERATION', operationId, params });
  }, []);

  const updateParams = useCallback((params: Record<string, unknown>) => {
    dispatch({ type: 'UPDATE_PARAMS', params });
  }, []);

  const startDraft = useCallback((type: DraftType, target: DraftTarget) => {
    dispatch({ type: 'START_DRAFT', draftType: type, target });
  }, []);

  const addDraftPoint = useCallback((point: PathPoint) => {
    dispatch({ type: 'ADD_DRAFT_POINT', point });
  }, []);

  const updateDraftPoint = useCallback((index: number, point: PathPoint) => {
    dispatch({ type: 'UPDATE_DRAFT_POINT', index, point });
  }, []);

  const removeDraftPoint = useCallback((index: number) => {
    dispatch({ type: 'REMOVE_DRAFT_POINT', index });
  }, []);

  const updateDraftTarget = useCallback((targetUpdate: Partial<DraftTarget>) => {
    dispatch({ type: 'UPDATE_DRAFT_TARGET', targetUpdate });
  }, []);

  const startEditSession = useCallback((
    targetId: string,
    targetType: EditSessionState['targetType'],
    snapshot: unknown
  ) => {
    dispatch({ type: 'START_EDIT_SESSION', targetId, targetType, snapshot });
  }, []);

  const recordEdit = useCallback((edit: MicroEdit) => {
    dispatch({ type: 'RECORD_EDIT', edit });
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: 'UNDO' });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: 'REDO' });
  }, []);

  const setView = useCallback((view: ViewType) => {
    dispatch({ type: 'SET_VIEW', view });
  }, []);

  // ===========================================================================
  // Derived Values
  // ===========================================================================

  const canSwitchToView = useCallback((view: ViewType) => {
    return canSwitchView(state, view);
  }, [state]);

  const value = useMemo((): EditorContextValue => ({
    // State
    mode: state.mode,
    isActive: state.mode !== 'idle',
    activeView: state.activeView,
    originView: state.originView,

    // Operation mode
    operationId: state.operation?.id,
    operationParams: state.operation?.params ?? {},

    // Draft mode
    draftType: state.draft?.type,
    draftTarget: state.draft?.target,
    draftPoints: getDraftPoints(state),

    // Edit session mode
    editTargetId: state.editSession?.targetId,
    editTargetType: state.editSession?.targetType,

    // Capabilities
    canUndo: canUndo(state),
    canRedo: canRedo(state),
    canCommit: canCommit(state),
    canSwitchToView,

    // Actions
    startOperation,
    updateParams,
    startDraft,
    addDraftPoint,
    updateDraftPoint,
    removeDraftPoint,
    updateDraftTarget,
    startEditSession,
    recordEdit,
    undo,
    redo,
    commit,
    cancel,
    setView,
  }), [
    state,
    canSwitchToView,
    startOperation,
    updateParams,
    startDraft,
    addDraftPoint,
    updateDraftPoint,
    removeDraftPoint,
    updateDraftTarget,
    startEditSession,
    recordEdit,
    undo,
    redo,
    commit,
    cancel,
    setView,
  ]);

  return value;
}
