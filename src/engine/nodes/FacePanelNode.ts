/**
 * FacePanelNode - Panel representing one of the 6 faces of an assembly
 *
 * Each face panel belongs to an assembly and knows:
 * - Which face it represents (front, back, left, right, top, bottom)
 * - How to compute its dimensions based on assembly size
 * - Which edges meet other faces (for finger joints)
 * - Its 3D position and rotation
 */

import { BasePanel, PanelDimensions, EdgeConfig } from './BasePanel';
import { BaseAssembly } from './BaseAssembly';
import {
  NodeKind,
  FaceId,
  EdgePosition,
  MaterialConfig,
  Transform3D,
  PanelHole,
  FacePanelSnapshot,
} from '../types';

// Which edges meet which faces for each face panel
const FACE_EDGE_ADJACENCY: Record<FaceId, Record<EdgePosition, FaceId | null>> = {
  front: { top: 'top', bottom: 'bottom', left: 'left', right: 'right' },
  back: { top: 'top', bottom: 'bottom', left: 'right', right: 'left' },
  left: { top: 'top', bottom: 'bottom', left: 'back', right: 'front' },
  right: { top: 'top', bottom: 'bottom', left: 'front', right: 'back' },
  top: { top: 'back', bottom: 'front', left: 'left', right: 'right' },
  bottom: { top: 'front', bottom: 'back', left: 'left', right: 'right' },
};

// Edge positions for iteration
const ALL_EDGE_POSITIONS: EdgePosition[] = ['top', 'bottom', 'left', 'right'];

export class FacePanelNode extends BasePanel {
  readonly kind: NodeKind = 'face-panel';
  readonly faceId: FaceId;
  protected _assembly: BaseAssembly;

  constructor(faceId: FaceId, assembly: BaseAssembly, id?: string) {
    super(id ?? `face-${faceId}`);
    this.faceId = faceId;
    this._assembly = assembly;
  }

  // ==========================================================================
  // Abstract Method Implementations
  // ==========================================================================

  getMaterial(): MaterialConfig {
    return this._assembly.material;
  }

  computeDimensions(): PanelDimensions {
    const { width, height, depth, assemblyAxis } = this.getAssemblyDimensions();

    // Get lid insets for assembly axis faces
    const lidPositive = this._assembly.assemblyConfig.lids.positive;
    const lidNegative = this._assembly.assemblyConfig.lids.negative;

    switch (this.faceId) {
      case 'front':
      case 'back':
        // Front/back panels: width x height
        // If assembly axis is Z, these are lids and may be inset
        if (assemblyAxis === 'z') {
          const isPositive = this.faceId === 'front';
          const lidConfig = isPositive ? lidPositive : lidNegative;
          const inset = lidConfig.inset;
          return {
            width: width - 2 * inset,
            height: height - 2 * inset,
          };
        }
        return { width, height };

      case 'left':
      case 'right':
        // Left/right panels: depth x height
        // If assembly axis is X, these are lids
        if (assemblyAxis === 'x') {
          const isPositive = this.faceId === 'right';
          const lidConfig = isPositive ? lidPositive : lidNegative;
          const inset = lidConfig.inset;
          return {
            width: depth - 2 * inset,
            height: height - 2 * inset,
          };
        }
        return { width: depth, height };

      case 'top':
      case 'bottom':
        // Top/bottom panels: width x depth
        // If assembly axis is Y, these are lids
        if (assemblyAxis === 'y') {
          const isPositive = this.faceId === 'top';
          const lidConfig = isPositive ? lidPositive : lidNegative;
          const inset = lidConfig.inset;
          return {
            width: width - 2 * inset,
            height: depth - 2 * inset,
          };
        }
        return { width, height: depth };
    }
  }

  computeEdgeConfigs(): EdgeConfig[] {
    const adjacency = FACE_EDGE_ADJACENCY[this.faceId];
    const configs: EdgeConfig[] = [];

    for (const position of ALL_EDGE_POSITIONS) {
      const adjacentFaceId = adjacency[position];
      const meetsFace = adjacentFaceId !== null && this._assembly.isFaceSolid(adjacentFaceId);

      configs.push({
        position,
        hasTabs: meetsFace,
        meetsFaceId: meetsFace ? adjacentFaceId : null,
        meetsDividerId: null, // TODO: Check for dividers meeting this edge
      });
    }

    return configs;
  }

  computeTransform(): Transform3D {
    const { width, height, depth } = this.getAssemblyDimensions();
    const mt = this._assembly.material.thickness;
    const halfW = width / 2;
    const halfH = height / 2;
    const halfD = depth / 2;

    // Get world transform from assembly
    const assemblyTransform = this._assembly.getWorldTransform();
    const [ax, ay, az] = assemblyTransform.position;

    switch (this.faceId) {
      case 'front':
        return {
          position: [ax, ay, az + halfD - mt / 2],
          rotation: [0, 0, 0],
        };
      case 'back':
        return {
          position: [ax, ay, az - halfD + mt / 2],
          rotation: [0, Math.PI, 0],
        };
      case 'left':
        return {
          position: [ax - halfW + mt / 2, ay, az],
          rotation: [0, -Math.PI / 2, 0],
        };
      case 'right':
        return {
          position: [ax + halfW - mt / 2, ay, az],
          rotation: [0, Math.PI / 2, 0],
        };
      case 'top':
        return {
          position: [ax, ay + halfH - mt / 2, az],
          rotation: [-Math.PI / 2, 0, 0],
        };
      case 'bottom':
        return {
          position: [ax, ay - halfH + mt / 2, az],
          rotation: [Math.PI / 2, 0, 0],
        };
    }
  }

  computeHoles(): PanelHole[] {
    // TODO: Compute holes from dividers and sub-assemblies that intersect this face
    return [];
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  protected getAssemblyDimensions(): {
    width: number;
    height: number;
    depth: number;
    assemblyAxis: 'x' | 'y' | 'z';
  } {
    return {
      width: this._assembly.width,
      height: this._assembly.height,
      depth: this._assembly.depth,
      assemblyAxis: this._assembly.assemblyAxis,
    };
  }

  // ==========================================================================
  // Serialization
  // ==========================================================================

  serialize(): FacePanelSnapshot {
    const base = this.serializeBase();
    return {
      ...base,
      kind: 'face-panel',
      props: {
        ...base.props,
        faceId: this.faceId,
      },
    };
  }
}
