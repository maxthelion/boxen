/**
 * DividerPanelNode - Panel representing an internal divider from void subdivision
 *
 * Each divider panel belongs to a void and knows:
 * - The axis it divides along (x, y, or z)
 * - The position where it divides
 * - How to compute its dimensions based on the void bounds
 * - Which edges meet faces or other dividers (for finger joints)
 * - Its 3D position and rotation
 */

import { BasePanel, PanelDimensions, EdgeConfig } from './BasePanel';
import { BaseAssembly } from './BaseAssembly';
import { VoidNode } from './VoidNode';
import {
  NodeKind,
  Axis,
  FaceId,
  EdgePosition,
  MaterialConfig,
  Transform3D,
  PanelHole,
  DividerPanelSnapshot,
  AssemblyFingerData,
  JointGender,
} from '../types';
import {
  ALL_EDGE_POSITIONS,
  getDividerAdjacentFace,
} from '../../utils/faceGeometry';
import { getDividerEdgeGender } from '../../utils/genderRules';

export class DividerPanelNode extends BasePanel {
  readonly kind: NodeKind = 'divider-panel';
  protected _voidNode: VoidNode;
  protected _axis: Axis;
  protected _position: number;

  constructor(voidNode: VoidNode, axis: Axis, position: number, id?: string) {
    super(id ?? `divider-${voidNode.id}-split`);
    this._voidNode = voidNode;
    this._axis = axis;
    this._position = position;
  }

  // ==========================================================================
  // Accessors
  // ==========================================================================

  get axis(): Axis {
    return this._axis;
  }

  get position(): number {
    return this._position;
  }

  get voidId(): string {
    return this._voidNode.id;
  }

  // ==========================================================================
  // Abstract Method Implementations
  // ==========================================================================

  getMaterial(): MaterialConfig {
    // Walk up to find the assembly
    const assembly = this.findParentAssembly();
    if (!assembly) {
      throw new Error('DividerPanelNode must have an assembly ancestor');
    }
    return assembly.material;
  }

  computeDimensions(): PanelDimensions {
    const bounds = this._voidNode.bounds;

    // Divider dimensions depend on axis
    switch (this._axis) {
      case 'x':
        // X-axis divider: spans Y and Z of the void
        return { width: bounds.d, height: bounds.h };
      case 'y':
        // Y-axis divider: spans X and Z of the void
        return { width: bounds.w, height: bounds.d };
      case 'z':
        // Z-axis divider: spans X and Y of the void
        return { width: bounds.w, height: bounds.h };
    }
  }

  computeEdgeConfigs(): EdgeConfig[] {
    const assembly = this.findParentAssembly();
    if (!assembly) {
      throw new Error('DividerPanelNode must have an assembly ancestor');
    }

    const configs: EdgeConfig[] = [];

    for (const position of ALL_EDGE_POSITIONS) {
      const adjacentFaceId = getDividerAdjacentFace(this._axis, position);
      const meetsFace = assembly.isFaceSolid(adjacentFaceId);

      // Dividers always have male joints (tabs) when meeting solid faces
      const gender: JointGender | null = getDividerEdgeGender(meetsFace);

      // Get the axis this edge runs along
      const axis = meetsFace ? this.getEdgeAxisForPosition(position) : null;

      configs.push({
        position,
        hasTabs: gender === 'male',
        meetsFaceId: meetsFace ? adjacentFaceId : null,
        meetsDividerId: null, // TODO: Check for other dividers meeting this edge
        gender,
        axis,
      });
    }

    return configs;
  }

  /**
   * Get the world axis that a divider edge runs along
   */
  private getEdgeAxisForPosition(position: EdgePosition): Axis {
    // For a divider on axis A, the 2D panel has:
    // - Width along one perpendicular axis
    // - Height along the other perpendicular axis
    // The edge axis depends on which edge we're looking at

    switch (this._axis) {
      case 'x':
        // X-divider: width=Z, height=Y
        // top/bottom edges run along Z, left/right edges run along Y
        return (position === 'top' || position === 'bottom') ? 'z' : 'y';
      case 'y':
        // Y-divider: width=X, height=Z
        // top/bottom edges run along X, left/right edges run along Z
        return (position === 'top' || position === 'bottom') ? 'x' : 'z';
      case 'z':
        // Z-divider: width=X, height=Y
        // top/bottom edges run along X, left/right edges run along Y
        return (position === 'top' || position === 'bottom') ? 'x' : 'y';
    }
  }

  computeTransform(): Transform3D {
    const assembly = this.findParentAssembly();
    if (!assembly) {
      throw new Error('DividerPanelNode must have an assembly ancestor');
    }

    const bounds = this._voidNode.bounds;

    // Get assembly world transform
    const assemblyTransform = assembly.getWorldTransform();
    const [ax, ay, az] = assemblyTransform.position;

    // Calculate centers of the void bounds
    const boundsCenterX = bounds.x + bounds.w / 2;
    const boundsCenterY = bounds.y + bounds.h / 2;
    const boundsCenterZ = bounds.z + bounds.d / 2;

    // Adjust for assembly being centered at origin
    // (void bounds are in assembly-local coordinates starting at mt)
    const halfW = assembly.width / 2;
    const halfH = assembly.height / 2;
    const halfD = assembly.depth / 2;

    switch (this._axis) {
      case 'x':
        // X-axis divider: positioned at splitPosition on X
        // Rotation -90° around Y so 2D right (+X) maps to world +Z (front)
        return {
          position: [
            ax + this._position - halfW,
            ay + boundsCenterY - halfH,
            az + boundsCenterZ - halfD,
          ],
          rotation: [0, -Math.PI / 2, 0],
        };
      case 'y':
        // Y-axis divider: positioned at splitPosition on Y
        // Rotation -90° around X so 2D top maps to world +Z
        return {
          position: [
            ax + boundsCenterX - halfW,
            ay + this._position - halfH,
            az + boundsCenterZ - halfD,
          ],
          rotation: [-Math.PI / 2, 0, 0],
        };
      case 'z':
        // Z-axis divider: positioned at splitPosition on Z
        // No rotation needed (2D X/Y map to world X/Y)
        return {
          position: [
            ax + boundsCenterX - halfW,
            ay + boundsCenterY - halfH,
            az + this._position - halfD,
          ],
          rotation: [0, 0, 0],
        };
    }
  }

  computeHoles(): PanelHole[] {
    // TODO: Compute holes from other dividers and sub-assemblies that intersect
    return [];
  }

  getMatingFaceId(edgePosition: EdgePosition): FaceId | null {
    const assembly = this.findParentAssembly();
    if (!assembly) {
      return null;
    }

    const adjacentFaceId = getDividerAdjacentFace(this._axis, edgePosition);
    // Only return if the adjacent face is solid (actually exists)
    if (assembly.isFaceSolid(adjacentFaceId)) {
      return adjacentFaceId;
    }
    return null;
  }

  getFingerData(): AssemblyFingerData | null {
    const assembly = this.findParentAssembly();
    if (!assembly) {
      return null;
    }
    return assembly.getFingerData();
  }

  /**
   * Compute the axis position for a corner of an edge.
   * This determines where the edge starts/ends along the world axis.
   * Used for finger joint alignment across panels.
   */
  protected computeEdgeAxisPosition(
    edgePosition: EdgePosition,
    corner: 'start' | 'end',
    axis: Axis
  ): number {
    const assembly = this.findParentAssembly();
    if (!assembly) {
      return 0;
    }

    const { width, height, depth } = {
      width: assembly.width,
      height: assembly.height,
      depth: assembly.depth,
    };
    const mt = assembly.material.thickness;

    // Get assembly-level dimensions minus MT at both ends
    let maxJointLength: number;
    switch (axis) {
      case 'x': maxJointLength = width - 2 * mt; break;
      case 'y': maxJointLength = height - 2 * mt; break;
      case 'z': maxJointLength = depth - 2 * mt; break;
    }

    // For divider panels, edges meet face panels
    // All divider edges have male joints (tabs), so they define the full joint range
    // Position 0 is the start of the joint area, maxJointLength is the end

    // Determine which edge direction this is
    // Horizontal edges (top/bottom): start=left, end=right -> low to high
    // Vertical edges (left/right): start=bottom, end=top for left, top to bottom for right
    const isHorizontalEdge = edgePosition === 'top' || edgePosition === 'bottom';

    // For horizontal edges: left is start (pos 0), right is end (pos maxJointLength)
    // For vertical edges: bottom is start, top is end
    // But we need to account for the edge traversal direction in the outline

    if (isHorizontalEdge) {
      // Top edge: left to right (0 to maxJointLength)
      // Bottom edge: right to left (maxJointLength to 0)
      if (edgePosition === 'top') {
        return corner === 'start' ? 0 : maxJointLength;
      } else {
        return corner === 'start' ? maxJointLength : 0;
      }
    } else {
      // Right edge: top to bottom (maxJointLength to 0)
      // Left edge: bottom to top (0 to maxJointLength)
      if (edgePosition === 'right') {
        return corner === 'start' ? maxJointLength : 0;
      } else {
        return corner === 'start' ? 0 : maxJointLength;
      }
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  protected findParentAssembly(): BaseAssembly | null {
    let node = this._voidNode.parent;
    while (node) {
      if (node instanceof BaseAssembly) {
        return node;
      }
      node = node.parent;
    }
    return null;
  }

  // ==========================================================================
  // Serialization
  // ==========================================================================

  serialize(): DividerPanelSnapshot {
    const base = this.serializeBase();
    return {
      ...base,
      kind: 'divider-panel',
      props: {
        ...base.props,
        axis: this._axis,
        position: this._position,
        voidId: this._voidNode.id,
      },
    };
  }
}
