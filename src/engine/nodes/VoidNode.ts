/**
 * VoidNode - Represents an interior space that can be subdivided
 *
 * Voids are the interior spaces within an assembly.
 * They can be:
 * - Subdivided into child voids (creating divider panels)
 * - Filled with a sub-assembly (drawer, tray, etc.)
 * - Left empty (leaf void)
 */

import { BaseNode } from './BaseNode';
import {
  NodeKind,
  Axis,
  Bounds3D,
  Point3D,
  VoidSnapshot,
  VoidAnchor,
  GridSubdivisionInfo,
} from '../types';

export class VoidNode extends BaseNode {
  readonly kind: NodeKind = 'void';

  // Bounds within parent coordinate space
  protected _bounds: Bounds3D;

  // Subdivision info (if this void was created by splitting a parent)
  protected _splitAxis?: Axis;
  protected _splitPosition?: number;
  protected _splitPositionMode?: 'absolute' | 'percentage';
  protected _splitPercentage?: number;

  // Cached divider panel ID - preserves panel identity across scene clones
  // The actual panel is created in BaseAssembly.collectDividerPanels()
  protected _dividerPanelId?: string;

  // Grid subdivision info (for multi-axis grids)
  // When set, this void has been subdivided on multiple axes simultaneously
  protected _gridSubdivision?: GridSubdivisionInfo;

  // Cached divider panel IDs for grid subdivisions (keyed by "axis-position")
  protected _gridDividerPanelIds?: Map<string, string>;

  constructor(bounds: Bounds3D, id?: string) {
    super(id);
    this._bounds = { ...bounds };
  }

  // Get/set the cached divider panel ID
  get dividerPanelId(): string | undefined {
    return this._dividerPanelId;
  }

  set dividerPanelId(id: string | undefined) {
    this._dividerPanelId = id;
  }

  // ==========================================================================
  // Bounds Accessors
  // ==========================================================================

  get bounds(): Bounds3D {
    return { ...this._bounds };
  }

  setBounds(bounds: Bounds3D): void {
    this._bounds = { ...bounds };
    this.markDirty();
    // Update children bounds if subdivided
    this.updateChildBounds();
  }

  // ==========================================================================
  // Subdivision Info
  // ==========================================================================

  get splitAxis(): Axis | undefined {
    return this._splitAxis;
  }

  get splitPosition(): number | undefined {
    return this._splitPosition;
  }

  get splitPositionMode(): 'absolute' | 'percentage' | undefined {
    return this._splitPositionMode;
  }

  get splitPercentage(): number | undefined {
    return this._splitPercentage;
  }

  setSplitInfo(info: {
    axis: Axis;
    position: number;
    mode: 'absolute' | 'percentage';
    percentage?: number;
  }): void {
    this._splitAxis = info.axis;
    this._splitPosition = info.position;
    this._splitPositionMode = info.mode;
    this._splitPercentage = info.percentage;
    this.markDirty();
  }

  // ==========================================================================
  // State Queries
  // ==========================================================================

  /**
   * Is this a leaf void (no children)?
   */
  get isLeaf(): boolean {
    return this._children.length === 0;
  }

  /**
   * Does this void contain a sub-assembly?
   */
  get hasSubAssembly(): boolean {
    return this._children.some(c => c.kind === 'sub-assembly');
  }

  /**
   * Is this void subdivided?
   */
  get isSubdivided(): boolean {
    return this._children.some(c => c.kind === 'void');
  }

  // ==========================================================================
  // Subdivision Operations
  // ==========================================================================

  /**
   * Subdivide this void at the given position along the given axis
   */
  subdivide(axis: Axis, position: number, materialThickness: number): [VoidNode, VoidNode] {
    if (!this.isLeaf) {
      throw new Error('Cannot subdivide a non-leaf void');
    }

    const { x, y, z, w, h, d } = this._bounds;
    const halfMt = materialThickness / 2;

    let bounds1: Bounds3D;
    let bounds2: Bounds3D;

    switch (axis) {
      case 'x':
        bounds1 = { x, y, z, w: position - x - halfMt, h, d };
        bounds2 = { x: position + halfMt, y, z, w: x + w - position - halfMt, h, d };
        break;
      case 'y':
        bounds1 = { x, y, z, w, h: position - y - halfMt, d };
        bounds2 = { x, y: position + halfMt, z, w, h: y + h - position - halfMt, d };
        break;
      case 'z':
        bounds1 = { x, y, z, w, h, d: position - z - halfMt };
        bounds2 = { x, y, z: position + halfMt, w, h, d: z + d - position - halfMt };
        break;
    }

    const child1 = new VoidNode(bounds1);
    const child2 = new VoidNode(bounds2);

    // Set split info on the second child (it has the divider before it)
    const dimSize = axis === 'x' ? w : axis === 'y' ? h : d;
    const dimStart = axis === 'x' ? x : axis === 'y' ? y : z;
    const percentage = (position - dimStart) / dimSize;

    child2.setSplitInfo({
      axis,
      position,
      mode: 'percentage',
      percentage,
    });

    this.addChild(child1);
    this.addChild(child2);

    return [child1, child2];
  }

  /**
   * Subdivide this void at multiple positions along an axis
   * Creates N+1 child voids for N split positions (dividers)
   *
   * @param axis - Axis to subdivide along
   * @param positions - Array of absolute split positions
   * @param materialThickness - Thickness of divider panels
   * @returns Array of created child VoidNodes
   */
  subdivideMultiple(
    axis: Axis,
    positions: number[],
    materialThickness: number
  ): VoidNode[] {
    if (!this.isLeaf) {
      throw new Error('Cannot subdivide a non-leaf void');
    }

    if (positions.length === 0) {
      throw new Error('Must provide at least one split position');
    }

    // Sort positions to ensure correct ordering
    const sortedPositions = [...positions].sort((a, b) => a - b);
    const halfMt = materialThickness / 2;
    const children: VoidNode[] = [];

    // Get axis-specific values
    const dimStart = axis === 'x' ? this._bounds.x : axis === 'y' ? this._bounds.y : this._bounds.z;
    const dimSize = axis === 'x' ? this._bounds.w : axis === 'y' ? this._bounds.h : this._bounds.d;
    const dimEnd = dimStart + dimSize;

    // Create N+1 child voids for N dividers
    for (let i = 0; i <= sortedPositions.length; i++) {
      const regionStart = i === 0 ? dimStart : sortedPositions[i - 1] + halfMt;
      const regionEnd = i === sortedPositions.length ? dimEnd : sortedPositions[i] - halfMt;
      const regionSize = regionEnd - regionStart;

      // Calculate bounds for this child
      let childBounds: Bounds3D;
      switch (axis) {
        case 'x':
          childBounds = {
            x: regionStart,
            y: this._bounds.y,
            z: this._bounds.z,
            w: regionSize,
            h: this._bounds.h,
            d: this._bounds.d,
          };
          break;
        case 'y':
          childBounds = {
            x: this._bounds.x,
            y: regionStart,
            z: this._bounds.z,
            w: this._bounds.w,
            h: regionSize,
            d: this._bounds.d,
          };
          break;
        case 'z':
          childBounds = {
            x: this._bounds.x,
            y: this._bounds.y,
            z: regionStart,
            w: this._bounds.w,
            h: this._bounds.h,
            d: regionSize,
          };
          break;
      }

      const child = new VoidNode(childBounds);

      // Set split info on children after the first (they have a divider before them)
      if (i > 0) {
        const splitPos = sortedPositions[i - 1];
        const percentage = (splitPos - dimStart) / dimSize;
        child.setSplitInfo({
          axis,
          position: splitPos,
          mode: 'percentage',
          percentage,
        });
      }

      this.addChild(child);
      children.push(child);
    }

    return children;
  }

  /**
   * Subdivide this void into a grid on multiple axes simultaneously
   * Creates full-spanning dividers that form proper grids with cross-lap joints
   *
   * @param axesConfig - Array of axis configurations (1-2 axes), each with axis and positions
   * @param materialThickness - Thickness of divider panels
   * @returns Array of created child VoidNodes (grid cells)
   */
  subdivideGrid(
    axesConfig: { axis: Axis; positions: number[] }[],
    materialThickness: number
  ): VoidNode[] {
    if (!this.isLeaf) {
      throw new Error('Cannot subdivide a non-leaf void');
    }

    if (axesConfig.length === 0) {
      throw new Error('Must provide at least one axis configuration');
    }

    if (axesConfig.length > 2) {
      throw new Error('Grid subdivision supports maximum 2 axes');
    }

    // If only one axis, delegate to subdivideMultiple
    if (axesConfig.length === 1) {
      return this.subdivideMultiple(
        axesConfig[0].axis,
        axesConfig[0].positions,
        materialThickness
      );
    }

    const halfMt = materialThickness / 2;

    // Store grid subdivision info
    this._gridSubdivision = {
      axes: axesConfig.map(c => c.axis),
      positions: {},
    };
    for (const config of axesConfig) {
      this._gridSubdivision.positions[config.axis] = [...config.positions].sort((a, b) => a - b);
    }

    // Initialize grid divider panel IDs map
    this._gridDividerPanelIds = new Map();

    // Get sorted positions for each axis
    const axis1 = axesConfig[0].axis;
    const axis2 = axesConfig[1].axis;
    const positions1 = [...axesConfig[0].positions].sort((a, b) => a - b);
    const positions2 = [...axesConfig[1].positions].sort((a, b) => a - b);

    // Helper to get axis-specific bounds values
    const getAxisBounds = (axis: Axis) => {
      switch (axis) {
        case 'x': return { start: this._bounds.x, size: this._bounds.w };
        case 'y': return { start: this._bounds.y, size: this._bounds.h };
        case 'z': return { start: this._bounds.z, size: this._bounds.d };
      }
    };

    // Helper to set axis-specific bounds values
    const setAxisBounds = (bounds: Bounds3D, axis: Axis, start: number, size: number) => {
      switch (axis) {
        case 'x':
          bounds.x = start;
          bounds.w = size;
          break;
        case 'y':
          bounds.y = start;
          bounds.h = size;
          break;
        case 'z':
          bounds.z = start;
          bounds.d = size;
          break;
      }
    };

    // Calculate regions for each axis
    const calcRegions = (positions: number[], axis: Axis) => {
      const { start: dimStart, size: dimSize } = getAxisBounds(axis);
      const dimEnd = dimStart + dimSize;
      const regions: { start: number; end: number }[] = [];

      for (let i = 0; i <= positions.length; i++) {
        const regionStart = i === 0 ? dimStart : positions[i - 1] + halfMt;
        const regionEnd = i === positions.length ? dimEnd : positions[i] - halfMt;
        regions.push({ start: regionStart, end: regionEnd });
      }
      return regions;
    };

    const regions1 = calcRegions(positions1, axis1);
    const regions2 = calcRegions(positions2, axis2);

    // Create grid cells as Cartesian product of all region combinations
    const children: VoidNode[] = [];

    for (let i = 0; i < regions1.length; i++) {
      for (let j = 0; j < regions2.length; j++) {
        const r1 = regions1[i];
        const r2 = regions2[j];

        // Create bounds for this cell
        const childBounds: Bounds3D = { ...this._bounds };
        setAxisBounds(childBounds, axis1, r1.start, r1.end - r1.start);
        setAxisBounds(childBounds, axis2, r2.start, r2.end - r2.start);

        const child = new VoidNode(childBounds);
        this.addChild(child);
        children.push(child);
      }
    }

    return children;
  }

  // ==========================================================================
  // Grid Subdivision Accessors
  // ==========================================================================

  /**
   * Get the grid subdivision info (if this void was subdivided as a grid)
   */
  get gridSubdivision(): GridSubdivisionInfo | undefined {
    return this._gridSubdivision;
  }

  /**
   * Get or create a cached divider panel ID for a grid divider
   */
  getGridDividerPanelId(axis: Axis, position: number): string | undefined {
    const key = `${axis}-${position}`;
    return this._gridDividerPanelIds?.get(key);
  }

  /**
   * Set a cached divider panel ID for a grid divider
   */
  setGridDividerPanelId(axis: Axis, position: number, id: string): void {
    if (!this._gridDividerPanelIds) {
      this._gridDividerPanelIds = new Map();
    }
    const key = `${axis}-${position}`;
    this._gridDividerPanelIds.set(key, id);
  }

  /**
   * Remove subdivision and return to leaf state
   */
  clearSubdivision(): void {
    // Remove all void children
    const voidChildren = this._children.filter(c => c.kind === 'void');
    for (const child of voidChildren) {
      this.removeChild(child);
    }
    // Clear grid subdivision info
    this._gridSubdivision = undefined;
    this._gridDividerPanelIds = undefined;
  }

  /**
   * Move a subdivision (divider) to a new position
   * The subdivisionId is the ID of the child void that has the splitPosition
   *
   * @param subdivisionId - ID of the child void whose divider should move
   * @param newPosition - New absolute position for the divider
   * @param materialThickness - Material thickness for bounds calculation
   * @returns true if the move was successful
   */
  moveSubdivision(
    subdivisionId: string,
    newPosition: number,
    materialThickness: number
  ): boolean {
    // Find the child void with this subdivision ID
    const voidChildren = this.getVoidChildren();
    const childIndex = voidChildren.findIndex(c => c.id === subdivisionId);

    if (childIndex < 0) return false;

    // Only children after the first have split info (they have a divider before them)
    if (childIndex === 0) return false;

    const childVoid = voidChildren[childIndex];
    const axis = childVoid._splitAxis;
    if (!axis) return false;

    // Get the bounds of this parent void
    const dimStart = axis === 'x' ? this._bounds.x : axis === 'y' ? this._bounds.y : this._bounds.z;
    const dimSize = axis === 'x' ? this._bounds.w : axis === 'y' ? this._bounds.h : this._bounds.d;
    const dimEnd = dimStart + dimSize;

    // Calculate valid range for the new position
    // Must be between the previous divider (or start) and the next divider (or end)
    // with minimum spacing of materialThickness
    const prevPosition = childIndex === 1
      ? dimStart + materialThickness
      : (voidChildren[childIndex - 1]._splitPosition ?? dimStart) + materialThickness;
    const nextPosition = childIndex === voidChildren.length - 1
      ? dimEnd - materialThickness
      : (voidChildren[childIndex + 1]?._splitPosition ?? dimEnd) - materialThickness;

    // Validate the new position
    if (newPosition < prevPosition || newPosition > nextPosition) {
      return false;
    }

    // Update the split position
    const halfMt = materialThickness / 2;

    // Update the child void's split info
    const percentage = (newPosition - dimStart) / dimSize;
    childVoid._splitPosition = newPosition;
    childVoid._splitPercentage = percentage;

    // Recalculate bounds for affected children
    // The child before this one needs its end adjusted
    if (childIndex > 0) {
      const prevChild = voidChildren[childIndex - 1];
      const prevStart = childIndex === 1
        ? dimStart
        : (voidChildren[childIndex - 1]._splitPosition ?? dimStart) + halfMt;
      const prevEnd = newPosition - halfMt;
      const prevSize = prevEnd - prevStart;

      // Actually the previous child doesn't need position adjustment, just size
      // But wait - if we're moving the divider, we need to update both adjacent voids
      this.updateChildVoidBounds(prevChild, axis, prevChild._bounds, prevSize);
    }

    // Update the moved child void's bounds
    const newStart = newPosition + halfMt;
    const nextEnd = childIndex === voidChildren.length - 1
      ? dimEnd
      : (voidChildren[childIndex + 1]?._splitPosition ?? dimEnd) - halfMt;
    const newSize = nextEnd - newStart;

    this.updateChildVoidBoundsStart(childVoid, axis, newStart, newSize);

    this.markDirty();
    return true;
  }

  /**
   * Helper to update a child void's bounds size along an axis
   */
  private updateChildVoidBounds(child: VoidNode, axis: Axis, currentBounds: Bounds3D, newSize: number): void {
    const newBounds = { ...currentBounds };
    switch (axis) {
      case 'x': newBounds.w = newSize; break;
      case 'y': newBounds.h = newSize; break;
      case 'z': newBounds.d = newSize; break;
    }
    child._bounds = newBounds;
    child.markDirty();
  }

  /**
   * Helper to update a child void's bounds start position and size along an axis
   */
  private updateChildVoidBoundsStart(child: VoidNode, axis: Axis, newStart: number, newSize: number): void {
    const newBounds = { ...child._bounds };
    switch (axis) {
      case 'x':
        newBounds.x = newStart;
        newBounds.w = newSize;
        break;
      case 'y':
        newBounds.y = newStart;
        newBounds.h = newSize;
        break;
      case 'z':
        newBounds.z = newStart;
        newBounds.d = newSize;
        break;
    }
    child._bounds = newBounds;
    child.markDirty();
  }

  /**
   * Get the sub-assembly in this void (if any)
   */
  getSubAssembly(): BaseNode | null {
    return this._children.find(c => c.kind === 'sub-assembly') || null;
  }

  /**
   * Get all void children (subdivision voids)
   */
  getVoidChildren(): VoidNode[] {
    return this._children.filter(c => c.kind === 'void') as VoidNode[];
  }

  /**
   * Update child bounds when parent bounds change
   * Recalculates child bounds based on their split percentages
   */
  protected updateChildBounds(): void {
    const voidChildren = this.getVoidChildren();
    if (voidChildren.length === 0) return;

    // Collect split percentages from children (children after first have split info)
    const splitAxis = voidChildren[1]?._splitAxis;
    if (!splitAxis) return;

    const percentages: number[] = [];
    for (let i = 1; i < voidChildren.length; i++) {
      const pct = voidChildren[i]._splitPercentage;
      if (pct !== undefined) {
        percentages.push(pct);
      }
    }

    if (percentages.length === 0) return;

    // Convert percentages back to absolute positions
    const dimStart = splitAxis === 'x' ? this._bounds.x : splitAxis === 'y' ? this._bounds.y : this._bounds.z;
    const dimSize = splitAxis === 'x' ? this._bounds.w : splitAxis === 'y' ? this._bounds.h : this._bounds.d;
    const positions = percentages.map(pct => dimStart + pct * dimSize);

    // Find parent assembly to get material thickness
    let node = this.parent;
    while (node && node.kind !== 'assembly' && node.kind !== 'sub-assembly') {
      node = node.parent;
    }
    const mt = (node as any)?.material?.thickness ?? 3; // Default to 3mm

    // Clear and recreate children with new bounds
    this.clearSubdivision();
    this.subdivideMultiple(splitAxis, positions, mt);
  }

  // ==========================================================================
  // Static Tree Traversal Methods
  // ==========================================================================

  /**
   * Find a void by ID in a void tree
   */
  static find(root: VoidNode, id: string): VoidNode | null {
    if (root.id === id) return root;
    for (const child of root._children) {
      if (child.kind === 'void') {
        const found = VoidNode.find(child as VoidNode, id);
        if (found) return found;
      }
      // Also search inside sub-assembly's void structure
      if (child.kind === 'sub-assembly') {
        const subAsm = child as any;
        if (subAsm.rootVoid) {
          const found = VoidNode.find(subAsm.rootVoid, id);
          if (found) return found;
        }
      }
    }
    return null;
  }

  /**
   * Find parent of a void by ID
   */
  static findParent(root: VoidNode, id: string): VoidNode | null {
    for (const child of root._children) {
      if (child.kind === 'void') {
        if (child.id === id) return root;
        const found = VoidNode.findParent(child as VoidNode, id);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Get all void IDs in a subtree
   */
  static getSubtreeIds(root: VoidNode): string[] {
    const ids = [root.id];
    for (const child of root._children) {
      if (child.kind === 'void') {
        ids.push(...VoidNode.getSubtreeIds(child as VoidNode));
      }
    }
    return ids;
  }

  /**
   * Get ancestor IDs of a void (path from root to target, excluding target)
   */
  static getAncestorIds(root: VoidNode, targetId: string): string[] {
    const path: string[] = [];

    const findPath = (node: VoidNode, target: string): boolean => {
      if (node.id === target) return true;
      for (const child of node._children) {
        if (child.kind === 'void') {
          if (findPath(child as VoidNode, target)) {
            path.unshift(node.id);
            return true;
          }
        }
      }
      return false;
    };

    findPath(root, targetId);
    return path;
  }

  // ==========================================================================
  // Anchor Point - For alignment validation
  // ==========================================================================

  /**
   * Get the anchor point for this void
   * The anchor is at the center of the void in its local coordinate space
   * World position is computed by traversing up to the assembly
   */
  getAnchor(): VoidAnchor {
    const { x, y, z, w, h, d } = this._bounds;

    // Local point is center of bounds
    const localPoint: Point3D = {
      x: x + w / 2,
      y: y + h / 2,
      z: z + d / 2,
    };

    // World point requires finding the parent assembly and applying its transform
    // For now, assume the void is in assembly-local coordinates
    // The assembly positions voids relative to its center, so we need to offset
    const worldPoint = this.computeWorldPoint(localPoint);

    return {
      voidId: this.id,
      localPoint,
      worldPoint,
    };
  }

  /**
   * Compute world point from void-local point
   * Traverses up to find parent assembly and apply its transform
   */
  protected computeWorldPoint(localPoint: Point3D): Point3D {
    // Find parent assembly
    let node = this.parent;
    while (node && node.kind !== 'assembly' && node.kind !== 'sub-assembly') {
      node = node.parent;
    }

    if (!node) {
      // No parent assembly, return local point
      return localPoint;
    }

    // Get assembly dimensions to offset from center
    // Void bounds are in assembly-local coords starting at materialThickness
    // Assembly is centered at origin, so we need to offset by half dimensions
    const assembly = node as any; // Type assertion - we know it's an assembly
    const halfW = assembly.width / 2;
    const halfH = assembly.height / 2;
    const halfD = assembly.depth / 2;

    const [ax, ay, az] = assembly.getWorldTransform().position;

    return {
      x: ax + localPoint.x - halfW,
      y: ay + localPoint.y - halfH,
      z: az + localPoint.z - halfD,
    };
  }

  // ==========================================================================
  // Recomputation
  // ==========================================================================

  recompute(): void {
    // Recompute children
    for (const child of this._children) {
      if (child.isDirty) {
        child.recompute();
      }
    }
  }

  // ==========================================================================
  // Serialization
  // ==========================================================================

  serialize(): VoidSnapshot {
    return {
      id: this.id,
      kind: 'void',
      props: {
        splitAxis: this._splitAxis,
        splitPosition: this._splitPosition,
        splitPositionMode: this._splitPositionMode,
        splitPercentage: this._splitPercentage,
        gridSubdivision: this._gridSubdivision,
      },
      derived: {
        bounds: this.bounds,
        isLeaf: this.isLeaf,
        anchor: this.getAnchor(),
      },
      children: this._children.map(c => c.serialize()) as (VoidSnapshot | any)[],
    };
  }

  // ==========================================================================
  // Cloning
  // ==========================================================================

  /**
   * Create a deep clone of this void and all descendants
   * Note: Sub-assemblies must be cloned with reference to the cloned void
   */
  clone(): VoidNode {
    const cloned = new VoidNode({ ...this._bounds }, this.id);

    // Copy split info
    if (this._splitAxis !== undefined) {
      cloned._splitAxis = this._splitAxis;
      cloned._splitPosition = this._splitPosition;
      cloned._splitPositionMode = this._splitPositionMode;
      cloned._splitPercentage = this._splitPercentage;
    }

    // Copy cached divider panel ID - this preserves panel identity across clones
    if (this._dividerPanelId !== undefined) {
      cloned._dividerPanelId = this._dividerPanelId;
    }

    // Copy grid subdivision info
    if (this._gridSubdivision) {
      cloned._gridSubdivision = {
        axes: [...this._gridSubdivision.axes],
        positions: {},
      };
      for (const axis of this._gridSubdivision.axes) {
        const positions = this._gridSubdivision.positions[axis];
        if (positions) {
          cloned._gridSubdivision.positions[axis] = [...positions];
        }
      }
    }

    // Copy grid divider panel IDs
    if (this._gridDividerPanelIds) {
      cloned._gridDividerPanelIds = new Map(this._gridDividerPanelIds);
    }

    // Clone children (void nodes and sub-assemblies)
    for (const child of this._children) {
      if (child.kind === 'void') {
        const clonedVoid = (child as VoidNode).clone();
        cloned.addChild(clonedVoid);
      } else if (child.kind === 'sub-assembly') {
        // Sub-assemblies need special handling - they reference the parent void
        // Import dynamically to avoid circular dependency
        const subAsm = child as any; // SubAssemblyNode
        if (typeof subAsm.cloneIntoVoid === 'function') {
          const clonedSubAsm = subAsm.cloneIntoVoid(cloned);
          cloned.addChild(clonedSubAsm);
        }
      }
    }

    return cloned;
  }
}
