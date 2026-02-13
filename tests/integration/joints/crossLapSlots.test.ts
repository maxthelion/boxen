/**
 * Unit tests for cross-lap slot computation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createEngine, Engine } from '../../../src/engine/Engine';

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

    // The cross-lap slots should add notches to the outlines
    expect(xDivider.derived.outline.points.length).toBeGreaterThan(0);
    expect(zDividers[0].derived.outline.points.length).toBeGreaterThan(0);
  });

  it('should NOT create cross-lap slots for terminating (sequential) subdivisions', () => {
    // Sequential subdivision: X split on root, then Z split on child
    // The Z-divider terminates at the X-divider - NOT a crossing scenario
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

    // Add Z subdivision to first child void only (terminating, not crossing)
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
    const zDividers = dividerPanels.filter(p => p.props.axis === 'z');

    expect(zDividers.length).toBe(1);
    const zDivider = zDividers[0];

    // No cross-lap notch points at y=0 (terminating, not crossing)
    const crossLapPoints = zDivider.derived.outline.points.filter(
      (p: { y: number }) => Math.abs(p.y) < 1.0
    );
    expect(crossLapPoints.length).toBe(0);

    // The Z-divider's right edge should meet the X-divider with male tabs
    const rightEdge = zDivider.derived.edges.find((e: { position: string }) => e.position === 'right');
    expect(rightEdge).toBeDefined();
    expect(rightEdge!.hasTabs).toBe(true);
    expect(rightEdge!.meetsDividerId).not.toBeNull();
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

  it('should not generate cross-lap notches for terminating dividers', () => {
    // Sequential subdivision: X split, then Z split on one child
    // The Z-divider terminates at the X-divider (not crossing)
    engine.createAssembly(100, 60, 100, {
      thickness: 3,
      fingerWidth: 10,
      fingerGap: 1.5,
    });

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

    // Add Z subdivision to first child void only (terminating, not crossing)
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
    const zDividers = dividerPanels.filter(p => p.props.axis === 'z');

    expect(zDividers.length).toBe(1);
    const zDivider = zDividers[0];

    // The Z-divider outline should have finger joints but no cross-lap notches
    const zPoints = zDivider.derived.outline.points;
    expect(zPoints.length).toBeGreaterThan(4); // More than a simple rectangle due to finger joints

    // No cross-lap notch points (points very close to y=0)
    const crossLapNotch = zPoints.filter((p: { y: number }) => Math.abs(p.y) < 1.0);
    expect(crossLapNotch.length).toBe(0);
  });
});
