import { BoxConfig, Face, FaceId, Void, SubdivisionPanel, SubdivisionIntersection, Subdivision, Bounds, getFaceRole, getLidSide, getWallPriority, getLidFaceId } from '../types';
import { EdgeType, getEdgePath, Point } from './fingerJoints';
import { getAllSubdivisions } from '../store/useBoxStore';

interface FaceDimensions {
  width: number;
  height: number;
}

export const getFaceDimensions = (
  faceId: FaceId,
  config: BoxConfig
): FaceDimensions => {
  switch (faceId) {
    case 'front':
    case 'back':
      return { width: config.width, height: config.height };
    case 'left':
    case 'right':
      return { width: config.depth, height: config.height };
    case 'top':
    case 'bottom':
      return { width: config.width, height: config.depth };
  }
};

interface EdgeInfo {
  adjacentFaceId: FaceId;
  isHorizontal: boolean;
  position: 'top' | 'bottom' | 'left' | 'right';
}

const getFaceEdges = (faceId: FaceId): EdgeInfo[] => {
  switch (faceId) {
    case 'front':
      return [
        { adjacentFaceId: 'top', isHorizontal: true, position: 'top' },
        { adjacentFaceId: 'bottom', isHorizontal: true, position: 'bottom' },
        { adjacentFaceId: 'left', isHorizontal: false, position: 'left' },
        { adjacentFaceId: 'right', isHorizontal: false, position: 'right' },
      ];
    case 'back':
      return [
        { adjacentFaceId: 'top', isHorizontal: true, position: 'top' },
        { adjacentFaceId: 'bottom', isHorizontal: true, position: 'bottom' },
        { adjacentFaceId: 'right', isHorizontal: false, position: 'left' },
        { adjacentFaceId: 'left', isHorizontal: false, position: 'right' },
      ];
    case 'left':
      return [
        { adjacentFaceId: 'top', isHorizontal: true, position: 'top' },
        { adjacentFaceId: 'bottom', isHorizontal: true, position: 'bottom' },
        { adjacentFaceId: 'back', isHorizontal: false, position: 'left' },
        { adjacentFaceId: 'front', isHorizontal: false, position: 'right' },
      ];
    case 'right':
      return [
        { adjacentFaceId: 'top', isHorizontal: true, position: 'top' },
        { adjacentFaceId: 'bottom', isHorizontal: true, position: 'bottom' },
        { adjacentFaceId: 'front', isHorizontal: false, position: 'left' },
        { adjacentFaceId: 'back', isHorizontal: false, position: 'right' },
      ];
    case 'top':
      return [
        { adjacentFaceId: 'back', isHorizontal: true, position: 'top' },
        { adjacentFaceId: 'front', isHorizontal: true, position: 'bottom' },
        { adjacentFaceId: 'left', isHorizontal: false, position: 'left' },
        { adjacentFaceId: 'right', isHorizontal: false, position: 'right' },
      ];
    case 'bottom':
      return [
        { adjacentFaceId: 'front', isHorizontal: true, position: 'top' },
        { adjacentFaceId: 'back', isHorizontal: true, position: 'bottom' },
        { adjacentFaceId: 'left', isHorizontal: false, position: 'left' },
        { adjacentFaceId: 'right', isHorizontal: false, position: 'right' },
      ];
  }
};

// Dynamic tab direction logic based on assembly configuration
// Returns true if this face should have tabs extending outward at the edge meeting adjacentFaceId
// Returns null if the edge should be straight (no finger joint) - e.g., wall edges for inset lids
const shouldTabOut = (
  faceId: FaceId,
  adjacentFaceId: FaceId,
  assembly: AssemblyConfig
): boolean | null => {
  const myRole = getFaceRole(faceId, assembly.assemblyAxis);
  const adjRole = getFaceRole(adjacentFaceId, assembly.assemblyAxis);

  // Wall-to-Wall: use priority system (lower priority tabs OUT)
  if (myRole === 'wall' && adjRole === 'wall') {
    return getWallPriority(faceId) < getWallPriority(adjacentFaceId);
  }

  // Lid-to-Wall interactions
  if (myRole === 'lid') {
    const side = getLidSide(faceId, assembly.assemblyAxis);
    if (side) {
      // Inset lids still have tabs (like dividers) that fit into wall slot holes
      return assembly.lids[side].tabDirection === 'tabs-out';
    }
    return false;
  }

  // Wall-to-Lid interactions
  if (adjRole === 'lid') {
    const side = getLidSide(adjacentFaceId, assembly.assemblyAxis);
    if (side) {
      // If lid is inset, wall edge should be straight (no fingers)
      // Wall will have slot holes for the inset lid's tabs instead
      if (assembly.lids[side].inset > 0) {
        return null;  // Straight edge, no fingers - slots are cut as holes
      }
      return assembly.lids[side].tabDirection === 'tabs-in';
    }
    return false;
  }

  return false;
};

export const generateFaceSVGPath = (
  faceId: FaceId,
  faces: Face[],
  config: BoxConfig,
  kerf: number = 0
): string => {
  const face = faces.find((f) => f.id === faceId);
  if (!face || !face.solid) return '';

  const dims = getFaceDimensions(faceId, config);
  const edges = getFaceEdges(faceId);
  const padding = config.materialThickness * 2;

  const corners: Record<string, Point> = {
    topLeft: { x: padding, y: padding },
    topRight: { x: padding + dims.width, y: padding },
    bottomRight: { x: padding + dims.width, y: padding + dims.height },
    bottomLeft: { x: padding, y: padding + dims.height },
  };

  const edgeConfigs: { start: Point; end: Point; edgeInfo: EdgeInfo }[] = [
    { start: corners.topLeft, end: corners.topRight, edgeInfo: edges.find((e) => e.position === 'top')! },
    { start: corners.topRight, end: corners.bottomRight, edgeInfo: edges.find((e) => e.position === 'right')! },
    { start: corners.bottomRight, end: corners.bottomLeft, edgeInfo: edges.find((e) => e.position === 'bottom')! },
    { start: corners.bottomLeft, end: corners.topLeft, edgeInfo: edges.find((e) => e.position === 'left')! },
  ];

  let pathData = '';
  let isFirst = true;

  for (const { start, end, edgeInfo } of edgeConfigs) {
    const adjacentFace = faces.find((f) => f.id === edgeInfo.adjacentFaceId);
    const isSolidAdjacent = adjacentFace?.solid ?? false;

    let edgeType: EdgeType = 'straight';
    if (isSolidAdjacent) {
      const tabOutResult = shouldTabOut(faceId, edgeInfo.adjacentFaceId, config.assembly);
      // tabOutResult === null means straight edge (for inset lids)
      if (tabOutResult !== null) {
        edgeType = tabOutResult ? 'finger-out' : 'finger-in';
      }
    }

    const points = getEdgePath(start, end, edgeType, {
      edgeLength: Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)),
      fingerWidth: config.fingerWidth,
      materialThickness: config.materialThickness,
      kerf,
      cornerGapMultiplier: config.fingerGap,
    });

    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      if (isFirst && i === 0) {
        pathData += `M ${pt.x.toFixed(3)} ${pt.y.toFixed(3)} `;
        isFirst = false;
      } else {
        pathData += `L ${pt.x.toFixed(3)} ${pt.y.toFixed(3)} `;
      }
    }
  }

  pathData += 'Z';
  return pathData;
};

// Calculate subdivision panels from hierarchical void structure
export const getSubdivisionPanels = (
  rootVoid: Void,
  faces: Face[],
  config: BoxConfig
): SubdivisionPanel[] => {
  const subdivisions = getAllSubdivisions(rootVoid);
  const panels: SubdivisionPanel[] = [];
  const isFaceSolid = (faceId: FaceId) => faces.find(f => f.id === faceId)?.solid ?? false;

  for (const sub of subdivisions) {
    let width: number;
    let height: number;
    let meetsTop: boolean;
    let meetsBottom: boolean;
    let meetsLeft: boolean;
    let meetsRight: boolean;

    const { bounds } = sub;

    // Panel dimensions based on the parent void's bounds at the split point
    switch (sub.axis) {
      case 'x':
        // X-axis subdivision: panel is parallel to YZ plane
        width = bounds.d;
        height = bounds.h;
        meetsTop = isFaceSolid('top') && bounds.y + bounds.h >= config.height - 0.01;
        meetsBottom = isFaceSolid('bottom') && bounds.y <= 0.01;
        meetsLeft = isFaceSolid('back') && bounds.z <= 0.01;
        meetsRight = isFaceSolid('front') && bounds.z + bounds.d >= config.depth - 0.01;
        break;
      case 'y':
        // Y-axis subdivision: panel is parallel to XZ plane
        width = bounds.w;
        height = bounds.d;
        meetsTop = isFaceSolid('back') && bounds.z <= 0.01;
        meetsBottom = isFaceSolid('front') && bounds.z + bounds.d >= config.depth - 0.01;
        meetsLeft = isFaceSolid('left') && bounds.x <= 0.01;
        meetsRight = isFaceSolid('right') && bounds.x + bounds.w >= config.width - 0.01;
        break;
      case 'z':
        // Z-axis subdivision: panel is parallel to XY plane
        width = bounds.w;
        height = bounds.h;
        meetsTop = isFaceSolid('top') && bounds.y + bounds.h >= config.height - 0.01;
        meetsBottom = isFaceSolid('bottom') && bounds.y <= 0.01;
        meetsLeft = isFaceSolid('left') && bounds.x <= 0.01;
        meetsRight = isFaceSolid('right') && bounds.x + bounds.w >= config.width - 0.01;
        break;
    }

    // Find intersecting subdivisions
    const intersections: SubdivisionIntersection[] = [];
    for (const other of subdivisions) {
      if (other.id === sub.id) continue;

      // Check if they intersect based on their bounds and axes
      if (sub.axis !== other.axis && boundsOverlap(sub.bounds, other.bounds)) {
        const intersection = calculateIntersection(sub, other);
        if (intersection) {
          intersections.push(intersection);
        }
      }
    }

    panels.push({
      id: sub.id,
      axis: sub.axis,
      position: sub.position,
      parentBounds: sub.bounds,
      width,
      height,
      meetsTop,
      meetsBottom,
      meetsLeft,
      meetsRight,
      intersections,
    });
  }

  return panels;
};

const boundsOverlap = (a: Bounds, b: Bounds): boolean => {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x &&
    a.y < b.y + b.h && a.y + a.h > b.y &&
    a.z < b.z + b.d && a.z + a.d > b.z
  );
};

const calculateIntersection = (
  sub: Subdivision,
  other: Subdivision
): SubdivisionIntersection | null => {
  // Calculate where the other subdivision crosses this one
  let position: number;
  let fromTop: boolean;

  if (sub.axis === 'x') {
    if (other.axis === 'y') {
      // Y panel crosses X panel - position along depth
      position = other.position - sub.bounds.z;
      fromTop = true;
    } else {
      // Z panel crosses X panel
      position = other.position - sub.bounds.z;
      fromTop = false;
    }
  } else if (sub.axis === 'y') {
    if (other.axis === 'x') {
      // X panel crosses Y panel - position along width
      position = other.position - sub.bounds.x;
      fromTop = false;
    } else {
      // Z panel crosses Y panel
      position = other.position - sub.bounds.z;
      fromTop = true;
    }
  } else {
    // sub.axis === 'z'
    if (other.axis === 'x') {
      // X panel crosses Z panel
      position = other.position - sub.bounds.x;
      fromTop = true;
    } else {
      // Y panel crosses Z panel
      position = other.position - sub.bounds.y;
      fromTop = false;
    }
  }

  // Check if intersection is within the panel bounds
  if (position < 0 || position > getSubdivisionWidth(sub)) {
    return null;
  }

  return {
    subdivisionId: other.id,
    axis: other.axis,
    position,
    fromTop,
  };
};

const getSubdivisionWidth = (sub: Subdivision): number => {
  switch (sub.axis) {
    case 'x': return sub.bounds.d;
    case 'y': return sub.bounds.w;
    case 'z': return sub.bounds.w;
  }
};

// Generate SVG path for a subdivision panel
export const generateSubdivisionPanelPath = (
  panel: SubdivisionPanel,
  config: BoxConfig,
  kerf: number = 0
): string => {
  const padding = config.materialThickness * 2;
  const { width, height, meetsTop, meetsBottom, meetsLeft, meetsRight } = panel;

  const corners: Record<string, Point> = {
    topLeft: { x: padding, y: padding },
    topRight: { x: padding + width, y: padding },
    bottomRight: { x: padding + width, y: padding + height },
    bottomLeft: { x: padding, y: padding + height },
  };

  const edgeConfigs: { start: Point; end: Point; hasFinger: boolean }[] = [
    { start: corners.topLeft, end: corners.topRight, hasFinger: meetsTop },
    { start: corners.topRight, end: corners.bottomRight, hasFinger: meetsRight },
    { start: corners.bottomRight, end: corners.bottomLeft, hasFinger: meetsBottom },
    { start: corners.bottomLeft, end: corners.topLeft, hasFinger: meetsLeft },
  ];

  let pathData = '';
  let isFirst = true;

  for (const { start, end, hasFinger } of edgeConfigs) {
    const edgeType: EdgeType = hasFinger ? 'finger-out' : 'straight';

    const points = getEdgePath(start, end, edgeType, {
      edgeLength: Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)),
      fingerWidth: config.fingerWidth,
      materialThickness: config.materialThickness,
      kerf,
      cornerGapMultiplier: config.fingerGap,
    });

    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      if (isFirst && i === 0) {
        pathData += `M ${pt.x.toFixed(3)} ${pt.y.toFixed(3)} `;
        isFirst = false;
      } else {
        pathData += `L ${pt.x.toFixed(3)} ${pt.y.toFixed(3)} `;
      }
    }
  }

  pathData += 'Z';
  return pathData;
};

// Generate slot paths for intersecting subdivisions
export const generateSlotPaths = (
  panel: SubdivisionPanel,
  config: BoxConfig
): string[] => {
  const paths: string[] = [];
  const padding = config.materialThickness * 2;
  const mt = config.materialThickness;
  const slotDepth = panel.height / 2 + 0.5;

  for (const intersection of panel.intersections) {
    const slotX = padding + intersection.position;
    const slotWidth = mt;

    if (slotX < padding || slotX > padding + panel.width) continue;

    let slotPath: string;
    if (intersection.fromTop) {
      slotPath = `M ${(slotX - slotWidth / 2).toFixed(3)} ${padding.toFixed(3)} `;
      slotPath += `L ${(slotX - slotWidth / 2).toFixed(3)} ${(padding + slotDepth).toFixed(3)} `;
      slotPath += `L ${(slotX + slotWidth / 2).toFixed(3)} ${(padding + slotDepth).toFixed(3)} `;
      slotPath += `L ${(slotX + slotWidth / 2).toFixed(3)} ${padding.toFixed(3)}`;
    } else {
      const bottomY = padding + panel.height;
      slotPath = `M ${(slotX - slotWidth / 2).toFixed(3)} ${bottomY.toFixed(3)} `;
      slotPath += `L ${(slotX - slotWidth / 2).toFixed(3)} ${(bottomY - slotDepth).toFixed(3)} `;
      slotPath += `L ${(slotX + slotWidth / 2).toFixed(3)} ${(bottomY - slotDepth).toFixed(3)} `;
      slotPath += `L ${(slotX + slotWidth / 2).toFixed(3)} ${bottomY.toFixed(3)}`;
    }

    paths.push(slotPath);
  }

  return paths;
};

// Generate complete SVG for a subdivision panel
export const generateSubdivisionPanelSVG = (
  panel: SubdivisionPanel,
  config: BoxConfig,
  kerf: number = 0
): string => {
  const padding = config.materialThickness * 4;
  const svgWidth = panel.width + padding * 2;
  const svgHeight = panel.height + padding * 2;

  const outlinePath = generateSubdivisionPanelPath(panel, config, kerf);
  const slotPaths = generateSlotPaths(panel, config);

  const axisLabel = panel.axis.toUpperCase();
  const posLabel = panel.position.toFixed(1);

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${svgWidth}mm"
     height="${svgHeight}mm"
     viewBox="0 0 ${svgWidth} ${svgHeight}">
  <title>Subdivision ${axisLabel} @ ${posLabel}mm</title>
  <g stroke="#000" stroke-width="0.1" fill="none">
    <path d="${outlinePath}" />
`;

  for (const slotPath of slotPaths) {
    svg += `    <path d="${slotPath}" stroke="#000" fill="none" />\n`;
  }

  svg += `  </g>
  <text x="${svgWidth / 2}" y="${svgHeight - 2}"
        text-anchor="middle" font-size="3" fill="#666">
    DIV-${axisLabel}@${posLabel}mm - ${panel.width.toFixed(1)}mm x ${panel.height.toFixed(1)}mm
  </text>
</svg>`;

  return svg;
};

// Generate slot paths on outer faces where subdivision panels meet them
export const generateFaceSlotPaths = (
  faceId: FaceId,
  rootVoid: Void,
  config: BoxConfig
): string[] => {
  const paths: string[] = [];
  const dims = getFaceDimensions(faceId, config);
  const padding = config.materialThickness * 2;
  const mt = config.materialThickness;
  const fingerWidth = config.fingerWidth;

  const subdivisions = getAllSubdivisions(rootVoid);

  for (const sub of subdivisions) {
    let slotX: number | null = null;
    let slotY: number | null = null;
    let slotLength: number = 0;

    // Check if this subdivision touches this face
    const { bounds, position, axis } = sub;

    switch (faceId) {
      case 'front':
        if (bounds.z + bounds.d >= config.depth - 0.01) {
          if (axis === 'x') {
            slotX = padding + position;
            slotLength = bounds.h;
          } else if (axis === 'y') {
            slotY = padding + position;
            slotLength = bounds.w;
          }
        }
        break;
      case 'back':
        if (bounds.z <= 0.01) {
          if (axis === 'x') {
            slotX = padding + (config.width - position);
            slotLength = bounds.h;
          } else if (axis === 'y') {
            slotY = padding + position;
            slotLength = bounds.w;
          }
        }
        break;
      case 'left':
        if (bounds.x <= 0.01) {
          if (axis === 'z') {
            slotX = padding + position;
            slotLength = bounds.h;
          } else if (axis === 'y') {
            slotY = padding + position;
            slotLength = bounds.d;
          }
        }
        break;
      case 'right':
        if (bounds.x + bounds.w >= config.width - 0.01) {
          if (axis === 'z') {
            slotX = padding + (config.depth - position);
            slotLength = bounds.h;
          } else if (axis === 'y') {
            slotY = padding + position;
            slotLength = bounds.d;
          }
        }
        break;
      case 'top':
        if (bounds.y + bounds.h >= config.height - 0.01) {
          if (axis === 'x') {
            slotX = padding + position;
            slotLength = bounds.d;
          } else if (axis === 'z') {
            slotY = padding + position;
            slotLength = bounds.w;
          }
        }
        break;
      case 'bottom':
        if (bounds.y <= 0.01) {
          if (axis === 'x') {
            slotX = padding + position;
            slotLength = bounds.d;
          } else if (axis === 'z') {
            slotY = padding + (config.depth - position);
            slotLength = bounds.w;
          }
        }
        break;
    }

    // Generate finger joint slots
    if (slotX !== null) {
      const numFingers = Math.max(1, Math.floor(slotLength / fingerWidth));
      const actualFingerWidth = slotLength / numFingers;

      for (let i = 0; i < numFingers; i++) {
        if (i % 2 === 0) {
          const y1 = padding + i * actualFingerWidth;
          const y2 = padding + (i + 1) * actualFingerWidth;
          const path = `M ${(slotX - mt / 2).toFixed(3)} ${y1.toFixed(3)} ` +
            `L ${(slotX - mt / 2).toFixed(3)} ${y2.toFixed(3)} ` +
            `L ${(slotX + mt / 2).toFixed(3)} ${y2.toFixed(3)} ` +
            `L ${(slotX + mt / 2).toFixed(3)} ${y1.toFixed(3)} Z`;
          paths.push(path);
        }
      }
    } else if (slotY !== null) {
      const numFingers = Math.max(1, Math.floor(slotLength / fingerWidth));
      const actualFingerWidth = slotLength / numFingers;

      for (let i = 0; i < numFingers; i++) {
        if (i % 2 === 0) {
          const x1 = padding + i * actualFingerWidth;
          const x2 = padding + (i + 1) * actualFingerWidth;
          const path = `M ${x1.toFixed(3)} ${(slotY - mt / 2).toFixed(3)} ` +
            `L ${x2.toFixed(3)} ${(slotY - mt / 2).toFixed(3)} ` +
            `L ${x2.toFixed(3)} ${(slotY + mt / 2).toFixed(3)} ` +
            `L ${x1.toFixed(3)} ${(slotY + mt / 2).toFixed(3)} Z`;
          paths.push(path);
        }
      }
    }
  }

  return paths;
};

// Generate slot paths for lid tabs on wall faces (when lids have tabs-out)
export const generateLidSlotPaths = (
  faceId: FaceId,
  config: BoxConfig
): string[] => {
  const paths: string[] = [];
  const { assembly, materialThickness, fingerWidth, width, height, depth } = config;
  const padding = materialThickness * 2;

  // Only walls get slots for lid tabs
  if (getFaceRole(faceId, assembly.assemblyAxis) !== 'wall') return [];

  // Check each lid
  for (const side of ['positive', 'negative'] as const) {
    const lidConfig = assembly.lids[side];

    // Only process if lid has tabs-out
    if (lidConfig.tabDirection !== 'tabs-out') continue;

    // For SVG export, we assume the lid face exists (caller should check)

    let slotPosition: number;  // Position in SVG coordinates
    let slotLength: number;
    let isHorizontal: boolean;

    // Determine slot position based on assembly axis and face
    switch (assembly.assemblyAxis) {
      case 'y':
        // Top/bottom are lids - walls get horizontal slots at top/bottom
        if (side === 'positive') {
          // Top lid - slot near top of wall
          slotPosition = padding + materialThickness / 2 + lidConfig.inset;
        } else {
          // Bottom lid - slot near bottom of wall
          const faceHeight = (faceId === 'front' || faceId === 'back') ? height : height;
          slotPosition = padding + faceHeight - materialThickness / 2 - lidConfig.inset;
        }
        isHorizontal = true;
        slotLength = (faceId === 'front' || faceId === 'back') ? width : depth;
        break;

      case 'x':
        // Left/right are lids - walls get vertical slots at left/right
        if (side === 'positive') {
          // Right lid - slot near right of wall
          const faceWidth = (faceId === 'front' || faceId === 'back') ? width : depth;
          slotPosition = padding + faceWidth - materialThickness / 2 - lidConfig.inset;
        } else {
          // Left lid - slot near left of wall
          slotPosition = padding + materialThickness / 2 + lidConfig.inset;
        }
        isHorizontal = false;
        slotLength = (faceId === 'front' || faceId === 'back') ? height : height;
        break;

      case 'z':
        // Front/back are lids - walls get vertical slots at front/back
        if (faceId === 'left' || faceId === 'right') {
          const faceWidth = depth;
          if (side === 'positive') {
            // Front lid
            slotPosition = padding + faceWidth - materialThickness / 2 - lidConfig.inset;
          } else {
            // Back lid
            slotPosition = padding + materialThickness / 2 + lidConfig.inset;
          }
          isHorizontal = false;
          slotLength = height;
        } else {
          // top/bottom
          const faceHeight = depth;
          if (side === 'positive') {
            slotPosition = padding + faceHeight - materialThickness / 2 - lidConfig.inset;
          } else {
            slotPosition = padding + materialThickness / 2 + lidConfig.inset;
          }
          isHorizontal = true;
          slotLength = width;
        }
        break;

      default:
        continue;
    }

    // Generate finger slots
    const numFingers = Math.max(1, Math.floor(slotLength / fingerWidth));
    const actualFingerWidth = slotLength / numFingers;

    for (let i = 0; i < numFingers; i++) {
      if (i % 2 === 0) {  // Only even positions have tabs
        if (isHorizontal) {
          const x1 = padding + i * actualFingerWidth;
          const x2 = padding + (i + 1) * actualFingerWidth;
          const path = `M ${x1.toFixed(3)} ${(slotPosition - materialThickness / 2).toFixed(3)} ` +
            `L ${x2.toFixed(3)} ${(slotPosition - materialThickness / 2).toFixed(3)} ` +
            `L ${x2.toFixed(3)} ${(slotPosition + materialThickness / 2).toFixed(3)} ` +
            `L ${x1.toFixed(3)} ${(slotPosition + materialThickness / 2).toFixed(3)} Z`;
          paths.push(path);
        } else {
          const y1 = padding + i * actualFingerWidth;
          const y2 = padding + (i + 1) * actualFingerWidth;
          const path = `M ${(slotPosition - materialThickness / 2).toFixed(3)} ${y1.toFixed(3)} ` +
            `L ${(slotPosition - materialThickness / 2).toFixed(3)} ${y2.toFixed(3)} ` +
            `L ${(slotPosition + materialThickness / 2).toFixed(3)} ${y2.toFixed(3)} ` +
            `L ${(slotPosition + materialThickness / 2).toFixed(3)} ${y1.toFixed(3)} Z`;
          paths.push(path);
        }
      }
    }
  }

  return paths;
};

export const generateFaceSVG = (
  faceId: FaceId,
  faces: Face[],
  rootVoid: Void,
  config: BoxConfig,
  kerf: number = 0
): string => {
  const face = faces.find((f) => f.id === faceId);
  if (!face || !face.solid) return '';

  const dims = getFaceDimensions(faceId, config);
  const padding = config.materialThickness * 4;
  const svgWidth = dims.width + padding * 2;
  const svgHeight = dims.height + padding * 2;

  const outlinePath = generateFaceSVGPath(faceId, faces, config, kerf);
  const dividerSlotPaths = generateFaceSlotPaths(faceId, rootVoid, config);
  const lidSlotPaths = generateLidSlotPaths(faceId, config);
  const allSlotPaths = [...dividerSlotPaths, ...lidSlotPaths];

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${svgWidth}mm"
     height="${svgHeight}mm"
     viewBox="0 0 ${svgWidth} ${svgHeight}">
  <title>${faceId} face</title>
  <g stroke="#000" stroke-width="0.1" fill="none">
    <path d="${outlinePath}" />
`;

  for (const slotPath of allSlotPaths) {
    svg += `    <path d="${slotPath}" stroke="#000" fill="none" />\n`;
  }

  svg += `  </g>
  <text x="${svgWidth / 2}" y="${svgHeight - 2}"
        text-anchor="middle" font-size="3" fill="#666">
    ${faceId.toUpperCase()} - ${dims.width}mm x ${dims.height}mm
  </text>
</svg>`;

  return svg;
};

export const generateAllFacesSVG = (
  faces: Face[],
  rootVoid: Void,
  config: BoxConfig,
  kerf: number = 0
): string => {
  const solidFaces = faces.filter((f) => f.solid);
  const panels = getSubdivisionPanels(rootVoid, faces, config);
  const gap = 10;
  let currentY = gap;
  let maxWidth = 0;

  interface SvgItem {
    label: string;
    pathData: string;
    slotPaths: string[];
    width: number;
    height: number;
    y: number;
    dims: { width: number; height: number };
  }

  const svgItems: SvgItem[] = [];

  // Add outer faces
  for (const face of solidFaces) {
    const dims = getFaceDimensions(face.id, config);
    const padding = config.materialThickness * 4;
    const width = dims.width + padding * 2;
    const height = dims.height + padding * 2;

    const dividerSlots = generateFaceSlotPaths(face.id, rootVoid, config);
    const lidSlots = generateLidSlotPaths(face.id, config);
    svgItems.push({
      label: face.id.toUpperCase(),
      pathData: generateFaceSVGPath(face.id, faces, config, kerf),
      slotPaths: [...dividerSlots, ...lidSlots],
      width,
      height,
      y: currentY,
      dims,
    });

    maxWidth = Math.max(maxWidth, width);
    currentY += height + gap;
  }

  // Add subdivision panels
  for (const panel of panels) {
    const padding = config.materialThickness * 4;
    const width = panel.width + padding * 2;
    const height = panel.height + padding * 2;

    svgItems.push({
      label: `DIV-${panel.axis.toUpperCase()}@${panel.position.toFixed(1)}mm`,
      pathData: generateSubdivisionPanelPath(panel, config, kerf),
      slotPaths: generateSlotPaths(panel, config),
      width,
      height,
      y: currentY,
      dims: { width: panel.width, height: panel.height },
    });

    maxWidth = Math.max(maxWidth, width);
    currentY += height + gap;
  }

  const totalHeight = currentY;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${maxWidth + gap * 2}mm"
     height="${totalHeight}mm"
     viewBox="0 0 ${maxWidth + gap * 2} ${totalHeight}">
  <title>Boxen Export - All Pieces</title>
`;

  for (const item of svgItems) {
    const x = (maxWidth - item.width) / 2 + gap;

    svg += `  <g transform="translate(${x}, ${item.y})" stroke="#000" stroke-width="0.1" fill="none">
    <path d="${item.pathData}" />
`;

    for (const slotPath of item.slotPaths) {
      svg += `    <path d="${slotPath}" />\n`;
    }

    svg += `    <text x="${item.width / 2}" y="${item.height - 2}"
          text-anchor="middle" font-size="3" fill="#666">
      ${item.label} - ${item.dims.width.toFixed(1)}mm x ${item.dims.height.toFixed(1)}mm
    </text>
  </g>
`;
  }

  svg += '</svg>';
  return svg;
};

export const downloadSVG = (svgContent: string, filename: string) => {
  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
