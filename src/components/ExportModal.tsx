import React, { useState } from 'react';
import { useEngineConfig, useEngineFaces, useEnginePanels } from '../engine';
import { Modal } from './UI/Modal';
import { NumberInput } from './UI/NumberInput';
import { FaceId, PanelPath } from '../types';
import {
  generatePanelPathSVG,
  generateAllPanelPathsSVG,
  generateMultipleBedSVGs,
  downloadSVG,
  BedExportOptions,
} from '../utils/svgExport';
import { downloadSTL } from '../utils/stlExport';

const faceOrder: FaceId[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];

// Common laser cutter bed sizes (in mm)
const PRESET_BED_SIZES = [
  { label: 'Auto (no limit)', width: 0, height: 0 },
  { label: 'K40 (300 x 200)', width: 300, height: 200 },
  { label: 'Glowforge (495 x 279)', width: 495, height: 279 },
  { label: 'Full Sheet (600 x 400)', width: 600, height: 400 },
  { label: 'Custom', width: -1, height: -1 },
];

type ExportTab = 'svg' | '3d';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose }) => {
  const config = useEngineConfig();
  const faces = useEngineFaces();
  const panelCollection = useEnginePanels();

  // Tab state
  const [activeTab, setActiveTab] = useState<ExportTab>('svg');

  // SVG export settings
  const [kerf, setKerf] = useState(0.1);
  const [bedPreset, setBedPreset] = useState(0);
  const [customBedWidth, setCustomBedWidth] = useState(300);
  const [customBedHeight, setCustomBedHeight] = useState(200);
  const [allowRotation, setAllowRotation] = useState(true);
  const [gap, setGap] = useState(5);
  const [showLabels, setShowLabels] = useState(true);
  const [separateFiles, setSeparateFiles] = useState(false);

  // 3D export settings
  const [stlBinary, setStlBinary] = useState(true);

  // Get panels from stored collection
  const panels = panelCollection?.panels ?? [];
  const facePanels = panels.filter(p => p.source.type === 'face');
  const dividerPanels = panels.filter(p => p.source.type === 'divider');
  const totalPieces = panels.filter(p => p.visible).length;
  const materialThickness = config?.materialThickness ?? 3;

  const handleExportPanel = (panel: PanelPath) => {
    const svg = generatePanelPathSVG(panel, kerf);
    if (svg) {
      const filename = panel.source.type === 'face'
        ? `boxen-${panel.source.faceId}.svg`
        : `boxen-${panel.id}.svg`;
      downloadSVG(svg, filename);
    }
  };

  // Get current bed dimensions
  const getBedDimensions = (): { width?: number; height?: number } => {
    const preset = PRESET_BED_SIZES[bedPreset];
    if (preset.width === 0) {
      return {};
    }
    if (preset.width === -1) {
      return { width: customBedWidth, height: customBedHeight };
    }
    return { width: preset.width, height: preset.height };
  };

  const handleExportAllSVG = () => {
    if (!panelCollection) return;

    const bedDims = getBedDimensions();
    const options: BedExportOptions = {
      bedWidth: bedDims.width,
      bedHeight: bedDims.height,
      gap,
      allowRotation,
      kerf,
      showLabels,
    };

    if (separateFiles && bedDims.width && bedDims.height) {
      const svgs = generateMultipleBedSVGs(panelCollection, options);
      if (svgs.length === 1) {
        downloadSVG(svgs[0], 'boxen-all-pieces.svg');
      } else {
        svgs.forEach((svg, i) => {
          downloadSVG(svg, `boxen-bed-${i + 1}.svg`);
        });
      }
    } else {
      const svg = generateAllPanelPathsSVG(panelCollection, kerf, options);
      downloadSVG(svg, 'boxen-all-pieces.svg');
    }
  };

  const handleExportSTL = () => {
    if (!panelCollection) return;
    downloadSTL(panelCollection, materialThickness, 'boxen-model.stl', stlBinary);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export">
      <div className="export-modal-content">
        {/* Tab buttons */}
        <div className="export-tabs">
          <button
            className={`export-tab ${activeTab === 'svg' ? 'active' : ''}`}
            onClick={() => setActiveTab('svg')}
          >
            SVG (Laser Cut)
          </button>
          <button
            className={`export-tab ${activeTab === '3d' ? 'active' : ''}`}
            onClick={() => setActiveTab('3d')}
          >
            3D (CAD)
          </button>
        </div>

        {/* SVG Export Tab */}
        {activeTab === 'svg' && (
          <div className="export-controls">
            <div className="export-settings">
              <div className="export-setting-row">
                <label>
                  <span>Bed Size:</span>
                  <select
                    value={bedPreset}
                    onChange={(e) => setBedPreset(parseInt(e.target.value))}
                  >
                    {PRESET_BED_SIZES.map((preset, i) => (
                      <option key={i} value={i}>{preset.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              {bedPreset === PRESET_BED_SIZES.length - 1 && (
                <div className="export-setting-row custom-bed-size">
                  <label>
                    <span>Width (mm):</span>
                    <NumberInput
                      value={customBedWidth}
                      onChange={setCustomBedWidth}
                      min={50}
                      step={10}
                    />
                  </label>
                  <label>
                    <span>Height (mm):</span>
                    <NumberInput
                      value={customBedHeight}
                      onChange={setCustomBedHeight}
                      min={50}
                      step={10}
                    />
                  </label>
                </div>
              )}

              <div className="export-setting-row">
                <label>
                  <span>Gap between pieces (mm):</span>
                  <NumberInput
                    value={gap}
                    onChange={setGap}
                    min={0}
                    step={1}
                  />
                </label>
              </div>

              <div className="export-setting-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={allowRotation}
                    onChange={(e) => setAllowRotation(e.target.checked)}
                  />
                  <span>Allow rotation for better packing</span>
                </label>
              </div>

              <div className="export-setting-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={showLabels}
                    onChange={(e) => setShowLabels(e.target.checked)}
                  />
                  <span>Show panel labels</span>
                </label>
              </div>

              {bedPreset !== 0 && (
                <div className="export-setting-row">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={separateFiles}
                      onChange={(e) => setSeparateFiles(e.target.checked)}
                    />
                    <span>Export beds as separate files</span>
                  </label>
                </div>
              )}

              <div className="export-setting-row">
                <label>
                  <span>Kerf compensation (mm):</span>
                  <NumberInput
                    value={kerf}
                    onChange={setKerf}
                    min={0}
                    step={0.01}
                  />
                </label>
              </div>
            </div>

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
                onClick={handleExportAllSVG}
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
        )}

        {/* 3D Export Tab */}
        {activeTab === '3d' && (
          <div className="export-controls">
            <div className="export-settings">
              <div className="export-setting-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={stlBinary}
                    onChange={(e) => setStlBinary(e.target.checked)}
                  />
                  <span>Binary format (smaller file size)</span>
                </label>
              </div>
            </div>

            <div className="export-section export-all-section">
              <button
                className="export-all-btn"
                onClick={handleExportSTL}
                disabled={totalPieces === 0}
              >
                Download STL ({totalPieces} pieces)
              </button>
            </div>

            <div className="export-info">
              <p>STL export includes:</p>
              <ul>
                <li>All visible panels as 3D geometry</li>
                <li>Finger joints and slots</li>
                <li>Material thickness: {materialThickness}mm</li>
              </ul>
              <p className="export-hint">
                Compatible with Autodesk Fusion, Blender, and other CAD software.
              </p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
