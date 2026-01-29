import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import {
  ProjectTemplate,
  deriveVariables,
  getDefaultValues,
  InstantiationValues,
  DerivedVariables,
} from '../templates';
import { getEngine, notifyEngineStateChanged } from '../engine';
import { instantiateTemplateIntoPreview } from '../templates/templateEngine';
import { PanelCollectionRenderer } from './PanelPathRenderer';
import { Axis } from '../engine/types';

interface TemplateConfigModalProps {
  isOpen: boolean;
  template: ProjectTemplate | null;
  onClose: () => void;
  onApply: () => void;
}

/**
 * Preview viewport component - renders the template preview
 */
const TemplatePreview: React.FC = () => {
  // Use a fixed scale based on typical box sizes
  const scale = 100 / 300;

  return (
    <PanelCollectionRenderer
      scale={scale}
      selectedPanelIds={new Set()}
      hiddenFaceIds={new Set()}
    />
  );
};

export const TemplateConfigModal: React.FC<TemplateConfigModalProps> = ({
  isOpen,
  template,
  onClose,
  onApply,
}) => {
  // Derived variables from template
  const variables = useMemo<DerivedVariables | null>(() => {
    if (!template) return null;
    return deriveVariables(template);
  }, [template]);

  // Current values
  const [width, setWidth] = useState(100);
  const [height, setHeight] = useState(100);
  const [depth, setDepth] = useState(100);
  const [subdivisionCounts, setSubdivisionCounts] = useState<Partial<Record<Axis, number>>>({});

  // Initialize values when template changes
  useEffect(() => {
    if (template) {
      const defaults = getDefaultValues(template);
      setWidth(defaults.width);
      setHeight(defaults.height);
      setDepth(defaults.depth);
      setSubdivisionCounts(defaults.subdivisionCounts);
    }
  }, [template]);

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update preview when values change (debounced)
  const updatePreview = useCallback(() => {
    if (!template) return;

    const engine = getEngine();
    const values: InstantiationValues = {
      width,
      height,
      depth,
      subdivisionCounts,
    };

    instantiateTemplateIntoPreview(template, values, engine);
    notifyEngineStateChanged();
  }, [template, width, height, depth, subdivisionCounts]);

  // Update preview when modal opens or values change (with debounce)
  useEffect(() => {
    if (isOpen && template) {
      // Clear any pending update
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      // Debounce the preview update by 150ms
      debounceRef.current = setTimeout(() => {
        updatePreview();
      }, 150);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [isOpen, template, updatePreview]);

  // Handle apply
  const handleApply = useCallback(() => {
    const engine = getEngine();
    engine.commitPreview();
    notifyEngineStateChanged();
    onApply();
  }, [onApply]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    const engine = getEngine();
    engine.discardPreview();
    notifyEngineStateChanged();
    onClose();
  }, [onClose]);

  // Handle dimension changes
  const handleWidthChange = (value: number) => {
    const clamped = Math.max(50, Math.min(500, value));
    setWidth(clamped);
  };

  const handleHeightChange = (value: number) => {
    const clamped = Math.max(50, Math.min(500, value));
    setHeight(clamped);
  };

  const handleDepthChange = (value: number) => {
    const clamped = Math.max(50, Math.min(500, value));
    setDepth(clamped);
  };

  // Handle subdivision count changes
  const handleSubdivisionChange = (axis: Axis, value: number) => {
    const config = variables?.subdivisions?.[axis];
    if (!config) return;
    const clamped = Math.max(config.min, Math.min(config.max, value));
    setSubdivisionCounts((prev) => ({ ...prev, [axis]: clamped }));
  };

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCancel();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleCancel]);

  if (!isOpen || !template || !variables) return null;

  const hasSubdivisions = variables.subdivisions && Object.keys(variables.subdivisions).length > 0;

  return (
    <div className="modal-overlay" onClick={handleCancel}>
      <div className="template-config-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{template.name}</h2>
          <button className="modal-close" onClick={handleCancel}>
            ×
          </button>
        </div>

        <div className="template-config-content">
          {/* Left side: Form */}
          <div className="template-config-form">
            <div className="template-config-section">
              <h3>Dimensions</h3>
              <div className="template-dimensions-row">
                <label>
                  <span>W</span>
                  <input
                    type="number"
                    value={width}
                    onChange={(e) => handleWidthChange(Number(e.target.value))}
                    min={variables.dimensions.width.min}
                    max={variables.dimensions.width.max}
                  />
                </label>
                <label>
                  <span>H</span>
                  <input
                    type="number"
                    value={height}
                    onChange={(e) => handleHeightChange(Number(e.target.value))}
                    min={variables.dimensions.height.min}
                    max={variables.dimensions.height.max}
                  />
                </label>
                <label>
                  <span>D</span>
                  <input
                    type="number"
                    value={depth}
                    onChange={(e) => handleDepthChange(Number(e.target.value))}
                    min={variables.dimensions.depth.min}
                    max={variables.dimensions.depth.max}
                  />
                </label>
              </div>
            </div>

            {hasSubdivisions && (
              <div className="template-config-section">
                <h3>Structure</h3>
                <div className="template-form-grid">
                  {Object.entries(variables.subdivisions!).map(([axis, config]) => (
                    <label key={axis}>
                      <span>{config.variableName}</span>
                      <div className="subdivision-input">
                        <button
                          className="subdivision-btn"
                          onClick={() =>
                            handleSubdivisionChange(
                              axis as Axis,
                              (subdivisionCounts[axis as Axis] ?? config.default) - 1
                            )
                          }
                          disabled={(subdivisionCounts[axis as Axis] ?? config.default) <= config.min}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          value={subdivisionCounts[axis as Axis] ?? config.default}
                          onChange={(e) => handleSubdivisionChange(axis as Axis, Number(e.target.value))}
                          min={config.min}
                          max={config.max}
                        />
                        <button
                          className="subdivision-btn"
                          onClick={() =>
                            handleSubdivisionChange(
                              axis as Axis,
                              (subdivisionCounts[axis as Axis] ?? config.default) + 1
                            )
                          }
                          disabled={(subdivisionCounts[axis as Axis] ?? config.default) >= config.max}
                        >
                          +
                        </button>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="template-config-actions">
              <button className="template-btn-secondary" onClick={handleCancel}>
                Cancel
              </button>
              <button className="template-btn-primary" onClick={handleApply}>
                Create
              </button>
            </div>
          </div>

          {/* Right side: 3D Preview */}
          <div className="template-preview-container">
            <Canvas camera={{ position: [80, 60, 80], fov: 50 }}>
              <ambientLight intensity={0.5} />
              <directionalLight position={[10, 10, 5]} intensity={1} />
              <OrbitControls
                enableDamping
                dampingFactor={0.1}
                minDistance={50}
                maxDistance={500}
              />
              <Grid
                args={[200, 200]}
                cellSize={10}
                cellThickness={0.5}
                cellColor="#444"
                sectionSize={50}
                sectionThickness={1}
                sectionColor="#666"
                fadeDistance={200}
                position={[0, -30, 0]}
              />
              <Environment preset="studio" />
              <TemplatePreview />
            </Canvas>
          </div>
        </div>
      </div>
    </div>
  );
};
