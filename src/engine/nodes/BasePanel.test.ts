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

  it('Engine.generatePanelsFromNodes() returns store-compatible PanelCollection', () => {
    // Generate panels using the engine-first approach
    const collection = engine.generatePanelsFromNodes();

    // Verify we get all 6 face panels
    expect(collection.panels.length).toBe(6);

    // Verify panel structure matches store PanelPath format
    const frontPanel = collection.panels.find(p => p.source.faceId === 'front');
    expect(frontPanel).toBeDefined();
    expect(frontPanel!.source.type).toBe('face');
    expect(frontPanel!.outline).toBeDefined();
    expect(frontPanel!.outline.points.length).toBeGreaterThan(4); // Has finger joints
    expect(frontPanel!.outline.closed).toBe(true);
    expect(frontPanel!.width).toBeGreaterThan(0);
    expect(frontPanel!.height).toBeGreaterThan(0);
    expect(frontPanel!.thickness).toBe(3);
    expect(frontPanel!.position).toHaveLength(3);
    expect(frontPanel!.rotation).toHaveLength(3);
    expect(frontPanel!.edgeExtensions).toBeDefined();

    console.log('generatePanelsFromNodes() panel count:', collection.panels.length);
  });

  it('edge extensions are preserved in generated panels', () => {
    const assembly = engine.assembly!;

    // Set edge extension on front panel
    assembly.setPanelEdgeExtension('face-front', 'top', 5);
    assembly.setPanelEdgeExtension('face-front', 'left', 3);

    // Generate panels
    const collection = engine.generatePanelsFromNodes();
    const frontPanel = collection.panels.find(p => p.source.faceId === 'front');

    // Verify edge extensions are preserved
    expect(frontPanel).toBeDefined();
    expect(frontPanel!.edgeExtensions.top).toBe(5);
    expect(frontPanel!.edgeExtensions.left).toBe(3);
    expect(frontPanel!.edgeExtensions.bottom).toBe(0);
    expect(frontPanel!.edgeExtensions.right).toBe(0);
  });

  it('SET_EDGE_EXTENSION action updates panel edge extensions', () => {
    // Dispatch SET_EDGE_EXTENSION action
    engine.dispatch({
      type: 'SET_EDGE_EXTENSION',
      targetId: 'main-assembly',
      payload: { panelId: 'face-back', edge: 'bottom', value: 7 },
    });

    // Generate panels and verify
    const collection = engine.generatePanelsFromNodes();
    const backPanel = collection.panels.find(p => p.source.faceId === 'back');

    expect(backPanel).toBeDefined();
    expect(backPanel!.edgeExtensions.bottom).toBe(7);
  });

  it('generates divider panels from void subdivisions', () => {
    // Use a larger box to ensure finger joints on all axes
    const largeEngine = createEngine();
    largeEngine.createAssembly(200, 150, 120, {
      thickness: 3,
      fingerWidth: 12.8,
      fingerGap: 1.5,
    });

    // Subdivide the root void
    largeEngine.dispatch({
      type: 'ADD_SUBDIVISION',
      targetId: 'main-assembly',
      payload: { voidId: 'root', axis: 'x', position: 100 },
    });

    // Generate panels
    const collection = largeEngine.generatePanelsFromNodes();

    // Should have 6 face panels + 1 divider panel
    expect(collection.panels.length).toBe(7);

    // Find the divider panel
    const dividerPanel = collection.panels.find(p => p.source.type === 'divider');
    expect(dividerPanel).toBeDefined();
    expect(dividerPanel!.source.axis).toBe('x');

    // With larger dimensions, divider panel should have finger joints
    console.log('Divider outline points:', dividerPanel!.outline.points.length);
    expect(dividerPanel!.outline.points.length).toBeGreaterThan(4);
  });
});
