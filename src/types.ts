import { OperationId, OperationState, OperationPhase, INITIAL_OPERATION_STATE } from './operations/types';

// Re-export operation types for convenience
export { type OperationId, type OperationState, type OperationPhase, INITIAL_OPERATION_STATE };

// Assembly axis determines which pair of faces acts as "lids"
export type AssemblyAxis = 'x' | 'y' | 'z';

// Tab direction for each lid
export type LidTabDirection = 'tabs-out' | 'tabs-in';

// Configuration for a single lid face
export interface LidConfig {
  enabled: boolean;              // Whether face is solid (redundant with Face.solid but explicit)
  tabDirection: LidTabDirection;
  inset: number;                 // Inset from outer dimension (mm), 0 = flush with outer
}

// Feet configuration for assembly
export interface FeetConfig {
  enabled: boolean;
  height: number;       // How far feet extend downward (mm)
  width: number;        // Width of each foot (mm)
  inset: number;        // Distance from panel edge to outer edge of foot (mm)
}

// Default feet config
export const defaultFeetConfig: FeetConfig = {
  enabled: false,
  height: 15,
  width: 20,
  inset: 0,
};

// Assembly configuration for a box or sub-assembly
export interface AssemblyConfig {
  assemblyAxis: AssemblyAxis;
  lids: {
    positive: LidConfig;  // top (Y), right (X), or front (Z)
    negative: LidConfig;  // bottom (Y), left (X), or back (Z)
  };
  feet?: FeetConfig;    // Optional feet configuration
  faceOffsets?: FaceOffsets;  // Per-face position offsets for push/pull (mm)
}

// Helper: Get the role of a face (wall or lid) based on assembly axis
export const getFaceRole = (faceId: FaceId, axis: AssemblyAxis): 'wall' | 'lid' => {
  switch (axis) {
    case 'y':
      return (faceId === 'top' || faceId === 'bottom') ? 'lid' : 'wall';
    case 'x':
      return (faceId === 'left' || faceId === 'right') ? 'lid' : 'wall';
    case 'z':
      return (faceId === 'front' || faceId === 'back') ? 'lid' : 'wall';
  }
};

// Mapping from assembly axis to lid face IDs
// THE single source of truth for which faces are lids on each axis
export const lidMap: Record<AssemblyAxis, { positive: FaceId; negative: FaceId }> = {
  y: { positive: 'top', negative: 'bottom' },
  x: { positive: 'right', negative: 'left' },
  z: { positive: 'front', negative: 'back' },
};

// Helper: Get which side of the assembly axis a lid face is on
export const getLidSide = (faceId: FaceId, axis: AssemblyAxis): 'positive' | 'negative' | null => {
  const mapping = lidMap[axis];
  if (faceId === mapping.positive) return 'positive';
  if (faceId === mapping.negative) return 'negative';
  return null;
};

// Helper: Get the FaceId for a lid given axis and side
export const getLidFaceId = (axis: AssemblyAxis, side: 'positive' | 'negative'): FaceId => {
  return lidMap[axis][side];
};

// Helper: Get wall priority for wall-to-wall tab direction
// Lower priority face has tabs OUT, higher priority face has slots IN
export const getWallPriority = (faceId: FaceId): number => {
  const priorities: Record<FaceId, number> = {
    front: 1,
    back: 2,
    left: 3,
    right: 4,
    top: 5,
    bottom: 6,
  };
  return priorities[faceId];
};

// Default assembly config - Y axis with tabs-out on both lids
export const defaultAssemblyConfig: AssemblyConfig = {
  assemblyAxis: 'y',
  lids: {
    positive: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
    negative: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
  },
};

export interface BoxConfig {
  width: number;
  height: number;
  depth: number;
  materialThickness: number;
  fingerWidth: number;
  fingerGap: number;  // Gap at corners (multiplier of fingerWidth, e.g., 1.5 = 1.5x fingerWidth)
  assembly: AssemblyConfig;
}

export type FaceId = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export type SelectionMode = 'void' | 'panel' | 'assembly' | null;

// View mode for switching between 3D and 2D editing
export type ViewMode = '3d' | '2d';

export interface Face {
  id: FaceId;
  solid: boolean;
}

// Alias for clarity in certain contexts
export type FaceConfig = Face;

// Default face configurations - all faces solid
export const defaultFaces: Face[] = [
  { id: 'front', solid: true },
  { id: 'back', solid: true },
  { id: 'left', solid: true },
  { id: 'right', solid: true },
  { id: 'top', solid: true },
  { id: 'bottom', solid: true },
];

// Create faces with all solid
export const createAllSolidFaces = (): Face[] => defaultFaces.map(f => ({ ...f }));

// All face IDs in standard order
export const ALL_FACE_IDS: FaceId[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];

// Panel IDs for main box face panels (used for visibility isolation)
export const MAIN_FACE_PANEL_IDS = ALL_FACE_IDS.map(id => `face-${id}`);

export interface Bounds {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
}

// Per-face offsets for sub-assembly positioning
// Positive = outset (extend beyond clearance), Negative = inset (retract from clearance)
// Only meaningful for faces that border open parent faces
export interface FaceOffsets {
  front: number;
  back: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const defaultFaceOffsets: FaceOffsets = {
  front: 0, back: 0, left: 0, right: 0, top: 0, bottom: 0,
};

// Options for creating a sub-assembly
export interface CreateSubAssemblyOptions {
  clearance?: number;         // Base clearance from void walls (mm)
  assemblyAxis?: AssemblyAxis; // Axis for lids
  faceOffsets?: FaceOffsets;  // Per-face offset adjustments
}

// A sub-assembly is a nested box that fits inside a void
// It has 6 faces just like the main box, each can be open or closed
export interface SubAssembly {
  id: string;
  clearance: number;  // Base gap between sub-assembly and parent void (mm)
  faceOffsets: FaceOffsets;  // Per-face offset adjustments (mm)
  faces: Face[];      // Which faces are solid/open (same as main box)
  rootVoid: Void;     // Sub-assembly's internal void structure
  materialThickness: number;
  assembly: AssemblyConfig;  // Assembly configuration for this sub-assembly
}

// Position mode for subdivisions
export type SplitPositionMode = 'absolute' | 'percentage';

// Hierarchical void structure - subdivisions create child voids
export interface Void {
  id: string;
  bounds: Bounds;
  children: Void[];  // Child voids created by subdivision
  subAssembly?: SubAssembly;  // Optional nested sub-assembly (e.g., drawer)
  // If this void was created by splitting a parent:
  splitAxis?: 'x' | 'y' | 'z';
  splitPosition?: number;  // Absolute position in box coordinates where the split occurred
  splitPositionMode?: SplitPositionMode;  // 'absolute' = fixed position, 'percentage' = scales with dimensions
  splitPercentage?: number;  // 0.0 to 1.0 - position as percentage of parent void dimension (along split axis)
  // If this void is a lid inset cap (space between inset lid and outer edge):
  lidInsetSide?: 'positive' | 'negative';
  // If this is the main interior void (when lid insets exist):
  isMainInterior?: boolean;
}

// Legacy flat subdivision interface (kept for panel generation)
export interface Subdivision {
  id: string;
  axis: 'x' | 'y' | 'z';
  position: number;  // Absolute position in mm
  bounds: Bounds;    // The bounds of the parent void at time of split
  positionMode?: SplitPositionMode;  // Position mode (absolute or percentage)
  percentage?: number;  // Position as percentage of parent void (0.0 to 1.0)
}

// Preview state for showing potential sub-assembly before creating
export interface SubAssemblyPreview {
  voidId: string;
  bounds: Bounds;  // The calculated bounds of the sub-assembly
  clearance: number;
  assemblyAxis: AssemblyAxis;
  faceOffsets: FaceOffsets;
}

export interface BoxState {
  config: BoxConfig;
  faces: Face[];
  rootVoid: Void;  // Single root void that contains the hierarchy
  selectionMode: SelectionMode;
  // Multi-select enabled - use Sets instead of single IDs
  selectedVoidIds: Set<string>;
  selectedSubAssemblyIds: Set<string>;
  selectedPanelIds: Set<string>;  // FaceId or subdivision panel ids
  selectedAssemblyId: string | null;  // 'main' for main box (single select for assembly)
  // Hover state - synchronized between tree and 3D view
  hoveredVoidId: string | null;
  hoveredPanelId: string | null;
  hoveredAssemblyId: string | null;  // 'main' or sub-assembly id
  subAssemblyPreview: SubAssemblyPreview | null;
  // Visibility controls for voids
  hiddenVoidIds: Set<string>;  // Set of void IDs that are hidden
  isolatedVoidId: string | null;  // If set, only show this void and its descendants
  isolateHiddenVoidIds: Set<string>;  // Void IDs hidden specifically by the isolate action (for restore)
  // Visibility controls for sub-assemblies
  hiddenSubAssemblyIds: Set<string>;  // Set of sub-assembly IDs that are hidden
  isolatedSubAssemblyId: string | null;  // If set, only show this sub-assembly
  isolateHiddenSubAssemblyIds: Set<string>;  // Sub-assembly IDs hidden by isolate action
  // Visibility controls for face panels (includes dividers)
  hiddenFaceIds: Set<string>;  // Set of face panel IDs that are hidden (e.g., 'face-front', 'subasm-xxx-face-top', 'divider-void-1-split')
  isolatedPanelId: string | null;  // If set, only show this panel
  isolateHiddenFaceIds: Set<string>;  // Face IDs hidden by isolate action
  // Debug visualization toggles
  showDebugAnchors: boolean;
  // 2D Sketch View state
  viewMode: ViewMode;
  sketchPanelId: string | null;  // Panel being edited in 2D view
  // Editor tool state
  activeTool: EditorTool;
  selectedCornerIds: Set<string>;  // Selected corners for chamfer/fillet tool
  // Operation state - tracks active operation and its parameters
  operationState: OperationState;
}

// Editor tools available in 2D/3D views
export type EditorTool = 'select' | 'pan' | 'rectangle' | 'circle' | 'path' | 'inset' | 'chamfer' | 'push-pull' | 'subdivide' | 'create-sub-assembly';

export interface BoxActions {
  setConfig: (config: Partial<BoxConfig>) => void;
  toggleFace: (faceId: FaceId) => void;
  setSelectionMode: (mode: SelectionMode) => void;
  // Selection actions - additive parameter enables multi-select (e.g., shift-click)
  selectVoid: (voidId: string | null, additive?: boolean) => void;
  selectPanel: (panelId: string | null, additive?: boolean) => void;
  selectAssembly: (assemblyId: string | null) => void;  // 'main' or sub-assembly id
  selectSubAssembly: (subAssemblyId: string | null, additive?: boolean) => void;
  clearSelection: () => void;  // Clear all selections
  // Hover actions - synchronized between tree and 3D view
  setHoveredVoid: (voidId: string | null) => void;
  setHoveredPanel: (panelId: string | null) => void;
  setHoveredAssembly: (assemblyId: string | null) => void;
  setSubAssemblyPreview: (preview: SubAssemblyPreview | null) => void;
  removeVoid: (voidId: string) => void;
  resetVoids: () => void;
  // Assembly config actions for main box
  setAssemblyAxis: (axis: AssemblyAxis) => void;
  setLidTabDirection: (side: 'positive' | 'negative', direction: LidTabDirection) => void;
  setLidInset: (side: 'positive' | 'negative', inset: number) => void;
  setFeetConfig: (feetConfig: FeetConfig) => void;
  setFaceOffset: (faceId: FaceId, offset: number, mode: 'scale' | 'extend') => void;
  insetFace: (faceId: FaceId, insetAmount: number) => void;
  // Sub-assembly actions
  createSubAssembly: (voidId: string, options?: CreateSubAssemblyOptions) => void;
  toggleSubAssemblyFace: (subAssemblyId: string, faceId: FaceId) => void;
  setSubAssemblyClearance: (subAssemblyId: string, clearance: number) => void;
  removeSubAssembly: (voidId: string) => void;
  purgeVoid: (voidId: string) => void;  // Remove all children and sub-assemblies
  // Assembly config actions for sub-assemblies
  setSubAssemblyAxis: (subAssemblyId: string, axis: AssemblyAxis) => void;
  setSubAssemblyLidTabDirection: (subAssemblyId: string, side: 'positive' | 'negative', direction: LidTabDirection) => void;
  setSubAssemblyLidInset: (subAssemblyId: string, side: 'positive' | 'negative', inset: number) => void;
  // Visibility actions for voids
  toggleVoidVisibility: (voidId: string) => void;
  setIsolatedVoid: (voidId: string | null) => void;
  // Visibility actions for sub-assemblies
  toggleSubAssemblyVisibility: (subAssemblyId: string) => void;
  setIsolatedSubAssembly: (subAssemblyId: string | null) => void;
  // Visibility actions for face panels (includes dividers)
  toggleFaceVisibility: (faceId: string) => void;
  setIsolatedPanel: (panelId: string | null) => void;
  // Panel path actions
  generatePanels: () => void;                    // Generate panel paths from current config
  setEdgeExtension: (
    panelId: string,
    edge: 'top' | 'bottom' | 'left' | 'right',
    value: number
  ) => void;
  setDividerPosition: (
    subdivisionId: string,
    newPosition: number
  ) => void;
  setDividerPositionMode: (
    subdivisionId: string,
    mode: SplitPositionMode
  ) => void;
  // URL state management
  loadFromUrl: () => boolean;  // Returns true if state was loaded
  saveToUrl: () => void;
  getShareableUrl: () => string;
  // Debug visualization
  toggleDebugAnchors: () => void;
  // 2D Sketch View actions
  setViewMode: (mode: ViewMode) => void;
  enterSketchView: (panelId: string) => void;
  exitSketchView: () => void;
  // Editor tool actions
  setActiveTool: (tool: EditorTool) => void;
  selectCorner: (cornerId: string, toggle?: boolean) => void;
  selectCorners: (cornerIds: string[]) => void;
  clearCornerSelection: () => void;
  // Operation actions - unified operation system
  startOperation: (operationId: OperationId) => void;
  updateOperationParams: (params: Record<string, unknown>) => void;
  applyOperation: () => void;
  cancelOperation: () => void;
}

// Subdivision panel - a physical divider piece to be cut
export interface SubdivisionPanel {
  id: string;
  axis: 'x' | 'y' | 'z';
  position: number;      // Absolute position in mm
  parentBounds: Bounds;  // Bounds of the void this subdivision is in
  width: number;         // panel width in mm
  height: number;        // panel height in mm
  // Which outer faces this panel meets (for finger joints)
  meetsTop: boolean;
  meetsBottom: boolean;
  meetsLeft: boolean;
  meetsRight: boolean;
  // Intersecting subdivisions (for interlocking slots)
  intersections: SubdivisionIntersection[];
}

export interface SubdivisionIntersection {
  subdivisionId: string;
  axis: 'x' | 'y' | 'z';
  position: number;      // position along this panel's width in mm
  fromTop: boolean;      // slot comes from top (true) or bottom (false)
}

// =============================================================================
// Panel Path Model - Stored geometry that can be manipulated and exported
// =============================================================================

// A 2D point
export interface PathPoint {
  x: number;
  y: number;
}

// A closed path (contour or hole)
export interface Path {
  points: PathPoint[];
  closed: boolean;  // Should always be true for panel outlines/holes
}

// Types of holes that can be added to a panel
export type HoleType = 'slot' | 'circle' | 'rectangle' | 'custom';

// A hole in a panel (slot, decorative cutout, etc.)
export interface PanelHole {
  id: string;
  type: HoleType;
  path: Path;
  // Source info - what created this hole
  source?: {
    type: 'divider-slot' | 'lid-slot' | 'extension-slot' | 'decorative' | 'functional';
    sourceId?: string;  // ID of divider/lid that created this slot
  };
}

// Types of panels
export type PanelType = 'face' | 'divider' | 'lid';

// Source information for a panel
export interface PanelSource {
  type: PanelType;
  // For faces: the face ID
  faceId?: FaceId;
  // For dividers: the subdivision info
  subdivisionId?: string;
  axis?: 'x' | 'y' | 'z';
  position?: number;  // Divider position along the axis
  // For sub-assembly panels
  subAssemblyId?: string;
}

// Edge extensions for panel edge editing (V1 - straight edges only)
export interface EdgeExtensions {
  top: number;     // mm (positive = outward, negative = inward)
  bottom: number;
  left: number;
  right: number;
}

export const defaultEdgeExtensions: EdgeExtensions = {
  top: 0, bottom: 0, left: 0, right: 0
};

// Corner finish types
export type CornerFinishType = 'none' | 'chamfer' | 'fillet';

export interface CornerFinish {
  cornerId: string;
  type: CornerFinishType;
  radius: number;
}

// A panel with its 2D path geometry and 3D positioning
export interface PanelPath {
  id: string;
  source: PanelSource;

  // 2D geometry (in mm, centered at origin)
  outline: Path;              // Outer contour with finger joints
  holes: PanelHole[];         // Slots, decorative cutouts, etc.

  // Dimensions (for reference, derived from outline bounds)
  width: number;              // X extent of outline
  height: number;             // Y extent of outline
  thickness: number;          // Material thickness (Z extent when extruded)

  // 3D positioning (for rendering)
  position: [number, number, number];
  rotation: [number, number, number];

  // Display properties
  label?: string;
  color?: string;
  visible: boolean;

  // Edge extensions (V1 - only for straight edges)
  edgeExtensions: EdgeExtensions;

  // Corner finishes (chamfers, fillets)
  cornerFinishes?: CornerFinish[];
}

// Augmentation types that can be added to panels
export type AugmentationType = 'feet-notch' | 'handle-cutout' | 'vent-holes' | 'custom-hole';

// An augmentation is a modification to a panel (hole, notch, etc.)
export interface PanelAugmentation {
  id: string;
  type: AugmentationType;
  panelId: string;           // Which panel this augmentation belongs to
  hole: PanelHole;           // The actual geometry
  // Parameters for regeneration (optional, for parametric augmentations)
  params?: Record<string, number | string | boolean>;
}

// Collection of all generated panels
export interface PanelCollection {
  panels: PanelPath[];
  augmentations: PanelAugmentation[];
  // Generation metadata
  generatedAt: number;       // Timestamp
  sourceConfigHash?: string; // Hash of config used to generate (for dirty detection)
}

// Helper: Calculate bounding box of a path
export const getPathBounds = (path: Path): { minX: number; maxX: number; minY: number; maxY: number; width: number; height: number } => {
  if (path.points.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of path.points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
};

// Helper: Create a rectangular path
export const createRectPath = (width: number, height: number, centerX = 0, centerY = 0): Path => {
  const hw = width / 2;
  const hh = height / 2;
  return {
    points: [
      { x: centerX - hw, y: centerY + hh },  // top-left
      { x: centerX + hw, y: centerY + hh },  // top-right
      { x: centerX + hw, y: centerY - hh },  // bottom-right
      { x: centerX - hw, y: centerY - hh },  // bottom-left
    ],
    closed: true,
  };
};

// Helper: Create a circular path (approximated with segments)
export const createCirclePath = (radius: number, centerX = 0, centerY = 0, segments = 32): Path => {
  const points: PathPoint[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push({
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    });
  }
  return { points, closed: true };
};

// =============================================================================
// Finger Joint System v2 - Assembly-level finger point generation
// =============================================================================

// Joint gender determines whether an edge has tabs (male) or slots (female)
export type JointGender = 'male' | 'female';

// Finger points for one axis of an assembly
export interface AxisFingerPoints {
  axis: 'x' | 'y' | 'z';
  points: number[];           // Transition positions along axis (from negative end after MT inset)
  innerOffset: number;        // Distance from MT-inset edge to first finger transition
  fingerLength: number;       // Actual finger/hole length used (may differ from config due to remainder distribution)
  maxJointLength: number;     // axis_length - 2*MT
}

// Assembly-level finger point data for all 3 axes
export interface AssemblyFingerData {
  x: AxisFingerPoints;
  y: AxisFingerPoints;
  z: AxisFingerPoints;
}

// Configuration for finger point calculation
export interface FingerPointConfig {
  materialThickness: number;
  fingerLength: number;       // Target finger length
  minDistance: number;        // Minimum gap from bounding box corner to first finger
}

// Helper: Get the axis dimension from box config
export const getAxisDimension = (axis: 'x' | 'y' | 'z', config: BoxConfig): number => {
  switch (axis) {
    case 'x': return config.width;
    case 'y': return config.height;
    case 'z': return config.depth;
  }
};

// Helper: Get which axis an edge is parallel to based on face and edge position
export const getEdgeAxis = (
  faceId: FaceId,
  edgePosition: 'top' | 'bottom' | 'left' | 'right'
): 'x' | 'y' | 'z' => {
  // Edge axis mapping: which assembly axis each edge runs parallel to
  // Front/back faces are in XY plane, left/right in YZ plane, top/bottom in XZ plane
  // For top/bottom faces: in 2D layout, top/bottom edges run along X, left/right run along Z
  const edgeAxes: Record<FaceId, Record<string, 'x' | 'y' | 'z'>> = {
    front:  { top: 'x', bottom: 'x', left: 'y', right: 'y' },
    back:   { top: 'x', bottom: 'x', left: 'y', right: 'y' },
    left:   { top: 'z', bottom: 'z', left: 'y', right: 'y' },
    right:  { top: 'z', bottom: 'z', left: 'y', right: 'y' },
    top:    { top: 'x', bottom: 'x', left: 'z', right: 'z' },
    bottom: { top: 'x', bottom: 'x', left: 'z', right: 'z' },
  };
  return edgeAxes[faceId][edgePosition];
};
