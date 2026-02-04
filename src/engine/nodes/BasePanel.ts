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
  CornerKey,
  CornerFillet,
  CornerEligibility,
  ALL_CORNERS,
  AllCornerFillet,
  AllCornerId,
  AllCornerEligibility,
  getCornerEdges,
  CustomEdgePath,
  EdgePathPoint,  // Used in applyCustomEdgePathToOutline for path point mapping
  Cutout,
  RectCutout,
  CircleCutout,
  PathCutout,
} from '../types';
import {
  detectAllPanelCorners,
  computeAllCornerEligibility,
  ForbiddenArea,
  CornerDetectionConfig,
} from '../../utils/allCorners';
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
  protected _cornerFillets: Map<CornerKey, number> = new Map();  // corner -> radius
  protected _allCornerFillets: Map<AllCornerId, number> = new Map();  // all-corner -> radius
  protected _customEdgePaths: Map<EdgePosition, CustomEdgePath> = new Map();  // edge -> custom path
  protected _cutouts: Map<string, Cutout> = new Map();  // cutoutId -> cutout
  protected _visible: boolean = true;
  // Modified outline polygon (from boolean operations) - used directly instead of edge paths
  protected _modifiedOutlinePolygon: Point2D[] | null = null;

  // Cached derived values (recomputed when dirty)
  protected _cachedDimensions: PanelDimensions | null = null;
  protected _cachedOutline: PanelOutline | null = null;
  protected _cachedEdges: PanelEdge[] | null = null;
  protected _cachedTransform: Transform3D | null = null;
  protected _cachedEdgeAnchors: EdgeAnchor[] | null = null;
  protected _cachedCornerEligibility: CornerEligibility[] | null = null;

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

  // Corner fillet accessors
  get cornerFillets(): CornerFillet[] {
    return Array.from(this._cornerFillets.entries()).map(([corner, radius]) => ({
      corner,
      radius,
    }));
  }

  getCornerFillet(corner: CornerKey): number {
    return this._cornerFillets.get(corner) ?? 0;
  }

  setCornerFillet(corner: CornerKey, radius: number): void {
    const currentRadius = this._cornerFillets.get(corner) ?? 0;
    if (currentRadius !== radius) {
      if (radius <= 0) {
        this._cornerFillets.delete(corner);
      } else {
        this._cornerFillets.set(corner, radius);
      }
      this.markDirty();
    }
  }

  setCornerFillets(fillets: CornerFillet[]): void {
    let changed = false;
    for (const { corner, radius } of fillets) {
      const currentRadius = this._cornerFillets.get(corner) ?? 0;
      if (currentRadius !== radius) {
        if (radius <= 0) {
          this._cornerFillets.delete(corner);
        } else {
          this._cornerFillets.set(corner, radius);
        }
        changed = true;
      }
    }
    if (changed) {
      this.markDirty();
    }
  }

  // All-corner fillet accessors (for any corner in panel geometry)
  get allCornerFillets(): AllCornerFillet[] {
    return Array.from(this._allCornerFillets.entries()).map(([cornerId, radius]) => ({
      cornerId,
      radius,
    }));
  }

  getAllCornerFillet(cornerId: AllCornerId): number {
    return this._allCornerFillets.get(cornerId) ?? 0;
  }

  setAllCornerFillet(cornerId: AllCornerId, radius: number): void {
    const currentRadius = this._allCornerFillets.get(cornerId) ?? 0;
    if (currentRadius !== radius) {
      if (radius <= 0) {
        this._allCornerFillets.delete(cornerId);
      } else {
        this._allCornerFillets.set(cornerId, radius);
      }
      this.markDirty();
    }
  }

  setAllCornerFillets(fillets: AllCornerFillet[]): void {
    let changed = false;
    for (const { cornerId, radius } of fillets) {
      const currentRadius = this._allCornerFillets.get(cornerId) ?? 0;
      if (currentRadius !== radius) {
        if (radius <= 0) {
          this._allCornerFillets.delete(cornerId);
        } else {
          this._allCornerFillets.set(cornerId, radius);
        }
        changed = true;
      }
    }
    if (changed) {
      this.markDirty();
    }
  }

  // Custom edge path accessors
  get customEdgePaths(): CustomEdgePath[] {
    return Array.from(this._customEdgePaths.values());
  }

  getCustomEdgePath(edge: EdgePosition): CustomEdgePath | null {
    return this._customEdgePaths.get(edge) ?? null;
  }

  setCustomEdgePath(path: CustomEdgePath): void {
    const currentPath = this._customEdgePaths.get(path.edge);
    // Check if path actually changed (simple reference check, could be deeper)
    if (currentPath !== path) {
      this._customEdgePaths.set(path.edge, path);
      this.markDirty();
    }
  }

  clearCustomEdgePath(edge: EdgePosition): void {
    if (this._customEdgePaths.has(edge)) {
      this._customEdgePaths.delete(edge);
      this.markDirty();
    }
  }

  /**
   * Set a modified outline polygon (from boolean operations).
   * When set, this polygon is used directly as the panel outline,
   * bypassing edge path computation for edges that have modifications.
   */
  setModifiedOutlinePolygon(polygon: Point2D[] | null): void {
    this._modifiedOutlinePolygon = polygon;
    this.markDirty();
  }

  /**
   * Get the modified outline polygon if set.
   */
  getModifiedOutlinePolygon(): Point2D[] | null {
    return this._modifiedOutlinePolygon;
  }

  // Cutout accessors
  get cutouts(): Cutout[] {
    return Array.from(this._cutouts.values());
  }

  getCutout(cutoutId: string): Cutout | null {
    return this._cutouts.get(cutoutId) ?? null;
  }

  addCutout(cutout: Cutout): void {
    this._cutouts.set(cutout.id, cutout);
    this.markDirty();
  }

  removeCutout(cutoutId: string): void {
    if (this._cutouts.has(cutoutId)) {
      this._cutouts.delete(cutoutId);
      this.markDirty();
    }
  }

  updateCutout(cutoutId: string, updates: Partial<Omit<Cutout, 'id' | 'type'>>): void {
    const existing = this._cutouts.get(cutoutId);
    if (existing) {
      // Merge updates into the existing cutout
      const updated = { ...existing, ...updates } as Cutout;
      this._cutouts.set(cutoutId, updated);
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
   * Get the extension amount of the adjacent panel's edge at this corner.
   * Used for computing fillet eligibility (free length calculation).
   * Returns 0 if no adjacent panel or edge is open.
   */
  abstract getAdjacentPanelExtension(edge: EdgePosition): number;

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
   * Get corner eligibility for fillet operations (cached)
   */
  getCornerEligibility(): CornerEligibility[] {
    if (!this._cachedCornerEligibility) {
      this._cachedCornerEligibility = this.computeCornerEligibility();
    }
    return this._cachedCornerEligibility;
  }

  /**
   * Get all-corner eligibility for any corner in panel geometry.
   * This includes outline corners and hole corners.
   */
  getAllCornerEligibility(): AllCornerEligibility[] {
    const outline = this.getOutline();
    const material = this.getMaterial();
    const dims = this.getDimensions();

    // Detect all corners in the panel geometry
    const config: CornerDetectionConfig = {
      materialThickness: material.thickness,
      minEdgeLength: 2, // Minimum edge length to consider
    };

    // Extract holes from the outline to pass to corner detection
    // Each hole contributes corners that may be eligible for filleting
    const holes = (outline.holes ?? []).map((hole, index) => ({
      id: hole.id ?? `hole-${index}`,
      path: hole.path,
    }));

    const corners = detectAllPanelCorners(
      outline.points,
      holes,
      config
    );

    // Build forbidden areas from joint regions
    // For now, we compute forbidden areas based on the edge statuses
    const edgeStatuses = this.computeEdgeStatuses();
    const forbiddenAreas: ForbiddenArea[] = [];

    for (const status of edgeStatuses) {
      if (status.status === 'locked') {
        // Locked edges have finger joints - mark the entire edge region as forbidden
        // Convert edge position to bounds
        let bounds: { minX: number; maxX: number; minY: number; maxY: number };
        const w = dims.width / 2;
        const h = dims.height / 2;
        const mt = material.thickness;

        switch (status.position) {
          case 'top':
            bounds = { minX: -w, maxX: w, minY: h - mt, maxY: h };
            break;
          case 'bottom':
            bounds = { minX: -w, maxX: w, minY: -h, maxY: -h + mt };
            break;
          case 'left':
            bounds = { minX: -w, maxX: -w + mt, minY: -h, maxY: h };
            break;
          case 'right':
            bounds = { minX: w - mt, maxX: w, minY: -h, maxY: h };
            break;
        }

        forbiddenAreas.push({
          type: 'finger-joint',
          bounds,
        });
      }
    }

    // Compute eligibility for each corner
    return computeAllCornerEligibility(corners, forbiddenAreas, config);
  }

  /**
   * Compute corner eligibility for fillet operations.
   *
   * A corner is eligible for filleting only if BOTH adjacent edges are "safe"
   * (no finger joints at that corner location).
   *
   * Edge types and safety:
   * - Joint edge (male or female): NOT safe - has finger joints
   * - Open edge (adjacent face disabled): safe - no joints, straight edge
   * - Extended edge: safe in the extension region (beyond finger joint area)
   *
   * A joint edge can still contribute to an eligible corner IF the panel has
   * enough extension on that edge to create "free length" beyond the joint.
   */
  protected computeCornerEligibility(): CornerEligibility[] {
    const edgeStatuses = this.computeEdgeStatuses();
    const extensions = this._edgeExtensions;
    const MIN_FILLET_RADIUS = 1; // mm

    // Get panel dimensions for calculating max fillet radius on open edges
    const dims = this.getDimensions();

    /**
     * Check if an edge is "safe" for filleting at this corner.
     * An edge is safe if:
     * 1. It has no finger joints (status === 'unlocked'), OR
     * 2. It has extension that provides free length beyond the joint area
     */
    const isEdgeSafe = (
      edgeStatus: EdgeStatusInfo | undefined,
      thisExtension: number,
      adjacentExtension: number,
      edgePosition: EdgePosition
    ): { safe: boolean; freeLength: number } => {
      // If edge has no joints (open face), it's safe
      if (edgeStatus?.status === 'unlocked') {
        // For unlocked edges (open faces), the corner is safe regardless of extension
        // If the edge has an extension, use that as the free length
        // Otherwise, use a portion of the edge length as the free length
        if (thisExtension > 0) {
          // Use the extension amount as the free length
          return { safe: true, freeLength: thisExtension };
        }
        // No extension - use a conservative estimate based on panel dimensions
        const edgeLength = edgePosition === 'top' || edgePosition === 'bottom'
          ? dims.width
          : dims.height;
        const freeLength = edgeLength / 3;
        return { safe: true, freeLength };
      }

      // Edge has finger joints (either 'locked' = male, or 'outward-only' = female)
      // It can only be safe if there's enough extension to create free length
      // Free length = this extension - adjacent panel's extension
      const freeLength = Math.max(0, thisExtension - adjacentExtension);

      // For joint edges, we need positive free length to be safe at this corner
      return { safe: freeLength > 0, freeLength };
    };

    return ALL_CORNERS.map((corner): CornerEligibility => {
      const [edge1, edge2] = getCornerEdges(corner);

      // Get edge statuses
      const status1 = edgeStatuses.find(s => s.position === edge1);
      const status2 = edgeStatuses.find(s => s.position === edge2);

      // Early exit: if either edge has joints (locked or outward-only), corner is ineligible
      // Locked = male joints (tabs out), outward-only = female joints (slots)
      // Corners at edges with finger joints cannot be filleted
      const edge1HasJoints = status1?.status === 'locked' || status1?.status === 'outward-only';
      const edge2HasJoints = status2?.status === 'locked' || status2?.status === 'outward-only';
      if (edge1HasJoints || edge2HasJoints) {
        return {
          corner,
          eligible: false,
          reason: 'has-joints',
          maxRadius: 0,
          freeLength1: 0,
          freeLength2: 0,
        };
      }

      // Get extensions
      const thisExt1 = extensions[edge1];
      const thisExt2 = extensions[edge2];
      const adjExt1 = this.getAdjacentPanelExtension(edge1);
      const adjExt2 = this.getAdjacentPanelExtension(edge2);

      // Check if each edge is safe for filleting
      const edge1Safety = isEdgeSafe(status1, thisExt1, adjExt1, edge1);
      const edge2Safety = isEdgeSafe(status2, thisExt2, adjExt2, edge2);

      const freeLength1 = edge1Safety.freeLength;
      const freeLength2 = edge2Safety.freeLength;

      // Corner is only eligible if BOTH edges are safe
      if (!edge1Safety.safe || !edge2Safety.safe) {
        return {
          corner,
          eligible: false,
          reason: 'no-free-length',
          maxRadius: 0,
          freeLength1,
          freeLength2,
        };
      }

      // Both edges are safe - max radius is minimum of free lengths
      const maxRadius = Math.min(freeLength1, freeLength2);

      // Corner is eligible if max radius >= minimum fillet radius
      if (maxRadius < MIN_FILLET_RADIUS) {
        return {
          corner,
          eligible: false,
          reason: maxRadius > 0 ? 'below-minimum' : 'no-free-length',
          maxRadius: 0,
          freeLength1,
          freeLength2,
        };
      }

      return {
        corner,
        eligible: true,
        maxRadius,
        freeLength1,
        freeLength2,
      };
    });
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
    // If a modified outline polygon is set (from boolean operations),
    // use it directly as the outline points
    if (this._modifiedOutlinePolygon && this._modifiedOutlinePolygon.length >= 3) {
      const holes = this.computeHoles();
      const allHoles = [...holes];

      // Add cutouts as holes
      if (this._cutouts.size > 0) {
        for (const cutout of this._cutouts.values()) {
          const cutoutHole = this.cutoutToHole(cutout);
          if (cutoutHole) {
            allHoles.push(cutoutHole);
          }
        }
      }

      return {
        points: this._modifiedOutlinePolygon.map(p => ({ x: p.x, y: p.y })),
        holes: allHoles,
      };
    }

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

    // Outer corners - full panel dimensions (no MT insets)
    // Used for edge extensions which should span full panel width by default
    const outerCorners = {
      topLeft: { x: -halfW, y: halfH },
      topRight: { x: halfW, y: halfH },
      bottomRight: { x: halfW, y: -halfH },
      bottomLeft: { x: -halfW, y: -halfH },
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

    // Pre-compute all 4 extended corners ONCE (based on diagram docs/IMG_8225.jpeg)
    // These are the definitive corner positions - all edges use these same values
    const extendedCorners = {
      topLeft: {
        x: outerCorners.topLeft.x - extensions.left,
        y: outerCorners.topLeft.y + extensions.top,
      },
      topRight: {
        x: outerCorners.topRight.x + extensions.right,
        y: outerCorners.topRight.y + extensions.top,
      },
      bottomRight: {
        x: outerCorners.bottomRight.x + extensions.right,
        y: outerCorners.bottomRight.y - extensions.bottom,
      },
      bottomLeft: {
        x: outerCorners.bottomLeft.x - extensions.left,
        y: outerCorners.bottomLeft.y - extensions.bottom,
      },
    };

    if (extensions.top > 0.001) {
      this.applyExtensionToEdge(points, 'top', extensions.top, outerCorners, fingerCorners, fingerData, topEdge, mt, fingerBlockingRanges, extensions, edgeConfigs, extendedCorners);
    }
    if (extensions.right > 0.001) {
      this.applyExtensionToEdge(points, 'right', extensions.right, outerCorners, fingerCorners, fingerData, rightEdge, mt, fingerBlockingRanges, extensions, edgeConfigs, extendedCorners);
    }
    if (extensions.bottom > 0.001) {
      this.applyExtensionToEdge(points, 'bottom', extensions.bottom, outerCorners, fingerCorners, fingerData, bottomEdge, mt, fingerBlockingRanges, extensions, edgeConfigs, extendedCorners);
    }
    if (extensions.left > 0.001) {
      this.applyExtensionToEdge(points, 'left', extensions.left, outerCorners, fingerCorners, fingerData, leftEdge, mt, fingerBlockingRanges, extensions, edgeConfigs, extendedCorners);
    }

    // Apply feet if configured
    const feetConfig = this.getFeetConfig();
    if (feetConfig && feetConfig.edge === 'bottom') {
      this.applyFeetToOutline(points, fingerCorners, mt, feetConfig.params);
    }

    // Apply custom edge paths
    if (this._customEdgePaths.size > 0) {
      for (const [edge, customPath] of this._customEdgePaths) {
        this.applyCustomEdgePathToOutline(points, edge, customPath, fingerCorners, extendedCorners, extensions);
      }
    }

    // Apply corner fillets as final post-processing
    if (this._cornerFillets.size > 0) {
      this.applyFilletsToOutline(points, extendedCorners);
    }

    // Add cutouts as holes
    const allHoles = [...holes];
    if (this._cutouts.size > 0) {
      for (const cutout of this._cutouts.values()) {
        const cutoutHole = this.cutoutToHole(cutout);
        if (cutoutHole) {
          allHoles.push(cutoutHole);
        }
      }
    }

    return {
      points,
      holes: allHoles,
    };
  }

  /**
   * Convert a cutout to hole for rendering.
   * Returns null if the cutout produces invalid geometry.
   */
  protected cutoutToHole(cutout: Cutout): PanelHole | null {
    switch (cutout.type) {
      case 'rect':
        return this.rectCutoutToHole(cutout);
      case 'circle':
        return this.circleCutoutToHole(cutout);
      case 'path':
        return this.pathCutoutToHole(cutout);
      default:
        return null;
    }
  }

  /**
   * Convert a rectangle cutout to a hole.
   * Optionally generates rounded corners if cornerRadius is set.
   */
  protected rectCutoutToHole(cutout: RectCutout): PanelHole {
    const { id, center, width, height, cornerRadius } = cutout;
    const halfW = width / 2;
    const halfH = height / 2;

    if (!cornerRadius || cornerRadius <= 0) {
      // Simple rectangle - 4 corners, counter-clockwise for hole
      return {
        id,
        path: [
          { x: center.x - halfW, y: center.y - halfH },
          { x: center.x - halfW, y: center.y + halfH },
          { x: center.x + halfW, y: center.y + halfH },
          { x: center.x + halfW, y: center.y - halfH },
        ],
        source: { type: 'cutout', sourceId: id },
      };
    }

    // Rounded rectangle - generate corner arcs
    const r = Math.min(cornerRadius, halfW, halfH);
    const path: Point2D[] = [];
    const segments = 8; // Segments per corner arc

    // Corner centers
    const corners = [
      { cx: center.x - halfW + r, cy: center.y - halfH + r, startAngle: Math.PI, endAngle: 1.5 * Math.PI },     // BL
      { cx: center.x - halfW + r, cy: center.y + halfH - r, startAngle: 0.5 * Math.PI, endAngle: Math.PI },    // TL
      { cx: center.x + halfW - r, cy: center.y + halfH - r, startAngle: 0, endAngle: 0.5 * Math.PI },          // TR
      { cx: center.x + halfW - r, cy: center.y - halfH + r, startAngle: 1.5 * Math.PI, endAngle: 2 * Math.PI }, // BR
    ];

    for (const corner of corners) {
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const angle = corner.startAngle + (corner.endAngle - corner.startAngle) * t;
        path.push({
          x: corner.cx + r * Math.cos(angle),
          y: corner.cy + r * Math.sin(angle),
        });
      }
    }

    return { id, path, source: { type: 'cutout', sourceId: id } };
  }

  /**
   * Convert a circle cutout to a hole.
   * Approximates the circle with a polygon.
   */
  protected circleCutoutToHole(cutout: CircleCutout): PanelHole {
    const { id, center, radius } = cutout;
    const segments = Math.max(16, Math.ceil(radius * 2)); // More segments for larger circles
    const path: Point2D[] = [];

    // Generate points counter-clockwise for hole winding
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * 2 * Math.PI;
      path.push({
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle),
      });
    }

    return { id, path, source: { type: 'cutout', sourceId: id } };
  }

  /**
   * Convert a path cutout to a hole.
   * The path points define the hole boundary directly.
   */
  protected pathCutoutToHole(cutout: PathCutout): PanelHole | null {
    if (cutout.points.length < 3) {
      return null; // Need at least 3 points for a valid hole
    }

    // Points are stored relative to center, so add center offset
    const { center, points } = cutout;

    return {
      id: cutout.id,
      path: points.map(p => ({ x: center.x + p.x, y: center.y + p.y })),
      source: { type: 'cutout', sourceId: cutout.id },
    };
  }

  /**
   * Apply fillets to corners in the outline.
   * Replaces sharp corners with arc segments.
   */
  protected applyFilletsToOutline(
    points: Point2D[],
    extendedCorners: { topLeft: Point2D; topRight: Point2D; bottomRight: Point2D; bottomLeft: Point2D }
  ): void {
    // Map corner keys to their extended corner positions
    const cornerPositions: Record<CornerKey, Point2D> = {
      'left:top': extendedCorners.topLeft,
      'right:top': extendedCorners.topRight,
      'bottom:right': extendedCorners.bottomRight,
      'bottom:left': extendedCorners.bottomLeft,
    };

    // Process each fillet
    for (const [corner, radius] of this._cornerFillets) {
      if (radius <= 0) continue;

      const cornerPos = cornerPositions[corner];
      if (!cornerPos) continue;

      // Find the corner point in the path
      const tolerance = 0.5;
      let cornerIdx = -1;
      for (let i = 0; i < points.length; i++) {
        if (Math.abs(points[i].x - cornerPos.x) < tolerance &&
            Math.abs(points[i].y - cornerPos.y) < tolerance) {
          cornerIdx = i;
          break;
        }
      }

      if (cornerIdx === -1) continue;

      // Get adjacent points to determine arc direction
      const prevIdx = (cornerIdx - 1 + points.length) % points.length;
      const nextIdx = (cornerIdx + 1) % points.length;
      const prevPt = points[prevIdx];
      const nextPt = points[nextIdx];
      const cornerPt = points[cornerIdx];

      // Calculate vectors from corner to adjacent points
      const toPrev = { x: prevPt.x - cornerPt.x, y: prevPt.y - cornerPt.y };
      const toNext = { x: nextPt.x - cornerPt.x, y: nextPt.y - cornerPt.y };

      // Normalize vectors
      const lenPrev = Math.sqrt(toPrev.x * toPrev.x + toPrev.y * toPrev.y);
      const lenNext = Math.sqrt(toNext.x * toNext.x + toNext.y * toNext.y);
      if (lenPrev < 0.001 || lenNext < 0.001) continue;

      const normPrev = { x: toPrev.x / lenPrev, y: toPrev.y / lenPrev };
      const normNext = { x: toNext.x / lenNext, y: toNext.y / lenNext };

      // Clamp radius to available edge lengths
      const effectiveRadius = Math.min(radius, lenPrev, lenNext);
      if (effectiveRadius < 0.5) continue;

      // Calculate arc start and end points
      const arcStart = {
        x: cornerPt.x + normPrev.x * effectiveRadius,
        y: cornerPt.y + normPrev.y * effectiveRadius,
      };
      const arcEnd = {
        x: cornerPt.x + normNext.x * effectiveRadius,
        y: cornerPt.y + normNext.y * effectiveRadius,
      };

      // Generate arc points
      const arcPoints = this.generateFilletArc(cornerPt, arcStart, arcEnd, effectiveRadius);

      // Replace the corner point with arc points
      points.splice(cornerIdx, 1, ...arcPoints);
    }
  }

  /**
   * Generate arc points for a fillet.
   * The arc goes from arcStart to arcEnd, curving away from the corner.
   */
  protected generateFilletArc(
    corner: Point2D,
    arcStart: Point2D,
    arcEnd: Point2D,
    radius: number,
    segments: number = 8
  ): Point2D[] {
    // Calculate arc center - it's offset from corner by radius in the direction
    // perpendicular to the bisector of the two edges
    const midX = (arcStart.x + arcEnd.x) / 2;
    const midY = (arcStart.y + arcEnd.y) / 2;

    // Direction from corner to midpoint of arc chord
    const toMid = { x: midX - corner.x, y: midY - corner.y };
    const lenToMid = Math.sqrt(toMid.x * toMid.x + toMid.y * toMid.y);

    if (lenToMid < 0.001) {
      // Degenerate case - return just the endpoints
      return [arcStart, arcEnd];
    }

    // Arc center is along the line from corner through midpoint,
    // at distance such that it's radius away from both arcStart and arcEnd
    const normToMid = { x: toMid.x / lenToMid, y: toMid.y / lenToMid };

    // Calculate the distance from corner to arc center
    // Using the formula: distance = radius / sin(halfAngle)
    // where halfAngle is half the angle between the two edges
    const chordLen = Math.sqrt(
      (arcEnd.x - arcStart.x) ** 2 + (arcEnd.y - arcStart.y) ** 2
    );
    const halfChord = chordLen / 2;

    // Distance from center to chord midpoint
    const centerToChordDist = Math.sqrt(Math.max(0, radius * radius - halfChord * halfChord));

    // Arc center
    const centerDist = lenToMid + centerToChordDist;
    const center = {
      x: corner.x + normToMid.x * centerDist,
      y: corner.y + normToMid.y * centerDist,
    };

    // Calculate start and end angles
    const startAngle = Math.atan2(arcStart.y - center.y, arcStart.x - center.x);
    const endAngle = Math.atan2(arcEnd.y - center.y, arcEnd.x - center.x);

    // Determine arc direction (should be the shorter arc)
    let angleDiff = endAngle - startAngle;
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

    // Generate arc points
    const arcPoints: Point2D[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = startAngle + angleDiff * t;
      arcPoints.push({
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle),
      });
    }

    return arcPoints;
  }

  /**
   * Apply a custom edge path to the outline.
   * Replaces the edge segment with a user-defined path.
   *
   * The custom path uses normalized coordinates:
   * - t: 0-1 position along edge (0 = start corner, 1 = end corner)
   * - offset: perpendicular distance from edge (positive = outward, negative = inward)
   *
   * For mirrored paths, only t=0 to t=0.5 is defined, and the path is mirrored.
   */
  protected applyCustomEdgePathToOutline(
    points: Point2D[],
    edge: EdgePosition,
    customPath: CustomEdgePath,
    fingerCorners: { topLeft: Point2D; topRight: Point2D; bottomRight: Point2D; bottomLeft: Point2D },
    extendedCorners: { topLeft: Point2D; topRight: Point2D; bottomRight: Point2D; bottomLeft: Point2D },
    extensions: { top: number; right: number; bottom: number; left: number }
  ): void {
    if (customPath.points.length === 0) return;

    // Determine edge corners (start and end of the edge in path traversal order)
    // Use fingerCorners for finding the segment in the outline (since outline is built from fingerCorners)
    // Use extendedCorners for edge length calculation ONLY if there are actual extensions on that axis
    let startCorner: Point2D, endCorner: Point2D;
    let searchStartCorner: Point2D, searchEndCorner: Point2D;
    let outwardDirection: { x: number; y: number };

    // Helper to compute corner for edge path endpoints
    // Use extendedCorners only when there are actual extensions on the relevant axes
    // Otherwise use fingerCorners to respect joint corner ownership rules
    const computeCorner = (
      ext: Point2D,
      finger: Point2D,
      xExtension: number, // extension that affects x coordinate
      yExtension: number // extension that affects y coordinate
    ): Point2D => {
      return {
        x: xExtension > 0.001 ? ext.x : finger.x,
        y: yExtension > 0.001 ? ext.y : finger.y,
      };
    };

    switch (edge) {
      case 'top':
        searchStartCorner = fingerCorners.topLeft;
        searchEndCorner = fingerCorners.topRight;
        // topLeft: x affected by left extension, y affected by top extension
        startCorner = computeCorner(extendedCorners.topLeft, fingerCorners.topLeft, extensions.left, extensions.top);
        // topRight: x affected by right extension, y affected by top extension
        endCorner = computeCorner(extendedCorners.topRight, fingerCorners.topRight, extensions.right, extensions.top);
        outwardDirection = { x: 0, y: 1 };
        break;
      case 'right':
        searchStartCorner = fingerCorners.topRight;
        searchEndCorner = fingerCorners.bottomRight;
        // topRight: x affected by right extension, y affected by top extension
        startCorner = computeCorner(extendedCorners.topRight, fingerCorners.topRight, extensions.right, extensions.top);
        // bottomRight: x affected by right extension, y affected by bottom extension
        endCorner = computeCorner(extendedCorners.bottomRight, fingerCorners.bottomRight, extensions.right, extensions.bottom);
        outwardDirection = { x: 1, y: 0 };
        break;
      case 'bottom':
        searchStartCorner = fingerCorners.bottomRight;
        searchEndCorner = fingerCorners.bottomLeft;
        // bottomRight: x affected by right extension, y affected by bottom extension
        startCorner = computeCorner(extendedCorners.bottomRight, fingerCorners.bottomRight, extensions.right, extensions.bottom);
        // bottomLeft: x affected by left extension, y affected by bottom extension
        endCorner = computeCorner(extendedCorners.bottomLeft, fingerCorners.bottomLeft, extensions.left, extensions.bottom);
        outwardDirection = { x: 0, y: -1 };
        break;
      case 'left':
        searchStartCorner = fingerCorners.bottomLeft;
        searchEndCorner = fingerCorners.topLeft;
        // bottomLeft: x affected by left extension, y affected by bottom extension
        startCorner = computeCorner(extendedCorners.bottomLeft, fingerCorners.bottomLeft, extensions.left, extensions.bottom);
        // topLeft: x affected by left extension, y affected by top extension
        endCorner = computeCorner(extendedCorners.topLeft, fingerCorners.topLeft, extensions.left, extensions.top);
        outwardDirection = { x: -1, y: 0 };
        break;
    }

    // Calculate edge vector
    const edgeVector = {
      x: endCorner.x - startCorner.x,
      y: endCorner.y - startCorner.y,
    };
    const edgeLength = Math.sqrt(edgeVector.x * edgeVector.x + edgeVector.y * edgeVector.y);
    if (edgeLength < 0.001) return;

    // Generate the path points from the custom path definition
    let pathPoints = customPath.points;

    // Handle mirrored paths: expand from half to full path
    if (customPath.mirrored && pathPoints.length > 0) {
      const expandedPoints: EdgePathPoint[] = [...pathPoints];

      // Mirror points from t=0.5 back to t=0, excluding the center point if t=0.5 is exact
      for (let i = pathPoints.length - 1; i >= 0; i--) {
        const pt = pathPoints[i];
        // Skip if this is already at t=0.5 (don't duplicate center)
        if (Math.abs(pt.t - 0.5) < 0.001) continue;
        // Mirror: t becomes (1 - t)
        expandedPoints.push({
          t: 1 - pt.t,
          offset: pt.offset,
        });
      }
      pathPoints = expandedPoints;
    }

    // Convert normalized path points to actual coordinates
    const convertedPoints: Point2D[] = pathPoints.map((pt) => {
      // Position along edge
      const alongEdge = {
        x: startCorner.x + edgeVector.x * pt.t,
        y: startCorner.y + edgeVector.y * pt.t,
      };
      // Add perpendicular offset
      return {
        x: alongEdge.x + outwardDirection.x * pt.offset,
        y: alongEdge.y + outwardDirection.y * pt.offset,
      };
    });

    if (convertedPoints.length === 0) return;

    // Find the edge segment in the outline to replace
    // Use searchStartCorner/searchEndCorner which match the fingerCorners used to build the outline
    const tolerance = 1.0; // mm tolerance for matching
    let startIdx = -1;
    let endIdx = -1;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (startIdx === -1 && Math.abs(p.x - searchStartCorner.x) < tolerance && Math.abs(p.y - searchStartCorner.y) < tolerance) {
        startIdx = i;
      }
      if (Math.abs(p.x - searchEndCorner.x) < tolerance && Math.abs(p.y - searchEndCorner.y) < tolerance) {
        endIdx = i;
      }
    }

    // If we found both corners, replace the segment between them
    if (startIdx !== -1 && endIdx !== -1) {
      if (startIdx < endIdx) {
        // Normal case: start comes before end in array
        const before = points.slice(0, startIdx);
        const after = points.slice(endIdx + 1);
        points.length = 0;
        points.push(...before, ...convertedPoints, ...after);
      } else if (startIdx > endIdx) {
        // Wrap-around case: start is after end in array (e.g., left edge)
        // The segment to replace wraps around: [startIdx] -> end of array -> [0] -> [endIdx]
        // Keep the middle segment: [endIdx+1] to [startIdx-1] (top, right, bottom edges)
        const middle = points.slice(endIdx + 1, startIdx);
        points.length = 0;
        // Reconstruct: converted points (new left edge), then middle (other edges)
        points.push(...convertedPoints);
        points.push(...middle);
      }
    } else {
      // Debug: corners not found
      console.warn(`applyCustomEdgePathToOutline: Could not find corners for ${edge} edge. startIdx=${startIdx}, endIdx=${endIdx}`);
    }
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
   *
   * Uses pre-computed extendedCorners (from docs/IMG_8225.jpeg approach) to ensure
   * all edges use the same corner positions.
   */
  protected applyExtensionToEdge(
    points: Point2D[],
    edgePosition: EdgePosition,
    extensionAmount: number,
    outerCorners: { topLeft: Point2D; topRight: Point2D; bottomRight: Point2D; bottomLeft: Point2D },
    fingerCorners: { topLeft: Point2D; topRight: Point2D; bottomRight: Point2D; bottomLeft: Point2D },
    _fingerData: AssemblyFingerData | null,
    _edgeConfig: EdgeConfig | undefined,
    _materialThickness: number,
    _fingerBlockingRanges: Map<EdgePosition, { start: number; end: number }[]>,
    allExtensions: EdgeExtensions,
    _allEdgeConfigs: EdgeConfig[],
    extendedCorners: { topLeft: Point2D; topRight: Point2D; bottomRight: Point2D; bottomLeft: Point2D }
  ): void {
    // Map edge to its corners (clockwise traversal)
    // finger* = where finger pattern starts/ends (may be inset from outer)
    // outer* = full panel dimension corners
    // extended* = pre-computed extended corners (same positions used by all edges)
    let fingerStart: Point2D, fingerEnd: Point2D;
    let outerStart: Point2D, outerEnd: Point2D;
    let extendedStart: Point2D, extendedEnd: Point2D;
    let adjacentStartEdge: EdgePosition, adjacentEndEdge: EdgePosition;

    switch (edgePosition) {
      case 'top':
        fingerStart = fingerCorners.topLeft;
        fingerEnd = fingerCorners.topRight;
        outerStart = outerCorners.topLeft;
        outerEnd = outerCorners.topRight;
        extendedStart = extendedCorners.topLeft;
        extendedEnd = extendedCorners.topRight;
        adjacentStartEdge = 'left';
        adjacentEndEdge = 'right';
        break;
      case 'right':
        fingerStart = fingerCorners.topRight;
        fingerEnd = fingerCorners.bottomRight;
        outerStart = outerCorners.topRight;
        outerEnd = outerCorners.bottomRight;
        extendedStart = extendedCorners.topRight;
        extendedEnd = extendedCorners.bottomRight;
        adjacentStartEdge = 'top';
        adjacentEndEdge = 'bottom';
        break;
      case 'bottom':
        fingerStart = fingerCorners.bottomRight;
        fingerEnd = fingerCorners.bottomLeft;
        outerStart = outerCorners.bottomRight;
        outerEnd = outerCorners.bottomLeft;
        extendedStart = extendedCorners.bottomRight;
        extendedEnd = extendedCorners.bottomLeft;
        adjacentStartEdge = 'right';
        adjacentEndEdge = 'left';
        break;
      case 'left':
        fingerStart = fingerCorners.bottomLeft;
        fingerEnd = fingerCorners.topLeft;
        outerStart = outerCorners.bottomLeft;
        outerEnd = outerCorners.topLeft;
        extendedStart = extendedCorners.bottomLeft;
        extendedEnd = extendedCorners.topLeft;
        adjacentStartEdge = 'bottom';
        adjacentEndEdge = 'top';
        break;
    }

    const adjacentStartExtension = allExtensions[adjacentStartEdge];
    const adjacentEndExtension = allExtensions[adjacentEndEdge];

    // Corner merging: when both this edge and adjacent edge are extended
    const startHasCornerMerging = extensionAmount > 0.001 && adjacentStartExtension > 0.001;
    const endHasCornerMerging = extensionAmount > 0.001 && adjacentEndExtension > 0.001;

    // Corner ownership: edges processed in order top(0), right(1), bottom(2), left(3)
    // Earlier edge owns the corner
    const EDGE_ORDER: Record<EdgePosition, number> = { top: 0, right: 1, bottom: 2, left: 3 };
    const currentOrder = EDGE_ORDER[edgePosition];
    const skipStart = startHasCornerMerging && EDGE_ORDER[adjacentStartEdge] < currentOrder;
    const skipEnd = endHasCornerMerging && EDGE_ORDER[adjacentEndEdge] < currentOrder;

    // Find corners in the path
    // Search for: extended corner (if adjacent already processed) OR finger corner
    const tolerance = 0.1;
    let startIdx = -1;
    let endIdx = -1;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];

      // For start corner
      if (startIdx === -1) {
        // If adjacent edge already processed and merged, look for extended corner first
        if (skipStart) {
          if (Math.abs(p.x - extendedStart.x) < tolerance && Math.abs(p.y - extendedStart.y) < tolerance) {
            startIdx = i;
          }
        }
        // Otherwise (or as fallback), look for finger corner
        if (startIdx === -1) {
          if (Math.abs(p.x - fingerStart.x) < tolerance && Math.abs(p.y - fingerStart.y) < tolerance) {
            startIdx = i;
          }
        }
      }

      // For end corner (always check, keep last match)
      if (skipEnd) {
        if (Math.abs(p.x - extendedEnd.x) < tolerance && Math.abs(p.y - extendedEnd.y) < tolerance) {
          endIdx = i;
        }
      }
      if (endIdx === -1 || !skipEnd) {
        if (Math.abs(p.x - fingerEnd.x) < tolerance && Math.abs(p.y - fingerEnd.y) < tolerance) {
          endIdx = i;
        }
      }
    }

    if (startIdx === -1 || endIdx === -1) {
      return; // Couldn't find corners
    }

    // Build extension path
    // The path goes: [transition from finger to outer] → outer → extended → extended → outer → [transition to finger]
    const extensionPath: Point2D[] = [];
    const isHorizontal = edgePosition === 'top' || edgePosition === 'bottom';

    // Helper to add axis-aligned transition between two points
    const addAxisAlignedTransition = (from: Point2D, to: Point2D, horizontalFirst: boolean) => {
      if (Math.abs(from.x - to.x) < 0.001 && Math.abs(from.y - to.y) < 0.001) return;
      if (horizontalFirst) {
        if (Math.abs(from.x - to.x) > 0.001) extensionPath.push({ x: to.x, y: from.y });
      } else {
        if (Math.abs(from.y - to.y) > 0.001) extensionPath.push({ x: from.x, y: to.y });
      }
    };

    // Start corner handling
    if (!skipStart) {
      // Add transition from finger corner to outer corner (if different)
      if (Math.abs(fingerStart.x - outerStart.x) > 0.001 || Math.abs(fingerStart.y - outerStart.y) > 0.001) {
        extensionPath.push({ ...fingerStart });
        addAxisAlignedTransition(fingerStart, outerStart, !isHorizontal);
      }
      // Add outer corner
      extensionPath.push({ ...outerStart });
      // Add transition to extended corner (axis-aligned)
      addAxisAlignedTransition(outerStart, extendedStart, isHorizontal);
      // Add extended corner
      extensionPath.push({ ...extendedStart });
    }

    // End corner handling
    if (!skipEnd) {
      // Add extended end corner
      extensionPath.push({ ...extendedEnd });
      // Add transition from extended to outer (axis-aligned)
      addAxisAlignedTransition(extendedEnd, outerEnd, isHorizontal);
      // Add outer corner
      extensionPath.push({ ...outerEnd });
      // Add transition from outer to finger corner (if different)
      if (Math.abs(outerEnd.x - fingerEnd.x) > 0.001 || Math.abs(outerEnd.y - fingerEnd.y) > 0.001) {
        addAxisAlignedTransition(outerEnd, fingerEnd, !isHorizontal);
        extensionPath.push({ ...fingerEnd });
      }
    }

    // Handle both corners skipped (e.g., left edge when all 4 are extended)
    if (skipStart && skipEnd) {
      // Just remove inner points, extended corners already in place from other edges
      if (startIdx < endIdx) {
        const before = points.slice(0, startIdx + 1);
        const after = points.slice(endIdx);
        points.length = 0;
        points.push(...before, ...after);
      } else {
        // Wrap-around
        const middle = points.slice(endIdx, startIdx + 1);
        points.length = 0;
        points.push(...middle);
      }
      return;
    }

    // Replace segment in path
    if (startIdx < endIdx) {
      // Normal case
      const effectiveStart = skipStart ? startIdx + 1 : startIdx;
      const effectiveEnd = skipEnd ? endIdx - 1 : endIdx;

      if (effectiveStart <= effectiveEnd) {
        const before = points.slice(0, effectiveStart);
        const after = points.slice(effectiveEnd + 1);
        points.length = 0;
        points.push(...before, ...extensionPath, ...after);
      }
    } else {
      // Wrap-around case (e.g., left edge: BL → TL where TL is at index 0)
      const adjustedStart = skipStart ? startIdx + 1 : startIdx;
      const middle = points.slice(endIdx + 1, adjustedStart);

      points.length = 0;

      // Start with the end point of extension path (or extended end if skip)
      if (skipEnd) {
        points.push({ ...extendedEnd });
      } else if (extensionPath.length > 0) {
        points.push(extensionPath[extensionPath.length - 1]);
      }

      // Add middle segment (other edges)
      points.push(...middle);

      // Add extension path for start corner
      // When skipEnd=true, we need to include ALL extension path points including extendedStart
      // because the path needs to close back to extendedEnd (not extendedStart)
      if (!skipStart && extensionPath.length > 0) {
        if (skipEnd) {
          // Include all points - the path closes to extendedEnd, not via extensionPath
          for (let i = 0; i < extensionPath.length; i++) {
            points.push(extensionPath[i]);
          }
        } else {
          // Normal case: exclude last point as it's the closing point
          for (let i = 0; i < extensionPath.length - 1; i++) {
            points.push(extensionPath[i]);
          }
        }
      } else if (skipStart && extensionPath.length > 0) {
        // When start is skipped, extension path only has end section
        // Add all except last (closing point)
        for (let i = 0; i < extensionPath.length - 1; i++) {
          points.push(extensionPath[i]);
        }
      }
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
   * Get the extended position of a corner when both adjacent edges have equal extensions.
   * Instead of extending in one direction (creating an L-shape when both edges extend),
   * this extends diagonally to a single point where both extensions meet.
   *
   * See docs/movecorneronadjacentextensions.md for the corner merging rule.
   */
  protected getExtendedCornerDiagonal(
    corner: Point2D,
    edgePosition: EdgePosition,
    edgeExtension: number,
    adjacentEdge: EdgePosition,
    adjacentExtension: number
  ): Point2D {
    // Calculate the diagonal corner by applying both extensions
    let x = corner.x;
    let y = corner.y;

    // Apply the main edge's extension direction
    switch (edgePosition) {
      case 'top':
        y += edgeExtension;
        break;
      case 'bottom':
        y -= edgeExtension;
        break;
      case 'left':
        x -= edgeExtension;
        break;
      case 'right':
        x += edgeExtension;
        break;
    }

    // Apply the adjacent edge's extension direction
    switch (adjacentEdge) {
      case 'top':
        y += adjacentExtension;
        break;
      case 'bottom':
        y -= adjacentExtension;
        break;
      case 'left':
        x -= adjacentExtension;
        break;
      case 'right':
        x += adjacentExtension;
        break;
    }

    return { x, y };
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
    this._cachedCornerEligibility = null;
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
        cornerFillets: this.cornerFillets,
        allCornerFillets: this.allCornerFillets,
        customEdgePaths: this.customEdgePaths,
        cutouts: this.cutouts,
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
        cornerEligibility: this.getCornerEligibility(),
        allCornerEligibility: this.getAllCornerEligibility(),
      },
    };
  }
}
