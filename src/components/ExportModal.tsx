import React, { useState, useMemo } from 'react';
import { useBoxStore } from '../store/useBoxStore';
import { Modal } from './UI/Modal';
import { FaceId } from '../types';
import {
  generateFaceSVG,
  generateAllFacesSVG,
  downloadSVG,
  getSubdivisionPanels,
  generateSubdivisionPanelSVG,
} from '../utils/svgExport';

const faceOrder: FaceId[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose }) => {
  const { faces, rootVoid, config } = useBoxStore();
  const [kerf, setKerf] = useState(0.1);

  const solidFaces = faces.filter((f) => f.solid);
  const subdivisionPanels = useMemo(
    () => getSubdivisionPanels(rootVoid, faces, config),
    [rootVoid, faces, config]
  );

  const totalPieces = solidFaces.length + subdivisionPanels.length;

  const handleExportFace = (faceId: FaceId) => {
    const svg = generateFaceSVG(faceId, faces, rootVoid, config, kerf);
    if (svg) {
      downloadSVG(svg, `boxen-${faceId}.svg`);
    }
  };

  const handleExportSubdivision = (panelIndex: number) => {
    const panel = subdivisionPanels[panelIndex];
    if (panel) {
      const svg = generateSubdivisionPanelSVG(panel, config, kerf);
      const label = `${panel.axis}-${panel.position.toFixed(0)}`;
      downloadSVG(svg, `boxen-div-${label}.svg`);
    }
  };

  const handleExportAll = () => {
    const svg = generateAllFacesSVG(faces, rootVoid, config, kerf);
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
            <h4>Outer Faces ({solidFaces.length})</h4>
            <div className="export-buttons">
              {faceOrder.map((faceId) => {
                const face = faces.find((f) => f.id === faceId);
                const isSolid = face?.solid ?? true;
                return (
                  <button
                    key={faceId}
                    onClick={() => handleExportFace(faceId)}
                    disabled={!isSolid}
                    title={isSolid ? `Export ${faceId} face` : `${faceId} face is open`}
                  >
                    {faceId.charAt(0).toUpperCase() + faceId.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>

          {subdivisionPanels.length > 0 && (
            <div className="export-section">
              <h4>Subdivision Panels ({subdivisionPanels.length})</h4>
              <div className="export-buttons">
                {subdivisionPanels.map((panel, idx) => (
                  <button
                    key={panel.id}
                    onClick={() => handleExportSubdivision(idx)}
                    title={`Export ${panel.axis.toUpperCase()} subdivision at ${panel.position.toFixed(0)}mm`}
                  >
                    {panel.axis.toUpperCase()}@{panel.position.toFixed(0)}
                  </button>
                ))}
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
