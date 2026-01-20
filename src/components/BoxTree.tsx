import React from 'react';
import { useBoxStore } from '../store/useBoxStore';
import { Panel } from './UI/Panel';
import { Void, SubAssembly } from '../types';

interface TreeNodeProps {
  node: Void;
  depth: number;
  selectedVoidId: string | null;
  selectedSubAssemblyId: string | null;
  selectedAssemblyId: string | null;
  selectionMode: 'void' | 'panel' | 'assembly';
  onSelectVoid: (id: string | null) => void;
  onSelectSubAssembly: (id: string | null) => void;
  onSelectAssembly: (id: string | null) => void;
  isSubAssemblyRoot?: boolean;
}

interface SubAssemblyNodeProps {
  subAssembly: SubAssembly;
  depth: number;
  selectedSubAssemblyId: string | null;
  selectedVoidId: string | null;
  selectedAssemblyId: string | null;
  selectionMode: 'void' | 'panel' | 'assembly';
  onSelectSubAssembly: (id: string | null) => void;
  onSelectVoid: (id: string | null) => void;
  onSelectAssembly: (id: string | null) => void;
}

const SubAssemblyNode: React.FC<SubAssemblyNodeProps> = ({
  subAssembly,
  depth,
  selectedSubAssemblyId,
  selectedVoidId,
  onSelectSubAssembly,
  onSelectVoid,
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
          onSelectVoid={onSelectVoid}
          onSelectSubAssembly={onSelectSubAssembly}
          isSubAssemblyRoot
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
  onSelectVoid,
  onSelectSubAssembly,
  isSubAssemblyRoot,
}) => {
  const isSelected = selectedVoidId === node.id;
  const isLeaf = node.children.length === 0 && !node.subAssembly;
  const hasChildren = node.children.length > 0;
  const hasSubAssembly = !!node.subAssembly;

  // Generate a label for the node
  const getLabel = () => {
    if (node.id === 'root') {
      return 'Box';
    }
    if (isSubAssemblyRoot) {
      return 'Interior';
    }

    // Show the split info if available
    if (node.splitAxis) {
      const axisLabel = node.splitAxis.toUpperCase();
      return `Cell (${axisLabel} split)`;
    }

    return 'Cell';
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
        className={`tree-node-content ${isSelected ? 'selected' : ''} ${isLeaf ? 'leaf' : 'branch'}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelectVoid(isSelected ? null : node.id)}
      >
        <span className="tree-icon">{getIcon()}</span>
        <span className="tree-label">{getLabel()}</span>
        <span className="tree-dimensions">{getDimensions()}</span>
      </div>

      {/* Show sub-assembly if present */}
      {hasSubAssembly && (
        <div className="tree-children">
          <SubAssemblyNode
            subAssembly={node.subAssembly!}
            depth={depth + 1}
            selectedSubAssemblyId={selectedSubAssemblyId}
            selectedVoidId={selectedVoidId}
            onSelectSubAssembly={onSelectSubAssembly}
            onSelectVoid={onSelectVoid}
          />
        </div>
      )}

      {/* Show child voids */}
      {hasChildren && (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedVoidId={selectedVoidId}
              selectedSubAssemblyId={selectedSubAssemblyId}
              onSelectVoid={onSelectVoid}
              onSelectSubAssembly={onSelectSubAssembly}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const BoxTree: React.FC = () => {
  const { rootVoid, selectedVoidId, selectedSubAssemblyId, selectVoid, selectSubAssembly } = useBoxStore();

  return (
    <Panel title="Structure">
      <div className="box-tree">
        <TreeNode
          node={rootVoid}
          depth={0}
          selectedVoidId={selectedVoidId}
          selectedSubAssemblyId={selectedSubAssemblyId}
          onSelectVoid={selectVoid}
          onSelectSubAssembly={selectSubAssembly}
        />
      </div>
    </Panel>
  );
};
