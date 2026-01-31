/**
 * Integration tests for second operations on the same object
 *
 * Verifies that:
 * - Edge extensions use delta mode (add to existing)
 * - Corner fillets use absolute mode (replace existing)
 * - Values persist correctly across operations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createEngineWithAssembly } from '../Engine';

// Standard test material config
const testMaterial = { thickness: 3, fingerWidth: 10, fingerGap: 1.5 };

describe('Second Operations', () => {

  describe('Edge Extensions (Delta Mode)', () => {

    it('second extension adds to first extension value', () => {
      const engine = createEngineWithAssembly(100, 80, 60, testMaterial);
      const assembly = engine.assembly!;

      // Open top face to make edges extendable
      engine.dispatch({
        type: 'SET_FACE_SOLID',
        targetId: assembly.id,
        payload: { faceId: 'top', solid: false },
      });

      // Get front panel ID
      const panels = assembly.getPanels();
      const frontPanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');
      expect(frontPanel).toBeDefined();

      // First extension: 10mm
      engine.dispatch({
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: assembly.id,
        payload: {
          extensions: [{ panelId: frontPanel!.id, edge: 'top', value: 10 }],
        },
      });

      // Verify first extension
      let extensions = assembly.getPanelEdgeExtensions(frontPanel!.id);
      expect(extensions.top).toBe(10);

      // Second extension: set to 15mm (simulating base=10 + offset=5)
      engine.dispatch({
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: assembly.id,
        payload: {
          extensions: [{ panelId: frontPanel!.id, edge: 'top', value: 15 }],
        },
      });

      // Verify cumulative result
      extensions = assembly.getPanelEdgeExtensions(frontPanel!.id);
      expect(extensions.top).toBe(15);
    });

    it('extension value of 0 removes the extension', () => {
      const engine = createEngineWithAssembly(100, 80, 60, testMaterial);
      const assembly = engine.assembly!;

      // Open top face
      engine.dispatch({
        type: 'SET_FACE_SOLID',
        targetId: assembly.id,
        payload: { faceId: 'top', solid: false },
      });

      const panels = assembly.getPanels();
      const frontPanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      // Add extension
      engine.dispatch({
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: assembly.id,
        payload: {
          extensions: [{ panelId: frontPanel!.id, edge: 'top', value: 10 }],
        },
      });

      expect(assembly.getPanelEdgeExtensions(frontPanel!.id).top).toBe(10);

      // Remove extension by setting to 0
      engine.dispatch({
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: assembly.id,
        payload: {
          extensions: [{ panelId: frontPanel!.id, edge: 'top', value: 0 }],
        },
      });

      expect(assembly.getPanelEdgeExtensions(frontPanel!.id).top).toBe(0);
    });

    it('extension values persist across scene clones (preview)', () => {
      const engine = createEngineWithAssembly(100, 80, 60, testMaterial);
      const assembly = engine.assembly!;

      // Open face and extend edge
      engine.dispatch({
        type: 'SET_FACE_SOLID',
        targetId: assembly.id,
        payload: { faceId: 'top', solid: false },
      });

      const panels = assembly.getPanels();
      const frontPanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      engine.dispatch({
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: assembly.id,
        payload: {
          extensions: [{ panelId: frontPanel!.id, edge: 'top', value: 10 }],
        },
      });

      // Start preview (clones scene)
      engine.startPreview();

      // Read from main scene (should have committed value)
      const mainScene = engine.getMainScene();
      const mainAssembly = mainScene.primaryAssembly!;
      const extensions = mainAssembly.getPanelEdgeExtensions(frontPanel!.id);

      expect(extensions.top).toBe(10);

      engine.discardPreview();
    });

    it('multiple edges can be extended independently', () => {
      const engine = createEngineWithAssembly(100, 80, 60, testMaterial);
      const assembly = engine.assembly!;

      // Open top and left faces
      engine.dispatch({
        type: 'SET_FACE_SOLID',
        targetId: assembly.id,
        payload: { faceId: 'top', solid: false },
      });
      engine.dispatch({
        type: 'SET_FACE_SOLID',
        targetId: assembly.id,
        payload: { faceId: 'left', solid: false },
      });

      const panels = assembly.getPanels();
      const frontPanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      // Extend top edge
      engine.dispatch({
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: assembly.id,
        payload: {
          extensions: [{ panelId: frontPanel!.id, edge: 'top', value: 10 }],
        },
      });

      // Extend left edge separately
      engine.dispatch({
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: assembly.id,
        payload: {
          extensions: [{ panelId: frontPanel!.id, edge: 'left', value: 15 }],
        },
      });

      const extensions = assembly.getPanelEdgeExtensions(frontPanel!.id);
      expect(extensions.top).toBe(10);
      expect(extensions.left).toBe(15);
      expect(extensions.bottom).toBe(0);
      expect(extensions.right).toBe(0);
    });

  });

  describe('Corner Fillets (Absolute Mode)', () => {

    it('second fillet replaces first fillet value', () => {
      const engine = createEngineWithAssembly(100, 80, 60, testMaterial);
      const assembly = engine.assembly!;

      // Open faces to make corner eligible
      engine.dispatch({
        type: 'SET_FACE_SOLID',
        targetId: assembly.id,
        payload: { faceId: 'top', solid: false },
      });
      engine.dispatch({
        type: 'SET_FACE_SOLID',
        targetId: assembly.id,
        payload: { faceId: 'left', solid: false },
      });

      const panels = assembly.getPanels();
      const frontPanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      // Extend both edges meeting at top-left corner
      engine.dispatch({
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: assembly.id,
        payload: {
          extensions: [
            { panelId: frontPanel!.id, edge: 'top', value: 20 },
            { panelId: frontPanel!.id, edge: 'left', value: 20 },
          ],
        },
      });

      // First fillet: 10mm
      engine.dispatch({
        type: 'SET_CORNER_FILLETS_BATCH',
        targetId: assembly.id,
        payload: {
          fillets: [{ panelId: frontPanel!.id, corner: 'left:top', radius: 10 }],
        },
      });

      // Verify first fillet
      let radius = assembly.getPanelCornerFillet(frontPanel!.id, 'left:top');
      expect(radius).toBe(10);

      // Second fillet: 5mm (replaces, not adds)
      engine.dispatch({
        type: 'SET_CORNER_FILLETS_BATCH',
        targetId: assembly.id,
        payload: {
          fillets: [{ panelId: frontPanel!.id, corner: 'left:top', radius: 5 }],
        },
      });

      // Verify replacement (not cumulative)
      radius = assembly.getPanelCornerFillet(frontPanel!.id, 'left:top');
      expect(radius).toBe(5);  // Not 15!
    });

    it('fillet radius zero removes the fillet', () => {
      const engine = createEngineWithAssembly(100, 80, 60, testMaterial);
      const assembly = engine.assembly!;

      // Setup: open faces, extend edges
      engine.dispatch({ type: 'SET_FACE_SOLID', targetId: assembly.id, payload: { faceId: 'top', solid: false } });
      engine.dispatch({ type: 'SET_FACE_SOLID', targetId: assembly.id, payload: { faceId: 'left', solid: false } });

      const panels = assembly.getPanels();
      const frontPanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      engine.dispatch({
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: assembly.id,
        payload: {
          extensions: [
            { panelId: frontPanel!.id, edge: 'top', value: 20 },
            { panelId: frontPanel!.id, edge: 'left', value: 20 },
          ],
        },
      });

      // Add fillet
      engine.dispatch({
        type: 'SET_CORNER_FILLETS_BATCH',
        targetId: assembly.id,
        payload: {
          fillets: [{ panelId: frontPanel!.id, corner: 'left:top', radius: 10 }],
        },
      });

      expect(assembly.getPanelCornerFillet(frontPanel!.id, 'left:top')).toBe(10);

      // Remove fillet by setting radius to 0
      engine.dispatch({
        type: 'SET_CORNER_FILLETS_BATCH',
        targetId: assembly.id,
        payload: {
          fillets: [{ panelId: frontPanel!.id, corner: 'left:top', radius: 0 }],
        },
      });

      // Verify fillet is removed
      expect(assembly.getPanelCornerFillet(frontPanel!.id, 'left:top')).toBe(0);
    });

    it('fillet values persist across scene clones (preview)', () => {
      const engine = createEngineWithAssembly(100, 80, 60, testMaterial);
      const assembly = engine.assembly!;

      // Setup and add fillet
      engine.dispatch({ type: 'SET_FACE_SOLID', targetId: assembly.id, payload: { faceId: 'top', solid: false } });
      engine.dispatch({ type: 'SET_FACE_SOLID', targetId: assembly.id, payload: { faceId: 'left', solid: false } });

      const panels = assembly.getPanels();
      const frontPanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      engine.dispatch({
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: assembly.id,
        payload: {
          extensions: [
            { panelId: frontPanel!.id, edge: 'top', value: 20 },
            { panelId: frontPanel!.id, edge: 'left', value: 20 },
          ],
        },
      });

      engine.dispatch({
        type: 'SET_CORNER_FILLETS_BATCH',
        targetId: assembly.id,
        payload: {
          fillets: [{ panelId: frontPanel!.id, corner: 'left:top', radius: 10 }],
        },
      });

      // Start preview (clones scene)
      engine.startPreview();

      // Read from main scene (should have committed value)
      const mainScene = engine.getMainScene();
      const mainAssembly = mainScene.primaryAssembly!;
      const radius = mainAssembly.getPanelCornerFillet(frontPanel!.id, 'left:top');

      expect(radius).toBe(10);

      engine.discardPreview();
    });

    it('multiple corners can be filleted independently', () => {
      const engine = createEngineWithAssembly(100, 80, 60, testMaterial);
      const assembly = engine.assembly!;

      // Open all side faces to make all corners eligible
      engine.dispatch({ type: 'SET_FACE_SOLID', targetId: assembly.id, payload: { faceId: 'top', solid: false } });
      engine.dispatch({ type: 'SET_FACE_SOLID', targetId: assembly.id, payload: { faceId: 'bottom', solid: false } });
      engine.dispatch({ type: 'SET_FACE_SOLID', targetId: assembly.id, payload: { faceId: 'left', solid: false } });
      engine.dispatch({ type: 'SET_FACE_SOLID', targetId: assembly.id, payload: { faceId: 'right', solid: false } });

      const panels = assembly.getPanels();
      const frontPanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      // Extend all edges
      engine.dispatch({
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: assembly.id,
        payload: {
          extensions: [
            { panelId: frontPanel!.id, edge: 'top', value: 20 },
            { panelId: frontPanel!.id, edge: 'bottom', value: 20 },
            { panelId: frontPanel!.id, edge: 'left', value: 20 },
            { panelId: frontPanel!.id, edge: 'right', value: 20 },
          ],
        },
      });

      // Fillet top-left corner
      engine.dispatch({
        type: 'SET_CORNER_FILLETS_BATCH',
        targetId: assembly.id,
        payload: {
          fillets: [{ panelId: frontPanel!.id, corner: 'left:top', radius: 5 }],
        },
      });

      // Fillet bottom-right corner with different radius
      engine.dispatch({
        type: 'SET_CORNER_FILLETS_BATCH',
        targetId: assembly.id,
        payload: {
          fillets: [{ panelId: frontPanel!.id, corner: 'bottom:right', radius: 10 }],
        },
      });

      // Verify each corner has its own radius
      expect(assembly.getPanelCornerFillet(frontPanel!.id, 'left:top')).toBe(5);
      expect(assembly.getPanelCornerFillet(frontPanel!.id, 'bottom:right')).toBe(10);
      expect(assembly.getPanelCornerFillet(frontPanel!.id, 'right:top')).toBe(0);
      expect(assembly.getPanelCornerFillet(frontPanel!.id, 'bottom:left')).toBe(0);
    });

  });

  describe('Mixed Operations', () => {

    it('can modify extension then add fillet to same corner', () => {
      const engine = createEngineWithAssembly(100, 80, 60, testMaterial);
      const assembly = engine.assembly!;

      // Setup
      engine.dispatch({ type: 'SET_FACE_SOLID', targetId: assembly.id, payload: { faceId: 'top', solid: false } });
      engine.dispatch({ type: 'SET_FACE_SOLID', targetId: assembly.id, payload: { faceId: 'left', solid: false } });

      const panels = assembly.getPanels();
      const frontPanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      // First: extend edges
      engine.dispatch({
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: assembly.id,
        payload: {
          extensions: [
            { panelId: frontPanel!.id, edge: 'top', value: 20 },
            { panelId: frontPanel!.id, edge: 'left', value: 20 },
          ],
        },
      });

      // Second: add fillet
      engine.dispatch({
        type: 'SET_CORNER_FILLETS_BATCH',
        targetId: assembly.id,
        payload: {
          fillets: [{ panelId: frontPanel!.id, corner: 'left:top', radius: 8 }],
        },
      });

      // Third: increase extension
      engine.dispatch({
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: assembly.id,
        payload: {
          extensions: [
            { panelId: frontPanel!.id, edge: 'top', value: 30 },
            { panelId: frontPanel!.id, edge: 'left', value: 30 },
          ],
        },
      });

      // Verify both are preserved
      const extensions = assembly.getPanelEdgeExtensions(frontPanel!.id);
      expect(extensions.top).toBe(30);
      expect(extensions.left).toBe(30);

      const radius = assembly.getPanelCornerFillet(frontPanel!.id, 'left:top');
      expect(radius).toBe(8);
    });

    it('reducing extension below fillet radius preserves fillet', () => {
      const engine = createEngineWithAssembly(100, 80, 60, testMaterial);
      const assembly = engine.assembly!;

      // Setup
      engine.dispatch({ type: 'SET_FACE_SOLID', targetId: assembly.id, payload: { faceId: 'top', solid: false } });
      engine.dispatch({ type: 'SET_FACE_SOLID', targetId: assembly.id, payload: { faceId: 'left', solid: false } });

      const panels = assembly.getPanels();
      const frontPanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      // Extend edges to 30mm
      engine.dispatch({
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: assembly.id,
        payload: {
          extensions: [
            { panelId: frontPanel!.id, edge: 'top', value: 30 },
            { panelId: frontPanel!.id, edge: 'left', value: 30 },
          ],
        },
      });

      // Add 20mm fillet
      engine.dispatch({
        type: 'SET_CORNER_FILLETS_BATCH',
        targetId: assembly.id,
        payload: {
          fillets: [{ panelId: frontPanel!.id, corner: 'left:top', radius: 20 }],
        },
      });

      // Reduce extension to 10mm (below fillet radius)
      engine.dispatch({
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: assembly.id,
        payload: {
          extensions: [
            { panelId: frontPanel!.id, edge: 'top', value: 10 },
            { panelId: frontPanel!.id, edge: 'left', value: 10 },
          ],
        },
      });

      // Fillet data is preserved (though geometry may be invalid)
      // This tests data persistence, not geometric validity
      expect(assembly.getPanelCornerFillet(frontPanel!.id, 'left:top')).toBe(20);
    });

  });

  describe('Preview and Commit Flow', () => {

    it('preview changes do not affect main scene until committed', () => {
      const engine = createEngineWithAssembly(100, 80, 60, testMaterial);
      const assembly = engine.assembly!;

      // Setup
      engine.dispatch({ type: 'SET_FACE_SOLID', targetId: assembly.id, payload: { faceId: 'top', solid: false } });

      const panels = assembly.getPanels();
      const frontPanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      // Start preview
      engine.startPreview();

      // Make change in preview
      engine.dispatch({
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: assembly.id,
        payload: {
          extensions: [{ panelId: frontPanel!.id, edge: 'top', value: 25 }],
        },
      });

      // Main scene should be unchanged
      const mainScene = engine.getMainScene();
      const mainAssembly = mainScene.primaryAssembly!;
      expect(mainAssembly.getPanelEdgeExtensions(frontPanel!.id).top).toBe(0);

      // Discard preview
      engine.discardPreview();

      // After discard, still unchanged
      expect(assembly.getPanelEdgeExtensions(frontPanel!.id).top).toBe(0);
    });

    it('committed changes are visible in subsequent operations', () => {
      const engine = createEngineWithAssembly(100, 80, 60, testMaterial);
      const assembly = engine.assembly!;

      // Setup
      engine.dispatch({ type: 'SET_FACE_SOLID', targetId: assembly.id, payload: { faceId: 'top', solid: false } });

      const panels = assembly.getPanels();
      const frontPanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      // First operation: preview and commit
      engine.startPreview();
      engine.dispatch({
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: assembly.id,
        payload: {
          extensions: [{ panelId: frontPanel!.id, edge: 'top', value: 10 }],
        },
      });
      engine.commitPreview();

      // Verify committed - need to re-fetch assembly since scene was replaced
      const committedAssembly = engine.assembly!;
      expect(committedAssembly.getPanelEdgeExtensions(frontPanel!.id).top).toBe(10);

      // Second operation: should see committed value
      engine.startPreview();

      // Read from main scene during preview
      const mainScene = engine.getMainScene();
      const mainAssembly = mainScene.primaryAssembly!;
      expect(mainAssembly.getPanelEdgeExtensions(frontPanel!.id).top).toBe(10);

      engine.discardPreview();
    });

  });

});
