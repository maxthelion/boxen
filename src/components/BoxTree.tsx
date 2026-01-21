import React from 'react';
import { useBoxStore } from '../store/useBoxStore';
import { Panel } from './UI/Panel';
import { Void, SubAssembly, Face, FaceId } from '../types';

// Represents a divider panel created by a subdivision
interface DividerPanel {
  id: string;
  axis: 'x' | 'y' | 'z';
  position: number;
  width: number;
  height: number;
}

// Represents an outer face panel
interface OuterFacePanel {
  id: string;
  faceId: FaceId;
  label: string;
  solid: boolean;
}

const faceLabels: Record<FaceId, string> = {
  front: 'Front',
  back: 'Back',
  left: 'Left',
  right: 'Right',
  top: 'Top',
  bottom: 'Bottom',
};

// Extract divider panels from a void's children
const getDividerPanels = (parent: Void): DividerPanel[] => {
  const panels: DividerPanel[] = [];
  for (const child of parent.children) {
    if (child.splitAxis && child.splitPosition !== undefined) {
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

// Common props for tree operations
interface TreeOpsProps {
  selectedVoidId: string | null;
  selectedSubAssemblyId: string | null;
  selectedPanelId: string | null;
  selectedAssemblyId: string | null;
  onSelectVoid: (id: string | null) => void;
  onSelectSubAssembly: (id: string | null) => void;
  onSelectPanel: (id: string | null) => void;
  onSelectAssembly: (id: string | null) => void;
  hiddenVoidIds: Set<string>;
  isolatedVoidId: string | null;
  onToggleVisibility: (id: string) => void;
  onSetIsolated: (id: string | null) => void;
  hiddenSubAssemblyIds: Set<string>;
  isolatedSubAssemblyId: string | null;
  onToggleSubAssemblyVisibility: (id: string) => void;
  onSetIsolatedSubAssembly: (id: string | null) => void;
  hiddenFaceIds: Set<string>;
  onToggleFaceVisibility: (faceId: string) => void;
  onDeleteVoid: (voidId: string) => void;
  onDeleteSubAssembly: (voidId: string) => void;
}

// Outer face panel node (for main box or sub-assembly)
const OuterPanelNode: React.FC<{
  panel: OuterFacePanel;
  depth: number;
  selectedPanelId: string | null;
  onSelectPanel: (id: string | null) => void;
  hiddenFaceIds: Set<string>;
  onToggleFaceVisibility: (faceId: string) => void;
}> = ({ panel, depth, selectedPanelId, onSelectPanel, hiddenFaceIds, onToggleFaceVisibility }) => {
  const isSelected = selectedPanelId === panel.id;
  const isHidden = hiddenFaceIds.has(panel.id);

  return (
    <div className="tree-node">
      <div
        className={`tree-node-content panel ${isSelected ? 'selected' : ''} ${!panel.solid ? 'open-face' : ''} ${isHidden ? 'hidden' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <span
          className="tree-node-main"
          onClick={() => onSelectPanel(isSelected ? null : panel.id)}
        >
          <span className="tree-icon">{panel.solid ? '▬' : '▭'}</span>
          <span className="tree-label">{panel.label}</span>
          <span className="tree-status">{panel.solid ? '' : '(open)'}</span>
        </span>
        {panel.solid && (
          <span className="tree-controls">
            <button
              className={`tree-btn ${isHidden ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleFaceVisibility(panel.id);
              }}
              title={isHidden ? 'Show' : 'Hide'}
            >
              {isHidden ? '○' : '●'}
            </button>
          </span>
        )}
      </div>
    </div>
  );
};

// Divider panel node (created by subdivision)
const DividerPanelNode: React.FC<{
  panel: DividerPanel;
  depth: number;
  selectedPanelId: string | null;
  onSelectPanel: (id: string | null) => void;
  onDelete: (voidId: string) => void;
}> = ({ panel, depth, selectedPanelId, onSelectPanel, onDelete }) => {
  const isSelected = selectedPanelId === panel.id;
  const axisLabel = panel.axis.toUpperCase();
  const voidId = panel.id.replace('panel-', '');

  return (
    <div className="tree-node">
      <div
        className={`tree-node-content panel ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <span
          className="tree-node-main"
          onClick={() => onSelectPanel(isSelected ? null : panel.id)}
        >
          <span className="tree-icon">▬</span>
          <span className="tree-label">Divider @ {axisLabel}={panel.position.toFixed(0)}</span>
          <span className="tree-dimensions">{panel.width.toFixed(0)}×{panel.height.toFixed(0)}</span>
        </span>
        <span className="tree-controls">
          <button
            className="tree-btn delete"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(voidId);
            }}
            title="Delete subdivision"
          >
            ×
          </button>
        </span>
      </div>
    </div>
  );
};

// Void node (interior space that can be subdivided or contain sub-assemblies)
interface VoidNodeProps extends TreeOpsProps {
  node: Void;
  depth: number;
  label?: string;
}

const VoidNode: React.FC<VoidNodeProps> = ({
  node,
  depth,
  label,
  selectedVoidId,
  selectedSubAssemblyId,
  selectedPanelId,
  selectedAssemblyId,
  onSelectVoid,
  onSelectSubAssembly,
  onSelectPanel,
  onSelectAssembly,
  hiddenVoidIds,
  isolatedVoidId,
  onToggleVisibility,
  onSetIsolated,
  hiddenSubAssemblyIds,
  isolatedSubAssemblyId,
  onToggleSubAssemblyVisibility,
  onSetIsolatedSubAssembly,
  hiddenFaceIds,
  onToggleFaceVisibility,
  onDeleteVoid,
  onDeleteSubAssembly,
}) => {
  const isSelected = selectedVoidId === node.id;
  const isLeaf = node.children.length === 0 && !node.subAssembly;
  const hasChildren = node.children.length > 0;
  const hasSubAssembly = !!node.subAssembly;
  const isHidden = hiddenVoidIds.has(node.id);
  const isIsolated = isolatedVoidId === node.id;

  const dividerPanels = hasChildren ? getDividerPanels(node) : [];

  const getLabel = () => {
    if (label) return label;
    // Special labels for lid inset voids
    if (node.lidInsetSide === 'positive') return 'Lid Cap (Top/Right/Front)';
    if (node.lidInsetSide === 'negative') return 'Lid Cap (Bottom/Left/Back)';
    if (node.isMainInterior) return 'Main Interior';
    return 'Void';
  };

  const getDimensions = () => {
    const { w, h, d } = node.bounds;
    return `${w.toFixed(0)}×${h.toFixed(0)}×${d.toFixed(0)}`;
  };

  const getIcon = () => {
    if (hasSubAssembly) return '⊞';
    if (node.lidInsetSide) return '▭';  // Lid cap icon
    if (isLeaf) return '◻';
    return '▤';
  };

  const treeOps: TreeOpsProps = {
    selectedVoidId,
    selectedSubAssemblyId,
    selectedPanelId,
    selectedAssemblyId,
    onSelectVoid,
    onSelectSubAssembly,
    onSelectPanel,
    onSelectAssembly,
    hiddenVoidIds,
    isolatedVoidId,
    onToggleVisibility,
    onSetIsolated,
    hiddenSubAssemblyIds,
    isolatedSubAssemblyId,
    onToggleSubAssemblyVisibility,
    onSetIsolatedSubAssembly,
    hiddenFaceIds,
    onToggleFaceVisibility,
    onDeleteVoid,
    onDeleteSubAssembly,
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
            parentVoidId={node.id}
            depth={depth + 1}
            {...treeOps}
          />
        </div>
      )}

      {/* Show divider panels and child voids interleaved in spatial order */}
      {hasChildren && (
        <div className="tree-children">
          {node.children.map((child) => {
            const panel = dividerPanels.find(p => p.id === `panel-${child.id}`);

            return (
              <React.Fragment key={child.id}>
                {panel && (
                  <DividerPanelNode
                    panel={panel}
                    depth={depth + 1}
                    selectedPanelId={selectedPanelId}
                    onSelectPanel={onSelectPanel}
                    onDelete={onDeleteVoid}
                  />
                )}
                <VoidNode
                  node={child}
                  depth={depth + 1}
                  {...treeOps}
                />
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Sub-assembly node (drawer, tray, insert)
interface SubAssemblyNodeProps extends TreeOpsProps {
  subAssembly: SubAssembly;
  parentVoidId: string;
  depth: number;
}

const SubAssemblyNode: React.FC<SubAssemblyNodeProps> = ({
  subAssembly,
  parentVoidId,
  depth,
  selectedVoidId,
  selectedSubAssemblyId,
  selectedPanelId,
  selectedAssemblyId,
  onSelectVoid,
  onSelectSubAssembly,
  onSelectPanel,
  onSelectAssembly,
  hiddenVoidIds,
  isolatedVoidId,
  onToggleVisibility,
  onSetIsolated,
  hiddenSubAssemblyIds,
  isolatedSubAssemblyId,
  onToggleSubAssemblyVisibility,
  onSetIsolatedSubAssembly,
  hiddenFaceIds,
  onToggleFaceVisibility,
  onDeleteVoid,
  onDeleteSubAssembly,
}) => {
  const isSelected = selectedSubAssemblyId === subAssembly.id;
  const { rootVoid } = subAssembly;
  const isHidden = hiddenSubAssemblyIds.has(subAssembly.id);
  const isIsolated = isolatedSubAssemblyId === subAssembly.id;

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

  const outerFacePanels: OuterFacePanel[] = subAssembly.faces.map((face) => ({
    id: `subasm-${subAssembly.id}-face-${face.id}`,
    faceId: face.id,
    label: faceLabels[face.id],
    solid: face.solid,
  }));

  const treeOps: TreeOpsProps = {
    selectedVoidId,
    selectedSubAssemblyId,
    selectedPanelId,
    selectedAssemblyId,
    onSelectVoid,
    onSelectSubAssembly,
    onSelectPanel,
    onSelectAssembly,
    hiddenVoidIds,
    isolatedVoidId,
    onToggleVisibility,
    onSetIsolated,
    hiddenSubAssemblyIds,
    isolatedSubAssemblyId,
    onToggleSubAssemblyVisibility,
    onSetIsolatedSubAssembly,
    hiddenFaceIds,
    onToggleFaceVisibility,
    onDeleteVoid,
    onDeleteSubAssembly,
  };

  return (
    <div className="tree-node">
      <div
        className={`tree-node-content subassembly ${isSelected ? 'selected' : ''} ${isHidden ? 'hidden' : ''} ${isIsolated ? 'isolated' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <span
          className="tree-node-main"
          onClick={() => onSelectSubAssembly(isSelected ? null : subAssembly.id)}
        >
          <span className="tree-icon">{getTypeIcon()}</span>
          <span className="tree-label">{getTypeLabel()}</span>
          <span className="tree-dimensions">{getDimensions()}</span>
        </span>
        <span className="tree-controls">
          <button
            className={`tree-btn ${isHidden ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSubAssemblyVisibility(subAssembly.id);
            }}
            title={isHidden ? 'Show' : 'Hide'}
          >
            {isHidden ? '○' : '●'}
          </button>
          <button
            className={`tree-btn ${isIsolated ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onSetIsolatedSubAssembly(isIsolated ? null : subAssembly.id);
            }}
            title={isIsolated ? 'Unisolate' : 'Isolate'}
          >
            ◎
          </button>
          <button
            className="tree-btn delete"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteSubAssembly(parentVoidId);
            }}
            title="Delete sub-assembly"
          >
            ×
          </button>
        </span>
      </div>

      {/* Outer face panels */}
      <div className="tree-children">
        {outerFacePanels.map((panel) => (
          <OuterPanelNode
            key={panel.id}
            panel={panel}
            depth={depth + 1}
            selectedPanelId={selectedPanelId}
            onSelectPanel={onSelectPanel}
            hiddenFaceIds={hiddenFaceIds}
            onToggleFaceVisibility={onToggleFaceVisibility}
          />
        ))}
      </div>

      {/* Interior void */}
      <div className="tree-children">
        <VoidNode
          node={rootVoid}
          depth={depth + 1}
          label="Interior"
          {...treeOps}
        />
      </div>
    </div>
  );
};

// Main box assembly node
interface MainBoxNodeProps extends TreeOpsProps {
  rootVoid: Void;
  faces: Face[];
  depth: number;
}

const MainBoxNode: React.FC<MainBoxNodeProps> = ({
  rootVoid,
  faces,
  depth,
  selectedVoidId,
  selectedSubAssemblyId,
  selectedPanelId,
  selectedAssemblyId,
  onSelectVoid,
  onSelectSubAssembly,
  onSelectPanel,
  onSelectAssembly,
  hiddenVoidIds,
  isolatedVoidId,
  onToggleVisibility,
  onSetIsolated,
  hiddenSubAssemblyIds,
  isolatedSubAssemblyId,
  onToggleSubAssemblyVisibility,
  onSetIsolatedSubAssembly,
  hiddenFaceIds,
  onToggleFaceVisibility,
  onDeleteVoid,
  onDeleteSubAssembly,
}) => {
  const isSelected = selectedAssemblyId === 'main';
  const { w, h, d } = rootVoid.bounds;

  const outerFacePanels: OuterFacePanel[] = faces.map((face) => ({
    id: `face-${face.id}`,
    faceId: face.id,
    label: faceLabels[face.id],
    solid: face.solid,
  }));

  const treeOps: TreeOpsProps = {
    selectedVoidId,
    selectedSubAssemblyId,
    selectedPanelId,
    selectedAssemblyId,
    onSelectVoid,
    onSelectSubAssembly,
    onSelectPanel,
    onSelectAssembly,
    hiddenVoidIds,
    isolatedVoidId,
    onToggleVisibility,
    onSetIsolated,
    hiddenSubAssemblyIds,
    isolatedSubAssemblyId,
    onToggleSubAssemblyVisibility,
    onSetIsolatedSubAssembly,
    hiddenFaceIds,
    onToggleFaceVisibility,
    onDeleteVoid,
    onDeleteSubAssembly,
  };

  return (
    <div className="tree-node">
      <div
        className={`tree-node-content assembly ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelectAssembly(isSelected ? null : 'main')}
      >
        <span className="tree-node-main">
          <span className="tree-icon">📦</span>
          <span className="tree-label">Main Box</span>
          <span className="tree-dimensions">{w.toFixed(0)}×{h.toFixed(0)}×{d.toFixed(0)}</span>
        </span>
      </div>

      {/* Outer face panels */}
      <div className="tree-children">
        {outerFacePanels.map((panel) => (
          <OuterPanelNode
            key={panel.id}
            panel={panel}
            depth={depth + 1}
            selectedPanelId={selectedPanelId}
            onSelectPanel={onSelectPanel}
            hiddenFaceIds={hiddenFaceIds}
            onToggleFaceVisibility={onToggleFaceVisibility}
          />
        ))}
      </div>

      {/* Interior void */}
      <div className="tree-children">
        <VoidNode
          node={rootVoid}
          depth={depth + 1}
          label="Interior"
          {...treeOps}
        />
      </div>
    </div>
  );
};

export const BoxTree: React.FC = () => {
  const {
    rootVoid,
    faces,
    selectedVoidId,
    selectedSubAssemblyId,
    selectedPanelId,
    selectedAssemblyId,
    selectVoid,
    selectSubAssembly,
    selectPanel,
    selectAssembly,
    hiddenVoidIds,
    isolatedVoidId,
    toggleVoidVisibility,
    setIsolatedVoid,
    hiddenSubAssemblyIds,
    isolatedSubAssemblyId,
    toggleSubAssemblyVisibility,
    setIsolatedSubAssembly,
    hiddenFaceIds,
    toggleFaceVisibility,
    removeVoid,
    removeSubAssembly,
  } = useBoxStore();

  const hasIsolation = isolatedVoidId || isolatedSubAssemblyId;

  const handleShowAll = () => {
    setIsolatedVoid(null);
    setIsolatedSubAssembly(null);
  };

  return (
    <Panel title="Structure">
      <div className="box-tree">
        <MainBoxNode
          rootVoid={rootVoid}
          faces={faces}
          depth={0}
          selectedVoidId={selectedVoidId}
          selectedSubAssemblyId={selectedSubAssemblyId}
          selectedPanelId={selectedPanelId}
          selectedAssemblyId={selectedAssemblyId}
          onSelectVoid={selectVoid}
          onSelectSubAssembly={selectSubAssembly}
          onSelectPanel={selectPanel}
          onSelectAssembly={selectAssembly}
          hiddenVoidIds={hiddenVoidIds}
          isolatedVoidId={isolatedVoidId}
          onToggleVisibility={toggleVoidVisibility}
          onSetIsolated={setIsolatedVoid}
          hiddenSubAssemblyIds={hiddenSubAssemblyIds}
          isolatedSubAssemblyId={isolatedSubAssemblyId}
          onToggleSubAssemblyVisibility={toggleSubAssemblyVisibility}
          onSetIsolatedSubAssembly={setIsolatedSubAssembly}
          hiddenFaceIds={hiddenFaceIds}
          onToggleFaceVisibility={toggleFaceVisibility}
          onDeleteVoid={removeVoid}
          onDeleteSubAssembly={removeSubAssembly}
        />
      </div>
      {hasIsolation && (
        <button
          className="unisolate-btn"
          onClick={handleShowAll}
        >
          Show All
        </button>
      )}
    </Panel>
  );
};
