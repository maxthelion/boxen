import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { useBoxStore, getAllSubdivisions } from '../store/useBoxStore';
import { PathPoint, PanelPath, FaceId, Face } from '../types';
import { getFaceEdgeStatuses, getDividerEdgeStatuses, EdgeStatusInfo } from '../utils/panelGenerator';
import { getEditableAreas, EditableArea } from '../utils/editableAreas';
import { detectMainCorners, DetectedCorner } from '../utils/cornerFinish';

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
const classifySegment = (
  p1: PathPoint,
  p2: PathPoint,
  panelWidth: number,
  panelHeight: number,
  tolerance: number = 1
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
const GridPattern: React.FC<{ gridSize: number; id: string }> = ({ gridSize, id }) => (
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
        stroke="#2a2a3e"
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
        stroke="#3a3a4e"
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
  const {
    sketchPanelId,
    panelCollection,
    exitSketchView,
    config,
    faces,
    rootVoid,
    setEdgeExtension,
  } = useBoxStore();

  // Pan and zoom state
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: 200, height: 200 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Edge interaction state
  const [hoveredEdge, setHoveredEdge] = useState<EdgePosition | null>(null);
  const [isDraggingEdge, setIsDraggingEdge] = useState(false);
  const [dragEdge, setDragEdge] = useState<EdgePosition | null>(null);
  const [dragStartPos, setDragStartPos] = useState<number>(0);
  const [dragStartExtension, setDragStartExtension] = useState<number>(0);

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
    const ext = panel.edgeExtensions ?? { top: 0, bottom: 0, left: 0, right: 0 };
    const originalWidth = panel.width - (ext.left ?? 0) - (ext.right ?? 0);
    const originalHeight = panel.height - (ext.top ?? 0) - (ext.bottom ?? 0);
    return getEdgeSegments(panel.outline.points, originalWidth, originalHeight);
  }, [panel]);

  // Get conceptual boundary (straight lines at ORIGINAL panel edges, before extensions)
  const conceptualBoundary = useMemo(() => {
    if (!panel) return null;
    // Calculate original dimensions by subtracting extensions
    const ext = panel.edgeExtensions ?? { top: 0, bottom: 0, left: 0, right: 0 };
    const originalWidth = panel.width - (ext.left ?? 0) - (ext.right ?? 0);
    const originalHeight = panel.height - (ext.top ?? 0) - (ext.bottom ?? 0);
    return getConceptualBoundary(originalWidth, originalHeight);
  }, [panel]);

  // Get joint segments (perpendicular parts of finger joints)
  // Use original dimensions like edgeSegments
  const jointSegments = useMemo(() => {
    if (!panel) return [];
    const ext = panel.edgeExtensions ?? { top: 0, bottom: 0, left: 0, right: 0 };
    const originalWidth = panel.width - (ext.left ?? 0) - (ext.right ?? 0);
    const originalHeight = panel.height - (ext.top ?? 0) - (ext.bottom ?? 0);
    return getJointSegments(panel.outline.points, originalWidth, originalHeight);
  }, [panel]);

  // Get editable areas (safe zones for cutouts)
  const editableAreas = useMemo((): EditableArea[] => {
    if (!panel) return [];
    return getEditableAreas(panel, faces, config);
  }, [panel, faces, config]);

  // Detect corners for potential finishing
  const detectedCorners = useMemo((): DetectedCorner[] => {
    if (!panel) return [];
    return detectMainCorners(panel.width, panel.height, config.materialThickness);
  }, [panel, config.materialThickness]);

  // Count edge types for display
  const lockedCount = edgeStatuses.filter(e => e.status === 'locked').length;
  const editableCount = edgeStatuses.filter(e => e.status !== 'locked').length;

  // Check if an edge is editable (unlocked or outward-only)
  const isEdgeEditable = useCallback((edge: EdgePosition): boolean => {
    const status = edgeStatuses.find(e => e.position === edge);
    return status?.status !== 'locked';
  }, [edgeStatuses]);

  // Convert screen coordinates to SVG coordinates
  const screenToSvg = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;

    const rect = svg.getBoundingClientRect();
    // Note: Y is flipped in our rendering
    const x = ((clientX - rect.left) / rect.width) * viewBox.width + viewBox.x;
    const y = -(((clientY - rect.top) / rect.height) * viewBox.height + viewBox.y);

    return { x, y };
  }, [viewBox]);

  // Find which edge (if any) is near a point
  const findEdgeAtPoint = useCallback((svgX: number, svgY: number): EdgePosition | null => {
    if (!edgeSegments || !panel) return null;

    const hitDistance = Math.max(3, viewBox.width / 50); // Scale hit area with zoom

    for (const edge of ['top', 'bottom', 'left', 'right'] as EdgePosition[]) {
      const segments = edgeSegments[edge];
      for (const seg of segments) {
        const dist = distanceToSegment(svgX, svgY, seg.start.x, seg.start.y, seg.end.x, seg.end.y);
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
    } else {
      // Start panning
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  }, [screenToSvg, findEdgeAtPoint, isEdgeEditable, panel]);

  // Handle mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const svgPos = screenToSvg(e.clientX, e.clientY);

    if (isDraggingEdge && dragEdge && svgPos && panel) {
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

      // Calculate new extension value
      const newExtension = dragStartExtension + delta;
      // Clamp to reasonable range
      const clampedExtension = Math.max(-config.materialThickness, Math.min(20, newExtension));

      setEdgeExtension(panel.id, dragEdge, clampedExtension);
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
      // Update hovered edge
      const edge = findEdgeAtPoint(svgPos.x, svgPos.y);
      setHoveredEdge(edge);
    }
  }, [isDraggingEdge, dragEdge, dragStartPos, dragStartExtension, isPanning, panStart, viewBox, screenToSvg, findEdgeAtPoint, panel, setEdgeExtension, config.materialThickness]);

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setIsDraggingEdge(false);
    setDragEdge(null);
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        exitSketchView();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [exitSketchView]);

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
      return isHovered ? '#6ab0f9' : '#4a90d9'; // Blue for locked
    } else {
      if (isDragging) return '#ffb060'; // Bright orange when dragging
      if (isHovered) return '#f0a050'; // Light orange when hovered
      return '#e09040'; // Orange for editable
    }
  };

  // Determine cursor based on hovered edge
  const getCursor = (): string => {
    if (isDraggingEdge) {
      if (dragEdge === 'top' || dragEdge === 'bottom') return 'ns-resize';
      return 'ew-resize';
    }
    if (hoveredEdge && isEdgeEditable(hoveredEdge)) {
      if (hoveredEdge === 'top' || hoveredEdge === 'bottom') return 'ns-resize';
      return 'ew-resize';
    }
    if (isPanning) return 'grabbing';
    return 'grab';
  };

  return (
    <div className={`sketch-view-2d ${className || ''}`}>
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
        <GridPattern gridSize={gridSize} id="sketch-grid" />
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
          stroke="#4a4a6a"
          strokeWidth="0.5"
          strokeDasharray="4 4"
        />
        <line
          x1={0}
          y1={viewBox.y - viewBox.height}
          x2={0}
          y2={viewBox.y + viewBox.height * 2}
          stroke="#4a4a6a"
          strokeWidth="0.5"
          strokeDasharray="4 4"
        />

        {/* Y-axis is flipped in SVG, so we apply a transform */}
        <g transform="scale(1, -1)">
          {/* Editable areas (safe zones for cutouts) */}
          {editableAreas.map((area, i) => (
            <rect
              key={`editable-${i}`}
              x={area.x}
              y={area.y}
              width={area.width}
              height={area.height}
              fill="#2ecc71"
              fillOpacity={0.08}
              stroke="#2ecc71"
              strokeWidth={outlineStrokeWidth * 0.5}
              strokeDasharray={`${4 * strokeScale} ${2 * strokeScale}`}
              opacity={0.4}
            />
          ))}

          {/* Conceptual boundary lines (dashed, showing ideal panel edges) */}
          {conceptualBoundary && (['top', 'bottom', 'left', 'right'] as EdgePosition[]).map(edge => {
            const boundary = conceptualBoundary[edge];
            const status = edgeStatuses.find(e => e.position === edge);
            // Edges with joints: locked (male/tabs) or outward-only (female/slots)
            const hasJoints = status?.status === 'locked' || status?.status === 'outward-only';

            // Only show conceptual boundary if this edge has joints (difference from actual)
            if (!hasJoints) return null;

            return (
              <line
                key={`boundary-${edge}`}
                x1={boundary.start.x}
                y1={boundary.start.y}
                x2={boundary.end.x}
                y2={boundary.end.y}
                stroke="#6a6a8a"
                strokeWidth={outlineStrokeWidth * 0.5}
                strokeDasharray={`${3 * strokeScale} ${2 * strokeScale}`}
                opacity={0.6}
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
                    strokeWidth={outlineStrokeWidth}
                    strokeLinecap="round"
                  />
                ))}
              </g>
            );
          })}

          {/* Joint line segments (perpendicular parts connecting fingers) */}
          {jointSegments.map((joint, i) => {
            const edgeColor = getEdgeColor(joint.nearEdge);
            return (
              <line
                key={`joint-${i}`}
                x1={joint.start.x}
                y1={joint.start.y}
                x2={joint.end.x}
                y2={joint.end.y}
                stroke={edgeColor}
                strokeWidth={outlineStrokeWidth}
                strokeLinecap="round"
                opacity={0.8}
              />
            );
          })}

          {/* Holes */}
          {panel.holes.map((hole) => (
            <path
              key={hole.id}
              d={pathToSvgD(hole.path.points, hole.path.closed)}
              fill="#1a1a2e"
              stroke="#666"
              strokeWidth={holeStrokeWidth}
            />
          ))}

          {/* Corner indicators */}
          {detectedCorners.filter(c => c.eligible).map((corner) => (
            <g key={corner.id}>
              <circle
                cx={corner.position.x}
                cy={corner.position.y}
                r={Math.max(2, strokeScale * 3)}
                fill="#9b59b6"
                fillOpacity={0.3}
                stroke="#9b59b6"
                strokeWidth={outlineStrokeWidth * 0.5}
              />
            </g>
          ))}
        </g>

        {/* Dimension labels */}
        <text
          x={0}
          y={-panel.height / 2 - 8}
          textAnchor="middle"
          fill="#888"
          fontSize="10"
          fontFamily="monospace"
        >
          {panel.width.toFixed(1)}
        </text>
        <text
          x={panel.width / 2 + 8}
          y={0}
          textAnchor="start"
          fill="#888"
          fontSize="10"
          fontFamily="monospace"
          transform={`rotate(-90, ${panel.width / 2 + 8}, 0)`}
        >
          {panel.height.toFixed(1)}
        </text>
      </svg>

      {/* Legend */}
      <div className="sketch-legend">
        <div className="legend-item">
          <span className="legend-color" style={{ background: '#4a90d9' }}></span>
          <span>Locked edge (has joints)</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ background: '#e09040' }}></span>
          <span>Editable edge (drag to move)</span>
        </div>
        <div className="legend-item">
          <span className="legend-line" style={{ borderTop: '1px dashed #6a6a8a' }}></span>
          <span>Conceptual boundary</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ background: '#2ecc71', opacity: 0.5 }}></span>
          <span>Safe zone (for cutouts)</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ background: '#9b59b6', borderRadius: '50%' }}></span>
          <span>Corner (chamfer/fillet)</span>
        </div>
        <div className="legend-info">
          {lockedCount} locked, {editableCount} editable
        </div>
        {hoveredEdge && (
          <div className="legend-info">
            {hoveredEdge}: {isEdgeEditable(hoveredEdge) ? 'drag to extend' : 'locked'}
          </div>
        )}
      </div>
    </div>
  );
};
