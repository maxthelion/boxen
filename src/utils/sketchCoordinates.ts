/**
 * Pure coordinate-transform, snapping, hit-detection, and boundary-classification
 * functions extracted from SketchView2D.tsx so they can be unit-tested without
 * rendering a React component.
 */

import { PathPoint } from '../types';
import { SafeSpaceRegion, isPointInSafeSpace } from '../engine/safeSpace';

// ── Types ────────────────────────────────────────────────────────────────────

export type EdgePosition = 'top' | 'bottom' | 'left' | 'right';

export type ClickLocation =
  | { type: 'boundary'; edge: EdgePosition }
  | { type: 'safe-space' }
  | { type: 'open-space' }
  | { type: 'restricted' };

/** Bounding rect as returned by Element.getBoundingClientRect() */
export interface SvgBBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The SVG viewBox as { x, y, width, height } */
export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ── Distance / geometry helpers ──────────────────────────────────────────────

/** Distance from point (px,py) to the line segment (x1,y1)–(x2,y2). */
export const distanceToSegment = (
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
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

// ── Angle snapping ───────────────────────────────────────────────────────────

/**
 * Constrain a point to the nearest 45° angle from a reference point.
 * Used when Shift is held during path drawing.
 */
export const constrainAngle = (
  fromPoint: PathPoint,
  toPoint: { x: number; y: number },
): PathPoint => {
  const dx = toPoint.x - fromPoint.x;
  const dy = toPoint.y - fromPoint.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance < 0.001) return { x: fromPoint.x, y: fromPoint.y };

  const angle = Math.atan2(dy, dx);
  const snapAngle = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);

  return {
    x: fromPoint.x + distance * Math.cos(snapAngle),
    y: fromPoint.y + distance * Math.sin(snapAngle),
  };
};

// ── Edge-path interpolation ──────────────────────────────────────────────────

/**
 * Get the offset of the current edge path at a given t position.
 * Returns 0 when no custom path exists for the edge.
 */
export const getEdgePathOffsetAtT = (
  customEdgePaths: Array<{ edge: string; points: Array<{ t: number; offset: number }> }>,
  edge: EdgePosition,
  t: number,
): number => {
  const edgePath = customEdgePaths.find(p => p.edge === edge);
  if (!edgePath || edgePath.points.length === 0) {
    return 0;
  }

  const sorted = [...edgePath.points].sort((a, b) => a.t - b.t);

  if (t <= sorted[0].t) return sorted[0].offset;
  if (t >= sorted[sorted.length - 1].t) return sorted[sorted.length - 1].offset;

  for (let i = 0; i < sorted.length - 1; i++) {
    if (t >= sorted[i].t && t <= sorted[i + 1].t) {
      const t0 = sorted[i].t;
      const t1 = sorted[i + 1].t;
      const o0 = sorted[i].offset;
      const o1 = sorted[i + 1].offset;
      const ratio = (t - t0) / (t1 - t0);
      return o0 + ratio * (o1 - o0);
    }
  }

  return 0;
};

// ── Segment classification ───────────────────────────────────────────────────

/**
 * Classify a line segment as belonging to a panel edge based on position.
 * Tolerance must be larger than material thickness to account for corner insets.
 */
export const classifySegment = (
  p1: PathPoint,
  p2: PathPoint,
  panelWidth: number,
  panelHeight: number,
  tolerance: number = 5,
): EdgePosition | null => {
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

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

/** Get outline segments grouped by their parent edge. */
export const getEdgeSegments = (
  points: PathPoint[],
  panelWidth: number,
  panelHeight: number,
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

// ── Conceptual boundary & joint segments ─────────────────────────────────────

/** Conceptual boundary lines for the panel (edges without joints). */
export const getConceptualBoundary = (
  panelWidth: number,
  panelHeight: number,
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

/** Identify joint segments (perpendicular to edges, connecting fingers). */
export const getJointSegments = (
  points: PathPoint[],
  panelWidth: number,
  panelHeight: number,
  tolerance: number = 1,
): { start: PathPoint; end: PathPoint; nearEdge: EdgePosition }[] => {
  const joints: { start: PathPoint; end: PathPoint; nearEdge: EdgePosition }[] = [];
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];

    const edge = classifySegment(p1, p2, panelWidth, panelHeight, tolerance);
    if (edge) continue;

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

// ── Click classification ─────────────────────────────────────────────────────

/**
 * Classify where a click occurred relative to the panel.
 * Priority: boundary > open-space > safe-space > restricted
 */
export const classifyClickLocation = (
  svgX: number,
  svgY: number,
  panelWidth: number,
  panelHeight: number,
  safeSpace: SafeSpaceRegion | null,
  _edgeSegments: Record<EdgePosition, { start: PathPoint; end: PathPoint }[]> | null,
  hitThreshold: number,
): ClickLocation => {
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  const distToTop = Math.abs(svgY - halfH);
  const distToBottom = Math.abs(svgY + halfH);
  const distToLeft = Math.abs(svgX + halfW);
  const distToRight = Math.abs(svgX - halfW);

  const boundaryThreshold = hitThreshold * 2;

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

  const inPanelBounds = svgX >= -halfW && svgX <= halfW && svgY >= -halfH && svgY <= halfH;
  if (!inPanelBounds) {
    return { type: 'open-space' };
  }

  if (safeSpace && isPointInSafeSpace(svgX, svgY, safeSpace)) {
    return { type: 'safe-space' };
  }

  return { type: 'restricted' };
};

// ── Screen ↔ SVG coordinate transforms ───────────────────────────────────────

/**
 * Convert screen (client) coordinates to SVG coordinates.
 * Accounts for preserveAspectRatio="xMidYMid meet" centering.
 * The Y axis is flipped (scale(1,-1) in the SVG transform).
 */
export const screenToSvgCoords = (
  clientX: number,
  clientY: number,
  svgBBox: SvgBBox,
  viewBox: ViewBox,
): { x: number; y: number } => {
  const svgAspect = svgBBox.width / svgBBox.height;
  const viewBoxAspect = viewBox.width / viewBox.height;

  let renderWidth: number;
  let renderHeight: number;
  let offsetX: number;
  let offsetY: number;

  if (svgAspect > viewBoxAspect) {
    renderHeight = svgBBox.height;
    renderWidth = svgBBox.height * viewBoxAspect;
    offsetX = (svgBBox.width - renderWidth) / 2;
    offsetY = 0;
  } else {
    renderWidth = svgBBox.width;
    renderHeight = svgBBox.width / viewBoxAspect;
    offsetX = 0;
    offsetY = (svgBBox.height - renderHeight) / 2;
  }

  const localX = clientX - svgBBox.left - offsetX;
  const localY = clientY - svgBBox.top - offsetY;

  const x = (localX / renderWidth) * viewBox.width + viewBox.x;
  // Y is flipped in the rendering via scale(1, -1)
  const y = -((localY / renderHeight) * viewBox.height + viewBox.y);

  return { x, y };
};

// ── SVG ↔ edge-relative coordinate transforms ───────────────────────────────

/**
 * Convert SVG coordinates to edge-relative (t, offset) coordinates.
 * t: 0–1 along edge from start to end.
 * offset: perpendicular distance from edge (positive = outward).
 */
export const svgToEdgeCoords = (
  svgX: number,
  svgY: number,
  edge: EdgePosition,
  panelWidth: number,
  panelHeight: number,
): { t: number; offset: number } | null => {
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  let t: number;
  let offset: number;

  switch (edge) {
    case 'top':
      t = (svgX + halfW) / panelWidth;
      offset = svgY - halfH;
      break;
    case 'bottom':
      t = (svgX + halfW) / panelWidth;
      offset = -(svgY + halfH);
      break;
    case 'left':
      t = (svgY + halfH) / panelHeight;
      offset = -(svgX + halfW);
      break;
    case 'right':
      t = (svgY + halfH) / panelHeight;
      offset = svgX - halfW;
      break;
    default:
      return null;
  }

  t = Math.max(0, Math.min(1, t));
  return { t, offset };
};

/**
 * Convert edge-relative coordinates back to SVG coordinates.
 */
export const edgeCoordsToSvg = (
  t: number,
  offset: number,
  edge: EdgePosition,
  panelWidth: number,
  panelHeight: number,
): { x: number; y: number } | null => {
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  switch (edge) {
    case 'top':
      return { x: t * panelWidth - halfW, y: halfH + offset };
    case 'bottom':
      return { x: t * panelWidth - halfW, y: -halfH - offset };
    case 'left':
      return { x: -halfW - offset, y: t * panelHeight - halfH };
    case 'right':
      return { x: halfW + offset, y: t * panelHeight - halfH };
    default:
      return null;
  }
};

// ── Hit detection ────────────────────────────────────────────────────────────

/** Find which edge (if any) is near a point. */
export const findEdgeAtPoint = (
  svgX: number,
  svgY: number,
  edgeSegments: Record<EdgePosition, { start: PathPoint; end: PathPoint }[]>,
  hitDistance: number,
): EdgePosition | null => {
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
};

/** Find which corner (if any) is near a point. */
export const findCornerAtPoint = <T extends { eligible?: boolean; position: { x: number; y: number } }>(
  svgX: number,
  svgY: number,
  corners: T[],
  hitDistance: number,
): T | null => {
  for (const corner of corners) {
    if (corner.eligible === false) continue;
    const dx = svgX - corner.position.x;
    const dy = svgY - corner.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < hitDistance) {
      return corner;
    }
  }
  return null;
};

// ── Hit threshold computation ────────────────────────────────────────────────

export type HitThresholdType = 'edge' | 'corner' | 'merge' | 'boundary';

/** Compute a zoom-adaptive hit-test threshold. */
export const computeHitThreshold = (
  viewBoxWidth: number,
  type: HitThresholdType,
): number => {
  switch (type) {
    case 'edge':
      return Math.max(4, viewBoxWidth / 50);
    case 'corner':
      return Math.max(10, viewBoxWidth / 20);
    case 'merge':
      return Math.max(8, viewBoxWidth / 25);
    case 'boundary': {
      const base = Math.max(8, viewBoxWidth / 25);
      return base * 2;
    }
  }
};
