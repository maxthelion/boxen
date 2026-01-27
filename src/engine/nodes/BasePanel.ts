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
  PanelEdge,
  PanelHole,
  PanelOutline,
  BasePanelSnapshot,
  MaterialConfig,
} from '../types';

export interface PanelDimensions {
  width: number;   // 2D width (horizontal in local coords)
  height: number;  // 2D height (vertical in local coords)
}

export interface EdgeConfig {
  position: EdgePosition;
  hasTabs: boolean;
  meetsFaceId: string | null;
  meetsDividerId: string | null;
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
   * Compute the full outline with finger joints
   * Uses edge configs to determine which edges have tabs
   */
  protected computeOutline(): PanelOutline {
    const dims = this.getDimensions();
    const edges = this.getEdges();
    const material = this.getMaterial();
    const holes = this.computeHoles();

    // Calculate corners with insets for solid faces
    const halfW = dims.width / 2;
    const halfH = dims.height / 2;
    const mt = material.thickness;

    // Determine corner insets based on edge configs
    const topEdge = edges.find(e => e.position === 'top');
    const bottomEdge = edges.find(e => e.position === 'bottom');
    const leftEdge = edges.find(e => e.position === 'left');
    const rightEdge = edges.find(e => e.position === 'right');

    const topHasTabs = topEdge?.hasTabs ?? false;
    const bottomHasTabs = bottomEdge?.hasTabs ?? false;
    const leftHasTabs = leftEdge?.hasTabs ?? false;
    const rightHasTabs = rightEdge?.hasTabs ?? false;

    // Apply extensions
    const extTop = this._edgeExtensions.top;
    const extBottom = this._edgeExtensions.bottom;
    const extLeft = this._edgeExtensions.left;
    const extRight = this._edgeExtensions.right;

    // Base corners (with insets for edges that have tabs)
    const corners = {
      topLeft: {
        x: -halfW + (leftHasTabs ? mt : 0) - extLeft,
        y: halfH - (topHasTabs ? mt : 0) + extTop,
      },
      topRight: {
        x: halfW - (rightHasTabs ? mt : 0) + extRight,
        y: halfH - (topHasTabs ? mt : 0) + extTop,
      },
      bottomRight: {
        x: halfW - (rightHasTabs ? mt : 0) + extRight,
        y: -halfH + (bottomHasTabs ? mt : 0) - extBottom,
      },
      bottomLeft: {
        x: -halfW + (leftHasTabs ? mt : 0) - extLeft,
        y: -halfH + (bottomHasTabs ? mt : 0) - extBottom,
      },
    };

    // Build outline points
    // For now, just use straight edges - finger joint generation will be added later
    const points: Point2D[] = [];

    // Top edge (left to right)
    points.push(corners.topLeft);
    if (topHasTabs) {
      // TODO: Generate finger joint points
      points.push(corners.topRight);
    } else {
      points.push(corners.topRight);
    }

    // Right edge (top to bottom)
    if (rightHasTabs) {
      // TODO: Generate finger joint points
      points.push(corners.bottomRight);
    } else {
      points.push(corners.bottomRight);
    }

    // Bottom edge (right to left)
    if (bottomHasTabs) {
      // TODO: Generate finger joint points
      points.push(corners.bottomLeft);
    } else {
      points.push(corners.bottomLeft);
    }

    // Left edge (bottom to top) - closes the shape
    // Don't add topLeft again, shape auto-closes

    return {
      points,
      holes,
    };
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
      },
    };
  }
}
