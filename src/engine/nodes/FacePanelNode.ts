/**
 * FacePanelNode - Panel representing one of the 6 faces of an assembly
 *
 * Each face panel belongs to an assembly and knows:
 * - Which face it represents (front, back, left, right, top, bottom)
 * - How to compute its dimensions based on assembly size
 * - Which edges meet other faces (for finger joints)
 * - Its 3D position and rotation
 */

import { BasePanel, PanelDimensions, EdgeConfig, FeetParams } from './BasePanel';
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
  Subdivision,
  Bounds3D,
  Point2D,
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
    // Use UUID - faceId info is in props, not encoded in ID
    super(id);
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
    const holes: PanelHole[] = [];
    const subdivisions = this._assembly.getSubdivisions();
    const { width, height, depth } = this.getAssemblyDimensions();
    const mt = this._assembly.material.thickness;
    const fingerData = this.getFingerData();
    const tolerance = 0.01;

    // Get lid insets for boundary calculations
    const assemblyConfig = this._assembly.assemblyConfig;
    const assemblyAxis = assemblyConfig.assemblyAxis;
    const getLidInset = (side: 'positive' | 'negative'): number => {
      return assemblyConfig.lids[side].inset || 0;
    };

    // Calculate boundary thresholds accounting for lid insets
    const topInset = assemblyAxis === 'y' ? getLidInset('positive') : 0;
    const bottomInset = assemblyAxis === 'y' ? getLidInset('negative') : 0;
    const leftInset = assemblyAxis === 'x' ? getLidInset('negative') : 0;
    const rightInset = assemblyAxis === 'x' ? getLidInset('positive') : 0;
    const frontInset = assemblyAxis === 'z' ? getLidInset('positive') : 0;
    const backInset = assemblyAxis === 'z' ? getLidInset('negative') : 0;

    // Check if a face is solid
    const isFaceSolid = (faceId: FaceId): boolean => this._assembly.isFaceSolid(faceId);

    for (const sub of subdivisions) {
      const { bounds } = sub;

      // Check if divider meets face boundaries (accounting for lid insets)
      // Void bounds are interior coordinates: from mt to (dim - mt)
      // So we compare against mt + inset (interior boundary), not 0 or full dimension
      const meetsBottom = bounds.y <= mt + bottomInset + tolerance;
      const meetsTop = bounds.y + bounds.h >= height - mt - topInset - tolerance;
      const meetsLeft = bounds.x <= mt + leftInset + tolerance;
      const meetsRight = bounds.x + bounds.w >= width - mt - rightInset - tolerance;
      const meetsBack = bounds.z <= mt + backInset + tolerance;
      const meetsFront = bounds.z + bounds.d >= depth - mt - frontInset - tolerance;

      // Calculate slot info based on face and divider axis
      const slotInfo = this.calculateSlotInfo(
        sub, { width, height, depth }, mt,
        { meetsBottom, meetsTop, meetsLeft, meetsRight, meetsBack, meetsFront },
        isFaceSolid
      );

      if (!slotInfo) continue;

      const { slotX, slotY, isHorizontal, startInset, endInset, slotAxis } = slotInfo;

      // Generate slot holes at finger positions
      if (fingerData && fingerData[slotAxis]) {
        const axisFingerData = fingerData[slotAxis];
        const { points: transitionPoints, innerOffset, maxJointLength: maxJoint } = axisFingerData;

        // Calculate bounds range for this divider (same logic as panelGenerator)
        // Uses the same wall-detection logic as divider edge position calculation
        const calcBoundsRange = (): { boundsStart: number; boundsEnd: number } => {
          let boundsStart: number;
          let boundsEnd: number;

          if (slotAxis === 'x') {
            const atLowWall = bounds.x <= mt + tolerance;
            const atHighWall = bounds.x + bounds.w >= width - mt - tolerance;
            boundsStart = atLowWall ? (startInset > 0 ? 0 : -mt) : (bounds.x - mt);
            boundsEnd = atHighWall ? (endInset > 0 ? maxJoint : maxJoint + mt) : (bounds.x + bounds.w - mt);
          } else if (slotAxis === 'y') {
            const atLowWall = bounds.y <= mt + tolerance;
            const atHighWall = bounds.y + bounds.h >= height - mt - tolerance;
            boundsStart = atLowWall ? (startInset > 0 ? 0 : -mt) : (bounds.y - mt);
            boundsEnd = atHighWall ? (endInset > 0 ? maxJoint : maxJoint + mt) : (bounds.y + bounds.h - mt);
          } else {
            const atLowWall = bounds.z <= mt + tolerance;
            const atHighWall = bounds.z + bounds.d >= depth - mt - tolerance;
            boundsStart = atLowWall ? (startInset > 0 ? 0 : -mt) : (bounds.z - mt);
            boundsEnd = atHighWall ? (endInset > 0 ? maxJoint : maxJoint + mt) : (bounds.z + bounds.d - mt);
          }

          return { boundsStart, boundsEnd };
        };

        const { boundsStart, boundsEnd } = calcBoundsRange();

        // Effective range accounts for corner insets
        const effectiveLow = startInset > 0 ? Math.max(0, boundsStart) : boundsStart;
        const effectiveHigh = endInset > 0 ? Math.min(maxJoint, boundsEnd) : boundsEnd;

        // Build section boundaries including start/end
        // Pattern: [innerOffset, transition1, transition2, ..., maxJoint - innerOffset]
        // Even-indexed sections (0, 2, 4, ...) are finger sections where divider tabs go
        const allBoundaries = [innerOffset, ...transitionPoints, maxJoint - innerOffset];

        let slotIndex = 0;
        for (let i = 0; i < allBoundaries.length - 1; i++) {
          if (i % 2 === 0) {  // Finger section (where divider tabs go)
            const sectionStart = allBoundaries[i];
            const sectionEnd = allBoundaries[i + 1];

            // Only include COMPLETE finger sections fully within the effective range
            // Partial fingers/slots are not allowed
            if (sectionStart < effectiveLow || sectionEnd > effectiveHigh) continue;

            // Convert from 0-based axis coords to 2D panel coords (centered)
            // 0-based coords: 0 to maxJoint
            // 2D panel coords: -halfPanelDim to +halfPanelDim
            const offsetStart = sectionStart - maxJoint / 2;
            const offsetEnd = sectionEnd - maxJoint / 2;

            const holePoints = this.createSlotHolePoints(
              slotX, slotY, offsetStart, offsetEnd, isHorizontal, mt
            );

            holes.push({
              id: `divider-slot-${sub.id}-${slotIndex}`,
              source: { type: 'divider-slot', sourceId: sub.id },
              path: holePoints,
            });
            slotIndex++;
          }
        }
      }
    }

    return holes;
  }

  /**
   * Calculate slot info for a subdivision on this face
   */
  private calculateSlotInfo(
    sub: Subdivision,
    dims: { width: number; height: number; depth: number },
    mt: number,
    meets: { meetsBottom: boolean; meetsTop: boolean; meetsLeft: boolean; meetsRight: boolean; meetsBack: boolean; meetsFront: boolean },
    isFaceSolid: (faceId: FaceId) => boolean
  ): {
    slotX: number | null;
    slotY: number | null;
    slotLength: number;
    isHorizontal: boolean;
    startInset: number;
    endInset: number;
    slotAxis: Axis;
  } | null {
    const { bounds, position, axis } = sub;
    const { width, height, depth } = dims;
    const { meetsBottom, meetsTop, meetsLeft, meetsRight, meetsBack, meetsFront } = meets;

    let slotX: number | null = null;
    let slotY: number | null = null;
    let slotLength: number = 0;
    let isHorizontal: boolean = false;
    let startInset: number = 0;
    let endInset: number = 0;
    let slotAxis: Axis = 'x';

    switch (this.faceId) {
      case 'front':
        if (!meetsFront) return null;
        if (axis === 'x') {
          slotX = position - width / 2;
          slotLength = bounds.h;
          isHorizontal = false;
          slotAxis = 'y';
          startInset = meetsBottom && isFaceSolid('bottom') ? mt : 0;
          endInset = meetsTop && isFaceSolid('top') ? mt : 0;
        } else if (axis === 'y') {
          slotY = position - height / 2;
          slotLength = bounds.w;
          isHorizontal = true;
          slotAxis = 'x';
          startInset = meetsLeft && isFaceSolid('left') ? mt : 0;
          endInset = meetsRight && isFaceSolid('right') ? mt : 0;
        } else {
          return null; // Z-axis dividers don't intersect front/back
        }
        break;

      case 'back':
        if (!meetsBack) return null;
        if (axis === 'x') {
          slotX = -(position - width / 2); // Mirrored for back face
          slotLength = bounds.h;
          isHorizontal = false;
          slotAxis = 'y';
          startInset = meetsBottom && isFaceSolid('bottom') ? mt : 0;
          endInset = meetsTop && isFaceSolid('top') ? mt : 0;
        } else if (axis === 'y') {
          slotY = position - height / 2;
          slotLength = bounds.w;
          isHorizontal = true;
          slotAxis = 'x';
          startInset = meetsRight && isFaceSolid('right') ? mt : 0; // Mirrored
          endInset = meetsLeft && isFaceSolid('left') ? mt : 0;
        } else {
          return null;
        }
        break;

      case 'left':
        if (!meetsLeft) return null;
        if (axis === 'y') {
          slotY = position - height / 2;
          slotLength = bounds.d;
          isHorizontal = true;
          slotAxis = 'z';
          startInset = meetsBack && isFaceSolid('back') ? mt : 0;
          endInset = meetsFront && isFaceSolid('front') ? mt : 0;
        } else if (axis === 'z') {
          slotX = position - depth / 2;
          slotLength = bounds.h;
          isHorizontal = false;
          slotAxis = 'y';
          startInset = meetsBottom && isFaceSolid('bottom') ? mt : 0;
          endInset = meetsTop && isFaceSolid('top') ? mt : 0;
        } else {
          return null; // X-axis dividers don't intersect left/right
        }
        break;

      case 'right':
        if (!meetsRight) return null;
        if (axis === 'y') {
          slotY = position - height / 2;
          slotLength = bounds.d;
          isHorizontal = true;
          slotAxis = 'z';
          startInset = meetsFront && isFaceSolid('front') ? mt : 0; // Mirrored
          endInset = meetsBack && isFaceSolid('back') ? mt : 0;
        } else if (axis === 'z') {
          slotX = -(position - depth / 2); // Mirrored
          slotLength = bounds.h;
          isHorizontal = false;
          slotAxis = 'y';
          startInset = meetsBottom && isFaceSolid('bottom') ? mt : 0;
          endInset = meetsTop && isFaceSolid('top') ? mt : 0;
        } else {
          return null;
        }
        break;

      case 'top':
        if (!meetsTop) return null;
        if (axis === 'x') {
          slotX = position - width / 2;
          slotLength = bounds.d;
          isHorizontal = false;
          slotAxis = 'z';
          startInset = meetsBack && isFaceSolid('back') ? mt : 0;
          endInset = meetsFront && isFaceSolid('front') ? mt : 0;
        } else if (axis === 'z') {
          // Top face local Y points toward front (negative world Z)
          slotY = -(position - depth / 2);
          slotLength = bounds.w;
          isHorizontal = true;
          slotAxis = 'x';
          startInset = meetsLeft && isFaceSolid('left') ? mt : 0;
          endInset = meetsRight && isFaceSolid('right') ? mt : 0;
        } else {
          return null; // Y-axis dividers don't intersect top/bottom
        }
        break;

      case 'bottom':
        if (!meetsBottom) return null;
        if (axis === 'x') {
          slotX = position - width / 2;
          slotLength = bounds.d;
          isHorizontal = false;
          slotAxis = 'z';
          startInset = meetsFront && isFaceSolid('front') ? mt : 0; // Different orientation
          endInset = meetsBack && isFaceSolid('back') ? mt : 0;
        } else if (axis === 'z') {
          // Bottom face local Y points toward front (positive world Z)
          slotY = position - depth / 2;
          slotLength = bounds.w;
          isHorizontal = true;
          slotAxis = 'x';
          startInset = meetsLeft && isFaceSolid('left') ? mt : 0;
          endInset = meetsRight && isFaceSolid('right') ? mt : 0;
        } else {
          return null;
        }
        break;
    }

    if (slotX === null && slotY === null) return null;

    return { slotX, slotY, slotLength, isHorizontal, startInset, endInset, slotAxis };
  }

  /**
   * Get the start position of the slot along its axis based on divider bounds
   */
  private getSlotBoundsStart(axis: Axis, bounds: Bounds3D): number {
    switch (axis) {
      case 'x': return bounds.x;
      case 'y': return bounds.y;
      case 'z': return bounds.z;
    }
  }

  /**
   * Get the end position of the slot along its axis based on divider bounds
   */
  private getSlotBoundsEnd(axis: Axis, bounds: Bounds3D): number {
    switch (axis) {
      case 'x': return bounds.x + bounds.w;
      case 'y': return bounds.y + bounds.h;
      case 'z': return bounds.z + bounds.d;
    }
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
  // Feet Configuration
  // ==========================================================================

  /**
   * Determine if this face panel should have feet
   * Feet only apply to wall panels (not lids) when feet are enabled
   */
  protected getFeetConfig(): { edge: 'bottom'; params: FeetParams } | null {
    const feetConfig = this._assembly.feet;
    if (!feetConfig || !feetConfig.enabled || feetConfig.height <= 0) {
      return null;
    }

    // Determine if this is a wall face (not a lid)
    // The lid faces depend on the assembly axis:
    // - Y axis: top/bottom are lids
    // - X axis: left/right are lids
    // - Z axis: front/back are lids
    const assemblyAxis = this._assembly.assemblyAxis;
    const isLid = this.isLidFace(assemblyAxis);
    if (isLid) {
      return null;
    }

    // Wall panels get feet on the bottom edge
    return {
      edge: 'bottom',
      params: {
        height: feetConfig.height,
        width: feetConfig.width,
        inset: feetConfig.inset,
      },
    };
  }

  /**
   * Check if this face is a lid for the given assembly axis
   */
  private isLidFace(assemblyAxis: Axis): boolean {
    switch (assemblyAxis) {
      case 'y':
        return this.faceId === 'top' || this.faceId === 'bottom';
      case 'x':
        return this.faceId === 'left' || this.faceId === 'right';
      case 'z':
        return this.faceId === 'front' || this.faceId === 'back';
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
