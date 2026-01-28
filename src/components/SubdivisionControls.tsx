import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { useBoxStore, getAllSubdivisions, findVoid } from '../store/useBoxStore';
import { useEngineConfig, useEngineFaces, useEngineVoidTree, useEngineMainVoidTree } from '../engine';
import { Panel } from './UI/Panel';
import { NumberInput } from './UI/NumberInput';
import { AssemblyAxis, FaceId, FaceOffsets, defaultFaceOffsets, Bounds } from '../types';

export const SubdivisionControls: React.FC = () => {
  // Model state from engine
  const config = useEngineConfig();
  const faces = useEngineFaces();
  const rootVoid = useEngineVoidTree();
  // Use main (committed) void tree for UI state that determines button visibility
  const mainVoidTree = useEngineMainVoidTree();

  // UI state and actions from store
  const {
    selectedVoidIds,
    selectedPanelIds,
    setSubAssemblyPreview,
    removeVoid,
    createSubAssembly,
    removeSubAssembly,
    selectSubAssembly,
    purgeVoid,
  } = useBoxStore();

  // Get the single selected void ID (this component only shows when exactly 1 is selected)
  const selectedVoidId = selectedVoidIds.size === 1 ? Array.from(selectedVoidIds)[0] : null;

  // State for create assembly options
  const [showCreateAssembly, setShowCreateAssembly] = useState(false);
  const [createClearance, setCreateClearance] = useState(2);
  const [createAxis, setCreateAxis] = useState<AssemblyAxis>('y');
  const [createFaceOffsets, setCreateFaceOffsets] = useState<FaceOffsets>(defaultFaceOffsets);

  // Reset creation form when selection changes
  useEffect(() => {
    setShowCreateAssembly(false);
    setCreateClearance(2);
    setCreateAxis('y');
    setCreateFaceOffsets(defaultFaceOffsets);
  }, [selectedVoidId, selectedPanelIds]);

  // Early return if engine not initialized
  if (!config || !rootVoid) return null;

  // selectedVoid from preview tree - used for display (bounds info) and calculations
  const selectedVoid = useMemo(() => {
    if (!selectedVoidId) return null;
    return findVoid(rootVoid, selectedVoidId);
  }, [selectedVoidId, rootVoid]);

  // mainSelectedVoid from committed tree - used for UI state that determines button visibility
  const mainSelectedVoid = useMemo(() => {
    if (!selectedVoidId || !mainVoidTree) return null;
    return findVoid(mainVoidTree, selectedVoidId);
  }, [selectedVoidId, mainVoidTree]);

  // UI state derived from MAIN (committed) void tree
  const isLeafVoid = mainSelectedVoid && mainSelectedVoid.children.length === 0 && !mainSelectedVoid.subAssembly;
  const hasSubAssembly = mainSelectedVoid?.subAssembly !== undefined;
  const hasChildren = mainSelectedVoid && mainSelectedVoid.children.length > 0;

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


  // Update sub-assembly preview when form is shown or values change
  // Uses the lightweight wireframe preview (not the full panel preview system)
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
      {/* Single void selection mode */}
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
              {/* Create Assembly section (Subdivide is now in the toolbar palette) */}
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
        <p className="hint">
          Select a void to manage its contents
        </p>
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
