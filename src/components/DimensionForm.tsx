import React from 'react';
import { useBoxStore } from '../store/useBoxStore';
import { Panel } from './UI/Panel';

export const DimensionForm: React.FC = () => {
  const { config, setConfig } = useBoxStore();

  const handleChange = (field: keyof typeof config) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value) || 0;
    setConfig({ [field]: Math.max(1, value) });
  };

  return (
    <Panel title="Dimensions">
      <div className="form-grid">
        <label>
          <span>Width (mm)</span>
          <input
            type="number"
            value={config.width}
            onChange={handleChange('width')}
            min={1}
            step={1}
          />
        </label>
        <label>
          <span>Height (mm)</span>
          <input
            type="number"
            value={config.height}
            onChange={handleChange('height')}
            min={1}
            step={1}
          />
        </label>
        <label>
          <span>Depth (mm)</span>
          <input
            type="number"
            value={config.depth}
            onChange={handleChange('depth')}
            min={1}
            step={1}
          />
        </label>
        <label>
          <span>Material Thickness (mm)</span>
          <input
            type="number"
            value={config.materialThickness}
            onChange={handleChange('materialThickness')}
            min={0.1}
            step={0.1}
          />
        </label>
        <label>
          <span>Finger Width (mm)</span>
          <input
            type="number"
            value={config.fingerWidth}
            onChange={handleChange('fingerWidth')}
            min={1}
            step={1}
          />
        </label>
      </div>
    </Panel>
  );
};
