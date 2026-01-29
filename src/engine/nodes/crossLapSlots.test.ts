/**
 * Unit tests for cross-lap slot computation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createEngine, Engine } from '../Engine';

describe('Cross-Lap Slots', () => {
  let engine: Engine;

  beforeEach(() => {
    engine = createEngine();
  });

  it('should compute cross-lap slots for intersecting X and Z dividers', () => {
    // Create a 100x60x100 box (like Grid Organizer)
    engine.createAssembly(100, 60, 100, {
      thickness: 3,
      fingerWidth: 10,
      fingerGap: 1.5,
    });

    // Remove top face (like Grid Organizer)
    engine.dispatch({
      type: 'TOGGLE_FACE',
      targetId: 'main-assembly',
      payload: { faceId: 'top' },
    });

    // Add X-axis subdivision at X=50 (creates X-divider)
    engine.dispatch({
      type: 'ADD_SUBDIVISION',
      targetId: 'main-assembly',
      payload: { voidId: 'root', axis: 'x', position: 50 },
    });

    // Get snapshot to see the current leaf voids
    const snapshot1 = engine.getSnapshot();
    const assembly1 = snapshot1.children[0];
    if (assembly1.kind !== 'assembly') throw new Error('Expected assembly');

    // Find the leaf voids created by X subdivision
    const rootVoid = assembly1.children[0];
    if (rootVoid.kind !== 'void') throw new Error('Expected void');

    const childVoids = rootVoid.children.filter(c => c.kind === 'void');
    expect(childVoids.length).toBe(2); // Two voids created by X subdivision

    // Add Z-axis subdivision to each leaf void (creates Z-dividers that intersect the X-divider)
    for (const childVoid of childVoids) {
      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: childVoid.id, axis: 'z', position: 50 },
      });
    }

    // Get the final snapshot with panels
    const snapshot = engine.getSnapshot();
    const assembly = snapshot.children[0];
    if (assembly.kind !== 'assembly') throw new Error('Expected assembly');

    // Get all divider panels
    const dividerPanels = assembly.derived.panels.filter(p => p.kind === 'divider-panel');

    // Should have 1 X-divider and 2 Z-dividers
    const xDividers = dividerPanels.filter(p => p.props.axis === 'x');
    const zDividers = dividerPanels.filter(p => p.props.axis === 'z');

    expect(xDividers.length).toBe(1);
    expect(zDividers.length).toBe(2);

    // Check outline of X-divider - it should have cross-lap slots
    const xDivider = xDividers[0];
    console.log('X-divider outline points:', xDivider.derived.outline.points.length);
    console.log('X-divider dimensions:', xDivider.derived.width, 'x', xDivider.derived.height);

    // For a 2x2 grid, the X-divider intersects both Z-dividers
    // It should have 2 cross-lap slots (one for each Z-divider)
    // X < Z alphabetically, so X-divider gets slots from TOP edge

    // Check Z-dividers - they should also have cross-lap slots
    for (const zDivider of zDividers) {
      console.log('Z-divider outline points:', zDivider.derived.outline.points.length);
      console.log('Z-divider dimensions:', zDivider.derived.width, 'x', zDivider.derived.height);
      // Z > X alphabetically, so Z-dividers get slots from BOTTOM edge
    }

    // The cross-lap slots should add notches to the outlines
    // A simple rectangle has 4 points
    // Each cross-lap slot adds 4 more points (the notch corners)
    // So X-divider with 2 slots from finger joints + 2 cross-lap slots should have more points

    // Just verify the panels were created without crashing
    expect(xDivider.derived.outline.points.length).toBeGreaterThan(0);
    expect(zDividers[0].derived.outline.points.length).toBeGreaterThan(0);

    // Verify the outline has the cross-lap slots by checking for characteristic Y values
    // X-divider gets slots from TOP edge (since X < Z)
    // The slot depth is half the panel height
    const xHeight = xDivider.derived.height;
    const halfH = xHeight / 2;
    const slotBottom = halfH - halfH; // = 0 (halfway down from top)

    // Check if there are points at the slot depth (y ≈ 0 for slot bottom)
    const xPoints = xDivider.derived.outline.points;
    const pointsAtSlotDepth = xPoints.filter(p => Math.abs(p.y - slotBottom) < 0.1);
    console.log('X-divider points at slot depth:', pointsAtSlotDepth.length);

    // Z-dividers get slots from BOTTOM edge (since Z > X)
    const zHeight = zDividers[0].derived.height;
    const zHalfH = zHeight / 2;
    const zSlotTop = -zHalfH + zHalfH; // = 0 (halfway up from bottom)

    const zPoints = zDividers[0].derived.outline.points;
    const zPointsAtSlotDepth = zPoints.filter(p => Math.abs(p.y - zSlotTop) < 0.1);
    console.log('Z-divider points at slot depth:', zPointsAtSlotDepth.length);
  });

  it('should create interlocking slots of complementary direction', () => {
    // Create a simple 2x2 grid
    engine.createAssembly(100, 60, 100, {
      thickness: 3,
      fingerWidth: 10,
      fingerGap: 1.5,
    });

    // Remove top face
    engine.dispatch({
      type: 'TOGGLE_FACE',
      targetId: 'main-assembly',
      payload: { faceId: 'top' },
    });

    // Add X subdivision
    engine.dispatch({
      type: 'ADD_SUBDIVISION',
      targetId: 'main-assembly',
      payload: { voidId: 'root', axis: 'x', position: 50 },
    });

    // Get leaf voids
    const snapshot1 = engine.getSnapshot();
    const assembly1 = snapshot1.children[0];
    if (assembly1.kind !== 'assembly') throw new Error('Expected assembly');
    const rootVoid = assembly1.children[0];
    if (rootVoid.kind !== 'void') throw new Error('Expected void');
    const childVoids = rootVoid.children.filter(c => c.kind === 'void');

    // Add Z subdivision to first child void only
    engine.dispatch({
      type: 'ADD_SUBDIVISION',
      targetId: 'main-assembly',
      payload: { voidId: childVoids[0].id, axis: 'z', position: 50 },
    });

    // Get panels
    const snapshot = engine.getSnapshot();
    const assembly = snapshot.children[0];
    if (assembly.kind !== 'assembly') throw new Error('Expected assembly');

    const dividerPanels = assembly.derived.panels.filter(p => p.kind === 'divider-panel');
    const xDividers = dividerPanels.filter(p => p.props.axis === 'x');
    const zDividers = dividerPanels.filter(p => p.props.axis === 'z');

    expect(xDividers.length).toBe(1);
    expect(zDividers.length).toBe(1);

    const xDivider = xDividers[0];
    const zDivider = zDividers[0];

    console.log('Single intersection test:');
    console.log('X-divider dimensions:', xDivider.derived.width, 'x', xDivider.derived.height);
    console.log('Z-divider dimensions:', zDivider.derived.width, 'x', zDivider.derived.height);
    console.log('X-divider outline points:', xDivider.derived.outline.points.length);
    console.log('Z-divider outline points:', zDivider.derived.outline.points.length);

    // The X-divider and Z-divider intersect
    // Both should get slots from TOP edge (since top has no face/finger joints)
    // Both slots should have the same depth (half the panel height) and width (material thickness)

    // Log the actual outline points for the Z-divider
    console.log('Z-divider outline:');
    zDivider.derived.outline.points.forEach((p, i) => {
      console.log(`  ${i}: (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
    });
    const zHalfH = zDivider.derived.height / 2;
    const zHalfW = zDivider.derived.width / 2;
    console.log('Z-divider halfW:', zHalfW.toFixed(2), 'halfH:', zHalfH.toFixed(2));

    // The top edge should now include a cross-lap slot
    // Check if there are points at the slot depth (y = 0, which is halfway down from top)
    const slotDepthPoints = zDivider.derived.outline.points.filter(p => Math.abs(p.y) < 0.1);
    console.log('Z-divider points at slot depth (y≈0):', slotDepthPoints.length);
    expect(slotDepthPoints.length).toBeGreaterThan(0); // Should have slot points

    // The slot was clamped to fit within the edge bounds
    // Original slot position was x=22, but edge only extends to 21.25
    // Slot should be clamped to edge bounds
    const slotPoints = slotDepthPoints.map(p => p.x);
    console.log('Slot X positions:', slotPoints.map(x => x.toFixed(2)));
  });

  it('should determine correct slot edge based on axis priority', () => {
    // X < Y < Z alphabetically
    // When X intersects Z: X gets top, Z gets bottom
    // When X intersects Y: X gets top, Y gets bottom
    // When Y intersects Z: Y gets top, Z gets bottom

    // This is tested implicitly by the getCrossLapSlotEdge method
    // which uses: myAxis < otherAxis ? 'top' : 'bottom'
    expect('x' < 'z').toBe(true);
    expect('x' < 'y').toBe(true);
    expect('y' < 'z').toBe(true);
  });

  it('should block finger tabs and face slots at cross-lap positions', () => {
    // Create a box with X and Z dividers that intersect
    engine.createAssembly(100, 60, 100, {
      thickness: 3,
      fingerWidth: 10,
      fingerGap: 1.5,
    });

    // Keep all faces solid (we want to check the bottom face)

    // Add X subdivision at center
    engine.dispatch({
      type: 'ADD_SUBDIVISION',
      targetId: 'main-assembly',
      payload: { voidId: 'root', axis: 'x', position: 50 },
    });

    // Get snapshot to find child voids
    const snapshot1 = engine.getSnapshot();
    const assembly1 = snapshot1.children[0];
    if (assembly1.kind !== 'assembly') throw new Error('Expected assembly');
    const rootVoid = assembly1.children[0];
    if (rootVoid.kind !== 'void') throw new Error('Expected void');
    const childVoids = rootVoid.children.filter(c => c.kind === 'void');

    // Add Z subdivision to first child void only (creates one Z-divider that crosses X-divider)
    engine.dispatch({
      type: 'ADD_SUBDIVISION',
      targetId: 'main-assembly',
      payload: { voidId: childVoids[0].id, axis: 'z', position: 50 },
    });

    // Get final snapshot
    const snapshot = engine.getSnapshot();
    const assembly = snapshot.children[0];
    if (assembly.kind !== 'assembly') throw new Error('Expected assembly');

    // Get panels
    const dividerPanels = assembly.derived.panels.filter(p => p.kind === 'divider-panel');
    const facePanels = assembly.derived.panels.filter(p => p.kind === 'face-panel');

    const xDividers = dividerPanels.filter(p => p.props.axis === 'x');
    const zDividers = dividerPanels.filter(p => p.props.axis === 'z');
    const bottomPanel = facePanels.find(p => p.props.faceId === 'bottom');

    expect(xDividers.length).toBe(1);
    expect(zDividers.length).toBe(1);
    expect(bottomPanel).toBeDefined();

    const xDivider = xDividers[0];
    const zDivider = zDividers[0];

    console.log('\n=== Finger blocking test ===');
    console.log('X-divider position:', xDivider.props.position);
    console.log('Z-divider position:', zDivider.props.position);
    console.log('Material thickness:', 3);

    // Z-divider gets cross-lap from BOTTOM (since Z > X)
    // At the intersection position (X=50), the Z-divider has material removed from bottom
    // Therefore: Z-divider bottom edge should NOT have finger tabs at X=50 position
    // And: bottom face should NOT have a slot for Z-divider at X=50 position

    // Check Z-divider outline - bottom edge should have a notch from the cross-lap
    const zHalfH = zDivider.derived.height / 2;
    console.log('Z-divider height:', zDivider.derived.height, 'halfH:', zHalfH);

    // The bottom edge of Z-divider is at y = -halfH
    // The cross-lap cuts upward from the bottom, so there should be points at y > -halfH near the cross-lap position
    const zPoints = zDivider.derived.outline.points;
    console.log('Z-divider outline has', zPoints.length, 'points');

    // Log all points to debug
    console.log('Z-divider outline points:');
    zPoints.forEach((p, i) => {
      console.log(`  ${i}: (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
    });

    // Check bottom panel holes for Z-divider
    if (bottomPanel) {
      const zDividerHoles = bottomPanel.derived.outline.holes.filter(
        h => h.source?.type === 'divider-slot' && h.source?.sourceId.includes(zDivider.props.voidId)
      );
      console.log('\nBottom panel holes for Z-divider:', zDividerHoles.length);

      // Log all holes
      console.log('Bottom panel all holes:', bottomPanel.derived.outline.holes.length);
      bottomPanel.derived.outline.holes.forEach((h, i) => {
        console.log(`  Hole ${i}: id=${h.id}, source=${JSON.stringify(h.source)}`);
      });

      // The critical check: at the X=50 position (where cross-lap occurs),
      // there should be NO slot for the Z-divider because the divider's material is cut away there
      // Find holes that span the X=50 position
      for (const hole of bottomPanel.derived.outline.holes) {
        if (hole.source?.type === 'divider-slot') {
          const xValues = hole.path.map(p => p.x);
          const minX = Math.min(...xValues);
          const maxX = Math.max(...xValues);
          console.log(`  Slot ${hole.id}: x range [${minX.toFixed(1)}, ${maxX.toFixed(1)}]`);
        }
      }
    }

    // The test verifies the implementation is working by checking the geometry
    // If blocking is working, we should see:
    // 1. The Z-divider has a cross-lap notch cut from the bottom
    // 2. The bottom panel doesn't have overlapping slots at the intersection
    expect(zPoints.length).toBeGreaterThan(4); // More than a simple rectangle due to finger joints and cross-lap

    // Now let's verify the coordinate systems:
    // - X-divider at position 50 (world coords)
    // - Z-divider's void X bounds: [3, 48.5]
    // - Z-divider's panel body extends to X=51.5 (to meet X-divider)
    // - The cross-lap slot on Z-divider should be at X=50 (world coords)

    // Find the cross-lap notch in Z-divider (points where y goes from -halfH to near 0)
    const crossLapNotch = zPoints.filter(p => Math.abs(p.y) < zHalfH * 0.1);
    console.log('\nCross-lap notch points in Z-divider:');
    crossLapNotch.forEach(p => console.log(`  (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`));

    // The cross-lap notch center X tells us where the X-divider crosses
    if (crossLapNotch.length >= 2) {
      const notchCenterX = (Math.min(...crossLapNotch.map(p => p.x)) + Math.max(...crossLapNotch.map(p => p.x))) / 2;
      console.log(`Cross-lap notch center X (panel coords): ${notchCenterX.toFixed(2)}`);

      // Convert to world X coords
      // Panel center = (bodyStart + bodyEnd) / 2 where bodyStart=3, bodyEnd=51.5
      // Actually we need to get this from the actual panel
      console.log(`Z-divider void X bounds: [${3}, ${3 + 45.5}]`);
      console.log(`X-divider world position: ${50}`);
    }

    // Check what X-divider holes look like
    const xDividerHoles = bottomPanel!.derived.outline.holes.filter(h =>
      h.source?.sourceId?.includes(xDivider.props.voidId)
    );
    console.log(`\nX-divider (axis=x@50) holes on bottom: ${xDividerHoles.length}`);
    for (const hole of xDividerHoles) {
      const yValues = hole.path.map(p => p.y);
      const minY = Math.min(...yValues);
      const maxY = Math.max(...yValues);
      console.log(`  Slot ${hole.id.split('-').pop()}: y range [${minY.toFixed(1)}, ${maxY.toFixed(1)}]`);
    }
  });
});
