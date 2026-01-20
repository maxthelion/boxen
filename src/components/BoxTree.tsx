import React from 'react';
import { useBoxStore } from '../store/useBoxStore';
import { Panel } from './UI/Panel';
import { Void, SubAssembly } from '../types';

// Represents a divider panel created by a subdivision
interface DividerPanel {
  id: string;
  axis: 'x' | 'y' | 'z';
  position: number;
  width: number;
  height: number;
}

// Extract divider panels from a void's children
const getDividerPanels = (parent: Void): DividerPanel[] => {
  const panels: DividerPanel[] = [];
  for (const child of parent.children) {
    if (child.splitAxis && child.splitPosition !== undefined) {
      // Calculate panel dimensions based on parent bounds and split axis
      let width: number, height: number;
      switch (child.splitAxis) {
        case 'x':
          width = parent.bounds.d;
          height = parent.bounds.h;
          break;
        case 'y':
          width = parent.bounds.w;
          height = parent.bounds.d;
          break;
        case 'z':
          width = parent.bounds.w;
          height = parent.bounds.h;
          break;
      }
      panels.push({
        id: `panel-${child.id}`,
        axis: child.splitAxis,
        position: child.splitPosition,
        width,
        height,
      });
    }
  }
  return panels;
};

interface PanelNodeProps {
  panel: DividerPanel;
  depth: number;
  selectedPanelId: string | null;
  onSelectPanel: (id: string | null) => void;
}

const PanelNode: React.FC<PanelNodeProps> = ({
  panel,
  depth,
  selectedPanelId,
  onSelectPanel,
}) => {
  const isSelected = selectedPanelId === panel.id;
  const axisLabel = panel.axis.toUpperCase();

  return (
    <div className="tree-node">
      <div
        className={`tree-node-content panel ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelectPanel(isSelected ? null : panel.id)}
      >
        <span className="tree-node-main">
          <span className="tree-icon">▬</span>
          <span className="tree-label">Panel @ {axisLabel}={panel.position.toFixed(0)}</span>
          <span className="tree-dimensions">{panel.width.toFixed(0)}×{panel.height.toFixed(0)}</span>
        </span>
      </div>
    </div>
  );
};

interface TreeNodeProps {
  node: Void;
  depth: number;
  selectedVoidId: string | null;
  selectedSubAssemblyId: string | null;
  selectedPanelId: string | null;
  onSelectVoid: (id: string | null) => void;
  onSelectSubAssembly: (id: string | null) => void;
  onSelectPanel: (id: string | null) => void;
  isSubAssemblyRoot?: boolean;
  hiddenVoidIds: Set<string>;
  isolatedVoidId: string | null;
  onToggleVisibility: (id: string) => void;
  onSetIsolated: (id: string | null) => void;
}

interface SubAssemblyNodeProps {
  subAssembly: SubAssembly;
  depth: number;
  selectedSubAssemblyId: string | null;
  selectedVoidId: string | null;
  selectedPanelId: string | null;
  onSelectSubAssembly: (id: string | null) => void;
  onSelectVoid: (id: string | null) => void;
  onSelectPanel: (id: string | null) => void;
  hiddenVoidIds: Set<string>;
  isolatedVoidId: string | null;
  onToggleVisibility: (id: string) => void;
  onSetIsolated: (id: string | null) => void;
}

const SubAssemblyNode: React.FC<SubAssemblyNodeProps> = ({
  subAssembly,
  depth,
  selectedSubAssemblyId,
  selectedVoidId,
  selectedPanelId,
  onSelectSubAssembly,
  onSelectVoid,
  onSelectPanel,
  hiddenVoidIds,
  isolatedVoidId,
  onToggleVisibility,
  onSetIsolated,
}) => {
  const isSelected = selectedSubAssemblyId === subAssembly.id;
  const { rootVoid } = subAssembly;

  const getTypeLabel = () => {
    switch (subAssembly.type) {
      case 'drawer': return 'Drawer';
      case 'tray': return 'Tray';
      case 'insert': return 'Insert';
      default: return 'Sub-assembly';
    }
  };

  const getTypeIcon = () => {
    switch (subAssembly.type) {
      case 'drawer': return '🗄';
      case 'tray': return '📥';
      case 'insert': return '📦';
      default: return '📦';
    }
  };

  const getDimensions = () => {
    const { w, h, d } = rootVoid.bounds;
    return `${w.toFixed(0)}×${h.toFixed(0)}×${d.toFixed(0)}`;
  };

  return (
    <div className="tree-node">
      <div
        className={`tree-node-content subassembly ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelectSubAssembly(isSelected ? null : subAssembly.id)}
      >
        <span className="tree-icon">{getTypeIcon()}</span>
        <span className="tree-label">{getTypeLabel()}</span>
        <span className="tree-dimensions">{getDimensions()}</span>
      </div>

      {/* Show sub-assembly's internal structure */}
      <div className="tree-children">
        <TreeNode
          node={rootVoid}
          depth={depth + 1}
          selectedVoidId={selectedVoidId}
          selectedSubAssemblyId={selectedSubAssemblyId}
          selectedPanelId={selectedPanelId}
          onSelectVoid={onSelectVoid}
          onSelectSubAssembly={onSelectSubAssembly}
          onSelectPanel={onSelectPanel}
          isSubAssemblyRoot
          hiddenVoidIds={hiddenVoidIds}
          isolatedVoidId={isolatedVoidId}
          onToggleVisibility={onToggleVisibility}
          onSetIsolated={onSetIsolated}
        />
      </div>
    </div>
  );
};

const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  depth,
  selectedVoidId,
  selectedSubAssemblyId,
  selectedPanelId,
  onSelectVoid,
  onSelectSubAssembly,
  onSelectPanel,
  isSubAssemblyRoot,
  hiddenVoidIds,
  isolatedVoidId,
  onToggleVisibility,
  onSetIsolated,
}) => {
  const isSelected = selectedVoidId === node.id;
  const isLeaf = node.children.length === 0 && !node.subAssembly;
  const hasChildren = node.children.length > 0;
  const hasSubAssembly = !!node.subAssembly;
  const isHidden = hiddenVoidIds.has(node.id);
  const isIsolated = isolatedVoidId === node.id;

  // Get divider panels created by this void's subdivision
  const dividerPanels = hasChildren ? getDividerPanels(node) : [];

  // Generate a label for the node
  const getLabel = () => {
    if (node.id === 'root') {
      return 'Box';
    }
    if (isSubAssemblyRoot) {
      return 'Interior';
    }
    return 'Void';
  };

  // Show dimensions
  const getDimensions = () => {
    const { w, h, d } = node.bounds;
    return `${w.toFixed(0)}×${h.toFixed(0)}×${d.toFixed(0)}`;
  };

  const getIcon = () => {
    if (node.id === 'root' && !isSubAssemblyRoot) return '📦';
    if (isSubAssemblyRoot) return '⬚';
    if (hasSubAssembly) return '⊞';
    if (isLeaf) return '◻';
    return '▤';
  };

  return (
    <div className="tree-node">
      <div
        className={`tree-node-content ${isSelected ? 'selected' : ''} ${isLeaf ? 'leaf' : 'branch'} ${isHidden ? 'hidden' : ''} ${isIsolated ? 'isolated' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <span
          className="tree-node-main"
          onClick={() => onSelectVoid(isSelected ? null : node.id)}
        >
          <span className="tree-icon">{getIcon()}</span>
          <span className="tree-label">{getLabel()}</span>
          <span className="tree-dimensions">{getDimensions()}</span>
        </span>
        <span className="tree-controls">
          <button
            className={`tree-btn ${isHidden ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility(node.id);
            }}
            title={isHidden ? 'Show' : 'Hide'}
          >
            {isHidden ? '○' : '●'}
          </button>
          <button
            className={`tree-btn ${isIsolated ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onSetIsolated(isIsolated ? null : node.id);
            }}
            title={isIsolated ? 'Unisolate' : 'Isolate'}
          >
            ◎
          </button>
        </span>
      </div>

      {/* Show sub-assembly if present */}
      {hasSubAssembly && (
        <div className="tree-children">
          <SubAssemblyNode
            subAssembly={node.subAssembly!}
            depth={depth + 1}
            selectedSubAssemblyId={selectedSubAssemblyId}
            selectedVoidId={selectedVoidId}
            selectedPanelId={selectedPanelId}
            onSelectSubAssembly={onSelectSubAssembly}
            onSelectVoid={onSelectVoid}
            onSelectPanel={onSelectPanel}
            hiddenVoidIds={hiddenVoidIds}
            isolatedVoidId={isolatedVoidId}
            onToggleVisibility={onToggleVisibility}
            onSetIsolated={onSetIsolated}
          />
        </div>
      )}

      {/* Show divider panels and child voids */}
      {hasChildren && (
        <div className="tree-children">
          {/* Show divider panels first */}
          {dividerPanels.map((panel) => (
            <PanelNode
              key={panel.id}
              panel={panel}
              depth={depth + 1}
              selectedPanelId={selectedPanelId}
              onSelectPanel={onSelectPanel}
            />
          ))}
          {/* Show child voids */}
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedVoidId={selectedVoidId}
              selectedSubAssemblyId={selectedSubAssemblyId}
              selectedPanelId={selectedPanelId}
              onSelectVoid={onSelectVoid}
              onSelectSubAssembly={onSelectSubAssembly}
              onSelectPanel={onSelectPanel}
              hiddenVoidIds={hiddenVoidIds}
              isolatedVoidId={isolatedVoidId}
              onToggleVisibility={onToggleVisibility}
              onSetIsolated={onSetIsolated}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const BoxTree: React.FC = () => {
  const {
    rootVoid,
    selectedVoidId,
    selectedSubAssemblyId,
    selectedPanelId,
    selectVoid,
    selectSubAssembly,
    selectPanel,
    hiddenVoidIds,
    isolatedVoidId,
    toggleVoidVisibility,
    setIsolatedVoid,
  } = useBoxStore();

  return (
    <Panel title="Structure">
      <div className="box-tree">
        <TreeNode
          node={rootVoid}
          depth={0}
          selectedVoidId={selectedVoidId}
          selectedSubAssemblyId={selectedSubAssemblyId}
          selectedPanelId={selectedPanelId}
          onSelectVoid={selectVoid}
          onSelectSubAssembly={selectSubAssembly}
          onSelectPanel={selectPanel}
          hiddenVoidIds={hiddenVoidIds}
          isolatedVoidId={isolatedVoidId}
          onToggleVisibility={toggleVoidVisibility}
          onSetIsolated={setIsolatedVoid}
        />
      </div>
      {isolatedVoidId && (
        <button
          className="unisolate-btn"
          onClick={() => setIsolatedVoid(null)}
        >
          Show All
        </button>
      )}
    </Panel>
  );
};
