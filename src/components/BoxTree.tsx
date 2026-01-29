import React, { useMemo } from 'react';
import { useBoxStore, getMainInteriorVoid } from '../store/useBoxStore';
import { useEngineFaces, useEngineVoidTree, useEnginePanels } from '../engine';
import { Panel } from './UI/Panel';
import { Void, SubAssembly, Face, FaceId, PanelPath } from '../types';

// Represents a divider panel created by a subdivision
interface DividerPanel {
  id: string;
  voidId: string;  // The child void this divider belongs to (used for deletion)
  axis: 'x' | 'y' | 'z';
  position: number;
  width: number;
  height: number;
}

// Lookup maps for finding panel IDs from the engine
interface PanelLookup {
  // faceId → panel ID (for main assembly face panels)
  facePanels: Map<FaceId, string>;
  // "subAssemblyId-faceId" → panel ID (for sub-assembly face panels)
  subAssemblyFacePanels: Map<string, string>;
  // "voidId-axis" → panel ID (for dividers)
  dividerPanels: Map<string, string>;
}

// Build lookup maps from engine panels
function buildPanelLookup(panels: PanelPath[]): PanelLookup {
  const facePanels = new Map<FaceId, string>();
  const subAssemblyFacePanels = new Map<string, string>();
  const dividerPanels = new Map<string, string>();

  for (const panel of panels) {
    if (panel.source.type === 'face' && panel.source.faceId) {
      if (panel.source.subAssemblyId) {
        // Sub-assembly face panel
        const key = `${panel.source.subAssemblyId}-${panel.source.faceId}`;
        subAssemblyFacePanels.set(key, panel.id);
      } else {
        // Main assembly face panel
        facePanels.set(panel.source.faceId, panel.id);
      }
    } else if (panel.source.type === 'divider' && panel.source.subdivisionId && panel.source.axis) {
      // Key: "voidId-axis-position" for uniqueness (multiple splits on same axis at different positions)
      // Note: subdivisionId from engine is the parent void's ID (the void being subdivided)
      const key = `${panel.source.subdivisionId}-${panel.source.axis}-${panel.source.position}`;
      dividerPanels.set(key, panel.id);
    }
  }

  return { facePanels, subAssemblyFacePanels, dividerPanels };
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

// Extract divider panels from a void's children or grid subdivision
// Looks up panel IDs from the engine via the lookup map
const getDividerPanels = (parent: Void, lookup: PanelLookup): DividerPanel[] => {
  const panels: DividerPanel[] = [];

  // Check for grid subdivision (multi-axis) first
  if (parent.gridSubdivision) {
    for (const axis of parent.gridSubdivision.axes) {
      const positions = parent.gridSubdivision.positions[axis];
      if (positions) {
        for (const position of positions) {
          // Look up the panel ID from the engine
          // Key format: "parentVoidId-axis-position" (grid dividers use parent void ID)
          const lookupKey = `${parent.id}-${axis}-${position}`;
          const panelId = lookup.dividerPanels.get(lookupKey);

          // Skip if we can't find this panel in the engine
          if (!panelId) continue;

          let width: number, height: number;
          switch (axis) {
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
            id: panelId,
            voidId: parent.id,  // Grid dividers belong to the parent (purge to remove)
            axis,
            position,
            width,
            height,
          });
        }
      }
    }
    return panels;
  }

  // Regular subdivision handling (single-axis, sequential)
  for (const child of parent.children) {
    if (child.splitAxis && child.splitPosition !== undefined) {
      // Look up the panel ID from the engine
      // Key format: "parentVoidId-axis-position" (engine uses parent void ID, not child)
      const lookupKey = `${parent.id}-${child.splitAxis}-${child.splitPosition}`;
      const panelId = lookup.dividerPanels.get(lookupKey);

      // Skip if we can't find this panel in the engine (shouldn't happen)
      if (!panelId) continue;

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
        id: panelId,
        voidId: child.id,  // Store child voidId for deletion (removing subdivision removes this child)
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
  selectedVoidIds: Set<string>;
  selectedSubAssemblyIds: Set<string>;
  selectedPanelIds: Set<string>;
  selectedAssemblyId: string | null;
  onSelectVoid: (id: string | null, additive?: boolean) => void;
  onSelectSubAssembly: (id: string | null, additive?: boolean) => void;
  onSelectPanel: (id: string | null, additive?: boolean) => void;
  onSelectAssembly: (id: string | null) => void;
  // Hover state
  hoveredVoidId: string | null;
  hoveredPanelId: string | null;
  hoveredAssemblyId: string | null;
  onHoverVoid: (id: string | null) => void;
  onHoverPanel: (id: string | null) => void;
  onHoverAssembly: (id: string | null) => void;
  // Visibility
  hiddenVoidIds: Set<string>;
  isolatedVoidId: string | null;
  onToggleVisibility: (id: string) => void;
  onSetIsolated: (id: string | null) => void;
  hiddenSubAssemblyIds: Set<string>;
  isolatedSubAssemblyId: string | null;
  onToggleSubAssemblyVisibility: (id: string) => void;
  onSetIsolatedSubAssembly: (id: string | null) => void;
  hiddenFaceIds: Set<string>;
  isolatedPanelId: string | null;
  onToggleFaceVisibility: (faceId: string) => void;
  onSetIsolatedPanel: (panelId: string | null) => void;
  onDeleteVoid: (voidId: string) => void;
  onDeleteSubAssembly: (voidId: string) => void;
  // Panel ID lookup from engine
  panelLookup: PanelLookup;
  // Edit panel in 2D view
  onEditPanel: (panelId: string) => void;
  // Configure face panel settings
  onConfigureFace: (panelId: string) => void;
}

// Outer face panel node (for main box or sub-assembly)
const OuterPanelNode: React.FC<{
  panel: OuterFacePanel;
  depth: number;
  selectedPanelIds: Set<string>;
  onSelectPanel: (id: string | null, additive?: boolean) => void;
  hoveredPanelId: string | null;
  onHoverPanel: (id: string | null) => void;
  hiddenFaceIds: Set<string>;
  isolatedPanelId: string | null;
  onToggleFaceVisibility: (faceId: string) => void;
  onSetIsolatedPanel: (panelId: string | null) => void;
  onEditPanel: (panelId: string) => void;
  onConfigureFace: (panelId: string) => void;
}> = ({ panel, depth, selectedPanelIds, onSelectPanel, hoveredPanelId, onHoverPanel, hiddenFaceIds, isolatedPanelId, onToggleFaceVisibility, onSetIsolatedPanel, onEditPanel, onConfigureFace }) => {
  // Tree shows actual selection only (no cascade from assembly selection)
  const isSelected = selectedPanelIds.has(panel.id);
  const isHovered = hoveredPanelId === panel.id;
  const isHidden = hiddenFaceIds.has(panel.id);
  const isIsolated = isolatedPanelId === panel.id;

  return (
    <div className="tree-node">
      <div
        className={`tree-node-content panel ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''} ${!panel.solid ? 'open-face' : ''} ${isHidden ? 'hidden' : ''} ${isIsolated ? 'isolated' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onMouseEnter={() => onHoverPanel(panel.id)}
        onMouseLeave={() => onHoverPanel(null)}
      >
        <span
          className="tree-node-main"
          onClick={(e) => onSelectPanel(panel.id, e.shiftKey)}
        >
          <span className="tree-icon">{panel.solid ? '▬' : '▭'}</span>
          <span className="tree-label">{panel.label}</span>
          <span className="tree-status">{panel.solid ? '' : '(open)'}</span>
        </span>
        {panel.solid && (
          <span className="tree-controls">
            <button
              className="tree-btn"
              onClick={(e) => {
                e.stopPropagation();
                onConfigureFace(panel.id);
              }}
              title="Configure face"
            >
              ⚙
            </button>
            <button
              className="tree-btn"
              onClick={(e) => {
                e.stopPropagation();
                onEditPanel(panel.id);
              }}
              title="Edit in 2D"
            >
              ✎
            </button>
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
            <button
              className={`tree-btn ${isIsolated ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onSetIsolatedPanel(isIsolated ? null : panel.id);
              }}
              title={isIsolated ? 'Unisolate' : 'Isolate'}
            >
              ◎
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
  selectedPanelIds: Set<string>;
  onSelectPanel: (id: string | null, additive?: boolean) => void;
  hoveredPanelId: string | null;
  onHoverPanel: (id: string | null) => void;
  hiddenFaceIds: Set<string>;
  isolatedPanelId: string | null;
  onToggleFaceVisibility: (faceId: string) => void;
  onSetIsolatedPanel: (panelId: string | null) => void;
  onDelete: (voidId: string) => void;
  onEditPanel: (panelId: string) => void;
}> = ({ panel, depth, selectedPanelIds, onSelectPanel, hoveredPanelId, onHoverPanel, hiddenFaceIds, isolatedPanelId, onToggleFaceVisibility, onSetIsolatedPanel, onDelete, onEditPanel }) => {
  // Tree shows actual selection only (no cascade from assembly selection)
  const isSelected = selectedPanelIds.has(panel.id);
  const isHovered = hoveredPanelId === panel.id;
  const isHidden = hiddenFaceIds.has(panel.id);
  const isIsolated = isolatedPanelId === panel.id;
  const axisLabel = panel.axis.toUpperCase();

  return (
    <div className="tree-node">
      <div
        className={`tree-node-content panel ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''} ${isHidden ? 'hidden' : ''} ${isIsolated ? 'isolated' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onMouseEnter={() => onHoverPanel(panel.id)}
        onMouseLeave={() => onHoverPanel(null)}
      >
        <span
          className="tree-node-main"
          onClick={(e) => onSelectPanel(panel.id, e.shiftKey)}
        >
          <span className="tree-icon">▬</span>
          <span className="tree-label">Divider @ {axisLabel}={panel.position.toFixed(0)}</span>
          <span className="tree-dimensions">{panel.width.toFixed(0)}×{panel.height.toFixed(0)}</span>
        </span>
        <span className="tree-controls">
          <button
            className="tree-btn"
            onClick={(e) => {
              e.stopPropagation();
              onEditPanel(panel.id);
            }}
            title="Edit in 2D"
          >
            ✎
          </button>
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
          <button
            className={`tree-btn ${isIsolated ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onSetIsolatedPanel(isIsolated ? null : panel.id);
            }}
            title={isIsolated ? 'Unisolate' : 'Isolate'}
          >
            ◎
          </button>
          <button
            className="tree-btn delete"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(panel.voidId);
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
  selectedVoidIds,
  selectedSubAssemblyIds,
  selectedPanelIds,
  selectedAssemblyId,
  onSelectVoid,
  onSelectSubAssembly,
  onSelectPanel,
  onSelectAssembly,
  hoveredVoidId,
  hoveredPanelId,
  hoveredAssemblyId,
  onHoverVoid,
  onHoverPanel,
  onHoverAssembly,
  hiddenVoidIds,
  isolatedVoidId,
  onToggleVisibility,
  onSetIsolated,
  hiddenSubAssemblyIds,
  isolatedSubAssemblyId,
  onToggleSubAssemblyVisibility,
  onSetIsolatedSubAssembly,
  hiddenFaceIds,
  isolatedPanelId,
  onToggleFaceVisibility,
  onSetIsolatedPanel,
  onDeleteVoid,
  onDeleteSubAssembly,
  panelLookup,
  onEditPanel,
  onConfigureFace,
}) => {
  const isSelected = selectedVoidIds.has(node.id);
  const isHovered = hoveredVoidId === node.id;
  const isLeaf = node.children.length === 0 && !node.subAssembly;
  const hasChildren = node.children.length > 0;
  const hasSubAssembly = !!node.subAssembly;
  const isHidden = hiddenVoidIds.has(node.id);
  const isIsolated = isolatedVoidId === node.id;

  const dividerPanels = hasChildren ? getDividerPanels(node, panelLookup) : [];

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
    selectedVoidIds,
    selectedSubAssemblyIds,
    selectedPanelIds,
    selectedAssemblyId,
    onSelectVoid,
    onSelectSubAssembly,
    onSelectPanel,
    onSelectAssembly,
    hoveredVoidId,
    hoveredPanelId,
    hoveredAssemblyId,
    onHoverVoid,
    onHoverPanel,
    onHoverAssembly,
    hiddenVoidIds,
    isolatedVoidId,
    onToggleVisibility,
    onSetIsolated,
    hiddenSubAssemblyIds,
    isolatedSubAssemblyId,
    onToggleSubAssemblyVisibility,
    onSetIsolatedSubAssembly,
    hiddenFaceIds,
    isolatedPanelId,
    onToggleFaceVisibility,
    onSetIsolatedPanel,
    onDeleteVoid,
    onDeleteSubAssembly,
    panelLookup,
    onEditPanel,
    onConfigureFace,
  };

  return (
    <div className="tree-node">
      <div
        className={`tree-node-content ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''} ${isLeaf ? 'leaf' : 'branch'} ${isHidden ? 'hidden' : ''} ${isIsolated ? 'isolated' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onMouseEnter={() => onHoverVoid(node.id)}
        onMouseLeave={() => onHoverVoid(null)}
      >
        <span
          className="tree-node-main"
          onClick={(e) => onSelectVoid(node.id, e.shiftKey)}
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

      {/* Show divider panels and child voids */}
      {hasChildren && (
        <div className="tree-children">
          {/* For grid subdivisions, show all dividers first, then all cells */}
          {node.gridSubdivision ? (
            <>
              {/* Grid dividers */}
              {dividerPanels.map((panel) => (
                <DividerPanelNode
                  key={panel.id}
                  panel={panel}
                  depth={depth + 1}
                  selectedPanelIds={selectedPanelIds}
                  onSelectPanel={onSelectPanel}
                  hoveredPanelId={hoveredPanelId}
                  onHoverPanel={onHoverPanel}
                  hiddenFaceIds={hiddenFaceIds}
                  isolatedPanelId={isolatedPanelId}
                  onToggleFaceVisibility={onToggleFaceVisibility}
                  onSetIsolatedPanel={onSetIsolatedPanel}
                  onDelete={onDeleteVoid}
                  onEditPanel={onEditPanel}
                />
              ))}
              {/* Grid cells */}
              {node.children.map((child) => (
                <VoidNode
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  {...treeOps}
                />
              ))}
            </>
          ) : (
            /* Regular subdivisions: interleave dividers with child voids */
            node.children.map((child) => {
              // Find the panel for this child void by matching voidId
              const panel = dividerPanels.find(p => p.voidId === child.id);

              return (
                <React.Fragment key={child.id}>
                  {panel && (
                    <DividerPanelNode
                      panel={panel}
                      depth={depth + 1}
                      selectedPanelIds={selectedPanelIds}
                      onSelectPanel={onSelectPanel}
                      hoveredPanelId={hoveredPanelId}
                      onHoverPanel={onHoverPanel}
                      hiddenFaceIds={hiddenFaceIds}
                      isolatedPanelId={isolatedPanelId}
                      onToggleFaceVisibility={onToggleFaceVisibility}
                      onSetIsolatedPanel={onSetIsolatedPanel}
                      onDelete={onDeleteVoid}
                      onEditPanel={onEditPanel}
                    />
                  )}
                  <VoidNode
                    node={child}
                    depth={depth + 1}
                    {...treeOps}
                  />
                </React.Fragment>
              );
            })
          )}
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
  selectedVoidIds,
  selectedSubAssemblyIds,
  selectedPanelIds,
  selectedAssemblyId,
  onSelectVoid,
  onSelectSubAssembly,
  onSelectPanel,
  onSelectAssembly,
  hoveredVoidId,
  hoveredPanelId,
  hoveredAssemblyId,
  onHoverVoid,
  onHoverPanel,
  onHoverAssembly,
  hiddenVoidIds,
  isolatedVoidId,
  onToggleVisibility,
  onSetIsolated,
  hiddenSubAssemblyIds,
  isolatedSubAssemblyId,
  onToggleSubAssemblyVisibility,
  onSetIsolatedSubAssembly,
  hiddenFaceIds,
  isolatedPanelId,
  onToggleFaceVisibility,
  onSetIsolatedPanel,
  onDeleteVoid,
  onDeleteSubAssembly,
  panelLookup,
  onEditPanel,
  onConfigureFace,
}) => {
  const isSelected = selectedSubAssemblyIds.has(subAssembly.id);
  const isAssemblySelected = selectedAssemblyId === subAssembly.id;
  const isAssemblyHovered = hoveredAssemblyId === subAssembly.id;
  const { rootVoid } = subAssembly;
  const isHidden = hiddenSubAssemblyIds.has(subAssembly.id);
  const isIsolated = isolatedSubAssemblyId === subAssembly.id;

  const getTypeLabel = () => 'Nested Box';
  const getTypeIcon = () => '📦';

  const getDimensions = () => {
    const { w, h, d } = rootVoid.bounds;
    return `${w.toFixed(0)}×${h.toFixed(0)}×${d.toFixed(0)}`;
  };

  // Look up face panel IDs from engine - skip faces that don't have a panel in the engine
  const outerFacePanels: OuterFacePanel[] = subAssembly.faces
    .map((face) => {
      const lookupKey = `${subAssembly.id}-${face.id}`;
      const panelId = panelLookup.subAssemblyFacePanels.get(lookupKey);
      if (!panelId) return null;
      return {
        id: panelId,
        faceId: face.id,
        label: faceLabels[face.id],
        solid: face.solid,
      };
    })
    .filter((p): p is OuterFacePanel => p !== null);

  const treeOps: TreeOpsProps = {
    selectedVoidIds,
    selectedSubAssemblyIds,
    selectedPanelIds,
    selectedAssemblyId,
    onSelectVoid,
    onSelectSubAssembly,
    onSelectPanel,
    onSelectAssembly,
    hoveredVoidId,
    hoveredPanelId,
    hoveredAssemblyId,
    onHoverVoid,
    onHoverPanel,
    onHoverAssembly,
    hiddenVoidIds,
    isolatedVoidId,
    onToggleVisibility,
    onSetIsolated,
    hiddenSubAssemblyIds,
    isolatedSubAssemblyId,
    onToggleSubAssemblyVisibility,
    onSetIsolatedSubAssembly,
    hiddenFaceIds,
    isolatedPanelId,
    onToggleFaceVisibility,
    onSetIsolatedPanel,
    onDeleteVoid,
    onDeleteSubAssembly,
    panelLookup,
    onEditPanel,
    onConfigureFace,
  };

  return (
    <div className="tree-node">
      <div
        className={`tree-node-content subassembly ${isSelected || isAssemblySelected ? 'selected' : ''} ${isAssemblyHovered ? 'hovered' : ''} ${isHidden ? 'hidden' : ''} ${isIsolated ? 'isolated' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onMouseEnter={() => onHoverAssembly(subAssembly.id)}
        onMouseLeave={() => onHoverAssembly(null)}
      >
        <span
          className="tree-node-main"
          onClick={(e) => onSelectSubAssembly(subAssembly.id, e.shiftKey)}
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
            selectedPanelIds={selectedPanelIds}
            onSelectPanel={onSelectPanel}
            hoveredPanelId={hoveredPanelId}
            onHoverPanel={onHoverPanel}
            hiddenFaceIds={hiddenFaceIds}
            isolatedPanelId={isolatedPanelId}
            onToggleFaceVisibility={onToggleFaceVisibility}
            onSetIsolatedPanel={onSetIsolatedPanel}
            onEditPanel={onEditPanel}
            onConfigureFace={onConfigureFace}
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
  selectedVoidIds,
  selectedSubAssemblyIds,
  selectedPanelIds,
  selectedAssemblyId,
  onSelectVoid,
  onSelectSubAssembly,
  onSelectPanel,
  onSelectAssembly,
  hoveredVoidId,
  hoveredPanelId,
  hoveredAssemblyId,
  onHoverVoid,
  onHoverPanel,
  onHoverAssembly,
  hiddenVoidIds,
  isolatedVoidId,
  onToggleVisibility,
  onSetIsolated,
  hiddenSubAssemblyIds,
  isolatedSubAssemblyId,
  onToggleSubAssemblyVisibility,
  onSetIsolatedSubAssembly,
  hiddenFaceIds,
  isolatedPanelId,
  onToggleFaceVisibility,
  onSetIsolatedPanel,
  onDeleteVoid,
  onDeleteSubAssembly,
  panelLookup,
  onEditPanel,
  onConfigureFace,
}) => {
  const isSelected = selectedAssemblyId === 'main';
  const isHovered = hoveredAssemblyId === 'main';
  const { w, h, d } = rootVoid.bounds;

  // Get the main interior void - this is where user subdivisions go
  // When lid insets exist, this is the 'main-interior' child, otherwise it's rootVoid itself
  const interiorVoid = getMainInteriorVoid(rootVoid);

  // Look up face panel IDs from engine - skip faces that don't have a panel in the engine
  const outerFacePanels: OuterFacePanel[] = faces
    .map((face) => {
      const panelId = panelLookup.facePanels.get(face.id);
      if (!panelId) return null;
      return {
        id: panelId,
        faceId: face.id,
        label: faceLabels[face.id],
        solid: face.solid,
      };
    })
    .filter((p): p is OuterFacePanel => p !== null);

  const treeOps: TreeOpsProps = {
    selectedVoidIds,
    selectedSubAssemblyIds,
    selectedPanelIds,
    selectedAssemblyId,
    onSelectVoid,
    onSelectSubAssembly,
    onSelectPanel,
    onSelectAssembly,
    hoveredVoidId,
    hoveredPanelId,
    hoveredAssemblyId,
    onHoverVoid,
    onHoverPanel,
    onHoverAssembly,
    hiddenVoidIds,
    isolatedVoidId,
    onToggleVisibility,
    onSetIsolated,
    hiddenSubAssemblyIds,
    isolatedSubAssemblyId,
    onToggleSubAssemblyVisibility,
    onSetIsolatedSubAssembly,
    hiddenFaceIds,
    isolatedPanelId,
    onToggleFaceVisibility,
    onSetIsolatedPanel,
    onDeleteVoid,
    onDeleteSubAssembly,
    panelLookup,
    onEditPanel,
    onConfigureFace,
  };

  return (
    <div className="tree-node">
      <div
        className={`tree-node-content assembly ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelectAssembly(isSelected ? null : 'main')}
        onMouseEnter={() => onHoverAssembly('main')}
        onMouseLeave={() => onHoverAssembly(null)}
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
            selectedPanelIds={selectedPanelIds}
            onSelectPanel={onSelectPanel}
            hoveredPanelId={hoveredPanelId}
            onHoverPanel={onHoverPanel}
            hiddenFaceIds={hiddenFaceIds}
            isolatedPanelId={isolatedPanelId}
            onToggleFaceVisibility={onToggleFaceVisibility}
            onSetIsolatedPanel={onSetIsolatedPanel}
            onEditPanel={onEditPanel}
            onConfigureFace={onConfigureFace}
          />
        ))}
      </div>

      {/* Interior void - use the actual user-editable interior (main-interior when lid insets exist) */}
      <div className="tree-children">
        <VoidNode
          node={interiorVoid}
          depth={depth + 1}
          label="Interior"
          {...treeOps}
        />
      </div>
    </div>
  );
};

export const BoxTree: React.FC = () => {
  // Model state from engine
  const rootVoid = useEngineVoidTree();
  const faces = useEngineFaces();
  const panelCollection = useEnginePanels();

  // Build lookup maps from engine panels - memoize to avoid rebuilding on every render
  const panelLookup = useMemo(
    () => buildPanelLookup(panelCollection?.panels ?? []),
    [panelCollection]
  );

  // UI state and actions from store
  const {
    selectedVoidIds,
    selectedSubAssemblyIds,
    selectedPanelIds,
    selectedAssemblyId,
    selectVoid,
    selectSubAssembly,
    selectPanel,
    selectAssembly,
    hoveredVoidId,
    hoveredPanelId,
    hoveredAssemblyId,
    setHoveredVoid,
    setHoveredPanel,
    setHoveredAssembly,
    hiddenVoidIds,
    isolatedVoidId,
    toggleVoidVisibility,
    setIsolatedVoid,
    hiddenSubAssemblyIds,
    isolatedSubAssemblyId,
    toggleSubAssemblyVisibility,
    setIsolatedSubAssembly,
    hiddenFaceIds,
    isolatedPanelId,
    toggleFaceVisibility,
    setIsolatedPanel,
    removeVoid,
    removeSubAssembly,
    enterSketchView,
    setActiveTool,
  } = useBoxStore();

  // Early return if engine not initialized
  if (!rootVoid) return null;

  const hasIsolation = isolatedVoidId || isolatedSubAssemblyId || isolatedPanelId;

  const handleShowAll = () => {
    setIsolatedVoid(null);
    setIsolatedSubAssembly(null);
    setIsolatedPanel(null);
  };

  // Handle configure face - select the panel and open the configure palette
  const handleConfigureFace = (panelId: string) => {
    selectPanel(panelId, false);
    setActiveTool('configure');
  };

  return (
    <Panel title="Structure">
      <div className="box-tree">
        <MainBoxNode
          rootVoid={rootVoid}
          faces={faces}
          depth={0}
          selectedVoidIds={selectedVoidIds}
          selectedSubAssemblyIds={selectedSubAssemblyIds}
          selectedPanelIds={selectedPanelIds}
          selectedAssemblyId={selectedAssemblyId}
          onSelectVoid={selectVoid}
          onSelectSubAssembly={selectSubAssembly}
          onSelectPanel={selectPanel}
          onSelectAssembly={selectAssembly}
          hoveredVoidId={hoveredVoidId}
          hoveredPanelId={hoveredPanelId}
          hoveredAssemblyId={hoveredAssemblyId}
          onHoverVoid={setHoveredVoid}
          onHoverPanel={setHoveredPanel}
          onHoverAssembly={setHoveredAssembly}
          hiddenVoidIds={hiddenVoidIds}
          isolatedVoidId={isolatedVoidId}
          onToggleVisibility={toggleVoidVisibility}
          onSetIsolated={setIsolatedVoid}
          hiddenSubAssemblyIds={hiddenSubAssemblyIds}
          isolatedSubAssemblyId={isolatedSubAssemblyId}
          onToggleSubAssemblyVisibility={toggleSubAssemblyVisibility}
          onSetIsolatedSubAssembly={setIsolatedSubAssembly}
          hiddenFaceIds={hiddenFaceIds}
          isolatedPanelId={isolatedPanelId}
          onToggleFaceVisibility={toggleFaceVisibility}
          onSetIsolatedPanel={setIsolatedPanel}
          onDeleteVoid={removeVoid}
          onDeleteSubAssembly={removeSubAssembly}
          panelLookup={panelLookup}
          onEditPanel={enterSketchView}
          onConfigureFace={handleConfigureFace}
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
