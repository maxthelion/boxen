import React from 'react';
import { useBoxStore, getAllSubAssemblies } from '../store/useBoxStore';
import { Panel } from './UI/Panel';
import { FaceId } from '../types';

const faceOrder: FaceId[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];

export const AssemblyProperties: React.FC = () => {
  const {
    selectedAssemblyId,
    config,
    faces,
    rootVoid,
    setConfig,
    toggleFace,
    toggleSubAssemblyFace,
    setSubAssemblyClearance,
  } = useBoxStore();

  if (!selectedAssemblyId) {
    return null;
  }

  // Main assembly selected
  if (selectedAssemblyId === 'main') {
    return (
      <Panel title="Assembly Properties">
        <div className="assembly-properties">
          <div className="property-header">
            <span className="property-icon">◫</span>
            <span className="property-title">Main Box</span>
          </div>

          <div className="property-section">
            <h4>Dimensions</h4>
            <div className="form-grid">
              <label>
                <span>Width (mm)</span>
                <input
                  type="number"
                  value={config.width}
                  onChange={(e) => setConfig({ width: Math.max(1, parseFloat(e.target.value) || 0) })}
                  min={1}
                />
              </label>
              <label>
                <span>Height (mm)</span>
                <input
                  type="number"
                  value={config.height}
                  onChange={(e) => setConfig({ height: Math.max(1, parseFloat(e.target.value) || 0) })}
                  min={1}
                />
              </label>
              <label>
                <span>Depth (mm)</span>
                <input
                  type="number"
                  value={config.depth}
                  onChange={(e) => setConfig({ depth: Math.max(1, parseFloat(e.target.value) || 0) })}
                  min={1}
                />
              </label>
              <label>
                <span>Material Thickness (mm)</span>
                <input
                  type="number"
                  value={config.materialThickness}
                  onChange={(e) => setConfig({ materialThickness: Math.max(0.1, parseFloat(e.target.value) || 0) })}
                  min={0.1}
                  step={0.5}
                />
              </label>
              <label>
                <span>Finger Width (mm)</span>
                <input
                  type="number"
                  value={config.fingerWidth}
                  onChange={(e) => setConfig({ fingerWidth: Math.max(1, parseFloat(e.target.value) || 0) })}
                  min={1}
                />
              </label>
            </div>
          </div>

          <div className="property-section">
            <h4>Faces</h4>
            <div className="face-grid compact">
              <div className="face-row">
                <div className="face-spacer small" />
                <FaceButton faceId="top" face={faces.find(f => f.id === 'top')!} onToggle={toggleFace} />
                <div className="face-spacer small" />
              </div>
              <div className="face-row">
                <FaceButton faceId="left" face={faces.find(f => f.id === 'left')!} onToggle={toggleFace} />
                <FaceButton faceId="front" face={faces.find(f => f.id === 'front')!} onToggle={toggleFace} />
                <FaceButton faceId="right" face={faces.find(f => f.id === 'right')!} onToggle={toggleFace} />
              </div>
              <div className="face-row">
                <div className="face-spacer small" />
                <FaceButton faceId="bottom" face={faces.find(f => f.id === 'bottom')!} onToggle={toggleFace} />
                <div className="face-spacer small" />
              </div>
              <div className="face-row">
                <div className="face-spacer small" />
                <FaceButton faceId="back" face={faces.find(f => f.id === 'back')!} onToggle={toggleFace} />
                <div className="face-spacer small" />
              </div>
            </div>
          </div>
        </div>
      </Panel>
    );
  }

  // Sub-assembly selected
  const subAssemblies = getAllSubAssemblies(rootVoid);
  const subAssemblyData = subAssemblies.find(s => s.subAssembly.id === selectedAssemblyId);

  if (!subAssemblyData) {
    return (
      <Panel title="Assembly Properties">
        <p className="hint">Assembly not found</p>
      </Panel>
    );
  }

  const { subAssembly, bounds } = subAssemblyData;
  const typeNames = { drawer: 'Drawer', insert: 'Insert', tray: 'Tray' };

  return (
    <Panel title="Assembly Properties">
      <div className="assembly-properties">
        <div className="property-header">
          <span className="property-icon">◫</span>
          <span className="property-title">{typeNames[subAssembly.type]}</span>
        </div>

        <div className="property-section">
          <h4>Dimensions</h4>
          <div className="property-group">
            <div className="property-row">
              <span className="property-label">Outer Width:</span>
              <span className="property-value">{(bounds.w - subAssembly.clearance * 2).toFixed(1)} mm</span>
            </div>
            <div className="property-row">
              <span className="property-label">Outer Height:</span>
              <span className="property-value">{(bounds.h - subAssembly.clearance * 2).toFixed(1)} mm</span>
            </div>
            <div className="property-row">
              <span className="property-label">Outer Depth:</span>
              <span className="property-value">{(bounds.d - subAssembly.clearance * 2).toFixed(1)} mm</span>
            </div>
            <div className="property-row">
              <span className="property-label">Material:</span>
              <span className="property-value">{subAssembly.materialThickness} mm</span>
            </div>
          </div>
        </div>

        <div className="property-section">
          <h4>Clearance</h4>
          <div className="form-grid">
            <label>
              <span>Gap from parent void (mm)</span>
              <input
                type="number"
                value={subAssembly.clearance}
                onChange={(e) => setSubAssemblyClearance(subAssembly.id, parseFloat(e.target.value) || 0)}
                min={0}
                max={Math.min(bounds.w, bounds.h, bounds.d) / 2 - 1}
                step={0.5}
              />
            </label>
          </div>
        </div>

        <div className="property-section">
          <h4>Faces</h4>
          <div className="face-grid compact">
            <div className="face-row">
              <div className="face-spacer small" />
              <FaceButton
                faceId="top"
                face={subAssembly.faces.find(f => f.id === 'top')!}
                onToggle={(id) => toggleSubAssemblyFace(subAssembly.id, id)}
              />
              <div className="face-spacer small" />
            </div>
            <div className="face-row">
              <FaceButton
                faceId="left"
                face={subAssembly.faces.find(f => f.id === 'left')!}
                onToggle={(id) => toggleSubAssemblyFace(subAssembly.id, id)}
              />
              <FaceButton
                faceId="front"
                face={subAssembly.faces.find(f => f.id === 'front')!}
                onToggle={(id) => toggleSubAssemblyFace(subAssembly.id, id)}
              />
              <FaceButton
                faceId="right"
                face={subAssembly.faces.find(f => f.id === 'right')!}
                onToggle={(id) => toggleSubAssemblyFace(subAssembly.id, id)}
              />
            </div>
            <div className="face-row">
              <div className="face-spacer small" />
              <FaceButton
                faceId="bottom"
                face={subAssembly.faces.find(f => f.id === 'bottom')!}
                onToggle={(id) => toggleSubAssemblyFace(subAssembly.id, id)}
              />
              <div className="face-spacer small" />
            </div>
            <div className="face-row">
              <div className="face-spacer small" />
              <FaceButton
                faceId="back"
                face={subAssembly.faces.find(f => f.id === 'back')!}
                onToggle={(id) => toggleSubAssemblyFace(subAssembly.id, id)}
              />
              <div className="face-spacer small" />
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
};

// Compact face button for assembly properties
const FaceButton: React.FC<{
  faceId: FaceId;
  face: { id: FaceId; solid: boolean };
  onToggle: (faceId: FaceId) => void;
}> = ({ faceId, face, onToggle }) => {
  const labels: Record<FaceId, string> = {
    front: 'F',
    back: 'Bk',
    left: 'L',
    right: 'R',
    top: 'T',
    bottom: 'Bt',
  };

  return (
    <button
      className={`face-button small ${face.solid ? 'solid' : 'open'}`}
      onClick={() => onToggle(faceId)}
      title={`${faceId}: ${face.solid ? 'Solid' : 'Open'}`}
    >
      {labels[faceId]}
    </button>
  );
};
