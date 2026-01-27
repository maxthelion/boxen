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
} from '../types';

// Map from divider axis + edge position to which face it meets
const DIVIDER_EDGE_ADJACENCY: Record<Axis, Record<EdgePosition, FaceId>> = {
  x: { top: 'top', bottom: 'bottom', left: 'back', right: 'front' },
  y: { top: 'back', bottom: 'front', left: 'left', right: 'right' },
  z: { top: 'top', bottom: 'bottom', left: 'left', right: 'right' },
};

const ALL_EDGE_POSITIONS: EdgePosition[] = ['top', 'bottom', 'left', 'right'];

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

    const adjacency = DIVIDER_EDGE_ADJACENCY[this._axis];
    const configs: EdgeConfig[] = [];

    for (const position of ALL_EDGE_POSITIONS) {
      const adjacentFaceId = adjacency[position];
      const meetsFace = assembly.isFaceSolid(adjacentFaceId);

      configs.push({
        position,
        hasTabs: meetsFace,
        meetsFaceId: meetsFace ? adjacentFaceId : null,
        meetsDividerId: null, // TODO: Check for other dividers meeting this edge
      });
    }

    return configs;
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

    const adjacency = DIVIDER_EDGE_ADJACENCY[this._axis];
    const adjacentFaceId = adjacency[edgePosition];
    // Only return if the adjacent face is solid (actually exists)
    if (adjacentFaceId && assembly.isFaceSolid(adjacentFaceId)) {
      return adjacentFaceId;
    }
    return null;
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
