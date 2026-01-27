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
  AssemblyFingerData,
  Axis,
} from '../types';
import {
  ALL_EDGE_POSITIONS,
  getAdjacentFace,
} from '../../utils/faceGeometry';
import { getEdgeGender } from '../../utils/genderRules';
import { getEdgeAxis, Face as StoreFace, AssemblyConfig as StoreAssemblyConfig } from '../../types';

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
    const configs: EdgeConfig[] = [];
    // Cast engine FaceConfig[] to store Face[] (structurally identical)
    const faces = this._assembly.getFaces() as unknown as StoreFace[];
    // Cast engine AssemblyConfig to store AssemblyConfig (compatible subset)
    const assemblyConfig = this._assembly.assemblyConfig as unknown as StoreAssemblyConfig;

    for (const position of ALL_EDGE_POSITIONS) {
      const adjacentFaceId = getAdjacentFace(this.faceId, position);
      const meetsFace = this._assembly.isFaceSolid(adjacentFaceId);

      // Get gender (male/female/null) for this edge
      const gender = getEdgeGender(this.faceId, position, faces, assemblyConfig);

      // Get the world axis this edge runs along
      const axis = meetsFace ? getEdgeAxis(this.faceId, position) : null;

      configs.push({
        position,
        hasTabs: gender === 'male', // hasTabs means male joint (tabs extending out)
        meetsFaceId: meetsFace ? adjacentFaceId : null,
        meetsDividerId: null, // TODO: Check for dividers meeting this edge
        gender,
        axis,
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

  getMatingFaceId(edgePosition: EdgePosition): FaceId | null {
    const adjacentFaceId = getAdjacentFace(this.faceId, edgePosition);
    // Only return if the adjacent face is solid (actually exists)
    if (this._assembly.isFaceSolid(adjacentFaceId)) {
      return adjacentFaceId;
    }
    return null;
  }

  getFingerData(): AssemblyFingerData | null {
    return this._assembly.getFingerData();
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
    const { width, height, depth } = this.getAssemblyDimensions();
    const mt = this._assembly.material.thickness;
    const edgeConfigs = this.computeEdgeConfigs();

    // Get info about perpendicular edges to determine if they have tabs
    const getEdgeHasTabs = (pos: EdgePosition): boolean => {
      const config = edgeConfigs.find(e => e.position === pos);
      return config?.gender === 'male';
    };

    const topHasTabs = getEdgeHasTabs('top');
    const bottomHasTabs = getEdgeHasTabs('bottom');
    const leftHasTabs = getEdgeHasTabs('left');
    const rightHasTabs = getEdgeHasTabs('right');

    // Calculate max joint length (axis dimension minus MT at both ends)
    let maxJointLength: number;
    switch (axis) {
      case 'x': maxJointLength = width - 2 * mt; break;
      case 'y': maxJointLength = height - 2 * mt; break;
      case 'z': maxJointLength = depth - 2 * mt; break;
    }

    // Determine low/high positions based on perpendicular edge tabs
    // If perpendicular edge has tabs, the position is 0 or maxJointLength
    // If not, the position extends by MT
    let lowHasTabs: boolean;
    let highHasTabs: boolean;

    // For horizontal edges (top/bottom), low=left, high=right
    // For vertical edges (left/right), low=bottom, high=top
    if (edgePosition === 'top' || edgePosition === 'bottom') {
      lowHasTabs = leftHasTabs;
      highHasTabs = rightHasTabs;
    } else {
      lowHasTabs = bottomHasTabs;
      highHasTabs = topHasTabs;
    }

    const lowPos = lowHasTabs ? 0 : -mt;
    const highPos = highHasTabs ? maxJointLength : maxJointLength + mt;

    // Determine start/end based on edge direction
    // Edges follow clockwise pattern in 2D:
    // - top edge: left-to-right (low to high)
    // - right edge: top-to-bottom (high to low)
    // - bottom edge: right-to-left (high to low)
    // - left edge: bottom-to-top (low to high)
    const runsLowToHigh = edgePosition === 'top' || edgePosition === 'left';

    if (corner === 'start') {
      return runsLowToHigh ? lowPos : highPos;
    } else {
      return runsLowToHigh ? highPos : lowPos;
    }
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
