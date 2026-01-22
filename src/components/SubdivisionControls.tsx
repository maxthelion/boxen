import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { useBoxStore, getAllSubdivisions, calculatePreviewPositions } from '../store/useBoxStore';
import { Panel } from './UI/Panel';
import { Void, Face, AssemblyAxis, FaceId, FaceOffsets, defaultFaceOffsets, Bounds } from '../types';

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
    if (!subdivisionPreview || !selectedVoid) return;

    const count = Math.max(1, Math.min(20, newCount));
    const positions = calculatePreviewPositions(selectedVoid.bounds, subdivisionPreview.axis, count);
    setSubdivisionPreview({
      ...subdivisionPreview,
      count,
      positions,
    });
  }, [subdivisionPreview, selectedVoid, setSubdivisionPreview]);

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

  return (
    <Panel title="Subdivisions">
      {selectedVoidId && selectedVoid ? (
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
                          <input
                            type="number"
                            value={createClearance}
                            onChange={(e) => setCreateClearance(Math.max(0, parseFloat(e.target.value) || 0))}
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
                                  <input
                                    type="number"
                                    value={createFaceOffsets[faceId]}
                                    onChange={(e) => handleFaceOffsetChange(faceId, parseFloat(e.target.value) || 0)}
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
              ) : subdivisionPreview ? (
                // Step 2: Adjust count and confirm
                <div className="control-section">
                  <h4>Configure {getAxisLabel(subdivisionPreview.axis)} subdivision</h4>

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
                        <input
                          type="number"
                          value={subdivisionPreview.count}
                          onChange={(e) => updatePreviewCount(parseInt(e.target.value) || 1)}
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
              ) : null}

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
      ) : (
        <p className="hint">Click on a void in the 3D view to select it</p>
      )}

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
