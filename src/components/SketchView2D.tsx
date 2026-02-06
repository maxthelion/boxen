import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { useBoxStore, getAllSubdivisions } from '../store/useBoxStore';
import { useEngineConfig, useEngineFaces, useEngineVoidTree, useEnginePanels, usePanelEligibility, getEngine, notifyEngineStateChanged } from '../engine';
import { useEditor } from '../editor';
import { PathPoint, FaceId, Face } from '../types';
import { getFaceEdgeStatuses, getDividerEdgeStatuses, EdgeStatusInfo } from '../utils/panelGenerator';
import { DetectedCorner } from '../utils/cornerFinish';
import { EditorToolbar, EditorTool } from './EditorToolbar';
import { FloatingPalette, PaletteSliderInput, PaletteToggleGroup, PaletteButtonRow, PaletteButton, PaletteCheckbox, PaletteCheckboxGroup, PaletteNumberInput } from './FloatingPalette';
import { getColors } from '../config/colors';
import { SafeSpaceRegion, isRectInSafeSpace, isCircleInSafeSpace, isPointInSafeSpace, analyzePath, getEdgeMarginsForFace, rectToEdgePath, circleToEdgePath } from '../engine/safeSpace';
import { createRectPolygon, createCirclePolygon, classifyPolygon } from '../utils/polygonBoolean';
import { computeGuideLines, computeSnapPoints, computeEdgeSegments, findSnapPoint, GuideLine, SnapResult, SnapPoint, EdgeSegment } from '../utils/snapGuides';
import { FaceConfig } from '../types';
import { debug, enableDebugTag } from '../utils/debug';

// Ensure safe-space tag is active for this component
enableDebugTag('safe-space');
enableDebugTag('path-tool'); // Enable to debug path tool
// enableDebugTag('corner-click'); // Uncomment to debug corner hit detection

interface SketchView2DProps {
  className?: string;
}

type EdgePosition = 'top' | 'bottom' | 'left' | 'right';

// Convert path points to SVG path string
const pathToSvgD = (points: PathPoint[], closed: boolean): string => {
  if (points.length === 0) return '';
  const segments = points.map((p, i) =>
    i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`
  );
  if (closed) segments.push('Z');
  return segments.join(' ');
};

// Classify a line segment to an edge based on position
// Note: tolerance needs to be larger than material thickness (typically 3mm) to account for
// corner insets from finger joints. Using 5mm as default.
const classifySegment = (
  p1: PathPoint,
  p2: PathPoint,
  panelWidth: number,
  panelHeight: number,
  tolerance: number = 5
): EdgePosition | null => {
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  // Check if both points are near the same edge
  const nearTop = (p: PathPoint) => Math.abs(p.y - halfH) < tolerance;
  const nearBottom = (p: PathPoint) => Math.abs(p.y + halfH) < tolerance;
  const nearLeft = (p: PathPoint) => Math.abs(p.x + halfW) < tolerance;
  const nearRight = (p: PathPoint) => Math.abs(p.x - halfW) < tolerance;

  if (nearTop(p1) && nearTop(p2)) return 'top';
  if (nearBottom(p1) && nearBottom(p2)) return 'bottom';
  if (nearLeft(p1) && nearLeft(p2)) return 'left';
  if (nearRight(p1) && nearRight(p2)) return 'right';

  return null;
};

// Get segments grouped by edge
const getEdgeSegments = (
  points: PathPoint[],
  panelWidth: number,
  panelHeight: number
): Record<EdgePosition, { start: PathPoint; end: PathPoint }[]> => {
  const edges: Record<EdgePosition, { start: PathPoint; end: PathPoint }[]> = {
    top: [],
    bottom: [],
    left: [],
    right: [],
  };

  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const edge = classifySegment(p1, p2, panelWidth, panelHeight);
    if (edge) {
      edges[edge].push({ start: p1, end: p2 });
    }
  }

  return edges;
};

// Calculate distance from point to line segment
const distanceToSegment = (
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  }

  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));

  const nearX = x1 + t * dx;
  const nearY = y1 + t * dy;

  return Math.sqrt((px - nearX) ** 2 + (py - nearY) ** 2);
};

/**
 * Classify where a click occurred relative to the panel.
 * Used by the path tool to determine whether to start forked mode or polygon mode.
 */
type ClickLocation =
  | { type: 'boundary'; edge: EdgePosition }  // On panel outline - forked mode
  | { type: 'safe-space' }                     // Inside safe space - polygon mode
  | { type: 'open-space' }                     // Outside panel - polygon mode
  | { type: 'restricted' };                    // In joint margin - invalid

/**
 * Determine what kind of space a point is in.
 *
 * Priority: boundary > open-space > safe-space > restricted
 *
 * Note: Boundary detection must happen FIRST because finger joint tabs extend
 * beyond the panel body bounds. A click on a tab would be "outside bounds"
 * but should still be detected as a boundary click.
 */
const classifyClickLocation = (
  svgX: number,
  svgY: number,
  panelWidth: number,
  panelHeight: number,
  safeSpace: SafeSpaceRegion | null,
  edgeSegments: Record<EdgePosition, { start: PathPoint; end: PathPoint }[]> | null,
  hitThreshold: number
): ClickLocation => {
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  // Calculate distances to conceptual panel edges
  const distToTop = Math.abs(svgY - halfH);
  const distToBottom = Math.abs(svgY + halfH);
  const distToLeft = Math.abs(svgX + halfW);
  const distToRight = Math.abs(svgX - halfW);

  // Check BOUNDARY FIRST - important because finger joints extend beyond panel body
  // A generous threshold allows clicking on finger joint tabs
  const boundaryThreshold = hitThreshold * 2;

  // Check if near any conceptual edge and within X bounds (for top/bottom) or Y bounds (for left/right)
  // Top edge: y ≈ halfH, x within [-halfW, halfW] (with some tolerance for corners)
  if (distToTop < boundaryThreshold && svgX >= -halfW - boundaryThreshold && svgX <= halfW + boundaryThreshold) {
    return { type: 'boundary', edge: 'top' };
  }
  if (distToBottom < boundaryThreshold && svgX >= -halfW - boundaryThreshold && svgX <= halfW + boundaryThreshold) {
    return { type: 'boundary', edge: 'bottom' };
  }
  if (distToLeft < boundaryThreshold && svgY >= -halfH - boundaryThreshold && svgY <= halfH + boundaryThreshold) {
    return { type: 'boundary', edge: 'left' };
  }
  if (distToRight < boundaryThreshold && svgY >= -halfH - boundaryThreshold && svgY <= halfH + boundaryThreshold) {
    return { type: 'boundary', edge: 'right' };
  }

  // Check if outside panel body (open space)
  const inPanelBounds = svgX >= -halfW && svgX <= halfW && svgY >= -halfH && svgY <= halfH;
  if (!inPanelBounds) {
    return { type: 'open-space' };
  }

  // Check if in safe space (interior area that can be modified)
  if (safeSpace && isPointInSafeSpace(svgX, svgY, safeSpace)) {
    return { type: 'safe-space' };
  }

  // Otherwise it's in restricted space (joint margins)
  return { type: 'restricted' };
};

/**
 * Constrain a point to 90° or 45° angles from a reference point.
 * Used when Shift is held during path drawing.
 */
const constrainAngle = (
  fromPoint: PathPoint,
  toPoint: { x: number; y: number }
): PathPoint => {
  const dx = toPoint.x - fromPoint.x;
  const dy = toPoint.y - fromPoint.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance < 0.001) return { x: fromPoint.x, y: fromPoint.y };

  // Get angle in radians
  const angle = Math.atan2(dy, dx);

  // Snap to nearest 45° increment (0, 45, 90, 135, 180, -135, -90, -45)
  const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);

  return {
    x: fromPoint.x + distance * Math.cos(snapAngle),
    y: fromPoint.y + distance * Math.sin(snapAngle),
  };
};

/**
 * Get the offset of the current edge path at a given t position.
 * If no custom path exists for this edge, returns 0 (original boundary).
 * If a custom path exists, interpolates between points to find the offset.
 */
const getEdgePathOffsetAtT = (
  customEdgePaths: Array<{ edge: string; points: Array<{ t: number; offset: number }> }>,
  edge: EdgePosition,
  t: number
): number => {
  // Find the custom path for this edge
  const edgePath = customEdgePaths.find(p => p.edge === edge);
  if (!edgePath || edgePath.points.length === 0) {
    return 0; // No custom path, use original boundary
  }

  const points = edgePath.points;

  // Sort points by t value
  const sorted = [...points].sort((a, b) => a.t - b.t);

  // If t is before first point, use first point's offset
  if (t <= sorted[0].t) {
    return sorted[0].offset;
  }

  // If t is after last point, use last point's offset
  if (t >= sorted[sorted.length - 1].t) {
    return sorted[sorted.length - 1].offset;
  }

  // Find the two points that bracket t and interpolate
  for (let i = 0; i < sorted.length - 1; i++) {
    if (t >= sorted[i].t && t <= sorted[i + 1].t) {
      const t0 = sorted[i].t;
      const t1 = sorted[i + 1].t;
      const o0 = sorted[i].offset;
      const o1 = sorted[i + 1].offset;

      // Linear interpolation
      const ratio = (t - t0) / (t1 - t0);
      return o0 + ratio * (o1 - o0);
    }
  }

  return 0; // Fallback
};

// Get the conceptual boundary lines for the panel (where edges would be without joints)
const getConceptualBoundary = (
  panelWidth: number,
  panelHeight: number
): Record<EdgePosition, { start: PathPoint; end: PathPoint }> => {
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  return {
    top: { start: { x: -halfW, y: halfH }, end: { x: halfW, y: halfH } },
    bottom: { start: { x: -halfW, y: -halfH }, end: { x: halfW, y: -halfH } },
    left: { start: { x: -halfW, y: -halfH }, end: { x: -halfW, y: halfH } },
    right: { start: { x: halfW, y: -halfH }, end: { x: halfW, y: halfH } },
  };
};

// Identify joint segments (perpendicular to edges, connecting fingers)
const getJointSegments = (
  points: PathPoint[],
  panelWidth: number,
  panelHeight: number,
  tolerance: number = 1
): { start: PathPoint; end: PathPoint; nearEdge: EdgePosition }[] => {
  const joints: { start: PathPoint; end: PathPoint; nearEdge: EdgePosition }[] = [];
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];

    // Skip if this is an edge segment
    const edge = classifySegment(p1, p2, panelWidth, panelHeight, tolerance);
    if (edge) continue;

    // This is a joint segment - determine which edge it's near
    const avgX = (p1.x + p2.x) / 2;
    const avgY = (p1.y + p2.y) / 2;

    let nearEdge: EdgePosition = 'top';
    if (Math.abs(avgY - halfH) < tolerance * 2) nearEdge = 'top';
    else if (Math.abs(avgY + halfH) < tolerance * 2) nearEdge = 'bottom';
    else if (Math.abs(avgX + halfW) < tolerance * 2) nearEdge = 'left';
    else if (Math.abs(avgX - halfW) < tolerance * 2) nearEdge = 'right';

    joints.push({ start: p1, end: p2, nearEdge });
  }

  return joints;
};

// Grid pattern component
const GridPattern: React.FC<{
  gridSize: number;
  id: string;
  minorColor: string;
  majorColor: string;
}> = ({ gridSize, id, minorColor, majorColor }) => (
  <defs>
    <pattern
      id={id}
      width={gridSize}
      height={gridSize}
      patternUnits="userSpaceOnUse"
    >
      <path
        d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`}
        fill="none"
        stroke={minorColor}
        strokeWidth="0.5"
      />
    </pattern>
    <pattern
      id={`${id}-major`}
      width={gridSize * 10}
      height={gridSize * 10}
      patternUnits="userSpaceOnUse"
    >
      <rect width={gridSize * 10} height={gridSize * 10} fill={`url(#${id})`} />
      <path
        d={`M ${gridSize * 10} 0 L 0 0 0 ${gridSize * 10}`}
        fill="none"
        stroke={majorColor}
        strokeWidth="1"
      />
    </pattern>
  </defs>
);

// Calculate which faces a divider meets (has finger joints with)
const getDividerMeetsFaces = (
  axis: 'x' | 'y' | 'z',
  bounds: { x: number; y: number; z: number; w: number; h: number; d: number },
  containerDims: { width: number; height: number; depth: number },
  faces: Face[]
): { meetsTop: boolean; meetsBottom: boolean; meetsLeft: boolean; meetsRight: boolean } => {
  const isFaceSolid = (faceId: FaceId) => faces.find((f) => f.id === faceId)?.solid ?? false;
  const tolerance = 0.01;

  let meetsTop = false;
  let meetsBottom = false;
  let meetsLeft = false;
  let meetsRight = false;

  switch (axis) {
    case 'x':
      meetsTop = isFaceSolid('top') && bounds.y + bounds.h >= containerDims.height - tolerance;
      meetsBottom = isFaceSolid('bottom') && bounds.y <= tolerance;
      meetsLeft = isFaceSolid('back') && bounds.z <= tolerance;
      meetsRight = isFaceSolid('front') && bounds.z + bounds.d >= containerDims.depth - tolerance;
      break;
    case 'y':
      meetsTop = isFaceSolid('back') && bounds.z <= tolerance;
      meetsBottom = isFaceSolid('front') && bounds.z + bounds.d >= containerDims.depth - tolerance;
      meetsLeft = isFaceSolid('left') && bounds.x <= tolerance;
      meetsRight = isFaceSolid('right') && bounds.x + bounds.w >= containerDims.width - tolerance;
      break;
    case 'z':
      meetsTop = isFaceSolid('top') && bounds.y + bounds.h >= containerDims.height - tolerance;
      meetsBottom = isFaceSolid('bottom') && bounds.y <= tolerance;
      meetsLeft = isFaceSolid('left') && bounds.x <= tolerance;
      meetsRight = isFaceSolid('right') && bounds.x + bounds.w >= containerDims.width - tolerance;
      break;
  }

  return { meetsTop, meetsBottom, meetsLeft, meetsRight };
};

export const SketchView2D: React.FC<SketchView2DProps> = ({ className }) => {
  // Model state from engine
  const config = useEngineConfig();
  const faces = useEngineFaces();
  const rootVoid = useEngineVoidTree();
  const panelCollection = useEnginePanels();

  // UI state and actions from store
  const {
    sketchPanelId,
    exitSketchView,
    activeTool,
    setActiveTool,
    selectedCornerIds,
    selectCorner,
    selectCorners,
    clearCornerSelection,
  } = useBoxStore();

  // Get eligibility from main scene (stable during preview operations)
  // This shared hook ensures consistent behavior across 2D and 3D views
  const { corners: mainSceneCorners } = usePanelEligibility(sketchPanelId ?? undefined);

  // Editor context for operations and drafts
  const {
    mode: editorMode,
    operationId,
    operationParams,
    startOperation,
    updateParams,
    commit: commitOperation,
    cancel: cancelOperation,
    // Draft mode
    draftType,
    draftTarget,
    draftPoints,
    startDraft,
    addDraftPoint,
    updateDraftTarget,
    commit: commitDraft,
    cancel: cancelDraft,
  } = useEditor();

  // Pan and zoom state
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: 200, height: 200 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Edge interaction state
  const [hoveredEdge, setHoveredEdge] = useState<EdgePosition | null>(null);
  const [isDraggingEdge, setIsDraggingEdge] = useState(false);
  const [dragEdge, setDragEdge] = useState<EdgePosition | null>(null);
  const [dragStartPos, setDragStartPos] = useState<number>(0);
  const [dragStartExtension, setDragStartExtension] = useState<number>(0);

  // Early return if engine not initialized
  if (!config || !rootVoid) return null;

  // Get centralized colors
  const colors = getColors();

  // Corner interaction state
  const [hoveredCornerId, setHoveredCornerId] = useState<string | null>(null);
  const [palettePosition, setPalettePosition] = useState({ x: 200, y: 100 });

  // Legend hover state - which element type is being highlighted
  type LegendHighlight = 'locked-edge' | 'editable-edge' | 'boundary' | 'safe-zone' | 'corner' | 'guide-lines' | null;
  const [legendHighlight, setLegendHighlight] = useState<LegendHighlight>(null);

  // Guide lines and snapping state
  const [showGuideLines, setShowGuideLines] = useState(true);
  const [snapResult, setSnapResult] = useState<SnapResult | null>(null);

  // Chamfer/fillet operation params - extracted from editor context
  const isChamferOperationActive = operationId === 'chamfer-fillet';
  const chamferParams = isChamferOperationActive ? operationParams : {};
  const cornerFinishType = (chamferParams.type as 'chamfer' | 'fillet' | undefined) ?? 'chamfer';
  const cornerRadius = (chamferParams.radius as number | undefined) ?? 3;

  // Inset tool state - palette position only (params are in editor context)
  const [insetPalettePosition, setInsetPalettePosition] = useState({ x: 200, y: 100 });

  // Path tool state
  const [pathPalettePosition, setPathPalettePosition] = useState({ x: 200, y: 100 });
  const [isShiftHeld, setIsShiftHeld] = useState(false);
  const [polygonMode, setPolygonMode] = useState<'additive' | 'subtractive'>('subtractive');
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
  const isPathDraftActive = editorMode === 'draft' && (draftType === 'edge-path' || draftType === 'freeform-polygon');
  const isEdgePathDraft = editorMode === 'draft' && draftType === 'edge-path';
  const isPolygonDraft = editorMode === 'draft' && draftType === 'freeform-polygon';

  // Pending polygon for boolean operation selection (after polygon is closed)
  // Note: This is now only used for legacy support - new flow applies directly
  const [pendingPolygon, setPendingPolygon] = useState<{
    points: PathPoint[];
    mode: 'additive' | 'subtractive';
  } | null>(null);
  const [polygonPalettePosition, setPolygonPalettePosition] = useState({ x: 200, y: 100 });

  // Rectangle cutout tool state
  const [isDrawingRect, setIsDrawingRect] = useState(false);
  const [rectStart, setRectStart] = useState<{ x: number; y: number } | null>(null);
  const [rectCurrent, setRectCurrent] = useState<{ x: number; y: number } | null>(null);

  // Circle cutout tool state
  const [isDrawingCircle, setIsDrawingCircle] = useState(false);
  const [circleCenter, setCircleCenter] = useState<{ x: number; y: number } | null>(null);
  const [circleRadius, setCircleRadius] = useState<number>(0);

  // Additive/subtractive mode selection state
  // When a shape spans an open edge, we show a palette to let user choose mode and preview
  const [pendingAdditiveShape, setPendingAdditiveShape] = useState<{
    type: 'rect' | 'circle';
    data: { center: { x: number; y: number }; width?: number; height?: number; radius?: number };
    openEdges: EdgePosition[];
    mode: 'additive' | 'subtractive';
  } | null>(null);
  const [additiveModePosition, setAdditiveModePosition] = useState({ x: 200, y: 100 });

  // Extract inset operation params from editor context
  const isInsetOperationActive = operationId === 'inset-outset';
  const insetParams = isInsetOperationActive ? operationParams : {};
  const selectedEdges = useMemo(() => {
    const edges = (insetParams.edges as string[] | undefined) ?? [];
    // Convert "panelId:edge" format to just edge positions for this panel
    const edgeSet = new Set<EdgePosition>();
    for (const edgeKey of edges) {
      const parts = edgeKey.split(':');
      if (parts.length === 2) {
        edgeSet.add(parts[1] as EdgePosition);
      }
    }
    return edgeSet;
  }, [insetParams.edges]);
  const extensionAmount = (insetParams.offset as number | undefined) ?? 0;
  const baseExtensions = (insetParams.baseExtensions as Record<string, number> | undefined) ?? {};

  // Get the panel being edited
  const panel = useMemo(() => {
    if (!panelCollection || !sketchPanelId) return null;
    return panelCollection.panels.find(p => p.id === sketchPanelId) ?? null;
  }, [panelCollection, sketchPanelId]);

  // Get edge statuses for this panel
  const edgeStatuses = useMemo((): EdgeStatusInfo[] => {
    if (!panel) return [];

    if (panel.source.type === 'face' && panel.source.faceId) {
      return getFaceEdgeStatuses(panel.source.faceId, faces, config.assembly);
    }

    if (panel.source.type === 'divider' && panel.source.subdivisionId && panel.source.axis) {
      // Find the subdivision to get its bounds
      const subdivisions = getAllSubdivisions(rootVoid);
      const subdivision = subdivisions.find(s => s.id === panel.source.subdivisionId);

      if (subdivision) {
        const containerDims = {
          width: rootVoid.bounds.w,
          height: rootVoid.bounds.h,
          depth: rootVoid.bounds.d,
        };

        const { meetsTop, meetsBottom, meetsLeft, meetsRight } = getDividerMeetsFaces(
          panel.source.axis,
          subdivision.bounds,
          containerDims,
          faces
        );

        return getDividerEdgeStatuses(meetsTop, meetsBottom, meetsLeft, meetsRight);
      }

      // Fallback to all locked if subdivision not found
      return getDividerEdgeStatuses(true, true, true, true);
    }

    return [];
  }, [panel, faces, config.assembly, rootVoid]);

  // Get edge segments for rendering
  // IMPORTANT: Use original dimensions (without extensions) for edge classification
  // because the outline points are generated from original dims + extensions at corners
  const edgeSegments = useMemo(() => {
    if (!panel) return null;
    // panel.width/height are body dimensions (without extensions)
    return getEdgeSegments(panel.outline.points, panel.width, panel.height);
  }, [panel]);

  // Get conceptual boundary (straight lines at panel body edges)
  const conceptualBoundary = useMemo(() => {
    if (!panel) return null;
    // panel.width/height are body dimensions (without extensions)
    return getConceptualBoundary(panel.width, panel.height);
  }, [panel]);

  // Get joint segments (perpendicular parts of finger joints)
  const jointSegments = useMemo(() => {
    if (!panel) return [];
    // panel.width/height are body dimensions (without extensions)
    return getJointSegments(panel.outline.points, panel.width, panel.height);
  }, [panel]);

  // Get safe space from panel (includes exclusions and reserved regions)
  const safeSpace = useMemo((): SafeSpaceRegion | null => {
    if (!panel) return null;
    const ss = panel.safeSpace ?? null;
    debug('safe-space', `SketchView2D: panel=${panel.source.faceId || panel.source.axis} dims=${panel.width}x${panel.height}`);
    debug('safe-space', `  edgeExtensions: top=${panel.edgeExtensions?.top ?? 0}, bottom=${panel.edgeExtensions?.bottom ?? 0}, left=${panel.edgeExtensions?.left ?? 0}, right=${panel.edgeExtensions?.right ?? 0}`);
    if (ss) {
      debug('safe-space', `  safeSpace outline bounds: x[${Math.min(...ss.outline.map(p => p.x))},${Math.max(...ss.outline.map(p => p.x))}] y[${Math.min(...ss.outline.map(p => p.y))},${Math.max(...ss.outline.map(p => p.y))}]`);
      debug('safe-space', `  resultPaths count: ${ss.resultPaths.length}`);
      if (ss.resultPaths.length > 0) {
        const allMinY = Math.min(...ss.resultPaths.flatMap(p => p.map(pt => pt.y)));
        const allMaxY = Math.max(...ss.resultPaths.flatMap(p => p.map(pt => pt.y)));
        debug('safe-space', `  resultPaths Y range: [${allMinY}, ${allMaxY}]`);
      }
    } else {
      debug('safe-space', `  NO safeSpace on panel!`);
    }
    return ss;
  }, [panel]);

  // Compute edge margins for path analysis (which edges have joints)
  const edgeMargins = useMemo((): Record<EdgePosition, number> | null => {
    if (!panel) return null;

    if (panel.source.type === 'face' && panel.source.faceId) {
      // Convert faces (Face[]) to FaceConfig[] for the function
      const faceConfigs: FaceConfig[] = faces.map(f => ({ id: f.id, solid: f.solid }));
      return getEdgeMarginsForFace(panel.source.faceId, faceConfigs, config.materialThickness);
    }

    // Divider panels have joints on all edges
    const margin = config.materialThickness * 2;
    return { top: margin, bottom: margin, left: margin, right: margin };
  }, [panel, faces, config.materialThickness]);

  // Compute guide lines from panel geometry
  const guideLines = useMemo((): GuideLine[] => {
    if (!panel) return [];
    return computeGuideLines(panel.width, panel.height, panel.outline.points);
  }, [panel]);

  // Compute snap points from outline vertices (for point snapping)
  const snapPoints = useMemo((): SnapPoint[] => {
    if (!panel) return [];
    return computeSnapPoints(panel.outline.points);
  }, [panel]);

  // Compute edge segments for edge snapping (uses same classification tolerance as edgeSegments)
  const snapEdgeSegments = useMemo((): EdgeSegment[] => {
    if (!panel) return [];
    return computeEdgeSegments(panel.outline.points, panel.width, panel.height);
  }, [panel]);

  // Detect corners for potential finishing
  // Uses usePanelEligibility hook which reads from MAIN scene (not preview)
  // This ensures corners remain selectable even after fillets are applied to preview
  const detectedCorners = useMemo((): DetectedCorner[] => {
    if (!panel) return [];

    // mainSceneCorners comes from usePanelEligibility hook (stable during operations)
    // Fall back to panel's own eligibility data if hook returns empty
    const allCornerEligibility = mainSceneCorners.length > 0
      ? mainSceneCorners
      : panel.allCornerEligibility ?? [];

    if (allCornerEligibility.length > 0) {
      // Convert AllCornerEligibility to DetectedCorner format
      // We need to compute edge lengths from the outline points
      const outlinePoints = panel.outline.points;

      return allCornerEligibility.map(corner => {
        // Compute edge lengths for this corner
        let incomingEdgeLength = 0;
        let outgoingEdgeLength = 0;

        if (corner.location === 'outline') {
          const n = outlinePoints.length;
          const idx = corner.pathIndex;
          const prevIdx = (idx - 1 + n) % n;
          const nextIdx = (idx + 1) % n;

          const prev = outlinePoints[prevIdx];
          const curr = outlinePoints[idx];
          const next = outlinePoints[nextIdx];

          incomingEdgeLength = Math.sqrt(
            Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2)
          );
          outgoingEdgeLength = Math.sqrt(
            Math.pow(next.x - curr.x, 2) + Math.pow(next.y - curr.y, 2)
          );
        }

        return {
          id: corner.id,
          index: corner.pathIndex,
          position: { x: corner.position.x, y: corner.position.y },
          angle: corner.angle,
          eligible: corner.eligible,
          maxRadius: corner.maxRadius,
          incomingEdgeLength,
          outgoingEdgeLength,
        };
      });
    }

    // Fallback to basic 4-corner detection if allCornerEligibility not available
    const ext = panel.edgeExtensions ?? { top: 0, bottom: 0, left: 0, right: 0 };
    const halfW = panel.width / 2;
    const halfH = panel.height / 2;
    const leftX = -halfW - ext.left;
    const rightX = halfW + ext.right;
    const topY = halfH + ext.top;
    const bottomY = -halfH - ext.bottom;
    const totalWidth = panel.width + ext.left + ext.right;
    const totalHeight = panel.height + ext.top + ext.bottom;
    const maxRadius = Math.min(totalWidth, totalHeight) * 0.3;

    return [
      {
        id: 'corner-tl',
        index: 0,
        position: { x: leftX, y: topY },
        angle: Math.PI / 2,
        eligible: true,
        maxRadius,
        incomingEdgeLength: totalWidth,
        outgoingEdgeLength: totalHeight,
      },
      {
        id: 'corner-tr',
        index: 1,
        position: { x: rightX, y: topY },
        angle: Math.PI / 2,
        eligible: true,
        maxRadius,
        incomingEdgeLength: totalHeight,
        outgoingEdgeLength: totalWidth,
      },
      {
        id: 'corner-br',
        index: 2,
        position: { x: rightX, y: bottomY },
        angle: Math.PI / 2,
        eligible: true,
        maxRadius,
        incomingEdgeLength: totalWidth,
        outgoingEdgeLength: totalHeight,
      },
      {
        id: 'corner-bl',
        index: 3,
        position: { x: leftX, y: bottomY },
        angle: Math.PI / 2,
        eligible: true,
        maxRadius,
        incomingEdgeLength: totalHeight,
        outgoingEdgeLength: totalWidth,
      },
    ];
  }, [panel, mainSceneCorners]);

  // Calculate adjacent panel side profiles for visualization
  // Shows cross-section of adjacent panels at each edge
  interface AdjacentPanelProfile {
    edge: EdgePosition;
    exists: boolean;
    materialThickness: number;
    panelDepth: number;  // How far the adjacent panel extends (perpendicular to this panel)
    extension: number;   // Any extension the adjacent panel has on this edge direction
    faceId: FaceId | null;
  }

  const adjacentPanelProfiles = useMemo((): AdjacentPanelProfile[] => {
    if (!panel || panel.source.type !== 'face') return [];

    const faceId = panel.source.faceId;
    if (!faceId) return [];

    const materialThickness = config.materialThickness;

    // Map edge positions to adjacent faces
    const edgeToAdjacentFace: Record<EdgePosition, FaceId | null> = {
      top: null,
      bottom: null,
      left: null,
      right: null,
    };

    // Determine adjacent faces based on current face orientation
    // Front/back faces: left/right edges connect to left/right panels, top/bottom to top/bottom
    // Left/right faces: left/right edges connect to back/front panels, top/bottom to top/bottom
    // Top/bottom faces: edges connect to front/back/left/right depending on orientation
    switch (faceId) {
      case 'front':
        edgeToAdjacentFace.top = 'top';
        edgeToAdjacentFace.bottom = 'bottom';
        edgeToAdjacentFace.left = 'left';
        edgeToAdjacentFace.right = 'right';
        break;
      case 'back':
        edgeToAdjacentFace.top = 'top';
        edgeToAdjacentFace.bottom = 'bottom';
        edgeToAdjacentFace.left = 'right';  // Flipped from front
        edgeToAdjacentFace.right = 'left';
        break;
      case 'left':
        edgeToAdjacentFace.top = 'top';
        edgeToAdjacentFace.bottom = 'bottom';
        edgeToAdjacentFace.left = 'back';
        edgeToAdjacentFace.right = 'front';
        break;
      case 'right':
        edgeToAdjacentFace.top = 'top';
        edgeToAdjacentFace.bottom = 'bottom';
        edgeToAdjacentFace.left = 'front';
        edgeToAdjacentFace.right = 'back';
        break;
      case 'top':
        edgeToAdjacentFace.top = 'back';
        edgeToAdjacentFace.bottom = 'front';
        edgeToAdjacentFace.left = 'left';
        edgeToAdjacentFace.right = 'right';
        break;
      case 'bottom':
        edgeToAdjacentFace.top = 'front';
        edgeToAdjacentFace.bottom = 'back';
        edgeToAdjacentFace.left = 'left';
        edgeToAdjacentFace.right = 'right';
        break;
    }

    return (['top', 'bottom', 'left', 'right'] as EdgePosition[]).map(edge => {
      const adjFaceId = edgeToAdjacentFace[edge];
      const adjFace = adjFaceId ? faces.find(f => f.id === adjFaceId) : null;
      const adjPanel = adjFaceId && panelCollection
        ? panelCollection.panels.find(p => p.source.faceId === adjFaceId)
        : null;

      if (!adjFace || !adjFace.solid || !adjPanel) {
        return {
          edge,
          exists: false,
          materialThickness: 0,
          panelDepth: 0,
          extension: 0,
          faceId: adjFaceId,
        };
      }

      // Get the extension of the adjacent panel on the edge that faces this panel
      // We need to figure out which edge of the adjacent panel connects to this panel
      let adjExtension = 0;
      const adjExt = adjPanel.edgeExtensions ?? { top: 0, bottom: 0, left: 0, right: 0 };

      // Map: which edge of the adjacent panel connects back to this panel
      // This is complex and depends on the specific face relationships
      // For now, use the same edge direction as a simplification
      switch (edge) {
        case 'top':
        case 'bottom':
          adjExtension = adjExt[edge] ?? 0;
          break;
        case 'left':
        case 'right':
          adjExtension = adjExt[edge] ?? 0;
          break;
      }

      // Panel depth is the dimension perpendicular to this panel
      // For most cases, this is related to the box depth/width/height
      let panelDepth = materialThickness; // Default to just showing material thickness
      if (edge === 'top' || edge === 'bottom') {
        // Vertical adjacent panels - depth is the perpendicular dimension
        panelDepth = faceId === 'front' || faceId === 'back' ? config.depth : config.width;
      } else {
        // Horizontal adjacent panels
        panelDepth = faceId === 'left' || faceId === 'right' ? config.depth : config.width;
      }

      return {
        edge,
        exists: true,
        materialThickness,
        panelDepth,
        extension: adjExtension,
        faceId: adjFaceId,
      };
    });
  }, [panel, faces, panelCollection, config]);

  // Check if an edge is editable (unlocked or outward-only)
  const isEdgeEditable = useCallback((edge: EdgePosition): boolean => {
    const status = edgeStatuses.find(e => e.position === edge);
    return status?.status !== 'locked';
  }, [edgeStatuses]);

  // Convert SVG coordinates to edge-relative (t, offset) coordinates
  // t: 0-1 along edge from start to end
  // offset: perpendicular distance from edge (positive = outward)
  const svgToEdgeCoords = useCallback((svgX: number, svgY: number, edge: EdgePosition): { t: number; offset: number } | null => {
    if (!panel) return null;

    const halfW = panel.width / 2;
    const halfH = panel.height / 2;

    let t: number;
    let offset: number;

    switch (edge) {
      case 'top':
        // Top edge: left to right, positive y is outward
        t = (svgX + halfW) / panel.width;
        offset = svgY - halfH;
        break;
      case 'bottom':
        // Bottom edge: left to right, negative y is outward
        t = (svgX + halfW) / panel.width;
        offset = -(svgY + halfH);
        break;
      case 'left':
        // Left edge: bottom to top, negative x is outward
        t = (svgY + halfH) / panel.height;
        offset = -(svgX + halfW);
        break;
      case 'right':
        // Right edge: bottom to top, positive x is outward
        t = (svgY + halfH) / panel.height;
        offset = svgX - halfW;
        break;
      default:
        return null;
    }

    // Clamp t to [0, 1]
    t = Math.max(0, Math.min(1, t));

    return { t, offset };
  }, [panel]);

  // Convert edge-relative coordinates back to SVG coordinates for preview
  const edgeCoordsToSvg = useCallback((t: number, offset: number, edge: EdgePosition): { x: number; y: number } | null => {
    if (!panel) return null;

    const halfW = panel.width / 2;
    const halfH = panel.height / 2;

    switch (edge) {
      case 'top':
        return { x: t * panel.width - halfW, y: halfH + offset };
      case 'bottom':
        return { x: t * panel.width - halfW, y: -halfH - offset };
      case 'left':
        return { x: -halfW - offset, y: t * panel.height - halfH };
      case 'right':
        return { x: halfW + offset, y: t * panel.height - halfH };
      default:
        return null;
    }
  }, [panel]);

  // Handle tool change
  const handleToolChange = useCallback((tool: EditorTool) => {
    // Cancel active operations when switching away from their tools
    if (tool !== 'inset' && isInsetOperationActive) {
      cancelOperation();
    }
    if (tool !== 'chamfer' && isChamferOperationActive) {
      cancelOperation();
    }
    if (tool !== 'path' && isPathDraftActive) {
      cancelDraft();
    }
    setActiveTool(tool);
    // Clear corner selection when switching away from chamfer tool
    if (tool !== 'chamfer') {
      clearCornerSelection();
    }
  }, [setActiveTool, clearCornerSelection, isInsetOperationActive, isChamferOperationActive, isPathDraftActive, cancelOperation, cancelDraft]);

  // Find which corner (if any) is near a point
  const findCornerAtPoint = useCallback((svgX: number, svgY: number): DetectedCorner | null => {
    if (activeTool !== 'chamfer') return null;

    const hitDistance = Math.max(10, viewBox.width / 20); // Scale hit area with zoom - made larger

    for (const corner of detectedCorners) {
      if (!corner.eligible) continue;
      const dx = svgX - corner.position.x;
      const dy = svgY - corner.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      debug('corner-click', `Corner ${corner.id}: pos(${corner.position.x.toFixed(1)}, ${corner.position.y.toFixed(1)}), mouse(${svgX.toFixed(1)}, ${svgY.toFixed(1)}), dist: ${dist.toFixed(1)}, hitDist: ${hitDistance.toFixed(1)}`);
      if (dist < hitDistance) {
        return corner;
      }
    }
    return null;
  }, [activeTool, detectedCorners, viewBox.width]);

  // Handle corner click - toggle selection and update operation
  const handleCornerClick = useCallback((corner: DetectedCorner, event: React.MouseEvent) => {
    // Always toggle - makes multi-select easy
    selectCorner(corner.id, true);

    // Position the floating palette near the click
    setPalettePosition({ x: event.clientX + 20, y: event.clientY - 50 });

    // Start operation if not already active
    if (!isChamferOperationActive && panel) {
      startOperation('chamfer-fillet');
    }

    // Get the new selected corners after toggle
    const newCorners = selectedCornerIds.has(corner.id)
      ? Array.from(selectedCornerIds).filter(id => id !== corner.id)
      : [...Array.from(selectedCornerIds), corner.id];

    // Update operation params with current selection
    if (panel) {
      updateParams({
        panelId: panel.id,
        corners: newCorners,
        radius: cornerRadius,
        type: cornerFinishType,
      });
    }
  }, [selectCorner, isChamferOperationActive, panel, selectedCornerIds, cornerRadius, cornerFinishType, startOperation, updateParams]);

  // Toggle edge selection for inset tool - uses operation system
  const toggleEdgeSelection = useCallback((edge: EdgePosition) => {
    if (!panel) return;

    // Build edge key in "panelId:edge" format
    const edgeKey = `${panel.id}:${edge}`;

    // Get current edges from params
    const currentEdges = (insetParams.edges as string[] | undefined) ?? [];

    // Toggle the edge in the array
    let newEdges: string[];
    if (currentEdges.includes(edgeKey)) {
      newEdges = currentEdges.filter(e => e !== edgeKey);
    } else {
      newEdges = [...currentEdges, edgeKey];
    }

    // Capture base extension values for newly selected edges
    const newBaseExtensions = { ...baseExtensions };
    for (const key of newEdges) {
      if (!(key in newBaseExtensions)) {
        const parts = key.split(':');
        if (parts.length === 2) {
          const edgePos = parts[1] as EdgePosition;
          newBaseExtensions[key] = panel.edgeExtensions?.[edgePos] ?? 0;
        }
      }
    }

    // Start operation if not already active
    if (!isInsetOperationActive) {
      startOperation('inset-outset');
    }

    // Update params
    updateParams({
      edges: newEdges,
      offset: extensionAmount,
      baseExtensions: newBaseExtensions,
    });
  }, [panel, insetParams.edges, baseExtensions, extensionAmount, isInsetOperationActive, startOperation, updateParams]);

  // Apply extension to all selected edges - commits the operation
  const handleApplyExtension = useCallback(() => {
    if (!isInsetOperationActive || selectedEdges.size === 0) return;
    commitOperation();
    setActiveTool('select');
  }, [isInsetOperationActive, selectedEdges.size, commitOperation, setActiveTool]);

  // Clear extension from selected edges (set offset so final value is 0)
  const handleClearExtension = useCallback(() => {
    if (!isInsetOperationActive || selectedEdges.size === 0 || !panel) return;

    // To reset edges to 0, we need to set offset such that base + offset = 0
    // But different edges might have different bases, so we need to handle this specially
    // The simplest approach: set all base values to their current extensions and offset to negative of first one
    // Actually, let's just update the base extensions to 0 for all and offset to 0
    const edges = (insetParams.edges as string[] | undefined) ?? [];
    const zeroBaseExtensions: Record<string, number> = {};
    for (const edgeKey of edges) {
      zeroBaseExtensions[edgeKey] = 0;
    }

    // Calculate what offset would make them all 0 from their current values
    // Since we want final = 0 and final = base + offset, we set base = 0 and offset = 0
    updateParams({
      edges,
      offset: 0,
      baseExtensions: zeroBaseExtensions,
    });
  }, [isInsetOperationActive, selectedEdges.size, panel, insetParams.edges, updateParams]);

  // Create a rectangle cutout or edge path from the drawn rectangle
  const handleCreateRectCutout = useCallback(() => {
    if (!rectStart || !rectCurrent || !panel) return;

    const engine = getEngine();
    if (!engine) return;

    // Calculate rectangle bounds
    const minX = Math.min(rectStart.x, rectCurrent.x);
    const maxX = Math.max(rectStart.x, rectCurrent.x);
    const minY = Math.min(rectStart.y, rectCurrent.y);
    const maxY = Math.max(rectStart.y, rectCurrent.y);

    const width = maxX - minX;
    const height = maxY - minY;

    // Don't create tiny shapes
    if (width < 1 || height < 1) return;

    const center = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
    };

    // Convert rectangle to path points for analysis
    const rectPoints: PathPoint[] = [
      { x: minX, y: maxY },  // top-left
      { x: maxX, y: maxY },  // top-right
      { x: maxX, y: minY },  // bottom-right
      { x: minX, y: minY },  // bottom-left
    ];

    // Analyze the path to determine how to handle it
    if (safeSpace && edgeMargins) {
      const analysis = analyzePath(rectPoints, safeSpace, edgeMargins, panel.width, panel.height, panel.edgeExtensions);

      // Check if shape touches an open edge (body edge of an edge without joints)
      const touchesOpenEdge = analysis.borderedEdges.some(e =>
        edgeMargins[e] === 0 && analysis.openEdgesSpanned.includes(e)
      );

      // Edge path candidates:
      // 1. Touches safe space border (inner edge of joint margin on closed edge)
      // 2. Touches body edge of open edge but doesn't extend beyond (subtractive notch)
      const isEdgePathCandidate =
        (analysis.touchesSafeSpaceBorder && analysis.borderedEdges.length > 0 && !analysis.touchesClosedEdge) ||
        (touchesOpenEdge && !analysis.spansOpenEdge && !analysis.touchesClosedEdge);

      if (isEdgePathCandidate) {
        // Find the bordered edge to use (prefer open edges for clarity)
        const borderedEdge = analysis.borderedEdges.find(e => edgeMargins[e] === 0) || analysis.borderedEdges[0];
        const edgePath = rectToEdgePath(
          minX, maxX, minY, maxY,
          borderedEdge,
          panel.width,
          panel.height
        );

        if (edgePath) {
          engine.dispatch({
            type: 'SET_EDGE_PATH',
            targetId: 'main-assembly',
            payload: {
              panelId: panel.id,
              path: edgePath,
            },
          });
          notifyEngineStateChanged();
          console.log('Created edge path for', borderedEdge, 'edge');
        }

        setIsDrawingRect(false);
        setRectStart(null);
        setRectCurrent(null);
        return;
      }

      // If wholly in safe space, create as cutout
      if (analysis.whollyInSafeSpace) {
        // Validate against safe space (redundant but explicit)
        if (!isRectInSafeSpace(center.x, center.y, width, height, safeSpace)) {
          console.warn('Cutout rejected: rectangle is outside safe space');
          setIsDrawingRect(false);
          setRectStart(null);
          setRectCurrent(null);
          return;
        }
      } else if (!analysis.spansOpenEdge) {
        // Not wholly in safe space and not spanning open edge - reject
        console.warn('Cutout rejected: rectangle extends into joint region');
        setIsDrawingRect(false);
        setRectStart(null);
        setRectCurrent(null);
        return;
      }

      // If spans open edge, show additive/subtractive mode palette with preview
      if (analysis.spansOpenEdge) {
        console.log('Rectangle spans open edge - showing mode palette for:', analysis.openEdgesSpanned);
        setPendingAdditiveShape({
          type: 'rect',
          data: { center, width, height },
          openEdges: analysis.openEdgesSpanned,
          mode: 'subtractive', // Default to subtractive
        });
        // Reset drawing state but keep pending shape for preview
        setIsDrawingRect(false);
        setRectStart(null);
        setRectCurrent(null);
        return;
      }
    } else {
      // Fallback: validate against safe space directly
      if (safeSpace && !isRectInSafeSpace(center.x, center.y, width, height, safeSpace)) {
        console.warn('Cutout rejected: rectangle is outside safe space');
        setIsDrawingRect(false);
        setRectStart(null);
        setRectCurrent(null);
        return;
      }
    }

    // Create cutout
    const cutout = {
      id: crypto.randomUUID(),
      type: 'rect' as const,
      center,
      width,
      height,
    };

    engine.dispatch({
      type: 'ADD_CUTOUT',
      targetId: 'main-assembly',
      payload: {
        panelId: panel.id,
        cutout,
      },
    });

    // Notify React about the state change
    notifyEngineStateChanged();

    // Reset drawing state
    setIsDrawingRect(false);
    setRectStart(null);
    setRectCurrent(null);
  }, [rectStart, rectCurrent, panel, safeSpace, edgeMargins]);

  // Create a circle cutout or edge path from the drawn circle
  const handleCreateCircleCutout = useCallback(() => {
    if (!circleCenter || circleRadius < 1 || !panel) return;

    const engine = getEngine();
    if (!engine) return;

    // Convert circle to path points for analysis (sample 16 points around perimeter)
    const numSamples = 16;
    const circlePoints: PathPoint[] = [];
    for (let i = 0; i < numSamples; i++) {
      const angle = (i / numSamples) * Math.PI * 2;
      circlePoints.push({
        x: circleCenter.x + circleRadius * Math.cos(angle),
        y: circleCenter.y + circleRadius * Math.sin(angle),
      });
    }

    // Analyze the path to determine how to handle it
    if (safeSpace && edgeMargins) {
      const analysis = analyzePath(circlePoints, safeSpace, edgeMargins, panel.width, panel.height, panel.edgeExtensions);

      // Check if shape touches an open edge (body edge of an edge without joints)
      const touchesOpenEdge = analysis.borderedEdges.some(e =>
        edgeMargins[e] === 0 && analysis.openEdgesSpanned.includes(e)
      );

      // Edge path candidates:
      // 1. Touches safe space border (inner edge of joint margin on closed edge)
      // 2. Touches body edge of open edge but doesn't extend beyond (subtractive notch)
      const isEdgePathCandidate =
        (analysis.touchesSafeSpaceBorder && analysis.borderedEdges.length > 0 && !analysis.touchesClosedEdge) ||
        (touchesOpenEdge && !analysis.spansOpenEdge && !analysis.touchesClosedEdge);

      if (isEdgePathCandidate) {
        // Find the bordered edge to use (prefer open edges for clarity)
        const borderedEdge = analysis.borderedEdges.find(e => edgeMargins[e] === 0) || analysis.borderedEdges[0];
        const edgePath = circleToEdgePath(
          circleCenter.x,
          circleCenter.y,
          circleRadius,
          borderedEdge,
          panel.width,
          panel.height
        );

        if (edgePath) {
          engine.dispatch({
            type: 'SET_EDGE_PATH',
            targetId: 'main-assembly',
            payload: {
              panelId: panel.id,
              path: edgePath,
            },
          });
          notifyEngineStateChanged();
          console.log('Created edge path for', borderedEdge, 'edge');
        }

        setIsDrawingCircle(false);
        setCircleCenter(null);
        setCircleRadius(0);
        return;
      }

      // If wholly in safe space, create as cutout
      if (analysis.whollyInSafeSpace) {
        // Validate against safe space (redundant but explicit)
        if (!isCircleInSafeSpace(circleCenter.x, circleCenter.y, circleRadius, safeSpace)) {
          console.warn('Cutout rejected: circle is outside safe space');
          setIsDrawingCircle(false);
          setCircleCenter(null);
          setCircleRadius(0);
          return;
        }
      } else if (!analysis.spansOpenEdge) {
        // Not wholly in safe space and not spanning open edge - reject
        console.warn('Cutout rejected: circle extends into joint region');
        setIsDrawingCircle(false);
        setCircleCenter(null);
        setCircleRadius(0);
        return;
      }

      // If spans open edge, show additive/subtractive mode palette with preview
      if (analysis.spansOpenEdge) {
        console.log('Circle spans open edge - showing mode palette for:', analysis.openEdgesSpanned);
        setPendingAdditiveShape({
          type: 'circle',
          data: { center: circleCenter, radius: circleRadius },
          openEdges: analysis.openEdgesSpanned,
          mode: 'subtractive', // Default to subtractive
        });
        // Reset drawing state but keep pending shape for preview
        setIsDrawingCircle(false);
        setCircleCenter(null);
        setCircleRadius(0);
        return;
      }
    } else {
      // Fallback: validate against safe space directly
      if (safeSpace && !isCircleInSafeSpace(circleCenter.x, circleCenter.y, circleRadius, safeSpace)) {
        console.warn('Cutout rejected: circle is outside safe space');
        setIsDrawingCircle(false);
        setCircleCenter(null);
        setCircleRadius(0);
        return;
      }
    }

    // Create cutout
    const cutout = {
      id: crypto.randomUUID(),
      type: 'circle' as const,
      center: circleCenter,
      radius: circleRadius,
    };

    engine.dispatch({
      type: 'ADD_CUTOUT',
      targetId: 'main-assembly',
      payload: {
        panelId: panel.id,
        cutout,
      },
    });

    // Notify React about the state change
    notifyEngineStateChanged();

    // Reset drawing state
    setIsDrawingCircle(false);
    setCircleCenter(null);
    setCircleRadius(0);
  }, [circleCenter, circleRadius, panel, safeSpace, edgeMargins]);

  // Toggle the mode for the pending additive shape
  const handleAdditiveModeToggle = useCallback((mode: 'additive' | 'subtractive') => {
    if (!pendingAdditiveShape) return;
    setPendingAdditiveShape({
      ...pendingAdditiveShape,
      mode,
    });
  }, [pendingAdditiveShape]);

  // Apply the pending additive shape with the selected mode
  // Uses boolean polygon operations (union/difference) for robust edge modification
  const handleAdditiveModeApply = useCallback(() => {
    if (!pendingAdditiveShape || !panel) {
      setPendingAdditiveShape(null);
      return;
    }

    const engine = getEngine();
    if (!engine) {
      setPendingAdditiveShape(null);
      return;
    }

    const { type, data, mode } = pendingAdditiveShape;

    // Convert shape to polygon for boolean operation
    let shapePolygon: { x: number; y: number }[] | null = null;

    if (type === 'rect' && data.width !== undefined && data.height !== undefined) {
      // Calculate rect bounds
      const minX = data.center.x - data.width / 2;
      const maxX = data.center.x + data.width / 2;
      const minY = data.center.y - data.height / 2;
      const maxY = data.center.y + data.height / 2;

      shapePolygon = createRectPolygon(minX, minY, maxX, maxY);
    } else if (type === 'circle' && data.radius !== undefined) {
      // Approximate circle as polygon (32 segments)
      shapePolygon = createCirclePolygon(data.center.x, data.center.y, data.radius, 32);
    }

    if (shapePolygon) {
      // Use boolean operation: union for additive, difference for subtractive
      const operation = mode === 'additive' ? 'union' : 'difference';

      const success = engine.dispatch({
        type: 'APPLY_EDGE_OPERATION',
        targetId: 'main-assembly',
        payload: {
          panelId: panel.id,
          operation,
          shape: shapePolygon,
        },
      });

      if (success) {
        console.log(`Applied ${mode} boolean operation to panel edge`);
      } else {
        console.warn(`Could not apply ${mode} operation - boolean operation failed`);
      }
    }

    notifyEngineStateChanged();
    setPendingAdditiveShape(null);
  }, [pendingAdditiveShape, panel]);

  // Cancel pending additive shape
  const handleAdditiveModeCancel = useCallback(() => {
    setPendingAdditiveShape(null);
  }, []);

  // Convert screen coordinates to SVG coordinates
  // Accounts for preserveAspectRatio="xMidYMid meet" (the default) which centers content
  const screenToSvg = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;

    const rect = svg.getBoundingClientRect();

    // Calculate aspect ratios
    const svgAspect = rect.width / rect.height;
    const viewBoxAspect = viewBox.width / viewBox.height;

    // Calculate the actual rendered area within the SVG element
    // With "xMidYMid meet", the viewBox is scaled uniformly and centered
    let renderWidth: number;
    let renderHeight: number;
    let offsetX: number;
    let offsetY: number;

    if (svgAspect > viewBoxAspect) {
      // SVG is wider than viewBox - content is centered horizontally
      renderHeight = rect.height;
      renderWidth = rect.height * viewBoxAspect;
      offsetX = (rect.width - renderWidth) / 2;
      offsetY = 0;
    } else {
      // SVG is taller than viewBox - content is centered vertically
      renderWidth = rect.width;
      renderHeight = rect.width / viewBoxAspect;
      offsetX = 0;
      offsetY = (rect.height - renderHeight) / 2;
    }

    // Map screen coordinates to viewBox coordinates, accounting for offset
    const localX = clientX - rect.left - offsetX;
    const localY = clientY - rect.top - offsetY;

    // Convert to viewBox coordinates
    const x = (localX / renderWidth) * viewBox.width + viewBox.x;
    // Note: Y is flipped in our rendering via scale(1, -1)
    const y = -((localY / renderHeight) * viewBox.height + viewBox.y);

    debug('corner-click', `screenToSvg: client(${clientX.toFixed(0)}, ${clientY.toFixed(0)}) offset(${offsetX.toFixed(0)}, ${offsetY.toFixed(0)}) render(${renderWidth.toFixed(0)}x${renderHeight.toFixed(0)}) => svg(${x.toFixed(1)}, ${y.toFixed(1)})`);

    return { x, y };
  }, [viewBox]);

  // Find which edge (if any) is near a point
  const findEdgeAtPoint = useCallback((svgX: number, svgY: number): EdgePosition | null => {
    if (!edgeSegments || !panel) {
      debug('path-tool', `findEdgeAtPoint: edgeSegments=${!!edgeSegments}, panel=${!!panel}`);
      return null;
    }

    const hitDistance = Math.max(4, viewBox.width / 50); // D2 fix: smaller hit area to avoid false edge detection
    debug('path-tool', `findEdgeAtPoint: hitDistance=${hitDistance.toFixed(1)}, viewBox.width=${viewBox.width.toFixed(1)}`);

    for (const edge of ['top', 'bottom', 'left', 'right'] as EdgePosition[]) {
      const segments = edgeSegments[edge];
      for (const seg of segments) {
        const dist = distanceToSegment(svgX, svgY, seg.start.x, seg.start.y, seg.end.x, seg.end.y);
        debug('path-tool', `  ${edge} segment (${seg.start.x.toFixed(1)},${seg.start.y.toFixed(1)})-(${seg.end.x.toFixed(1)},${seg.end.y.toFixed(1)}): dist=${dist.toFixed(1)}`);
        if (dist < hitDistance) {
          return edge;
        }
      }
    }

    return null;
  }, [edgeSegments, panel, viewBox.width]);

  // Initialize viewBox based on panel dimensions
  useEffect(() => {
    if (panel) {
      const padding = 20;
      const width = panel.width + padding * 2;
      const height = panel.height + padding * 2;
      setViewBox({
        x: -panel.width / 2 - padding,
        y: -panel.height / 2 - padding,
        width,
        height,
      });
    }
  }, [panel?.id]);

  // Handle mouse wheel for zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const scaleFactor = e.deltaY > 0 ? 1.1 : 0.9;

    const svg = svgRef.current;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * viewBox.width + viewBox.x;
    const mouseY = ((e.clientY - rect.top) / rect.height) * viewBox.height + viewBox.y;

    const newWidth = viewBox.width * scaleFactor;
    const newHeight = viewBox.height * scaleFactor;
    const newX = mouseX - (mouseX - viewBox.x) * scaleFactor;
    const newY = mouseY - (mouseY - viewBox.y) * scaleFactor;

    setViewBox({ x: newX, y: newY, width: newWidth, height: newHeight });
  }, [viewBox]);

  // Handle mouse down
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;

    const svgPos = screenToSvg(e.clientX, e.clientY);
    if (!svgPos) return;

    // Check for corner click when chamfer tool is active
    if (activeTool === 'chamfer') {
      const corner = findCornerAtPoint(svgPos.x, svgPos.y);
      if (corner) {
        handleCornerClick(corner, e);
        return;
      }
    }

    // Path tool: add points or start new draft
    if (activeTool === 'path' && panel) {
      const hitThreshold = Math.max(8, viewBox.width / 25);
      const halfW = panel.width / 2;
      const halfH = panel.height / 2;
      debug('path-tool', `Path tool click at SVG(${svgPos.x.toFixed(1)}, ${svgPos.y.toFixed(1)})`);

      // Already in a draft - add a point
      if (isPathDraftActive) {
        if (isEdgePathDraft && draftTarget?.edge) {
          // Edge path mode: check if clicking back on the boundary to merge
          const edge = draftTarget.edge;
          const distToBoundary = edge === 'top' ? Math.abs(svgPos.y - halfH) :
                                 edge === 'bottom' ? Math.abs(svgPos.y + halfH) :
                                 edge === 'left' ? Math.abs(svgPos.x + halfW) :
                                 Math.abs(svgPos.x - halfW);

          // If clicking back on the boundary (and we have at least 2 points), this is a merge
          if (distToBoundary < hitThreshold && draftPoints.length >= 2) {
            debug('path-tool', 'Merge detected! Adding final point on boundary');
            // Add the merge point - snap to the current edge path value at this t position
            const mergeCoords = svgToEdgeCoords(svgPos.x, svgPos.y, edge);
            if (mergeCoords && panel) {
              const currentOffset = getEdgePathOffsetAtT(
                panel.customEdgePaths ?? [],
                edge,
                mergeCoords.t
              );
              addDraftPoint({ x: mergeCoords.t, y: currentOffset });
            }
            // Path is now ready to apply - user can click Apply button
            return;
          }

          // Normal point addition - convert to edge-relative coordinates
          const edgeCoords = svgToEdgeCoords(svgPos.x, svgPos.y, edge);
          debug('path-tool', `Adding edge point: ${JSON.stringify(edgeCoords)}`);
          if (edgeCoords) {
            addDraftPoint({ x: edgeCoords.t, y: edgeCoords.offset });
          }
        } else if (isPolygonDraft) {
          // Polygon mode: check if clicking near start point to close
          if (draftPoints.length >= 3) {
            const startPoint = draftPoints[0];
            const distToStart = Math.sqrt(
              (svgPos.x - startPoint.x) ** 2 + (svgPos.y - startPoint.y) ** 2
            );
            if (distToStart < hitThreshold) {
              // Close the polygon and apply the operation directly
              debug('path-tool', 'Closing polygon - applying operation');
              const engine = getEngine();
              if (engine && panel) {
                const points = [...draftPoints];
                const halfW = panel.width / 2;
                const halfH = panel.height / 2;
                const panelOutline = createRectPolygon(-halfW, -halfH, halfW, halfH);
                const classification = classifyPolygon(points, panelOutline, 1.0);

                let success = false;

                if (classification === 'interior') {
                  if (polygonMode === 'subtractive') {
                    const centerX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
                    const centerY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
                    const relativePoints = points.map(p => ({
                      x: p.x - centerX,
                      y: p.y - centerY,
                    }));

                    success = engine.dispatch({
                      type: 'ADD_CUTOUT',
                      targetId: 'main-assembly',
                      payload: {
                        panelId: panel.id,
                        cutout: {
                          id: crypto.randomUUID(),
                          type: 'path',
                          center: { x: centerX, y: centerY },
                          points: relativePoints,
                        },
                      },
                    });
                  }
                } else if (classification === 'boundary') {
                  const operation = polygonMode === 'additive' ? 'union' : 'difference';
                  success = engine.dispatch({
                    type: 'APPLY_EDGE_OPERATION',
                    targetId: 'main-assembly',
                    payload: {
                      panelId: panel.id,
                      operation,
                      shape: points,
                    },
                  });
                } else if (classification === 'exterior' && polygonMode === 'additive') {
                  success = engine.dispatch({
                    type: 'APPLY_EDGE_OPERATION',
                    targetId: 'main-assembly',
                    payload: {
                      panelId: panel.id,
                      operation: 'union',
                      shape: points,
                    },
                  });
                }

                if (success) {
                  notifyEngineStateChanged();
                }
              }
              cancelDraft();
              setActiveTool('select');
              return;
            }
          }

          // Apply snapping first, then angle constraint if Shift is held
          const snappedPos = snapResult ? snapResult.point : svgPos;
          let newPoint = { x: snappedPos.x, y: snappedPos.y };
          if (isShiftHeld && draftPoints.length > 0) {
            const lastPoint = draftPoints[draftPoints.length - 1];
            newPoint = constrainAngle(lastPoint, snappedPos);
          }

          debug('path-tool', `Adding polygon point: ${JSON.stringify(newPoint)}`);
          addDraftPoint(newPoint);
        }
        return;
      }

      // Not in a draft - determine mode based on click location
      const clickLocation = classifyClickLocation(
        svgPos.x, svgPos.y,
        panel.width, panel.height,
        safeSpace, edgeSegments,
        hitThreshold
      );
      debug('path-tool', `Click location: ${JSON.stringify(clickLocation)}`);

      if (clickLocation.type === 'boundary') {
        // Forked mode: click on panel boundary
        const edge = clickLocation.edge;
        const editable = isEdgeEditable(edge);
        if (editable) {
          debug('path-tool', `Starting forked mode on edge: ${edge}`);
          const startPos = snapResult ? snapResult.point : svgPos;
          startDraft('edge-path', {
            panelId: panel.id,
            edge,
            pathMode: 'forked',
            forkStart: { x: startPos.x, y: startPos.y },
          });
          // Add first point in edge-relative coordinates
          // Snap offset to the current edge path value at this t position
          const edgeCoords = svgToEdgeCoords(startPos.x, startPos.y, edge);
          if (edgeCoords) {
            const currentOffset = getEdgePathOffsetAtT(
              panel.customEdgePaths ?? [],
              edge,
              edgeCoords.t
            );
            addDraftPoint({ x: edgeCoords.t, y: currentOffset });
          }
          setPathPalettePosition({ x: e.clientX + 20, y: e.clientY - 50 });
        }
        return;
      }

      if (clickLocation.type === 'safe-space' || clickLocation.type === 'open-space') {
        // Polygon mode: click in safe space or open space
        debug('path-tool', `Starting polygon mode in ${clickLocation.type}`);
        startDraft('freeform-polygon', {
          panelId: panel.id,
          pathMode: 'polygon',
        });
        const startPos = snapResult ? snapResult.point : svgPos;
        addDraftPoint({ x: startPos.x, y: startPos.y });
        setPathPalettePosition({ x: e.clientX + 20, y: e.clientY - 50 });
        return;
      }

      // Restricted space - invalid click, do nothing
      if (clickLocation.type === 'restricted') {
        debug('path-tool', 'Click in restricted space - ignoring');
      }
    }

    // Edge dragging only works with inset tool
    if (activeTool === 'inset') {
      const edge = findEdgeAtPoint(svgPos.x, svgPos.y);
      if (edge && isEdgeEditable(edge) && panel) {
        // Start dragging edge
        setIsDraggingEdge(true);
        setDragEdge(edge);
        const currentExtension = panel.edgeExtensions?.[edge] ?? 0;
        setDragStartExtension(currentExtension);
        // Store the relevant coordinate for drag calculation
        if (edge === 'top' || edge === 'bottom') {
          setDragStartPos(svgPos.y);
        } else {
          setDragStartPos(svgPos.x);
        }

        // Start operation and select this edge
        const edgeKey = `${panel.id}:${edge}`;
        if (!isInsetOperationActive) {
          startOperation('inset-outset');
        }
        // Set up the edge with its base extension
        const newBaseExtensions: Record<string, number> = { [edgeKey]: currentExtension };
        updateParams({
          edges: [edgeKey],
          offset: 0,
          baseExtensions: newBaseExtensions,
        });
        return;
      }
    }

    // Rectangle cutout tool: start drawing rectangle
    if (activeTool === 'rectangle' && panel) {
      const startPos = snapResult ? snapResult.point : svgPos;
      setIsDrawingRect(true);
      setRectStart(startPos);
      setRectCurrent(startPos);
      return;
    }

    // Circle cutout tool: start drawing circle
    if (activeTool === 'circle' && panel) {
      const startPos = snapResult ? snapResult.point : svgPos;
      setIsDrawingCircle(true);
      setCircleCenter(startPos);
      setCircleRadius(0);
      return;
    }

    // Default: start panning
    setIsPanning(true);
    setPanStart({ x: e.clientX, y: e.clientY });
  }, [screenToSvg, findEdgeAtPoint, isEdgeEditable, panel, activeTool, findCornerAtPoint, handleCornerClick, isInsetOperationActive, startOperation, updateParams, isPathDraftActive, draftTarget, draftPoints, svgToEdgeCoords, addDraftPoint, startDraft, safeSpace, edgeSegments, isEdgePathDraft, isPolygonDraft, isShiftHeld, cancelDraft, commitDraft, polygonMode, setActiveTool, snapResult]);

  // Handle mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const svgPos = screenToSvg(e.clientX, e.clientY);

    // Compute snap once for all branches that need it
    const isDrawingMode = activeTool === 'path' || activeTool === 'rectangle' || activeTool === 'circle';
    let snap: SnapResult | null = null;
    if (svgPos && showGuideLines && isDrawingMode) {
      const snapThreshold = Math.max(viewBox.width, viewBox.height) / 40;
      snap = findSnapPoint(
        svgPos.x, svgPos.y, guideLines, snapThreshold,
        snapPoints, snapEdgeSegments,
        panel?.width, panel?.height,
      );
    }
    const snappedPos = snap ? snap.point : svgPos;

    if (isDraggingEdge && dragEdge && svgPos && panel && isInsetOperationActive) {
      // Calculate drag delta
      let delta: number;
      if (dragEdge === 'top') {
        delta = svgPos.y - dragStartPos;
      } else if (dragEdge === 'bottom') {
        delta = -(svgPos.y - dragStartPos);
      } else if (dragEdge === 'right') {
        delta = svgPos.x - dragStartPos;
      } else {
        delta = -(svgPos.x - dragStartPos);
      }

      // Clamp: inward limit is material thickness, outward has no practical limit
      const clampedOffset = Math.max(-config.materialThickness - dragStartExtension, delta);

      // Update operation params with the new offset
      updateParams({
        offset: clampedOffset,
      });
    } else if (isDrawingRect && svgPos) {
      setSnapResult(snap);
      setRectCurrent(snappedPos!);
    } else if (isDrawingCircle && circleCenter && svgPos) {
      setSnapResult(snap);
      const target = snappedPos!;
      const dx = target.x - circleCenter.x;
      const dy = target.y - circleCenter.y;
      setCircleRadius(Math.sqrt(dx * dx + dy * dy));
    } else if (isPanning) {
      const svg = svgRef.current;
      if (!svg) return;

      const rect = svg.getBoundingClientRect();
      const dx = ((e.clientX - panStart.x) / rect.width) * viewBox.width;
      const dy = ((e.clientY - panStart.y) / rect.height) * viewBox.height;

      setViewBox(prev => ({
        ...prev,
        x: prev.x - dx,
        y: prev.y - dy,
      }));
      setPanStart({ x: e.clientX, y: e.clientY });
    } else if (svgPos) {
      // Update hovered edge when inset or path tool is active
      if (activeTool === 'path' && !isPathDraftActive) {
        // In path mode (not drafting), derive edge hover from snap result
        // The snap system handles edge proximity detection, so we use it
        // instead of the separate findEdgeAtPoint()
        const edgeFromSnap = snap?.type === 'edge' ? (snap.edgePosition as EdgePosition | undefined) : undefined;
        setHoveredEdge(edgeFromSnap && isEdgeEditable(edgeFromSnap) ? edgeFromSnap : null);
      } else if (activeTool === 'inset') {
        // Inset tool still uses direct edge detection (no snap system interaction)
        const edge = findEdgeAtPoint(svgPos.x, svgPos.y);
        setHoveredEdge(edge);
      } else {
        setHoveredEdge(null);
      }

      // Update hovered corner when chamfer tool is active
      if (activeTool === 'chamfer') {
        const corner = findCornerAtPoint(svgPos.x, svgPos.y);
        setHoveredCornerId(corner?.id ?? null);
      } else {
        setHoveredCornerId(null);
      }

      // Track cursor position for ghost line when path tool is active
      if (isPathDraftActive) {
        setCursorPosition(svgPos);
      } else {
        setCursorPosition(null);
      }

      setSnapResult(snap);
    }
  }, [isDraggingEdge, dragEdge, dragStartPos, dragStartExtension, isPanning, panStart, viewBox, screenToSvg, findEdgeAtPoint, panel, config.materialThickness, activeTool, findCornerAtPoint, isInsetOperationActive, updateParams, isPathDraftActive, isEdgeEditable, isDrawingRect, isDrawingCircle, circleCenter, showGuideLines, guideLines, snapPoints, snapEdgeSegments]);

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    // Finalize rectangle cutout
    if (isDrawingRect && rectStart && rectCurrent) {
      const width = Math.abs(rectCurrent.x - rectStart.x);
      const height = Math.abs(rectCurrent.y - rectStart.y);
      // Only create if there's meaningful size
      if (width >= 1 && height >= 1) {
        handleCreateRectCutout();
      } else {
        // Cancel drawing
        setIsDrawingRect(false);
        setRectStart(null);
        setRectCurrent(null);
      }
    }

    // Finalize circle cutout
    if (isDrawingCircle && circleCenter && circleRadius >= 1) {
      handleCreateCircleCutout();
    } else if (isDrawingCircle) {
      // Cancel drawing
      setIsDrawingCircle(false);
      setCircleCenter(null);
      setCircleRadius(0);
    }

    setIsPanning(false);
    setIsDraggingEdge(false);
    setDragEdge(null);
    setSnapResult(null);
  }, [isDrawingRect, rectStart, rectCurrent, handleCreateRectCutout, isDrawingCircle, circleCenter, circleRadius, handleCreateCircleCutout]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Track Shift key for angle constraints
      if (e.key === 'Shift') {
        setIsShiftHeld(true);
      }

      if (e.key === 'Escape') {
        // Cancel polygon draft or exit sketch view
        if (isPolygonDraft) {
          cancelDraft();
        } else if (pendingPolygon) {
          setPendingPolygon(null);
        } else {
          exitSketchView();
        }
      }

      // Enter key closes polygon path and applies operation
      if (e.key === 'Enter' && isPolygonDraft && draftPoints.length >= 3 && panel) {
        debug('path-tool', 'Enter pressed - applying polygon operation');
        const engine = getEngine();
        if (engine) {
          const points = [...draftPoints];
          const halfW = panel.width / 2;
          const halfH = panel.height / 2;
          const panelOutline = createRectPolygon(-halfW, -halfH, halfW, halfH);
          const classification = classifyPolygon(points, panelOutline, 1.0);

          let success = false;

          if (classification === 'interior') {
            if (polygonMode === 'subtractive') {
              const centerX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
              const centerY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
              const relativePoints = points.map(p => ({
                x: p.x - centerX,
                y: p.y - centerY,
              }));

              success = engine.dispatch({
                type: 'ADD_CUTOUT',
                targetId: 'main-assembly',
                payload: {
                  panelId: panel.id,
                  cutout: {
                    id: crypto.randomUUID(),
                    type: 'path',
                    center: { x: centerX, y: centerY },
                    points: relativePoints,
                  },
                },
              });
            }
          } else if (classification === 'boundary') {
            const operation = polygonMode === 'additive' ? 'union' : 'difference';
            success = engine.dispatch({
              type: 'APPLY_EDGE_OPERATION',
              targetId: 'main-assembly',
              payload: {
                panelId: panel.id,
                operation,
                shape: points,
              },
            });
          } else if (classification === 'exterior' && polygonMode === 'additive') {
            success = engine.dispatch({
              type: 'APPLY_EDGE_OPERATION',
              targetId: 'main-assembly',
              payload: {
                panelId: panel.id,
                operation: 'union',
                shape: points,
              },
            });
          }

          if (success) {
            notifyEngineStateChanged();
          }
        }
        cancelDraft();
        setActiveTool('select');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftHeld(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [exitSketchView, isPolygonDraft, draftPoints, cancelDraft, pendingPolygon, polygonMode, panel, setActiveTool]);

  // Fit view to panel
  const handleFitView = useCallback(() => {
    if (panel) {
      const padding = 20;
      setViewBox({
        x: -panel.width / 2 - padding,
        y: -panel.height / 2 - padding,
        width: panel.width + padding * 2,
        height: panel.height + padding * 2,
      });
    }
  }, [panel]);

  if (!panel) {
    return (
      <div className={`sketch-view-2d ${className || ''}`}>
        <div className="sketch-empty">
          <p>No panel selected for editing</p>
          <button onClick={exitSketchView}>Return to 3D View</button>
        </div>
      </div>
    );
  }

  const gridSize = 10;
  const strokeScale = Math.min(viewBox.width, viewBox.height) / 200;
  const outlineStrokeWidth = Math.max(0.3, Math.min(1, strokeScale));
  const holeStrokeWidth = Math.max(0.2, Math.min(0.5, strokeScale * 0.5));
  const edgeHighlightWidth = Math.max(2, Math.min(5, strokeScale * 3));

  // Get color for an edge based on status and hover state
  const getEdgeColor = (edge: EdgePosition): string => {
    const status = edgeStatuses.find(e => e.position === edge);
    const isLocked = status?.status === 'locked';
    const isHovered = hoveredEdge === edge;
    const isDragging = dragEdge === edge;

    if (isLocked) {
      return isHovered ? colors.edge.locked.hover : colors.edge.locked.base;
    } else {
      if (isDragging) return colors.operation.dragging;
      if (isHovered) return colors.edge.unlocked.hover;
      return colors.edge.unlocked.base;
    }
  };

  // Determine cursor based on active tool and hover state
  const getCursor = (): string => {
    if (isPanning) return 'grabbing';

    // Inset tool: resize cursor for edges
    if (activeTool === 'inset') {
      if (isDraggingEdge) {
        if (dragEdge === 'top' || dragEdge === 'bottom') return 'ns-resize';
        return 'ew-resize';
      }
      if (hoveredEdge && isEdgeEditable(hoveredEdge)) {
        if (hoveredEdge === 'top' || hoveredEdge === 'bottom') return 'ns-resize';
        return 'ew-resize';
      }
    }

    // Path tool: crosshair when selected, pointer when hovering edge
    if (activeTool === 'path') {
      if (hoveredEdge && isEdgeEditable(hoveredEdge)) return 'pointer';
      return 'crosshair';  // D1 fix: show crosshair when path tool is selected
    }

    // Chamfer tool: pointer cursor for corners
    if (activeTool === 'chamfer' && hoveredCornerId) {
      return 'pointer';
    }

    // Rectangle and circle tools: crosshair cursor
    if (activeTool === 'rectangle' || activeTool === 'circle') {
      return 'crosshair';
    }

    return 'grab';
  };

  return (
    <div ref={containerRef} className={`sketch-view-2d ${className || ''}`}>
      {/* Toolbar */}
      <div className="sketch-toolbar">
        <div className="sketch-toolbar-left">
          <span className="sketch-panel-name">{panel.label || panel.id}</span>
          <span className="sketch-panel-dims">
            {panel.width.toFixed(1)} x {panel.height.toFixed(1)} mm
          </span>
        </div>
        <div className="sketch-toolbar-right">
          <button className="sketch-btn" onClick={handleFitView} title="Fit to view">
            Fit
          </button>
          <button className="sketch-btn sketch-btn-close" onClick={exitSketchView} title="Return to 3D (Esc)">
            Close
          </button>
        </div>
      </div>

      {/* Editor Tools */}
      <EditorToolbar
        mode="2d"
        activeTool={activeTool}
        onToolChange={handleToolChange}
      />

      {/* SVG Canvas */}
      <svg
        ref={svgRef}
        className="sketch-canvas"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: getCursor() }}
      >
        {/* Grid pattern */}
        <GridPattern
          gridSize={gridSize}
          id="sketch-grid"
          minorColor={colors.sketch.grid.minor}
          majorColor={colors.sketch.grid.major}
        />
        <rect
          x={viewBox.x - viewBox.width}
          y={viewBox.y - viewBox.height}
          width={viewBox.width * 3}
          height={viewBox.height * 3}
          fill="url(#sketch-grid-major)"
        />

        {/* Coordinate axes */}
        <line
          x1={viewBox.x - viewBox.width}
          y1={0}
          x2={viewBox.x + viewBox.width * 2}
          y2={0}
          stroke={colors.sketch.grid.axes}
          strokeWidth="0.5"
          strokeDasharray="4 4"
        />
        <line
          x1={0}
          y1={viewBox.y - viewBox.height}
          x2={0}
          y2={viewBox.y + viewBox.height * 2}
          stroke={colors.sketch.grid.axes}
          strokeWidth="0.5"
          strokeDasharray="4 4"
        />

        {/* Y-axis is flipped in SVG, so we apply a transform */}
        <g transform="scale(1, -1)">
          {/* Guide lines for snapping (center lines + edge extension lines) */}
          {showGuideLines && guideLines.length > 0 && (() => {
            const guideStrokeWidth = Math.max(viewBox.width, viewBox.height) / 800;
            const extent = Math.max(viewBox.width, viewBox.height) * 3;
            const isLegendHighlightedGuide = legendHighlight === 'guide-lines';

            return (
              <g>
                {guideLines.map((guide, i) => {
                  const isHighlighted = isLegendHighlightedGuide ||
                    (snapResult?.guides.some(g =>
                      g.orientation === guide.orientation && g.position === guide.position
                    ) ?? false);
                  const color = isHighlighted
                    ? colors.sketch.guides.highlight
                    : guide.type === 'center'
                      ? colors.sketch.guides.centerLine
                      : colors.sketch.guides.edgeLine;
                  const opacity = isHighlighted ? 0.8 : guide.type === 'center' ? 0.5 : 0.3;
                  const strokeW = isHighlighted ? guideStrokeWidth * 2 : guideStrokeWidth;
                  const isH = guide.orientation === 'horizontal';

                  return (
                    <line
                      key={`guide-${isH ? 'h' : 'v'}-${i}`}
                      x1={isH ? -extent : guide.position}
                      y1={isH ? guide.position : -extent}
                      x2={isH ? extent : guide.position}
                      y2={isH ? guide.position : extent}
                      stroke={color}
                      strokeWidth={strokeW}
                      strokeDasharray={guide.type === 'center'
                        ? `${6 * guideStrokeWidth} ${4 * guideStrokeWidth}`
                        : `${3 * guideStrokeWidth} ${3 * guideStrokeWidth}`
                      }
                      opacity={opacity}
                      style={{ transition: 'opacity 0.1s, stroke 0.1s' }}
                    />
                  );
                })}
              </g>
            );
          })()}

          {/* Adjacent panel side profiles - shows cross-section of neighboring panels */}
          {panel && adjacentPanelProfiles.map(profile => {
            if (!profile.exists) return null;

            // panel.width/height are body dimensions (without extensions)
            const halfW = panel.width / 2;
            const halfH = panel.height / 2;
            const mt = profile.materialThickness;
            const profileScale = Math.min(viewBox.width, viewBox.height) / 200; // Scale profile size

            // Check which edges have finger joints (to determine insets)
            const leftHasJoints = edgeStatuses.find(e => e.position === 'left')?.status === 'locked' ||
                                  edgeStatuses.find(e => e.position === 'left')?.status === 'outward-only';
            const rightHasJoints = edgeStatuses.find(e => e.position === 'right')?.status === 'locked' ||
                                   edgeStatuses.find(e => e.position === 'right')?.status === 'outward-only';
            const topHasJoints = edgeStatuses.find(e => e.position === 'top')?.status === 'locked' ||
                                 edgeStatuses.find(e => e.position === 'top')?.status === 'outward-only';
            const bottomHasJoints = edgeStatuses.find(e => e.position === 'bottom')?.status === 'locked' ||
                                    edgeStatuses.find(e => e.position === 'bottom')?.status === 'outward-only';

            // Inset amounts based on perpendicular edges having joints
            const leftInset = leftHasJoints ? mt : 0;
            const rightInset = rightHasJoints ? mt : 0;
            const topInset = topHasJoints ? mt : 0;
            const bottomInset = bottomHasJoints ? mt : 0;

            // Position and dimensions for the side profile rectangle
            // These should align with where the finger joints actually are
            let x = 0, y = 0, w = 0, h = 0;
            let labelX = 0, labelY = 0;

            switch (profile.edge) {
              case 'top':
                // Profile above the top edge - inset on left/right if those edges have joints
                x = -halfW + leftInset;
                y = halfH - topInset;  // Position at the finger joint line
                w = panel.width - leftInset - rightInset;
                h = mt;
                labelX = 0;
                labelY = halfH + 5 * profileScale;
                break;
              case 'bottom':
                // Profile below the bottom edge - inset on left/right if those edges have joints
                x = -halfW + leftInset;
                y = -halfH + bottomInset - mt;  // Position at the finger joint line
                w = panel.width - leftInset - rightInset;
                h = mt;
                labelX = 0;
                labelY = -halfH - 5 * profileScale;
                break;
              case 'left':
                // Profile to the left of the left edge - inset on top/bottom if those edges have joints
                x = -halfW + leftInset - mt;  // Position at the finger joint line
                y = -halfH + bottomInset;
                w = mt;
                h = panel.height - topInset - bottomInset;
                labelX = -halfW - 5 * profileScale;
                labelY = 0;
                break;
              case 'right':
                // Profile to the right of the right edge - inset on top/bottom if those edges have joints
                x = halfW - rightInset;  // Position at the finger joint line
                y = -halfH + bottomInset;
                w = mt;
                h = panel.height - topInset - bottomInset;
                labelX = halfW + 5 * profileScale;
                labelY = 0;
                break;
            }

            // Show extension if the adjacent panel has one
            const adjExt = profile.extension;

            return (
              <g key={`profile-${profile.edge}`}>
                {/* Main material cross-section */}
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill={colors.sketch.adjacent.base}
                  fillOpacity={0.4}
                  stroke={colors.sketch.adjacent.hover}
                  strokeWidth={outlineStrokeWidth * 0.5}
                />
                {/* Extension visualization if adjacent panel extends in this direction */}
                {adjExt > 0 && (
                  <rect
                    x={profile.edge === 'left' ? x - adjExt : profile.edge === 'right' ? x + w : x}
                    y={profile.edge === 'bottom' ? y - adjExt : profile.edge === 'top' ? y + h : y}
                    width={profile.edge === 'left' || profile.edge === 'right' ? adjExt : w}
                    height={profile.edge === 'top' || profile.edge === 'bottom' ? adjExt : h}
                    fill={colors.sketch.extension}
                    fillOpacity={0.3}
                    stroke={colors.sketch.extension}
                    strokeWidth={outlineStrokeWidth * 0.5}
                    strokeDasharray={`${2 * strokeScale} ${1 * strokeScale}`}
                  />
                )}
                {/* Adjacent face label - small, positioned outside the profile */}
                <text
                  x={labelX * 1.8}
                  y={-labelY * 1.8}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={colors.sketch.label}
                  fontSize={Math.max(2.5, 3 * profileScale)}
                  fontFamily="monospace"
                  transform={`scale(1, -1)`}
                  style={{ pointerEvents: 'none' }}
                  opacity={0.5}
                >
                  {profile.faceId}
                </text>
              </g>
            );
          })}

          {/* Safe Space Visualization */}
          {safeSpace && (() => {
            // Use computed resultPaths directly instead of fill-rule="evenodd" trick
            // Each resultPath is a simple closed polygon (typically a rectangle)
            // representing an area where custom geometry can be added safely.
            const hasResultPaths = safeSpace.resultPaths && safeSpace.resultPaths.length > 0;

            return (
              <>
                {/* Safe space result paths (green dashed rectangles) */}
                {hasResultPaths && safeSpace.resultPaths.map((path, i) => (
                  <polygon
                    key={`safe-path-${i}`}
                    points={path.map(p => `${p.x},${p.y}`).join(' ')}
                    fill={colors.sketch.editable.base}
                    fillOpacity={legendHighlight === 'safe-zone' ? 0.3 : 0.1}
                    stroke={colors.sketch.editable.base}
                    strokeWidth={legendHighlight === 'safe-zone' ? outlineStrokeWidth * 2 : outlineStrokeWidth * 0.8}
                    strokeDasharray={`${4 * strokeScale} ${2 * strokeScale}`}
                    opacity={legendHighlight === 'safe-zone' ? 1 : 0.7}
                    style={{ transition: 'opacity 0.15s, stroke-width 0.15s, fill-opacity 0.15s' }}
                  />
                ))}

                {/* Fallback: if no resultPaths, use the old fill-rule approach */}
                {!hasResultPaths && (() => {
                  const outlinePath = safeSpace.outline.map((p, i) =>
                    i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`
                  ).join(' ') + ' Z';

                  const exclusionPaths = safeSpace.exclusions.map(exclusion => {
                    const reversed = [...exclusion].reverse();
                    return reversed.map((p, i) =>
                      i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`
                    ).join(' ') + ' Z';
                  }).join(' ');

                  return (
                    <path
                      d={outlinePath + ' ' + exclusionPaths}
                      fill={colors.sketch.editable.base}
                      fillOpacity={legendHighlight === 'safe-zone' ? 0.3 : 0.1}
                      fillRule="evenodd"
                      stroke={colors.sketch.editable.base}
                      strokeWidth={legendHighlight === 'safe-zone' ? outlineStrokeWidth * 2 : outlineStrokeWidth * 0.8}
                      strokeDasharray={`${4 * strokeScale} ${2 * strokeScale}`}
                      opacity={legendHighlight === 'safe-zone' ? 1 : 0.7}
                      style={{ transition: 'opacity 0.15s, stroke-width 0.15s, fill-opacity 0.15s' }}
                    />
                  );
                })()}

                {/* Exclusion zone outlines (show what's excluded) */}
                {safeSpace.exclusions.map((exclusion, i) => (
                  <polygon
                    key={`exclusion-${i}`}
                    points={exclusion.map(p => `${p.x},${p.y}`).join(' ')}
                    fill="none"
                    stroke={colors.sketch.exclusion.base}
                    strokeWidth={outlineStrokeWidth * 0.6}
                    strokeDasharray={`${2 * strokeScale} ${2 * strokeScale}`}
                    opacity={legendHighlight === 'safe-zone' ? 0.5 : 0.4}
                  />
                ))}

                {/* Reserved regions labels (for UI info, slots shown in red) */}
                {safeSpace.reserved.filter(r => r.type === 'slot' || r.type === 'slot-margin').map((reserved, i) => (
                  <polygon
                    key={`reserved-${i}`}
                    points={reserved.polygon.map(p => `${p.x},${p.y}`).join(' ')}
                    fill={colors.sketch.reserved.base}
                    fillOpacity={0.15}
                    stroke="none"
                    opacity={legendHighlight === 'safe-zone' ? 0.3 : 0.5}
                  />
                ))}
              </>
            );
          })()}

          {/* Conceptual boundary lines (dashed, showing ideal panel edges) */}
          {conceptualBoundary && (['top', 'bottom', 'left', 'right'] as EdgePosition[]).map(edge => {
            const boundary = conceptualBoundary[edge];
            const status = edgeStatuses.find(e => e.position === edge);
            // Edges with joints: locked (male/tabs) or outward-only (female/slots)
            const hasJoints = status?.status === 'locked' || status?.status === 'outward-only';

            // Only show conceptual boundary if this edge has joints (difference from actual)
            if (!hasJoints) return null;

            const isHighlighted = legendHighlight === 'boundary';

            return (
              <line
                key={`boundary-${edge}`}
                x1={boundary.start.x}
                y1={boundary.start.y}
                x2={boundary.end.x}
                y2={boundary.end.y}
                stroke={colors.sketch.boundary}
                strokeWidth={isHighlighted ? outlineStrokeWidth * 2 : outlineStrokeWidth * 0.5}
                strokeDasharray={`${3 * strokeScale} ${2 * strokeScale}`}
                opacity={isHighlighted ? 1 : 0.6}
                style={{ transition: 'opacity 0.15s, stroke-width 0.15s' }}
              />
            );
          })}

          {/* Edge highlights (rendered under outline) */}
          {edgeSegments && (['top', 'bottom', 'left', 'right'] as EdgePosition[]).map(edge => {
            const segments = edgeSegments[edge];
            const isHovered = hoveredEdge === edge || dragEdge === edge;
            if (!isHovered || segments.length === 0) return null;

            return (
              <g key={`highlight-${edge}`}>
                {segments.map((seg, i) => (
                  <line
                    key={i}
                    x1={seg.start.x}
                    y1={seg.start.y}
                    x2={seg.end.x}
                    y2={seg.end.y}
                    stroke={getEdgeColor(edge)}
                    strokeWidth={edgeHighlightWidth}
                    strokeLinecap="round"
                    opacity={0.5}
                  />
                ))}
              </g>
            );
          })}

          {/* Panel outline with colored edges */}
          {edgeSegments && (['top', 'bottom', 'left', 'right'] as EdgePosition[]).map(edge => {
            const segments = edgeSegments[edge];
            const status = edgeStatuses.find(e => e.position === edge);
            const isLocked = status?.status === 'locked';
            const isEdgeLegendHighlighted = (isLocked && legendHighlight === 'locked-edge') ||
                                            (!isLocked && legendHighlight === 'editable-edge');

            return (
              <g key={`edge-${edge}`}>
                {segments.map((seg, i) => (
                  <line
                    key={i}
                    x1={seg.start.x}
                    y1={seg.start.y}
                    x2={seg.end.x}
                    y2={seg.end.y}
                    stroke={getEdgeColor(edge)}
                    strokeWidth={isEdgeLegendHighlighted ? outlineStrokeWidth * 3 : outlineStrokeWidth}
                    strokeLinecap="round"
                    opacity={isEdgeLegendHighlighted ? 1 : undefined}
                    style={{ transition: 'stroke-width 0.15s, opacity 0.15s' }}
                  />
                ))}
              </g>
            );
          })}

          {/* Joint line segments (perpendicular parts connecting fingers) */}
          {jointSegments.map((joint, i) => {
            const edgeColor = getEdgeColor(joint.nearEdge);
            // Joints are part of locked edges - highlight when locked-edge is highlighted
            const isHighlighted = legendHighlight === 'locked-edge';

            return (
              <line
                key={`joint-${i}`}
                x1={joint.start.x}
                y1={joint.start.y}
                x2={joint.end.x}
                y2={joint.end.y}
                stroke={edgeColor}
                strokeWidth={isHighlighted ? outlineStrokeWidth * 3 : outlineStrokeWidth}
                strokeLinecap="round"
                opacity={isHighlighted ? 1 : 0.8}
                style={{ transition: 'stroke-width 0.15s, opacity 0.15s' }}
              />
            );
          })}

          {/* Holes */}
          {panel.holes.map((hole) => (
            <path
              key={hole.id}
              d={pathToSvgD(hole.path.points, hole.path.closed)}
              fill={colors.sketch.hole.base}
              stroke={colors.sketch.hole.hover}
              strokeWidth={holeStrokeWidth}
            />
          ))}

          {/* Path draft preview - shows when drawing a custom edge path or polygon */}
          {isPathDraftActive && draftPoints.length > 0 && (() => {
            let previewPoints: { x: number; y: number }[];

            if (isEdgePathDraft && draftTarget?.edge) {
              // Edge-path mode: convert from edge-relative coordinates.
              // If mirroring is enabled, also include the reflected points (t -> 1-t)
              // so the user sees the full symmetric preview in real time.
              let edgeRelPoints = draftPoints.map(p => ({ t: p.x, offset: p.y }));

              if (draftTarget.mirrored && edgeRelPoints.length > 0) {
                // Mirror: for each point with t < 0.5 (or not exactly 0.5), add t = 1-t
                const mirroredExtra = [...edgeRelPoints]
                  .reverse()
                  .filter(pt => Math.abs(pt.t - 0.5) > 0.001)
                  .map(pt => ({ t: 1 - pt.t, offset: pt.offset }));
                edgeRelPoints = [...edgeRelPoints, ...mirroredExtra];
              }

              previewPoints = edgeRelPoints
                .map(p => edgeCoordsToSvg(p.t, p.offset, draftTarget.edge!))
                .filter((p): p is { x: number; y: number } => p !== null);
            } else if (isPolygonDraft) {
              // Polygon mode: points are already in SVG coordinates
              previewPoints = draftPoints.map(p => ({ x: p.x, y: p.y }));
            } else {
              return null;
            }

            if (previewPoints.length === 0) return null;

            // Validate the path
            let isValid = true;
            if (safeSpace && edgeMargins && isPolygonDraft && previewPoints.length >= 3) {
              const analysis = analyzePath(previewPoints, safeSpace, edgeMargins, panel.width, panel.height, panel.edgeExtensions);
              // Invalid if entirely in open space (no overlap with panel) or touches restricted areas
              isValid = !analysis.touchesClosedEdge && (analysis.whollyInSafeSpace || analysis.spansOpenEdge || analysis.borderedEdges.length > 0);
            }

            // For polygon mode, use colors based on the boolean mode (additive=green, subtractive=red)
            // For edge path mode, always use positive (green)
            // When invalid, use a dimmed/gray color
            let strokeColor: string;
            let fillColor: string;
            if (!isValid) {
              strokeColor = '#888';
              fillColor = '#888';
            } else if (isPolygonDraft) {
              strokeColor = polygonMode === 'additive' ? colors.operation.positive.base : colors.operation.negative.base;
              fillColor = polygonMode === 'additive' ? colors.operation.positive.base : colors.operation.negative.base;
            } else {
              strokeColor = colors.operation.positive.base;
              fillColor = colors.operation.positive.base;
            }

            const pathD = previewPoints
              .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
              .join(' ') + (isPolygonDraft && previewPoints.length >= 3 ? ' Z' : '');

            // Check if near start point to show close indicator
            const lastPoint = previewPoints[previewPoints.length - 1];
            const firstPoint = previewPoints[0];
            const distToStart = previewPoints.length >= 3 ?
              Math.sqrt((lastPoint.x - firstPoint.x) ** 2 + (lastPoint.y - firstPoint.y) ** 2) : Infinity;
            const closeThreshold = Math.max(8, viewBox.width / 25);
            const nearStart = distToStart < closeThreshold;

            return (
              <g>
                {/* Polygon fill preview (for polygon mode only) */}
                {isPolygonDraft && previewPoints.length >= 3 && (
                  <polygon
                    points={previewPoints.map(p => `${p.x},${p.y}`).join(' ')}
                    fill={fillColor}
                    fillOpacity={0.15}
                    stroke="none"
                  />
                )}
                {/* Path line preview */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={outlineStrokeWidth * 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={`${4 * strokeScale} ${2 * strokeScale}`}
                />
                {/* Point markers */}
                {previewPoints.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={Math.max(1, strokeScale * 2)}
                    fill={i === 0 && nearStart && isPolygonDraft ? '#fff' : (i === previewPoints.length - 1 ? strokeColor : strokeColor)}
                    stroke={i === 0 && nearStart && isPolygonDraft ? strokeColor : 'white'}
                    strokeWidth={i === 0 && nearStart && isPolygonDraft ? strokeScale * 1.5 : strokeScale * 0.5}
                  />
                ))}
                {/* Close indicator when near start */}
                {isPolygonDraft && nearStart && previewPoints.length >= 3 && (
                  <circle
                    cx={firstPoint.x}
                    cy={firstPoint.y}
                    r={Math.max(3, strokeScale * 4)}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeScale}
                    strokeDasharray={`${2 * strokeScale} ${1 * strokeScale}`}
                  />
                )}
                {/* Angle constraint indicator when Shift is held */}
                {isShiftHeld && previewPoints.length >= 1 && (
                  <text
                    x={lastPoint.x + 5}
                    y={-lastPoint.y - 5}
                    fill={strokeColor}
                    fontSize={Math.max(3, strokeScale * 3)}
                    transform="scale(1, -1)"
                    opacity={0.7}
                  >
                    45°
                  </text>
                )}
              </g>
            );
          })()}

          {/* Ghost line from last point to cursor */}
          {isPathDraftActive && draftPoints.length > 0 && cursorPosition && (() => {
            let lastPoint: { x: number; y: number };

            if (isEdgePathDraft && draftTarget?.edge) {
              // Edge-path mode: convert last point from edge-relative coordinates
              const converted = edgeCoordsToSvg(
                draftPoints[draftPoints.length - 1].x,
                draftPoints[draftPoints.length - 1].y,
                draftTarget.edge
              );
              if (!converted) return null;
              lastPoint = converted;
            } else {
              // Polygon mode: points are already in SVG coordinates
              lastPoint = draftPoints[draftPoints.length - 1];
            }

            // Apply angle constraint if Shift is held
            let targetPoint = cursorPosition;
            if (isShiftHeld) {
              targetPoint = constrainAngle(lastPoint, cursorPosition);
            }

            // Use appropriate color based on mode
            const strokeColor = isPolygonDraft
              ? (polygonMode === 'additive' ? colors.operation.positive.base : colors.operation.negative.base)
              : colors.operation.positive.base;

            return (
              <line
                x1={lastPoint.x}
                y1={lastPoint.y}
                x2={targetPoint.x}
                y2={targetPoint.y}
                stroke={strokeColor}
                strokeWidth={outlineStrokeWidth}
                strokeDasharray={`${3 * strokeScale} ${2 * strokeScale}`}
                opacity={0.6}
              />
            );
          })()}

          {/* Rectangle cutout preview - shows when drawing a rectangle */}
          {isDrawingRect && rectStart && rectCurrent && (() => {
            const minX = Math.min(rectStart.x, rectCurrent.x);
            const maxX = Math.max(rectStart.x, rectCurrent.x);
            const minY = Math.min(rectStart.y, rectCurrent.y);
            const maxY = Math.max(rectStart.y, rectCurrent.y);
            const width = maxX - minX;
            const height = maxY - minY;

            if (width < 0.1 || height < 0.1) return null;

            // Check if rectangle is within safe space
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            const isValid = safeSpace ? isRectInSafeSpace(centerX, centerY, width, height, safeSpace) : true;
            const strokeColor = isValid ? colors.operation.positive.base : colors.operation.negative.base;
            const fillColor = isValid ? colors.operation.positive.base : colors.operation.negative.base;

            return (
              <rect
                x={minX}
                y={minY}
                width={width}
                height={height}
                fill={fillColor}
                fillOpacity={0.2}
                stroke={strokeColor}
                strokeWidth={outlineStrokeWidth * 2}
                strokeDasharray={`${4 * strokeScale} ${2 * strokeScale}`}
              />
            );
          })()}

          {/* Circle cutout preview - shows when drawing a circle */}
          {isDrawingCircle && circleCenter && circleRadius > 0.1 && (() => {
            // Check if circle is within safe space
            const isValid = safeSpace ? isCircleInSafeSpace(circleCenter.x, circleCenter.y, circleRadius, safeSpace) : true;
            const strokeColor = isValid ? colors.operation.positive.base : colors.operation.negative.base;
            const fillColor = isValid ? colors.operation.positive.base : colors.operation.negative.base;

            return (
              <circle
                cx={circleCenter.x}
                cy={circleCenter.y}
                r={circleRadius}
                fill={fillColor}
                fillOpacity={0.2}
                stroke={strokeColor}
                strokeWidth={outlineStrokeWidth * 2}
                strokeDasharray={`${4 * strokeScale} ${2 * strokeScale}`}
              />
            );
          })()}

          {/* Pending additive shape preview - shows while mode selection palette is open */}
          {pendingAdditiveShape && (() => {
            const { type, data, mode } = pendingAdditiveShape;
            // Use different colors based on mode
            const strokeColor = mode === 'additive' ? colors.operation.positive.base : colors.operation.negative.base;
            const fillColor = mode === 'additive' ? colors.operation.positive.base : colors.operation.negative.base;

            if (type === 'rect' && data.width !== undefined && data.height !== undefined) {
              return (
                <rect
                  x={data.center.x - data.width / 2}
                  y={data.center.y - data.height / 2}
                  width={data.width}
                  height={data.height}
                  fill={fillColor}
                  fillOpacity={0.3}
                  stroke={strokeColor}
                  strokeWidth={outlineStrokeWidth * 2}
                />
              );
            } else if (type === 'circle' && data.radius !== undefined) {
              return (
                <circle
                  cx={data.center.x}
                  cy={data.center.y}
                  r={data.radius}
                  fill={fillColor}
                  fillOpacity={0.3}
                  stroke={strokeColor}
                  strokeWidth={outlineStrokeWidth * 2}
                />
              );
            }
            return null;
          })()}

          {/* Pending polygon preview - shows while mode selection palette is open */}
          {pendingPolygon && pendingPolygon.points.length >= 3 && (() => {
            const { points, mode } = pendingPolygon;
            const strokeColor = mode === 'additive' ? colors.operation.positive.base : colors.operation.negative.base;
            const fillColor = mode === 'additive' ? colors.operation.positive.base : colors.operation.negative.base;

            return (
              <polygon
                points={points.map(p => `${p.x},${p.y}`).join(' ')}
                fill={fillColor}
                fillOpacity={0.3}
                stroke={strokeColor}
                strokeWidth={outlineStrokeWidth * 2}
              />
            );
          })()}

          {/* Corner indicators - only show when chamfer tool is active */}
          {activeTool === 'chamfer' && detectedCorners.filter(c => c.eligible).map((corner) => {
            const isSelected = selectedCornerIds.has(corner.id);
            const isHovered = hoveredCornerId === corner.id;
            const isLegendHighlighted = legendHighlight === 'corner';
            // Fixed radius in viewBox units - scales with zoom
            // Use smaller of panel dimensions to keep indicators proportional
            const indicatorRadius = Math.min(panel.width, panel.height) * 0.02;
            const cornerSelectedColor = colors.corner.selected.base;
            const cornerEligibleColor = colors.corner.eligible?.base ?? '#4a9eff';
            const displayRadius = isLegendHighlighted ? indicatorRadius * 1.5 : indicatorRadius;

            return (
              <g key={corner.id} style={{ cursor: 'pointer', pointerEvents: 'all', transition: 'transform 0.15s' }}>
                {/* Hit area (larger invisible circle for easier clicking) */}
                <circle
                  cx={corner.position.x}
                  cy={corner.position.y}
                  r={displayRadius * 3}
                  fill="transparent"
                  style={{ pointerEvents: 'all' }}
                />
                {/* Outer glow when hovered, selected, or legend highlighted */}
                {(isHovered || isSelected || isLegendHighlighted) && (
                  <circle
                    cx={corner.position.x}
                    cy={corner.position.y}
                    r={displayRadius * 1.6}
                    fill="none"
                    stroke={isLegendHighlighted ? cornerEligibleColor : cornerSelectedColor}
                    strokeWidth={displayRadius * 0.5}
                    opacity={isLegendHighlighted ? 0.8 : 0.6}
                    style={{ transition: 'r 0.15s, opacity 0.15s' }}
                  />
                )}
                {/* Main indicator circle - always visible with fill */}
                <circle
                  cx={corner.position.x}
                  cy={corner.position.y}
                  r={displayRadius}
                  fill={isSelected ? cornerSelectedColor : isHovered ? cornerSelectedColor : cornerEligibleColor}
                  fillOpacity={isLegendHighlighted ? 0.9 : isSelected ? 0.8 : isHovered ? 0.6 : 0.4}
                  stroke={isSelected ? cornerSelectedColor : isHovered ? cornerSelectedColor : cornerEligibleColor}
                  strokeWidth={displayRadius * 0.2}
                  style={{ transition: 'r 0.15s, fill-opacity 0.15s' }}
                />
              </g>
            );
          })}

          {/* Snap indicator - circle at snap point, styled by type */}
          {snapResult && showGuideLines && (() => {
            const indicatorR = Math.max(viewBox.width, viewBox.height) / 100;
            const isEdgeSnap = snapResult.type === 'edge';
            const isPointSnap = snapResult.type === 'point';
            const isForkIndicator = isEdgeSnap && activeTool === 'path' && !isPathDraftActive;

            // Edge snaps in path mode (fork indicator) use a slightly larger, more prominent circle
            const r = isForkIndicator ? indicatorR * 1.3 : isPointSnap ? indicatorR * 0.8 : indicatorR;
            const fillOpacity = isForkIndicator ? 0.4 : isPointSnap ? 0.5 : 0.3;
            const strokeW = isForkIndicator ? r * 0.4 : r * 0.3;

            return (
              <circle
                cx={snapResult.point.x}
                cy={snapResult.point.y}
                r={r}
                fill={colors.sketch.guides.snapIndicator}
                fillOpacity={fillOpacity}
                stroke={colors.sketch.guides.snapIndicator}
                strokeWidth={strokeW}
                opacity={0.9}
              />
            );
          })()}
        </g>

        {/* Dimension labels - positioned outside drawing with scaled font */}
        {(() => {
          const dimFontSize = Math.max(3, Math.min(5, strokeScale * 4));
          const dimOffset = dimFontSize * 2;
          const halfW = panel.width / 2;
          const halfH = panel.height / 2;
          return (
            <>
              {/* Top - width */}
              <text
                x={0}
                y={-halfH - dimOffset}
                textAnchor="middle"
                fill={colors.sketch.label}
                fontSize={dimFontSize}
                fontFamily="monospace"
                opacity={0.7}
              >
                {panel.width.toFixed(1)}
              </text>
              {/* Bottom - width */}
              <text
                x={0}
                y={halfH + dimOffset + dimFontSize}
                textAnchor="middle"
                fill={colors.sketch.label}
                fontSize={dimFontSize}
                fontFamily="monospace"
                opacity={0.7}
              >
                {panel.width.toFixed(1)}
              </text>
              {/* Right - height */}
              <text
                x={halfW + dimOffset}
                y={0}
                textAnchor="middle"
                fill={colors.sketch.label}
                fontSize={dimFontSize}
                fontFamily="monospace"
                opacity={0.7}
                transform={`rotate(-90, ${halfW + dimOffset}, 0)`}
              >
                {panel.height.toFixed(1)}
              </text>
              {/* Left - height */}
              <text
                x={-halfW - dimOffset}
                y={0}
                textAnchor="middle"
                fill={colors.sketch.label}
                fontSize={dimFontSize}
                fontFamily="monospace"
                opacity={0.7}
                transform={`rotate(90, ${-halfW - dimOffset}, 0)`}
              >
                {panel.height.toFixed(1)}
              </text>
            </>
          );
        })()}
      </svg>


      {/* Floating palette for corner finish options - shows when chamfer tool is active */}
      {activeTool === 'chamfer' && panel && (
        <FloatingPalette
          position={palettePosition}
          title="Corner Fillet"
          onClose={() => {
            if (isChamferOperationActive) {
              cancelOperation();
            }
            clearCornerSelection();
            setActiveTool('select');
          }}
          onPositionChange={setPalettePosition}
          minWidth={220}
          containerRef={containerRef}
        >
          <PaletteCheckboxGroup label="Select Corners">
            {detectedCorners.filter(c => c.eligible).map(corner => {
              // Generate label for corner - handle both old (corner-tl) and new (outline:5) formats
              const cornerLabels: Record<string, string> = {
                'corner-tl': 'Top Left',
                'corner-tr': 'Top Right',
                'corner-bl': 'Bottom Left',
                'corner-br': 'Bottom Right',
              };
              let label = cornerLabels[corner.id];
              if (!label) {
                // New all-corners format: "outline:N" or "hole:holeId:N"
                if (corner.id.startsWith('outline:')) {
                  label = `Outline #${corner.id.split(':')[1]}`;
                } else if (corner.id.startsWith('hole:')) {
                  const parts = corner.id.split(':');
                  label = `Hole ${parts[1]} #${parts[2]}`;
                } else {
                  label = corner.id;
                }
              }
              return (
                <PaletteCheckbox
                  key={corner.id}
                  label={label}
                  checked={selectedCornerIds.has(corner.id)}
                  onChange={() => {
                    // Toggle corner selection
                    selectCorner(corner.id, true);

                    // Start operation if not active
                    if (!isChamferOperationActive) {
                      startOperation('chamfer-fillet');
                    }

                    // Update operation params
                    const newCorners = selectedCornerIds.has(corner.id)
                      ? Array.from(selectedCornerIds).filter(id => id !== corner.id)
                      : [...Array.from(selectedCornerIds), corner.id];

                    updateParams({
                      panelId: panel.id,
                      corners: newCorners,
                      radius: cornerRadius,
                      type: cornerFinishType,
                    });
                  }}
                />
              );
            })}
          </PaletteCheckboxGroup>

          <PaletteButtonRow>
            <PaletteButton
              variant="secondary"
              onClick={() => {
                const allCornerIds = detectedCorners.filter(c => c.eligible).map(c => c.id);
                selectCorners(allCornerIds);
                if (!isChamferOperationActive) {
                  startOperation('chamfer-fillet');
                }
                updateParams({
                  panelId: panel.id,
                  corners: allCornerIds,
                  radius: cornerRadius,
                  type: cornerFinishType,
                });
              }}
              disabled={selectedCornerIds.size === detectedCorners.filter(c => c.eligible).length}
            >
              Select All
            </PaletteButton>
          </PaletteButtonRow>

          <PaletteToggleGroup
            options={[
              { value: 'chamfer', label: 'Chamfer' },
              { value: 'fillet', label: 'Fillet' },
            ]}
            value={cornerFinishType}
            onChange={(v) => {
              if (!isChamferOperationActive && panel) {
                startOperation('chamfer-fillet');
              }
              updateParams({
                type: v as 'chamfer' | 'fillet',
              });
            }}
          />
          <PaletteSliderInput
            label="Radius"
            value={cornerRadius}
            min={1}
            max={Math.min(20, config.materialThickness * 3)}
            step={0.5}
            unit="mm"
            onChange={(value) => {
              if (!isChamferOperationActive && panel) {
                startOperation('chamfer-fillet');
              }
              updateParams({
                radius: value,
              });
            }}
          />
          <PaletteButtonRow>
            <PaletteButton
              variant="primary"
              onClick={() => {
                if (isChamferOperationActive) {
                  commitOperation();
                }
                clearCornerSelection();
                setActiveTool('select');
              }}
              disabled={selectedCornerIds.size === 0}
            >
              Apply
            </PaletteButton>
            <PaletteButton
              variant="secondary"
              onClick={() => {
                if (isChamferOperationActive) {
                  cancelOperation();
                }
                clearCornerSelection();
                setActiveTool('select');
              }}
            >
              Cancel
            </PaletteButton>
          </PaletteButtonRow>
        </FloatingPalette>
      )}

      {/* Floating palette for inset/outset tool */}
      {activeTool === 'inset' && panel && (
        <FloatingPalette
          position={insetPalettePosition}
          title="Edge Extension"
          onClose={() => {
            if (isInsetOperationActive) {
              cancelOperation();
            }
          }}
          onPositionChange={setInsetPalettePosition}
          minWidth={220}
          containerRef={containerRef}
        >
          <PaletteCheckboxGroup label="Select Edges">
            {(['top', 'bottom', 'left', 'right'] as EdgePosition[]).map(edge => {
              const editable = isEdgeEditable(edge);
              const currentExt = panel.edgeExtensions?.[edge] ?? 0;
              const label = `${edge.charAt(0).toUpperCase() + edge.slice(1)}${currentExt !== 0 ? ` (${currentExt > 0 ? '+' : ''}${currentExt.toFixed(1)})` : ''}`;

              return (
                <PaletteCheckbox
                  key={edge}
                  label={editable ? label : `${edge.charAt(0).toUpperCase() + edge.slice(1)} (locked)`}
                  checked={selectedEdges.has(edge)}
                  onChange={() => toggleEdgeSelection(edge)}
                  disabled={!editable}
                />
              );
            })}
          </PaletteCheckboxGroup>

          <PaletteNumberInput
            label="Extension"
            value={extensionAmount}
            min={-config.materialThickness}
            max={30}
            step={0.5}
            unit="mm"
            onChange={(value) => {
              if (isInsetOperationActive) {
                updateParams({ offset: value });
              }
            }}
          />

          <PaletteButtonRow>
            <PaletteButton
              variant="primary"
              onClick={handleApplyExtension}
              disabled={selectedEdges.size === 0}
            >
              Apply
            </PaletteButton>
            <PaletteButton
              variant="secondary"
              onClick={handleClearExtension}
              disabled={selectedEdges.size === 0}
            >
              Reset
            </PaletteButton>
          </PaletteButtonRow>
        </FloatingPalette>
      )}

      {/* Floating palette for path tool - shows when drawing */}
      {activeTool === 'path' && isPathDraftActive && panel && (
        <FloatingPalette
          position={pathPalettePosition}
          title={isEdgePathDraft ? `Edge Path: ${draftTarget?.edge}` : 'Freeform Path'}
          onClose={() => {
            cancelDraft();
            setActiveTool('select');
          }}
          onPositionChange={setPathPalettePosition}
          minWidth={200}
          containerRef={containerRef}
        >
          {isEdgePathDraft ? (
            <>
              <div style={{ fontSize: '12px', marginBottom: '8px', opacity: 0.8 }}>
                Click to add points along the edge. Points will define a custom outline.
              </div>
              <div style={{ fontSize: '12px', marginBottom: '8px' }}>
                Points: <strong>{draftPoints.length}</strong>
              </div>
              <PaletteCheckbox
                label="Mirror"
                checked={draftTarget?.mirrored ?? false}
                onChange={() => {
                  updateDraftTarget({ mirrored: !(draftTarget?.mirrored ?? false) });
                }}
              />
              {(draftTarget?.mirrored ?? false) && (
                <div style={{ fontSize: '11px', marginBottom: '8px', opacity: 0.6 }}>
                  Draw t=0..0.5; second half is auto-mirrored
                </div>
              )}
              <PaletteButtonRow>
                <PaletteButton
                  variant="primary"
                  onClick={() => {
                    if (draftPoints.length >= 2) {
                      commitDraft();
                      setActiveTool('select');
                    }
                  }}
                  disabled={draftPoints.length < 2}
                >
                  Apply
                </PaletteButton>
                <PaletteButton
                  variant="secondary"
                  onClick={() => {
                    cancelDraft();
                    setActiveTool('select');
                  }}
                >
                  Cancel
                </PaletteButton>
              </PaletteButtonRow>
            </>
          ) : (
            <>
              <PaletteToggleGroup
                options={[
                  { value: 'subtractive', label: 'Cut notch' },
                  { value: 'additive', label: 'Extend' },
                ]}
                value={polygonMode}
                onChange={(v) => setPolygonMode(v as 'additive' | 'subtractive')}
              />
              <div style={{ fontSize: '12px', marginTop: '8px', marginBottom: '4px' }}>
                Points: <strong>{draftPoints.length}</strong>
                {draftPoints.length >= 3 && ' (click start to close)'}
              </div>
              <div style={{ fontSize: '11px', marginBottom: '12px', opacity: 0.6 }}>
                Hold Shift for 45°/90° angles
              </div>
              <PaletteButtonRow>
                <PaletteButton
                  variant="primary"
                  onClick={() => {
                    if (draftPoints.length >= 3 && panel) {
                      // Apply the boolean operation directly
                      const engine = getEngine();
                      if (!engine) return;

                      const points = [...draftPoints];
                      const halfW = panel.width / 2;
                      const halfH = panel.height / 2;
                      const panelOutline = createRectPolygon(-halfW, -halfH, halfW, halfH);
                      const classification = classifyPolygon(points, panelOutline, 1.0);

                      let success = false;

                      if (classification === 'interior') {
                        if (polygonMode === 'subtractive') {
                          // Interior + cut = ADD_CUTOUT
                          const centerX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
                          const centerY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
                          const relativePoints = points.map(p => ({
                            x: p.x - centerX,
                            y: p.y - centerY,
                          }));

                          success = engine.dispatch({
                            type: 'ADD_CUTOUT',
                            targetId: 'main-assembly',
                            payload: {
                              panelId: panel.id,
                              cutout: {
                                id: crypto.randomUUID(),
                                type: 'path',
                                center: { x: centerX, y: centerY },
                                points: relativePoints,
                              },
                            },
                          });
                        } else {
                          console.warn('Cannot add material inside the panel');
                        }
                      } else if (classification === 'boundary') {
                        const operation = polygonMode === 'additive' ? 'union' : 'difference';
                        success = engine.dispatch({
                          type: 'APPLY_EDGE_OPERATION',
                          targetId: 'main-assembly',
                          payload: {
                            panelId: panel.id,
                            operation,
                            shape: points,
                          },
                        });
                      } else if (classification === 'exterior') {
                        if (polygonMode === 'additive') {
                          success = engine.dispatch({
                            type: 'APPLY_EDGE_OPERATION',
                            targetId: 'main-assembly',
                            payload: {
                              panelId: panel.id,
                              operation: 'union',
                              shape: points,
                            },
                          });
                        } else {
                          console.warn('Cannot cut hole outside the panel');
                        }
                      }

                      if (success) {
                        notifyEngineStateChanged();
                      }

                      cancelDraft();
                      setActiveTool('select');
                    }
                  }}
                  disabled={draftPoints.length < 3}
                >
                  Apply
                </PaletteButton>
                <PaletteButton
                  variant="secondary"
                  onClick={() => {
                    cancelDraft();
                    setActiveTool('select');
                  }}
                >
                  Cancel
                </PaletteButton>
              </PaletteButtonRow>
            </>
          )}
        </FloatingPalette>
      )}

      {/* Floating palette for additive/subtractive mode selection */}
      {pendingAdditiveShape && panel && (
        <FloatingPalette
          position={additiveModePosition}
          title="Shape Mode"
          onClose={handleAdditiveModeCancel}
          onPositionChange={setAdditiveModePosition}
          minWidth={220}
          containerRef={containerRef}
        >
          <div style={{ fontSize: '12px', marginBottom: '12px' }}>
            This shape extends beyond the panel on the{' '}
            <strong>{pendingAdditiveShape.openEdges.join(', ')}</strong> edge
            {pendingAdditiveShape.openEdges.length > 1 ? 's' : ''}.
          </div>
          <PaletteToggleGroup
            options={[
              { value: 'subtractive', label: 'Cut notch' },
              { value: 'additive', label: 'Extend' },
            ]}
            value={pendingAdditiveShape.mode}
            onChange={(v) => handleAdditiveModeToggle(v as 'additive' | 'subtractive')}
          />
          <PaletteButtonRow>
            <PaletteButton
              variant="primary"
              onClick={handleAdditiveModeApply}
            >
              Apply
            </PaletteButton>
            <PaletteButton
              variant="secondary"
              onClick={handleAdditiveModeCancel}
            >
              Cancel
            </PaletteButton>
          </PaletteButtonRow>
        </FloatingPalette>
      )}

      {/* Floating palette for polygon boolean operation selection */}
      {pendingPolygon && panel && (
        <FloatingPalette
          position={polygonPalettePosition}
          title="Polygon Operation"
          onClose={() => setPendingPolygon(null)}
          onPositionChange={setPolygonPalettePosition}
          minWidth={220}
          containerRef={containerRef}
        >
          <div style={{ fontSize: '12px', marginBottom: '12px' }}>
            Apply this {pendingPolygon.points.length}-point polygon to the panel.
          </div>
          <PaletteToggleGroup
            options={[
              { value: 'subtractive', label: 'Cut notch' },
              { value: 'additive', label: 'Extend' },
            ]}
            value={pendingPolygon.mode}
            onChange={(v) => setPendingPolygon(prev => prev ? { ...prev, mode: v as 'additive' | 'subtractive' } : null)}
          />
          <PaletteButtonRow>
            <PaletteButton
              variant="primary"
              onClick={() => {
                if (!pendingPolygon || !panel) return;
                const engine = getEngine();
                if (!engine) return;

                // Create panel outline for classification (simple rectangle in CENTERED coordinates)
                // The user's polygon points are in centered coordinates, so the panel outline must match
                const halfW = panel.width / 2;
                const halfH = panel.height / 2;
                const panelOutline = createRectPolygon(-halfW, -halfH, halfW, halfH);

                // Classify the polygon relative to the panel
                const classification = classifyPolygon(pendingPolygon.points, panelOutline, 1.0);
                console.log(`Polygon classification: ${classification}`);

                let success = false;

                if (classification === 'interior') {
                  // Polygon is entirely inside the panel
                  if (pendingPolygon.mode === 'subtractive') {
                    // Interior + cut = ADD_CUTOUT (THREE.js hole)
                    const centerX = pendingPolygon.points.reduce((sum, p) => sum + p.x, 0) / pendingPolygon.points.length;
                    const centerY = pendingPolygon.points.reduce((sum, p) => sum + p.y, 0) / pendingPolygon.points.length;
                    const relativePoints = pendingPolygon.points.map(p => ({
                      x: p.x - centerX,
                      y: p.y - centerY,
                    }));

                    success = engine.dispatch({
                      type: 'ADD_CUTOUT',
                      targetId: 'main-assembly',
                      payload: {
                        panelId: panel.id,
                        cutout: {
                          id: crypto.randomUUID(),
                          type: 'path',
                          center: { x: centerX, y: centerY },
                          points: relativePoints,
                        },
                      },
                    });
                  } else {
                    // Interior + add = Invalid (can't add material inside panel)
                    console.warn('Cannot add material inside the panel - polygon must cross boundary');
                  }
                } else if (classification === 'boundary') {
                  // Polygon crosses the panel boundary - use boolean edge operation
                  // This extracts affected edges and stores as customEdgePaths
                  const operation = pendingPolygon.mode === 'additive' ? 'union' : 'difference';
                  success = engine.dispatch({
                    type: 'APPLY_EDGE_OPERATION',
                    targetId: 'main-assembly',
                    payload: {
                      panelId: panel.id,
                      operation,
                      shape: pendingPolygon.points,
                    },
                  });
                } else if (classification === 'exterior') {
                  // Polygon is entirely outside the panel
                  if (pendingPolygon.mode === 'additive') {
                    // Exterior + add = use boolean union (extends panel)
                    success = engine.dispatch({
                      type: 'APPLY_EDGE_OPERATION',
                      targetId: 'main-assembly',
                      payload: {
                        panelId: panel.id,
                        operation: 'union',
                        shape: pendingPolygon.points,
                      },
                    });
                  } else {
                    // Exterior + cut = Invalid (nothing to cut)
                    console.warn('Cannot cut hole outside the panel');
                  }
                } else {
                  console.warn('Could not classify polygon location');
                }

                if (success) {
                  console.log(`Applied ${pendingPolygon.mode} polygon operation (${classification})`);
                } else if (classification !== 'invalid') {
                  console.warn('Polygon operation failed');
                }
                notifyEngineStateChanged();
                setPendingPolygon(null);
              }}
            >
              Apply
            </PaletteButton>
            <PaletteButton
              variant="secondary"
              onClick={() => setPendingPolygon(null)}
            >
              Cancel
            </PaletteButton>
          </PaletteButtonRow>
        </FloatingPalette>
      )}

      {/* Bottom-right overlay: Edge Status + Legend */}
      <div className="sketch-overlay-bottom-right">
        {/* Edge Status */}
        <div className="sketch-overlay-section">
          <h4>Edge Status</h4>
          <div className="edge-status-grid">
            {(['top', 'bottom', 'left', 'right'] as const).map(position => {
              const status = edgeStatuses.find(e => e.position === position);
              const isLocked = status?.status === 'locked';
              const extension = panel.edgeExtensions?.[position] ?? 0;

              return (
                <div key={position} className={`edge-status-item ${isLocked ? 'locked' : 'editable'}`}>
                  <span className="edge-name">{position}</span>
                  <span
                    className="edge-status-indicator"
                    style={{ backgroundColor: isLocked ? colors.edge.locked.base : colors.edge.unlocked.base }}
                  />
                  {!isLocked && extension !== 0 && (
                    <span className="edge-extension">{extension > 0 ? '+' : ''}{extension.toFixed(1)}</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="edge-status-summary">
            {edgeStatuses.filter(e => e.status === 'locked').length} locked, {edgeStatuses.filter(e => e.status !== 'locked').length} editable
          </div>
        </div>

        {/* Legend */}
        <div className="sketch-overlay-section">
          <h4>Legend</h4>
          <div className="sketch-legend-items">
            <div
              className={`legend-row ${legendHighlight === 'locked-edge' ? 'highlighted' : ''}`}
              onMouseEnter={() => setLegendHighlight('locked-edge')}
              onMouseLeave={() => setLegendHighlight(null)}
            >
              <span className="legend-swatch" style={{ backgroundColor: colors.edge.locked.base }} />
              <span>Locked edge (has joints)</span>
            </div>
            <div
              className={`legend-row ${legendHighlight === 'editable-edge' ? 'highlighted' : ''}`}
              onMouseEnter={() => setLegendHighlight('editable-edge')}
              onMouseLeave={() => setLegendHighlight(null)}
            >
              <span className="legend-swatch" style={{ backgroundColor: colors.edge.unlocked.base }} />
              <span>Editable edge</span>
            </div>
            <div
              className={`legend-row ${legendHighlight === 'boundary' ? 'highlighted' : ''}`}
              onMouseEnter={() => setLegendHighlight('boundary')}
              onMouseLeave={() => setLegendHighlight(null)}
            >
              <span className="legend-swatch" style={{ backgroundColor: colors.sketch.boundary }} />
              <span>Conceptual boundary</span>
            </div>
            <div
              className={`legend-row ${legendHighlight === 'safe-zone' ? 'highlighted' : ''}`}
              onMouseEnter={() => setLegendHighlight('safe-zone')}
              onMouseLeave={() => setLegendHighlight(null)}
            >
              <span className="legend-swatch" style={{ backgroundColor: colors.sketch.editable.base }} />
              <span>Safe zone (for cutouts)</span>
            </div>
            <div
              className={`legend-row ${legendHighlight === 'guide-lines' ? 'highlighted' : ''}`}
              onMouseEnter={() => setLegendHighlight('guide-lines')}
              onMouseLeave={() => setLegendHighlight(null)}
              onClick={() => setShowGuideLines(!showGuideLines)}
              style={{ cursor: 'pointer' }}
            >
              <span
                className="legend-swatch"
                style={{
                  backgroundColor: showGuideLines ? colors.sketch.guides.centerLine : 'transparent',
                  border: showGuideLines ? 'none' : `1px solid ${colors.sketch.guides.centerLine}`,
                }}
              />
              <span>Guide lines {showGuideLines ? '(on)' : '(off)'}</span>
            </div>
            {activeTool === 'chamfer' && (
              <div
                className={`legend-row ${legendHighlight === 'corner' ? 'highlighted' : ''}`}
                onMouseEnter={() => setLegendHighlight('corner')}
                onMouseLeave={() => setLegendHighlight(null)}
              >
                <span className="legend-swatch" style={{ backgroundColor: colors.corner.eligible.base }} />
                <span>Corner (click to select)</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
