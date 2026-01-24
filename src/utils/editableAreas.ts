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
  const halfW = panel.width / 2;
  const halfH = panel.height / 2;

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

  // Calculate the main editable area
  const mainArea: EditableArea = {
    x: -halfW + leftMargin,
    y: -halfH + bottomMargin,
    width: panel.width - leftMargin - rightMargin,
    height: panel.height - topMargin - bottomMargin,
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
              width: panel.width - leftMargin - rightMargin,
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
              width: panel.width - leftMargin - rightMargin,
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
              height: panel.height - topMargin - bottomMargin,
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
              height: panel.height - topMargin - bottomMargin,
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
