import React, { useMemo } from 'react';
import { useBoxStore } from '../store/useBoxStore';
import { Panel } from './UI/Panel';
import { FaceId, SubdivisionPanel } from '../types';
import {
  generateFaceSVGPath,
  generateFaceSlotPaths,
  getFaceDimensions,
  getSubdivisionPanels,
  generateSubdivisionPanelPath,
  generateSlotPaths,
} from '../utils/svgExport';

const faceOrder: FaceId[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];

export const FacePreview: React.FC = () => {
  const { faces, rootVoid, config } = useBoxStore();

  const subdivisionPanels = useMemo(
    () => getSubdivisionPanels(rootVoid, faces, config),
    [rootVoid, faces, config]
  );

  return (
    <Panel title="2D Face Preview">
      <div className="face-preview-section">
        <h4>Outer Faces</h4>
        <div className="face-preview-grid">
          {faceOrder.map((faceId) => (
            <FacePreviewItem
              key={faceId}
              faceId={faceId}
              faces={faces}
              rootVoid={rootVoid}
              config={config}
            />
          ))}
        </div>
      </div>

      {subdivisionPanels.length > 0 && (
        <div className="face-preview-section">
          <h4>Subdivision Panels ({subdivisionPanels.length})</h4>
          <div className="face-preview-grid">
            {subdivisionPanels.map((panel) => (
              <SubdivisionPanelPreview
                key={panel.id}
                panel={panel}
                config={config}
              />
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
};

interface FacePreviewItemProps {
  faceId: FaceId;
  faces: { id: FaceId; solid: boolean }[];
  rootVoid: ReturnType<typeof useBoxStore>['rootVoid'];
  config: ReturnType<typeof useBoxStore>['config'];
}

const FacePreviewItem: React.FC<FacePreviewItemProps> = ({ faceId, faces, rootVoid, config }) => {
  const face = faces.find((f) => f.id === faceId);
  const isSolid = face?.solid ?? true;

  const svgContent = useMemo(() => {
    if (!isSolid) return null;

    const dims = getFaceDimensions(faceId, config);
    const padding = config.materialThickness * 4;
    const svgWidth = dims.width + padding * 2;
    const svgHeight = dims.height + padding * 2;

    const pathData = generateFaceSVGPath(faceId, faces, config, 0);
    const slotPaths = generateFaceSlotPaths(faceId, rootVoid, config);

    return {
      viewBox: `0 0 ${svgWidth} ${svgHeight}`,
      pathData,
      slotPaths,
      dims,
    };
  }, [faceId, faces, rootVoid, config, isSolid]);

  if (!isSolid) {
    return (
      <div className="face-preview-item open">
        <div className="face-preview-header">{faceId.toUpperCase()}</div>
        <div className="face-preview-empty">Open face</div>
      </div>
    );
  }

  if (!svgContent) return null;

  return (
    <div className="face-preview-item">
      <div className="face-preview-header">{faceId.toUpperCase()}</div>
      <svg
        viewBox={svgContent.viewBox}
        className="face-preview-svg"
        preserveAspectRatio="xMidYMid meet"
      >
        <path
          d={svgContent.pathData}
          fill="none"
          stroke="#333"
          strokeWidth="0.5"
        />
        {svgContent.slotPaths.map((slotPath, idx) => (
          <path
            key={idx}
            d={slotPath}
            fill="none"
            stroke="#e74c3c"
            strokeWidth="0.3"
          />
        ))}
      </svg>
      <div className="face-preview-dimensions">
        {svgContent.dims.width}mm x {svgContent.dims.height}mm
      </div>
    </div>
  );
};

interface SubdivisionPanelPreviewProps {
  panel: SubdivisionPanel;
  config: ReturnType<typeof useBoxStore>['config'];
}

const SubdivisionPanelPreview: React.FC<SubdivisionPanelPreviewProps> = ({ panel, config }) => {
  const svgContent = useMemo(() => {
    const padding = config.materialThickness * 4;
    const svgWidth = panel.width + padding * 2;
    const svgHeight = panel.height + padding * 2;

    const pathData = generateSubdivisionPanelPath(panel, config, 0);
    const slotPaths = generateSlotPaths(panel, config);

    return {
      viewBox: `0 0 ${svgWidth} ${svgHeight}`,
      pathData,
      slotPaths,
    };
  }, [panel, config]);

  const label = `${panel.axis.toUpperCase()}@${panel.position.toFixed(0)}mm`;

  return (
    <div className="face-preview-item subdivision">
      <div className="face-preview-header">{label}</div>
      <svg
        viewBox={svgContent.viewBox}
        className="face-preview-svg"
        preserveAspectRatio="xMidYMid meet"
      >
        <path
          d={svgContent.pathData}
          fill="none"
          stroke="#f39c12"
          strokeWidth="0.5"
        />
        {svgContent.slotPaths.map((slotPath, idx) => (
          <path
            key={idx}
            d={slotPath}
            fill="none"
            stroke="#e74c3c"
            strokeWidth="0.3"
          />
        ))}
      </svg>
      <div className="face-preview-dimensions">
        {panel.width.toFixed(1)}mm x {panel.height.toFixed(1)}mm
      </div>
    </div>
  );
};
