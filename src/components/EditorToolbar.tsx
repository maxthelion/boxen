import React from 'react';

export type EditorTool =
  | 'select'
  | 'pan'
  | 'rectangle'
  | 'circle'
  | 'path'
  | 'inset'
  | 'chamfer'
  | 'push-pull'
  | 'subdivide'
  | 'create-sub-assembly';

export type EditorMode = '2d' | '3d';

interface EditorToolbarProps {
  mode: EditorMode;
  activeTool?: EditorTool;
  onToolChange?: (tool: EditorTool) => void;
  mirrorX?: boolean;
  mirrorY?: boolean;
  onMirrorXChange?: (enabled: boolean) => void;
  onMirrorYChange?: (enabled: boolean) => void;
}

interface ToolButton {
  id: EditorTool;
  icon: string;
  label: string;
  tooltip: string;
  modes: EditorMode[]; // Which modes this tool appears in
}

const tools: ToolButton[] = [
  {
    id: 'select',
    icon: '↖',
    label: 'Select',
    tooltip: 'Select elements (V)',
    modes: ['2d', '3d'],
  },
  {
    id: 'pan',
    icon: '✋',
    label: 'Pan',
    tooltip: 'Pan view (Space+drag)',
    modes: ['2d', '3d'],
  },
  {
    id: 'rectangle',
    icon: '▢',
    label: 'Rect',
    tooltip: 'Draw rectangle (R)',
    modes: ['2d'],
  },
  {
    id: 'circle',
    icon: '○',
    label: 'Circle',
    tooltip: 'Draw circle (C)',
    modes: ['2d'],
  },
  {
    id: 'path',
    icon: '✎',
    label: 'Path',
    tooltip: 'Draw path (P)',
    modes: ['2d'],
  },
  {
    id: 'inset',
    icon: '⧈',
    label: 'Inset',
    tooltip: 'Inset/Outset edges (I)',
    modes: ['2d'],
  },
  {
    id: 'chamfer',
    icon: '◢',
    label: 'Chamfer',
    tooltip: 'Chamfer corners (F)',
    modes: ['2d'],
  },
  {
    id: 'push-pull',
    icon: '⇅',
    label: 'Push/Pull',
    tooltip: 'Push or pull faces (Q)',
    modes: ['3d'],
  },
  {
    id: 'subdivide',
    icon: '⊞',
    label: 'Subdivide',
    tooltip: 'Subdivide void (S)',
    modes: ['3d'],
  },
  {
    id: 'create-sub-assembly',
    icon: '⧉',
    label: 'Sub-Box',
    tooltip: 'Create nested box in void',
    modes: ['3d'],
  },
];

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  mode,
  activeTool = 'select',
  onToolChange,
  mirrorX = false,
  mirrorY = false,
  onMirrorXChange,
  onMirrorYChange,
}) => {
  // Filter tools based on current mode
  const availableTools = tools.filter(t => t.modes.includes(mode));

  const handleToolClick = (toolId: EditorTool) => {
    if (onToolChange) {
      onToolChange(toolId);
    }
  };

  return (
    <div className="editor-toolbar">
      {/* Tool buttons */}
      <div className="editor-toolbar-section">
        <span className="editor-toolbar-label">Tools</span>
        <div className="editor-toolbar-buttons">
          {availableTools.map((tool) => (
            <button
              key={tool.id}
              className={`editor-tool-btn ${activeTool === tool.id ? 'active' : ''}`}
              onClick={() => handleToolClick(tool.id)}
              title={tool.tooltip}
              disabled={!onToolChange}
            >
              <span className="editor-tool-icon">{tool.icon}</span>
              <span className="editor-tool-label">{tool.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Mirror toggles - only in 2D mode */}
      {mode === '2d' && (
        <div className="editor-toolbar-section">
          <span className="editor-toolbar-label">Mirror</span>
          <div className="editor-toolbar-buttons">
            <button
              className={`editor-tool-btn ${mirrorX ? 'active' : ''}`}
              onClick={() => onMirrorXChange?.(!mirrorX)}
              title="Mirror horizontally (X axis)"
              disabled={!onMirrorXChange}
            >
              <span className="editor-tool-icon">⬌</span>
              <span className="editor-tool-label">X</span>
            </button>
            <button
              className={`editor-tool-btn ${mirrorY ? 'active' : ''}`}
              onClick={() => onMirrorYChange?.(!mirrorY)}
              title="Mirror vertically (Y axis)"
              disabled={!onMirrorYChange}
            >
              <span className="editor-tool-icon">⬍</span>
              <span className="editor-tool-label">Y</span>
            </button>
          </div>
        </div>
      )}

      {/* Placeholder for future sections */}
      {mode === '2d' && (
        <div className="editor-toolbar-section">
          <span className="editor-toolbar-label">Boolean</span>
          <div className="editor-toolbar-buttons">
            <button
              className="editor-tool-btn"
              title="Add (Union)"
              disabled
            >
              <span className="editor-tool-icon">+</span>
              <span className="editor-tool-label">Add</span>
            </button>
            <button
              className="editor-tool-btn"
              title="Subtract (Cut)"
              disabled
            >
              <span className="editor-tool-icon">−</span>
              <span className="editor-tool-label">Cut</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
