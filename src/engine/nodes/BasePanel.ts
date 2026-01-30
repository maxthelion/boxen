/**
 * BasePanel - Abstract base for face panels and divider panels
 *
 * Shared functionality:
 * - 2D outline with finger joint edges
 * - Edge extensions
 * - 3D transform (position/rotation)
 * - Hole management (slots for intersecting panels)
 *
 * Subclasses:
 * - FacePanelNode: belongs to an assembly, has a faceId
 * - DividerPanelNode: belongs to a void, has axis and split position
 */

import { BaseNode } from './BaseNode';
import {
  EdgePosition,
  EdgeExtensions,
  Transform3D,
  Point2D,
  Point3D,
  PanelEdge,
  PanelHole,
  PanelOutline,
  BasePanelSnapshot,
  MaterialConfig,
  EdgeAnchor,
  FaceId,
  JointGender,
  Axis,
  AssemblyFingerData,
  EdgeStatusInfo,
} from '../types';
import { generateFingerJointPathV2, Point } from '../../utils/fingerJoints';

export interface PanelDimensions {
  width: number;   // 2D width (horizontal in local coords)
  height: number;  // 2D height (vertical in local coords)
}

export interface FeetParams {
  height: number;    // How far feet extend downward
  width: number;     // Width of each foot
  inset: number;     // Inset from panel edges
}

export interface EdgeConfig {
  position: EdgePosition;
  hasTabs: boolean;
  meetsFaceId: string | null;
  meetsDividerId: string | null;
  // Finger joint information
  gender: JointGender | null;  // male = tabs out, female = slots, null = straight edge
  axis: Axis | null;           // Which world axis this edge runs along
}

/**
 * Abstract base class for all panel types
 */
export abstract class BasePanel extends BaseNode {
  // Input properties
  protected _edgeExtensions: EdgeExtensions = { top: 0, bottom: 0, left: 0, right: 0 };
  protected _visible: boolean = true;

  // Cached derived values (recomputed when dirty)
  protected _cachedDimensions: PanelDimensions | null = null;
  protected _cachedOutline: PanelOutline | null = null;
  protected _cachedEdges: PanelEdge[] | null = null;
  protected _cachedTransform: Transform3D | null = null;
  protected _cachedEdgeAnchors: EdgeAnchor[] | null = null;

  constructor(id?: string) {
    super(id);
  }

  // ==========================================================================
  // Input Property Accessors
  // ==========================================================================

  get edgeExtensions(): EdgeExtensions {
    return { ...this._edgeExtensions };
  }

  setEdgeExtension(edge: EdgePosition, value: number): void {
    if (this._edgeExtensions[edge] !== value) {
      this._edgeExtensions[edge] = value;
      this.markDirty();
    }
  }

  setEdgeExtensions(extensions: Partial<EdgeExtensions>): void {
    let changed = false;
    for (const [edge, value] of Object.entries(extensions) as [EdgePosition, number][]) {
      if (this._edgeExtensions[edge] !== value) {
        this._edgeExtensions[edge] = value;
        changed = true;
      }
    }
    if (changed) {
      this.markDirty();
    }
  }

  get visible(): boolean {
    return this._visible;
  }

  setVisible(visible: boolean): void {
    if (this._visible !== visible) {
      this._visible = visible;
      this.markDirty();
    }
  }

  // ==========================================================================
  // Abstract Methods - Must be implemented by subclasses
  // ==========================================================================

  /**
   * Get the material configuration from the parent assembly
   */
  abstract getMaterial(): MaterialConfig;

  /**
   * Compute the base dimensions (before extensions)
   */
  abstract computeDimensions(): PanelDimensions;

  /**
   * Compute which edges meet other panels (for finger joints)
   */
  abstract computeEdgeConfigs(): EdgeConfig[];

  /**
   * Compute the 3D transform (position and rotation)
   */
  abstract computeTransform(): Transform3D;

  /**
   * Compute holes (slots for intersecting panels)
   */
  abstract computeHoles(): PanelHole[];

  /**
   * Get the face ID that an edge mates with (for face panels)
   * Returns null if the edge doesn't mate with another face
   */
  abstract getMatingFaceId(edgePosition: EdgePosition): FaceId | null;

  /**
   * Get the assembly's finger data (for finger joint generation)
   * Returns null if finger joints should not be generated
   */
  abstract getFingerData(): AssemblyFingerData | null;

  /**
   * Compute edge statuses for inset/outset operations.
   * Determines which edges can be modified:
   * - locked: male joint, cannot modify
   * - outward-only: female joint, can extend outward only
   * - unlocked: open face, can extend or retract
   */
  abstract computeEdgeStatuses(): EdgeStatusInfo[];

  /**
   * Get feet configuration if this panel should have feet
   * Override in subclass to enable feet for specific panels
   * Returns null if no feet should be applied
   */
  protected getFeetConfig(): { edge: 'bottom'; params: FeetParams } | null {
    return null;
  }

  // ==========================================================================
  // Derived Value Computation
  // ==========================================================================

  /**
   * Get panel dimensions (cached)
   */
  getDimensions(): PanelDimensions {
    if (!this._cachedDimensions) {
      this._cachedDimensions = this.computeDimensions();
    }
    return this._cachedDimensions;
  }

  /**
   * Get edge configurations (cached)
   */
  getEdges(): PanelEdge[] {
    if (!this._cachedEdges) {
      const configs = this.computeEdgeConfigs();
      this._cachedEdges = configs.map(c => ({
        position: c.position,
        hasTabs: c.hasTabs,
        meetsFaceId: c.meetsFaceId as any,
        meetsDividerId: c.meetsDividerId,
      }));
    }
    return this._cachedEdges;
  }

  /**
   * Get 3D transform (cached)
   */
  getTransform(): Transform3D {
    if (!this._cachedTransform) {
      this._cachedTransform = this.computeTransform();
    }
    return this._cachedTransform;
  }

  /**
   * Get panel outline with finger joints (cached)
   */
  getOutline(): PanelOutline {
    if (!this._cachedOutline) {
      this._cachedOutline = this.computeOutline();
    }
    return this._cachedOutline;
  }

  /**
   * Get the outward direction for an edge (away from panel center)
   */
  protected getEdgeOutwardDirection(position: EdgePosition): Point {
    switch (position) {
      case 'top': return { x: 0, y: 1 };
      case 'bottom': return { x: 0, y: -1 };
      case 'left': return { x: -1, y: 0 };
      case 'right': return { x: 1, y: 0 };
    }
  }

  /**
   * Get blocking ranges for finger generation on each edge.
   * Subclasses can override this to provide positions where fingers should be skipped
   * (e.g., cross-lap positions for dividers).
   *
   * Returns a map from edge position to array of blocking ranges (in axis coordinates).
   */
  protected getFingerBlockingRanges(): Map<EdgePosition, { start: number; end: number }[]> {
    return new Map();
  }

  /**
   * Compute the full outline with finger joints
   * Uses edge configs to determine which edges have tabs/slots
   */
  protected computeOutline(): PanelOutline {
    const dims = this.getDimensions();
    const edgeConfigs = this.computeEdgeConfigs();
    const material = this.getMaterial();
    const holes = this.computeHoles();
    const fingerData = this.getFingerData();

    // Calculate corners with insets for solid faces
    const halfW = dims.width / 2;
    const halfH = dims.height / 2;
    const mt = material.thickness;

    // Helper to get edge config by position
    const getEdgeConfig = (pos: EdgePosition): EdgeConfig | undefined =>
      edgeConfigs.find(e => e.position === pos);

    const topEdge = getEdgeConfig('top');
    const bottomEdge = getEdgeConfig('bottom');
    const leftEdge = getEdgeConfig('left');
    const rightEdge = getEdgeConfig('right');

    // Check if edge has male joints (tabs extending out)
    const edgeIsMale = (edge: EdgeConfig | undefined): boolean =>
      edge?.gender === 'male';

    const topHasTabs = edgeIsMale(topEdge);
    const bottomHasTabs = edgeIsMale(bottomEdge);
    const leftHasTabs = edgeIsMale(leftEdge);
    const rightHasTabs = edgeIsMale(rightEdge);

    // Finger corners - used for finger pattern generation and base outline
    // These must be consistent across all panels for proper joint alignment
    const fingerCorners = {
      topLeft: {
        x: -halfW + (leftHasTabs ? mt : 0),
        y: halfH - (topHasTabs ? mt : 0),
      },
      topRight: {
        x: halfW - (rightHasTabs ? mt : 0),
        y: halfH - (topHasTabs ? mt : 0),
      },
      bottomRight: {
        x: halfW - (rightHasTabs ? mt : 0),
        y: -halfH + (bottomHasTabs ? mt : 0),
      },
      bottomLeft: {
        x: -halfW + (leftHasTabs ? mt : 0),
        y: -halfH + (bottomHasTabs ? mt : 0),
      },
    };

    // Get blocking ranges for finger generation (can be overridden by subclasses)
    const fingerBlockingRanges = this.getFingerBlockingRanges();

    // Helper to generate edge points with finger joints
    // This is simplified - no extension handling, just finger patterns
    const generateEdgePoints = (
      fingerStart: Point,
      fingerEnd: Point,
      edgeConfig: EdgeConfig | undefined
    ): Point[] => {
      // If no finger joints or no finger data, return just the end point
      if (!edgeConfig?.gender || !edgeConfig?.axis || !fingerData) {
        return [fingerEnd];
      }

      const axisFingerPoints = fingerData[edgeConfig.axis];
      if (!axisFingerPoints || axisFingerPoints.points.length === 0) {
        return [fingerEnd];
      }

      // Calculate edge axis positions
      const edgeStartPos = this.computeEdgeAxisPosition(edgeConfig.position, 'start', edgeConfig.axis);
      const edgeEndPos = this.computeEdgeAxisPosition(edgeConfig.position, 'end', edgeConfig.axis);

      // Get edge-specific blocking ranges
      const edgeBlockingRanges = fingerBlockingRanges.get(edgeConfig.position) || [];

      // Generate finger joint path
      const fingerPath = generateFingerJointPathV2(fingerStart, fingerEnd, {
        fingerPoints: axisFingerPoints,
        gender: edgeConfig.gender,
        materialThickness: mt,
        edgeStartPos,
        edgeEndPos,
        yUp: true,
        outwardDirection: this.getEdgeOutwardDirection(edgeConfig.position),
        fingerBlockingRanges: edgeBlockingRanges,
      });

      // Return all points except the first (which is fingerStart, already in path)
      return fingerPath.slice(1);
    };

    // Build outline points (clockwise from top-left) using finger corners
    const points: Point2D[] = [];

    // Start at top-left corner
    points.push(fingerCorners.topLeft);

    // Top edge (left to right)
    points.push(...generateEdgePoints(
      fingerCorners.topLeft,
      fingerCorners.topRight,
      topEdge
    ));

    // Right edge (top to bottom)
    points.push(...generateEdgePoints(
      fingerCorners.topRight,
      fingerCorners.bottomRight,
      rightEdge
    ));

    // Bottom edge (right to left)
    points.push(...generateEdgePoints(
      fingerCorners.bottomRight,
      fingerCorners.bottomLeft,
      bottomEdge
    ));

    // Left edge (bottom to top) - path auto-closes to start
    const leftEdgePoints = generateEdgePoints(
      fingerCorners.bottomLeft,
      fingerCorners.topLeft,
      leftEdge
    );
    // Don't add the last point if it's the same as the first (auto-close)
    for (const pt of leftEdgePoints) {
      const dx = Math.abs(pt.x - fingerCorners.topLeft.x);
      const dy = Math.abs(pt.y - fingerCorners.topLeft.y);
      if (dx > 0.001 || dy > 0.001) {
        points.push(pt);
      }
    }

    // Apply extensions as post-processing (similar to feet)
    // Extensions replace edge segments with: cap + reversed finger path
    const extensions = this._edgeExtensions;
    if (extensions.top > 0.001) {
      this.applyExtensionToEdge(points, 'top', extensions.top, fingerCorners, fingerData, topEdge, mt, fingerBlockingRanges);
    }
    if (extensions.right > 0.001) {
      this.applyExtensionToEdge(points, 'right', extensions.right, fingerCorners, fingerData, rightEdge, mt, fingerBlockingRanges);
    }
    if (extensions.bottom > 0.001) {
      this.applyExtensionToEdge(points, 'bottom', extensions.bottom, fingerCorners, fingerData, bottomEdge, mt, fingerBlockingRanges);
    }
    if (extensions.left > 0.001) {
      this.applyExtensionToEdge(points, 'left', extensions.left, fingerCorners, fingerData, leftEdge, mt, fingerBlockingRanges);
    }

    // Apply feet if configured
    const feetConfig = this.getFeetConfig();
    if (feetConfig && feetConfig.edge === 'bottom') {
      this.applyFeetToOutline(points, fingerCorners, mt, feetConfig.params);
    }

    return {
      points,
      holes,
    };
  }

  /**
   * Apply feet path to the outline
   * Replaces the bottom edge segment with a feet path
   */
  protected applyFeetToOutline(
    points: Point2D[],
    fingerCorners: { bottomRight: Point2D; bottomLeft: Point2D },
    materialThickness: number,
    feetParams: FeetParams
  ): void {
    const { height: feetHeight, width: footWidth, inset } = feetParams;
    const baseY = fingerCorners.bottomRight.y;
    const bottomRightX = fingerCorners.bottomRight.x;
    const bottomLeftX = fingerCorners.bottomLeft.x;

    // Find indices of points near bottom corners
    const tolerance = 0.1;
    let bottomRightIdx = -1;
    let bottomLeftIdx = -1;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      // Look for points at the bottom Y level
      if (Math.abs(p.y - baseY) < tolerance) {
        if (Math.abs(p.x - bottomRightX) < tolerance && bottomRightIdx === -1) {
          bottomRightIdx = i;
        }
        if (Math.abs(p.x - bottomLeftX) < tolerance) {
          bottomLeftIdx = i;
        }
      }
    }

    // If we found both corners, replace the segment between them with feet path
    if (bottomRightIdx !== -1 && bottomLeftIdx !== -1 && bottomRightIdx < bottomLeftIdx) {
      const feetPath = this.generateFeetPath(
        bottomRightX,
        bottomLeftX,
        baseY,
        feetParams,
        materialThickness
      );

      // Remove the old bottom segment and insert feet path
      const beforeBottom = points.slice(0, bottomRightIdx);
      const afterBottom = points.slice(bottomLeftIdx + 1);

      // Rebuild outline: before + feet path + after
      points.length = 0;
      points.push(...beforeBottom);
      points.push(...feetPath);
      points.push(...afterBottom);
    }
  }

  /**
   * Generate a feet path for an edge
   * Creates two feet at the corners with a gap in the middle
   */
  protected generateFeetPath(
    startX: number,      // X position of start corner (right side for bottom edge)
    endX: number,        // X position of end corner (left side for bottom edge)
    baseY: number,       // Y position of the finger joint edge (original panel bottom)
    feetParams: FeetParams,
    materialThickness: number
  ): Point2D[] {
    const { height: feetHeight, width: footWidth, inset } = feetParams;

    // The feet extend from baseY down
    // First extend by materialThickness to clear the joint, then by feetHeight for the feet
    const jointClearanceY = baseY - materialThickness;  // Level where joint is cleared
    const feetBottomY = jointClearanceY - feetHeight;   // Bottom of feet

    // Foot positions (accounting for inset from panel edges)
    // For bottom edge going right to left: startX is positive (right), endX is negative (left)
    const rightFootOuterX = startX - inset;
    const rightFootInnerX = rightFootOuterX - footWidth;
    const leftFootInnerX = endX + inset + footWidth;
    const leftFootOuterX = endX + inset;

    // Generate the path points
    const points: Point2D[] = [];

    // Start at right corner, at the joint level (finger pattern ends here)
    // 1. Go down to feet bottom at right foot outer edge
    points.push({ x: rightFootOuterX, y: baseY });
    points.push({ x: rightFootOuterX, y: feetBottomY });

    // 2. Go left along feet bottom for foot width
    points.push({ x: rightFootInnerX, y: feetBottomY });

    // 3. Go up to joint clearance level
    points.push({ x: rightFootInnerX, y: jointClearanceY });

    // 4. Go left across the gap to left foot inner edge
    points.push({ x: leftFootInnerX, y: jointClearanceY });

    // 5. Go down to feet bottom
    points.push({ x: leftFootInnerX, y: feetBottomY });

    // 6. Go left along feet bottom for foot width
    points.push({ x: leftFootOuterX, y: feetBottomY });

    // 7. Go up to joint level at left corner
    points.push({ x: leftFootOuterX, y: baseY });

    return points;
  }

  /**
   * Apply extension to an edge (similar pattern to applyFeetToOutline)
   * Replaces the edge segment with: extended cap + reversed finger path
   */
  protected applyExtensionToEdge(
    points: Point2D[],
    edgePosition: EdgePosition,
    extensionAmount: number,
    fingerCorners: { topLeft: Point2D; topRight: Point2D; bottomRight: Point2D; bottomLeft: Point2D },
    fingerData: AssemblyFingerData | null,
    edgeConfig: EdgeConfig | undefined,
    materialThickness: number,
    fingerBlockingRanges: Map<EdgePosition, { start: number; end: number }[]>
  ): void {
    // Determine the start and end corners for this edge (in clockwise traversal order)
    let startCorner: Point2D, endCorner: Point2D;
    switch (edgePosition) {
      case 'top':
        startCorner = fingerCorners.topLeft;
        endCorner = fingerCorners.topRight;
        break;
      case 'right':
        startCorner = fingerCorners.topRight;
        endCorner = fingerCorners.bottomRight;
        break;
      case 'bottom':
        startCorner = fingerCorners.bottomRight;
        endCorner = fingerCorners.bottomLeft;
        break;
      case 'left':
        startCorner = fingerCorners.bottomLeft;
        endCorner = fingerCorners.topLeft;
        break;
    }

    // Find indices of these corners in the outline
    const tolerance = 0.1;
    let startIdx = -1;
    let endIdx = -1;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (startIdx === -1 && Math.abs(p.x - startCorner.x) < tolerance && Math.abs(p.y - startCorner.y) < tolerance) {
        startIdx = i;
      }
      if (Math.abs(p.x - endCorner.x) < tolerance && Math.abs(p.y - endCorner.y) < tolerance) {
        endIdx = i;
      }
    }

    // If we didn't find both corners, can't apply extension
    if (startIdx === -1 || endIdx === -1) {
      return;
    }

    // Calculate extended corners
    const extendedStart = this.getExtendedCorner(startCorner, edgePosition, extensionAmount, 'start');
    const extendedEnd = this.getExtendedCorner(endCorner, edgePosition, extensionAmount, 'end');

    // Generate the extension path: extendedStart → extendedEnd (cap) → endCorner → reversed fingers → startCorner
    const extensionPath = this.generateExtensionPath(
      startCorner,
      endCorner,
      extendedStart,
      extendedEnd,
      edgePosition,
      edgeConfig,
      fingerData,
      materialThickness,
      fingerBlockingRanges
    );

    // Replace the segment from startIdx to endIdx with the extension path
    // The extension path is: [startCorner, extendedStart, extendedEnd, endCorner]
    if (startIdx < endIdx) {
      // Normal case: start comes before end in the array
      // beforeSegment ends before startCorner, afterSegment starts after endCorner
      const beforeSegment = points.slice(0, startIdx);
      const afterSegment = points.slice(endIdx + 1);

      points.length = 0;
      points.push(...beforeSegment);
      points.push(...extensionPath);
      points.push(...afterSegment);
    } else {
      // Edge wraps around (e.g., left edge: bottomLeft to topLeft where topLeft is at index 0)
      // In clockwise order: endCorner (topLeft, index 0) comes before startCorner (bottomLeft)
      //
      // Original path: endCorner → [top, right, bottom edges] → startCorner → [left edge] → endCorner
      // With extension: endCorner → [top, right, bottom edges] → startCorner → extStart → extEnd → endCorner
      //
      // extensionPath structure: [startCorner, extendedStart, extendedEnd, endCorner]

      const middleSegment = points.slice(endIdx + 1, startIdx);

      // Rebuild path in correct clockwise order
      points.length = 0;
      points.push(endCorner);                  // Start at endCorner (e.g., topLeft)
      points.push(...middleSegment);           // Middle points (top, right, bottom edges)
      points.push(extensionPath[0]);           // startCorner (e.g., bottomLeft)
      points.push(extensionPath[1]);           // extendedStart (e.g., extended bottomLeft)
      points.push(extensionPath[2]);           // extendedEnd (e.g., extended topLeft)
      // Path closes from extendedEnd back to endCorner (both at same Y, different X for left edge)
    }
  }

  /**
   * Get the extended position of a corner for an edge extension
   */
  protected getExtendedCorner(
    corner: Point2D,
    edgePosition: EdgePosition,
    extensionAmount: number,
    cornerType: 'start' | 'end'
  ): Point2D {
    // Extension direction depends on the edge
    switch (edgePosition) {
      case 'top':
        return { x: corner.x, y: corner.y + extensionAmount };
      case 'bottom':
        return { x: corner.x, y: corner.y - extensionAmount };
      case 'left':
        return { x: corner.x - extensionAmount, y: corner.y };
      case 'right':
        return { x: corner.x + extensionAmount, y: corner.y };
    }
  }

  /**
   * Generate the extension path for an edge
   * Path goes: startCorner → extendedStart → extendedEnd (cap) → endCorner
   *
   * This creates a rectangular protrusion extending outward from the edge.
   * For short extensions (< corner gap + finger width + MT), the cap is a straight line.
   * Finger joints (if any) are rendered as holes in the panel, not part of the outline.
   */
  protected generateExtensionPath(
    startCorner: Point2D,
    endCorner: Point2D,
    extendedStart: Point2D,
    extendedEnd: Point2D,
    _edgePosition: EdgePosition,
    _edgeConfig: EdgeConfig | undefined,
    _fingerData: AssemblyFingerData | null,
    _materialThickness: number,
    _fingerBlockingRanges: Map<EdgePosition, { start: number; end: number }[]>
  ): Point2D[] {
    // Simple rectangular extension path:
    // 1. Start at the original corner (startCorner)
    // 2. Go outward to the extended position (extendedStart)
    // 3. Go across the cap to the other extended position (extendedEnd)
    // 4. Return inward to the other original corner (endCorner)
    return [startCorner, extendedStart, extendedEnd, endCorner];
  }

  /**
   * Compute the axis position for a corner of an edge
   * Subclasses should override this to provide proper axis mapping
   */
  protected computeEdgeAxisPosition(
    _edgePosition: EdgePosition,
    _corner: 'start' | 'end',
    _axis: Axis
  ): number {
    // Default implementation - subclasses should override
    // This returns 0 which will result in straight edges
    return 0;
  }

  // ==========================================================================
  // Edge Anchors - Reference points for alignment validation
  // ==========================================================================

  /**
   * Get edge anchors for alignment validation (cached)
   * Each anchor is at the center of the mating edge
   */
  getEdgeAnchors(): EdgeAnchor[] {
    if (!this._cachedEdgeAnchors) {
      this._cachedEdgeAnchors = this.computeEdgeAnchors();
    }
    return this._cachedEdgeAnchors;
  }

  /**
   * Transform a local 2D point to world 3D coordinates
   * The panel lies in its local XY plane, with Z being the thickness direction
   */
  protected transformLocalToWorld(localPoint: Point2D): Point3D {
    const transform = this.getTransform();
    const [px, py, pz] = transform.position;
    const [rx, ry, rz] = transform.rotation;

    // Apply rotation (simplified - assumes standard face orientations)
    // For a full implementation, would use proper rotation matrices
    let x = localPoint.x;
    let y = localPoint.y;
    let z = 0;

    // Rotate around X axis
    if (Math.abs(rx) > 0.001) {
      const cosX = Math.cos(rx);
      const sinX = Math.sin(rx);
      const newY = y * cosX - z * sinX;
      const newZ = y * sinX + z * cosX;
      y = newY;
      z = newZ;
    }

    // Rotate around Y axis
    if (Math.abs(ry) > 0.001) {
      const cosY = Math.cos(ry);
      const sinY = Math.sin(ry);
      const newX = x * cosY + z * sinY;
      const newZ = -x * sinY + z * cosY;
      x = newX;
      z = newZ;
    }

    // Rotate around Z axis
    if (Math.abs(rz) > 0.001) {
      const cosZ = Math.cos(rz);
      const sinZ = Math.sin(rz);
      const newX = x * cosZ - y * sinZ;
      const newY = x * sinZ + y * cosZ;
      x = newX;
      y = newY;
    }

    // Apply translation
    return {
      x: x + px,
      y: y + py,
      z: z + pz,
    };
  }

  /**
   * Compute edge anchors for all edges that mate with other panels.
   *
   * Edge anchors are placed at the mating surface (inward by mt/2 from the
   * panel's geometric edge) so that mating panels share the same world point.
   *
   * Without this offset, each panel's anchor would be at its own outer edge,
   * and mating anchors would differ by ~sqrt(2)*mt/2 ≈ 2.12mm for mt=3.
   */
  protected computeEdgeAnchors(): EdgeAnchor[] {
    const dims = this.getDimensions();
    const edges = this.getEdges();
    const anchors: EdgeAnchor[] = [];
    const mt = this.getMaterial().thickness;
    const halfMt = mt / 2;

    const halfW = dims.width / 2;
    const halfH = dims.height / 2;

    // Edge centers in local 2D coordinates, offset inward to the mating surface.
    // The offset moves the anchor from the panel's outer edge to where it meets
    // the adjacent panel's mid-plane.
    const edgeCenters: Record<EdgePosition, Point2D> = {
      top: { x: 0, y: halfH - halfMt },      // offset down
      bottom: { x: 0, y: -halfH + halfMt },  // offset up
      left: { x: -halfW + halfMt, y: 0 },    // offset right
      right: { x: halfW - halfMt, y: 0 },    // offset left
    };

    for (const edge of edges) {
      // Only create anchors for edges that mate with other panels
      if (edge.meetsFaceId || edge.meetsDividerId) {
        const localPoint = edgeCenters[edge.position];
        const worldPoint = this.transformLocalToWorld(localPoint);

        anchors.push({
          edgePosition: edge.position,
          localPoint,
          worldPoint,
        });
      }
    }

    return anchors;
  }

  /**
   * Get the anchor for a specific edge (if it exists)
   */
  getEdgeAnchor(edgePosition: EdgePosition): EdgeAnchor | null {
    const anchors = this.getEdgeAnchors();
    return anchors.find(a => a.edgePosition === edgePosition) ?? null;
  }

  // ==========================================================================
  // Recomputation
  // ==========================================================================

  recompute(): void {
    // Clear cached values to force recomputation
    this._cachedDimensions = null;
    this._cachedOutline = null;
    this._cachedEdges = null;
    this._cachedTransform = null;
    this._cachedEdgeAnchors = null;
  }

  // ==========================================================================
  // Cloning - Not supported for panel nodes
  // ==========================================================================

  /**
   * Panel nodes are derived/computed, not stored in the scene tree.
   * They don't need to be cloned because they're recreated on demand
   * from assembly and void data.
   */
  clone(): BasePanel {
    throw new Error('Panel nodes cannot be cloned - they are derived from assembly/void data');
  }

  // ==========================================================================
  // Shared Hole Generation Helpers
  // ==========================================================================

  /**
   * Create the points for a slot hole rectangle.
   * Used by both FacePanelNode and DividerPanelNode for divider slots.
   */
  protected createSlotHolePoints(
    slotX: number | null,
    slotY: number | null,
    start: number,
    end: number,
    isHorizontal: boolean,
    mt: number
  ): Point2D[] {
    const halfMt = mt / 2;

    if (isHorizontal) {
      const y = slotY!;
      return [
        { x: start, y: y - halfMt },
        { x: end, y: y - halfMt },
        { x: end, y: y + halfMt },
        { x: start, y: y + halfMt },
      ];
    } else {
      const x = slotX!;
      return [
        { x: x - halfMt, y: start },
        { x: x + halfMt, y: start },
        { x: x + halfMt, y: end },
        { x: x - halfMt, y: end },
      ];
    }
  }

  // ==========================================================================
  // Base Serialization Helper
  // ==========================================================================

  protected serializeBase(): Omit<BasePanelSnapshot, 'kind'> {
    const dims = this.getDimensions();
    const material = this.getMaterial();

    return {
      id: this.id,
      children: [] as [],
      props: {
        edgeExtensions: this.edgeExtensions,
        visible: this._visible,
      },
      derived: {
        width: dims.width,
        height: dims.height,
        thickness: material.thickness,
        outline: this.getOutline(),
        edges: this.getEdges(),
        worldTransform: this.getTransform(),
        edgeAnchors: this.getEdgeAnchors(),
        edgeStatuses: this.computeEdgeStatuses(),
      },
    };
  }
}
