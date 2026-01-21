import React, { useMemo } from 'react';
import { useBoxStore } from '../store/useBoxStore';
import { Panel } from './UI/Panel';
import { FaceId, PanelPath, PathPoint } from '../types';

const faceOrder: FaceId[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];

// Convert PathPoints to SVG path data string
// The points are in panel-local coordinates (centered at 0,0)
// offsetX/offsetY shift the center to the SVG coordinate space
const pathPointsToSVGPath = (
  points: PathPoint[],
  offsetX: number,
  offsetY: number
): string => {
  if (points.length === 0) return '';

  // Note: SVG Y-axis is flipped (positive Y is down), so we negate Y
  let path = `M ${(points[0].x + offsetX).toFixed(3)} ${(-points[0].y + offsetY).toFixed(3)} `;
  for (let i = 1; i < points.length; i++) {
    path += `L ${(points[i].x + offsetX).toFixed(3)} ${(-points[i].y + offsetY).toFixed(3)} `;
  }
  path += 'Z';
  return path;
};

export const FacePreview: React.FC = () => {
  const { faces, panelCollection } = useBoxStore();

  // Get panels from stored collection
  const panels = panelCollection?.panels ?? [];
  const facePanels = panels.filter(p => p.source.type === 'face');
  const dividerPanels = panels.filter(p => p.source.type === 'divider');

  return (
    <Panel title="2D Face Preview">
      <div className="face-preview-section">
        <h4>Outer Faces</h4>
        <div className="face-preview-grid">
          {faceOrder.map((faceId) => {
            const face = faces.find((f) => f.id === faceId);
            const isSolid = face?.solid ?? true;
            const panel = facePanels.find(
              p => p.source.type === 'face' && p.source.faceId === faceId
            );
            return (
              <FacePreviewItem
                key={faceId}
                faceId={faceId}
                panel={panel}
                isSolid={isSolid}
              />
            );
          })}
        </div>
      </div>

      {dividerPanels.length > 0 && (
        <div className="face-preview-section">
          <h4>Subdivision Panels ({dividerPanels.length})</h4>
          <div className="face-preview-grid">
            {dividerPanels.map((panel) => (
              <PanelPreviewItem
                key={panel.id}
                panel={panel}
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
  panel: PanelPath | undefined;
  isSolid: boolean;
}

const FacePreviewItem: React.FC<FacePreviewItemProps> = ({ faceId, panel, isSolid }) => {
  const svgContent = useMemo(() => {
    if (!isSolid || !panel) return null;

    const padding = panel.thickness * 4;
    const svgWidth = panel.width + padding * 2;
    const svgHeight = panel.height + padding * 2;

    // Offset to center the panel in the SVG
    const offsetX = svgWidth / 2;
    const offsetY = svgHeight / 2;

    const pathData = pathPointsToSVGPath(panel.outline.points, offsetX, offsetY);
    const holePaths = panel.holes.map(hole =>
      pathPointsToSVGPath(hole.path.points, offsetX, offsetY)
    );

    return {
      viewBox: `0 0 ${svgWidth} ${svgHeight}`,
      pathData,
      holePaths,
      dims: { width: panel.width, height: panel.height },
    };
  }, [panel, isSolid]);

  if (!isSolid) {
    return (
      <div className="face-preview-item open">
        <div className="face-preview-header">{faceId.toUpperCase()}</div>
        <div className="face-preview-empty">Open face</div>
      </div>
    );
  }

  if (!svgContent) {
    return (
      <div className="face-preview-item">
        <div className="face-preview-header">{faceId.toUpperCase()}</div>
        <div className="face-preview-empty">Loading...</div>
      </div>
    );
  }

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
        {svgContent.holePaths.map((holePath, idx) => (
          <path
            key={idx}
            d={holePath}
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

interface PanelPreviewItemProps {
  panel: PanelPath;
}

const PanelPreviewItem: React.FC<PanelPreviewItemProps> = ({ panel }) => {
  const svgContent = useMemo(() => {
    const padding = panel.thickness * 4;
    const svgWidth = panel.width + padding * 2;
    const svgHeight = panel.height + padding * 2;

    // Offset to center the panel in the SVG
    const offsetX = svgWidth / 2;
    const offsetY = svgHeight / 2;

    const pathData = pathPointsToSVGPath(panel.outline.points, offsetX, offsetY);
    const holePaths = panel.holes.map(hole =>
      pathPointsToSVGPath(hole.path.points, offsetX, offsetY)
    );

    return {
      viewBox: `0 0 ${svgWidth} ${svgHeight}`,
      pathData,
      holePaths,
    };
  }, [panel]);

  // Create label from panel source info
  const label = panel.source.type === 'divider' && panel.source.axis
    ? `${panel.source.axis.toUpperCase()}@${panel.label?.split('@')[1]?.split('mm')[0] ?? '?'}mm`
    : panel.label || panel.id;

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
        {svgContent.holePaths.map((holePath, idx) => (
          <path
            key={idx}
            d={holePath}
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
