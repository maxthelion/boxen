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
} from '../types';
import {
  ALL_EDGE_POSITIONS,
  getDividerAdjacentFace,
} from '../../utils/faceGeometry';
import { getDividerEdgeGender } from '../../utils/genderRules';
import { debug, enableDebugTag } from '../../utils/debug';

enableDebugTag('divider-holes');
enableDebugTag('cross-lap');

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

      // Skip perpendicular divider intersections - these are handled by cross-lap slots
      // Cross-lap slots are edge notches, not interior holes
      // Only generate holes for sub-assembly slots or other special cases
      continue; // All divider-to-divider intersections use cross-lap slots now

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
      if (fingerData && fingerData[slotAxis]) {
        const axisFingerData = fingerData[slotAxis];
        const { points: transitionPoints, innerOffset, maxJointLength: maxJoint } = axisFingerData;

        // Build section boundaries
        const allBoundaries = [innerOffset, ...transitionPoints, maxJoint - innerOffset];

        let slotIndex = 0;
        for (let i = 0; i < allBoundaries.length - 1; i++) {
          if (i % 2 === 0) {  // Finger section (where divider tabs go)
            const sectionStart = allBoundaries[i];
            const sectionEnd = allBoundaries[i + 1];

            // Convert from 0-based axis coords to 2D panel coords (centered)
            const offsetStart = sectionStart - maxJoint / 2;
            const offsetEnd = sectionEnd - maxJoint / 2;

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
   * The divider's total span = mt (face A) + void_space + mt (panel B)
   *
   * - Face side (at wall): Finger tabs extend mt into the face's slot.
   *   Panel body edge aligns with face's inner surface (at mt from outer).
   *   Tabs provide the extension to the face's outer edge.
   *
   * - Divider side (not at wall): No finger joints between dividers yet.
   *   Panel body must extend mt beyond void boundary to reach the
   *   adjacent divider's far edge (void boundary = divider's near edge,
   *   far edge = near edge + mt since divider has material thickness mt).
   *
   * Result: body extends mt beyond void on divider side, tabs extend mt on face side.
   * Total span = void_size + 2*mt, achieved via body extension + tabs.
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
    // At face wall: body starts at void boundary (face inner surface)
    // At divider: body extends mt beyond void to reach divider's far edge
    const bodyStart = atLowWall ? boundsLow : boundsLow - mt;

    // Panel body end position (high end)
    // At face wall: body ends at void boundary (face inner surface)
    // At divider: body extends mt beyond void to reach divider's far edge
    const bodyEnd = atHighWall ? boundsLow + boundsSize : boundsLow + boundsSize + mt;

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
   * This ensures finger tabs aren't generated where cross-lap slots remove material.
   */
  protected override getFingerBlockingRanges(): Map<EdgePosition, { start: number; end: number }[]> {
    const ranges = new Map<EdgePosition, { start: number; end: number }[]>();
    const assembly = this.findParentAssembly();
    if (!assembly) return ranges;

    const crossLapSlots = this.computeCrossLapSlots();
    if (crossLapSlots.length === 0) return ranges;

    const mt = assembly.material.thickness;
    const dims = this.getDimensions();
    const bounds = this._voidNode.bounds;

    debug('cross-lap', `getFingerBlockingRanges for ${this.id} (${this._axis}), ${crossLapSlots.length} cross-lap slots`);

    // Convert cross-lap X positions (panel-local coords) to axis positions
    // The width axis depends on divider orientation
    for (const slot of crossLapSlots) {
      const edge = slot.fromEdge === 'top' ? 'top' : 'bottom';

      // Get the axis and span for the width direction
      let span: { start: number; end: number; center: number; size: number };
      switch (this._axis) {
        case 'x':
          // X-divider: width spans Z
          span = this.computeBodySpan(bounds.z, bounds.d, assembly.depth, mt);
          break;
        case 'y':
          // Y-divider: width spans X
          span = this.computeBodySpan(bounds.x, bounds.w, assembly.width, mt);
          break;
        case 'z':
          // Z-divider: width spans X
          span = this.computeBodySpan(bounds.x, bounds.w, assembly.width, mt);
          break;
      }

      // The slot.xPosition is in panel-local coords (centered at 0)
      // Convert to axis position: add span.center to get world position, then subtract mt for 0-based
      const worldAxisPos = slot.xPosition + span.center;
      const axisPos = worldAxisPos - mt;

      const halfWidth = slot.width / 2;
      const blockingRange = { start: axisPos - halfWidth, end: axisPos + halfWidth };

      if (!ranges.has(edge)) {
        ranges.set(edge, []);
      }
      ranges.get(edge)!.push(blockingRange);
    }

    return ranges;
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

    // Track which axes we intersect with (for 3-axis validation)
    const intersectingAxes = new Set<Axis>();

    for (const sub of subdivisions) {
      // Skip parallel dividers (same axis)
      if (sub.axis === this._axis) continue;

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

      // Check if our position falls within the other divider's extent
      if (this._position < otherExtentLow - tolerance || this._position > otherExtentHigh + tolerance) {
        continue;
      }

      // This divider intersects with sub
      intersectingAxes.add(sub.axis);

      // Calculate slot position along our panel width
      const slotXPosition = this.calculateCrossLapSlotPosition(sub, bounds, assembly, mt);
      if (slotXPosition === null) continue;

      // Determine slot direction using axis priority rule
      // Compare axes alphabetically: lower axis gets slot from top
      const fromEdge = this.getCrossLapSlotEdge(this._axis, sub.axis);

      slots.push({
        xPosition: slotXPosition,
        width: mt,
        depth: dims.height / 2,
        fromEdge,
        intersectingDividerId: sub.id,
      });
    }

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
    if (crossLapSlots.length === 0) {
      return baseOutline;
    }

    // Apply cross-lap slots to the outline
    const modifiedPoints = this.applyCrossLapSlotsToOutline(baseOutline.points, crossLapSlots);

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

    // Build new outline with slots inserted
    const newPoints: Point2D[] = [];

    for (let i = 0; i < points.length; i++) {
      const current = points[i];
      const next = points[(i + 1) % points.length];

      newPoints.push(current);

      // Check if this segment is part of the top edge (y near +halfH, moving right)
      const isTopEdge = Math.abs(current.y - halfH) < tolerance &&
                        Math.abs(next.y - halfH) < tolerance &&
                        next.x > current.x;

      // Check if this segment is part of the bottom edge (y near -halfH, moving left)
      const isBottomEdge = Math.abs(current.y - (-halfH)) < tolerance &&
                           Math.abs(next.y - (-halfH)) < tolerance &&
                           next.x < current.x;

      if (isTopEdge) {
        // Insert top slots that fall within this segment
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

      if (isBottomEdge) {
        // Insert bottom slots that fall within this segment (note: moving right to left)
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
