/**
 * SubAssemblyNode - A nested assembly within a void (drawer, tray, insert)
 *
 * Sub-assemblies:
 * - Live inside a parent void
 * - Have their own dimensions (sized to fit the void with clearance)
 * - Have their own face configurations
 * - Can have their own interior subdivisions
 * - Are positioned within the parent void
 */

import { BaseAssembly } from './BaseAssembly';
import { VoidNode } from './VoidNode';
import {
  NodeKind,
  MaterialConfig,
  Transform3D,
  AssemblySnapshot,
  FaceId,
} from '../types';

export class SubAssemblyNode extends BaseAssembly {
  readonly kind: NodeKind = 'sub-assembly';

  // Reference to parent void
  protected _parentVoid: VoidNode;

  // Clearance from void walls (mm)
  protected _clearance: number;

  // Position offset from centered position (for anchored resize)
  protected _positionOffset: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };

  constructor(
    parentVoid: VoidNode,
    material: MaterialConfig,
    clearance: number = 1,
    id?: string
  ) {
    // Calculate dimensions from parent void bounds minus clearance
    const bounds = parentVoid.bounds;
    const width = bounds.w - 2 * clearance;
    const height = bounds.h - 2 * clearance;
    const depth = bounds.d - 2 * clearance;

    super(width, height, depth, material, id);

    this._parentVoid = parentVoid;
    this._clearance = clearance;
  }

  // ==========================================================================
  // Accessors
  // ==========================================================================

  get parentVoid(): VoidNode {
    return this._parentVoid;
  }

  get parentVoidId(): string {
    return this._parentVoid.id;
  }

  get clearance(): number {
    return this._clearance;
  }

  setClearance(clearance: number): void {
    if (this._clearance !== clearance) {
      this._clearance = clearance;
      this.updateDimensionsFromVoid();
      this.markDirty();
    }
  }

  get positionOffset(): { x: number; y: number; z: number } {
    return { ...this._positionOffset };
  }

  /**
   * Set position offset from centered position
   * Used by push-pull to anchor one face while moving the other
   */
  setPositionOffset(offset: { x?: number; y?: number; z?: number }): void {
    let changed = false;
    if (offset.x !== undefined && offset.x !== this._positionOffset.x) {
      this._positionOffset.x = offset.x;
      changed = true;
    }
    if (offset.y !== undefined && offset.y !== this._positionOffset.y) {
      this._positionOffset.y = offset.y;
      changed = true;
    }
    if (offset.z !== undefined && offset.z !== this._positionOffset.z) {
      this._positionOffset.z = offset.z;
      changed = true;
    }
    if (changed) {
      this.markDirty();
    }
  }

  /**
   * Update dimensions when parent void bounds change
   */
  updateDimensionsFromVoid(): void {
    const bounds = this._parentVoid.bounds;
    this._width = bounds.w - 2 * this._clearance;
    this._height = bounds.h - 2 * this._clearance;
    this._depth = bounds.d - 2 * this._clearance;
    this.updateRootVoidBounds();
  }

  // ==========================================================================
  // Transform
  // ==========================================================================

  /**
   * Position sub-assembly within the parent void
   * Centered in the void with clearance offset, plus any position offset from push-pull
   */
  getWorldTransform(): Transform3D {
    const bounds = this._parentVoid.bounds;

    // Find the root assembly to get the world offset
    const rootAssembly = this.findRootAssembly();
    if (!rootAssembly) {
      throw new Error('SubAssemblyNode must have a root assembly ancestor');
    }

    // Calculate center of void in assembly-local coordinates
    const voidCenterX = bounds.x + bounds.w / 2;
    const voidCenterY = bounds.y + bounds.h / 2;
    const voidCenterZ = bounds.z + bounds.d / 2;

    // Convert to world coordinates (assembly is centered at origin)
    const halfW = rootAssembly.width / 2;
    const halfH = rootAssembly.height / 2;
    const halfD = rootAssembly.depth / 2;

    // Apply position offset (from push-pull operations that anchor one face)
    return {
      position: [
        voidCenterX - halfW + this._positionOffset.x,
        voidCenterY - halfH + this._positionOffset.y,
        voidCenterZ - halfD + this._positionOffset.z,
      ],
      rotation: [0, 0, 0],
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  protected findRootAssembly(): BaseAssembly | null {
    let node = this._parentVoid.parent;
    while (node) {
      // Keep going until we find an assembly that's not a sub-assembly
      if (node instanceof BaseAssembly && node.kind === 'assembly') {
        return node;
      }
      node = node.parent;
    }
    return null;
  }

  // ==========================================================================
  // Constraint Checking
  // ==========================================================================

  /**
   * Clamp a requested dimension for a push-pull operation so the sub-assembly
   * face does not protrude through a CLOSED parent face panel.
   *
   * Extension beyond the void boundary is allowed only when the void boundary
   * on the pushed side coincides with an OPEN parent assembly face.
   * If the void boundary is formed by a divider (not a face panel), the
   * sub-assembly is always clamped to the void edge.
   *
   * @param faceId - The face being pushed (determines axis and direction)
   * @param requestedDim - The new width, height, or depth requested
   * @returns The constrained dimension (may be less than requestedDim)
   */
  clampDimensionToParentBounds(faceId: FaceId, requestedDim: number): number {
    const parentAssembly = this.findRootAssembly();
    if (!parentAssembly) return requestedDim;

    const vb = this._parentVoid.bounds;
    const mt = parentAssembly.material.thickness;

    type AxisInfo = {
      voidLimitHigh: number;      // void boundary on the high (positive) side
      voidLimitLow: number;       // void boundary on the low (negative) side
      assemblyDimHigh: number;    // assembly inner-surface position on high side
      assemblyDimLow: number;     // assembly inner-surface position on low side
      currentDim: number;         // current sub-assembly dimension on this axis
      currentOffsetAxis: number;  // current positionOffset component for this axis
      voidCenter: number;         // centre of void along this axis (assembly-local)
      pushesHighSide: boolean;    // does faceId point toward the high side?
      parentFaceHigh: FaceId;     // assembly face on the high side
      parentFaceLow: FaceId;      // assembly face on the low side
    };

    let info: AxisInfo;
    switch (faceId) {
      case 'top':
      case 'bottom':
        info = {
          voidLimitHigh: vb.y + vb.h,
          voidLimitLow: vb.y,
          assemblyDimHigh: parentAssembly.height - mt,
          assemblyDimLow: mt,
          currentDim: this._height,
          currentOffsetAxis: this._positionOffset.y,
          voidCenter: vb.y + vb.h / 2,
          pushesHighSide: faceId === 'top',
          parentFaceHigh: 'top',
          parentFaceLow: 'bottom',
        };
        break;
      case 'right':
      case 'left':
        info = {
          voidLimitHigh: vb.x + vb.w,
          voidLimitLow: vb.x,
          assemblyDimHigh: parentAssembly.width - mt,
          assemblyDimLow: mt,
          currentDim: this._width,
          currentOffsetAxis: this._positionOffset.x,
          voidCenter: vb.x + vb.w / 2,
          pushesHighSide: faceId === 'right',
          parentFaceHigh: 'right',
          parentFaceLow: 'left',
        };
        break;
      case 'front':
      case 'back':
        info = {
          voidLimitHigh: vb.z + vb.d,
          voidLimitLow: vb.z,
          assemblyDimHigh: parentAssembly.depth - mt,
          assemblyDimLow: mt,
          currentDim: this._depth,
          currentOffsetAxis: this._positionOffset.z,
          voidCenter: vb.z + vb.d / 2,
          pushesHighSide: faceId === 'front',
          parentFaceHigh: 'front',
          parentFaceLow: 'back',
        };
        break;
      default:
        return requestedDim;
    }

    // Determine which void boundary we are pushing toward and which face (if any) bounds it
    const voidPushLimit = info.pushesHighSide ? info.voidLimitHigh : info.voidLimitLow;
    const assemblyFaceLimit = info.pushesHighSide ? info.assemblyDimHigh : info.assemblyDimLow;
    const pushFaceId = info.pushesHighSide ? info.parentFaceHigh : info.parentFaceLow;

    // Check whether the void boundary coincides with a parent face panel.
    // If it doesn't (i.e. it's a divider), we impose no constraint — only closed
    // parent face panels block the sub-assembly from extending.
    const TOLERANCE = 0.5; // mm
    const isAtFacePanel = Math.abs(voidPushLimit - assemblyFaceLimit) < TOLERANCE;

    if (!isAtFacePanel) {
      // Boundary is a divider, not a parent face panel → no constraint
      return requestedDim;
    }

    // Void boundary is a parent face panel.
    // If that face is OPEN (toggled off) → allow free extension through it.
    if (!parentAssembly.isFaceSolid(pushFaceId)) {
      return requestedDim;
    }

    // Face is CLOSED → clamp so the sub-assembly face stays at the void boundary.
    // Compute the anchored (fixed) face position in assembly-local coords.
    // When pushing the high side, the low face is anchored and vice-versa.
    const anchoredFaceLocal = info.pushesHighSide
      ? info.voidCenter + info.currentOffsetAxis - info.currentDim / 2
      : info.voidCenter + info.currentOffsetAxis + info.currentDim / 2;

    // Maximum allowed dimension so the pushed face stays at the void boundary
    const maxDim = info.pushesHighSide
      ? voidPushLimit - anchoredFaceLocal
      : anchoredFaceLocal - voidPushLimit;

    return Math.min(requestedDim, Math.max(maxDim, 0));
  }

  // ==========================================================================
  // Serialization
  // ==========================================================================

  serialize(): AssemblySnapshot {
    const base = this.serializeBase('sub-assembly');

    // Add sub-assembly specific props
    return {
      ...base,
      props: {
        ...base.props,
        clearance: this._clearance,
        parentVoidId: this._parentVoid.id,
        positionOffset: { ...this._positionOffset },
      },
    };
  }

  // ==========================================================================
  // Cloning
  // ==========================================================================

  /**
   * Clone this sub-assembly into a new parent void
   * Called by VoidNode.clone() to properly set up the parent reference
   */
  cloneIntoVoid(newParentVoid: VoidNode): SubAssemblyNode {
    const cloned = new SubAssemblyNode(
      newParentVoid,
      { ...this._material },
      this._clearance,
      this.id
    );

    // Copy base assembly properties
    this.copyBasePropertiesTo(cloned);

    // Copy dimensions (constructor calculates from void bounds, but we want the actual dimensions)
    cloned._width = this._width;
    cloned._height = this._height;
    cloned._depth = this._depth;

    // Copy position offset
    cloned._positionOffset = { ...this._positionOffset };

    // Remove the default root void and replace with cloned one
    cloned.removeChild(cloned._rootVoid);
    cloned._rootVoid = this._rootVoid.clone();
    cloned.addChild(cloned._rootVoid);

    return cloned;
  }

  /**
   * Clone this sub-assembly (uses current parent void)
   * Note: For proper cloning during scene cloning, use cloneIntoVoid()
   */
  clone(): SubAssemblyNode {
    return this.cloneIntoVoid(this._parentVoid);
  }
}
