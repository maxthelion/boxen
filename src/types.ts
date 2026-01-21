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

// Assembly configuration for a box or sub-assembly
export interface AssemblyConfig {
  assemblyAxis: AssemblyAxis;
  lids: {
    positive: LidConfig;  // top (Y), right (X), or front (Z)
    negative: LidConfig;  // bottom (Y), left (X), or back (Z)
  };
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

// Helper: Get which side of the assembly axis a lid face is on
export const getLidSide = (faceId: FaceId, axis: AssemblyAxis): 'positive' | 'negative' | null => {
  const lidMap: Record<AssemblyAxis, { positive: FaceId; negative: FaceId }> = {
    y: { positive: 'top', negative: 'bottom' },
    x: { positive: 'right', negative: 'left' },
    z: { positive: 'front', negative: 'back' },
  };
  const mapping = lidMap[axis];
  if (faceId === mapping.positive) return 'positive';
  if (faceId === mapping.negative) return 'negative';
  return null;
};

// Helper: Get the FaceId for a lid given axis and side
export const getLidFaceId = (axis: AssemblyAxis, side: 'positive' | 'negative'): FaceId => {
  const lidMap: Record<AssemblyAxis, { positive: FaceId; negative: FaceId }> = {
    y: { positive: 'top', negative: 'bottom' },
    x: { positive: 'right', negative: 'left' },
    z: { positive: 'front', negative: 'back' },
  };
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

export type SelectionMode = 'void' | 'panel' | 'assembly';

export interface Face {
  id: FaceId;
  solid: boolean;
}

export interface Bounds {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
}

// Sub-assembly types (drawer, insert, etc.)
export type SubAssemblyType = 'drawer' | 'insert' | 'tray';

// A sub-assembly is a nested box that fits inside a void
export interface SubAssembly {
  id: string;
  type: SubAssemblyType;
  clearance: number;  // Gap between sub-assembly and parent void (mm)
  faces: Face[];      // Which faces are solid/open
  rootVoid: Void;     // Sub-assembly's internal void structure
  materialThickness: number;
  assembly: AssemblyConfig;  // Assembly configuration for this sub-assembly
}

// Hierarchical void structure - subdivisions create child voids
export interface Void {
  id: string;
  bounds: Bounds;
  children: Void[];  // Child voids created by subdivision
  subAssembly?: SubAssembly;  // Optional nested sub-assembly (e.g., drawer)
  // If this void was created by splitting a parent:
  splitAxis?: 'x' | 'y' | 'z';
  splitPosition?: number;  // Absolute position in box coordinates where the split occurred
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
}

// Preview state for showing potential subdivisions before confirming
export interface SubdivisionPreview {
  voidId: string;
  axis: 'x' | 'y' | 'z';
  count: number;  // Number of divisions (1 = single split, 2+ = distribute)
  positions: number[];  // Absolute positions of preview planes
}

export interface BoxState {
  config: BoxConfig;
  faces: Face[];
  rootVoid: Void;  // Single root void that contains the hierarchy
  selectionMode: SelectionMode;
  selectedVoidId: string | null;
  selectedSubAssemblyId: string | null;  // Currently selected sub-assembly
  selectedPanelId: string | null;  // FaceId or subdivision panel id
  selectedAssemblyId: string | null;  // 'main' for main box, or sub-assembly id
  subdivisionPreview: SubdivisionPreview | null;
  // Visibility controls for voids
  hiddenVoidIds: Set<string>;  // Set of void IDs that are hidden
  isolatedVoidId: string | null;  // If set, only show this void and its ancestors/descendants
  // Visibility controls for sub-assemblies
  hiddenSubAssemblyIds: Set<string>;  // Set of sub-assembly IDs that are hidden
  isolatedSubAssemblyId: string | null;  // If set, only show this sub-assembly
  // Visibility controls for face panels
  hiddenFaceIds: Set<string>;  // Set of face panel IDs that are hidden (e.g., 'face-front', 'subasm-xxx-face-top')
  // Generated panel paths - the source of truth for geometry
  panelCollection: PanelCollection | null;
  // Flag indicating panels need regeneration (config changed since last generate)
  panelsDirty: boolean;
}

export interface BoxActions {
  setConfig: (config: Partial<BoxConfig>) => void;
  toggleFace: (faceId: FaceId) => void;
  setSelectionMode: (mode: SelectionMode) => void;
  selectVoid: (voidId: string | null) => void;
  selectPanel: (panelId: string | null) => void;
  selectAssembly: (assemblyId: string | null) => void;  // 'main' or sub-assembly id
  setSubdivisionPreview: (preview: SubdivisionPreview | null) => void;
  applySubdivision: () => void;  // Apply the current preview
  removeVoid: (voidId: string) => void;
  resetVoids: () => void;
  // Assembly config actions for main box
  setAssemblyAxis: (axis: AssemblyAxis) => void;
  setLidTabDirection: (side: 'positive' | 'negative', direction: LidTabDirection) => void;
  setLidInset: (side: 'positive' | 'negative', inset: number) => void;
  // Sub-assembly actions
  createSubAssembly: (voidId: string, type: SubAssemblyType) => void;
  selectSubAssembly: (subAssemblyId: string | null) => void;
  toggleSubAssemblyFace: (subAssemblyId: string, faceId: FaceId) => void;
  setSubAssemblyClearance: (subAssemblyId: string, clearance: number) => void;
  removeSubAssembly: (voidId: string) => void;
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
  // Visibility actions for face panels
  toggleFaceVisibility: (faceId: string) => void;
  // Panel path actions
  generatePanels: () => void;                    // Generate panel paths from current config
  clearPanels: () => void;                       // Clear generated panels
  updatePanelPath: (panelId: string, updates: Partial<PanelPath>) => void;
  addPanelHole: (panelId: string, hole: PanelHole) => void;
  removePanelHole: (panelId: string, holeId: string) => void;
  addAugmentation: (augmentation: PanelAugmentation) => void;
  removeAugmentation: (augmentationId: string) => void;
  togglePanelVisibility: (panelId: string) => void;
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
    type: 'divider-slot' | 'lid-slot' | 'decorative' | 'functional';
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
  // For sub-assembly panels
  subAssemblyId?: string;
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
