import React from 'react';
import { BoxTree } from './BoxTree';
import { CollapsibleSection } from './UI/CollapsibleSection';
import { NumberInput } from './UI/NumberInput';
import { useBoxStore } from '../store/useBoxStore';
import { useEngineConfig } from '../engine';
import { defaultFeetConfig } from '../types';

export const LeftSidebar: React.FC = () => {
  const config = useEngineConfig();
  const setConfig = useBoxStore((s) => s.setConfig);
  const setFeetConfig = useBoxStore((s) => s.setFeetConfig);

  if (!config) return null;

  const assemblyAxis = config.assembly?.assemblyAxis ?? 'y';
  const showFeet = assemblyAxis === 'y';

  // Friendly axis names
  const getAxisLabel = (axis: string): string => {
    switch (axis) {
      case 'y': return 'Top Down';
      case 'x': return 'Side to Side';
      case 'z': return 'Front to Back';
      default: return axis.toUpperCase();
    }
  };

  return (
    <div className="left-sidebar-content">
      <CollapsibleSection
        title="Structure"
        defaultExpanded={true}
        storageKey="structure"
      >
        <BoxTree />
      </CollapsibleSection>

      <CollapsibleSection
        title="Dimensions"
        defaultExpanded={true}
        storageKey="dimensions"
      >
        <div className="form-grid compact">
          <label>
            <span>Width</span>
            <div className="input-with-unit">
              <NumberInput
                value={config.width}
                onChange={(v) => setConfig({ width: v })}
                min={1}
              />
              <span className="unit">mm</span>
            </div>
          </label>
          <label>
            <span>Height</span>
            <div className="input-with-unit">
              <NumberInput
                value={config.height}
                onChange={(v) => setConfig({ height: v })}
                min={1}
              />
              <span className="unit">mm</span>
            </div>
          </label>
          <label>
            <span>Depth</span>
            <div className="input-with-unit">
              <NumberInput
                value={config.depth}
                onChange={(v) => setConfig({ depth: v })}
                min={1}
              />
              <span className="unit">mm</span>
            </div>
          </label>
          <label>
            <span>Thickness</span>
            <div className="input-with-unit">
              <NumberInput
                value={config.materialThickness}
                onChange={(v) => setConfig({ materialThickness: v })}
                min={0.1}
                step={0.5}
              />
              <span className="unit">mm</span>
            </div>
          </label>
        </div>
        <div className="section-info">
          <span className="info-label">Orientation:</span>
          <span className="info-value">{getAxisLabel(assemblyAxis)}</span>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Finger Joints"
        defaultExpanded={false}
        storageKey="finger-joints"
      >
        <div className="form-grid compact">
          <label>
            <span>Finger Width</span>
            <div className="input-with-unit">
              <NumberInput
                value={config.fingerWidth}
                onChange={(v) => setConfig({ fingerWidth: v })}
                min={1}
              />
              <span className="unit">mm</span>
            </div>
          </label>
          <label>
            <span>Corner Gap</span>
            <div className="input-with-unit">
              <NumberInput
                value={config.fingerGap}
                onChange={(v) => setConfig({ fingerGap: v })}
                min={0}
                max={5}
                step={0.1}
              />
              <span className="unit">x</span>
            </div>
          </label>
        </div>
        <p className="hint">Corner gap is a multiplier of finger width.</p>
      </CollapsibleSection>

      {showFeet && (
        <CollapsibleSection
          title="Feet"
          defaultExpanded={false}
          storageKey="feet"
        >
          <div className="form-grid compact">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={config.assembly.feet?.enabled ?? false}
                onChange={(e) => setFeetConfig({
                  ...defaultFeetConfig,
                  ...config.assembly.feet,
                  enabled: e.target.checked,
                })}
              />
              <span>Add feet to box</span>
            </label>
          </div>
          {config.assembly.feet?.enabled && (
            <div className="form-grid compact">
              <label>
                <span>Height</span>
                <div className="input-with-unit">
                  <NumberInput
                    value={config.assembly.feet.height}
                    onChange={(v) => setFeetConfig({
                      ...config.assembly.feet!,
                      height: v,
                    })}
                    min={5}
                    max={100}
                    step={5}
                  />
                  <span className="unit">mm</span>
                </div>
              </label>
              <label>
                <span>Width</span>
                <div className="input-with-unit">
                  <NumberInput
                    value={config.assembly.feet.width}
                    onChange={(v) => setFeetConfig({
                      ...config.assembly.feet!,
                      width: v,
                    })}
                    min={10}
                    max={100}
                    step={5}
                  />
                  <span className="unit">mm</span>
                </div>
              </label>
              <label>
                <span>Inset</span>
                <div className="input-with-unit">
                  <NumberInput
                    value={config.assembly.feet.inset}
                    onChange={(v) => setFeetConfig({
                      ...config.assembly.feet!,
                      inset: v,
                    })}
                    min={0}
                    max={50}
                    step={1}
                  />
                  <span className="unit">mm</span>
                </div>
              </label>
            </div>
          )}
          {config.assembly.feet?.enabled && (
            <p className="hint">Feet extend wall panels below the bottom face.</p>
          )}
        </CollapsibleSection>
      )}

      <CollapsibleSection
        title="Advanced"
        defaultExpanded={false}
        storageKey="advanced"
      >
        <p className="hint">Advanced settings will be available in a future update.</p>
      </CollapsibleSection>
    </div>
  );
};
