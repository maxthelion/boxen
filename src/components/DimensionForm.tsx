import React from 'react';
import { useBoxStore } from '../store/useBoxStore';
import { useEngineConfig } from '../engine';
import { Panel } from './UI/Panel';
import { NumberInput } from './UI/NumberInput';

export const DimensionForm: React.FC = () => {
  const config = useEngineConfig();
  const setConfig = useBoxStore((s) => s.setConfig);

  if (!config) return null;

  return (
    <Panel title="Dimensions">
      <div className="form-grid">
        <label>
          <span>Width (mm)</span>
          <NumberInput
            value={config.width}
            onChange={(v) => setConfig({ width: v })}
            min={1}
            step={1}
          />
        </label>
        <label>
          <span>Height (mm)</span>
          <NumberInput
            value={config.height}
            onChange={(v) => setConfig({ height: v })}
            min={1}
            step={1}
          />
        </label>
        <label>
          <span>Depth (mm)</span>
          <NumberInput
            value={config.depth}
            onChange={(v) => setConfig({ depth: v })}
            min={1}
            step={1}
          />
        </label>
        <label>
          <span>Material Thickness (mm)</span>
          <NumberInput
            value={config.materialThickness}
            onChange={(v) => setConfig({ materialThickness: v })}
            min={0.1}
            step={0.1}
          />
        </label>
        <label>
          <span>Finger Width (mm)</span>
          <NumberInput
            value={config.fingerWidth}
            onChange={(v) => setConfig({ fingerWidth: v })}
            min={1}
            step={1}
          />
        </label>
        <label>
          <span>Corner Gap (× finger width)</span>
          <NumberInput
            value={config.fingerGap}
            onChange={(v) => setConfig({ fingerGap: v })}
            min={0}
            max={5}
            step={0.1}
          />
        </label>
      </div>
    </Panel>
  );
};
