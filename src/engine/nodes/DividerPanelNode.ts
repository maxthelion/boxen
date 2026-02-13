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
  CrossLapSlot,
  PanelOutline,
  Point2D,
  EdgeStatusInfo,
  Subdivision,
  Bounds3D,
} from '../types';
import {
  ALL_EDGE_POSITIONS,
  getDividerAdjacentFace,
} from '../../utils/faceGeometry';
import { getDividerEdgeGender } from '../../utils/genderRules';
import { debug } from '../../utils/debug';

export class DividerPanelNode extends BasePanel {
  readonly kind: NodeKind = 'divider-panel';
  protected _voidNode: VoidNode;
  protected _axis: Axis;
  protected _position: number;

  constructor(voidNode: VoidNode, axis: Axis, position: number, id?: string) {
    // Use UUID - axis/position/voidId info is in props, not encoded in ID
    super(id);
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
    const assembly = this.findParentAssembly();

    // Fallback to simple bounds-based dimensions if no assembly found
    if (!assembly) {
      switch (this._axis) {
        case 'x':
          return { width: bounds.d, height: bounds.h };
        case 'y':
          return { width: bounds.w, height: bounds.d };
        case 'z':
          return { width: bounds.w, height: bounds.h };
      }
    }

    const mt = assembly.material.thickness;

    // Compute body spans for each relevant axis
    // Total span = mt (face A) + void_space + mt (panel B)
    // Body extends on divider side, tabs extend on face side
    switch (this._axis) {
      case 'x': {
        // X-axis divider: width spans Z, height spans Y
        const zSpan = this.computeBodySpan(bounds.z, bounds.d, assembly.depth, mt);
        const ySpan = this.computeBodySpan(bounds.y, bounds.h, assembly.height, mt);
        return { width: zSpan.size, height: ySpan.size };
      }
      case 'y': {
        // Y-axis divider: width spans X, height spans Z
        const xSpan = this.computeBodySpan(bounds.x, bounds.w, assembly.width, mt);
        const zSpan = this.computeBodySpan(bounds.z, bounds.d, assembly.depth, mt);
        return { width: xSpan.size, height: zSpan.size };
      }
      case 'z': {
        // Z-axis divider: width spans X, height spans Y
        const xSpan = this.computeBodySpan(bounds.x, bounds.w, assembly.width, mt);
        const ySpan = this.computeBodySpan(bounds.y, bounds.h, assembly.height, mt);
        return { width: xSpan.size, height: ySpan.size };
      }
    }
  }

  computeEdgeConfigs(): EdgeConfig[] {
    const assembly = this.findParentAssembly();
    if (!assembly) {
      throw new Error('DividerPanelNode must have an assembly ancestor');
    }

    const configs: EdgeConfig[] = [];
    const subdivisions = assembly.getSubdivisions();
    const mt = assembly.material.thickness;
    const bounds = this._voidNode.bounds;
    const tolerance = 0.01;

    for (const position of ALL_EDGE_POSITIONS) {
      const adjacentFaceId = getDividerAdjacentFace(this._axis, position);
      const faceIsSolid = assembly.isFaceSolid(adjacentFaceId);

      // Check if this edge actually reaches the wall (where the face is)
      // Even if the face is solid, the divider may not reach it if another divider is in the way
      const reachesWall = this.edgeReachesWall(position, bounds, assembly, mt, tolerance);
      const meetsFace = faceIsSolid && reachesWall;

      // Check if this edge terminates at another divider (not at a face wall)
      let meetsDividerId: string | null = null;
      if (!reachesWall) {
        meetsDividerId = this.findTerminatingDividerAtEdge(position, subdivisions, bounds, mt, tolerance);
      }

      // Dividers have male joints when meeting solid faces OR when terminating at another divider
      let gender: JointGender | null;
      let axis: Axis | null;
      if (meetsFace) {
        gender = getDividerEdgeGender(meetsFace);
        axis = this.getEdgeAxisForPosition(position);
      } else if (meetsDividerId) {
        gender = 'male'; // Terminating edge gets male (tabs out into the longer divider)
        axis = this.getEdgeAxisForPosition(position);
      } else {
        gender = null;
        axis = null;
      }

      configs.push({
        position,
        hasTabs: gender === 'male',
        meetsFaceId: meetsFace ? adjacentFaceId : null,
        meetsDividerId,
        gender,
        axis,
      });
    }

    return configs;
  }

  /**
   * Check if this divider's edge at the given position reaches the assembly wall.
   * If the void bounds don't extend to the wall, the edge terminates at another divider.
   */
  private edgeReachesWall(
    edgePosition: EdgePosition,
    bounds: Bounds3D,
    assembly: BaseAssembly,
    mt: number,
    tolerance: number
  ): boolean {
    // Determine which axis and direction this edge faces
    let boundsLow: number;
    let boundsSize: number;
    let axisDim: number;
    let isHighEnd: boolean;

    switch (this._axis) {
      case 'x':
        // X-divider: width=Z, height=Y
        if (edgePosition === 'left') { // back
          boundsLow = bounds.z; boundsSize = bounds.d; axisDim = assembly.depth; isHighEnd = false;
        } else if (edgePosition === 'right') { // front
          boundsLow = bounds.z; boundsSize = bounds.d; axisDim = assembly.depth; isHighEnd = true;
        } else if (edgePosition === 'top') {
          boundsLow = bounds.y; boundsSize = bounds.h; axisDim = assembly.height; isHighEnd = true;
        } else { // bottom
          boundsLow = bounds.y; boundsSize = bounds.h; axisDim = assembly.height; isHighEnd = false;
        }
        break;
      case 'y':
        // Y-divider: width=X, height=Z
        if (edgePosition === 'left') {
          boundsLow = bounds.x; boundsSize = bounds.w; axisDim = assembly.width; isHighEnd = false;
        } else if (edgePosition === 'right') {
          boundsLow = bounds.x; boundsSize = bounds.w; axisDim = assembly.width; isHighEnd = true;
        } else if (edgePosition === 'top') { // back
          boundsLow = bounds.z; boundsSize = bounds.d; axisDim = assembly.depth; isHighEnd = true;
        } else { // front / bottom
          boundsLow = bounds.z; boundsSize = bounds.d; axisDim = assembly.depth; isHighEnd = false;
        }
        break;
      case 'z':
      default:
        // Z-divider: width=X, height=Y
        if (edgePosition === 'left') {
          boundsLow = bounds.x; boundsSize = bounds.w; axisDim = assembly.width; isHighEnd = false;
        } else if (edgePosition === 'right') {
          boundsLow = bounds.x; boundsSize = bounds.w; axisDim = assembly.width; isHighEnd = true;
        } else if (edgePosition === 'top') {
          boundsLow = bounds.y; boundsSize = bounds.h; axisDim = assembly.height; isHighEnd = true;
        } else { // bottom
          boundsLow = bounds.y; boundsSize = bounds.h; axisDim = assembly.height; isHighEnd = false;
        }
        break;
    }

    if (isHighEnd) {
      return boundsLow + boundsSize >= axisDim - mt - tolerance;
    } else {
      return boundsLow <= mt + tolerance;
    }
  }

  /**
   * Check if this divider's edge at the given position terminates at another divider.
   * Returns the subdivision ID if found, null otherwise.
   */
  private findTerminatingDividerAtEdge(
    edgePosition: EdgePosition,
    subdivisions: Subdivision[],
    bounds: Bounds3D,
    mt: number,
    tolerance: number
  ): string | null {
    const assembly = this.findParentAssembly();
    if (!assembly) return null;

    // Determine which world-axis direction this edge faces
    // and what position along that axis the edge is at
    let edgeAxisDirection: Axis;
    let edgeWorldPosition: number;
    let isHighEnd: boolean;

    switch (this._axis) {
      case 'x':
        // X-divider: width=Z, height=Y
        // left edge = low Z (back), right edge = high Z (front)
        // top edge = high Y, bottom edge = low Y
        if (edgePosition === 'left') {
          edgeAxisDirection = 'z';
          edgeWorldPosition = bounds.z;
          isHighEnd = false;
        } else if (edgePosition === 'right') {
          edgeAxisDirection = 'z';
          edgeWorldPosition = bounds.z + bounds.d;
          isHighEnd = true;
        } else if (edgePosition === 'top') {
          edgeAxisDirection = 'y';
          edgeWorldPosition = bounds.y + bounds.h;
          isHighEnd = true;
        } else {
          edgeAxisDirection = 'y';
          edgeWorldPosition = bounds.y;
          isHighEnd = false;
        }
        break;
      case 'y':
        // Y-divider: width=X, height=Z
        // left edge = low X, right edge = high X
        // top edge = high Z (back), bottom edge = low Z (front)
        if (edgePosition === 'left') {
          edgeAxisDirection = 'x';
          edgeWorldPosition = bounds.x;
          isHighEnd = false;
        } else if (edgePosition === 'right') {
          edgeAxisDirection = 'x';
          edgeWorldPosition = bounds.x + bounds.w;
          isHighEnd = true;
        } else if (edgePosition === 'top') {
          edgeAxisDirection = 'z';
          edgeWorldPosition = bounds.z + bounds.d;
          isHighEnd = true;
        } else {
          edgeAxisDirection = 'z';
          edgeWorldPosition = bounds.z;
          isHighEnd = false;
        }
        break;
      case 'z':
      default:
        // Z-divider: width=X, height=Y
        // left edge = low X, right edge = high X
        // top edge = high Y, bottom edge = low Y
        if (edgePosition === 'left') {
          edgeAxisDirection = 'x';
          edgeWorldPosition = bounds.x;
          isHighEnd = false;
        } else if (edgePosition === 'right') {
          edgeAxisDirection = 'x';
          edgeWorldPosition = bounds.x + bounds.w;
          isHighEnd = true;
        } else if (edgePosition === 'top') {
          edgeAxisDirection = 'y';
          edgeWorldPosition = bounds.y + bounds.h;
          isHighEnd = true;
        } else {
          edgeAxisDirection = 'y';
          edgeWorldPosition = bounds.y;
          isHighEnd = false;
        }
        break;
    }

    // Check if this edge is NOT at a wall (interior surface)
    const axisDim = edgeAxisDirection === 'x' ? assembly.width :
                    edgeAxisDirection === 'y' ? assembly.height : assembly.depth;
    const atLowWall = edgeWorldPosition <= mt + tolerance;
    const atHighWall = edgeWorldPosition >= axisDim - mt - tolerance;

    if (isHighEnd && atHighWall) return null; // At a face wall, not a divider
    if (!isHighEnd && atLowWall) return null; // At a face wall, not a divider

    // Look for a perpendicular divider at this edge position
    for (const sub of subdivisions) {
      if (sub.axis !== edgeAxisDirection) continue; // Must be on the same axis as the edge direction

      // The other divider's position should be near our edge's world position
      // Our void bounds end at edgeWorldPosition, and the divider is at the boundary
      // The divider position should be approximately at edgeWorldPosition (within mt)
      if (Math.abs(sub.position - edgeWorldPosition) < mt + tolerance) {
        // This divider's void bounds end near the other divider's position
        // That means this divider terminates at the other divider
        return sub.id;
      }
    }

    return null;
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
    const mt = assembly.material.thickness;

    // Get assembly world transform
    const assemblyTransform = assembly.getWorldTransform();
    const [ax, ay, az] = assemblyTransform.position;

    // Compute body span centers (accounts for extensions toward dividers)
    // These centers may differ from void centers when body extends beyond void bounds
    const xSpan = this.computeBodySpan(bounds.x, bounds.w, assembly.width, mt);
    const ySpan = this.computeBodySpan(bounds.y, bounds.h, assembly.height, mt);
    const zSpan = this.computeBodySpan(bounds.z, bounds.d, assembly.depth, mt);

    // Adjust for assembly being centered at origin
    // (void bounds are in assembly-local coordinates starting at mt)
    const halfW = assembly.width / 2;
    const halfH = assembly.height / 2;
    const halfD = assembly.depth / 2;

    switch (this._axis) {
      case 'x':
        // X-axis divider: positioned at splitPosition on X
        // Body spans Y and Z, so use ySpan.center and zSpan.center
        // Rotation -90° around Y so 2D right (+X) maps to world +Z (front)
        return {
          position: [
            ax + this._position - halfW,
            ay + ySpan.center - halfH,
            az + zSpan.center - halfD,
          ],
          rotation: [0, -Math.PI / 2, 0],
        };
      case 'y':
        // Y-axis divider: positioned at splitPosition on Y
        // Body spans X and Z, so use xSpan.center and zSpan.center
        // Rotation -90° around X so 2D top maps to world +Z
        return {
          position: [
            ax + xSpan.center - halfW,
            ay + this._position - halfH,
            az + zSpan.center - halfD,
          ],
          rotation: [-Math.PI / 2, 0, 0],
        };
      case 'z':
        // Z-axis divider: positioned at splitPosition on Z
        // Body spans X and Y, so use xSpan.center and ySpan.center
        // No rotation needed (2D X/Y map to world X/Y)
        return {
          position: [
            ax + xSpan.center - halfW,
            ay + ySpan.center - halfH,
            az + this._position - halfD,
          ],
          rotation: [0, 0, 0],
        };
    }
  }

  computeHoles(): PanelHole[] {
    const assembly = this.findParentAssembly();
    if (!assembly) return [];

    const holes: PanelHole[] = [];
    const subdivisions = assembly.getSubdivisions();
    const mt = assembly.material.thickness;
    const halfMt = mt / 2;
    const tolerance = 0.01;
    const fingerData = this.getFingerData();
    const dims = this.getDimensions();
    const halfW = dims.width / 2;
    const halfH = dims.height / 2;

    debug('divider-holes', `=== computeHoles for ${this.id} ===`);
    debug('divider-holes', `  dims: ${dims.width.toFixed(1)}x${dims.height.toFixed(1)}, halfW=${halfW.toFixed(1)}, halfH=${halfH.toFixed(1)}`);

    // This divider's position and axis
    const myAxis = this._axis;
    const myPosition = this._position;
    const bounds = this._voidNode.bounds;

    // For each subdivision, check if its divider intersects this one
    for (const sub of subdivisions) {
      // Skip subdivisions on the same axis (parallel dividers don't intersect)
      if (sub.axis === myAxis) continue;

      // For crossing dividers: skip - these are handled by cross-lap slots
      // For terminating dividers: generate slot holes (like face panels do for divider tabs)
      if (this.isCrossingDivider(sub)) {
        continue; // Crossing dividers use cross-lap slots, not holes
      }

      // This is a terminating divider - check if it terminates AT this divider
      // (i.e., the other divider's void bounds end near this divider's position)
      // If so, this divider needs slot holes for the other divider's tabs
      if (!this.isTerminatingAtMe(sub, mt)) {
        continue; // Not terminating at this divider
      }

      // Check if the other divider's void bounds span includes our position
      // Get the extent of the other divider along our axis
      let otherExtentLow: number;
      let otherExtentHigh: number;

      switch (myAxis) {
        case 'x':
          otherExtentLow = sub.bounds.x - mt;
          otherExtentHigh = sub.bounds.x + sub.bounds.w + mt;
          break;
        case 'y':
          otherExtentLow = sub.bounds.y - mt;
          otherExtentHigh = sub.bounds.y + sub.bounds.h + mt;
          break;
        case 'z':
          otherExtentLow = sub.bounds.z - mt;
          otherExtentHigh = sub.bounds.z + sub.bounds.d + mt;
          break;
      }

      // Check if our position falls within the other divider's extent
      if (myPosition < otherExtentLow - tolerance || myPosition > otherExtentHigh + tolerance) {
        continue; // No intersection
      }

      // Calculate slot info for this intersection
      const slotInfo = this.calculateDividerSlotInfo(sub, bounds, assembly, mt);
      if (!slotInfo) continue;

      const { slotX, slotY, isHorizontal, slotAxis } = slotInfo;

      // Generate slot holes at finger positions (same pattern as FacePanelNode)
      // For nested dividers that don't span the full assembly, we need to:
      // 1. Filter sections to only include those within the divider's actual span
      // 2. Convert coordinates relative to the divider's center (not the assembly center)
      if (fingerData && fingerData[slotAxis]) {
        const axisFingerData = fingerData[slotAxis];
        const { points: transitionPoints, innerOffset, maxJointLength: maxJoint } = axisFingerData;

        // Build section boundaries
        const allBoundaries = [innerOffset, ...transitionPoints, maxJoint - innerOffset];

        // Get the divider's body span on the slot axis
        // This tells us which finger sections actually fall within our panel
        let slotAxisBodySpan: { start: number; end: number; center: number };
        switch (slotAxis) {
          case 'x':
            slotAxisBodySpan = this.computeBodySpan(bounds.x, bounds.w, assembly.width, mt);
            break;
          case 'y':
            slotAxisBodySpan = this.computeBodySpan(bounds.y, bounds.h, assembly.height, mt);
            break;
          case 'z':
            slotAxisBodySpan = this.computeBodySpan(bounds.z, bounds.d, assembly.depth, mt);
            break;
        }

        // Convert body span to finger coords (finger coords start at mt from edge)
        const bodyFingerStart = slotAxisBodySpan.start;
        const bodyFingerEnd = slotAxisBodySpan.end - 2 * mt; // Account for the other side's mt

        let slotIndex = 0;
        for (let i = 0; i < allBoundaries.length - 1; i++) {
          if (i % 2 === 0) {  // Finger section (where divider tabs go)
            const sectionStart = allBoundaries[i];
            const sectionEnd = allBoundaries[i + 1];

            // Skip sections that fall entirely outside the divider's span (in finger coords)
            // Convert body span to finger coords: finger = assembly - mt
            const fingerSpanStart = Math.max(0, slotAxisBodySpan.start - mt);
            const fingerSpanEnd = slotAxisBodySpan.end - mt;
            if (sectionEnd <= fingerSpanStart || sectionStart >= fingerSpanEnd) {
              continue;
            }

            // Convert from finger coords to 2D panel coords
            // Panel center in assembly coords = slotAxisBodySpan.center
            // Section position in assembly coords = sectionStart + mt
            // Panel coord = assembly position - panel center
            const offsetStart = sectionStart + mt - slotAxisBodySpan.center;
            const offsetEnd = sectionEnd + mt - slotAxisBodySpan.center;

            // Check if the slot extends outside the panel boundary (additional safety check)
            const halfDimOnSlotAxis = isHorizontal ? halfW : halfH;
            if (offsetStart < -halfDimOnSlotAxis - tolerance || offsetEnd > halfDimOnSlotAxis + tolerance) {
              debug('divider-holes', `  Skipping slot outside bounds: offset=${offsetStart.toFixed(1)} to ${offsetEnd.toFixed(1)}, halfDim=${halfDimOnSlotAxis.toFixed(1)}`);
              continue;
            }

            // Check if the slot would touch or exceed the panel boundary
            // This prevents degenerate geometry where slot holes coincide with finger joint tabs
            const slotTouchesBoundary = isHorizontal
              ? (slotY !== null && (Math.abs(slotY - halfMt - (-halfH)) < tolerance || Math.abs(slotY + halfMt - halfH) < tolerance))
              : (slotX !== null && (Math.abs(slotX - halfMt - (-halfW)) < tolerance || Math.abs(slotX + halfMt - halfW) < tolerance));

            if (slotTouchesBoundary) {
              debug('divider-holes', `  Skipping slot at edge: slotX=${slotX?.toFixed(1)}, slotY=${slotY?.toFixed(1)}, halfW=${halfW.toFixed(1)}, halfH=${halfH.toFixed(1)}`);
              continue;
            }

            const holePoints = this.createSlotHolePoints(
              slotX, slotY, offsetStart, offsetEnd, isHorizontal, mt
            );

            holes.push({
              id: `divider-slot-${sub.id}-on-${this.id}-${slotIndex}`,
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
   * Calculate slot info for an intersecting divider
   */
  private calculateDividerSlotInfo(
    sub: { axis: Axis; position: number; bounds: { x: number; y: number; z: number; w: number; h: number; d: number } },
    bounds: { x: number; y: number; z: number; w: number; h: number; d: number },
    assembly: BaseAssembly,
    mt: number
  ): { slotX: number | null; slotY: number | null; isHorizontal: boolean; slotAxis: Axis } | null {
    let slotX: number | null = null;
    let slotY: number | null = null;
    let isHorizontal = false;
    let slotAxis: Axis = 'x';

    switch (this._axis) {
      case 'x':
        // X-axis divider: width=Z, height=Y
        if (sub.axis === 'z') {
          // Z-axis divider creates a vertical slot
          const zSpan = this.computeBodySpan(bounds.z, bounds.d, assembly.depth, mt);
          slotX = sub.position - zSpan.center;
          isHorizontal = false;
          slotAxis = 'y';
        } else { // sub.axis === 'y'
          const ySpan = this.computeBodySpan(bounds.y, bounds.h, assembly.height, mt);
          slotY = sub.position - ySpan.center;
          isHorizontal = true;
          slotAxis = 'z';
        }
        break;

      case 'y':
        // Y-axis divider: width=X, height=Z
        if (sub.axis === 'x') {
          const xSpan = this.computeBodySpan(bounds.x, bounds.w, assembly.width, mt);
          slotX = sub.position - xSpan.center;
          isHorizontal = false;
          slotAxis = 'z';
        } else { // sub.axis === 'z'
          const zSpan = this.computeBodySpan(bounds.z, bounds.d, assembly.depth, mt);
          slotY = sub.position - zSpan.center;
          isHorizontal = true;
          slotAxis = 'x';
        }
        break;

      case 'z':
        // Z-axis divider: width=X, height=Y
        if (sub.axis === 'x') {
          const xSpan = this.computeBodySpan(bounds.x, bounds.w, assembly.width, mt);
          slotX = sub.position - xSpan.center;
          isHorizontal = false;
          slotAxis = 'y';
        } else { // sub.axis === 'y'
          const ySpan = this.computeBodySpan(bounds.y, bounds.h, assembly.height, mt);
          slotY = sub.position - ySpan.center;
          isHorizontal = true;
          slotAxis = 'x';
        }
        break;
    }

    if (slotX === null && slotY === null) return null;
    return { slotX, slotY, isHorizontal, slotAxis };
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

  computeEdgeStatuses(): EdgeStatusInfo[] {
    const assembly = this.findParentAssembly();
    if (!assembly) {
      // No assembly, all edges unlocked
      return ALL_EDGE_POSITIONS.map(position => ({
        position,
        status: 'unlocked' as const,
        adjacentFaceId: undefined,
      }));
    }

    // Use edge configs to determine which edges meet solid faces
    const edgeConfigs = this.computeEdgeConfigs();

    return ALL_EDGE_POSITIONS.map((position): EdgeStatusInfo => {
      const config = edgeConfigs.find(e => e.position === position);
      const meetsFace = config?.meetsFaceId;
      const adjacentFaceId = meetsFace as FaceId | undefined;

      // Dividers always have female joints where they meet solid faces
      // so they're outward-only (can extend but not retract)
      // Where they don't meet a face, they're unlocked
      const status: EdgeStatusInfo['status'] = meetsFace ? 'outward-only' : 'unlocked';

      return {
        position,
        status,
        adjacentFaceId,
      };
    });
  }

  /**
   * Get the extension amount of the adjacent panel's edge at this corner.
   * For divider panels, this looks at the face panel that this edge meets.
   * Since dividers have female joints with faces, the adjacent face's extension
   * determines how much of this divider's edge is free.
   */
  getAdjacentPanelExtension(edge: EdgePosition): number {
    const edgeConfigs = this.computeEdgeConfigs();
    const config = edgeConfigs.find(e => e.position === edge);

    // If this edge doesn't meet a face, there's no adjacent panel
    if (!config?.meetsFaceId) return 0;

    const assembly = this.findParentAssembly();
    if (!assembly) return 0;

    // Get the face panel
    const facePanel = assembly.getFacePanel(config.meetsFaceId as FaceId);
    if (!facePanel) return 0;

    // For now, return 0 - face panels typically don't have extensions
    // that would affect divider corner eligibility.
    // Future: could check which face edge meets this divider and get its extension.
    return 0;
  }

  /**
   * Compute the axis position for a corner of an edge.
   * This determines where the edge starts/ends along the world axis.
   * Used for finger joint alignment across panels.
   *
   * For dividers, this must account for:
   * 1. Whether the divider reaches the assembly wall
   * 2. Whether the perpendicular face is solid (affects corner inset)
   * 3. The void bounds (for dividers that don't span the full assembly)
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

    const bounds = this._voidNode.bounds;
    const mt = assembly.material.thickness;
    const tolerance = 0.01;

    // Get assembly dimensions and calculate max joint length for each axis
    const { width, height, depth } = {
      width: assembly.width,
      height: assembly.height,
      depth: assembly.depth,
    };

    // Get which perpendicular faces are solid (affects corner inset)
    const edgeConfigs = this.computeEdgeConfigs();
    const getEdgeMeetsFace = (pos: EdgePosition): boolean => {
      const config = edgeConfigs.find(e => e.position === pos);
      return config?.meetsFaceId !== null;
    };

    // Helper to calculate axis positions using the same logic as panelGenerator
    const calcAxisPositions = (
      boundsLow: number,      // bounds.x/y/z (in assembly coords)
      boundsSize: number,     // bounds.w/h/d
      maxJoint: number,       // max joint length for this axis (dim - 2*mt)
      axisDim: number,        // width/height/depth
      meetsLow: boolean,      // meets face at low end (perpendicular edge is solid)
      meetsHigh: boolean      // meets face at high end
    ): { startPos: number; endPos: number } => {
      // Check if divider reaches each wall (interior surface at mt from outer edge)
      const atLowWall = boundsLow <= mt + tolerance;
      const atHighWall = boundsLow + boundsSize >= axisDim - mt - tolerance;

      let startPos: number;
      let endPos: number;

      // Low end - same logic as face panels
      if (atLowWall) {
        // Divider is at the wall - use face panel logic
        // meetsLow = true means perpendicular face is solid, corner is inset, use 0
        // meetsLow = false means perpendicular face is open, panel extends to edge, use -mt
        startPos = meetsLow ? 0 : -mt;
      } else {
        // Divider doesn't reach the wall - panel body extends mt beyond void to meet adjacent divider
        // In 0-based coords: (voidStart - mt + mt) - mt = voidStart - mt
        startPos = boundsLow - mt;
      }

      // High end - same logic as face panels
      if (atHighWall) {
        // Divider is at the wall - use face panel logic
        endPos = meetsHigh ? maxJoint : maxJoint + mt;
      } else {
        // Divider doesn't reach the wall - panel body extends mt beyond void to meet adjacent divider
        // Void ends at boundsLow + boundsSize (assembly coords)
        // Panel body extends to boundsLow + boundsSize + mt (to reach far edge of adjacent divider)
        // In 0-based coords: (boundsLow + boundsSize + mt) - mt = boundsLow + boundsSize
        endPos = boundsLow + boundsSize;
      }

      return { startPos, endPos };
    };

    // Determine which bounds and faces to use based on edge position and divider axis
    let startPos: number;
    let endPos: number;

    const isHorizontalEdge = edgePosition === 'top' || edgePosition === 'bottom';

    switch (this._axis) {
      case 'x': // YZ plane divider - width=depth(Z), height=height(Y)
        if (isHorizontalEdge && axis === 'z') {
          // Horizontal edges run along Z axis
          const meetsLeft = getEdgeMeetsFace('left');   // back face
          const meetsRight = getEdgeMeetsFace('right'); // front face
          ({ startPos, endPos } = calcAxisPositions(
            bounds.z, bounds.d, depth - 2 * mt, depth, meetsLeft, meetsRight
          ));
        } else if (!isHorizontalEdge && axis === 'y') {
          // Vertical edges run along Y axis
          const meetsBottom = getEdgeMeetsFace('bottom');
          const meetsTop = getEdgeMeetsFace('top');
          ({ startPos, endPos } = calcAxisPositions(
            bounds.y, bounds.h, height - 2 * mt, height, meetsBottom, meetsTop
          ));
        } else {
          return 0;
        }
        break;

      case 'y': // XZ plane divider - width=width(X), height=depth(Z)
        if (isHorizontalEdge && axis === 'x') {
          // Horizontal edges run along X axis
          const meetsLeft = getEdgeMeetsFace('left');
          const meetsRight = getEdgeMeetsFace('right');
          ({ startPos, endPos } = calcAxisPositions(
            bounds.x, bounds.w, width - 2 * mt, width, meetsLeft, meetsRight
          ));
        } else if (!isHorizontalEdge && axis === 'z') {
          // Vertical edges run along Z axis
          const meetsBottom = getEdgeMeetsFace('bottom'); // front face
          const meetsTop = getEdgeMeetsFace('top');       // back face
          ({ startPos, endPos } = calcAxisPositions(
            bounds.z, bounds.d, depth - 2 * mt, depth, meetsBottom, meetsTop
          ));
        } else {
          return 0;
        }
        break;

      case 'z': // XY plane divider - width=width(X), height=height(Y)
      default:
        if (isHorizontalEdge && axis === 'x') {
          // Horizontal edges run along X axis
          const meetsLeft = getEdgeMeetsFace('left');
          const meetsRight = getEdgeMeetsFace('right');
          ({ startPos, endPos } = calcAxisPositions(
            bounds.x, bounds.w, width - 2 * mt, width, meetsLeft, meetsRight
          ));
        } else if (!isHorizontalEdge && axis === 'y') {
          // Vertical edges run along Y axis
          const meetsBottom = getEdgeMeetsFace('bottom');
          const meetsTop = getEdgeMeetsFace('top');
          ({ startPos, endPos } = calcAxisPositions(
            bounds.y, bounds.h, height - 2 * mt, height, meetsBottom, meetsTop
          ));
        } else {
          return 0;
        }
        break;
    }

    // Determine which end based on edge traversal direction in the 2D outline:
    // - Top edge: left to right -> start=startPos, end=endPos
    // - Bottom edge: right to left -> start=endPos, end=startPos
    // - Right edge: top to bottom -> start=endPos, end=startPos
    // - Left edge: bottom to top -> start=startPos, end=endPos
    if (isHorizontalEdge) {
      if (edgePosition === 'top') {
        return corner === 'start' ? startPos : endPos;
      } else {
        return corner === 'start' ? endPos : startPos;
      }
    } else {
      if (edgePosition === 'right') {
        return corner === 'start' ? endPos : startPos;
      } else {
        return corner === 'start' ? startPos : endPos;
      }
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Compute the actual body span for a given axis.
   * Returns the start and end positions of the panel body in assembly coordinates.
   *
   * Geometry explanation:
   * The divider's finger region must match the face's finger region for joints to align.
   * Face finger region = assembly_dim - 2*MT (after corner insets for tabs).
   * Divider must have the same finger region after its corner insets.
   *
   * - Face side (at wall): Body extends to assembly boundary (0 or axisDim).
   *   After corner insets of MT for perpendicular tabs, finger region = assembly_dim - 2*MT.
   *   This matches the face's finger region exactly.
   *   Tabs extend inward from body edge to mate with face slots.
   *
   * - Divider side (not at wall): Body extends MT beyond void boundary
   *   to reach the adjacent divider's far edge.
   *
   * Key insight: When at a face wall, the divider body must equal the face body
   * so that both have identical finger regions after corner insets.
   */
  protected computeBodySpan(
    boundsLow: number,    // void bounds low edge (e.g., bounds.x)
    boundsSize: number,   // void bounds size (e.g., bounds.w)
    axisDim: number,      // assembly dimension (e.g., assembly.width)
    mt: number            // material thickness
  ): { start: number; end: number; center: number; size: number } {
    const tolerance = 0.01;

    // Check if void reaches each wall (interior surface at mt from outer edge)
    const atLowWall = boundsLow <= mt + tolerance;
    const atHighWall = boundsLow + boundsSize >= axisDim - mt - tolerance;

    // Panel body start position (low end)
    // At face wall: body extends to assembly boundary (0) so finger region matches face
    // At divider: body extends mt beyond void to reach divider's far edge
    const bodyStart = atLowWall ? 0 : boundsLow - mt;

    // Panel body end position (high end)
    // At face wall: body extends to assembly boundary (axisDim) so finger region matches face
    // At divider: body extends mt beyond void to reach divider's far edge
    const bodyEnd = atHighWall ? axisDim : boundsLow + boundsSize + mt;

    return {
      start: bodyStart,
      end: bodyEnd,
      center: (bodyStart + bodyEnd) / 2,
      size: bodyEnd - bodyStart,
    };
  }

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
  // Cross-Lap Joints
  // ==========================================================================

  /**
   * Get blocking ranges for finger generation based on cross-lap positions.
   *
   * NOTE: We intentionally do NOT block fingers at cross-lap positions.
   * The finger tab provides the material for the cross-lap notch to cut into.
   * The applyCrossLapSlotsToOutline method will insert the notch into the existing tab.
   */
  protected override getFingerBlockingRanges(): Map<EdgePosition, { start: number; end: number }[]> {
    // Return empty - don't block fingers at cross-lap positions
    // The cross-lap notch will be cut into the finger tab
    return new Map();
  }

  /**
   * Determine if another subdivision's divider CROSSES through this divider's position,
   * or merely TERMINATES at it.
   *
   * Crossing: the other divider's owner void bounds extend past this divider's position
   * on BOTH sides (without mt extension). The dividers physically pass through each other.
   *
   * Terminating: the other divider's owner void bounds end at (or near) this divider's
   * position on one side. The shorter divider stops at the longer one.
   */
  private isCrossingDivider(sub: Subdivision): boolean {
    const tolerance = 0.1;
    const bounds = this._voidNode.bounds;

    // Check 1: Does the other divider's void extend past MY position on BOTH sides?
    // (along this divider's axis)
    let otherVoidLow: number;
    let otherVoidHigh: number;

    switch (this._axis) {
      case 'x':
        otherVoidLow = sub.ownerBounds.x;
        otherVoidHigh = sub.ownerBounds.x + sub.ownerBounds.w;
        break;
      case 'y':
        otherVoidLow = sub.ownerBounds.y;
        otherVoidHigh = sub.ownerBounds.y + sub.ownerBounds.h;
        break;
      case 'z':
        otherVoidLow = sub.ownerBounds.z;
        otherVoidHigh = sub.ownerBounds.z + sub.ownerBounds.d;
        break;
    }

    const otherCrossesThroughMe = otherVoidLow < this._position - tolerance && otherVoidHigh > this._position + tolerance;
    if (!otherCrossesThroughMe) return false;

    // Check 2: Does MY void extend past the OTHER divider's position on BOTH sides?
    // (along the other divider's axis)
    let myVoidLow: number;
    let myVoidHigh: number;

    switch (sub.axis) {
      case 'x':
        myVoidLow = bounds.x;
        myVoidHigh = bounds.x + bounds.w;
        break;
      case 'y':
        myVoidLow = bounds.y;
        myVoidHigh = bounds.y + bounds.h;
        break;
      case 'z':
        myVoidLow = bounds.z;
        myVoidHigh = bounds.z + bounds.d;
        break;
    }

    const iCrossThroughOther = myVoidLow < sub.position - tolerance && myVoidHigh > sub.position + tolerance;

    // True crossing requires BOTH dividers to cross through each other
    return iCrossThroughOther;
  }

  /**
   * Check if the other subdivision's divider terminates AT this divider.
   * This means the other divider's owner void bounds end near this divider's position
   * on the axis perpendicular to the other divider.
   *
   * For a terminating relationship, THIS divider (the longer one) needs slot holes
   * for the other divider's finger tabs.
   */
  private isTerminatingAtMe(sub: Subdivision, mt: number): boolean {
    const tolerance = 0.1;

    // The other divider's owner void bounds along THIS divider's axis
    let otherVoidLow: number;
    let otherVoidHigh: number;

    switch (this._axis) {
      case 'x':
        otherVoidLow = sub.ownerBounds.x;
        otherVoidHigh = sub.ownerBounds.x + sub.ownerBounds.w;
        break;
      case 'y':
        otherVoidLow = sub.ownerBounds.y;
        otherVoidHigh = sub.ownerBounds.y + sub.ownerBounds.h;
        break;
      case 'z':
        otherVoidLow = sub.ownerBounds.z;
        otherVoidHigh = sub.ownerBounds.z + sub.ownerBounds.d;
        break;
    }

    // The other divider terminates at this one if its void bounds end near this position
    // (within mt, since the body extends mt to reach this divider)
    const lowEndNear = Math.abs(otherVoidLow - this._position) < mt + tolerance;
    const highEndNear = Math.abs(otherVoidHigh - this._position) < mt + tolerance;

    // It terminates if ONE end is near (but not both - both near would be very thin and not meaningful)
    return (lowEndNear || highEndNear) && !(lowEndNear && highEndNear);
  }

  /**
   * Compute cross-lap slots for intersecting dividers
   * Cross-lap joints are half-depth notches that allow perpendicular dividers to interlock
   */
  protected computeCrossLapSlots(): CrossLapSlot[] {
    const assembly = this.findParentAssembly();
    if (!assembly) return [];

    const slots: CrossLapSlot[] = [];
    const subdivisions = assembly.getSubdivisions();
    const mt = assembly.material.thickness;
    const dims = this.getDimensions();
    const bounds = this._voidNode.bounds;
    const tolerance = 0.01;

    debug('cross-lap', `\ncomputeCrossLapSlots for ${this._axis}-divider at ${this._position}`);
    debug('cross-lap', `  voidNode bounds: x=${bounds.x}, z=${bounds.z}, w=${bounds.w}, d=${bounds.d}`);
    debug('cross-lap', `  subdivisions count: ${subdivisions.length}`);

    // Track which axes we intersect with (for 3-axis validation)
    const intersectingAxes = new Set<Axis>();

    for (const sub of subdivisions) {
      debug('cross-lap', `  checking sub: axis=${sub.axis}, pos=${sub.position}, bounds: x=${sub.bounds.x}, z=${sub.bounds.z}, w=${sub.bounds.w}, d=${sub.bounds.d}`);

      // Skip parallel dividers (same axis)
      if (sub.axis === this._axis) {
        debug('cross-lap', `    skipped (same axis)`);
        continue;
      }

      // Check if the other divider's void bounds span includes our position
      let otherExtentLow: number;
      let otherExtentHigh: number;

      switch (this._axis) {
        case 'x':
          otherExtentLow = sub.bounds.x - mt;
          otherExtentHigh = sub.bounds.x + sub.bounds.w + mt;
          break;
        case 'y':
          otherExtentLow = sub.bounds.y - mt;
          otherExtentHigh = sub.bounds.y + sub.bounds.h + mt;
          break;
        case 'z':
          otherExtentLow = sub.bounds.z - mt;
          otherExtentHigh = sub.bounds.z + sub.bounds.d + mt;
          break;
      }

      debug('cross-lap', `    extent check: this._position=${this._position} in [${otherExtentLow}, ${otherExtentHigh}]?`);

      // Check if our position falls within the other divider's extent
      if (this._position < otherExtentLow - tolerance || this._position > otherExtentHigh + tolerance) {
        debug('cross-lap', `    FAILED extent check`);
        continue;
      }

      debug('cross-lap', `    PASSED extent check`);

      // Check if this is a crossing divider (both sides extend past) or terminating (one side only)
      if (!this.isCrossingDivider(sub)) {
        debug('cross-lap', `    SKIPPED: terminating divider (not crossing)`);
        continue;
      }

      // This divider intersects with sub
      intersectingAxes.add(sub.axis);

      // Calculate slot position along our panel width
      const slotXPosition = this.calculateCrossLapSlotPosition(sub, bounds, assembly, mt);
      debug('cross-lap', `    slotXPosition: ${slotXPosition}`);
      if (slotXPosition === null) continue;

      // Determine slot direction using axis priority rule
      // Compare axes alphabetically: lower axis gets slot from top
      const fromEdge = this.getCrossLapSlotEdge(this._axis, sub.axis);

      debug('cross-lap', `    ADDING SLOT: x=${slotXPosition}, fromEdge=${fromEdge}`);
      slots.push({
        xPosition: slotXPosition,
        width: mt,
        depth: dims.height / 2,
        fromEdge,
        intersectingDividerId: sub.id,
      });
    }

    debug('cross-lap', `  total slots found: ${slots.length}`);

    // Validate: 3-axis intersections are illegal
    if (intersectingAxes.size === 2) {
      // This divider intersects with dividers on BOTH other axes
      // Check if those dividers also intersect each other at the same point
      const otherAxes = Array.from(intersectingAxes);
      const allAxes = [this._axis, ...otherAxes].sort();
      if (allAxes.length === 3 && allAxes[0] === 'x' && allAxes[1] === 'y' && allAxes[2] === 'z') {
        console.warn(`Three-axis intersection detected at divider ${this.id}. This configuration cannot be assembled.`);
        // We could throw an error here, but for now just warn
        // The user should avoid creating such configurations
      }
    }

    return slots;
  }

  /**
   * Calculate the X position (in panel-local coords) where a cross-lap slot should be
   */
  private calculateCrossLapSlotPosition(
    sub: { axis: Axis; position: number; bounds: { x: number; y: number; z: number; w: number; h: number; d: number } },
    bounds: { x: number; y: number; z: number; w: number; h: number; d: number },
    assembly: BaseAssembly,
    mt: number
  ): number | null {
    // The slot position depends on which axis our panel spans for width
    // X-divider: width spans Z
    // Y-divider: width spans X
    // Z-divider: width spans X

    switch (this._axis) {
      case 'x': {
        // Width spans Z, so we need slot position along Z
        if (sub.axis === 'z') {
          // Z-divider intersects us - slot at sub.position along Z
          const zSpan = this.computeBodySpan(bounds.z, bounds.d, assembly.depth, mt);
          return sub.position - zSpan.center;
        } else if (sub.axis === 'y') {
          // Y-divider intersects us - this would be a vertical slot, not horizontal
          // Cross-lap slots are cut from top/bottom, so Y-dividers create horizontal slots
          // But Y-dividers run along X and Z, not along the X-divider's width (Z)
          // For X-Y intersection, the slot is actually along height, not width
          // This is a different configuration - skip for now
          return null;
        }
        break;
      }
      case 'y': {
        // Width spans X
        if (sub.axis === 'x') {
          // X-divider intersects us - slot at sub.position along X
          const xSpan = this.computeBodySpan(bounds.x, bounds.w, assembly.width, mt);
          return sub.position - xSpan.center;
        } else if (sub.axis === 'z') {
          // Z-divider intersects us - Z runs along our height (Z), not width (X)
          // Skip - not a cross-lap in the width direction
          return null;
        }
        break;
      }
      case 'z': {
        // Width spans X
        if (sub.axis === 'x') {
          // X-divider intersects us - slot at sub.position along X
          const xSpan = this.computeBodySpan(bounds.x, bounds.w, assembly.width, mt);
          debug('cross-lap', `Z-divider cross-lap calc: sub.pos=${sub.position}, xSpan.center=${xSpan.center.toFixed(2)}, result=${(sub.position - xSpan.center).toFixed(2)}`);
          debug('cross-lap', `  bounds.x=${bounds.x}, bounds.w=${bounds.w}, assembly.width=${assembly.width}`);
          return sub.position - xSpan.center;
        } else if (sub.axis === 'y') {
          // Y-divider intersects us - Y runs along our height (Y), not width (X)
          // Skip - not a cross-lap in the width direction
          return null;
        }
        break;
      }
    }
    return null;
  }

  /**
   * Determine which edge a cross-lap slot should be cut from
   *
   * Uses axis priority: alphabetically lower axis gets slot from top.
   * This ensures complementary slots for interlocking:
   * - X vs Z: X gets 'top', Z gets 'bottom' (x < z)
   * - X vs Y: X gets 'top', Y gets 'bottom' (x < y)
   * - Y vs Z: Y gets 'top', Z gets 'bottom' (y < z)
   */
  private getCrossLapSlotEdge(myAxis: Axis, otherAxis: Axis): 'top' | 'bottom' {
    // Use axis priority: alphabetically lower axis gets slot from top
    if (myAxis < otherAxis) {
      return 'top';
    } else {
      return 'bottom';
    }
  }

  /**
   * Override computeOutline to include cross-lap slots in the panel outline
   */
  protected computeOutline(): PanelOutline {
    // Get base outline from parent class
    const baseOutline = super.computeOutline();

    // Compute cross-lap slots
    const crossLapSlots = this.computeCrossLapSlots();
    debug('cross-lap', `computeOutline for ${this._axis}-divider: crossLapSlots=${crossLapSlots.length}`);
    for (const slot of crossLapSlots) {
      debug('cross-lap', `  slot: x=${slot.xPosition}, edge=${slot.fromEdge}, depth=${slot.depth}`);
    }
    if (crossLapSlots.length === 0) {
      return baseOutline;
    }

    // Apply cross-lap slots to the outline
    debug('cross-lap', `  Calling applyCrossLapSlotsToOutline with ${baseOutline.points.length} base points`);
    const modifiedPoints = this.applyCrossLapSlotsToOutline(baseOutline.points, crossLapSlots);
    debug('cross-lap', `  Result: ${modifiedPoints.length} modified points`);

    return {
      points: modifiedPoints,
      holes: baseOutline.holes,
    };
  }

  /**
   * Apply cross-lap slots to an outline by adding notches
   *
   * This method finds edge segments in the outline and inserts slot notches.
   * The slot position may be adjusted to fit within the actual edge bounds
   * (which may be smaller than the panel dimensions due to corner insets for finger joints).
   */
  private applyCrossLapSlotsToOutline(points: Point2D[], slots: CrossLapSlot[]): Point2D[] {
    if (slots.length === 0) return points;

    const dims = this.getDimensions();
    const halfH = dims.height / 2;
    const tolerance = 0.01;

    // Sort slots by X position
    const sortedSlots = [...slots].sort((a, b) => a.xPosition - b.xPosition);

    // Separate slots by edge
    const topSlots = sortedSlots.filter(s => s.fromEdge === 'top');
    const bottomSlots = sortedSlots.filter(s => s.fromEdge === 'bottom');

    // Find the actual edge bounds by looking at points on each edge
    let topEdgeLeft = Infinity, topEdgeRight = -Infinity;
    let bottomEdgeLeft = Infinity, bottomEdgeRight = -Infinity;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (Math.abs(p.y - halfH) < tolerance) {
        topEdgeLeft = Math.min(topEdgeLeft, p.x);
        topEdgeRight = Math.max(topEdgeRight, p.x);
      }
      if (Math.abs(p.y - (-halfH)) < tolerance) {
        bottomEdgeLeft = Math.min(bottomEdgeLeft, p.x);
        bottomEdgeRight = Math.max(bottomEdgeRight, p.x);
      }
    }

    debug('cross-lap', `Edge bounds: top=[${topEdgeLeft.toFixed(1)}, ${topEdgeRight.toFixed(1)}], bottom=[${bottomEdgeLeft.toFixed(1)}, ${bottomEdgeRight.toFixed(1)}]`);

    // Helper to clamp slot position to valid edge range
    const clampSlotToEdge = (slot: CrossLapSlot, edgeLeft: number, edgeRight: number): CrossLapSlot | null => {
      const halfWidth = slot.width / 2;
      const minX = edgeLeft + halfWidth + tolerance;
      const maxX = edgeRight - halfWidth - tolerance;

      if (maxX < minX) {
        // Edge too narrow for slot
        debug('cross-lap', `Edge too narrow for slot at x=${slot.xPosition.toFixed(1)}`);
        return null;
      }

      // Clamp slot position to valid range
      const clampedX = Math.max(minX, Math.min(maxX, slot.xPosition));
      if (Math.abs(clampedX - slot.xPosition) > tolerance) {
        debug('cross-lap', `Clamped slot from x=${slot.xPosition.toFixed(1)} to x=${clampedX.toFixed(1)}`);
      }

      return { ...slot, xPosition: clampedX };
    };

    // Clamp slots to their respective edge bounds
    const clampedTopSlots = topSlots
      .map(s => clampSlotToEdge(s, topEdgeLeft, topEdgeRight))
      .filter((s): s is CrossLapSlot => s !== null);

    const clampedBottomSlots = bottomSlots
      .map(s => clampSlotToEdge(s, bottomEdgeLeft, bottomEdgeRight))
      .filter((s): s is CrossLapSlot => s !== null);

    // Get material thickness for hole detection
    const mt = this.getMaterial().thickness;
    const holeLevel = halfH - mt;  // Hole level on top edge
    const bottomHoleLevel = -halfH + mt;  // Hole level on bottom edge

    // Build new outline with slots inserted
    const newPoints: Point2D[] = [];

    for (let i = 0; i < points.length; i++) {
      const current = points[i];
      const next = points[(i + 1) % points.length];

      newPoints.push(current);

      // Check if this segment is part of the top edge TAB (y near +halfH, moving right)
      const isTopEdgeTab = Math.abs(current.y - halfH) < tolerance &&
                           Math.abs(next.y - halfH) < tolerance &&
                           next.x > current.x;

      // Check if this segment is part of the top edge HOLE (y near +halfH - mt, moving right)
      const isTopEdgeHole = Math.abs(current.y - holeLevel) < tolerance &&
                            Math.abs(next.y - holeLevel) < tolerance &&
                            next.x > current.x;

      // Check if this segment is part of the bottom edge TAB (y near -halfH, moving left)
      const isBottomEdgeTab = Math.abs(current.y - (-halfH)) < tolerance &&
                              Math.abs(next.y - (-halfH)) < tolerance &&
                              next.x < current.x;

      // Check if this segment is part of the bottom edge HOLE (y near -halfH + mt, moving left)
      const isBottomEdgeHole = Math.abs(current.y - bottomHoleLevel) < tolerance &&
                               Math.abs(next.y - bottomHoleLevel) < tolerance &&
                               next.x < current.x;

      if (isTopEdgeTab) {
        // Insert top slots that fall within this TAB segment
        for (const slot of clampedTopSlots) {
          const slotLeft = slot.xPosition - slot.width / 2;
          const slotRight = slot.xPosition + slot.width / 2;

          // Check if slot falls within this segment
          if (slotLeft >= current.x - tolerance && slotRight <= next.x + tolerance) {
            // Add slot notch: go to slot left, down into slot, across, up, continue
            newPoints.push({ x: slotLeft, y: halfH });
            newPoints.push({ x: slotLeft, y: halfH - slot.depth });
            newPoints.push({ x: slotRight, y: halfH - slot.depth });
            newPoints.push({ x: slotRight, y: halfH });
          }
        }
      }

      if (isTopEdgeHole) {
        // Insert top slots that fall within this HOLE segment
        // The slot goes from the hole, UP to the edge, DOWN into the notch, back UP to hole level
        for (const slot of clampedTopSlots) {
          const slotLeft = slot.xPosition - slot.width / 2;
          const slotRight = slot.xPosition + slot.width / 2;

          // Check if slot falls within this segment
          if (slotLeft >= current.x - tolerance && slotRight <= next.x + tolerance) {
            // Go to slot left at hole level, up to edge level, down into notch, across, up, down to hole
            newPoints.push({ x: slotLeft, y: holeLevel });
            newPoints.push({ x: slotLeft, y: halfH });  // UP to edge
            newPoints.push({ x: slotLeft, y: halfH - slot.depth });  // DOWN into notch
            newPoints.push({ x: slotRight, y: halfH - slot.depth });  // ACROSS
            newPoints.push({ x: slotRight, y: halfH });  // UP from notch
            newPoints.push({ x: slotRight, y: holeLevel });  // DOWN to hole level
          }
        }
      }

      if (isBottomEdgeTab) {
        // Insert bottom slots that fall within this TAB segment (note: moving right to left)
        // So we need to insert them in reverse order
        const relevantSlots = clampedBottomSlots.filter(slot => {
          const slotLeft = slot.xPosition - slot.width / 2;
          const slotRight = slot.xPosition + slot.width / 2;
          return slotRight <= current.x + tolerance && slotLeft >= next.x - tolerance;
        }).sort((a, b) => b.xPosition - a.xPosition); // Sort right to left

        for (const slot of relevantSlots) {
          const slotLeft = slot.xPosition - slot.width / 2;
          const slotRight = slot.xPosition + slot.width / 2;

          // Add slot notch: go to slot right, up into slot, across, down, continue
          newPoints.push({ x: slotRight, y: -halfH });
          newPoints.push({ x: slotRight, y: -halfH + slot.depth });
          newPoints.push({ x: slotLeft, y: -halfH + slot.depth });
          newPoints.push({ x: slotLeft, y: -halfH });
        }
      }

      if (isBottomEdgeHole) {
        // Insert bottom slots that fall within this HOLE segment (note: moving right to left)
        const relevantSlots = clampedBottomSlots.filter(slot => {
          const slotLeft = slot.xPosition - slot.width / 2;
          const slotRight = slot.xPosition + slot.width / 2;
          return slotRight <= current.x + tolerance && slotLeft >= next.x - tolerance;
        }).sort((a, b) => b.xPosition - a.xPosition); // Sort right to left

        for (const slot of relevantSlots) {
          const slotLeft = slot.xPosition - slot.width / 2;
          const slotRight = slot.xPosition + slot.width / 2;

          // Go to slot right at hole level, down to edge level, up into notch, across, down, up to hole
          newPoints.push({ x: slotRight, y: bottomHoleLevel });
          newPoints.push({ x: slotRight, y: -halfH });  // DOWN to edge
          newPoints.push({ x: slotRight, y: -halfH + slot.depth });  // UP into notch
          newPoints.push({ x: slotLeft, y: -halfH + slot.depth });  // ACROSS
          newPoints.push({ x: slotLeft, y: -halfH });  // DOWN from notch
          newPoints.push({ x: slotLeft, y: bottomHoleLevel });  // UP to hole level
        }
      }
    }

    return newPoints;
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
