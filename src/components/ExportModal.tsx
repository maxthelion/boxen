import React, { useState } from 'react';
import { useBoxStore } from '../store/useBoxStore';
import { Modal } from './UI/Modal';
import { FaceId, PanelPath } from '../types';
import {
  generatePanelPathSVG,
  generateAllPanelPathsSVG,
  downloadSVG,
} from '../utils/svgExport';

const faceOrder: FaceId[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose }) => {
  const { faces, panelCollection } = useBoxStore();
  const [kerf, setKerf] = useState(0.1);

  // Get panels from stored collection
  const panels = panelCollection?.panels ?? [];
  const facePanels = panels.filter(p => p.source.type === 'face');
  const dividerPanels = panels.filter(p => p.source.type === 'divider');

  const totalPieces = panels.filter(p => p.visible).length;

  const handleExportPanel = (panel: PanelPath) => {
    const svg = generatePanelPathSVG(panel, kerf);
    if (svg) {
      const filename = panel.source.type === 'face'
        ? `boxen-${panel.source.faceId}.svg`
        : `boxen-${panel.id}.svg`;
      downloadSVG(svg, filename);
    }
  };

  const handleExportAll = () => {
    if (!panelCollection) return;
    const svg = generateAllPanelPathsSVG(panelCollection, kerf);
    downloadSVG(svg, 'boxen-all-pieces.svg');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export SVG">
      <div className="export-modal-content">
        <div className="export-controls">
          <label className="kerf-input">
            <span>Kerf compensation (mm):</span>
            <input
              type="number"
              value={kerf}
              onChange={(e) => setKerf(Math.max(0, parseFloat(e.target.value) || 0))}
              min={0}
              step={0.01}
            />
          </label>

          <div className="export-section">
            <h4>Outer Faces ({facePanels.length})</h4>
            <div className="export-buttons">
              {faceOrder.map((faceId) => {
                const face = faces.find((f) => f.id === faceId);
                const isSolid = face?.solid ?? true;
                const facePanel = facePanels.find(
                  p => p.source.type === 'face' && p.source.faceId === faceId
                );
                return (
                  <button
                    key={faceId}
                    onClick={() => facePanel && handleExportPanel(facePanel)}
                    disabled={!isSolid || !facePanel}
                    title={isSolid ? `Export ${faceId} face` : `${faceId} face is open`}
                  >
                    {faceId.charAt(0).toUpperCase() + faceId.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>

          {dividerPanels.length > 0 && (
            <div className="export-section">
              <h4>Subdivision Panels ({dividerPanels.length})</h4>
              <div className="export-buttons">
                {dividerPanels.map((panel) => {
                  const label = panel.source.type === 'divider'
                    ? `${panel.source.axis?.toUpperCase()}@${panel.label?.split('@')[1]?.split('mm')[0] ?? '?'}`
                    : panel.id;
                  return (
                    <button
                      key={panel.id}
                      onClick={() => handleExportPanel(panel)}
                      title={`Export ${panel.label || panel.id}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="export-section export-all-section">
            <button
              className="export-all-btn"
              onClick={handleExportAll}
              disabled={totalPieces === 0}
            >
              Download All Pieces ({totalPieces})
            </button>
          </div>

          <div className="export-info">
            <p>SVG files include:</p>
            <ul>
              <li>Finger joints on outer face edges</li>
              <li>Slots for subdivision panel tabs</li>
              <li>Interlocking slots for crossing dividers</li>
              <li>Dimensions in mm</li>
            </ul>
          </div>
        </div>
      </div>
    </Modal>
  );
};
