/**
 * Editor State Machine Tests
 *
 * Tests the pure state machine logic without React.
 */

import { describe, it, expect } from 'vitest';
import {
  editorReducer,
  canUndo,
  canRedo,
  canCommit,
  getOperationParams,
  getDraftPoints,
  getActiveEdits,
  createInitialState,
} from './EditorStateMachine';
import { initialEditorState } from './types';

describe('EditorStateMachine', () => {
  // ===========================================================================
  // Operation Mode
  // ===========================================================================

  describe('Operation mode', () => {
    it('starts operation with initial params', () => {
      const state = editorReducer(initialEditorState, {
        type: 'START_OPERATION',
        operationId: 'inset-outset',
        params: { offset: 5 },
      });

      expect(state.mode).toBe('operation');
      expect(state.operation?.id).toBe('inset-outset');
      expect(state.operation?.params.offset).toBe(5);
    });

    it('starts operation without params', () => {
      const state = editorReducer(initialEditorState, {
        type: 'START_OPERATION',
        operationId: 'chamfer-fillet',
      });

      expect(state.mode).toBe('operation');
      expect(state.operation?.id).toBe('chamfer-fillet');
      expect(state.operation?.params).toEqual({});
    });

    it('updates operation params', () => {
      let state = editorReducer(initialEditorState, {
        type: 'START_OPERATION',
        operationId: 'inset-outset',
        params: { offset: 5 },
      });

      state = editorReducer(state, {
        type: 'UPDATE_PARAMS',
        params: { offset: 10, edge: 'top' },
      });

      expect(state.operation?.params.offset).toBe(10);
      expect(state.operation?.params.edge).toBe('top');
    });

    it('merges params without overwriting unrelated ones', () => {
      let state = editorReducer(initialEditorState, {
        type: 'START_OPERATION',
        operationId: 'test',
        params: { a: 1, b: 2 },
      });

      state = editorReducer(state, {
        type: 'UPDATE_PARAMS',
        params: { b: 20 },
      });

      expect(state.operation?.params.a).toBe(1);
      expect(state.operation?.params.b).toBe(20);
    });

    it('ignores UPDATE_PARAMS when not in operation mode', () => {
      const state = editorReducer(initialEditorState, {
        type: 'UPDATE_PARAMS',
        params: { offset: 10 },
      });

      expect(state.mode).toBe('idle');
      expect(state.operation).toBeUndefined();
    });

    it('cancels operation and returns to idle', () => {
      let state = editorReducer(initialEditorState, {
        type: 'START_OPERATION',
        operationId: 'inset-outset',
      });

      state = editorReducer(state, { type: 'CANCEL' });

      expect(state.mode).toBe('idle');
      expect(state.operation).toBeUndefined();
    });

    it('commits operation and returns to idle', () => {
      let state = editorReducer(initialEditorState, {
        type: 'START_OPERATION',
        operationId: 'inset-outset',
      });

      state = editorReducer(state, { type: 'COMMIT' });

      expect(state.mode).toBe('idle');
      expect(state.operation).toBeUndefined();
    });

    it('tracks origin view when starting operation', () => {
      const state2d = createInitialState({ activeView: '2d' });
      const state = editorReducer(state2d, {
        type: 'START_OPERATION',
        operationId: 'test',
      });

      expect(state.originView).toBe('2d');
    });

    it('canCommit returns true for active operation', () => {
      const state = editorReducer(initialEditorState, {
        type: 'START_OPERATION',
        operationId: 'test',
      });

      expect(canCommit(state)).toBe(true);
    });

    it('getOperationParams returns params in operation mode', () => {
      const state = editorReducer(initialEditorState, {
        type: 'START_OPERATION',
        operationId: 'test',
        params: { foo: 'bar' },
      });

      expect(getOperationParams(state)).toEqual({ foo: 'bar' });
    });

    it('getOperationParams returns null when not in operation mode', () => {
      expect(getOperationParams(initialEditorState)).toBeNull();
    });
  });

  // ===========================================================================
  // Draft Mode
  // ===========================================================================

  describe('Draft mode', () => {
    it('starts draft with empty points', () => {
      const state = editorReducer(initialEditorState, {
        type: 'START_DRAFT',
        draftType: 'polyline',
        target: { panelId: 'panel-1' },
      });

      expect(state.mode).toBe('draft');
      expect(state.draft?.type).toBe('polyline');
      expect(state.draft?.target.panelId).toBe('panel-1');
      expect(state.draft?.points).toEqual([]);
    });

    it('starts edge path draft with edge target', () => {
      const state = editorReducer(initialEditorState, {
        type: 'START_DRAFT',
        draftType: 'edge-path',
        target: { panelId: 'panel-1', edge: 'bottom' },
      });

      expect(state.draft?.type).toBe('edge-path');
      expect(state.draft?.target.edge).toBe('bottom');
    });

    it('accumulates draft points', () => {
      let state = editorReducer(initialEditorState, {
        type: 'START_DRAFT',
        draftType: 'polyline',
        target: { panelId: 'panel-1' },
      });

      state = editorReducer(state, { type: 'ADD_DRAFT_POINT', point: { x: 0, y: 0 } });
      state = editorReducer(state, { type: 'ADD_DRAFT_POINT', point: { x: 10, y: 0 } });
      state = editorReducer(state, { type: 'ADD_DRAFT_POINT', point: { x: 10, y: 10 } });

      expect(state.draft?.points).toHaveLength(3);
      expect(state.draft?.points[0]).toEqual({ x: 0, y: 0 });
      expect(state.draft?.points[2]).toEqual({ x: 10, y: 10 });
    });

    it('updates draft point at index', () => {
      let state = editorReducer(initialEditorState, {
        type: 'START_DRAFT',
        draftType: 'polyline',
        target: { panelId: 'panel-1' },
      });
      state = editorReducer(state, { type: 'ADD_DRAFT_POINT', point: { x: 0, y: 0 } });
      state = editorReducer(state, { type: 'ADD_DRAFT_POINT', point: { x: 10, y: 0 } });

      state = editorReducer(state, {
        type: 'UPDATE_DRAFT_POINT',
        index: 1,
        point: { x: 15, y: 5 },
      });

      expect(state.draft?.points[1]).toEqual({ x: 15, y: 5 });
    });

    it('ignores update at invalid index', () => {
      let state = editorReducer(initialEditorState, {
        type: 'START_DRAFT',
        draftType: 'polyline',
        target: { panelId: 'panel-1' },
      });
      state = editorReducer(state, { type: 'ADD_DRAFT_POINT', point: { x: 0, y: 0 } });

      const before = state.draft?.points;
      state = editorReducer(state, {
        type: 'UPDATE_DRAFT_POINT',
        index: 5,
        point: { x: 100, y: 100 },
      });

      expect(state.draft?.points).toEqual(before);
    });

    it('undo removes last draft point', () => {
      let state = editorReducer(initialEditorState, {
        type: 'START_DRAFT',
        draftType: 'polyline',
        target: { panelId: 'panel-1' },
      });
      state = editorReducer(state, { type: 'ADD_DRAFT_POINT', point: { x: 0, y: 0 } });
      state = editorReducer(state, { type: 'ADD_DRAFT_POINT', point: { x: 10, y: 0 } });

      state = editorReducer(state, { type: 'UNDO' });

      expect(state.draft?.points).toHaveLength(1);
      expect(state.draft?.points[0]).toEqual({ x: 0, y: 0 });
    });

    it('undo on empty draft does nothing', () => {
      let state = editorReducer(initialEditorState, {
        type: 'START_DRAFT',
        draftType: 'polyline',
        target: { panelId: 'panel-1' },
      });

      state = editorReducer(state, { type: 'UNDO' });

      expect(state.mode).toBe('draft');
      expect(state.draft?.points).toHaveLength(0);
    });

    it('cancel discards entire draft', () => {
      let state = editorReducer(initialEditorState, {
        type: 'START_DRAFT',
        draftType: 'polyline',
        target: { panelId: 'panel-1' },
      });
      state = editorReducer(state, { type: 'ADD_DRAFT_POINT', point: { x: 0, y: 0 } });
      state = editorReducer(state, { type: 'ADD_DRAFT_POINT', point: { x: 10, y: 0 } });

      state = editorReducer(state, { type: 'CANCEL' });

      expect(state.mode).toBe('idle');
      expect(state.draft).toBeUndefined();
    });

    it('canUndo returns true when draft has points', () => {
      let state = editorReducer(initialEditorState, {
        type: 'START_DRAFT',
        draftType: 'polyline',
        target: { panelId: 'panel-1' },
      });
      expect(canUndo(state)).toBe(false);

      state = editorReducer(state, { type: 'ADD_DRAFT_POINT', point: { x: 0, y: 0 } });
      expect(canUndo(state)).toBe(true);
    });

    it('canRedo always returns false for draft mode', () => {
      let state = editorReducer(initialEditorState, {
        type: 'START_DRAFT',
        draftType: 'polyline',
        target: { panelId: 'panel-1' },
      });
      state = editorReducer(state, { type: 'ADD_DRAFT_POINT', point: { x: 0, y: 0 } });
      state = editorReducer(state, { type: 'UNDO' });

      expect(canRedo(state)).toBe(false);
    });

    it('canCommit checks minimum points for polyline', () => {
      let state = editorReducer(initialEditorState, {
        type: 'START_DRAFT',
        draftType: 'polyline',
        target: { panelId: 'panel-1' },
      });
      expect(canCommit(state)).toBe(false);

      state = editorReducer(state, { type: 'ADD_DRAFT_POINT', point: { x: 0, y: 0 } });
      expect(canCommit(state)).toBe(false);

      state = editorReducer(state, { type: 'ADD_DRAFT_POINT', point: { x: 10, y: 0 } });
      expect(canCommit(state)).toBe(true);
    });

    it('canCommit checks minimum points for polygon', () => {
      let state = editorReducer(initialEditorState, {
        type: 'START_DRAFT',
        draftType: 'polygon',
        target: { panelId: 'panel-1' },
      });
      state = editorReducer(state, { type: 'ADD_DRAFT_POINT', point: { x: 0, y: 0 } });
      state = editorReducer(state, { type: 'ADD_DRAFT_POINT', point: { x: 10, y: 0 } });
      expect(canCommit(state)).toBe(false);

      state = editorReducer(state, { type: 'ADD_DRAFT_POINT', point: { x: 5, y: 10 } });
      expect(canCommit(state)).toBe(true);
    });

    it('getDraftPoints returns points in draft mode', () => {
      let state = editorReducer(initialEditorState, {
        type: 'START_DRAFT',
        draftType: 'polyline',
        target: { panelId: 'panel-1' },
      });
      state = editorReducer(state, { type: 'ADD_DRAFT_POINT', point: { x: 0, y: 0 } });

      expect(getDraftPoints(state)).toEqual([{ x: 0, y: 0 }]);
    });

    it('getDraftPoints returns empty array when not in draft mode', () => {
      expect(getDraftPoints(initialEditorState)).toEqual([]);
    });

    it('UPDATE_DRAFT_TARGET updates mirrored flag on draft target', () => {
      let state = editorReducer(initialEditorState, {
        type: 'START_DRAFT',
        draftType: 'edge-path',
        target: { panelId: 'panel-1', edge: 'top' },
      });

      // Initially mirrored should be undefined (falsy)
      expect(state.draft?.target.mirrored).toBeUndefined();

      // Update the target to enable mirroring
      state = editorReducer(state, {
        type: 'UPDATE_DRAFT_TARGET',
        targetUpdate: { mirrored: true },
      });

      expect(state.draft?.target.mirrored).toBe(true);

      // Update again to disable mirroring
      state = editorReducer(state, {
        type: 'UPDATE_DRAFT_TARGET',
        targetUpdate: { mirrored: false },
      });

      expect(state.draft?.target.mirrored).toBe(false);
    });

    it('UPDATE_DRAFT_TARGET preserves existing draft points', () => {
      let state = editorReducer(initialEditorState, {
        type: 'START_DRAFT',
        draftType: 'edge-path',
        target: { panelId: 'panel-1', edge: 'top' },
      });

      state = editorReducer(state, { type: 'ADD_DRAFT_POINT', point: { x: 0.1, y: 0 } });
      state = editorReducer(state, { type: 'ADD_DRAFT_POINT', point: { x: 0.3, y: -5 } });

      state = editorReducer(state, {
        type: 'UPDATE_DRAFT_TARGET',
        targetUpdate: { mirrored: true },
      });

      // Points should be preserved
      expect(state.draft?.points).toHaveLength(2);
      expect(state.draft?.points[0]).toEqual({ x: 0.1, y: 0 });
      expect(state.draft?.points[1]).toEqual({ x: 0.3, y: -5 });
      // Target should be updated
      expect(state.draft?.target.mirrored).toBe(true);
    });

    it('UPDATE_DRAFT_TARGET is ignored when not in draft mode', () => {
      const state = editorReducer(initialEditorState, {
        type: 'UPDATE_DRAFT_TARGET',
        targetUpdate: { mirrored: true },
      });

      // Should remain idle, no draft created
      expect(state.mode).toBe('idle');
      expect(state.draft).toBeUndefined();
    });
  });

  // ===========================================================================
  // Edit Session Mode
  // ===========================================================================

  describe('Edit Session mode', () => {
    const mockSnapshot = { points: [{ x: 0, y: 0 }] };

    it('starts edit session with initial snapshot', () => {
      const state = editorReducer(initialEditorState, {
        type: 'START_EDIT_SESSION',
        targetId: 'path-1',
        targetType: 'path',
        snapshot: mockSnapshot,
      });

      expect(state.mode).toBe('editing');
      expect(state.editSession?.targetId).toBe('path-1');
      expect(state.editSession?.targetType).toBe('path');
      expect(state.editSession?.initialSnapshot).toEqual(mockSnapshot);
      expect(state.editSession?.history).toEqual([]);
      expect(state.editSession?.historyIndex).toBe(-1);
    });

    it('records micro-edits', () => {
      let state = editorReducer(initialEditorState, {
        type: 'START_EDIT_SESSION',
        targetId: 'path-1',
        targetType: 'path',
        snapshot: mockSnapshot,
      });

      state = editorReducer(state, {
        type: 'RECORD_EDIT',
        edit: { type: 'move-node', nodeIndex: 0, fromPoint: { x: 0, y: 0 }, toPoint: { x: 5, y: 5 } },
      });

      expect(state.editSession?.history).toHaveLength(1);
      expect(state.editSession?.historyIndex).toBe(0);
    });

    it('undo steps back through history', () => {
      let state = editorReducer(initialEditorState, {
        type: 'START_EDIT_SESSION',
        targetId: 'path-1',
        targetType: 'path',
        snapshot: mockSnapshot,
      });
      state = editorReducer(state, {
        type: 'RECORD_EDIT',
        edit: { type: 'move-node', nodeIndex: 0, fromPoint: { x: 0, y: 0 }, toPoint: { x: 5, y: 5 } },
      });
      state = editorReducer(state, {
        type: 'RECORD_EDIT',
        edit: { type: 'add-node', nodeIndex: 1, toPoint: { x: 10, y: 10 } },
      });

      expect(state.editSession?.historyIndex).toBe(1);

      state = editorReducer(state, { type: 'UNDO' });
      expect(state.editSession?.historyIndex).toBe(0);

      state = editorReducer(state, { type: 'UNDO' });
      expect(state.editSession?.historyIndex).toBe(-1);
    });

    it('undo at beginning does nothing', () => {
      let state = editorReducer(initialEditorState, {
        type: 'START_EDIT_SESSION',
        targetId: 'path-1',
        targetType: 'path',
        snapshot: mockSnapshot,
      });

      state = editorReducer(state, { type: 'UNDO' });

      expect(state.editSession?.historyIndex).toBe(-1);
    });

    it('redo steps forward through history', () => {
      let state = editorReducer(initialEditorState, {
        type: 'START_EDIT_SESSION',
        targetId: 'path-1',
        targetType: 'path',
        snapshot: mockSnapshot,
      });
      state = editorReducer(state, {
        type: 'RECORD_EDIT',
        edit: { type: 'move-node', nodeIndex: 0, fromPoint: { x: 0, y: 0 }, toPoint: { x: 5, y: 5 } },
      });
      state = editorReducer(state, { type: 'UNDO' });

      expect(state.editSession?.historyIndex).toBe(-1);

      state = editorReducer(state, { type: 'REDO' });
      expect(state.editSession?.historyIndex).toBe(0);
    });

    it('redo at end does nothing', () => {
      let state = editorReducer(initialEditorState, {
        type: 'START_EDIT_SESSION',
        targetId: 'path-1',
        targetType: 'path',
        snapshot: mockSnapshot,
      });
      state = editorReducer(state, {
        type: 'RECORD_EDIT',
        edit: { type: 'move-node', nodeIndex: 0, fromPoint: { x: 0, y: 0 }, toPoint: { x: 5, y: 5 } },
      });

      state = editorReducer(state, { type: 'REDO' });

      expect(state.editSession?.historyIndex).toBe(0); // Unchanged
    });

    it('new edit after undo truncates redo history', () => {
      let state = editorReducer(initialEditorState, {
        type: 'START_EDIT_SESSION',
        targetId: 'path-1',
        targetType: 'path',
        snapshot: mockSnapshot,
      });
      state = editorReducer(state, {
        type: 'RECORD_EDIT',
        edit: { type: 'move-node', nodeIndex: 0, fromPoint: { x: 0, y: 0 }, toPoint: { x: 5, y: 5 } },
      });
      state = editorReducer(state, {
        type: 'RECORD_EDIT',
        edit: { type: 'add-node', nodeIndex: 1, toPoint: { x: 10, y: 10 } },
      });

      // Undo twice
      state = editorReducer(state, { type: 'UNDO' });
      state = editorReducer(state, { type: 'UNDO' });

      // Record new edit - should truncate history
      state = editorReducer(state, {
        type: 'RECORD_EDIT',
        edit: { type: 'delete-node', nodeIndex: 0 },
      });

      expect(state.editSession?.history).toHaveLength(1);
      expect(state.editSession?.history[0].type).toBe('delete-node');
      expect(state.editSession?.historyIndex).toBe(0);
    });

    it('cancel restores to idle', () => {
      let state = editorReducer(initialEditorState, {
        type: 'START_EDIT_SESSION',
        targetId: 'path-1',
        targetType: 'path',
        snapshot: mockSnapshot,
      });

      state = editorReducer(state, { type: 'CANCEL' });

      expect(state.mode).toBe('idle');
      expect(state.editSession).toBeUndefined();
    });

    it('canUndo returns true when history index >= 0', () => {
      let state = editorReducer(initialEditorState, {
        type: 'START_EDIT_SESSION',
        targetId: 'path-1',
        targetType: 'path',
        snapshot: mockSnapshot,
      });
      expect(canUndo(state)).toBe(false);

      state = editorReducer(state, {
        type: 'RECORD_EDIT',
        edit: { type: 'move-node', nodeIndex: 0, fromPoint: { x: 0, y: 0 }, toPoint: { x: 5, y: 5 } },
      });
      expect(canUndo(state)).toBe(true);
    });

    it('canRedo returns true when history index < history length - 1', () => {
      let state = editorReducer(initialEditorState, {
        type: 'START_EDIT_SESSION',
        targetId: 'path-1',
        targetType: 'path',
        snapshot: mockSnapshot,
      });
      state = editorReducer(state, {
        type: 'RECORD_EDIT',
        edit: { type: 'move-node', nodeIndex: 0, fromPoint: { x: 0, y: 0 }, toPoint: { x: 5, y: 5 } },
      });

      expect(canRedo(state)).toBe(false);

      state = editorReducer(state, { type: 'UNDO' });
      expect(canRedo(state)).toBe(true);
    });

    it('getActiveEdits returns edits up to current index', () => {
      let state = editorReducer(initialEditorState, {
        type: 'START_EDIT_SESSION',
        targetId: 'path-1',
        targetType: 'path',
        snapshot: mockSnapshot,
      });
      state = editorReducer(state, {
        type: 'RECORD_EDIT',
        edit: { type: 'move-node', nodeIndex: 0, fromPoint: { x: 0, y: 0 }, toPoint: { x: 5, y: 5 } },
      });
      state = editorReducer(state, {
        type: 'RECORD_EDIT',
        edit: { type: 'add-node', nodeIndex: 1, toPoint: { x: 10, y: 10 } },
      });

      expect(getActiveEdits(state)).toHaveLength(2);

      state = editorReducer(state, { type: 'UNDO' });
      expect(getActiveEdits(state)).toHaveLength(1);
    });
  });

  // ===========================================================================
  // Mode Switching
  // ===========================================================================

  describe('Mode switching', () => {
    it('starting new mode clears previous mode state', () => {
      // Start operation
      let state = editorReducer(initialEditorState, {
        type: 'START_OPERATION',
        operationId: 'test',
        params: { foo: 'bar' },
      });

      // Switch to draft
      state = editorReducer(state, {
        type: 'START_DRAFT',
        draftType: 'polyline',
        target: { panelId: 'panel-1' },
      });

      expect(state.mode).toBe('draft');
      expect(state.operation).toBeUndefined();
      expect(state.draft).toBeDefined();
    });

    it('starting operation from draft clears draft', () => {
      let state = editorReducer(initialEditorState, {
        type: 'START_DRAFT',
        draftType: 'polyline',
        target: { panelId: 'panel-1' },
      });
      state = editorReducer(state, { type: 'ADD_DRAFT_POINT', point: { x: 0, y: 0 } });

      state = editorReducer(state, {
        type: 'START_OPERATION',
        operationId: 'test',
      });

      expect(state.mode).toBe('operation');
      expect(state.draft).toBeUndefined();
    });
  });

  // ===========================================================================
  // View Management
  // ===========================================================================

  describe('View management', () => {
    it('SET_VIEW updates active view', () => {
      const state = editorReducer(initialEditorState, {
        type: 'SET_VIEW',
        view: '2d',
      });

      expect(state.activeView).toBe('2d');
    });

    it('preserves mode when switching views', () => {
      let state = editorReducer(initialEditorState, {
        type: 'START_OPERATION',
        operationId: 'test',
      });

      state = editorReducer(state, { type: 'SET_VIEW', view: '2d' });

      expect(state.mode).toBe('operation');
      expect(state.activeView).toBe('2d');
    });
  });
});
