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
    type: 'divider-slot' | 'sub-assembly-slot' | 'extension-slot' | 'custom';
    sourceId?: string;
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
    cornerFillets: CornerFillet[];  // Corner fillet configurations
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

    // Corner eligibility for fillet tool
    // Determines which corners can be filleted and max radius
    cornerEligibility: CornerEligibility[];
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
  | { type: 'SET_CORNER_FILLETS_BATCH'; targetId: string; payload: { fillets: Array<{ panelId: string; corner: CornerKey; radius: number }> } };
