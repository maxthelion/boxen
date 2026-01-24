import React, { useState, useMemo } from 'react';
import { useBoxStore, getAllSubdivisions, getAllSubAssemblies } from '../store/useBoxStore';
import { Panel } from './UI/Panel';
import { NumberInput } from './UI/NumberInput';
import { FaceId, Face, AssemblyConfig, SplitPositionMode } from '../types';
import {
  getFaceEdgeStatuses,
  getDividerEdgeStatuses,
  EdgeStatusInfo,
} from '../utils/panelGenerator';

type EdgePosition = 'top' | 'bottom' | 'left' | 'right';

interface EdgePreviewProps {
  width: number;
  height: number;
  edgeStatuses: EdgeStatusInfo[];
  selectedEdge: EdgePosition | null;
  onEdgeClick: (edge: EdgePosition) => void;
  edgeExtensions: { top: number; bottom: number; left: number; right: number };
}

const EdgePreview: React.FC<EdgePreviewProps> = ({
  width,
  height,
  edgeStatuses,
  selectedEdge,
  onEdgeClick,
  edgeExtensions,
}) => {
  const padding = 15;
  const strokeWidth = 6;

  // Normalize dimensions for display (max 100 in either direction)
  const scale = Math.min(80 / width, 80 / height);
  const displayW = width * scale;
  const displayH = height * scale;

  const viewBoxWidth = displayW + padding * 2;
  const viewBoxHeight = displayH + padding * 2;

  const getEdgeStatus = (pos: EdgePosition): 'locked' | 'unlocked' => {
    const edge = edgeStatuses.find((e) => e.position === pos);
    return edge?.status ?? 'locked';
  };

  const getEdgeClass = (pos: EdgePosition): string => {
    const status = getEdgeStatus(pos);
    const isSelected = selectedEdge === pos;
    const classes = [`edge-${status}`];
    if (isSelected) classes.push('edge-selected');
    if (status === 'unlocked') classes.push('edge-clickable');
    return classes.join(' ');
  };

  // Apply extensions to corner positions
  const ext = {
    top: edgeExtensions.top * scale,
    bottom: edgeExtensions.bottom * scale,
    left: edgeExtensions.left * scale,
    right: edgeExtensions.right * scale,
  };

  // Calculate corners with extensions
  const topY = padding - ext.top;
  const bottomY = padding + displayH + ext.bottom;
  const leftX = padding - ext.left;
  const rightX = padding + displayW + ext.right;

  // Edge definitions
  const edges = {
    top: { x1: leftX, y1: topY, x2: rightX, y2: topY },
    bottom: { x1: rightX, y1: bottomY, x2: leftX, y2: bottomY },
    left: { x1: leftX, y1: bottomY, x2: leftX, y2: topY },
    right: { x1: rightX, y1: topY, x2: rightX, y2: bottomY },
  };

  const handleEdgeClick = (pos: EdgePosition) => {
    if (getEdgeStatus(pos) === 'unlocked') {
      onEdgeClick(pos);
    }
  };

  return (
    <svg
      className="edge-preview-svg"
      viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Background fill */}
      <rect
        x={leftX}
        y={topY}
        width={rightX - leftX}
        height={bottomY - topY}
        fill="#252545"
        stroke="none"
      />

      {/* Edges */}
      {(['top', 'right', 'bottom', 'left'] as EdgePosition[]).map((pos) => (
        <line
          key={pos}
          {...edges[pos]}
          className={getEdgeClass(pos)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          onClick={() => handleEdgeClick(pos)}
          style={{ cursor: getEdgeStatus(pos) === 'unlocked' ? 'pointer' : 'default' }}
        />
      ))}

      {/* Extension indicators */}
      {edgeExtensions.top !== 0 && (
        <text x={viewBoxWidth / 2} y={topY - 5} className="extension-label" textAnchor="middle">
          {edgeExtensions.top > 0 ? '+' : ''}{edgeExtensions.top}
        </text>
      )}
      {edgeExtensions.bottom !== 0 && (
        <text x={viewBoxWidth / 2} y={bottomY + 12} className="extension-label" textAnchor="middle">
          {edgeExtensions.bottom > 0 ? '+' : ''}{edgeExtensions.bottom}
        </text>
      )}
      {edgeExtensions.left !== 0 && (
        <text x={leftX - 5} y={viewBoxHeight / 2} className="extension-label" textAnchor="end" dominantBaseline="middle">
          {edgeExtensions.left > 0 ? '+' : ''}{edgeExtensions.left}
        </text>
      )}
      {edgeExtensions.right !== 0 && (
        <text x={rightX + 5} y={viewBoxHeight / 2} className="extension-label" textAnchor="start" dominantBaseline="middle">
          {edgeExtensions.right > 0 ? '+' : ''}{edgeExtensions.right}
        </text>
      )}
    </svg>
  );
};

const EdgeLegend: React.FC = () => (
  <div className="edge-legend">
    <div className="legend-item">
      <span className="legend-color locked" />
      <span>Locked (finger joints)</span>
    </div>
    <div className="legend-item">
      <span className="legend-color unlocked" />
      <span>Unlocked (extendable)</span>
    </div>
  </div>
);

interface EdgeControlsProps {
  edge: EdgePosition;
  value: number;
  status: 'locked' | 'unlocked';
  onChange: (value: number) => void;
}

const EdgeControls: React.FC<EdgeControlsProps> = ({ edge, value, status, onChange }) => {
  const edgeNames: Record<EdgePosition, string> = {
    top: 'Top',
    bottom: 'Bottom',
    left: 'Left',
    right: 'Right',
  };

  if (status === 'locked') {
    return (
      <div className="edge-controls">
        <div className="edge-controls-header">
          <span className="edge-name">{edgeNames[edge]} Edge</span>
          <span className="edge-status-badge locked">Locked</span>
        </div>
        <p className="edge-controls-hint">
          This edge has finger joints and cannot be extended in V1.
        </p>
      </div>
    );
  }

  return (
    <div className="edge-controls">
      <div className="edge-controls-header">
        <span className="edge-name">{edgeNames[edge]} Edge</span>
        <span className="edge-status-badge unlocked">Unlocked</span>
      </div>
      <div className="edge-controls-row">
        <button
          className="edge-btn"
          onClick={() => onChange(value - 1)}
          title="Extend inward (shrink)"
        >
          -
        </button>
        <NumberInput
          className="edge-input"
          value={value}
          onChange={onChange}
          step={1}
        />
        <button
          className="edge-btn"
          onClick={() => onChange(value + 1)}
          title="Extend outward (grow)"
        >
          +
        </button>
        <span className="edge-unit">mm</span>
      </div>
      <p className="edge-controls-hint">
        Positive = outward (grow), Negative = inward (shrink)
      </p>
    </div>
  );
};

const faceNames: Record<string, string> = {
  front: 'Front',
  back: 'Back',
  left: 'Left',
  right: 'Right',
  top: 'Top',
  bottom: 'Bottom',
};

const axisNames: Record<string, string> = {
  x: 'Vertical (X)',
  y: 'Horizontal (Y)',
  z: 'Vertical (Z)',
};

const axisLabels: Record<string, string> = {
  x: 'X Position (left/right)',
  y: 'Y Position (up/down)',
  z: 'Z Position (front/back)',
};

// Calculate face panel dimensions
const getFaceDimensions = (
  faceId: FaceId,
  width: number,
  height: number,
  depth: number,
  materialThickness: number
): { panelWidth: number; panelHeight: number } => {
  switch (faceId) {
    case 'front':
    case 'back':
      return { panelWidth: width, panelHeight: height };
    case 'left':
    case 'right':
      return { panelWidth: depth, panelHeight: height };
    case 'top':
    case 'bottom':
      return { panelWidth: width, panelHeight: depth };
    default:
      return { panelWidth: 0, panelHeight: 0 };
  }
};

// Calculate divider panel dimensions and which faces it meets
const getDividerDimensions = (
  axis: 'x' | 'y' | 'z',
  bounds: { x: number; y: number; z: number; w: number; h: number; d: number },
  containerDims: { width: number; height: number; depth: number },
  faces: Face[]
): {
  panelWidth: number;
  panelHeight: number;
  meetsTop: boolean;
  meetsBottom: boolean;
  meetsLeft: boolean;
  meetsRight: boolean;
} => {
  const isFaceSolid = (faceId: FaceId) => faces.find((f) => f.id === faceId)?.solid ?? false;
  const tolerance = 0.01;

  let panelWidth = 0;
  let panelHeight = 0;
  let meetsTop = false;
  let meetsBottom = false;
  let meetsLeft = false;
  let meetsRight = false;

  switch (axis) {
    case 'x':
      panelWidth = bounds.d;
      panelHeight = bounds.h;
      meetsTop = isFaceSolid('top') && bounds.y + bounds.h >= containerDims.height - tolerance;
      meetsBottom = isFaceSolid('bottom') && bounds.y <= tolerance;
      meetsLeft = isFaceSolid('back') && bounds.z <= tolerance;
      meetsRight = isFaceSolid('front') && bounds.z + bounds.d >= containerDims.depth - tolerance;
      break;
    case 'y':
      panelWidth = bounds.w;
      panelHeight = bounds.d;
      meetsTop = isFaceSolid('back') && bounds.z <= tolerance;
      meetsBottom = isFaceSolid('front') && bounds.z + bounds.d >= containerDims.depth - tolerance;
      meetsLeft = isFaceSolid('left') && bounds.x <= tolerance;
      meetsRight = isFaceSolid('right') && bounds.x + bounds.w >= containerDims.width - tolerance;
      break;
    case 'z':
      panelWidth = bounds.w;
      panelHeight = bounds.h;
      meetsTop = isFaceSolid('top') && bounds.y + bounds.h >= containerDims.height - tolerance;
      meetsBottom = isFaceSolid('bottom') && bounds.y <= tolerance;
      meetsLeft = isFaceSolid('left') && bounds.x <= tolerance;
      meetsRight = isFaceSolid('right') && bounds.x + bounds.w >= containerDims.width - tolerance;
      break;
  }

  return { panelWidth, panelHeight, meetsTop, meetsBottom, meetsLeft, meetsRight };
};

export const PanelProperties: React.FC = () => {
  const {
    selectedPanelIds,
    faces,
    config,
    rootVoid,
    toggleFace,
    toggleSubAssemblyFace,
    panelCollection,
    setEdgeExtension,
    setDividerPosition,
    setDividerPositionMode,
    enterSketchView,
  } = useBoxStore();

  const [selectedEdge, setSelectedEdge] = useState<EdgePosition | null>(null);

  // Get the first selected panel ID (for multi-select, show properties of the first one)
  const selectedPanelId = selectedPanelIds.size > 0 ? Array.from(selectedPanelIds)[0] : null;

  // Get the selected panel from panelCollection
  const selectedPanel = useMemo(() => {
    if (!panelCollection || !selectedPanelId) return null;
    return panelCollection.panels.find((p) => p.id === selectedPanelId) ?? null;
  }, [panelCollection, selectedPanelId]);

  // Get sub-assembly data if this is a sub-assembly panel
  const subAssemblyData = useMemo(() => {
    if (!selectedPanel?.source.subAssemblyId) return null;
    const subAssemblies = getAllSubAssemblies(rootVoid);
    return subAssemblies.find((s) => s.subAssembly.id === selectedPanel.source.subAssemblyId) ?? null;
  }, [selectedPanel, rootVoid]);

  if (!selectedPanelId || !selectedPanel) {
    return null;
  }

  const { source } = selectedPanel;
  const isSubAssembly = !!source.subAssemblyId;

  // Determine which faces and config to use
  const activeFaces = isSubAssembly && subAssemblyData
    ? subAssemblyData.subAssembly.faces
    : faces;
  const activeConfig = isSubAssembly && subAssemblyData
    ? {
        width: subAssemblyData.subAssembly.rootVoid.bounds.w + 2 * subAssemblyData.subAssembly.materialThickness,
        height: subAssemblyData.subAssembly.rootVoid.bounds.h + 2 * subAssemblyData.subAssembly.materialThickness,
        depth: subAssemblyData.subAssembly.rootVoid.bounds.d + 2 * subAssemblyData.subAssembly.materialThickness,
        materialThickness: subAssemblyData.subAssembly.materialThickness,
        assembly: subAssemblyData.subAssembly.assembly,
      }
    : config;
  const activeRootVoid = isSubAssembly && subAssemblyData
    ? subAssemblyData.subAssembly.rootVoid
    : rootVoid;

  const edgeExtensions = selectedPanel.edgeExtensions ?? { top: 0, bottom: 0, left: 0, right: 0 };

  const handleEdgeExtensionChange = (value: number) => {
    if (selectedEdge && selectedPanel) {
      setEdgeExtension(selectedPanel.id, selectedEdge, value);
    }
  };

  // Handle face panels
  if (source.type === 'face' && source.faceId) {
    const faceId = source.faceId;
    const face = activeFaces.find((f) => f.id === faceId);

    if (!face) return null;

    const { panelWidth, panelHeight } = getFaceDimensions(
      faceId,
      activeConfig.width,
      activeConfig.height,
      activeConfig.depth,
      activeConfig.materialThickness
    );

    const edgeStatuses = getFaceEdgeStatuses(faceId, activeFaces, activeConfig.assembly);

    const selectedEdgeStatus = selectedEdge
      ? edgeStatuses.find((e) => e.position === selectedEdge)?.status ?? 'locked'
      : null;

    const titleSuffix = isSubAssembly ? ' (Nested)' : '';
    const typeLabel = isSubAssembly ? 'Sub-Assembly Face' : 'Outer Face';

    return (
      <Panel title="Panel Properties">
        <div className="panel-properties">
          <div className="property-header">
            <span className="property-icon">▬</span>
            <span className="property-title">{faceNames[faceId]} Face{titleSuffix}</span>
          </div>

          <div className="property-group">
            <div className="property-row">
              <span className="property-label">Type:</span>
              <span className="property-value">{typeLabel}</span>
            </div>
            <div className="property-row">
              <span className="property-label">Dimensions:</span>
              <span className="property-value">
                {panelWidth.toFixed(1)} x {panelHeight.toFixed(1)} mm
              </span>
            </div>
            <div className="property-row">
              <span className="property-label">Thickness:</span>
              <span className="property-value">{activeConfig.materialThickness} mm</span>
            </div>
          </div>

          <div className="property-group">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={face.solid}
                onChange={() => {
                  if (isSubAssembly && source.subAssemblyId) {
                    toggleSubAssemblyFace(source.subAssemblyId, faceId);
                  } else {
                    toggleFace(faceId);
                  }
                }}
              />
              <span>Solid (include in cut)</span>
            </label>
          </div>

          {face.solid && (
            <>
              <div className="property-section">
                <h4>Edge Status</h4>
                <EdgePreview
                  width={panelWidth}
                  height={panelHeight}
                  edgeStatuses={edgeStatuses}
                  selectedEdge={selectedEdge}
                  onEdgeClick={setSelectedEdge}
                  edgeExtensions={edgeExtensions}
                />
                <EdgeLegend />
              </div>

              {selectedEdge && selectedEdgeStatus && (
                <EdgeControls
                  edge={selectedEdge}
                  value={edgeExtensions[selectedEdge]}
                  status={selectedEdgeStatus}
                  onChange={handleEdgeExtensionChange}
                />
              )}
            </>
          )}

          <div className="panel-actions">
            <button
              className="edit-2d-btn"
              onClick={() => enterSketchView(selectedPanel.id)}
            >
              Edit in 2D
            </button>
          </div>
        </div>
      </Panel>
    );
  }

  // Handle divider panels
  if (source.type === 'divider' && source.subdivisionId && source.axis) {
    const subdivisions = getAllSubdivisions(activeRootVoid);
    const subdivision = subdivisions.find((s) => s.id === source.subdivisionId);

    if (!subdivision) return null;

    const { axis, position, bounds } = subdivision;

    const containerDims = {
      width: activeRootVoid.bounds.w,
      height: activeRootVoid.bounds.h,
      depth: activeRootVoid.bounds.d,
    };

    const { panelWidth, panelHeight, meetsTop, meetsBottom, meetsLeft, meetsRight } =
      getDividerDimensions(axis, bounds, containerDims, activeFaces);

    const edgeStatuses = getDividerEdgeStatuses(meetsTop, meetsBottom, meetsLeft, meetsRight);

    const selectedEdgeStatus = selectedEdge
      ? edgeStatuses.find((e) => e.position === selectedEdge)?.status ?? 'locked'
      : null;

    // Calculate position bounds based on parent void
    const parentDimStart = axis === 'x' ? bounds.x : axis === 'y' ? bounds.y : bounds.z;
    const parentDimEnd = axis === 'x' ? bounds.x + bounds.w :
                         axis === 'y' ? bounds.y + bounds.h :
                         bounds.z + bounds.d;
    const mt = activeConfig.materialThickness;
    const minPosition = parentDimStart + mt;
    const maxPosition = parentDimEnd - mt;

    const handlePositionChange = (newPosition: number) => {
      setDividerPosition(subdivision.id, newPosition);
    };

    const titleSuffix = isSubAssembly ? ' (Nested)' : '';

    return (
      <Panel title="Panel Properties">
        <div className="panel-properties">
          <div className="property-header">
            <span className="property-icon">▤</span>
            <span className="property-title">Divider Panel{titleSuffix}</span>
          </div>

          <div className="property-group">
            <div className="property-row">
              <span className="property-label">Type:</span>
              <span className="property-value">{axisNames[axis]} Divider</span>
            </div>
            <div className="property-row">
              <span className="property-label">Dimensions:</span>
              <span className="property-value">
                {panelWidth.toFixed(1)} x {panelHeight.toFixed(1)} mm
              </span>
            </div>
            <div className="property-row">
              <span className="property-label">Thickness:</span>
              <span className="property-value">{activeConfig.materialThickness} mm</span>
            </div>
          </div>

          {!isSubAssembly && (
            <div className="property-section">
              <h4>{axisLabels[axis]}</h4>
              <div className="position-controls">
                <div className="position-slider-row">
                  <input
                    type="range"
                    className="position-slider"
                    min={minPosition}
                    max={maxPosition}
                    step={0.5}
                    value={position}
                    onChange={(e) => handlePositionChange(parseFloat(e.target.value))}
                  />
                </div>
                <div className="position-input-row">
                  <button
                    className="position-btn"
                    onClick={() => handlePositionChange(position - 1)}
                    disabled={position <= minPosition}
                  >
                    -
                  </button>
                  <NumberInput
                    className="position-input"
                    value={position}
                    onChange={handlePositionChange}
                    min={minPosition}
                    max={maxPosition}
                    step={0.5}
                  />
                  <button
                    className="position-btn"
                    onClick={() => handlePositionChange(position + 1)}
                    disabled={position >= maxPosition}
                  >
                    +
                  </button>
                  <span className="position-unit">mm</span>
                </div>
              </div>
              <div className="position-mode-toggle">
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={subdivision.positionMode === 'percentage'}
                    onChange={(e) => setDividerPositionMode(
                      subdivision.id,
                      e.target.checked ? 'percentage' : 'absolute'
                    )}
                  />
                  <span className="toggle-text">Scale with box dimensions</span>
                </label>
                {subdivision.positionMode === 'percentage' && subdivision.percentage !== undefined && (
                  <span className="percentage-display">
                    ({(subdivision.percentage * 100).toFixed(1)}%)
                  </span>
                )}
              </div>
            </div>
          )}

          {isSubAssembly && (
            <div className="property-group">
              <div className="property-row">
                <span className="property-label">Position:</span>
                <span className="property-value">{position.toFixed(1)} mm</span>
              </div>
            </div>
          )}

          <div className="property-section">
            <h4>Edge Status</h4>
            <EdgePreview
              width={panelWidth}
              height={panelHeight}
              edgeStatuses={edgeStatuses}
              selectedEdge={selectedEdge}
              onEdgeClick={setSelectedEdge}
              edgeExtensions={edgeExtensions}
            />
            <EdgeLegend />
          </div>

          {selectedEdge && selectedEdgeStatus && (
            <EdgeControls
              edge={selectedEdge}
              value={edgeExtensions[selectedEdge]}
              status={selectedEdgeStatus}
              onChange={handleEdgeExtensionChange}
            />
          )}

          <div className="panel-actions">
            <button
              className="edit-2d-btn"
              onClick={() => enterSketchView(selectedPanel.id)}
            >
              Edit in 2D
            </button>
          </div>
        </div>
      </Panel>
    );
  }

  return null;
};
