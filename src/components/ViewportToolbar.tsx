import React from 'react';
import { useBoxStore } from '../store/useBoxStore';
import { SelectionMode } from '../types';

export const ViewportToolbar: React.FC = () => {
  const { selectionMode, setSelectionMode } = useBoxStore();

  const tools: { mode: SelectionMode; label: string; icon: string; tooltip: string }[] = [
    {
      mode: 'assembly',
      label: 'Assembly',
      icon: '◫',
      tooltip: 'Select assemblies to edit dimensions and faces',
    },
    {
      mode: 'void',
      label: 'Void',
      icon: '⬚',
      tooltip: 'Select voids to subdivide',
    },
    {
      mode: 'panel',
      label: 'Panel',
      icon: '▬',
      tooltip: 'Select panels to edit properties',
    },
  ];

  return (
    <div className="viewport-toolbar">
      <div className="toolbar-group">
        <span className="toolbar-label">Select:</span>
        {tools.map((tool) => (
          <button
            key={tool.mode}
            className={`toolbar-btn ${selectionMode === tool.mode ? 'active' : ''}`}
            onClick={() => setSelectionMode(tool.mode)}
            title={tool.tooltip}
          >
            <span className="toolbar-icon">{tool.icon}</span>
            <span className="toolbar-text">{tool.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
