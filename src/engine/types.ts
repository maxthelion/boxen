/**
 * Engine Types - Snapshot interfaces for serialization
 *
 * These are plain data types that React will render.
 * No methods, no class instances - only serializable data.
 */

// =============================================================================
// Core Types
// =============================================================================

export type NodeKind =
  | 'scene'
  | 'assembly'
  | 'sub-assembly'
  | 'void'
  | 'face-panel'
  | 'divider-panel';

export type Axis = 'x' | 'y' | 'z';

export type FaceId = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export type EdgePosition = 'top' | 'bottom' | 'left' | 'right';

/**
 * Edge status for inset/outset operations
 * - locked: male joint (tabs out), cannot modify
 * - outward-only: female joint (slots), can extend outward only
 * - unlocked: open face (straight edge), can extend or retract
 */
export type EdgeStatus = 'locked' | 'outward-only' | 'unlocked';

/**
 * Edge status info for a panel edge
 */
export interface EdgeStatusInfo {
  position: EdgePosition;
  status: EdgeStatus;
  adjacentFaceId?: FaceId;
}

// =============================================================================
// Corner Types - For fillet/chamfer operations
// =============================================================================

/**
 * Corner key identifies a corner by its two adjacent edges.
 * Format: "edge1:edge2" where edges are sorted alphabetically.
 * This is stable regardless of panel orientation in 3D space.
 */
export type CornerKey = 'bottom:left' | 'bottom:right' | 'left:top' | 'right:top';

/** All corner keys in standard order */
export const ALL_CORNERS: CornerKey[] = ['bottom:left', 'bottom:right', 'left:top', 'right:top'];

/**
 * Get the two edges that meet at a corner
 */
export function getCornerEdges(corner: CornerKey): [EdgePosition, EdgePosition] {
  const [e1, e2] = corner.split(':') as [EdgePosition, EdgePosition];
  return [e1, e2];
}

/**
 * Create a corner key from two edges (order doesn't matter)
 */
export function makeCornerKey(edge1: EdgePosition, edge2: EdgePosition): CornerKey {
  const sorted = [edge1, edge2].sort();
  return `${sorted[0]}:${sorted[1]}` as CornerKey;
}

/**
 * Corner eligibility info for fillet operations
 */
export interface CornerEligibility {
  corner: CornerKey;
  eligible: boolean;
  reason?: 'no-free-length' | 'below-minimum';
  maxRadius: number;  // 0 if not eligible
  freeLength1: number;  // Free length on first edge
  freeLength2: number;  // Free length on second edge
}

/**
 * Corner fillet configuration
 */
export interface CornerFillet {
  corner: CornerKey;
  radius: number;  // mm, must be >= 1 and <= maxRadius
}

// =============================================================================
// All Corners Types - For batch fillet on ANY corner in geometry
// =============================================================================

/**
 * Location type for corners - outline or hole
 */
export type AllCornerLocation = 'outline' | 'hole';

/**
 * Corner type based on angle
 */
export type AllCornerType = 'convex' | 'concave';

/**
 * All-corner ID format (within a panel):
 * - Outline corners: "outline:index" (e.g., "outline:5")
 * - Hole corners: "hole:holeId:index" (e.g., "hole:cutout-1:2")
 */
export type AllCornerId = string;

/**
 * Full corner key including panel ID
 * Format: "panelId:outline:index" or "panelId:hole:holeId:index"
 */
export type AllCornerKey = string;

/**
 * Eligibility info for any corner in panel geometry
 */
export interface AllCornerEligibility {
  /** Corner ID within the panel */
  id: AllCornerId;
  /** Location type */
  location: AllCornerLocation;
  /** For holes, the hole ID */
  holeId?: string;
  /** Index in the path points array */
  pathIndex: number;
  /** 2D position */
  position: Point2D;
  /** Interior angle in radians */
  angle: number;
  /** Corner type */
  type: AllCornerType;
  /** Whether eligible for filleting */
  eligible: boolean;
  /** Reason for ineligibility */
  reason?: 'forbidden-area' | 'mechanical-joint' | 'too-small' | 'near-other-fillet';
  /** Maximum fillet radius */
  maxRadius: number;
}

/**
 * All-corner fillet configuration
 */
export interface AllCornerFillet {
  /** Corner ID (outline:index or hole:holeId:index) */
  cornerId: AllCornerId;
  /** Fillet radius in mm */
  radius: number;
}

// =============================================================================
// Geometry Types
// =============================================================================

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface Bounds3D {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
}

export interface Transform3D {
  position: [number, number, number];
  rotation: [number, number, number];
}

export interface EdgeExtensions {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

// =============================================================================
// Custom Edge Path Types - User-defined edge geometry
// =============================================================================

/**
 * A point on a custom edge path.
 * Coordinates are relative to the edge:
 * - t: normalized position along the edge (0 = start corner, 1 = end corner)
 * - offset: perpendicular distance from the edge (positive = outward, negative = inward)
 */
export interface EdgePathPoint {
  t: number;      // 0-1 normalized position along edge
  offset: number; // mm, perpendicular offset from edge line
}

/**
 * Custom edge path for panel edge customization.
 * Replaces the default straight edge with a user-defined polyline.
 *
 * Storage: One CustomEdgePath per edge. Multiple drawing operations
 * merge into the same path (straight segments fill gaps between modifications).
 */
export interface CustomEdgePath {
  /** Which edge this path applies to */
  edge: EdgePosition;
  /**
   * Base perpendicular offset from the joint face for the entire path.
   * - For edges with joints: minimum = material thickness (MT)
   * - For open edges with extension: minimum = 0
   * - Positive values = outward (unlimited, for feet/decorative extensions)
   * - Negative values = inward (limited by safe space depth)
   * Default: 0
   */
  baseOffset: number;
  /**
   * Path points from start to end of edge.
   * Point offsets are relative to baseOffset.
   */
  points: EdgePathPoint[];
  /**
   * Whether to mirror the path around the edge center.
   * When true, only define points from t=0 to t=0.5, and the path
   * will be automatically mirrored for the second half.
   * Default: true
   */
  mirrored: boolean;
  /**
   * Optional fillet radii at interior vertices.
   * Index corresponds to point index (excluding endpoints).
   * Fillets are applied after mirroring if mirrored=true.
   */
  fillets?: number[];
}

// =============================================================================
// Panel Cutouts
// =============================================================================

/**
 * Base properties for all cutout shapes.
 * Cutouts are holes cut into the panel body within the safe space.
 * When mode is 'additive', the shape extends the panel boundary instead.
 */
export interface CutoutBase {
  /** Unique identifier for this cutout */
  id: string;
  /** Center position in panel coordinates (origin at panel center) */
  center: { x: number; y: number };
  /**
   * Whether this shape subtracts from (hole) or adds to (extension) the panel.
   * - 'subtractive': Creates a hole in the panel (default)
   * - 'additive': Extends the panel boundary outward (only valid on open edges)
   */
  mode?: 'additive' | 'subtractive';
}

/**
 * Rectangular cutout shape.
 * Defined by center point and dimensions.
 */
export interface RectCutout extends CutoutBase {
  type: 'rect';
  /** Width of the rectangle (mm) */
  width: number;
  /** Height of the rectangle (mm) */
  height: number;
  /** Optional corner radius for rounded rectangles (mm) */
  cornerRadius?: number;
}

/**
 * Circular cutout shape.
 * Defined by center point and radius.
 */
export interface CircleCutout extends CutoutBase {
  type: 'circle';
  /** Radius of the circle (mm) */
  radius: number;
}

/**
 * Polygon/path cutout shape.
 * Defined by a series of points forming a closed path.
 */
export interface PathCutout extends CutoutBase {
  type: 'path';
  /** Points relative to center, forming a closed polygon */
  points: Array<{ x: number; y: number }>;
}

/**
 * Union type for all cutout shapes.
 */
export type Cutout = RectCutout | CircleCutout | PathCutout;

// =============================================================================
// Subdivisions
// =============================================================================

/**
 * Subdivision info for slot hole generation
 * Represents where a divider panel intersects void space
 */
export interface Subdivision {
  id: string;           // Unique ID for this subdivision
  axis: Axis;           // Axis perpendicular to the divider (x, y, or z)
  position: number;     // World coordinate position of the divider
  bounds: Bounds3D;     // Bounds of the void containing this divider
}

/**
 * Grid subdivision info for multi-axis subdivision
 * Stores the configuration for a grid of dividers on 1-2 axes
 */
export interface GridSubdivisionInfo {
  /** Axes that have been subdivided (1 or 2) */
  axes: Axis[];
  /** Split positions for each axis */
  positions: Partial<Record<Axis, number[]>>;
}

/**
 * Cross-lap slot for intersecting dividers
 * A rectangular notch cut from the panel edge that interlocks with another divider
 */
export interface CrossLapSlot {
  /** Position along the panel width (local X coordinate, centered at 0) */
  xPosition: number;
  /** Width of the slot (material thickness) */
  width: number;
  /** Depth of the slot (half the panel height) */
  depth: number;
  /** Which edge the slot is cut from */
  fromEdge: 'top' | 'bottom';
  /** ID of the intersecting divider (for debugging) */
  intersectingDividerId: string;
}

// =============================================================================
// Configuration Types (Input Properties)
// =============================================================================

export interface MaterialConfig {
  thickness: number;
  fingerWidth: number;
  fingerGap: number;
}

export interface LidConfig {
  tabDirection: 'tabs-in' | 'tabs-out';
  inset: number;
}

export interface AssemblyConfig {
  assemblyAxis: Axis;
  lids: {
    positive: LidConfig;
    negative: LidConfig;
  };
}

export interface FeetConfig {
  enabled: boolean;
  height: number;
  width: number;
  inset: number;
  gap: number;
}

export interface FaceConfig {
  id: FaceId;
  solid: boolean;
}

// =============================================================================
// Finger Joint Types - Assembly-level finger point calculation
// =============================================================================

/**
 * Finger points for one axis
 * Points are transition positions where fingers start/end
 */
export interface AxisFingerPoints {
  axis: Axis;
  points: number[];           // Transition positions along axis (from negative end after MT inset)
  innerOffset: number;        // Distance from MT-inset edge to first finger transition
  fingerLength: number;       // Actual finger/hole length used (may differ from config due to remainder distribution)
  maxJointLength: number;     // axis_length - 2*MT
}

/**
 * Assembly-level finger configuration
 * Each assembly computes finger points for all 3 axes
 * Panels derive their finger patterns from these shared points
 */
export interface AssemblyFingerData {
  x: AxisFingerPoints;
  y: AxisFingerPoints;
  z: AxisFingerPoints;
}

/**
 * Joint gender - determines tab/slot direction
 */
export type JointGender = 'male' | 'female';

/**
 * Edge joint specification - how one edge connects to another
 */
export interface EdgeJoint {
  axis: Axis;                 // Which axis the joint is along
  gender: JointGender;        // Male (tabs out) or female (slots)
  startPos: number;           // Start position along axis (after MT inset)
  endPos: number;             // End position along axis
}

// =============================================================================
// Anchor Types - Reference points for alignment validation
// =============================================================================

/**
 * An anchor point on a panel edge.
 * Located at the center of the mating edge.
 * Used to verify panels align correctly in world space.
 */
export interface EdgeAnchor {
  edgePosition: EdgePosition;      // Which edge this anchor is on
  localPoint: Point2D;             // Point in panel's local 2D coordinate space
  worldPoint: Point3D;             // Computed world position after transform
}

/**
 * A joint constraint between two panels.
 * Both panels must have anchors at the same world-space point.
 */
export interface JointConstraint {
  id: string;                      // Unique identifier for this joint
  axis: Axis;                      // The axis along which the joint runs
  panelAId: string;
  panelAEdge: EdgePosition;
  panelBId: string;
  panelBEdge: EdgePosition;
  expectedWorldPoint: Point3D;     // Where both anchors should be
}

/**
 * A joint alignment error - anchors don't match
 */
export interface JointAlignmentError {
  jointId: string;
  panelAId: string;
  panelAEdge: EdgePosition;
  panelAWorldPoint: Point3D;
  panelBId: string;
  panelBEdge: EdgePosition;
  panelBWorldPoint: Point3D;
  deviation: Point3D;              // Difference between the two points
  deviationMagnitude: number;      // Distance between points
}

/**
 * An anchor point for void/sub-assembly alignment.
 * Ensures child elements are correctly positioned within parents.
 */
export interface VoidAnchor {
  voidId: string;
  localPoint: Point3D;             // Point in void's local coordinate space
  worldPoint: Point3D;             // Computed world position
}

/**
 * Constraint between a void and its contents (sub-assembly or child void)
 */
export interface VoidContentConstraint {
  id: string;
  parentVoidId: string;
  parentAnchor: Point3D;           // Parent's reference point (world space)
  childId: string;                 // Sub-assembly or child void ID
  childType: 'sub-assembly' | 'void';
  childAnchor: Point3D;            // Child's reference point (world space)
}

/**
 * Void alignment error - child not positioned correctly in parent
 */
export interface VoidAlignmentError {
  constraintId: string;
  parentVoidId: string;
  parentWorldPoint: Point3D;
  childId: string;
  childType: 'sub-assembly' | 'void';
  childWorldPoint: Point3D;
  deviation: Point3D;
  deviationMagnitude: number;
}

// =============================================================================
// Panel Types
// =============================================================================

export interface PanelEdge {
  position: EdgePosition;
  hasTabs: boolean;
  meetsFaceId: FaceId | null;
  meetsDividerId: string | null;
}

export interface PanelHole {
  id: string;
  path: Point2D[];
  source: {
    type: 'divider-slot' | 'sub-assembly-slot' | 'extension-slot' | 'cutout' | 'custom';
    sourceId?: string;  // For cutouts, this is the cutout ID
  };
}

export interface PanelOutline {
  points: Point2D[];
  holes: PanelHole[];
}

// =============================================================================
// Snapshot Types - What React renders
// =============================================================================

/**
 * Base snapshot interface - all nodes serialize to this shape
 */
export interface BaseSnapshot {
  id: string;
  kind: NodeKind;
  children: BaseSnapshot[];
}

/**
 * Scene snapshot - root of the tree
 */
export interface SceneSnapshot extends BaseSnapshot {
  kind: 'scene';
  children: AssemblySnapshot[];
}

/**
 * Assembly snapshot - a box with faces and interior voids
 * Used for both main assembly and sub-assemblies
 */
export interface AssemblySnapshot extends BaseSnapshot {
  kind: 'assembly' | 'sub-assembly';

  // Input properties
  props: {
    width: number;
    height: number;
    depth: number;
    material: MaterialConfig;
    assembly: AssemblyConfig;
    faces: FaceConfig[];
    feet?: FeetConfig;
    // Sub-assembly specific
    clearance?: number;
    parentVoidId?: string;
    positionOffset?: { x: number; y: number; z: number };
  };

  // Derived properties
  derived: {
    worldTransform: Transform3D;
    interiorBounds: Bounds3D;
    // Finger points for this assembly (panels derive finger patterns from this)
    fingerData: AssemblyFingerData;
    // Panels are derived from the assembly configuration
    panels: PanelSnapshot[];
    // Joint registry - all panel-to-panel connections with their anchor points
    joints: JointConstraint[];
    // Any alignment errors detected (should be empty if everything is correct)
    jointAlignmentErrors: JointAlignmentError[];
    // Void content constraints (sub-assemblies and child voids)
    voidConstraints: VoidContentConstraint[];
    // Void alignment errors
    voidAlignmentErrors: VoidAlignmentError[];
  };

  // Children are voids (interior spaces)
  children: VoidSnapshot[];
}

/**
 * Void snapshot - interior space that can be subdivided or contain sub-assembly
 */
export interface VoidSnapshot extends BaseSnapshot {
  kind: 'void';

  props: {
    // If this void was created by subdivision
    splitAxis?: Axis;
    splitPosition?: number;
    splitPositionMode?: 'absolute' | 'percentage';
    splitPercentage?: number;
    // If this void has a grid subdivision (multi-axis)
    gridSubdivision?: GridSubdivisionInfo;
  };

  derived: {
    bounds: Bounds3D;
    isLeaf: boolean;
    // Anchor point for alignment validation (center of void in world space)
    anchor: VoidAnchor;
  };

  // Children are either more voids (subdivisions) or a sub-assembly
  children: (VoidSnapshot | AssemblySnapshot)[];
}

/**
 * Base panel snapshot - shared between face and divider panels
 * Panels are leaf nodes (no children)
 */
export interface BasePanelSnapshot extends BaseSnapshot {
  // Input properties
  props: {
    edgeExtensions: EdgeExtensions;
    cornerFillets: CornerFillet[];  // Corner fillet configurations (4 outer corners)
    allCornerFillets: AllCornerFillet[];  // All corner fillets (any corner in geometry)
    customEdgePaths: CustomEdgePath[];  // User-defined edge geometry
    cutouts: Cutout[];  // Interior cutout shapes (holes)
    visible: boolean;
  };
  // Panels never have children
  children: [];

  // Derived properties - computed from assembly/void state
  derived: {
    // 2D geometry
    width: number;
    height: number;
    thickness: number;
    outline: PanelOutline;
    edges: PanelEdge[];

    // 3D placement
    worldTransform: Transform3D;

    // Edge anchors for alignment validation
    // Each anchor is at the center of the mating edge
    edgeAnchors: EdgeAnchor[];

    // Edge statuses for inset/outset tool
    // Determines which edges can be modified
    edgeStatuses: EdgeStatusInfo[];

    // Corner eligibility for fillet tool (4 outer corners only)
    // Determines which corners can be filleted and max radius
    cornerEligibility: CornerEligibility[];

    // All corner eligibility (any corner in geometry - outline + holes)
    // For batch fillet tool that supports all corners
    allCornerEligibility: AllCornerEligibility[];
  };
}

/**
 * Face panel snapshot
 */
export interface FacePanelSnapshot extends BasePanelSnapshot {
  kind: 'face-panel';
  props: BasePanelSnapshot['props'] & {
    faceId: FaceId;
    /** ID of the parent assembly (undefined for main assembly, set for sub-assemblies) */
    assemblyId?: string;
  };
}

/**
 * Divider panel snapshot
 */
export interface DividerPanelSnapshot extends BasePanelSnapshot {
  kind: 'divider-panel';
  props: BasePanelSnapshot['props'] & {
    axis: Axis;
    position: number;
    voidId: string;
  };
}

export type PanelSnapshot = FacePanelSnapshot | DividerPanelSnapshot;

// =============================================================================
// Panel Collection - Derived from all panels in the scene
// =============================================================================

/**
 * Flat collection of all panels for rendering/export
 * This is a derived view computed from the scene tree
 */
export interface PanelCollectionSnapshot {
  panels: PanelSnapshot[];
  // Global finger alignment data
  fingerData: {
    xPoints: number[];
    yPoints: number[];
    zPoints: number[];
  };
}

// =============================================================================
// Action Types - UI → Engine commands
// =============================================================================

export type EngineAction =
  | { type: 'SET_DIMENSIONS'; targetId: string; payload: { width?: number; height?: number; depth?: number; faceId?: FaceId } }
  | { type: 'SET_MATERIAL'; targetId: string; payload: Partial<MaterialConfig> }
  | { type: 'SET_FACE_SOLID'; targetId: string; payload: { faceId: FaceId; solid: boolean } }
  | { type: 'TOGGLE_FACE'; targetId: string; payload: { faceId: FaceId } }
  | { type: 'CONFIGURE_FACE'; targetId: string; payload: { faceId: FaceId; solid?: boolean; lidTabDirection?: 'tabs-in' | 'tabs-out' } }
  | { type: 'ADD_SUBDIVISION'; targetId: string; payload: { voidId: string; axis: Axis; position: number } }
  | { type: 'ADD_SUBDIVISIONS'; targetId: string; payload: { voidId: string; axis: Axis; positions: number[] } }
  | { type: 'ADD_GRID_SUBDIVISION'; targetId: string; payload: { voidId: string; axes: { axis: Axis; positions: number[] }[] } }
  | { type: 'REMOVE_SUBDIVISION'; targetId: string; payload: { voidId: string } }
  | { type: 'SET_EDGE_EXTENSION'; targetId: string; payload: { panelId: string; edge: EdgePosition; value: number } }
  | { type: 'SET_EDGE_EXTENSIONS_BATCH'; targetId: string; payload: { extensions: Array<{ panelId: string; edge: EdgePosition; value: number }> } }
  | { type: 'CREATE_SUB_ASSEMBLY'; targetId: string; payload: { voidId: string; clearance?: number; assemblyAxis?: Axis } }
  | { type: 'REMOVE_SUB_ASSEMBLY'; targetId: string; payload: { subAssemblyId: string } }
  | { type: 'PURGE_VOID'; targetId: string; payload: { voidId: string } }
  | { type: 'SET_SUB_ASSEMBLY_CLEARANCE'; targetId: string; payload: { subAssemblyId: string; clearance: number } }
  | { type: 'TOGGLE_SUB_ASSEMBLY_FACE'; targetId: string; payload: { subAssemblyId: string; faceId: FaceId } }
  | { type: 'SET_SUB_ASSEMBLY_AXIS'; targetId: string; payload: { subAssemblyId: string; axis: Axis } }
  | { type: 'SET_SUB_ASSEMBLY_LID_TAB_DIRECTION'; targetId: string; payload: { subAssemblyId: string; side: 'positive' | 'negative'; tabDirection: 'tabs-in' | 'tabs-out' } }
  | { type: 'SET_LID_CONFIG'; targetId: string; payload: { side: 'positive' | 'negative'; config: Partial<LidConfig> } }
  | { type: 'SET_ASSEMBLY_AXIS'; targetId: string; payload: { axis: Axis } }
  | { type: 'SET_FEET_CONFIG'; targetId: string; payload: FeetConfig | null }
  | { type: 'CONFIGURE_ASSEMBLY'; targetId: string; payload: {
      width?: number;
      height?: number;
      depth?: number;
      materialConfig?: Partial<MaterialConfig>;
      assemblyAxis?: Axis;
      lids?: {
        positive?: Partial<LidConfig>;
        negative?: Partial<LidConfig>;
      };
      feet?: FeetConfig;
    }}
  | { type: 'MOVE_SUBDIVISIONS'; targetId: string; payload: {
      moves: {
        subdivisionId: string;
        newPosition: number;
        // For grid dividers:
        isGridDivider?: boolean;
        gridPositionIndex?: number;
        parentVoidId?: string;
        axis?: Axis;
      }[];
    }}
  | { type: 'SET_GRID_SUBDIVISION'; targetId: string; payload: {
      voidId: string;
      axes: { axis: Axis; positions: number[] }[];
    }}
  | { type: 'SET_CORNER_FILLET'; targetId: string; payload: { panelId: string; corner: CornerKey; radius: number } }
  | { type: 'SET_CORNER_FILLETS_BATCH'; targetId: string; payload: { fillets: Array<{ panelId: string; corner: CornerKey; radius: number }> } }
  // All-corners fillet actions (for any corner in geometry - outline + holes)
  | { type: 'SET_ALL_CORNER_FILLET'; targetId: string; payload: { panelId: string; cornerId: AllCornerId; radius: number } }
  | { type: 'SET_ALL_CORNER_FILLETS_BATCH'; targetId: string; payload: { fillets: Array<{ panelId: string; cornerId: AllCornerId; radius: number }> } }
  // Custom edge path actions (edge is embedded in path.edge)
  | { type: 'SET_EDGE_PATH'; targetId: string; payload: { panelId: string; path: CustomEdgePath } }
  | { type: 'CLEAR_EDGE_PATH'; targetId: string; payload: { panelId: string; edge: EdgePosition } }
  // Cutout actions
  | { type: 'ADD_CUTOUT'; targetId: string; payload: { panelId: string; cutout: Cutout } }
  | { type: 'UPDATE_CUTOUT'; targetId: string; payload: { panelId: string; cutoutId: string; updates: Partial<Omit<Cutout, 'id' | 'type'>> } }
  | { type: 'DELETE_CUTOUT'; targetId: string; payload: { panelId: string; cutoutId: string } }
  // Boolean edge operations - modify panel safe area with union/difference
  | { type: 'APPLY_EDGE_OPERATION'; targetId: string; payload: {
      panelId: string;
      operation: 'union' | 'difference';
      shape: Array<{ x: number; y: number }>;  // Polygon in panel coordinates
    }}
  | { type: 'CLEAR_MODIFIED_SAFE_AREA'; targetId: string; payload: { panelId: string } };
