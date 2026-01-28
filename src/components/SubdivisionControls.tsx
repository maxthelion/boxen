import React, { useMemo, useCallback } from 'react';
import { useBoxStore, getAllSubdivisions, findVoid } from '../store/useBoxStore';
import { useEngineConfig, useEngineVoidTree, useEngineMainVoidTree } from '../engine';
import { Panel } from './UI/Panel';

export const SubdivisionControls: React.FC = () => {
  // Model state from engine
  const config = useEngineConfig();
  const rootVoid = useEngineVoidTree();
  // Use main (committed) void tree for UI state that determines button visibility
  const mainVoidTree = useEngineMainVoidTree();

  // UI state and actions from store
  const {
    selectedVoidIds,
    removeVoid,
    removeSubAssembly,
    selectSubAssembly,
    purgeVoid,
  } = useBoxStore();

  // Get the single selected void ID (this component only shows when exactly 1 is selected)
  const selectedVoidId = selectedVoidIds.size === 1 ? Array.from(selectedVoidIds)[0] : null;

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

  const subdivisions = useMemo(() => getAllSubdivisions(rootVoid), [rootVoid]);

  const handlePurgeVoid = useCallback(() => {
    if (!selectedVoidId) return;
    purgeVoid(selectedVoidId);
  }, [selectedVoidId, purgeVoid]);

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
            <div className="control-section">
              <div className="void-info">
                <p>
                  Size: {selectedVoid.bounds.w.toFixed(1)} x {selectedVoid.bounds.h.toFixed(1)} x {selectedVoid.bounds.d.toFixed(1)} mm
                </p>
                <p className="hint">
                  Use the toolbar to subdivide or create a nested box
                </p>
              </div>
            </div>
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
