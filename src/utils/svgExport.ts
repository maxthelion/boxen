import { BoxConfig, Face, FaceId, Void, SubdivisionPanel, SubdivisionIntersection, Subdivision, Bounds, getFaceRole, getLidSide, getWallPriority, getLidFaceId, AssemblyConfig, PanelPath, PanelCollection, PathPoint } from '../types';
import { EdgeType, getEdgePath, Point } from './fingerJoints';
import { getAllSubdivisions } from '../store/useBoxStore';

// =============================================================================
// Bin Packing Algorithm (MaxRects with Best Short Side Fit)
// =============================================================================

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PackedItem {
  panel: PanelPath;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
}

interface PackedBed {
  items: PackedItem[];
  width: number;
  height: number;
}

// MaxRects bin packing implementation
class MaxRectsBin {
  private binWidth: number;
  private binHeight: number;
  private freeRectangles: Rect[] = [];
  public packedItems: PackedItem[] = [];

  constructor(width: number, height: number) {
    this.binWidth = width;
    this.binHeight = height;
    this.freeRectangles = [{ x: 0, y: 0, width, height }];
  }

  // Try to insert a rectangle, returns true if successful
  insert(panel: PanelPath, itemWidth: number, itemHeight: number, allowRotation: boolean = true): boolean {
    // Find the best position using Best Short Side Fit
    let bestScore = Infinity;
    let bestRect: Rect | null = null;
    let bestRotated = false;

    for (const freeRect of this.freeRectangles) {
      // Try without rotation
      if (itemWidth <= freeRect.width && itemHeight <= freeRect.height) {
        const leftover = Math.min(freeRect.width - itemWidth, freeRect.height - itemHeight);
        if (leftover < bestScore) {
          bestScore = leftover;
          bestRect = freeRect;
          bestRotated = false;
        }
      }

      // Try with rotation
      if (allowRotation && itemHeight <= freeRect.width && itemWidth <= freeRect.height) {
        const leftover = Math.min(freeRect.width - itemHeight, freeRect.height - itemWidth);
        if (leftover < bestScore) {
          bestScore = leftover;
          bestRect = freeRect;
          bestRotated = true;
        }
      }
    }

    if (!bestRect) return false;

    const placedWidth = bestRotated ? itemHeight : itemWidth;
    const placedHeight = bestRotated ? itemWidth : itemHeight;

    this.packedItems.push({
      panel,
      x: bestRect.x,
      y: bestRect.y,
      width: placedWidth,
      height: placedHeight,
      rotated: bestRotated,
    });

    // Split the free rectangle
    this.splitFreeRect(bestRect, placedWidth, placedHeight);
    this.pruneFreeRectangles();

    return true;
  }

  private splitFreeRect(rect: Rect, usedWidth: number, usedHeight: number): void {
    // Remove the used rectangle from free list
    const index = this.freeRectangles.indexOf(rect);
    if (index !== -1) {
      this.freeRectangles.splice(index, 1);
    }

    // Create new free rectangles from the remaining space
    // Right remainder
    if (usedWidth < rect.width) {
      this.freeRectangles.push({
        x: rect.x + usedWidth,
        y: rect.y,
        width: rect.width - usedWidth,
        height: rect.height,
      });
    }

    // Top remainder
    if (usedHeight < rect.height) {
      this.freeRectangles.push({
        x: rect.x,
        y: rect.y + usedHeight,
        width: usedWidth,
        height: rect.height - usedHeight,
      });
    }
  }

  private pruneFreeRectangles(): void {
    // Remove rectangles that are fully contained in other rectangles
    for (let i = 0; i < this.freeRectangles.length; i++) {
      for (let j = i + 1; j < this.freeRectangles.length; j++) {
        if (this.isContainedIn(this.freeRectangles[i], this.freeRectangles[j])) {
          this.freeRectangles.splice(i, 1);
          i--;
          break;
        }
        if (this.isContainedIn(this.freeRectangles[j], this.freeRectangles[i])) {
          this.freeRectangles.splice(j, 1);
          j--;
        }
      }
    }
  }

  private isContainedIn(a: Rect, b: Rect): boolean {
    return a.x >= b.x && a.y >= b.y &&
           a.x + a.width <= b.x + b.width &&
           a.y + a.height <= b.y + b.height;
  }
}

// Minimal padding for labels (just enough for text below panel)
const LABEL_PADDING = 5; // mm below panel for label text

// Pack panels into beds of specified size
export const packPanelsIntoBeds = (
  panels: PanelPath[],
  bedWidth: number,
  bedHeight: number,
  gap: number = 5,
  allowRotation: boolean = true,
  showLabels: boolean = true
): PackedBed[] => {
  const beds: PackedBed[] = [];
  const labelSpace = showLabels ? LABEL_PADDING : 0;

  // Filter visible panels and calculate their sizes
  // Only add gap between items, no extra padding
  const itemsToPlace = panels
    .filter(p => p.visible)
    .map(panel => {
      return {
        panel,
        width: panel.width + gap,
        height: panel.height + labelSpace + gap,
      };
    })
    // Sort by area (largest first) for better packing
    .sort((a, b) => (b.width * b.height) - (a.width * a.height));

  // Effective bed size (accounting for edge gap)
  const effectiveWidth = bedWidth - gap;
  const effectiveHeight = bedHeight - gap;

  let remainingItems = [...itemsToPlace];

  while (remainingItems.length > 0) {
    const bin = new MaxRectsBin(effectiveWidth, effectiveHeight);
    const placedIndices: number[] = [];

    for (let i = 0; i < remainingItems.length; i++) {
      const item = remainingItems[i];
      if (bin.insert(item.panel, item.width, item.height, allowRotation)) {
        placedIndices.push(i);
      }
    }

    if (placedIndices.length === 0) {
      // Can't fit any remaining items - they're too large for the bed
      // Create oversized beds for each remaining item
      for (const item of remainingItems) {
        beds.push({
          items: [{
            panel: item.panel,
            x: gap,
            y: gap,
            width: item.width,
            height: item.height,
            rotated: false,
          }],
          width: item.width + gap * 2,
          height: item.height + gap * 2,
        });
      }
      break;
    }

    // Adjust positions to account for initial gap offset
    const adjustedItems = bin.packedItems.map(item => ({
      ...item,
      x: item.x + gap,
      y: item.y + gap,
    }));

    beds.push({
      items: adjustedItems,
      width: bedWidth,
      height: bedHeight,
    });

    // Remove placed items from remaining
    remainingItems = remainingItems.filter((_, i) => !placedIndices.includes(i));
  }

  return beds;
};

// Pack panels efficiently without a specific bed size (auto-size)
export const packPanelsAuto = (
  panels: PanelPath[],
  gap: number = 5,
  showLabels: boolean = true
): PackedBed => {
  const visiblePanels = panels.filter(p => p.visible);
  if (visiblePanels.length === 0) {
    return { items: [], width: 0, height: 0 };
  }

  const labelSpace = showLabels ? LABEL_PADDING : 0;

  // Calculate sizes - minimal padding, just gap between items
  const items = visiblePanels.map(panel => {
    return {
      panel,
      width: panel.width,
      height: panel.height + labelSpace,
    };
  });

  // Sort by height (tallest first) for shelf packing
  items.sort((a, b) => b.height - a.height);

  // Use a simple shelf-based algorithm for auto-sizing
  // This tends to produce compact rectangular layouts
  const shelves: { y: number; height: number; items: PackedItem[] }[] = [];
  let maxWidth = 0;

  for (const item of items) {
    // Try to fit on an existing shelf
    let placed = false;
    for (const shelf of shelves) {
      const shelfWidth = shelf.items.reduce((sum, i) => sum + i.width + gap, gap);
      if (item.height <= shelf.height) {
        shelf.items.push({
          panel: item.panel,
          x: shelfWidth,
          y: shelf.y,
          width: item.width,
          height: item.height,
          rotated: false,
        });
        maxWidth = Math.max(maxWidth, shelfWidth + item.width + gap);
        placed = true;
        break;
      }
    }

    // Create a new shelf
    if (!placed) {
      const shelfY = shelves.length === 0
        ? gap
        : shelves[shelves.length - 1].y + shelves[shelves.length - 1].height + gap;
      shelves.push({
        y: shelfY,
        height: item.height,
        items: [{
          panel: item.panel,
          x: gap,
          y: shelfY,
          width: item.width,
          height: item.height,
          rotated: false,
        }],
      });
      maxWidth = Math.max(maxWidth, gap + item.width + gap);
    }
  }

  const allItems = shelves.flatMap(s => s.items);
  const totalHeight = shelves.length === 0
    ? 0
    : shelves[shelves.length - 1].y + shelves[shelves.length - 1].height + gap;

  return {
    items: allItems,
    width: maxWidth,
    height: totalHeight,
  };
};

// =============================================================================
// Panel Path based SVG generation (uses stored paths)
// =============================================================================

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

// Generate SVG for a single panel using stored PanelPath
export const generatePanelPathSVG = (
  panel: PanelPath,
  kerf: number = 0
): string => {
  const padding = panel.thickness * 4;
  const svgWidth = panel.width + padding * 2;
  const svgHeight = panel.height + padding * 2;

  // Offset to center the panel in the SVG (panel coords are centered at 0,0)
  const offsetX = svgWidth / 2;
  const offsetY = svgHeight / 2;

  const outlinePath = pathPointsToSVGPath(panel.outline.points, offsetX, offsetY);

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${svgWidth}mm"
     height="${svgHeight}mm"
     viewBox="0 0 ${svgWidth} ${svgHeight}">
  <title>${panel.label || panel.id}</title>
  <g stroke="#000" stroke-width="0.1" fill="none">
    <path d="${outlinePath}" />
`;

  // Add hole paths
  for (const hole of panel.holes) {
    const holePath = pathPointsToSVGPath(hole.path.points, offsetX, offsetY);
    svg += `    <path d="${holePath}" />\n`;
  }

  svg += `  </g>
  <text x="${svgWidth / 2}" y="${svgHeight - 2}"
        text-anchor="middle" font-size="3" fill="red" stroke="red">
    ${panel.label || panel.id} - ${panel.width.toFixed(1)}mm x ${panel.height.toFixed(1)}mm
  </text>
</svg>`;

  return svg;
};

// Export options for bed-based packing
export interface BedExportOptions {
  bedWidth?: number;       // Bed width in mm (undefined = auto-size)
  bedHeight?: number;      // Bed height in mm (undefined = auto-size)
  gap?: number;            // Gap between pieces in mm (default: 5)
  allowRotation?: boolean; // Allow 90° rotation for better fit (default: true)
  kerf?: number;           // Kerf compensation in mm (default: 0)
  showLabels?: boolean;    // Show labels on panels (default: true)
}

// Generate SVG for a single packed bed
const generatePackedBedSVG = (
  bed: PackedBed,
  bedIndex: number,
  totalBeds: number,
  kerf: number = 0,
  showLabels: boolean = true
): string => {
  const title = totalBeds > 1
    ? `Boxen Export - Bed ${bedIndex + 1} of ${totalBeds}`
    : 'Boxen Export - All Pieces';

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${bed.width}mm"
     height="${bed.height}mm"
     viewBox="0 0 ${bed.width} ${bed.height}">
  <title>${title}</title>
`;

  for (const item of bed.items) {
    // Panel paths are centered at (0,0), offset to position in allocated space
    const panelW = item.panel.width;
    const panelH = item.panel.height;
    const offsetX = panelW / 2;
    const offsetY = panelH / 2;

    // Generate path with potential rotation
    let outlinePath: string;
    let holePaths: string[] = [];

    if (item.rotated) {
      // Rotate points 90° clockwise: (x, y) -> (y, -x)
      const rotatedOutline = item.panel.outline.points.map(p => ({
        x: p.y,
        y: -p.x,
      }));
      // For rotated panels, swap width/height for offset
      outlinePath = pathPointsToSVGPath(rotatedOutline, panelH / 2, panelW / 2);

      for (const hole of item.panel.holes) {
        const rotatedHole = hole.path.points.map(p => ({
          x: p.y,
          y: -p.x,
        }));
        holePaths.push(pathPointsToSVGPath(rotatedHole, panelH / 2, panelW / 2));
      }
    } else {
      outlinePath = pathPointsToSVGPath(item.panel.outline.points, offsetX, offsetY);

      for (const hole of item.panel.holes) {
        holePaths.push(pathPointsToSVGPath(hole.path.points, offsetX, offsetY));
      }
    }

    const displayWidth = item.rotated ? panelH : panelW;
    const displayHeight = item.rotated ? panelW : panelH;

    svg += `  <g transform="translate(${item.x}, ${item.y})" stroke="#000" stroke-width="0.1" fill="none">
    <path d="${outlinePath}" />
`;

    for (const holePath of holePaths) {
      svg += `    <path d="${holePath}" />\n`;
    }

    if (showLabels) {
      const rotatedIndicator = item.rotated ? ' (R)' : '';
      svg += `    <text x="${displayWidth / 2}" y="${displayHeight + LABEL_PADDING - 1}"
          text-anchor="middle" font-size="2" fill="red" stroke="red">
      ${item.panel.label || item.panel.id}${rotatedIndicator}
    </text>
`;
    }
    svg += `  </g>
`;
  }

  svg += '</svg>';
  return svg;
};

// Generate SVG containing all panels from a PanelCollection with efficient packing
export const generateAllPanelPathsSVG = (
  collection: PanelCollection,
  kerf: number = 0,
  options?: BedExportOptions
): string => {
  const gap = options?.gap ?? 5;
  const allowRotation = options?.allowRotation ?? true;
  const showLabels = options?.showLabels ?? true;

  // Use bed-based packing if bed size is specified
  if (options?.bedWidth && options?.bedHeight) {
    const beds = packPanelsIntoBeds(
      collection.panels,
      options.bedWidth,
      options.bedHeight,
      gap,
      allowRotation,
      showLabels
    );

    if (beds.length === 0) {
      return generatePackedBedSVG({ items: [], width: 100, height: 100 }, 0, 1, kerf, showLabels);
    }

    // For single bed, just return it
    if (beds.length === 1) {
      return generatePackedBedSVG(beds[0], 0, 1, kerf, showLabels);
    }

    // For multiple beds, stack them vertically with a separator
    const bedSeparator = 20;
    let totalHeight = 0;
    let maxWidth = 0;

    for (const bed of beds) {
      totalHeight += bed.height + bedSeparator;
      maxWidth = Math.max(maxWidth, bed.width);
    }

    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${maxWidth}mm"
     height="${totalHeight}mm"
     viewBox="0 0 ${maxWidth} ${totalHeight}">
  <title>Boxen Export - ${beds.length} Beds</title>
`;

    let currentY = 0;
    for (let i = 0; i < beds.length; i++) {
      const bed = beds[i];

      // Add bed boundary rectangle (dashed)
      svg += `  <rect x="0" y="${currentY}" width="${bed.width}" height="${bed.height}"
        stroke="red" stroke-width="0.5" stroke-dasharray="5,5" fill="none" />
  <text x="5" y="${currentY + 10}" font-size="4" fill="red" stroke="red">Bed ${i + 1}</text>
`;

      // Add panels in this bed
      for (const item of bed.items) {
        const panelW = item.panel.width;
        const panelH = item.panel.height;
        const offsetX = panelW / 2;
        const offsetY = panelH / 2;

        let outlinePath: string;
        let holePaths: string[] = [];

        if (item.rotated) {
          const rotatedOutline = item.panel.outline.points.map(p => ({
            x: p.y,
            y: -p.x,
          }));
          outlinePath = pathPointsToSVGPath(rotatedOutline, panelH / 2, panelW / 2);

          for (const hole of item.panel.holes) {
            const rotatedHole = hole.path.points.map(p => ({
              x: p.y,
              y: -p.x,
            }));
            holePaths.push(pathPointsToSVGPath(rotatedHole, panelH / 2, panelW / 2));
          }
        } else {
          outlinePath = pathPointsToSVGPath(item.panel.outline.points, offsetX, offsetY);

          for (const hole of item.panel.holes) {
            holePaths.push(pathPointsToSVGPath(hole.path.points, offsetX, offsetY));
          }
        }

        const displayWidth = item.rotated ? panelH : panelW;
        const displayHeight = item.rotated ? panelW : panelH;

        svg += `  <g transform="translate(${item.x}, ${currentY + item.y})" stroke="#000" stroke-width="0.1" fill="none">
    <path d="${outlinePath}" />
`;

        for (const holePath of holePaths) {
          svg += `    <path d="${holePath}" />\n`;
        }

        if (showLabels) {
          const rotatedIndicator = item.rotated ? ' (R)' : '';
          svg += `    <text x="${displayWidth / 2}" y="${displayHeight + LABEL_PADDING - 1}"
          text-anchor="middle" font-size="2" fill="red" stroke="red">
      ${item.panel.label || item.panel.id}${rotatedIndicator}
    </text>
`;
        }
        svg += `  </g>
`;
      }

      currentY += bed.height + bedSeparator;
    }

    svg += '</svg>';
    return svg;
  }

  // Auto-size packing (no bed size specified)
  const packed = packPanelsAuto(collection.panels, gap, showLabels);

  if (packed.items.length === 0) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
  <title>Boxen Export - No Pieces</title>
</svg>`;
  }

  return generatePackedBedSVG(packed, 0, 1, kerf, showLabels);
};

// Generate multiple SVG files for multiple beds
export const generateMultipleBedSVGs = (
  collection: PanelCollection,
  options: BedExportOptions
): string[] => {
  const gap = options?.gap ?? 5;
  const allowRotation = options?.allowRotation ?? true;
  const kerf = options?.kerf ?? 0;
  const showLabels = options?.showLabels ?? true;

  if (!options.bedWidth || !options.bedHeight) {
    // No bed size - return single auto-packed SVG
    return [generateAllPanelPathsSVG(collection, kerf, options)];
  }

  const beds = packPanelsIntoBeds(
    collection.panels,
    options.bedWidth,
    options.bedHeight,
    gap,
    allowRotation,
    showLabels
  );

  return beds.map((bed, i) => generatePackedBedSVG(bed, i, beds.length, kerf, showLabels));
};

// =============================================================================
// Legacy SVG generation (computes paths on-the-fly)
// These functions are kept for backwards compatibility
// =============================================================================

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
        text-anchor="middle" font-size="3" fill="red" stroke="red">
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
        text-anchor="middle" font-size="3" fill="red" stroke="red">
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
          text-anchor="middle" font-size="3" fill="red" stroke="red">
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
