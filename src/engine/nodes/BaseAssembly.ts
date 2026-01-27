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
  EdgePosition,
  MaterialConfig,
  AssemblyConfig,
  LidConfig,
  FeetConfig,
  FaceConfig,
  Bounds3D,
  Transform3D,
  AssemblySnapshot,
  PanelSnapshot,
  AssemblyFingerData,
  JointConstraint,
  JointAlignmentError,
  VoidContentConstraint,
  VoidAlignmentError,
} from '../types';
import { VoidNode } from './VoidNode';
import { FacePanelNode } from './FacePanelNode';
import { calculateSubAssemblyFingerPoints } from '../../utils/fingerPoints';
import {
  startAlignmentDebug,
  addJointAlignmentError,
  pointsAligned,
  calculateDeviation,
} from '../alignmentDebug';

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

  // Cached finger point data (computed from dimensions + material)
  protected _cachedFingerData: AssemblyFingerData | null = null;

  // Cached joint registry and validation results
  protected _cachedJoints: JointConstraint[] | null = null;
  protected _cachedJointErrors: JointAlignmentError[] | null = null;
  protected _cachedVoidConstraints: VoidContentConstraint[] | null = null;
  protected _cachedVoidErrors: VoidAlignmentError[] | null = null;

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
  // Finger Point Data
  // ==========================================================================

  /**
   * Get finger point data for this assembly
   * Finger points are calculated at the assembly level and shared by all edges
   * parallel to each axis, ensuring perfect alignment between mating panels.
   */
  getFingerData(): AssemblyFingerData {
    if (!this._cachedFingerData) {
      this._cachedFingerData = this.computeFingerData();
    }
    return this._cachedFingerData;
  }

  /**
   * Compute finger point data from dimensions and material config
   */
  protected computeFingerData(): AssemblyFingerData {
    return calculateSubAssemblyFingerPoints(
      { w: this._width, h: this._height, d: this._depth },
      this._material.thickness,
      this._material.fingerWidth,
      this._material.fingerGap
    );
  }

  // ==========================================================================
  // Joint Registry - Panel-to-panel alignment validation
  // ==========================================================================

  /**
   * Get all joint constraints for this assembly (cached)
   * Also validates alignment and records any errors
   */
  getJoints(): JointConstraint[] {
    if (!this._cachedJoints) {
      this.computeAndValidateJoints();
    }
    return this._cachedJoints!;
  }

  /**
   * Get any joint alignment errors (cached)
   */
  getJointAlignmentErrors(): JointAlignmentError[] {
    if (!this._cachedJointErrors) {
      this.computeAndValidateJoints();
    }
    return this._cachedJointErrors!;
  }

  /**
   * Compute joints and validate alignment
   * Records errors to debug log if misaligned
   */
  protected computeAndValidateJoints(): void {
    startAlignmentDebug(this.id);

    const joints: JointConstraint[] = [];
    const errors: JointAlignmentError[] = [];
    const panels = this.getPanels();

    // Build a map of panels by ID for quick lookup
    const panelMap = new Map<string, PanelSnapshot>();
    for (const panel of panels) {
      panelMap.set(panel.id, panel);
    }

    // For each face panel, check each edge that mates with another face
    for (const panel of panels) {
      if (panel.kind !== 'face-panel') continue;

      const faceId = panel.props.faceId;
      const anchors = panel.derived.edgeAnchors;

      for (const anchor of anchors) {
        // Find the mating face panel
        const matingFaceId = this.getMatingFaceId(faceId, anchor.edgePosition);
        if (!matingFaceId) continue;

        const matingPanelId = `face-${matingFaceId}`;
        const matingPanel = panelMap.get(matingPanelId);
        if (!matingPanel) continue;

        // Find the corresponding anchor on the mating panel
        const matingEdge = this.getMatingEdgePosition(faceId, anchor.edgePosition, matingFaceId);
        if (!matingEdge) continue;

        const matingAnchor = matingPanel.derived.edgeAnchors.find(
          a => a.edgePosition === matingEdge
        );
        if (!matingAnchor) continue;

        // Only create joint if we haven't already created it from the other direction
        // Use consistent ordering (alphabetically by panel ID) to avoid duplicates
        const jointKey = [panel.id, matingPanelId].sort().join('-');
        const existingJoint = joints.find(j => j.id === jointKey);
        if (existingJoint) continue;

        // Determine the axis this joint runs along
        const jointAxis = this.getJointAxis(faceId, anchor.edgePosition);

        // Create the joint constraint
        const joint: JointConstraint = {
          id: jointKey,
          axis: jointAxis,
          panelAId: panel.id,
          panelAEdge: anchor.edgePosition,
          panelBId: matingPanelId,
          panelBEdge: matingEdge,
          expectedWorldPoint: anchor.worldPoint, // Use panel A's anchor as reference
        };
        joints.push(joint);

        // Validate alignment
        if (!pointsAligned(anchor.worldPoint, matingAnchor.worldPoint)) {
          const { deviation, magnitude } = calculateDeviation(
            anchor.worldPoint,
            matingAnchor.worldPoint
          );

          const error: JointAlignmentError = {
            jointId: jointKey,
            panelAId: panel.id,
            panelAEdge: anchor.edgePosition,
            panelAWorldPoint: anchor.worldPoint,
            panelBId: matingPanelId,
            panelBEdge: matingEdge,
            panelBWorldPoint: matingAnchor.worldPoint,
            deviation,
            deviationMagnitude: magnitude,
          };
          errors.push(error);
          addJointAlignmentError(error);
        }
      }
    }

    this._cachedJoints = joints;
    this._cachedJointErrors = errors;

    // Throw if there are alignment errors (enforced)
    if (errors.length > 0) {
      console.error(`Assembly ${this.id} has ${errors.length} joint alignment errors. Use alignment debug to see details.`);
    }
  }

  /**
   * Get the face that an edge of a face panel mates with
   */
  protected getMatingFaceId(faceId: FaceId, edgePosition: EdgePosition): FaceId | null {
    // Face edge adjacency map (same as in FacePanelNode)
    const adjacency: Record<FaceId, Record<EdgePosition, FaceId | null>> = {
      front: { top: 'top', bottom: 'bottom', left: 'left', right: 'right' },
      back: { top: 'top', bottom: 'bottom', left: 'right', right: 'left' },
      left: { top: 'top', bottom: 'bottom', left: 'back', right: 'front' },
      right: { top: 'top', bottom: 'bottom', left: 'front', right: 'back' },
      top: { top: 'back', bottom: 'front', left: 'left', right: 'right' },
      bottom: { top: 'front', bottom: 'back', left: 'left', right: 'right' },
    };

    const matingFaceId = adjacency[faceId][edgePosition];
    if (matingFaceId && this.isFaceSolid(matingFaceId)) {
      return matingFaceId;
    }
    return null;
  }

  /**
   * Get which edge of the mating face corresponds to an edge of a face
   */
  protected getMatingEdgePosition(
    faceId: FaceId,
    edgePosition: EdgePosition,
    matingFaceId: FaceId
  ): EdgePosition | null {
    // This maps from (face, edge) -> (mating face, mating edge)
    // e.g., front.top mates with top.bottom
    const matingEdges: Record<FaceId, Record<EdgePosition, Partial<Record<FaceId, EdgePosition>>>> = {
      front: {
        top: { top: 'bottom' },
        bottom: { bottom: 'top' },
        left: { left: 'right' },
        right: { right: 'left' },
      },
      back: {
        top: { top: 'top' },
        bottom: { bottom: 'bottom' },
        left: { right: 'left' },
        right: { left: 'right' },
      },
      left: {
        top: { top: 'left' },
        bottom: { bottom: 'left' },
        left: { back: 'right' },
        right: { front: 'left' },
      },
      right: {
        top: { top: 'right' },
        bottom: { bottom: 'right' },
        left: { front: 'right' },
        right: { back: 'left' },
      },
      top: {
        top: { back: 'top' },
        bottom: { front: 'top' },
        left: { left: 'top' },
        right: { right: 'top' },
      },
      bottom: {
        top: { front: 'bottom' },
        bottom: { back: 'bottom' },
        left: { left: 'bottom' },
        right: { right: 'bottom' },
      },
    };

    return matingEdges[faceId]?.[edgePosition]?.[matingFaceId] ?? null;
  }

  /**
   * Get the axis that a joint runs along
   */
  protected getJointAxis(faceId: FaceId, edgePosition: EdgePosition): Axis {
    // Determine axis based on which face and edge
    // Horizontal edges (top/bottom) of front/back run along X
    // Vertical edges (left/right) of front/back run along Y
    // etc.
    const jointAxes: Record<FaceId, Record<EdgePosition, Axis>> = {
      front: { top: 'x', bottom: 'x', left: 'y', right: 'y' },
      back: { top: 'x', bottom: 'x', left: 'y', right: 'y' },
      left: { top: 'z', bottom: 'z', left: 'y', right: 'y' },
      right: { top: 'z', bottom: 'z', left: 'y', right: 'y' },
      top: { top: 'x', bottom: 'x', left: 'z', right: 'z' },
      bottom: { top: 'x', bottom: 'x', left: 'z', right: 'z' },
    };
    return jointAxes[faceId][edgePosition];
  }

  // ==========================================================================
  // Void Constraints (placeholder - to be implemented)
  // ==========================================================================

  getVoidConstraints(): VoidContentConstraint[] {
    // TODO: Implement void/sub-assembly constraints
    return [];
  }

  getVoidAlignmentErrors(): VoidAlignmentError[] {
    // TODO: Implement void/sub-assembly alignment validation
    return [];
  }

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
    // Invalidate caches
    this._cachedPanels = null;
    this._cachedFingerData = null;
    this._cachedJoints = null;
    this._cachedJointErrors = null;
    this._cachedVoidConstraints = null;
    this._cachedVoidErrors = null;
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
        fingerData: this.getFingerData(),
        panels: this.getPanels(),
        joints: this.getJoints(),
        jointAlignmentErrors: this.getJointAlignmentErrors(),
        voidConstraints: this.getVoidConstraints(),
        voidAlignmentErrors: this.getVoidAlignmentErrors(),
      },
      children: [this._rootVoid.serialize()],
    };
  }
}
