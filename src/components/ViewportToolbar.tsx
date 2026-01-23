import React from 'react';
import { useBoxStore } from '../store/useBoxStore';

export const ViewportToolbar: React.FC = () => {
  const { selectionMode, setSelectionMode, showDebugAnchors, toggleDebugAnchors } = useBoxStore();

  // Non-null modes for the filter buttons
  type FilterMode = 'assembly' | 'void' | 'panel';

  const tools: { mode: FilterMode; label: string; icon: string; tooltip: string }[] = [
    {
      mode: 'assembly',
      label: 'Assembly',
      icon: '◫',
      tooltip: 'Filter: select only assemblies',
    },
    {
      mode: 'void',
      label: 'Void',
      icon: '⬚',
      tooltip: 'Filter: select only voids',
    },
    {
      mode: 'panel',
      label: 'Panel',
      icon: '▬',
      tooltip: 'Filter: select only panels',
    },
  ];

  const handleToolClick = (mode: FilterMode) => {
    // Toggle: if already active, turn off (set to null)
    if (selectionMode === mode) {
      setSelectionMode(null);
    } else {
      setSelectionMode(mode);
    }
  };

  return (
    <div className="viewport-toolbar">
      <div className="toolbar-group">
        <span className="toolbar-label">Filter:</span>
        {tools.map((tool) => (
          <button
            key={tool.mode}
            className={`toolbar-btn ${selectionMode === tool.mode ? 'active' : ''}`}
            onClick={() => handleToolClick(tool.mode)}
            title={tool.tooltip}
          >
            <span className="toolbar-icon">{tool.icon}</span>
            <span className="toolbar-text">{tool.label}</span>
          </button>
        ))}
      </div>
      <div className="toolbar-group">
        <span className="toolbar-label">Debug:</span>
        <button
          className={`toolbar-btn ${showDebugAnchors ? 'active' : ''}`}
          onClick={toggleDebugAnchors}
          title="Show finger joint anchor points"
        >
          <span className="toolbar-icon">●</span>
          <span className="toolbar-text">Anchors</span>
        </button>
      </div>
    </div>
  );
};
