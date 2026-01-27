/**
 * BaseAssembly - Abstract base for main assembly and sub-assemblies
 *
 * Shared functionality:
 * - Box dimensions (width, height, depth)
 * - Material configuration
 * - Face configurations (6 faces, solid/open)
 * - Assembly configuration (axis, lids)
 * - Interior void management
 * - Panel derivation
 *
 * Subclasses:
 * - AssemblyNode: the main/root assembly
 * - SubAssemblyNode: nested assembly within a void (drawer, tray, etc.)
 */

import { BaseNode } from './BaseNode';
import {
  Axis,
  FaceId,
  MaterialConfig,
  AssemblyConfig,
  LidConfig,
  FeetConfig,
  FaceConfig,
  Bounds3D,
  Transform3D,
  AssemblySnapshot,
  PanelSnapshot,
} from '../types';
import { VoidNode } from './VoidNode';
import { FacePanelNode } from './FacePanelNode';

const ALL_FACE_IDS: FaceId[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];

const DEFAULT_LID_CONFIG: LidConfig = {
  tabDirection: 'tabs-out',
  inset: 0,
};

const DEFAULT_ASSEMBLY_CONFIG: AssemblyConfig = {
  assemblyAxis: 'y',
  lids: {
    positive: { ...DEFAULT_LID_CONFIG },
    negative: { ...DEFAULT_LID_CONFIG },
  },
};

/**
 * Abstract base class for assembly types
 */
export abstract class BaseAssembly extends BaseNode {
  // Dimensions
  protected _width: number;
  protected _height: number;
  protected _depth: number;

  // Material
  protected _material: MaterialConfig;

  // Faces
  protected _faces: Map<FaceId, FaceConfig>;

  // Assembly config
  protected _assemblyConfig: AssemblyConfig;

  // Optional feet (main assembly only typically)
  protected _feet: FeetConfig | null = null;

  // Root void (interior space)
  protected _rootVoid: VoidNode;

  // Cached derived panels
  protected _cachedPanels: PanelSnapshot[] | null = null;

  constructor(
    width: number,
    height: number,
    depth: number,
    material: MaterialConfig,
    id?: string
  ) {
    super(id);

    this._width = width;
    this._height = height;
    this._depth = depth;
    this._material = { ...material };
    this._assemblyConfig = { ...DEFAULT_ASSEMBLY_CONFIG };

    // Initialize all faces as solid
    this._faces = new Map();
    for (const faceId of ALL_FACE_IDS) {
      this._faces.set(faceId, { id: faceId, solid: true });
    }

    // Create root void for interior space
    this._rootVoid = this.createRootVoid();
    this.addChild(this._rootVoid);
  }

  // ==========================================================================
  // Dimension Accessors
  // ==========================================================================

  get width(): number {
    return this._width;
  }

  get height(): number {
    return this._height;
  }

  get depth(): number {
    return this._depth;
  }

  setDimensions(dims: { width?: number; height?: number; depth?: number }): void {
    let changed = false;

    if (dims.width !== undefined && dims.width !== this._width) {
      this._width = dims.width;
      changed = true;
    }
    if (dims.height !== undefined && dims.height !== this._height) {
      this._height = dims.height;
      changed = true;
    }
    if (dims.depth !== undefined && dims.depth !== this._depth) {
      this._depth = dims.depth;
      changed = true;
    }

    if (changed) {
      this.updateRootVoidBounds();
      this.markDirty();
    }
  }

  // ==========================================================================
  // Material Accessors
  // ==========================================================================

  get material(): MaterialConfig {
    return { ...this._material };
  }

  setMaterial(config: Partial<MaterialConfig>): void {
    let changed = false;

    if (config.thickness !== undefined && config.thickness !== this._material.thickness) {
      this._material.thickness = config.thickness;
      changed = true;
    }
    if (config.fingerWidth !== undefined && config.fingerWidth !== this._material.fingerWidth) {
      this._material.fingerWidth = config.fingerWidth;
      changed = true;
    }
    if (config.fingerGap !== undefined && config.fingerGap !== this._material.fingerGap) {
      this._material.fingerGap = config.fingerGap;
      changed = true;
    }

    if (changed) {
      this.markDirty();
    }
  }

  // ==========================================================================
  // Face Accessors
  // ==========================================================================

  getFace(faceId: FaceId): FaceConfig {
    return { ...this._faces.get(faceId)! };
  }

  getFaces(): FaceConfig[] {
    return ALL_FACE_IDS.map(id => this.getFace(id));
  }

  isFaceSolid(faceId: FaceId): boolean {
    return this._faces.get(faceId)?.solid ?? false;
  }

  setFaceSolid(faceId: FaceId, solid: boolean): void {
    const face = this._faces.get(faceId);
    if (face && face.solid !== solid) {
      face.solid = solid;
      this.markDirty();
    }
  }

  toggleFace(faceId: FaceId): void {
    const face = this._faces.get(faceId);
    if (face) {
      face.solid = !face.solid;
      this.markDirty();
    }
  }

  // ==========================================================================
  // Assembly Config Accessors
  // ==========================================================================

  get assemblyConfig(): AssemblyConfig {
    return {
      assemblyAxis: this._assemblyConfig.assemblyAxis,
      lids: {
        positive: { ...this._assemblyConfig.lids.positive },
        negative: { ...this._assemblyConfig.lids.negative },
      },
    };
  }

  get assemblyAxis(): Axis {
    return this._assemblyConfig.assemblyAxis;
  }

  setAssemblyAxis(axis: Axis): void {
    if (this._assemblyConfig.assemblyAxis !== axis) {
      this._assemblyConfig.assemblyAxis = axis;
      this.markDirty();
    }
  }

  setLidConfig(side: 'positive' | 'negative', config: Partial<LidConfig>): void {
    const lid = this._assemblyConfig.lids[side];
    let changed = false;

    if (config.tabDirection !== undefined && config.tabDirection !== lid.tabDirection) {
      lid.tabDirection = config.tabDirection;
      changed = true;
    }
    if (config.inset !== undefined && config.inset !== lid.inset) {
      lid.inset = config.inset;
      changed = true;
    }

    if (changed) {
      this.markDirty();
    }
  }

  // ==========================================================================
  // Feet Accessors
  // ==========================================================================

  get feet(): FeetConfig | null {
    return this._feet ? { ...this._feet } : null;
  }

  setFeet(config: FeetConfig | null): void {
    this._feet = config ? { ...config } : null;
    this.markDirty();
  }

  // ==========================================================================
  // Void Management
  // ==========================================================================

  get rootVoid(): VoidNode {
    return this._rootVoid;
  }

  /**
   * Create the root void for interior space
   */
  protected createRootVoid(): VoidNode {
    const bounds = this.computeInteriorBounds();
    return new VoidNode(bounds, 'root-void');
  }

  /**
   * Update root void bounds when dimensions change
   */
  protected updateRootVoidBounds(): void {
    const bounds = this.computeInteriorBounds();
    this._rootVoid.setBounds(bounds);
  }

  /**
   * Compute the interior bounds (space inside the walls)
   */
  computeInteriorBounds(): Bounds3D {
    const mt = this._material.thickness;
    return {
      x: mt,
      y: mt,
      z: mt,
      w: this._width - 2 * mt,
      h: this._height - 2 * mt,
      d: this._depth - 2 * mt,
    };
  }

  // ==========================================================================
  // Abstract Methods
  // ==========================================================================

  /**
   * Get this assembly's transform in world space
   */
  abstract getWorldTransform(): Transform3D;

  // ==========================================================================
  // Panel Derivation
  // ==========================================================================

  /**
   * Get all panels derived from this assembly
   */
  getPanels(): PanelSnapshot[] {
    if (!this._cachedPanels) {
      this._cachedPanels = this.computePanels();
    }
    return this._cachedPanels;
  }

  /**
   * Compute all panels for this assembly
   * Includes face panels and divider panels from subdivisions
   */
  protected computePanels(): PanelSnapshot[] {
    const panels: PanelSnapshot[] = [];

    // Generate face panels
    for (const faceId of ALL_FACE_IDS) {
      const face = this._faces.get(faceId)!;
      if (face.solid) {
        // Create panel node and serialize
        const panelNode = new FacePanelNode(faceId, this);
        panels.push(panelNode.serialize());
      }
    }

    // TODO: Generate divider panels from void subdivisions

    return panels;
  }

  // ==========================================================================
  // Recomputation
  // ==========================================================================

  recompute(): void {
    this._cachedPanels = null;
    // Recompute children
    for (const child of this._children) {
      if (child.isDirty) {
        child.recompute();
      }
    }
  }

  // ==========================================================================
  // Serialization Helper
  // ==========================================================================

  protected serializeBase(kind: 'assembly' | 'sub-assembly'): AssemblySnapshot {
    return {
      id: this.id,
      kind,
      props: {
        width: this._width,
        height: this._height,
        depth: this._depth,
        material: this.material,
        assembly: this.assemblyConfig,
        faces: this.getFaces(),
        feet: this._feet ?? undefined,
      },
      derived: {
        worldTransform: this.getWorldTransform(),
        interiorBounds: this.computeInteriorBounds(),
        panels: this.getPanels(),
      },
      children: [this._rootVoid.serialize()],
    };
  }
}
