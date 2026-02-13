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
  EdgeExtensions,
  Subdivision,
  CornerKey,
  CornerFillet,
  AllCornerId,
  AllCornerFillet,
  CustomEdgePath,
  Cutout,
} from '../types';
import { VoidNode } from './VoidNode';
import { FacePanelNode } from './FacePanelNode';
import { DividerPanelNode } from './DividerPanelNode';
import { BasePanel } from './BasePanel';
import { calculateSubAssemblyFingerPoints } from '../../utils/fingerPoints';
import {
  startAlignmentDebug,
  addJointAlignmentError,
  pointsAligned,
  calculateDeviation,
} from '../alignmentDebug';
import {
  ALL_FACE_IDS,
  getAdjacentFace,
  getMatingEdge,
  getJointAxis,
} from '../../utils/faceGeometry';
import { mergeEdgePaths } from '../safeSpace';

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

  // Stored edge extensions for panels (keyed by panel ID)
  protected _panelEdgeExtensions: Map<string, EdgeExtensions> = new Map();

  // Stored corner fillets for panels (keyed by panel ID)
  protected _panelCornerFillets: Map<string, Map<CornerKey, number>> = new Map();

  // Stored all-corner fillets for panels (any corner in geometry, keyed by panel ID, then by corner ID)
  protected _panelAllCornerFillets: Map<string, Map<AllCornerId, number>> = new Map();

  // Stored custom edge paths for panels (keyed by panel ID, then by edge)
  protected _panelCustomEdgePaths: Map<string, Map<EdgePosition, CustomEdgePath>> = new Map();

  // Stored cutouts for panels (keyed by panel ID, then by cutout ID)
  protected _panelCutouts: Map<string, Map<string, Cutout>> = new Map();

  // Stored modified safe areas for panels (keyed by panel ID)
  // This is the result of boolean operations (union/difference) on the safe area
  // Used for edge path generation instead of the old merge-based custom edge paths
  protected _panelModifiedSafeAreas: Map<string, { x: number; y: number }[]> = new Map();

  // Cached finger point data (computed from dimensions + material)
  protected _cachedFingerData: AssemblyFingerData | null = null;

  // Cached face panel IDs (UUIDs preserved across clones)
  protected _facePanelIds: Map<FaceId, string> = new Map();

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

    // Validate finger parameters for the given dimensions
    this.validateFingerParameters();

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
      // Validate finger parameters for new dimensions
      this.validateFingerParameters();
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
      // Validate and constrain finger parameters
      this.validateFingerParameters();
      this.markDirty();
    }
  }

  // ==========================================================================
  // Finger Parameter Validation
  // ==========================================================================

  /**
   * Validate and constrain finger width and gap to ensure at least 3 sections
   * (finger-hole-finger pattern) can fit on the smallest edge.
   *
   * The formula for usable length is:
   *   usableLength = smallestDim - 2*MT - 2*(fingerGap * fingerWidth)
   *
   * For 3 sections: usableLength >= 3 * fingerWidth
   * Solving: smallestDim - 2*MT >= fingerWidth * (3 + 2*fingerGap)
   */
  protected validateFingerParameters(): void {
    const smallestDim = Math.min(this._width, this._height, this._depth);
    const mt = this._material.thickness;
    const maxJointLength = smallestDim - 2 * mt;

    // If the box is too small for any fingers, just return (fingers will be disabled)
    if (maxJointLength <= 0) {
      return;
    }

    // Calculate maximum finger width for current gap (ensuring 3 sections minimum)
    // usableLength = maxJointLength - 2 * (fingerGap * fingerWidth) >= 3 * fingerWidth
    // maxJointLength >= fingerWidth * (3 + 2 * fingerGap)
    // fingerWidth <= maxJointLength / (3 + 2 * fingerGap)
    const maxFingerWidthForGap = maxJointLength / (3 + 2 * this._material.fingerGap);

    // Clamp finger width if needed
    if (this._material.fingerWidth > maxFingerWidthForGap) {
      this._material.fingerWidth = Math.max(1, Math.floor(maxFingerWidthForGap * 10) / 10);
    }

    // Calculate maximum finger gap for current width (ensuring 3 sections minimum)
    // maxJointLength >= fingerWidth * (3 + 2 * fingerGap)
    // fingerGap <= (maxJointLength / fingerWidth - 3) / 2
    if (this._material.fingerWidth > 0) {
      const maxFingerGap = (maxJointLength / this._material.fingerWidth - 3) / 2;

      // Clamp finger gap if needed (minimum 0)
      if (this._material.fingerGap > maxFingerGap) {
        this._material.fingerGap = Math.max(0, Math.floor(maxFingerGap * 10) / 10);
      }
    }
  }

  /**
   * Get the constrained finger parameter limits based on current dimensions.
   * Useful for UI to show valid ranges.
   */
  getFingerParameterLimits(): { maxFingerWidth: number; maxFingerGap: number } {
    const smallestDim = Math.min(this._width, this._height, this._depth);
    const mt = this._material.thickness;
    const maxJointLength = smallestDim - 2 * mt;

    if (maxJointLength <= 0) {
      return { maxFingerWidth: 0, maxFingerGap: 0 };
    }

    // Max finger width for current gap
    const maxFingerWidth = maxJointLength / (3 + 2 * this._material.fingerGap);

    // Max finger gap for current width
    const maxFingerGap = this._material.fingerWidth > 0
      ? (maxJointLength / this._material.fingerWidth - 3) / 2
      : 0;

    return {
      maxFingerWidth: Math.max(0, maxFingerWidth),
      maxFingerGap: Math.max(0, maxFingerGap),
    };
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
  // Panel Edge Extension Management
  // ==========================================================================

  /**
   * Get edge extensions for a panel by ID
   */
  getPanelEdgeExtensions(panelId: string): EdgeExtensions {
    return this._panelEdgeExtensions.get(panelId) ?? { top: 0, bottom: 0, left: 0, right: 0 };
  }

  /**
   * Set a single edge extension for a panel
   */
  setPanelEdgeExtension(panelId: string, edge: EdgePosition, value: number): void {
    let extensions = this._panelEdgeExtensions.get(panelId);
    if (!extensions) {
      extensions = { top: 0, bottom: 0, left: 0, right: 0 };
      this._panelEdgeExtensions.set(panelId, extensions);
    }

    if (extensions[edge] !== value) {
      extensions[edge] = value;
      this.markDirty();
    }
  }

  /**
   * Set all edge extensions for a panel
   */
  setPanelEdgeExtensions(panelId: string, extensions: EdgeExtensions): void {
    this._panelEdgeExtensions.set(panelId, { ...extensions });
    this.markDirty();
  }

  // ==========================================================================
  // Panel Access
  // ==========================================================================

  /**
   * Get a face panel node for a given face ID.
   * Creates a temporary panel node with stored extensions/fillets applied.
   * Useful for querying panel properties without regenerating all panels.
   */
  getFacePanel(faceId: FaceId): FacePanelNode | null {
    const face = this._faces.get(faceId);
    if (!face?.solid) return null;

    // Get or create cached UUID for this face panel
    let panelId = this._facePanelIds.get(faceId);
    if (!panelId) {
      panelId = crypto.randomUUID();
      this._facePanelIds.set(faceId, panelId);
    }

    const panelNode = new FacePanelNode(faceId, this, panelId);

    // Apply stored edge extensions
    const storedExtensions = this._panelEdgeExtensions.get(panelNode.id)
      || this._panelEdgeExtensions.get(`face-${faceId}`);
    if (storedExtensions) {
      panelNode.setEdgeExtensions(storedExtensions);
    }

    // Apply stored corner fillets
    const storedFillets = this._panelCornerFillets.get(panelNode.id)
      || this._panelCornerFillets.get(`face-${faceId}`);
    if (storedFillets) {
      for (const [corner, radius] of storedFillets) {
        panelNode.setCornerFillet(corner, radius);
      }
    }

    // Apply stored custom edge paths
    const storedPaths = this._panelCustomEdgePaths.get(panelNode.id)
      || this._panelCustomEdgePaths.get(`face-${faceId}`);
    if (storedPaths) {
      for (const path of storedPaths.values()) {
        panelNode.setCustomEdgePath(path);
      }
    }

    // Apply edge paths from modified safe area (takes precedence - boolean operations)
    const modifiedSafeArea = this._panelModifiedSafeAreas.get(panelNode.id)
      || this._panelModifiedSafeAreas.get(`face-${faceId}`);
    if (modifiedSafeArea) {
      this.applyModifiedSafeAreaToPanel(panelNode, modifiedSafeArea);
    }

    // Apply stored cutouts
    const storedCutouts = this._panelCutouts.get(panelNode.id)
      || this._panelCutouts.get(`face-${faceId}`);
    if (storedCutouts) {
      for (const cutout of storedCutouts.values()) {
        panelNode.addCutout(cutout);
      }
    }

    return panelNode;
  }

  /**
   * Apply a modified safe area polygon directly to a panel.
   * The polygon is used as the panel outline, bypassing edge path computation.
   * This provides clean rectangular shapes from boolean operations without
   * the diagonal interpolation issues of edge path extraction.
   */
  protected applyModifiedSafeAreaToPanel(
    panelNode: BasePanel,
    modifiedSafeArea: { x: number; y: number }[]
  ): void {
    // Set the polygon directly on the panel - it will be used in computeOutline()
    panelNode.setModifiedOutlinePolygon(modifiedSafeArea);
  }

  // ==========================================================================
  // Corner Fillet Management
  // ==========================================================================

  /**
   * Get corner fillets for a panel
   */
  getPanelCornerFillets(panelId: string): CornerFillet[] {
    const filletMap = this._panelCornerFillets.get(panelId);
    if (!filletMap) return [];
    return Array.from(filletMap.entries()).map(([corner, radius]) => ({
      corner,
      radius,
    }));
  }

  /**
   * Get corner fillet radius for a specific corner
   */
  getPanelCornerFillet(panelId: string, corner: CornerKey): number {
    const filletMap = this._panelCornerFillets.get(panelId);
    return filletMap?.get(corner) ?? 0;
  }

  /**
   * Set corner fillet for a panel
   */
  setPanelCornerFillet(panelId: string, corner: CornerKey, radius: number): void {
    let filletMap = this._panelCornerFillets.get(panelId);
    if (!filletMap) {
      filletMap = new Map();
      this._panelCornerFillets.set(panelId, filletMap);
    }

    const currentRadius = filletMap.get(corner) ?? 0;
    if (currentRadius !== radius) {
      if (radius <= 0) {
        filletMap.delete(corner);
        // Clean up empty map
        if (filletMap.size === 0) {
          this._panelCornerFillets.delete(panelId);
        }
      } else {
        filletMap.set(corner, radius);
      }
      this.markDirty();
    }
  }

  /**
   * Set all corner fillets for a panel
   */
  setPanelCornerFillets(panelId: string, fillets: CornerFillet[]): void {
    const filletMap = new Map<CornerKey, number>();
    for (const { corner, radius } of fillets) {
      if (radius > 0) {
        filletMap.set(corner, radius);
      }
    }
    if (filletMap.size > 0) {
      this._panelCornerFillets.set(panelId, filletMap);
    } else {
      this._panelCornerFillets.delete(panelId);
    }
    this.markDirty();
  }

  // ==========================================================================
  // All-Corner Fillet Management (any corner in panel geometry)
  // ==========================================================================

  /**
   * Get all-corner fillets for a panel
   */
  getPanelAllCornerFillets(panelId: string): AllCornerFillet[] {
    const filletMap = this._panelAllCornerFillets.get(panelId);
    if (!filletMap) return [];
    return Array.from(filletMap.entries()).map(([cornerId, radius]) => ({
      cornerId,
      radius,
    }));
  }

  /**
   * Get all-corner fillet radius for a specific corner
   */
  getPanelAllCornerFillet(panelId: string, cornerId: AllCornerId): number {
    const filletMap = this._panelAllCornerFillets.get(panelId);
    return filletMap?.get(cornerId) ?? 0;
  }

  /**
   * Set all-corner fillet for a panel
   */
  setPanelAllCornerFillet(panelId: string, cornerId: AllCornerId, radius: number): void {
    let filletMap = this._panelAllCornerFillets.get(panelId);
    if (!filletMap) {
      filletMap = new Map();
      this._panelAllCornerFillets.set(panelId, filletMap);
    }

    const currentRadius = filletMap.get(cornerId) ?? 0;
    if (currentRadius !== radius) {
      if (radius <= 0) {
        filletMap.delete(cornerId);
        // Clean up empty map
        if (filletMap.size === 0) {
          this._panelAllCornerFillets.delete(panelId);
        }
      } else {
        filletMap.set(cornerId, radius);
      }
      this.markDirty();
    }
  }

  /**
   * Set all all-corner fillets for a panel
   */
  setPanelAllCornerFillets(panelId: string, fillets: AllCornerFillet[]): void {
    const filletMap = new Map<AllCornerId, number>();
    for (const { cornerId, radius } of fillets) {
      if (radius > 0) {
        filletMap.set(cornerId, radius);
      }
    }
    if (filletMap.size > 0) {
      this._panelAllCornerFillets.set(panelId, filletMap);
    } else {
      this._panelAllCornerFillets.delete(panelId);
    }
    this.markDirty();
  }

  // ==========================================================================
  // Custom Edge Path Management
  // ==========================================================================

  /**
   * Get custom edge paths for a panel
   */
  getPanelCustomEdgePaths(panelId: string): CustomEdgePath[] {
    const pathMap = this._panelCustomEdgePaths.get(panelId);
    if (!pathMap) return [];
    return Array.from(pathMap.values());
  }

  /**
   * Get custom edge path for a specific edge
   */
  getPanelCustomEdgePath(panelId: string, edge: EdgePosition): CustomEdgePath | null {
    const pathMap = this._panelCustomEdgePaths.get(panelId);
    return pathMap?.get(edge) ?? null;
  }

  /**
   * Set custom edge path for a panel edge.
   * If a path already exists for this edge, the new path is merged with it.
   * New modifications take precedence over existing ones in overlapping regions.
   */
  setPanelCustomEdgePath(panelId: string, path: CustomEdgePath): void {
    let pathMap = this._panelCustomEdgePaths.get(panelId);
    if (!pathMap) {
      pathMap = new Map();
      this._panelCustomEdgePaths.set(panelId, pathMap);
    }

    // Check if there's an existing path for this edge
    const existing = pathMap.get(path.edge);
    if (existing) {
      // Merge the paths - new modifications take precedence
      const merged = mergeEdgePaths(existing, path);
      pathMap.set(path.edge, merged);
    } else {
      pathMap.set(path.edge, path);
    }

    this.markDirty();
  }

  /**
   * Clear custom edge path for a panel edge
   */
  clearPanelCustomEdgePath(panelId: string, edge: EdgePosition): void {
    const pathMap = this._panelCustomEdgePaths.get(panelId);
    if (pathMap?.has(edge)) {
      pathMap.delete(edge);
      // Clean up empty map
      if (pathMap.size === 0) {
        this._panelCustomEdgePaths.delete(panelId);
      }
      this.markDirty();
    }
  }

  // ==========================================================================
  // Cutouts
  // ==========================================================================

  /**
   * Get all cutouts for a panel
   */
  getPanelCutouts(panelId: string): Cutout[] {
    const cutoutMap = this._panelCutouts.get(panelId);
    if (!cutoutMap) return [];
    return Array.from(cutoutMap.values());
  }

  /**
   * Get a specific cutout by ID
   */
  getPanelCutout(panelId: string, cutoutId: string): Cutout | null {
    const cutoutMap = this._panelCutouts.get(panelId);
    return cutoutMap?.get(cutoutId) ?? null;
  }

  /**
   * Add a cutout to a panel
   */
  addPanelCutout(panelId: string, cutout: Cutout): void {
    let cutoutMap = this._panelCutouts.get(panelId);
    if (!cutoutMap) {
      cutoutMap = new Map();
      this._panelCutouts.set(panelId, cutoutMap);
    }
    cutoutMap.set(cutout.id, cutout);
    this.markDirty();
  }

  /**
   * Update a cutout on a panel
   */
  updatePanelCutout(panelId: string, cutoutId: string, updates: Partial<Omit<Cutout, 'id' | 'type'>>): void {
    const cutoutMap = this._panelCutouts.get(panelId);
    const existing = cutoutMap?.get(cutoutId);
    if (existing) {
      // Merge updates into the existing cutout
      const updated = { ...existing, ...updates } as Cutout;
      cutoutMap!.set(cutoutId, updated);
      this.markDirty();
    }
  }

  /**
   * Delete a cutout from a panel
   */
  deletePanelCutout(panelId: string, cutoutId: string): void {
    const cutoutMap = this._panelCutouts.get(panelId);
    if (cutoutMap?.has(cutoutId)) {
      cutoutMap.delete(cutoutId);
      // Clean up empty map
      if (cutoutMap.size === 0) {
        this._panelCutouts.delete(panelId);
      }
      this.markDirty();
    }
  }

  // ==========================================================================
  // Modified Safe Area Management (Boolean-based edge operations)
  // ==========================================================================

  /**
   * Get the modified safe area for a panel (if any).
   * Returns null if no boolean operations have been applied.
   */
  getModifiedSafeArea(panelId: string): { x: number; y: number }[] | null {
    return this._panelModifiedSafeAreas.get(panelId) ?? null;
  }

  /**
   * Set the modified safe area for a panel.
   * This replaces any previous modified safe area.
   */
  setModifiedSafeArea(panelId: string, polygon: { x: number; y: number }[]): void {
    this._panelModifiedSafeAreas.set(panelId, polygon.map(p => ({ x: p.x, y: p.y })));
    this.markDirty();
  }

  /**
   * Clear the modified safe area for a panel (revert to default).
   */
  clearModifiedSafeArea(panelId: string): void {
    if (this._panelModifiedSafeAreas.has(panelId)) {
      this._panelModifiedSafeAreas.delete(panelId);
      this.markDirty();
    }
  }

  /**
   * Check if a panel has a modified safe area.
   */
  hasModifiedSafeArea(panelId: string): boolean {
    return this._panelModifiedSafeAreas.has(panelId);
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
    return new VoidNode(bounds, 'root');
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

  /**
   * Get all subdivisions from the void tree
   * Used for slot hole generation in face panels
   */
  getSubdivisions(): Subdivision[] {
    const subdivisions: Subdivision[] = [];

    const traverse = (node: VoidNode, parentBounds: Bounds3D) => {
      // Check for grid subdivisions first
      if (node.gridSubdivision) {
        // Grid subdivisions: all dividers span the full parent void bounds
        for (const axis of node.gridSubdivision.axes) {
          const positions = node.gridSubdivision.positions[axis];
          if (positions) {
            for (const position of positions) {
              subdivisions.push({
                id: `${node.id}-grid-${axis}-${position}`,
                axis,
                position,
                bounds: node.bounds, // Use the grid parent's full bounds
                ownerBounds: node.bounds, // Grid dividers span the full parent void
              });
            }
          }
        }
      }

      // Check for regular subdivisions (nested single-axis)
      if (node.splitAxis && node.splitPosition !== undefined) {
        subdivisions.push({
          id: node.id + '-split',
          axis: node.splitAxis,
          position: node.splitPosition,
          bounds: parentBounds,
          ownerBounds: parentBounds, // The parent void that was subdivided
        });
      }

      // Recurse into void children
      for (const child of node.getVoidChildren()) {
        traverse(child, node.bounds);
      }
    };

    // Start traversal from root void itself (not just its children)
    // This ensures the root void's split is included
    traverse(this._rootVoid, this._rootVoid.bounds);

    return subdivisions;
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
        const matingFaceId = this.getMatingFaceIdForEdge(faceId, anchor.edgePosition);
        if (!matingFaceId) continue;

        const matingPanelId = `face-${matingFaceId}`;
        const matingPanel = panelMap.get(matingPanelId);
        if (!matingPanel) continue;

        // Find the corresponding anchor on the mating panel
        const matingEdge = this.getMatingEdgePositionForJoint(faceId, anchor.edgePosition, matingFaceId);

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
        const jointAxis = this.getJointAxisForEdge(faceId, anchor.edgePosition);

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
  protected getMatingFaceIdForEdge(faceId: FaceId, edgePosition: EdgePosition): FaceId | null {
    const matingFaceId = getAdjacentFace(faceId, edgePosition);
    if (this.isFaceSolid(matingFaceId)) {
      return matingFaceId;
    }
    return null;
  }

  /**
   * Get which edge of the mating face corresponds to an edge of a face
   */
  protected getMatingEdgePositionForJoint(
    faceId: FaceId,
    edgePosition: EdgePosition,
    _matingFaceId: FaceId
  ): EdgePosition {
    // The mating edge is determined by the source face and edge position
    return getMatingEdge(faceId, edgePosition);
  }

  /**
   * Get the axis that a joint runs along
   */
  protected getJointAxisForEdge(faceId: FaceId, edgePosition: EdgePosition): Axis {
    return getJointAxis(faceId, edgePosition);
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

    // Generate face panels with cached UUIDs
    for (const faceId of ALL_FACE_IDS) {
      const face = this._faces.get(faceId)!;
      if (face.solid) {
        // Get or create cached UUID for this face panel
        let panelId = this._facePanelIds.get(faceId);
        if (!panelId) {
          panelId = crypto.randomUUID();
          this._facePanelIds.set(faceId, panelId);
        }
        const panelNode = new FacePanelNode(faceId, this, panelId);

        // Apply stored edge extensions (check both UUID and legacy face-{faceId} key)
        const storedExtensions = this._panelEdgeExtensions.get(panelNode.id)
          || this._panelEdgeExtensions.get(`face-${faceId}`);
        if (storedExtensions) {
          panelNode.setEdgeExtensions(storedExtensions);
        }

        // Apply stored corner fillets (old 4-corner system)
        const storedFillets = this._panelCornerFillets.get(panelNode.id)
          || this._panelCornerFillets.get(`face-${faceId}`);
        if (storedFillets) {
          for (const [corner, radius] of storedFillets) {
            panelNode.setCornerFillet(corner, radius);
          }
        }

        // Apply stored all-corner fillets (new all-corners system)
        const storedAllCornerFillets = this._panelAllCornerFillets.get(panelNode.id)
          || this._panelAllCornerFillets.get(`face-${faceId}`);
        if (storedAllCornerFillets) {
          for (const [cornerId, radius] of storedAllCornerFillets) {
            panelNode.setAllCornerFillet(cornerId, radius);
          }
        }

        // Apply stored custom edge paths
        const storedPaths = this._panelCustomEdgePaths.get(panelNode.id)
          || this._panelCustomEdgePaths.get(`face-${faceId}`);
        if (storedPaths) {
          for (const path of storedPaths.values()) {
            panelNode.setCustomEdgePath(path);
          }
        }

        // Apply edge paths from modified safe area (takes precedence - boolean operations)
        const modifiedSafeArea = this._panelModifiedSafeAreas.get(panelNode.id)
          || this._panelModifiedSafeAreas.get(`face-${faceId}`);
        if (modifiedSafeArea) {
          this.applyModifiedSafeAreaToPanel(panelNode, modifiedSafeArea);
        }

        // Apply stored cutouts
        const storedCutouts = this._panelCutouts.get(panelNode.id)
          || this._panelCutouts.get(`face-${faceId}`);
        if (storedCutouts) {
          for (const cutout of storedCutouts.values()) {
            panelNode.addCutout(cutout);
          }
        }

        panels.push(panelNode.serialize());
      }
    }

    // Generate divider panels from void subdivisions
    this.collectDividerPanels(this._rootVoid, panels);

    // Collect panels from sub-assemblies in voids
    this.collectSubAssemblyPanels(this._rootVoid, panels);

    return panels;
  }

  /**
   * Recursively collect panels from sub-assemblies in void tree
   */
  protected collectSubAssemblyPanels(voidNode: VoidNode, panels: PanelSnapshot[]): void {
    // Check if this void has a sub-assembly
    const subAssembly = voidNode.getSubAssembly();
    if (subAssembly && subAssembly.kind === 'sub-assembly') {
      // Sub-assembly should have a getPanels method (via BaseAssembly)
      const subAssemblyNode = subAssembly as BaseAssembly;
      const subPanels = subAssemblyNode.getPanels();

      // Prefix sub-assembly panel IDs to avoid conflicts
      for (const panel of subPanels) {
        panels.push(panel);
      }
    }

    // Recurse into void children
    for (const child of voidNode.getVoidChildren()) {
      this.collectSubAssemblyPanels(child, panels);
    }
  }

  /**
   * Recursively collect divider panels from void tree
   */
  protected collectDividerPanels(voidNode: VoidNode, panels: PanelSnapshot[]): void {
    // Check for grid subdivisions first
    if (voidNode.gridSubdivision) {
      // Grid subdivisions: create full-spanning dividers from the grid parent's bounds
      for (const axis of voidNode.gridSubdivision.axes) {
        const positions = voidNode.gridSubdivision.positions[axis];
        if (positions) {
          for (const position of positions) {
            // Use cached panel ID if available (preserves identity across scene clones)
            const cachedId = voidNode.getGridDividerPanelId(axis, position);
            const dividerNode = new DividerPanelNode(voidNode, axis, position, cachedId);

            // Cache the panel ID for future clones
            if (!cachedId) {
              voidNode.setGridDividerPanelId(axis, position, dividerNode.id);
            }

            // Apply stored edge extensions
            const storedExtensions = this._panelEdgeExtensions.get(dividerNode.id);
            if (storedExtensions) {
              dividerNode.setEdgeExtensions(storedExtensions);
            }

            // Apply stored corner fillets (old 4-corner system)
            const storedFillets = this._panelCornerFillets.get(dividerNode.id);
            if (storedFillets) {
              for (const [corner, radius] of storedFillets) {
                dividerNode.setCornerFillet(corner, radius);
              }
            }

            // Apply stored all-corner fillets (new all-corners system)
            const storedAllCornerFillets = this._panelAllCornerFillets.get(dividerNode.id);
            if (storedAllCornerFillets) {
              for (const [cornerId, radius] of storedAllCornerFillets) {
                dividerNode.setAllCornerFillet(cornerId, radius);
              }
            }

            panels.push(dividerNode.serialize());
          }
        }
      }

      // Recurse into grid cell children (they may have nested subdivisions)
      for (const child of voidNode.getVoidChildren()) {
        this.collectDividerPanels(child, panels);
      }
      return;
    }

    // Regular subdivision handling
    const voidChildren = voidNode.getVoidChildren();

    if (voidChildren.length === 0) {
      // Leaf void - no dividers
      return;
    }

    // Each pair of adjacent children creates a divider panel
    // The divider info (axis, position) is stored on children with index >= 1
    for (let i = 1; i < voidChildren.length; i++) {
      const child = voidChildren[i];
      const splitAxis = child.splitAxis;
      const splitPosition = child.splitPosition;

      if (splitAxis && splitPosition !== undefined) {
        // Create divider panel - uses parent voidNode for bounds
        // Use cached panel ID if available (preserves identity across scene clones)
        // Otherwise generate a new UUID and cache it
        const cachedId = child.dividerPanelId;
        const dividerNode = new DividerPanelNode(voidNode, splitAxis, splitPosition, cachedId);

        // Cache the panel ID on the void for future clones
        if (!cachedId) {
          child.dividerPanelId = dividerNode.id;
        }

        // Apply stored edge extensions
        const storedExtensions = this._panelEdgeExtensions.get(dividerNode.id);
        if (storedExtensions) {
          dividerNode.setEdgeExtensions(storedExtensions);
        }

        // Apply stored corner fillets (old 4-corner system)
        const storedFillets = this._panelCornerFillets.get(dividerNode.id);
        if (storedFillets) {
          for (const [corner, radius] of storedFillets) {
            dividerNode.setCornerFillet(corner, radius);
          }
        }

        // Apply stored all-corner fillets (new all-corners system)
        const storedAllCornerFillets = this._panelAllCornerFillets.get(dividerNode.id);
        if (storedAllCornerFillets) {
          for (const [cornerId, radius] of storedAllCornerFillets) {
            dividerNode.setAllCornerFillet(cornerId, radius);
          }
        }

        panels.push(dividerNode.serialize());
      }
    }

    // Recurse into children
    for (const child of voidChildren) {
      this.collectDividerPanels(child, panels);
    }
  }

  // ==========================================================================
  // Dirty Tracking Override
  // ==========================================================================

  /**
   * Override markDirty to also invalidate panel cache.
   * This ensures panels are recomputed when edge extensions change.
   */
  override markDirty(): void {
    super.markDirty();
    // Invalidate panel cache so getPanels() recomputes with new values
    this._cachedPanels = null;
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

  // ==========================================================================
  // Cloning - Base Helper
  // ==========================================================================

  /**
   * Copy base assembly properties to a target assembly
   * Used by subclass clone() implementations
   */
  protected copyBasePropertiesTo(target: BaseAssembly): void {
    // Copy assembly config
    target._assemblyConfig = {
      assemblyAxis: this._assemblyConfig.assemblyAxis,
      lids: {
        positive: { ...this._assemblyConfig.lids.positive },
        negative: { ...this._assemblyConfig.lids.negative },
      },
    };

    // Copy faces
    target._faces = new Map();
    for (const [faceId, config] of this._faces) {
      target._faces.set(faceId, { ...config });
    }

    // Copy feet
    target._feet = this._feet ? { ...this._feet } : null;

    // Copy panel edge extensions
    target._panelEdgeExtensions = new Map();
    for (const [panelId, extensions] of this._panelEdgeExtensions) {
      target._panelEdgeExtensions.set(panelId, { ...extensions });
    }

    // Copy panel corner fillets
    target._panelCornerFillets = new Map();
    for (const [panelId, filletMap] of this._panelCornerFillets) {
      target._panelCornerFillets.set(panelId, new Map(filletMap));
    }

    // Copy panel all-corner fillets
    target._panelAllCornerFillets = new Map();
    for (const [panelId, filletMap] of this._panelAllCornerFillets) {
      target._panelAllCornerFillets.set(panelId, new Map(filletMap));
    }

    // Copy custom edge paths
    target._panelCustomEdgePaths = new Map();
    for (const [panelId, pathMap] of this._panelCustomEdgePaths) {
      target._panelCustomEdgePaths.set(panelId, new Map(pathMap));
    }

    // Copy cutouts
    target._panelCutouts = new Map();
    for (const [panelId, cutoutMap] of this._panelCutouts) {
      target._panelCutouts.set(panelId, new Map(cutoutMap));
    }

    // Copy modified safe areas
    target._panelModifiedSafeAreas = new Map();
    for (const [panelId, polygon] of this._panelModifiedSafeAreas) {
      target._panelModifiedSafeAreas.set(panelId, polygon.map(p => ({ x: p.x, y: p.y })));
    }

    // Copy face panel IDs (preserve UUIDs across clones)
    target._facePanelIds = new Map();
    for (const [faceId, panelId] of this._facePanelIds) {
      target._facePanelIds.set(faceId, panelId);
    }
  }

  /**
   * Abstract clone method - must be implemented by subclasses
   */
  abstract clone(): BaseAssembly;
}
