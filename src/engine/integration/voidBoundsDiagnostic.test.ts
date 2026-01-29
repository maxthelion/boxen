/**
 * Diagnostic test to verify void bounds and divider dimensions
 *
 * This test verifies that divider body dimensions match face body dimensions
 * so that finger joints align correctly between dividers and faces.
 */
import { describe, it, expect } from 'vitest';
import { createEngine } from '../Engine';

describe('Void Bounds and Finger Region Verification', () => {
  it('should have divider body matching face body for correct finger alignment', () => {
    const engine = createEngine();
    engine.createAssembly(200, 150, 100, { thickness: 3, fingerWidth: 10, fingerGap: 1.5 });

    // Add subdivision
    engine.dispatch({
      type: 'ADD_SUBDIVISION',
      targetId: 'main-assembly',
      payload: { voidId: 'root', axis: 'x', position: 100 }
    });

    const snapshot = engine.getSnapshot();
    const assembly = snapshot.children[0];
    const rootVoid = assembly.children[0];
    const mt = assembly.props.material.thickness;

    // Verify void bounds (interior space)
    const voidBounds = rootVoid.derived.bounds;
    expect(voidBounds.x).toBe(mt);
    expect(voidBounds.y).toBe(mt);
    expect(voidBounds.z).toBe(mt);
    expect(voidBounds.w).toBe(200 - 2 * mt); // 194
    expect(voidBounds.h).toBe(150 - 2 * mt); // 144
    expect(voidBounds.d).toBe(100 - 2 * mt); // 94

    const panels = assembly.derived.panels;

    // Find right face panel (spans depth x height)
    const rightFace = panels.find(p => p.kind === 'face-panel' && (p as any).props.faceId === 'right');
    expect(rightFace).toBeDefined();
    expect(rightFace!.derived.width).toBe(100);  // depth
    expect(rightFace!.derived.height).toBe(150); // height

    // Find divider panel - should have same dimensions as face
    const divider = panels.find(p => p.kind === 'divider-panel');
    expect(divider).toBeDefined();

    // X-axis divider spans depth (Z) and height (Y)
    // Divider body must equal face body so finger regions match after corner insets
    expect(divider!.derived.width).toBe(100);  // depth - same as right face width
    expect(divider!.derived.height).toBe(150); // height - same as right face height

    // Verify finger data
    const fingerData = assembly.derived.fingerData;
    expect(fingerData.y.maxJointLength).toBe(150 - 2 * mt); // 144
    expect(fingerData.z.maxJointLength).toBe(100 - 2 * mt); // 94
  });
});
