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
import { debug, enableDebugTag } from '../../utils/debug';

enableDebugTag('divider-holes');

export class DividerPanelNode extends BasePanel {
  readonly kind: NodeKind = 'divider-panel';
  protected _voidNode: VoidNode;
  protected _axis: Axis;
  protected _position: number;

  constructor(voidNode: VoidNode, axis: Axis, position: number, id?: string) {
    // Include axis and position in ID to ensure uniqueness when multiple dividers exist
    super(id ?? `divider-${voidNode.id}-${axis}-${position}`);
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
        // Divider doesn't reach the wall - use actual position in 0-based coords
        startPos = boundsLow - mt;
      }

      // High end - same logic as face panels
      if (atHighWall) {
        // Divider is at the wall - use face panel logic
        endPos = meetsHigh ? maxJoint : maxJoint + mt;
      } else {
        // Divider doesn't reach the wall - use actual position in 0-based coords
        endPos = boundsLow + boundsSize - mt;
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
