import React from 'react';
import { useBoxStore, getAllSubdivisions } from '../store/useBoxStore';
import { Panel } from './UI/Panel';

export const PanelProperties: React.FC = () => {
  const { selectionMode, selectedPanelId, faces, config, rootVoid, toggleFace } = useBoxStore();

  if (selectionMode !== 'panel' || !selectedPanelId) {
    return (
      <Panel title="Panel Properties">
        <p className="hint">
          {selectionMode === 'panel'
            ? 'Click on a panel in the 3D view to select it'
            : 'Switch to Panel selection mode to edit panels'}
        </p>
      </Panel>
    );
  }

  // Parse the panel ID to determine type
  const isFacePanel = selectedPanelId.startsWith('face-');
  const isSubdivisionPanel = selectedPanelId.startsWith('sub-');

  if (isFacePanel) {
    const faceId = selectedPanelId.replace('face-', '');
    const face = faces.find(f => f.id === faceId);

    if (!face) return null;

    // Calculate face dimensions
    let panelWidth = 0;
    let panelHeight = 0;

    switch (faceId) {
      case 'front':
      case 'back':
        panelWidth = config.width;
        panelHeight = config.height;
        break;
      case 'left':
      case 'right':
        panelWidth = config.depth;
        panelHeight = config.height;
        break;
      case 'top':
      case 'bottom':
        panelWidth = config.width;
        panelHeight = config.depth;
        break;
    }

    const faceNames: Record<string, string> = {
      front: 'Front',
      back: 'Back',
      left: 'Left',
      right: 'Right',
      top: 'Top',
      bottom: 'Bottom',
    };

    return (
      <Panel title="Panel Properties">
        <div className="panel-properties">
          <div className="property-header">
            <span className="property-icon">▬</span>
            <span className="property-title">{faceNames[faceId]} Face</span>
          </div>

          <div className="property-group">
            <div className="property-row">
              <span className="property-label">Type:</span>
              <span className="property-value">Outer Face</span>
            </div>
            <div className="property-row">
              <span className="property-label">Dimensions:</span>
              <span className="property-value">{panelWidth} × {panelHeight} mm</span>
            </div>
            <div className="property-row">
              <span className="property-label">Thickness:</span>
              <span className="property-value">{config.materialThickness} mm</span>
            </div>
          </div>

          <div className="property-group">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={face.solid}
                onChange={() => toggleFace(face.id)}
              />
              <span>Solid (include in cut)</span>
            </label>
          </div>
        </div>
      </Panel>
    );
  }

  if (isSubdivisionPanel) {
    const subId = selectedPanelId.replace('sub-', '');
    const subdivisions = getAllSubdivisions(rootVoid);
    const subdivision = subdivisions.find(s => s.id === subId);

    if (!subdivision) return null;

    const { axis, position, bounds } = subdivision;

    // Calculate panel dimensions based on axis
    let panelWidth = 0;
    let panelHeight = 0;

    switch (axis) {
      case 'x':
        panelWidth = bounds.d;
        panelHeight = bounds.h;
        break;
      case 'y':
        panelWidth = bounds.w;
        panelHeight = bounds.d;
        break;
      case 'z':
        panelWidth = bounds.w;
        panelHeight = bounds.h;
        break;
    }

    const axisNames: Record<string, string> = {
      x: 'Vertical (X)',
      y: 'Horizontal (Y)',
      z: 'Vertical (Z)',
    };

    return (
      <Panel title="Panel Properties">
        <div className="panel-properties">
          <div className="property-header">
            <span className="property-icon">▤</span>
            <span className="property-title">Subdivision Panel</span>
          </div>

          <div className="property-group">
            <div className="property-row">
              <span className="property-label">Type:</span>
              <span className="property-value">{axisNames[axis]} Divider</span>
            </div>
            <div className="property-row">
              <span className="property-label">Position:</span>
              <span className="property-value">{position.toFixed(1)} mm</span>
            </div>
            <div className="property-row">
              <span className="property-label">Dimensions:</span>
              <span className="property-value">{panelWidth.toFixed(1)} × {panelHeight.toFixed(1)} mm</span>
            </div>
            <div className="property-row">
              <span className="property-label">Thickness:</span>
              <span className="property-value">{config.materialThickness} mm</span>
            </div>
          </div>
        </div>
      </Panel>
    );
  }

  return null;
};
