/**
 * Calculate editable areas (safe zones for cutouts) for a panel
 *
 * Editable areas are regions where:
 * - Cutouts can be added without affecting finger joints
 * - The user can safely modify the panel shape
 */

import { PanelPath, BoxConfig, FaceConfig, AssemblyConfig } from '../types';

export interface EditableArea {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

type EdgePosition = 'top' | 'bottom' | 'left' | 'right';

interface EdgeInfo {
  position: EdgePosition;
  hasJoints: boolean;
  margin: number; // Distance from edge to editable area
}

/**
 * Determine if a face edge has finger joints (is connected to an adjacent solid face)
 */
const faceEdgeHasJoints = (
  faceId: string,
  edgePosition: EdgePosition,
  faces: FaceConfig[],
  assembly: AssemblyConfig
): boolean => {
  // Mapping of face ID to its neighbor on each edge
  const neighborMap: Record<string, Record<EdgePosition, string>> = {
    front: { top: 'top', bottom: 'bottom', left: 'left', right: 'right' },
    back: { top: 'top', bottom: 'bottom', left: 'right', right: 'left' },
    left: { top: 'top', bottom: 'bottom', left: 'back', right: 'front' },
    right: { top: 'top', bottom: 'bottom', left: 'front', right: 'back' },
    top: { top: 'back', bottom: 'front', left: 'left', right: 'right' },
    bottom: { top: 'front', bottom: 'back', left: 'left', right: 'right' },
  };

  const neighbors = neighborMap[faceId];
  if (!neighbors) return false;

  const neighborId = neighbors[edgePosition];
  const neighborFace = faces.find(f => f.id === neighborId);

  // If neighbor face is solid, this edge has joints
  return neighborFace?.solid ?? false;
};

/**
 * Get edge information for a face panel
 */
const getFaceEdgeInfo = (
  faceId: string,
  faces: FaceConfig[],
  assembly: AssemblyConfig,
  materialThickness: number
): EdgeInfo[] => {
  const edges: EdgePosition[] = ['top', 'bottom', 'left', 'right'];

  return edges.map(position => {
    const hasJoints = faceEdgeHasJoints(faceId, position, faces, assembly);
    return {
      position,
      hasJoints,
      // Margin from edge: materialThickness if has joints, 0 if open
      margin: hasJoints ? materialThickness : 0,
    };
  });
};

/**
 * Get edge information for a divider panel
 * Dividers typically have joints on all edges
 */
const getDividerEdgeInfo = (
  materialThickness: number
): EdgeInfo[] => {
  const edges: EdgePosition[] = ['top', 'bottom', 'left', 'right'];

  return edges.map(position => ({
    position,
    hasJoints: true, // Dividers connect to faces on all sides
    margin: materialThickness,
  }));
};

/**
 * Calculate the main editable area for a panel
 * This is the central region away from all joints
 */
export const getEditableAreas = (
  panel: PanelPath,
  faces: FaceConfig[],
  config: BoxConfig
): EditableArea[] => {
  const { materialThickness } = config;

  // Calculate original dimensions (without extensions)
  const ext = panel.edgeExtensions ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const originalWidth = panel.width - (ext.left ?? 0) - (ext.right ?? 0);
  const originalHeight = panel.height - (ext.top ?? 0) - (ext.bottom ?? 0);

  // Use original dimensions for positioning (panel outline uses original dims + extensions)
  const halfW = originalWidth / 2;
  const halfH = originalHeight / 2;

  let edgeInfos: EdgeInfo[];

  if (panel.source.type === 'face' && panel.source.faceId) {
    edgeInfos = getFaceEdgeInfo(
      panel.source.faceId,
      faces,
      config.assembly,
      materialThickness
    );
  } else if (panel.source.type === 'divider') {
    edgeInfos = getDividerEdgeInfo(materialThickness);
  } else {
    // Unknown panel type - use conservative margins
    edgeInfos = ['top', 'bottom', 'left', 'right'].map(position => ({
      position: position as EdgePosition,
      hasJoints: true,
      margin: materialThickness,
    }));
  }

  // Get margins for each edge
  const topMargin = edgeInfos.find(e => e.position === 'top')?.margin ?? materialThickness;
  const bottomMargin = edgeInfos.find(e => e.position === 'bottom')?.margin ?? materialThickness;
  const leftMargin = edgeInfos.find(e => e.position === 'left')?.margin ?? materialThickness;
  const rightMargin = edgeInfos.find(e => e.position === 'right')?.margin ?? materialThickness;

  // Calculate the main editable area (based on original dimensions)
  const mainArea: EditableArea = {
    x: -halfW + leftMargin,
    y: -halfH + bottomMargin,
    width: originalWidth - leftMargin - rightMargin,
    height: originalHeight - topMargin - bottomMargin,
    label: 'Safe zone',
  };

  // Only return the area if it has positive dimensions
  const areas: EditableArea[] = [];

  if (mainArea.width > 0 && mainArea.height > 0) {
    areas.push(mainArea);
  }

  // For edges without joints (open faces), we can have additional editable strips
  // extending all the way to those edges
  for (const edgeInfo of edgeInfos) {
    if (!edgeInfo.hasJoints) {
      // This edge is open - create an extended editable strip
      let stripArea: EditableArea | null = null;

      switch (edgeInfo.position) {
        case 'top':
          if (topMargin === 0) {
            stripArea = {
              x: -halfW + leftMargin,
              y: halfH - materialThickness, // Top strip
              width: originalWidth - leftMargin - rightMargin,
              height: materialThickness,
              label: 'Top edge (open)',
            };
          }
          break;
        case 'bottom':
          if (bottomMargin === 0) {
            stripArea = {
              x: -halfW + leftMargin,
              y: -halfH,
              width: originalWidth - leftMargin - rightMargin,
              height: materialThickness,
              label: 'Bottom edge (open)',
            };
          }
          break;
        case 'left':
          if (leftMargin === 0) {
            stripArea = {
              x: -halfW,
              y: -halfH + bottomMargin,
              width: materialThickness,
              height: originalHeight - topMargin - bottomMargin,
              label: 'Left edge (open)',
            };
          }
          break;
        case 'right':
          if (rightMargin === 0) {
            stripArea = {
              x: halfW - materialThickness,
              y: -halfH + bottomMargin,
              width: materialThickness,
              height: originalHeight - topMargin - bottomMargin,
              label: 'Right edge (open)',
            };
          }
          break;
      }

      // For open edges, actually extend the main area to include them
      // Instead of adding separate strips, we've already handled this above
      // by setting margin to 0
    }
  }

  // Add editable areas for extended edges
  // The extended portion is outside the original joint area and is safe to edit
  // Extensions have NO joints on their perpendicular edges, so we use full width
  // The actual bounds are computed from the panel outline to account for notching
  const extTop = ext.top ?? 0;
  const extBottom = ext.bottom ?? 0;
  const extLeft = ext.left ?? 0;
  const extRight = ext.right ?? 0;

  // Helper to get actual bounds of an extension region from the panel outline
  const getExtensionBounds = (
    direction: 'top' | 'bottom' | 'left' | 'right'
  ): { minX: number; maxX: number; minY: number; maxY: number } | null => {
    if (!panel.outline?.points?.length) return null;

    // Filter points in the extension region
    let extPoints: { x: number; y: number }[];
    switch (direction) {
      case 'top':
        extPoints = panel.outline.points.filter(p => p.y > halfH + 0.01);
        break;
      case 'bottom':
        extPoints = panel.outline.points.filter(p => p.y < -halfH - 0.01);
        break;
      case 'left':
        extPoints = panel.outline.points.filter(p => p.x < -halfW - 0.01);
        break;
      case 'right':
        extPoints = panel.outline.points.filter(p => p.x > halfW + 0.01);
        break;
    }

    if (extPoints.length === 0) return null;

    return {
      minX: Math.min(...extPoints.map(p => p.x)),
      maxX: Math.max(...extPoints.map(p => p.x)),
      minY: Math.min(...extPoints.map(p => p.y)),
      maxY: Math.max(...extPoints.map(p => p.y)),
    };
  };

  // Top extension area - use actual bounds from outline (accounts for notching)
  // Where the extension is notched, there's a joint with the adjacent panel's extension,
  // so we need to add a margin at those notched edges.
  if (extTop > 0) {
    const bounds = getExtensionBounds('top');
    if (bounds) {
      // Check if left/right edges are notched (not at full width)
      const isLeftNotched = bounds.minX > -halfW + 0.01;
      const isRightNotched = bounds.maxX < halfW - 0.01;
      // Apply margin where notched (joint with adjacent extension)
      const leftMarginExt = isLeftNotched ? materialThickness : 0;
      const rightMarginExt = isRightNotched ? materialThickness : 0;

      const areaX = bounds.minX + leftMarginExt;
      const areaWidth = (bounds.maxX - rightMarginExt) - areaX;
      if (areaWidth > 0) {
        areas.push({
          x: areaX,
          y: halfH, // Start from original top edge
          width: areaWidth,
          height: bounds.maxY - halfH,
          label: 'Extended top',
        });
      }
    }
  }

  // Bottom extension area
  if (extBottom > 0) {
    const bounds = getExtensionBounds('bottom');
    if (bounds) {
      const isLeftNotched = bounds.minX > -halfW + 0.01;
      const isRightNotched = bounds.maxX < halfW - 0.01;
      const leftMarginExt = isLeftNotched ? materialThickness : 0;
      const rightMarginExt = isRightNotched ? materialThickness : 0;

      const areaX = bounds.minX + leftMarginExt;
      const areaWidth = (bounds.maxX - rightMarginExt) - areaX;
      if (areaWidth > 0) {
        areas.push({
          x: areaX,
          y: bounds.minY, // Start from extended bottom
          width: areaWidth,
          height: -halfH - bounds.minY,
          label: 'Extended bottom',
        });
      }
    }
  }

  // Left extension area
  if (extLeft > 0) {
    const bounds = getExtensionBounds('left');
    if (bounds) {
      const isTopNotched = bounds.maxY < halfH - 0.01;
      const isBottomNotched = bounds.minY > -halfH + 0.01;
      const topMarginExt = isTopNotched ? materialThickness : 0;
      const bottomMarginExt = isBottomNotched ? materialThickness : 0;

      const areaY = bounds.minY + bottomMarginExt;
      const areaHeight = (bounds.maxY - topMarginExt) - areaY;
      if (areaHeight > 0) {
        areas.push({
          x: bounds.minX, // Start from extended left
          y: areaY,
          width: -halfW - bounds.minX,
          height: areaHeight,
          label: 'Extended left',
        });
      }
    }
  }

  // Right extension area
  if (extRight > 0) {
    const bounds = getExtensionBounds('right');
    if (bounds) {
      const isTopNotched = bounds.maxY < halfH - 0.01;
      const isBottomNotched = bounds.minY > -halfH + 0.01;
      const topMarginExt = isTopNotched ? materialThickness : 0;
      const bottomMarginExt = isBottomNotched ? materialThickness : 0;

      const areaY = bounds.minY + bottomMarginExt;
      const areaHeight = (bounds.maxY - topMarginExt) - areaY;
      if (areaHeight > 0) {
        areas.push({
          x: halfW, // Start from original right edge
          y: areaY,
          width: bounds.maxX - halfW,
          height: areaHeight,
          label: 'Extended right',
        });
      }
    }
  }

  return areas;
};

/**
 * Check if a point is within any editable area
 */
export const isPointInEditableArea = (
  x: number,
  y: number,
  areas: EditableArea[]
): boolean => {
  for (const area of areas) {
    if (
      x >= area.x &&
      x <= area.x + area.width &&
      y >= area.y &&
      y <= area.y + area.height
    ) {
      return true;
    }
  }
  return false;
};

/**
 * Check if a rectangle is fully within any editable area
 */
export const isRectInEditableArea = (
  rectX: number,
  rectY: number,
  rectWidth: number,
  rectHeight: number,
  areas: EditableArea[]
): boolean => {
  // Check all four corners
  const corners = [
    { x: rectX, y: rectY },
    { x: rectX + rectWidth, y: rectY },
    { x: rectX, y: rectY + rectHeight },
    { x: rectX + rectWidth, y: rectY + rectHeight },
  ];

  // All corners must be in some editable area (not necessarily the same one)
  for (const corner of corners) {
    if (!isPointInEditableArea(corner.x, corner.y, areas)) {
      return false;
    }
  }

  return true;
};
