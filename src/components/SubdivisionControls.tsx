import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { useBoxStore, getAllSubdivisions, calculatePreviewPositions } from '../store/useBoxStore';
import { Panel } from './UI/Panel';
import { Void, Face, SubAssemblyType } from '../types';

// Find a void by ID in the tree
const findVoid = (root: Void, id: string): Void | null => {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findVoid(child, id);
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
    subdivisionPreview,
    setSubdivisionPreview,
    applySubdivision,
    removeVoid,
    resetVoids,
    createSubAssembly,
    removeSubAssembly,
    selectSubAssembly
  } = useBoxStore();

  // Get the single selected void ID (this component only shows when exactly 1 is selected)
  const selectedVoidId = selectedVoidIds.size === 1 ? Array.from(selectedVoidIds)[0] : null;

  // Track whether user has clicked to enter edit mode (vs just hovering)
  const [isEditingPreview, setIsEditingPreview] = useState(false);

  // Reset edit mode when selection changes
  useEffect(() => {
    setIsEditingPreview(false);
  }, [selectedVoidId]);

  const selectedVoid = useMemo(() => {
    if (!selectedVoidId) return null;
    return findVoid(rootVoid, selectedVoidId);
  }, [selectedVoidId, rootVoid]);

  const isLeafVoid = selectedVoid && selectedVoid.children.length === 0 && !selectedVoid.subAssembly;
  const hasSubAssembly = selectedVoid?.subAssembly !== undefined;

  const subdivisions = useMemo(() => getAllSubdivisions(rootVoid), [rootVoid]);

  const validAxes = useMemo(() => getValidAxes(faces), [faces]);

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

  return (
    <Panel title="Subdivisions">
      {selectedVoidId && selectedVoid ? (
        <div className="subdivision-controls">
          {hasSubAssembly ? (
            // Void contains a sub-assembly
            <div className="control-section">
              <div className="subassembly-info">
                <h4>Contains: {selectedVoid.subAssembly!.type.charAt(0).toUpperCase() + selectedVoid.subAssembly!.type.slice(1)}</h4>
                <p className="hint">
                  Click the sub-assembly in the 3D view to edit it
                </p>
                <button
                  className="select-subassembly-btn"
                  onClick={() => selectSubAssembly(selectedVoid.subAssembly!.id)}
                >
                  Select {selectedVoid.subAssembly!.type}
                </button>
                <button
                  className="remove-subassembly-btn"
                  onClick={() => removeSubAssembly(selectedVoidId)}
                >
                  Remove {selectedVoid.subAssembly!.type}
                </button>
              </div>
            </div>
          ) : isLeafVoid ? (
            <>
              {!isEditingPreview ? (
                // Step 1: Select axis (hover to preview, click to select)
                <>
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

                  <div className="control-section">
                    <h4>Create Sub-Assembly</h4>
                    <div className="button-row subassembly-buttons">
                      <button
                        onClick={() => createSubAssembly(selectedVoidId, 'drawer')}
                        title="Create a drawer that fits in this void"
                      >
                        Drawer
                      </button>
                      <button
                        onClick={() => createSubAssembly(selectedVoidId, 'tray')}
                        title="Create a tray (open top) that fits in this void"
                      >
                        Tray
                      </button>
                      <button
                        onClick={() => createSubAssembly(selectedVoidId, 'insert')}
                        title="Create an enclosed insert that fits in this void"
                      >
                        Insert
                      </button>
                    </div>
                  </div>
                </>
              ) : (
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
              )}

              <div className="void-info">
                <p>
                  Size: {selectedVoid.bounds.w.toFixed(1)} x {selectedVoid.bounds.h.toFixed(1)} x {selectedVoid.bounds.d.toFixed(1)} mm
                </p>
              </div>
            </>
          ) : (
            <div className="hint">
              This void has been subdivided. Select a child cell to subdivide further.
            </div>
          )}

          {selectedVoidId !== 'root' && (
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

      <div className="control-section">
        <button className="reset-btn" onClick={resetVoids}>
          Reset All Subdivisions
        </button>
      </div>
    </Panel>
  );
};
