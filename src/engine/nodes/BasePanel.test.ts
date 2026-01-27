/**
 * Test for BasePanel.computeOutline() finger joint generation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createEngine } from '../Engine';
import { Engine } from '../Engine';
import { generatePanelCollection } from '../../utils/panelGenerator';
import { BoxConfig, Face } from '../../types';

describe('BasePanel finger joint generation', () => {
  let engine: Engine;
  const boxConfig: BoxConfig = {
    width: 100,
    height: 80,
    depth: 60,
    materialThickness: 3,
    fingerWidth: 12.8,
    fingerGap: 1.5,
    assembly: {
      assemblyAxis: 'y',
      lids: {
        positive: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
        negative: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
      },
    },
  };
  
  const faces: Face[] = [
    { id: 'front', solid: true },
    { id: 'back', solid: true },
    { id: 'left', solid: true },
    { id: 'right', solid: true },
    { id: 'top', solid: true },
    { id: 'bottom', solid: true },
  ];

  beforeEach(() => {
    engine = createEngine();
    engine.createAssembly(100, 80, 60, {
      thickness: 3,
      fingerWidth: 12.8,
      fingerGap: 1.5,
    });
  });

  it('FacePanelNode.computeOutline() generates finger joints', () => {
    const assembly = engine.assembly!;
    const panels = assembly.getPanels();
    
    // Find the front panel
    const frontPanel = panels.find(p => p.kind === 'face-panel' && (p as any).props.faceId === 'front');
    expect(frontPanel).toBeDefined();
    
    // Check that outline has more than 4 points (finger joints)
    const outline = frontPanel!.derived.outline;
    expect(outline.points.length).toBeGreaterThan(4);
    
    console.log('Engine front panel outline points:', outline.points.length);
  });

  it('compares engine outline with panelGenerator outline', () => {
    // Generate panels using the existing panelGenerator
    const rootVoid = {
      id: 'root',
      bounds: {
        x: 3, y: 3, z: 3,
        w: 94, h: 74, d: 54,
      },
      children: [],
    };
    
    const collection = generatePanelCollection(faces, rootVoid, boxConfig, 1);
    const generatorFront = collection.panels.find(p => p.source.faceId === 'front');
    
    // Get engine panel
    const assembly = engine.assembly!;
    const panels = assembly.getPanels();
    const engineFront = panels.find(p => p.kind === 'face-panel' && (p as any).props.faceId === 'front');
    
    console.log('Generator front panel points:', generatorFront?.outline.points.length);
    console.log('Engine front panel points:', engineFront?.derived.outline.points.length);
    
    // Both should have finger joints (more than 4 points)
    expect(engineFront?.derived.outline.points.length).toBeGreaterThan(4);
    expect(generatorFront?.outline.points.length).toBeGreaterThan(4);
    
    // Log first few points from each for comparison
    console.log('Generator first 5 points:', generatorFront?.outline.points.slice(0, 5));
    console.log('Engine first 5 points:', engineFront?.derived.outline.points.slice(0, 5));
  });
});
