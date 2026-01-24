import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { useBoxStore, getAllSubdivisions, calculatePreviewPositions, getMainInteriorVoid } from '../store/useBoxStore';
import { Panel } from './UI/Panel';
import { NumberInput } from './UI/NumberInput';
import { Void, Face, AssemblyAxis, FaceId, FaceOffsets, defaultFaceOffsets, Bounds, PanelPath } from '../types';

// Get the normal axis for a face (the axis perpendicular to the face plane)
const getFaceNormalAxis = (faceId: FaceId): 'x' | 'y' | 'z' => {
  switch (faceId) {
    case 'left':
    case 'right':
      return 'x';  // Left/right faces are in YZ plane, normal is X
    case 'top':
    case 'bottom':
      return 'y';  // Top/bottom faces are in XZ plane, normal is Y
    case 'front':
    case 'back':
      return 'z';  // Front/back faces are in XY plane, normal is Z
  }
};

// Get the normal axis for any panel (face or divider)
const getPanelNormalAxis = (panel: PanelPath): 'x' | 'y' | 'z' | null => {
  if (panel.source.type === 'face' && panel.source.faceId) {
    return getFaceNormalAxis(panel.source.faceId);
  }
  if (panel.source.type === 'divider' && panel.source.axis) {
    // Divider's axis IS its normal axis (e.g., axis 'x' means it's a YZ plane, normal to X)
    return panel.source.axis;
  }
  return null;
};

// Get the axes perpendicular to a normal axis (valid for subdivision)
const getPerpendicularAxes = (normalAxis: 'x' | 'y' | 'z'): ('x' | 'y' | 'z')[] => {
  switch (normalAxis) {
    case 'x': return ['y', 'z'];
    case 'y': return ['x', 'z'];
    case 'z': return ['x', 'y'];
  }
};

// Get panel description for display
const getPanelDescription = (panel: PanelPath): string => {
  if (panel.source.type === 'face' && panel.source.faceId) {
    const labels: Record<FaceId, string> = {
      front: 'Front', back: 'Back', left: 'Left',
      right: 'Right', top: 'Top', bottom: 'Bottom',
    };
    return labels[panel.source.faceId];
  }
  if (panel.source.type === 'divider') {
    return 'Divider';
  }
  return 'Panel';
};

// Extract void ID from subdivision ID (removes '-split' suffix)
const getVoidIdFromSubdivisionId = (subdivisionId: string): string => {
  return subdivisionId.replace('-split', '');
};

// Find the parent void of a child void by the child's ID
const findParentVoid = (root: Void, childVoidId: string): Void | null => {
  for (const child of root.children) {
    if (child.id === childVoidId) {
      return root;
    }
  }
  for (const child of root.children) {
    const found = findParentVoid(child, childVoidId);
    if (found) return found;
  }
  if (root.subAssembly) {
    const found = findParentVoid(root.subAssembly.rootVoid, childVoidId);
    if (found) return found;
  }
  return null;
};

// Find a leaf void between two parallel panels
// TODO: Future enhancement - allow non-adjacent parallel panels to create "spanning" dividers
// that cross multiple voids. This would be useful for creating crossed/grid structures where
// a divider needs to span several existing voids. Would require:
// 1. Detecting all voids between the two selected panels
// 2. Creating a single divider panel that spans all those voids
// 3. Updating each void with appropriate subdivision info
// 4. Generating proper finger joints where the spanning divider crosses existing dividers
const findVoidBetweenPanels = (
  panel1: PanelPath,
  panel2: PanelPath,
  rootVoid: Void
): Void | null => {
  // Case 1: Both are face panels (opposite faces)
  if (panel1.source.type === 'face' && panel2.source.type === 'face') {
    const mainVoid = getMainInteriorVoid(rootVoid);
    if (mainVoid.children.length === 0 && !mainVoid.subAssembly) {
      return mainVoid;
    }
    return null;
  }

  // Case 2: Both are dividers - find the void between them
  if (panel1.source.type === 'divider' && panel2.source.type === 'divider') {
    const subId1 = panel1.source.subdivisionId;
    const subId2 = panel2.source.subdivisionId;
    if (!subId1 || !subId2) return null;

    // Extract void IDs from subdivision IDs
    const voidId1 = getVoidIdFromSubdivisionId(subId1);
    const voidId2 = getVoidIdFromSubdivisionId(subId2);

    // Find their common parent
    const parent1 = findParentVoid(rootVoid, voidId1);
    const parent2 = findParentVoid(rootVoid, voidId2);

    if (!parent1 || !parent2) return null;

    // If same parent, look for a leaf void between the two subdivision positions
    if (parent1.id === parent2.id) {
      const childIds = parent1.children.map(c => c.id);
      const idx1 = childIds.indexOf(voidId1);
      const idx2 = childIds.indexOf(voidId2);

      if (idx1 === -1 || idx2 === -1) return null;

      const minIdx = Math.min(idx1, idx2);
      const maxIdx = Math.max(idx1, idx2);

      // If they're adjacent, there's exactly one void between them
      // The divider at index i is between children[i-1] and children[i]
      // So if we select dividers at indices i and j (i<j), the void between is children[i]
      // But wait - children[i] has the split info for divider at position i
      // Actually: child at idx has splitPosition = position of divider BEFORE it
      // So if idx1=1, idx2=2: divider1 is between [0] and [1], divider2 is between [1] and [2]
      // The void between them is children[minIdx] which is the lower-indexed child
      if (maxIdx - minIdx === 1) {
        const voidBetween = parent1.children[minIdx];
        if (voidBetween && voidBetween.children.length === 0 && !voidBetween.subAssembly) {
          return voidBetween;
        }
      }
    }
    return null;
  }

  // Case 3: One face, one divider - find void bounded by both
  if ((panel1.source.type === 'face' && panel2.source.type === 'divider') ||
      (panel1.source.type === 'divider' && panel2.source.type === 'face')) {
    const facePanel = panel1.source.type === 'face' ? panel1 : panel2;
    const dividerPanel = panel1.source.type === 'divider' ? panel1 : panel2;

    const subId = dividerPanel.source.subdivisionId;
    if (!subId) return null;

    const faceId = facePanel.source.faceId;
    const dividerAxis = dividerPanel.source.axis;

    if (!faceId || !dividerAxis) return null;

    // The face and divider must be on the same axis (both perpendicular to that axis)
    // Face normals: left/right -> x, top/bottom -> y, front/back -> z
    const faceAxis = (faceId === 'left' || faceId === 'right') ? 'x' :
                     (faceId === 'top' || faceId === 'bottom') ? 'y' : 'z';

    if (faceAxis !== dividerAxis) return null;

    // For face + divider on the same axis, we need to find the void at the main interior level
    // The face bounds the outer box, so the divider must be a direct child of main interior
    const mainInterior = getMainInteriorVoid(rootVoid);

    // The divider's void must be a direct child of main interior
    const voidId = getVoidIdFromSubdivisionId(subId);
    const childIds = mainInterior.children.map(c => c.id);
    const dividerIdx = childIds.indexOf(voidId);

    // If divider is not a direct child of main interior, reject
    if (dividerIdx === -1) return null;

    // Determine if the face is at the "low" or "high" end of the axis
    const isLowFace = faceId === 'left' || faceId === 'bottom' || faceId === 'back';
    const isHighFace = faceId === 'right' || faceId === 'top' || faceId === 'front';

    // Validate that the divider is actually adjacent to the face
    // The divider at index i is at the LOW boundary of children[i], so:
    // - children[i] is the void to the HIGH side of that divider
    // - children[i-1] is the void to the LOW side of that divider
    //
    // For high face (e.g., Right): we need the divider's HIGH-side void to touch the face
    //   This means children[i] must be the last child, so dividerIdx must be last
    // For low face (e.g., Left): we need the divider's LOW-side void to touch the face
    //   This means children[i-1] must be the first child (children[0]), so dividerIdx must be 1
    if (isHighFace && dividerIdx !== mainInterior.children.length - 1) return null;
    if (isLowFace && dividerIdx !== 1) return null;

    // After validation:
    // - For high face: void between divider and face is children[dividerIdx] (the last child)
    // - For low face: void between face and divider is children[dividerIdx - 1] = children[0]
    const targetIdx = isLowFace ? dividerIdx - 1 : dividerIdx;

    if (targetIdx < 0 || targetIdx >= mainInterior.children.length) return null;

    const targetVoid = mainInterior.children[targetIdx];

    if (targetVoid && targetVoid.children.length === 0 && !targetVoid.subAssembly) {
      return targetVoid;
    }
    return null;
  }

  return null;
};

interface TwoPanelSubdivisionInfo {
  isValid: boolean;
  panels: PanelPath[];
  panelDescriptions: string[];
  validAxes: ('x' | 'y' | 'z')[];
  normalAxis: 'x' | 'y' | 'z';
  targetVoid: Void | null;
}

// Analyze two selected panels for subdivision potential
const analyzeTwoPanelSelection = (
  selectedPanelIds: Set<string>,
  panelCollection: { panels: PanelPath[] } | null,
  rootVoid: Void
): TwoPanelSubdivisionInfo => {
  const invalid: TwoPanelSubdivisionInfo = {
    isValid: false,
    panels: [],
    panelDescriptions: [],
    validAxes: [],
    normalAxis: 'x',
    targetVoid: null,
  };

  if (selectedPanelIds.size !== 2 || !panelCollection) {
    return invalid;
  }

  const panelIds = Array.from(selectedPanelIds);
  const panels = panelIds
    .map(id => panelCollection.panels.find(p => p.id === id))
    .filter((p): p is PanelPath => p !== undefined);

  if (panels.length !== 2) {
    return invalid;
  }

  // Get normal axes for both panels
  const axis1 = getPanelNormalAxis(panels[0]);
  const axis2 = getPanelNormalAxis(panels[1]);

  // Both must have a valid normal axis and they must match (parallel panels)
  if (!axis1 || !axis2 || axis1 !== axis2) {
    return invalid;
  }

  // Must be from main assembly (not sub-assembly) for now
  if (panels.some(p => p.source.subAssemblyId)) {
    return invalid;
  }

  const normalAxis = axis1;
  const validAxes = getPerpendicularAxes(normalAxis);

  // Find the void between the two panels
  const targetVoid = findVoidBetweenPanels(panels[0], panels[1], rootVoid);

  if (!targetVoid) {
    return invalid;
  }

  const panelDescriptions = panels.map(getPanelDescription);

  return {
    isValid: true,
    panels,
    panelDescriptions,
    validAxes,
    normalAxis,
    targetVoid,
  };
};

// Find a void by ID in the tree (including inside sub-assemblies)
const findVoid = (root: Void, id: string): Void | null => {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findVoid(child, id);
    if (found) return found;
  }
  // Also search inside sub-assembly's void structure
  if (root.subAssembly) {
    const found = findVoid(root.subAssembly.rootVoid, id);
    if (found) return found;
  }
  return null;
};

// Determine which axes are valid based on open faces
// Subdivisions parallel to open faces should be disabled
const getValidAxes = (faces: Face[]): { x: boolean; y: boolean; z: boolean } => {
  const isSolid = (id: string) => faces.find(f => f.id === id)?.solid ?? true;

  // X subdivisions create YZ planes (parallel to left/right faces)
  // Disable if left OR right is open
  const xValid = isSolid('left') && isSolid('right');

  // Y subdivisions create XZ planes (parallel to top/bottom faces)
  // Disable if top OR bottom is open
  const yValid = isSolid('top') && isSolid('bottom');

  // Z subdivisions create XY planes (parallel to front/back faces)
  // Disable if front OR back is open
  const zValid = isSolid('front') && isSolid('back');

  return { x: xValid, y: yValid, z: zValid };
};

export const SubdivisionControls: React.FC = () => {
  const {
    selectedVoidIds,
    selectedPanelIds,
    panelCollection,
    rootVoid,
    faces,
    config,
    subdivisionPreview,
    setSubdivisionPreview,
    setSubAssemblyPreview,
    applySubdivision,
    removeVoid,
    createSubAssembly,
    removeSubAssembly,
    selectSubAssembly,
    purgeVoid,
    selectVoid,
  } = useBoxStore();

  // Get the single selected void ID (this component only shows when exactly 1 is selected)
  const selectedVoidId = selectedVoidIds.size === 1 ? Array.from(selectedVoidIds)[0] : null;

  // Track whether user has clicked to enter edit mode (vs just hovering)
  const [isEditingPreview, setIsEditingPreview] = useState(false);

  // State for create assembly options
  const [showCreateAssembly, setShowCreateAssembly] = useState(false);
  const [createClearance, setCreateClearance] = useState(2);
  const [createAxis, setCreateAxis] = useState<AssemblyAxis>('y');
  const [createFaceOffsets, setCreateFaceOffsets] = useState<FaceOffsets>(defaultFaceOffsets);

  // Reset edit mode and creation form when selection changes
  useEffect(() => {
    setIsEditingPreview(false);
    setShowCreateAssembly(false);
    setCreateClearance(2);
    setCreateAxis('y');
    setCreateFaceOffsets(defaultFaceOffsets);
  }, [selectedVoidId]);

  const selectedVoid = useMemo(() => {
    if (!selectedVoidId) return null;
    return findVoid(rootVoid, selectedVoidId);
  }, [selectedVoidId, rootVoid]);

  // Analyze two-panel selection for subdivision
  const twoPanelInfo = useMemo(() =>
    analyzeTwoPanelSelection(selectedPanelIds, panelCollection, rootVoid),
    [selectedPanelIds, panelCollection, rootVoid]
  );

  const isLeafVoid = selectedVoid && selectedVoid.children.length === 0 && !selectedVoid.subAssembly;
  const hasSubAssembly = selectedVoid?.subAssembly !== undefined;
  const hasChildren = selectedVoid && selectedVoid.children.length > 0;

  // Determine which parent faces are open (for face offset controls)
  // An open face means the sub-assembly can potentially extend/retract in that direction
  const openParentFaces = useMemo(() => {
    const result: FaceId[] = [];
    for (const face of faces) {
      if (!face.solid) {
        result.push(face.id);
      }
    }
    return result;
  }, [faces]);

  const subdivisions = useMemo(() => getAllSubdivisions(rootVoid), [rootVoid]);

  const validAxes = useMemo(() => getValidAxes(faces), [faces]);

  // Update sub-assembly preview when form is shown or values change
  useEffect(() => {
    if (!showCreateAssembly || !selectedVoid || !selectedVoidId) {
      setSubAssemblyPreview(null);
      return;
    }

    const { bounds } = selectedVoid;
    const mt = config.materialThickness;

    // Calculate outer dimensions (same logic as createSubAssembly)
    const outerWidth = bounds.w - (createClearance * 2) + createFaceOffsets.left + createFaceOffsets.right;
    const outerHeight = bounds.h - (createClearance * 2) + createFaceOffsets.top + createFaceOffsets.bottom;
    const outerDepth = bounds.d - (createClearance * 2) + createFaceOffsets.front + createFaceOffsets.back;

    // Check if valid (interior must be positive)
    const interiorWidth = outerWidth - (2 * mt);
    const interiorHeight = outerHeight - (2 * mt);
    const interiorDepth = outerDepth - (2 * mt);

    if (interiorWidth <= 0 || interiorHeight <= 0 || interiorDepth <= 0) {
      setSubAssemblyPreview(null);
      return;
    }

    // Calculate the preview bounds (position within the void)
    const previewBounds: Bounds = {
      x: bounds.x + createClearance - createFaceOffsets.left,
      y: bounds.y + createClearance - createFaceOffsets.bottom,
      z: bounds.z + createClearance - createFaceOffsets.back,
      w: outerWidth,
      h: outerHeight,
      d: outerDepth,
    };

    setSubAssemblyPreview({
      voidId: selectedVoidId,
      bounds: previewBounds,
      clearance: createClearance,
      assemblyAxis: createAxis,
      faceOffsets: createFaceOffsets,
    });
  }, [showCreateAssembly, selectedVoid, selectedVoidId, createClearance, createAxis, createFaceOffsets, config.materialThickness, setSubAssemblyPreview]);

  // Start editing a subdivision (user clicked an axis)
  const startEditing = useCallback((axis: 'x' | 'y' | 'z') => {
    if (!selectedVoidId || !selectedVoid) return;

    const positions = calculatePreviewPositions(selectedVoid.bounds, axis, 1);
    setSubdivisionPreview({
      voidId: selectedVoidId,
      axis,
      count: 1,
      positions,
    });
    setIsEditingPreview(true);
  }, [selectedVoidId, selectedVoid, setSubdivisionPreview]);

  // Update the count (number of divisions) in the current preview
  const updatePreviewCount = useCallback((newCount: number) => {
    if (!subdivisionPreview) return;

    // Use selectedVoid or twoPanelInfo.targetVoid (for two-panel mode)
    const targetVoid = selectedVoid || twoPanelInfo.targetVoid;
    if (!targetVoid) return;

    const count = Math.max(1, Math.min(20, newCount));
    const positions = calculatePreviewPositions(targetVoid.bounds, subdivisionPreview.axis, count);
    setSubdivisionPreview({
      ...subdivisionPreview,
      count,
      positions,
    });
  }, [subdivisionPreview, selectedVoid, twoPanelInfo.targetVoid, setSubdivisionPreview]);

  // Cancel the current preview
  const cancelPreview = useCallback(() => {
    setSubdivisionPreview(null);
    setIsEditingPreview(false);
  }, [setSubdivisionPreview]);

  // Apply the current preview and create the subdivision
  const confirmSubdivision = useCallback(() => {
    applySubdivision();
    setIsEditingPreview(false);
  }, [applySubdivision]);

  // Handle mouse enter on axis button (show hover preview only)
  const handleAxisHover = useCallback((axis: 'x' | 'y' | 'z') => {
    if (!selectedVoidId || !selectedVoid || !isLeafVoid) return;
    if (isEditingPreview) return; // Don't override if in edit mode

    const positions = calculatePreviewPositions(selectedVoid.bounds, axis, 1);
    setSubdivisionPreview({
      voidId: selectedVoidId,
      axis,
      count: 1,
      positions,
    });
  }, [selectedVoidId, selectedVoid, isLeafVoid, isEditingPreview, setSubdivisionPreview]);

  // Handle mouse leave (clear hover preview only if not in edit mode)
  const handleAxisLeave = useCallback(() => {
    if (isEditingPreview) return; // Don't clear if in edit mode
    setSubdivisionPreview(null);
  }, [isEditingPreview, setSubdivisionPreview]);

  // Start editing from two-panel selection
  const startTwoPanelSubdivision = useCallback((axis: 'x' | 'y' | 'z') => {
    if (!twoPanelInfo.isValid || !twoPanelInfo.targetVoid) return;

    const targetVoidId = twoPanelInfo.targetVoid.id;
    const positions = calculatePreviewPositions(twoPanelInfo.targetVoid.bounds, axis, 1);

    // Set up preview (don't select void - applySubdivision uses preview.voidId)
    setSubdivisionPreview({
      voidId: targetVoidId,
      axis,
      count: 1,
      positions,
    });
    setIsEditingPreview(true);
  }, [twoPanelInfo, setSubdivisionPreview]);

  // Hover handler for two-panel mode
  const handleTwoPanelAxisHover = useCallback((axis: 'x' | 'y' | 'z') => {
    if (!twoPanelInfo.isValid || !twoPanelInfo.targetVoid || isEditingPreview) return;

    const positions = calculatePreviewPositions(twoPanelInfo.targetVoid.bounds, axis, 1);
    setSubdivisionPreview({
      voidId: twoPanelInfo.targetVoid.id,
      axis,
      count: 1,
      positions,
    });
  }, [twoPanelInfo, isEditingPreview, setSubdivisionPreview]);

  // Leave handler for two-panel mode
  const handleTwoPanelAxisLeave = useCallback(() => {
    if (isEditingPreview) return;
    setSubdivisionPreview(null);
  }, [isEditingPreview, setSubdivisionPreview]);

  const getAxisTooltip = (axis: 'x' | 'y' | 'z', isValid: boolean): string => {
    if (isValid) {
      switch (axis) {
        case 'x': return 'Split with vertical divider (left-right)';
        case 'y': return 'Split with horizontal shelf (top-bottom)';
        case 'z': return 'Split with vertical divider (front-back)';
      }
    }
    switch (axis) {
      case 'x': return 'Disabled: left or right face is open';
      case 'y': return 'Disabled: top or bottom face is open';
      case 'z': return 'Disabled: front or back face is open';
    }
  };

  const getAxisLabel = (axis: 'x' | 'y' | 'z'): string => {
    switch (axis) {
      case 'x': return 'X (Left-Right)';
      case 'y': return 'Y (Top-Bottom)';
      case 'z': return 'Z (Front-Back)';
    }
  };

  const handleCreateAssembly = useCallback(() => {
    if (!selectedVoidId) return;
    createSubAssembly(selectedVoidId, {
      clearance: createClearance,
      assemblyAxis: createAxis,
      faceOffsets: createFaceOffsets,
    });
    setShowCreateAssembly(false);
  }, [selectedVoidId, createSubAssembly, createClearance, createAxis, createFaceOffsets]);

  const handleFaceOffsetChange = useCallback((faceId: FaceId, value: number) => {
    setCreateFaceOffsets(prev => ({ ...prev, [faceId]: value }));
  }, []);

  const handlePurgeVoid = useCallback(() => {
    if (!selectedVoidId) return;
    purgeVoid(selectedVoidId);
  }, [selectedVoidId, purgeVoid]);

  const getFaceLabel = (faceId: FaceId): string => {
    const labels: Record<FaceId, string> = {
      front: 'Front',
      back: 'Back',
      left: 'Left',
      right: 'Right',
      top: 'Top',
      bottom: 'Bottom',
    };
    return labels[faceId];
  };

  // Get axis label for display
  const getAxisDisplayLabel = (axis: 'x' | 'y' | 'z'): string => {
    switch (axis) {
      case 'x': return 'X (Left-Right)';
      case 'y': return 'Y (Top-Bottom)';
      case 'z': return 'Z (Front-Back)';
    }
  };

  // Get panel pair description
  const getPanelPairDescription = (descriptions: string[]): string => {
    if (descriptions.length === 2) {
      return `${descriptions[0]} & ${descriptions[1]}`;
    }
    return descriptions.join(' & ');
  };

  return (
    <Panel title="Subdivisions">
      {/* Two-panel subdivision mode */}
      {twoPanelInfo.isValid && !isEditingPreview && (
        <div className="subdivision-controls">
          <div className="control-section">
            <h4>Subdivide Between Panels</h4>
            <p className="hint">
              {getPanelPairDescription(twoPanelInfo.panelDescriptions)} selected
            </p>
            <div className="button-row">
              {twoPanelInfo.validAxes.map(axis => (
                <button
                  key={axis}
                  onClick={() => startTwoPanelSubdivision(axis)}
                  onMouseEnter={() => handleTwoPanelAxisHover(axis)}
                  onMouseLeave={handleTwoPanelAxisLeave}
                  title={`Split with divider along ${axis.toUpperCase()} axis`}
                >
                  {axis.toUpperCase()} Axis
                </button>
              ))}
            </div>
            <p className="axis-hint">
              Only axes perpendicular to selected panels are available
            </p>
          </div>
          {twoPanelInfo.targetVoid && (
            <div className="void-info">
              <p>
                Target void: {twoPanelInfo.targetVoid.bounds.w.toFixed(1)} x {twoPanelInfo.targetVoid.bounds.h.toFixed(1)} x {twoPanelInfo.targetVoid.bounds.d.toFixed(1)} mm
              </p>
            </div>
          )}
        </div>
      )}

      {/* Editing mode (after axis selected - works for both two-panel and single-void) */}
      {isEditingPreview && subdivisionPreview && (
        <div className="subdivision-controls">
          <div className="control-section">
            <h4>Configure {getAxisDisplayLabel(subdivisionPreview.axis)} subdivision</h4>

            <div className="preview-config">
              <div className="count-control">
                <label>Number of divisions:</label>
                <div className="count-buttons">
                  <button
                    onClick={() => updatePreviewCount(subdivisionPreview.count - 1)}
                    disabled={subdivisionPreview.count <= 1}
                  >
                    -
                  </button>
                  <NumberInput
                    value={subdivisionPreview.count}
                    onChange={(v) => updatePreviewCount(Math.round(v))}
                    min={1}
                    max={20}
                  />
                  <button
                    onClick={() => updatePreviewCount(subdivisionPreview.count + 1)}
                    disabled={subdivisionPreview.count >= 20}
                  >
                    +
                  </button>
                </div>
              </div>

              <p className="preview-info">
                This will create {subdivisionPreview.count + 1} cells
              </p>

              <div className="confirm-buttons">
                <button
                  className="apply-btn"
                  onClick={confirmSubdivision}
                >
                  Apply
                </button>
                <button
                  className="cancel-btn"
                  onClick={cancelPreview}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Single void selection mode (original behavior) */}
      {selectedVoidId && selectedVoid && !twoPanelInfo.isValid ? (
        <div className="subdivision-controls">
          {hasSubAssembly ? (
            // Void contains a sub-assembly
            <div className="control-section">
              <div className="subassembly-info">
                <h4>Contains: Nested Box</h4>
                <p className="hint">
                  Click the sub-assembly in the 3D view to edit it
                </p>
                <button
                  className="select-subassembly-btn"
                  onClick={() => selectSubAssembly(selectedVoid.subAssembly!.id)}
                >
                  Select Nested Box
                </button>
                <button
                  className="remove-subassembly-btn"
                  onClick={() => removeSubAssembly(selectedVoidId)}
                >
                  Remove Nested Box
                </button>
              </div>
            </div>
          ) : hasChildren ? (
            // Void has subdivisions
            <div className="control-section">
              <div className="hint">
                This void has been subdivided. Select a child cell to subdivide further.
              </div>
              <button
                className="purge-btn"
                onClick={handlePurgeVoid}
                title="Remove all subdivisions and nested content from this void"
              >
                Purge Void
              </button>
            </div>
          ) : isLeafVoid ? (
            <>
              {!isEditingPreview ? (
                // Step 1: Select axis (hover to preview, click to select)
                <>
                  {!showCreateAssembly && (
                    <div className="control-section">
                      <h4>Subdivide</h4>
                      <div className="button-row">
                        <button
                          onClick={() => startEditing('x')}
                          onMouseEnter={() => handleAxisHover('x')}
                          onMouseLeave={handleAxisLeave}
                          disabled={!validAxes.x}
                          title={getAxisTooltip('x', validAxes.x)}
                        >
                          X Axis
                        </button>
                        <button
                          onClick={() => startEditing('y')}
                          onMouseEnter={() => handleAxisHover('y')}
                          onMouseLeave={handleAxisLeave}
                          disabled={!validAxes.y}
                          title={getAxisTooltip('y', validAxes.y)}
                        >
                          Y Axis
                        </button>
                        <button
                          onClick={() => startEditing('z')}
                          onMouseEnter={() => handleAxisHover('z')}
                          onMouseLeave={handleAxisLeave}
                          disabled={!validAxes.z}
                          title={getAxisTooltip('z', validAxes.z)}
                        >
                          Z Axis
                        </button>
                      </div>
                      {(!validAxes.x || !validAxes.y || !validAxes.z) && (
                        <p className="axis-hint">
                          Some axes disabled due to open faces
                        </p>
                      )}
                    </div>
                  )}

                  <div className="control-section">
                    <h4>Create Assembly</h4>
                    {!showCreateAssembly ? (
                      <div className="button-row">
                        <button
                          onClick={() => setShowCreateAssembly(true)}
                          title="Create a nested box that fits inside this void"
                        >
                          Create Nested Box
                        </button>
                      </div>
                    ) : (
                      <div className="create-assembly-form">
                        <div className="form-row">
                          <label>Clearance (mm):</label>
                          <NumberInput
                            value={createClearance}
                            onChange={(v) => setCreateClearance(v)}
                            min={0}
                            step={0.5}
                          />
                        </div>
                        <div className="form-row">
                          <label>Assembly Axis:</label>
                          <select
                            value={createAxis}
                            onChange={(e) => setCreateAxis(e.target.value as AssemblyAxis)}
                          >
                            <option value="y">Y (Top/Bottom lids)</option>
                            <option value="x">X (Left/Right lids)</option>
                            <option value="z">Z (Front/Back lids)</option>
                          </select>
                        </div>
                        {openParentFaces.length > 0 && (
                          <div className="face-offsets-section">
                            <label className="section-label">Face Offsets (mm):</label>
                            <p className="offset-hint">Adjust assembly position relative to open faces</p>
                            {openParentFaces.map((faceId) => (
                              <div key={faceId} className="form-row offset-row">
                                <label>{getFaceLabel(faceId)}:</label>
                                <div className="offset-input-group">
                                  <button
                                    onClick={() => handleFaceOffsetChange(faceId, createFaceOffsets[faceId] - 1)}
                                    className="offset-btn"
                                  >
                                    -
                                  </button>
                                  <NumberInput
                                    value={createFaceOffsets[faceId]}
                                    onChange={(v) => handleFaceOffsetChange(faceId, v)}
                                    step={0.5}
                                    className="offset-input"
                                  />
                                  <button
                                    onClick={() => handleFaceOffsetChange(faceId, createFaceOffsets[faceId] + 1)}
                                    className="offset-btn"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="confirm-buttons">
                          <button
                            className="apply-btn"
                            onClick={handleCreateAssembly}
                          >
                            Create
                          </button>
                          <button
                            className="cancel-btn"
                            onClick={() => setShowCreateAssembly(false)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : null}
              {/* Note: Editing UI (count adjustment) is now shown by the unified section above */}

              <div className="void-info">
                <p>
                  Size: {selectedVoid.bounds.w.toFixed(1)} x {selectedVoid.bounds.h.toFixed(1)} x {selectedVoid.bounds.d.toFixed(1)} mm
                </p>
              </div>
            </>
          ) : null}

          {/* Show Remove Subdivision only for non-root voids that were created by subdivision */}
          {selectedVoidId !== 'root' && selectedVoid.splitAxis && (
            <div className="control-section">
              <button
                className="remove-subdivision-btn"
                onClick={() => removeVoid(selectedVoidId)}
                title="Remove this subdivision and merge back"
              >
                Remove Subdivision
              </button>
            </div>
          )}
        </div>
      ) : !twoPanelInfo.isValid && !isEditingPreview ? (
        <p className="hint">
          {selectedPanelIds.size === 2
            ? 'Selected panels must be opposite faces (e.g., Front & Back) to subdivide between them'
            : selectedPanelIds.size === 1
            ? 'Select another opposite panel (Shift+click) to subdivide between them, or select a void'
            : 'Select a void or two opposite panels to subdivide'}
        </p>
      ) : null}

      {subdivisions.length > 0 && (
        <div className="control-section">
          <h4>Current subdivisions ({subdivisions.length})</h4>
          <ul className="subdivision-list">
            {subdivisions.slice(0, 10).map((sub) => (
              <li key={sub.id}>
                <span>
                  {sub.axis.toUpperCase()} @ {sub.position.toFixed(1)}mm
                </span>
              </li>
            ))}
            {subdivisions.length > 10 && (
              <li className="more-indicator">+{subdivisions.length - 10} more...</li>
            )}
          </ul>
        </div>
      )}
    </Panel>
  );
};
