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
} from '../types';
import { generateFingerJointPathV2, Point } from '../../utils/fingerJoints';

export interface PanelDimensions {
  width: number;   // 2D width (horizontal in local coords)
  height: number;  // 2D height (vertical in local coords)
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

    // Apply extensions (only for edges that can extend)
    const extTop = this._edgeExtensions.top;
    const extBottom = this._edgeExtensions.bottom;
    const extLeft = this._edgeExtensions.left;
    const extRight = this._edgeExtensions.right;

    // Finger corners - used for finger pattern generation (no extensions)
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

    // Outline corners (with extensions)
    const outlineCorners = {
      topLeft: {
        x: fingerCorners.topLeft.x - extLeft,
        y: fingerCorners.topLeft.y + extTop,
      },
      topRight: {
        x: fingerCorners.topRight.x + extRight,
        y: fingerCorners.topRight.y + extTop,
      },
      bottomRight: {
        x: fingerCorners.bottomRight.x + extRight,
        y: fingerCorners.bottomRight.y - extBottom,
      },
      bottomLeft: {
        x: fingerCorners.bottomLeft.x - extLeft,
        y: fingerCorners.bottomLeft.y - extBottom,
      },
    };

    // Helper to generate edge points (with or without finger joints)
    const generateEdgePoints = (
      startCorner: Point,
      endCorner: Point,
      fingerStart: Point,
      fingerEnd: Point,
      edgeConfig: EdgeConfig | undefined
    ): Point[] => {
      // If no finger joints or no finger data, return straight edge
      if (!edgeConfig?.gender || !edgeConfig?.axis || !fingerData) {
        return [endCorner];
      }

      const axisFingerPoints = fingerData[edgeConfig.axis];
      if (!axisFingerPoints || axisFingerPoints.points.length === 0) {
        return [endCorner];
      }

      // Calculate edge axis positions
      // The positions depend on which edge and which axis
      const edgeStartPos = this.computeEdgeAxisPosition(edgeConfig.position, 'start', edgeConfig.axis);
      const edgeEndPos = this.computeEdgeAxisPosition(edgeConfig.position, 'end', edgeConfig.axis);

      // Generate finger joint path
      const fingerPath = generateFingerJointPathV2(fingerStart, fingerEnd, {
        fingerPoints: axisFingerPoints,
        gender: edgeConfig.gender,
        materialThickness: mt,
        edgeStartPos,
        edgeEndPos,
        yUp: true,
        outwardDirection: this.getEdgeOutwardDirection(edgeConfig.position),
      });

      // The finger path starts at fingerStart - we need to handle extensions
      const result: Point[] = [];

      // If start corner differs from finger start (due to extension), add connecting line
      const startDx = Math.abs(startCorner.x - fingerStart.x);
      const startDy = Math.abs(startCorner.y - fingerStart.y);
      if (startDx > 0.001 || startDy > 0.001) {
        result.push(fingerStart);
      }

      // Add finger path points (skip first point as it's already the start)
      for (let i = 1; i < fingerPath.length; i++) {
        result.push(fingerPath[i]);
      }

      // If end corner differs from finger end (due to extension), add it
      const lastFingerPoint = fingerPath[fingerPath.length - 1];
      const endDx = Math.abs(endCorner.x - lastFingerPoint.x);
      const endDy = Math.abs(endCorner.y - lastFingerPoint.y);
      if (endDx > 0.001 || endDy > 0.001) {
        result.push(endCorner);
      }

      return result;
    };

    // Build outline points (clockwise from top-left)
    const points: Point2D[] = [];

    // Start at top-left corner
    points.push(outlineCorners.topLeft);

    // Top edge (left to right)
    points.push(...generateEdgePoints(
      outlineCorners.topLeft,
      outlineCorners.topRight,
      fingerCorners.topLeft,
      fingerCorners.topRight,
      topEdge
    ));

    // Right edge (top to bottom)
    points.push(...generateEdgePoints(
      outlineCorners.topRight,
      outlineCorners.bottomRight,
      fingerCorners.topRight,
      fingerCorners.bottomRight,
      rightEdge
    ));

    // Bottom edge (right to left)
    points.push(...generateEdgePoints(
      outlineCorners.bottomRight,
      outlineCorners.bottomLeft,
      fingerCorners.bottomRight,
      fingerCorners.bottomLeft,
      bottomEdge
    ));

    // Left edge (bottom to top) - path auto-closes to start
    const leftEdgePoints = generateEdgePoints(
      outlineCorners.bottomLeft,
      outlineCorners.topLeft,
      fingerCorners.bottomLeft,
      fingerCorners.topLeft,
      leftEdge
    );
    // Don't add the last point if it's the same as the first (auto-close)
    for (const pt of leftEdgePoints) {
      const dx = Math.abs(pt.x - outlineCorners.topLeft.x);
      const dy = Math.abs(pt.y - outlineCorners.topLeft.y);
      if (dx > 0.001 || dy > 0.001) {
        points.push(pt);
      }
    }

    return {
      points,
      holes,
    };
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
   * Compute edge anchors for all edges that mate with other panels
   */
  protected computeEdgeAnchors(): EdgeAnchor[] {
    const dims = this.getDimensions();
    const edges = this.getEdges();
    const anchors: EdgeAnchor[] = [];

    const halfW = dims.width / 2;
    const halfH = dims.height / 2;

    // Edge centers in local 2D coordinates
    const edgeCenters: Record<EdgePosition, Point2D> = {
      top: { x: 0, y: halfH },
      bottom: { x: 0, y: -halfH },
      left: { x: -halfW, y: 0 },
      right: { x: halfW, y: 0 },
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
      },
    };
  }
}
