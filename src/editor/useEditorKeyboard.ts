/**
 * Editor Keyboard Handler
 *
 * Handles keyboard shortcuts for the editor context.
 * Mode-aware undo/redo and escape handling.
 */

import { useEffect } from 'react';
import { useEditor } from './EditorContext';
import { useBoxStore } from '../store/useBoxStore';

/**
 * Hook to handle editor keyboard shortcuts.
 * Should be used once at the app level.
 */
export function useEditorKeyboard() {
  const { mode, undo, redo, cancel, canUndo, canRedo } = useEditor();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Tab: Toggle between 3D and 2D views
      if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        // Read current state at time of keypress (not subscribed)
        const state = useBoxStore.getState();

        if (state.viewMode === '3d') {
          // In 3D mode: enter 2D view if a panel is selected
          if (state.selectedPanelIds.size === 1) {
            e.preventDefault();
            const panelId = [...state.selectedPanelIds][0];
            state.enterSketchView(panelId);
          }
        } else {
          // In 2D mode: exit back to 3D
          e.preventDefault();
          state.exitSketchView();
        }
        return;
      }

      // Undo: Cmd+Z (mode-aware)
      if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        if (canUndo) {
          e.preventDefault();
          undo();
        }
        return;
      }

      // Redo: Cmd+Shift+Z or Cmd+Y
      if ((e.key === 'z' && (e.metaKey || e.ctrlKey) && e.shiftKey) ||
          (e.key === 'y' && (e.metaKey || e.ctrlKey))) {
        if (canRedo) {
          e.preventDefault();
          redo();
        }
        return;
      }

      // Cancel: Escape (when in active mode)
      if (e.key === 'Escape' && mode !== 'idle') {
        e.preventDefault();
        cancel();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, undo, redo, cancel, canUndo, canRedo]);
}
