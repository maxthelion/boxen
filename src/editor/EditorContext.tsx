/**
 * Editor Context Provider
 *
 * Provides the editor state machine to all components.
 * Single context instance spans both 2D and 3D views.
 */

import { createContext, useContext, ReactNode } from 'react';
import { useEditorContext, EditorContextValue } from './useEditorContext';

const EditorContext = createContext<EditorContextValue | null>(null);

interface EditorProviderProps {
  children: ReactNode;
}

export function EditorProvider({ children }: EditorProviderProps) {
  const editor = useEditorContext();

  return (
    <EditorContext.Provider value={editor}>
      {children}
    </EditorContext.Provider>
  );
}

/**
 * Hook to access the editor context.
 * Must be used within an EditorProvider.
 */
export function useEditor(): EditorContextValue {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error('useEditor must be used within an EditorProvider');
  }
  return context;
}

/**
 * Hook to check if we're inside an EditorProvider.
 * Useful for optional editor features.
 */
export function useEditorOptional(): EditorContextValue | null {
  return useContext(EditorContext);
}
