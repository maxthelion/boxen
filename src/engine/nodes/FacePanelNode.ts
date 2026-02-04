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
  EdgeStatusInfo,
} from '../types';
import {
  ALL_EDGE_POSITIONS,
  getAdjacentFace,
} from '../../utils/faceGeometry';
import { getEdgeGender } from '../../utils/genderRules';
import { getEdgeAxis, Face as StoreFace, AssemblyConfig as StoreAssemblyConfig, getLidFaceId } from '../../types';
import { debug, enableDebugTag } from '../../utils/debug';

enableDebugTag('face-cross-lap');

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

    // Build cross-lap blocking info for each subdivision
    // This tracks positions where a divider's material is cut away due to cross-lap joints
    const crossLapBlocking = this.buildCrossLapBlockingInfo(subdivisions, mt);


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
        // Note: When a divider doesn't reach a wall, its panel body extends mt beyond the void
        // to meet the adjacent divider, so slots should also extend there.
        const calcBoundsRange = (): { boundsStart: number; boundsEnd: number } => {
          let boundsStart: number;
          let boundsEnd: number;

          if (slotAxis === 'x') {
            const atLowWall = bounds.x <= mt + tolerance;
            const atHighWall = bounds.x + bounds.w >= width - mt - tolerance;
            boundsStart = atLowWall ? (startInset > 0 ? 0 : -mt) : (bounds.x - mt);
            // When not at wall, panel body extends to void end + mt (to meet adjacent divider)
            // In 0-based coords: (bounds.x + bounds.w + mt) - mt = bounds.x + bounds.w
            boundsEnd = atHighWall ? (endInset > 0 ? maxJoint : maxJoint + mt) : (bounds.x + bounds.w);
          } else if (slotAxis === 'y') {
            const atLowWall = bounds.y <= mt + tolerance;
            const atHighWall = bounds.y + bounds.h >= height - mt - tolerance;
            boundsStart = atLowWall ? (startInset > 0 ? 0 : -mt) : (bounds.y - mt);
            boundsEnd = atHighWall ? (endInset > 0 ? maxJoint : maxJoint + mt) : (bounds.y + bounds.h);
          } else {
            const atLowWall = bounds.z <= mt + tolerance;
            const atHighWall = bounds.z + bounds.d >= depth - mt - tolerance;
            boundsStart = atLowWall ? (startInset > 0 ? 0 : -mt) : (bounds.z - mt);
            boundsEnd = atHighWall ? (endInset > 0 ? maxJoint : maxJoint + mt) : (bounds.z + bounds.d);
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

        // Get blocking ranges for this subdivision (cross-lap positions where material is removed)
        const blockingRanges = crossLapBlocking.get(sub.id) || [];

        let slotIndex = 0;
        for (let i = 0; i < allBoundaries.length - 1; i++) {
          if (i % 2 === 0) {  // Finger section (where divider tabs go)
            const sectionStart = allBoundaries[i];
            const sectionEnd = allBoundaries[i + 1];

            // Only include COMPLETE finger sections fully within the effective range
            // Partial fingers/slots are not allowed
            if (sectionStart < effectiveLow || sectionEnd > effectiveHigh) continue;

            // Skip slots that overlap with cross-lap blocking ranges
            // This is where the divider's material has been cut away by a cross-lap joint
            const isBlocked = blockingRanges.some(range =>
              sectionStart < range.end && sectionEnd > range.start
            );
            if (isBlocked) {
              continue;
            }

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

    // Generate extension-slot holes for extended female edges
    // TODO: Read docs/movecorneronadjacentextensions.md for corner handling
    const extensionSlots = this.generateExtensionSlotHoles(fingerData, mt);
    holes.push(...extensionSlots);

    return holes;
  }

  /**
   * Generate slot holes for edges that have been extended outward.
   * When an edge is extended (via feet or inset/outset tool), the finger pattern
   * becomes slot holes at the original edge position.
   *
   * Only generates slots for female edges (edges that receive tabs from adjacent panels).
   */
  private generateExtensionSlotHoles(
    fingerData: AssemblyFingerData | null,
    mt: number
  ): PanelHole[] {
    const holes: PanelHole[] = [];
    if (!fingerData) return holes;

    const dims = this.getDimensions();
    const halfW = dims.width / 2;
    const halfH = dims.height / 2;
    const assemblyAxis = this._assembly.assemblyAxis;

    // Get effective edge extensions including feet
    const feetConfig = this.getFeetConfig();
    const feetExtension = feetConfig ? (mt + feetConfig.params.height) : 0;
    const extensions = {
      top: this._edgeExtensions.top ?? 0,
      bottom: (this._edgeExtensions.bottom ?? 0) + feetExtension,
      left: this._edgeExtensions.left ?? 0,
      right: this._edgeExtensions.right ?? 0,
    };

    // Build faces array for getEdgeGender
    const storeFaces: StoreFace[] = (['front', 'back', 'left', 'right', 'top', 'bottom'] as FaceId[]).map(faceId => ({
      id: faceId,
      solid: this._assembly.isFaceSolid(faceId),
    }));

    const engineLids = this._assembly.assemblyConfig.lids;
    // Get the lid faces to determine enabled status
    const positiveLidFace = getLidFaceId(assemblyAxis, 'positive');
    const negativeLidFace = getLidFaceId(assemblyAxis, 'negative');
    const storeAssembly: StoreAssemblyConfig = {
      assemblyAxis,
      lids: {
        positive: {
          enabled: this._assembly.isFaceSolid(positiveLidFace),
          tabDirection: engineLids.positive.tabDirection,
          inset: engineLids.positive.inset,
        },
        negative: {
          enabled: this._assembly.isFaceSolid(negativeLidFace),
          tabDirection: engineLids.negative.tabDirection,
          inset: engineLids.negative.inset,
        },
      },
      feet: this._assembly.feet || undefined,
    };

    // Process each edge
    const edgePositions: EdgePosition[] = ['top', 'bottom', 'left', 'right'];
    for (const position of edgePositions) {
      const extension = extensions[position];
      if (extension <= 0) continue;

      // Check if adjacent face is solid
      const adjacentFaceId = getAdjacentFace(this.faceId, position);
      if (!adjacentFaceId || !this._assembly.isFaceSolid(adjacentFaceId)) continue;

      // Check if this edge is female (we receive tabs, not send them)
      const gender = getEdgeGender(this.faceId, position, storeFaces, storeAssembly);
      if (gender !== 'female') continue;

      // Get the axis and finger data for this edge
      const axis = getEdgeAxis(this.faceId, position);
      const axisFingerData = fingerData[axis];
      if (!axisFingerData || axisFingerData.fingerLength <= 0) continue;

      const { points: transitionPoints, innerOffset, maxJointLength: maxJoint } = axisFingerData;

      // Determine which perpendicular edges have tabs (affects slot range)
      const isHorizontalEdge = position === 'top' || position === 'bottom';
      const leftGender = getEdgeGender(this.faceId, 'left', storeFaces, storeAssembly);
      const rightGender = getEdgeGender(this.faceId, 'right', storeFaces, storeAssembly);
      const topGender = getEdgeGender(this.faceId, 'top', storeFaces, storeAssembly);
      const bottomGender = getEdgeGender(this.faceId, 'bottom', storeFaces, storeAssembly);

      let lowHasTabs: boolean;
      let highHasTabs: boolean;
      if (isHorizontalEdge) {
        lowHasTabs = leftGender === 'male' && this._assembly.isFaceSolid(getAdjacentFace(this.faceId, 'left')!);
        highHasTabs = rightGender === 'male' && this._assembly.isFaceSolid(getAdjacentFace(this.faceId, 'right')!);
      } else {
        lowHasTabs = bottomGender === 'male' && this._assembly.isFaceSolid(getAdjacentFace(this.faceId, 'bottom')!);
        highHasTabs = topGender === 'male' && this._assembly.isFaceSolid(getAdjacentFace(this.faceId, 'top')!);
      }

      // Calculate the effective range (same as panel generator)
      const minPos = lowHasTabs ? 0 : -mt;
      const maxPos = highHasTabs ? maxJoint : maxJoint + mt;

      // Calculate the slot position (perpendicular to the edge, at the original edge position)
      let slotPosition: number;
      switch (position) {
        case 'top':
          slotPosition = halfH - mt / 2;
          break;
        case 'bottom':
          slotPosition = -halfH + mt / 2;
          break;
        case 'right':
          slotPosition = halfW - mt / 2;
          break;
        case 'left':
          slotPosition = -halfW + mt / 2;
          break;
      }

      // Create section boundaries
      const allBoundaries = [innerOffset, ...transitionPoints, maxJoint - innerOffset];

      // Generate slots at finger positions (even-indexed sections where tabs go)
      let slotIndex = 0;
      for (let i = 0; i < allBoundaries.length - 1; i++) {
        if (i % 2 === 0) {  // Finger/tab section
          const sectionStart = allBoundaries[i];
          const sectionEnd = allBoundaries[i + 1];

          // Check if section is within the edge range
          if (sectionStart < minPos || sectionEnd > maxPos) continue;

          // Convert from axis coords (0 to maxJoint) to 2D panel coords (centered)
          const offsetStart = sectionStart - maxJoint / 2;
          const offsetEnd = sectionEnd - maxJoint / 2;

          let holePoints: { x: number; y: number }[];
          if (isHorizontalEdge) {
            // Horizontal edge (top/bottom): slot runs horizontally
            holePoints = [
              { x: offsetStart, y: slotPosition - mt / 2 },
              { x: offsetEnd, y: slotPosition - mt / 2 },
              { x: offsetEnd, y: slotPosition + mt / 2 },
              { x: offsetStart, y: slotPosition + mt / 2 },
            ];
          } else {
            // Vertical edge (left/right): slot runs vertically
            holePoints = [
              { x: slotPosition - mt / 2, y: offsetStart },
              { x: slotPosition + mt / 2, y: offsetStart },
              { x: slotPosition + mt / 2, y: offsetEnd },
              { x: slotPosition - mt / 2, y: offsetEnd },
            ];
          }

          holes.push({
            id: `extension-slot-${this.faceId}-${position}-${slotIndex}`,
            source: { type: 'extension-slot', sourceId: `${this.faceId}-${position}` },
            path: holePoints,
          });
          slotIndex++;
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

  computeEdgeStatuses(): EdgeStatusInfo[] {
    const faces = this._assembly.getFaces();
    const assemblyConfig = this._assembly.assemblyConfig;

    // Convert to store format for getEdgeGender compatibility
    const storeFaces: StoreFace[] = faces.map(f => ({ id: f.id, solid: f.solid }));
    const storeAssembly: StoreAssemblyConfig = {
      assemblyAxis: assemblyConfig.assemblyAxis,
      lids: {
        positive: {
          enabled: true,
          tabDirection: assemblyConfig.lids.positive.tabDirection,
          inset: assemblyConfig.lids.positive.inset,
        },
        negative: {
          enabled: true,
          tabDirection: assemblyConfig.lids.negative.tabDirection,
          inset: assemblyConfig.lids.negative.inset,
        },
      },
    };

    return ALL_EDGE_POSITIONS.map((position): EdgeStatusInfo => {
      const adjacentFaceId = getAdjacentFace(this.faceId, position);
      const gender = getEdgeGender(this.faceId, position, storeFaces, storeAssembly);

      // Convert gender to edge status
      let status: EdgeStatusInfo['status'];
      if (gender === 'male') {
        status = 'locked';
      } else if (gender === 'female') {
        status = 'outward-only';
      } else {
        status = 'unlocked';
      }

      return {
        position,
        status,
        adjacentFaceId,
      };
    });
  }

  /**
   * Get the extension amount of the adjacent panel's edge at this corner.
   * For face panels, this looks at the adjacent face panel's corresponding edge.
   */
  getAdjacentPanelExtension(edge: EdgePosition): number {
    const adjacentFaceId = getAdjacentFace(this.faceId, edge);
    if (!adjacentFaceId) return 0;

    // Get the adjacent panel
    const adjacentPanel = this._assembly.getFacePanel(adjacentFaceId);
    if (!adjacentPanel) return 0;

    // Map this edge to the corresponding edge on the adjacent panel
    // When two panels meet at an edge, their edges correspond:
    // - This panel's top → adjacent panel's edge depends on orientation
    // This is complex - for now, return the adjacent panel's extension
    // on the edge that faces this panel
    const adjacentEdge = this.getCorrespondingEdge(edge, adjacentFaceId);
    if (!adjacentEdge) return 0;

    return adjacentPanel.edgeExtensions[adjacentEdge];
  }

  /**
   * Get the edge on the adjacent panel that corresponds to this edge.
   * When this panel's edge meets the adjacent panel, which edge of the adjacent
   * panel is at the same corner?
   */
  protected getCorrespondingEdge(_thisEdge: EdgePosition, adjacentFaceId: FaceId): EdgePosition | null {
    // This mapping depends on how faces are oriented relative to each other
    // For a standard box:
    // - Front panel top → Top panel bottom
    // - Front panel bottom → Bottom panel top
    // - Front panel left → Left panel right
    // - Front panel right → Right panel left
    // Similar patterns for other faces

    // Find which edge of the adjacent panel meets this panel
    for (const adjEdge of ALL_EDGE_POSITIONS) {
      const meetsFace = getAdjacentFace(adjacentFaceId, adjEdge);
      if (meetsFace === this.faceId) {
        return adjEdge;
      }
    }
    return null;
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
  // Cross-Lap Blocking
  // ==========================================================================

  /**
   * Build a map of cross-lap blocking ranges for each subdivision.
   * When dividers form cross-lap joints, one divider has its material cut away
   * at specific positions. Face panels shouldn't create slots where the divider
   * has no material.
   *
   * Cross-lap rule (from DividerPanelNode):
   * - Axis priority: X < Y < Z
   * - Lower priority axis gets slot from 'top' (keeps bottom material)
   * - Higher priority axis gets slot from 'bottom' (loses bottom material)
   *
   * For a face panel:
   * - Bottom face: skip slots where divider has cross-lap from bottom
   * - Top face: skip slots where divider has cross-lap from top
   */
  private buildCrossLapBlockingInfo(
    subdivisions: Subdivision[],
    mt: number
  ): Map<string, { start: number; end: number }[]> {
    const blocking = new Map<string, { start: number; end: number }[]>();
    const tolerance = 0.01;

    // Determine which "edge" this face corresponds to for cross-lap purposes
    // Cross-lap cuts from 'top' or 'bottom' of divider panel
    // - Top/bottom faces correspond to 'top'/'bottom' of Y-axis panels
    // - For X and Z dividers meeting a top/bottom face, the cross-lap direction matters
    const faceEdge = this.getCrossLapEdgeForFace();
    if (!faceEdge) {
      // This face doesn't have cross-lap considerations (e.g., front/back for Y-dividers)
      return blocking;
    }

    // Build a lookup of subdivisions by axis for quick intersection finding
    const subsByAxis: Record<Axis, Subdivision[]> = { x: [], y: [], z: [] };
    for (const sub of subdivisions) {
      subsByAxis[sub.axis].push(sub);
    }

    for (const sub of subdivisions) {
      const ranges: { start: number; end: number }[] = [];

      // Find subdivisions on other axes that could create cross-lap joints
      const otherAxes: Axis[] = (['x', 'y', 'z'] as Axis[]).filter(a => a !== sub.axis);

      for (const otherAxis of otherAxes) {
        // Determine cross-lap direction based on axis priority
        const myCrossLapEdge = this.getCrossLapSlotEdge(sub.axis, otherAxis);

        // If this divider's cross-lap is from the same edge as the face we're on,
        // then material is removed at the intersection - we need to block slots there
        if (myCrossLapEdge === faceEdge) {
          // Find intersecting subdivisions on the other axis
          for (const otherSub of subsByAxis[otherAxis]) {
            // Check if they actually intersect
            // A subdivision on axis A at position P intersects with axis B at position Q
            // if P is within the bounds of the other subdivision along axis A
            const intersects = this.subdivisionsIntersect(sub, otherSub, tolerance);
            if (intersects) {
              // Add blocking range at the other subdivision's position
              // The slot axis for this face determines which coordinate we use
              const slotInfo = this.getSlotAxisForFace(sub.axis);
              if (slotInfo) {
                const blockingPos = this.getBlockingPosition(otherSub, slotInfo.axis);
                if (blockingPos !== null) {
                  // The cross-lap slot width is materialThickness
                  const halfSlot = mt / 2;
                  const range = {
                    start: blockingPos - halfSlot,
                    end: blockingPos + halfSlot,
                  };
                  ranges.push(range);
                }
              }
            }
          }
        }
      }

      if (ranges.length > 0) {
        debug('face-cross-lap', `  blocking ranges for ${sub.id}: ${ranges.map(r => `[${r.start.toFixed(1)}, ${r.end.toFixed(1)}]`).join(', ')}`);
        blocking.set(sub.id, ranges);
      }
    }

    return blocking;
  }

  /**
   * Get the cross-lap edge that this face corresponds to.
   * Returns 'top' or 'bottom' based on which edge of a divider panel this face represents.
   */
  private getCrossLapEdgeForFace(): 'top' | 'bottom' | null {
    // For top/bottom faces:
    // - Bottom face (Y-) corresponds to 'bottom' edge of dividers
    // - Top face (Y+) corresponds to 'top' edge of dividers
    //
    // For left/right faces (X-axis dividers):
    // - These don't have cross-lap considerations with Y or Z dividers on top/bottom
    // - But Y-dividers meeting left/right could have cross-lap
    //
    // For simplicity, we only handle top/bottom face cross-lap blocking for now,
    // as that's where the user reported the issue
    switch (this.faceId) {
      case 'bottom':
        return 'bottom';
      case 'top':
        return 'top';
      default:
        // For other faces, cross-lap blocking would need different axis logic
        // TODO: Extend if needed for front/back/left/right faces
        return null;
    }
  }

  /**
   * Get which edge the cross-lap slot is cut from for a divider on myAxis
   * when it intersects another divider on otherAxis.
   *
   * Uses alphabetical axis priority: X < Y < Z
   * - Lower priority axis gets slot from 'top' (keeps bottom material)
   * - Higher priority axis gets slot from 'bottom' (loses bottom material)
   */
  private getCrossLapSlotEdge(myAxis: Axis, otherAxis: Axis): 'top' | 'bottom' {
    // Alphabetical comparison: 'x' < 'y' < 'z'
    if (myAxis < otherAxis) {
      return 'top';
    } else {
      return 'bottom';
    }
  }

  /**
   * Check if two subdivisions on different axes intersect (cross each other)
   *
   * Important: Divider panels extend beyond their void bounds by materialThickness
   * on the side that meets another divider (not a wall). We need to account for
   * this extension when checking intersections.
   */
  private subdivisionsIntersect(sub1: Subdivision, sub2: Subdivision, tolerance: number): boolean {
    const mt = this._assembly.material.thickness;

    // For two dividers to intersect:
    // - sub1's position (on its axis) must be within sub2's PANEL extent on that axis
    // - sub2's position (on its axis) must be within sub1's PANEL extent on that axis
    //
    // Panel extent = void bounds + mt extension on divider sides (not wall sides)
    // For simplicity, we extend both sides by mt - this is conservative but correct

    // Get the range of sub2 along sub1's axis (expanded by mt for panel extent)
    const range2OnAxis1 = this.getSubdivisionRange(sub2, sub1.axis);
    const pos1OnAxis1 = sub1.position;

    // Get the range of sub1 along sub2's axis (expanded by mt for panel extent)
    const range1OnAxis2 = this.getSubdivisionRange(sub1, sub2.axis);
    const pos2OnAxis2 = sub2.position;

    // Check if positions fall within the ranges (extended by mt for panel body)
    const sub1WithinSub2 = pos1OnAxis1 >= range2OnAxis1.start - mt - tolerance &&
                           pos1OnAxis1 <= range2OnAxis1.end + mt + tolerance;
    const sub2WithinSub1 = pos2OnAxis2 >= range1OnAxis2.start - mt - tolerance &&
                           pos2OnAxis2 <= range1OnAxis2.end + mt + tolerance;

    return sub1WithinSub2 && sub2WithinSub1;
  }

  /**
   * Get the range (start, end) of a subdivision's bounds along a given axis
   */
  private getSubdivisionRange(sub: Subdivision, axis: Axis): { start: number; end: number } {
    const { bounds } = sub;
    switch (axis) {
      case 'x':
        return { start: bounds.x, end: bounds.x + bounds.w };
      case 'y':
        return { start: bounds.y, end: bounds.y + bounds.h };
      case 'z':
        return { start: bounds.z, end: bounds.z + bounds.d };
    }
  }

  /**
   * Get the slot axis info for this face based on a divider's axis
   */
  private getSlotAxisForFace(dividerAxis: Axis): { axis: Axis } | null {
    // This returns the axis along which slot segments run for a divider on this face
    switch (this.faceId) {
      case 'bottom':
      case 'top':
        // For horizontal faces (XZ plane):
        // - X-axis dividers create slots running along Z
        // - Z-axis dividers create slots running along X
        if (dividerAxis === 'x') return { axis: 'z' };
        if (dividerAxis === 'z') return { axis: 'x' };
        return null;
      case 'front':
      case 'back':
        // For front/back faces (XY plane):
        // - X-axis dividers create slots running along Y
        // - Y-axis dividers create slots running along X
        if (dividerAxis === 'x') return { axis: 'y' };
        if (dividerAxis === 'y') return { axis: 'x' };
        return null;
      case 'left':
      case 'right':
        // For left/right faces (YZ plane):
        // - Y-axis dividers create slots running along Z
        // - Z-axis dividers create slots running along Y
        if (dividerAxis === 'y') return { axis: 'z' };
        if (dividerAxis === 'z') return { axis: 'y' };
        return null;
    }
  }

  /**
   * Get the blocking position along the slot axis for an intersecting subdivision.
   * This is converted to the 0-based axis coordinate system used for finger positions.
   */
  private getBlockingPosition(otherSub: Subdivision, _slotAxis: Axis): number | null {
    const mt = this._assembly.material.thickness;

    // The blocking position is the other subdivision's position converted to 0-based coords.
    // World coords start at mt (inner wall), so 0-based = worldPos - mt.
    // The otherSub.position is the position of the crossing divider,
    // and it's on the axis perpendicular to the slot we're creating.
    return otherSub.position - mt;
  }

  // ==========================================================================
  // Serialization
  // ==========================================================================

  serialize(): FacePanelSnapshot {
    const base = this.serializeBase();
    // Include assemblyId for sub-assembly panels (undefined for main assembly)
    const assemblyId = this._assembly.kind === 'sub-assembly' ? this._assembly.id : undefined;
    return {
      ...base,
      kind: 'face-panel',
      props: {
        ...base.props,
        faceId: this.faceId,
        assemblyId,
      },
    };
  }
}
