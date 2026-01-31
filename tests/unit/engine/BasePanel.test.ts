/**
 * Test for BasePanel.computeOutline() finger joint generation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createEngine } from '../../../src/engine/Engine';
import { Engine } from '../../../src/engine/Engine';
import { generatePanelCollection } from '../../../src/utils/panelGenerator';
import { BoxConfig, Face } from '../../../src/types';

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

  it('generates slot holes in face panels for dividers', () => {
    // Use a larger box to ensure finger joints on all axes
    const slotEngine = createEngine();
    slotEngine.createAssembly(200, 150, 120, {
      thickness: 3,
      fingerWidth: 12.8,
      fingerGap: 1.5,
    });

    // Subdivide with X-axis divider (should create slots in front and back faces)
    slotEngine.dispatch({
      type: 'ADD_SUBDIVISION',
      targetId: 'main-assembly',
      payload: { voidId: 'root', axis: 'x', position: 100 },
    });

    // Debug: Check subdivisions
    const assembly = slotEngine.assembly!;
    const subdivisions = assembly.getSubdivisions();
    console.log('Subdivisions:', subdivisions.length);
    if (subdivisions.length > 0) {
      const sub = subdivisions[0];
      console.log('Subdivision:', { id: sub.id, axis: sub.axis, position: sub.position });
      console.log('Bounds:', sub.bounds);
      console.log('Depth check: bounds.z + bounds.d =', sub.bounds.z + sub.bounds.d, 'vs depth - inset =', 120);
    }

    // Generate panels
    const collection = slotEngine.generatePanelsFromNodes();

    // Find front face panel
    const frontPanel = collection.panels.find(p => p.source.faceId === 'front');
    expect(frontPanel).toBeDefined();

    // Front panel should have slot holes for the X-axis divider
    console.log('Front panel holes:', frontPanel!.holes.length);
    expect(frontPanel!.holes.length).toBeGreaterThan(0);

    // Each hole should be a divider-slot
    for (const hole of frontPanel!.holes) {
      expect(hole.source?.type).toBe('divider-slot');
      expect(hole.path.points.length).toBe(4); // Rectangular slot
    }

    // Find back face panel - should also have slots
    const backPanel = collection.panels.find(p => p.source.faceId === 'back');
    expect(backPanel).toBeDefined();
    expect(backPanel!.holes.length).toBeGreaterThan(0);
  });

  it('generates feet on wall panels when feet config is set', () => {
    // Create engine with feet enabled
    const feetEngine = createEngine();
    feetEngine.createAssembly(100, 80, 60, {
      thickness: 3,
      fingerWidth: 12.8,
      fingerGap: 1.5,
    });

    // Enable feet
    feetEngine.dispatch({
      type: 'SET_FEET_CONFIG',
      targetId: 'main-assembly',
      payload: { enabled: true, height: 10, width: 15, inset: 5, gap: 20 },
    });

    // Generate panels
    const collection = feetEngine.generatePanelsFromNodes();

    // Front panel (wall) should have feet - more than basic rectangle points
    const frontPanel = collection.panels.find(p => p.source.faceId === 'front');
    expect(frontPanel).toBeDefined();

    // Without feet: 20 points with finger joints
    // With feet: more points due to feet path extending bottom edge
    const frontPoints = frontPanel!.outline.points;
    console.log('Front panel with feet, outline points:', frontPoints.length);

    // Find lowest Y coordinate - should be below -halfH
    const minY = Math.min(...frontPoints.map(p => p.y));
    const halfH = 80 / 2; // height/2
    const expectedMinY = -halfH - 3 - 10; // -halfH - mt - feetHeight
    console.log('Front panel minY:', minY, 'expected:', expectedMinY);
    expect(minY).toBeLessThan(-halfH); // Feet extend below normal bottom

    // Top/bottom panels (lids for Y-axis) should NOT have feet
    const topPanel = collection.panels.find(p => p.source.faceId === 'top');
    expect(topPanel).toBeDefined();
    const topMinY = Math.min(...topPanel!.outline.points.map(p => p.y));
    const topHalfH = 60 / 2; // depth/2 for top panel
    console.log('Top panel (lid) minY:', topMinY, 'halfH:', topHalfH);
    // Top panel should not have feet extending below
    expect(topMinY).toBeGreaterThanOrEqual(-topHalfH - 5); // Small tolerance for finger joints
  });

  it('generates sub-assembly panels within voids', () => {
    // Create engine with a box
    const subAsmEngine = createEngine();
    subAsmEngine.createAssembly(200, 150, 120, {
      thickness: 3,
      fingerWidth: 12.8,
      fingerGap: 1.5,
    });

    // Create a sub-assembly in the root void
    subAsmEngine.dispatch({
      type: 'CREATE_SUB_ASSEMBLY',
      targetId: 'main-assembly',
      payload: { voidId: 'root', clearance: 2 },
    });

    // Generate panels
    const collection = subAsmEngine.generatePanelsFromNodes();

    // Should have 6 main panels + 6 sub-assembly panels = 12 panels
    console.log('Total panels with sub-assembly:', collection.panels.length);
    expect(collection.panels.length).toBe(12);

    // Count panels by source type
    const facePanels = collection.panels.filter(p => p.source.type === 'face');
    console.log('Face panels count:', facePanels.length);
    expect(facePanels.length).toBe(12); // 6 main + 6 sub-assembly

    // Debug: print all panel IDs
    console.log('Panel IDs:', collection.panels.map(p => p.id));

    // Sub-assembly panels should have smaller dimensions
    // Main assembly interior is 200-6=194 x 150-6=144 x 120-6=114
    // Sub-assembly with clearance 2 is 194-4=190 x 144-4=140 x 114-4=110
    const mainFront = collection.panels.find(p =>
      p.source.type === 'face' &&
      p.source.faceId === 'front' &&
      !p.source.subAssemblyId
    );
    // Sub-assembly panels have subAssemblyId in their source
    const subFront = collection.panels.find(p =>
      p.source.type === 'face' &&
      p.source.faceId === 'front' &&
      p.source.subAssemblyId
    );

    expect(mainFront).toBeDefined();
    expect(subFront).toBeDefined();

    console.log('Main front dimensions:', mainFront?.width, mainFront?.height);
    console.log('Sub front dimensions:', subFront?.width, subFront?.height);

    // Sub-assembly should be smaller due to clearance
    expect(subFront!.width).toBeLessThan(mainFront!.width);
    expect(subFront!.height).toBeLessThan(mainFront!.height);
  });
});
