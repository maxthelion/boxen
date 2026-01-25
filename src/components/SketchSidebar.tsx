import React from 'react';
import { useBoxStore } from '../store/useBoxStore';
import { getFaceEdgeStatuses, getDividerEdgeStatuses, EdgeStatusInfo } from '../utils/panelGenerator';
import { getAllSubdivisions } from '../store/useBoxStore';
import { Face, FaceId } from '../types';

// Calculate which faces a divider meets (has finger joints with)
const getDividerMeetsFaces = (
  axis: 'x' | 'y' | 'z',
  bounds: { x: number; y: number; z: number; w: number; h: number; d: number },
  containerDims: { width: number; height: number; depth: number },
  faces: Face[]
): { meetsTop: boolean; meetsBottom: boolean; meetsLeft: boolean; meetsRight: boolean } => {
  const isFaceSolid = (faceId: FaceId) => faces.find((f) => f.id === faceId)?.solid ?? false;
  const tolerance = 0.01;

  let meetsTop = false;
  let meetsBottom = false;
  let meetsLeft = false;
  let meetsRight = false;

  switch (axis) {
    case 'x':
      meetsTop = isFaceSolid('top') && bounds.y + bounds.h >= containerDims.height - tolerance;
      meetsBottom = isFaceSolid('bottom') && bounds.y <= tolerance;
      meetsLeft = isFaceSolid('back') && bounds.z <= tolerance;
      meetsRight = isFaceSolid('front') && bounds.z + bounds.d >= containerDims.depth - tolerance;
      break;
    case 'y':
      meetsTop = isFaceSolid('back') && bounds.z <= tolerance;
      meetsBottom = isFaceSolid('front') && bounds.z + bounds.d >= containerDims.depth - tolerance;
      meetsLeft = isFaceSolid('left') && bounds.x <= tolerance;
      meetsRight = isFaceSolid('right') && bounds.x + bounds.w >= containerDims.width - tolerance;
      break;
    case 'z':
      meetsTop = isFaceSolid('top') && bounds.y + bounds.h >= containerDims.height - tolerance;
      meetsBottom = isFaceSolid('bottom') && bounds.y <= tolerance;
      meetsLeft = isFaceSolid('left') && bounds.x <= tolerance;
      meetsRight = isFaceSolid('right') && bounds.x + bounds.w >= containerDims.width - tolerance;
      break;
  }

  return { meetsTop, meetsBottom, meetsLeft, meetsRight };
};

export const SketchSidebar: React.FC = () => {
  const {
    sketchPanelId,
    panelCollection,
    config,
    faces,
    rootVoid,
    activeTool,
  } = useBoxStore();

  // Get the panel being edited
  const panel = React.useMemo(() => {
    if (!panelCollection || !sketchPanelId) return null;
    return panelCollection.panels.find(p => p.id === sketchPanelId) ?? null;
  }, [panelCollection, sketchPanelId]);

  // Get edge statuses for this panel
  const edgeStatuses = React.useMemo((): EdgeStatusInfo[] => {
    if (!panel) return [];

    if (panel.source.type === 'face' && panel.source.faceId) {
      return getFaceEdgeStatuses(panel.source.faceId, faces, config.assembly);
    }

    if (panel.source.type === 'divider' && panel.source.subdivisionId && panel.source.axis) {
      const subdivisions = getAllSubdivisions(rootVoid);
      const subdivision = subdivisions.find(s => s.id === panel.source.subdivisionId);

      if (subdivision) {
        const containerDims = {
          width: rootVoid.bounds.w,
          height: rootVoid.bounds.h,
          depth: rootVoid.bounds.d,
        };

        const { meetsTop, meetsBottom, meetsLeft, meetsRight } = getDividerMeetsFaces(
          panel.source.axis,
          subdivision.bounds,
          containerDims,
          faces
        );

        return getDividerEdgeStatuses(meetsTop, meetsBottom, meetsLeft, meetsRight);
      }

      return getDividerEdgeStatuses(true, true, true, true);
    }

    return [];
  }, [panel, faces, config.assembly, rootVoid]);

  // Count edge types
  const lockedCount = edgeStatuses.filter(e => e.status === 'locked').length;
  const editableCount = edgeStatuses.filter(e => e.status !== 'locked').length;

  if (!panel) {
    return (
      <div className="sketch-sidebar">
        <h2>2D Editor</h2>
        <p className="sketch-sidebar-empty">No panel selected</p>
      </div>
    );
  }

  return (
    <div className="sketch-sidebar">
      <h2>2D Editor</h2>

      {/* Panel Info */}
      <div className="sketch-sidebar-section">
        <h3>Panel</h3>
        <div className="sketch-sidebar-info">
          <div className="info-row">
            <span className="info-label">Name</span>
            <span className="info-value">{panel.label || panel.id}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Dimensions</span>
            <span className="info-value">{panel.width.toFixed(1)} × {panel.height.toFixed(1)} mm</span>
          </div>
          <div className="info-row">
            <span className="info-label">Thickness</span>
            <span className="info-value">{config.materialThickness} mm</span>
          </div>
        </div>
      </div>

      {/* Edge Status */}
      <div className="sketch-sidebar-section">
        <h3>Edge Status</h3>
        <div className="edge-status-grid">
          {(['top', 'bottom', 'left', 'right'] as const).map(position => {
            const status = edgeStatuses.find(e => e.position === position);
            const isLocked = status?.status === 'locked';
            const extension = panel.edgeExtensions?.[position] ?? 0;

            return (
              <div key={position} className={`edge-status-item ${isLocked ? 'locked' : 'editable'}`}>
                <span className="edge-name">{position}</span>
                <span className="edge-status-indicator"></span>
                {!isLocked && extension !== 0 && (
                  <span className="edge-extension">{extension > 0 ? '+' : ''}{extension.toFixed(1)}</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="edge-status-summary">
          {lockedCount} locked, {editableCount} editable
        </div>
      </div>

      {/* Legend */}
      <div className="sketch-sidebar-section">
        <h3>Legend</h3>
        <div className="sketch-legend-items">
          <div className="legend-row">
            <span className="legend-swatch locked"></span>
            <span>Locked edge (has joints)</span>
          </div>
          <div className="legend-row">
            <span className="legend-swatch editable"></span>
            <span>Editable edge</span>
          </div>
          <div className="legend-row">
            <span className="legend-swatch boundary"></span>
            <span>Conceptual boundary</span>
          </div>
          <div className="legend-row">
            <span className="legend-swatch safe-zone"></span>
            <span>Safe zone (for cutouts)</span>
          </div>
          {activeTool === 'chamfer' && (
            <div className="legend-row">
              <span className="legend-swatch corner"></span>
              <span>Corner (click to select)</span>
            </div>
          )}
        </div>
      </div>

      {/* Tool Help */}
      <div className="sketch-sidebar-section">
        <h3>Controls</h3>
        <div className="sketch-help-items">
          <div className="help-row">
            <span className="help-key">Scroll</span>
            <span>Zoom in/out</span>
          </div>
          <div className="help-row">
            <span className="help-key">Drag</span>
            <span>Pan view</span>
          </div>
          <div className="help-row">
            <span className="help-key">Esc</span>
            <span>Return to 3D</span>
          </div>
          {activeTool === 'inset' && (
            <div className="help-row">
              <span className="help-key">Drag edge</span>
              <span>Extend/inset</span>
            </div>
          )}
          {activeTool === 'chamfer' && (
            <div className="help-row">
              <span className="help-key">Click corner</span>
              <span>Toggle selection</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
