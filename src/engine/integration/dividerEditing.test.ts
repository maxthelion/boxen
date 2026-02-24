/**
 * Integration tests for 2D panel editing operations on divider panels.
 *
 * Tests verify that cutouts, edge paths, and boolean operations work correctly
 * for divider panels, which had a bug where these modifications were stored
 * at the assembly level but never applied to the divider panel nodes during
 * panel generation.
 */
import { describe, it, expect } from 'vitest';
import { AssemblyBuilder } from '../../builder';

describe('Divider Panel 2D Editing', () => {
  // Helper to create a box with a divider and get the divider panel
  function boxWithDivider() {
    const builder = AssemblyBuilder
      .enclosedBox(150, 100, 80)
      .subdivideEvenly('root', 'z', 2);

    const { engine, panels } = builder.build();

    // Find the divider panel (type === 'divider')
    const dividerPanel = panels.find(p => p.source.type === 'divider');
    if (!dividerPanel) throw new Error('No divider panel found');

    return { engine, panels, dividerPanel };
  }

  describe('cutouts on divider panels', () => {
    it('should apply a rect cutout to a divider panel', () => {
      const { engine, dividerPanel } = boxWithDivider();

      const holesBefore = dividerPanel.holes.length;

      // Apply a cutout to the divider panel
      engine.dispatch({
        type: 'ADD_CUTOUT',
        targetId: 'main-assembly',
        payload: {
          panelId: dividerPanel.id,
          cutout: {
            id: 'test-cutout-1',
            type: 'rect',
            center: { x: 0, y: 0 },
            width: 20,
            height: 20,
          },
        },
      });

      // Re-generate panels and verify the cutout shows up as a hole
      const panelsAfter = engine.generatePanelsFromNodes();
      const dividerAfter = panelsAfter.panels.find(p => p.id === dividerPanel.id);

      expect(dividerAfter).toBeDefined();
      expect(dividerAfter!.holes.length).toBeGreaterThan(holesBefore);
    });

    it('should apply a circle cutout to a divider panel', () => {
      const { engine, dividerPanel } = boxWithDivider();

      const holesBefore = dividerPanel.holes.length;

      engine.dispatch({
        type: 'ADD_CUTOUT',
        targetId: 'main-assembly',
        payload: {
          panelId: dividerPanel.id,
          cutout: {
            id: 'test-cutout-circle',
            type: 'circle',
            center: { x: 0, y: 0 },
            radius: 10,
          },
        },
      });

      const panelsAfter = engine.generatePanelsFromNodes();
      const dividerAfter = panelsAfter.panels.find(p => p.id === dividerPanel.id);

      expect(dividerAfter).toBeDefined();
      expect(dividerAfter!.holes.length).toBeGreaterThan(holesBefore);
    });

    it('should apply a path cutout to a divider panel', () => {
      const { engine, dividerPanel } = boxWithDivider();

      const holesBefore = dividerPanel.holes.length;

      engine.dispatch({
        type: 'ADD_CUTOUT',
        targetId: 'main-assembly',
        payload: {
          panelId: dividerPanel.id,
          cutout: {
            id: 'test-cutout-path',
            type: 'path',
            center: { x: 0, y: 0 },
            points: [
              { x: -10, y: -10 },
              { x: 10, y: -10 },
              { x: 10, y: 10 },
              { x: -10, y: 10 },
            ],
          },
        },
      });

      const panelsAfter = engine.generatePanelsFromNodes();
      const dividerAfter = panelsAfter.panels.find(p => p.id === dividerPanel.id);

      expect(dividerAfter).toBeDefined();
      expect(dividerAfter!.holes.length).toBeGreaterThan(holesBefore);
    });

    it('should not affect other panels when adding cutout to divider', () => {
      const { engine, dividerPanel, panels } = boxWithDivider();

      const facePanels = panels.filter(p => p.source.type === 'face');
      const faceHolesBefore = facePanels.map(p => ({ id: p.id, holes: p.holes.length }));

      engine.dispatch({
        type: 'ADD_CUTOUT',
        targetId: 'main-assembly',
        payload: {
          panelId: dividerPanel.id,
          cutout: {
            id: 'test-cutout-isolated',
            type: 'rect',
            center: { x: 0, y: 0 },
            width: 20,
            height: 20,
          },
        },
      });

      const panelsAfter = engine.generatePanelsFromNodes();

      // Face panels should have the same number of holes
      for (const before of faceHolesBefore) {
        const after = panelsAfter.panels.find(p => p.id === before.id);
        expect(after?.holes.length).toBe(before.holes);
      }
    });
  });

  describe('custom edge paths on divider panels', () => {
    it('should apply a custom edge path to a divider panel', () => {
      const { engine, dividerPanel } = boxWithDivider();

      // Apply a custom edge path to the top edge of the divider
      engine.dispatch({
        type: 'SET_EDGE_PATH',
        targetId: 'main-assembly',
        payload: {
          panelId: dividerPanel.id,
          path: {
            edge: 'top',
            baseOffset: 0,
            mirrored: false,
            points: [
              { t: 0, offset: 0 },
              { t: 0.3, offset: 0 },
              { t: 0.5, offset: 10 },
              { t: 0.7, offset: 0 },
              { t: 1, offset: 0 },
            ],
          },
        },
      });

      const panelsAfter = engine.generatePanelsFromNodes();
      const dividerAfter = panelsAfter.panels.find(p => p.id === dividerPanel.id);

      expect(dividerAfter).toBeDefined();
      // The custom edge path replaces the top edge segment with a custom profile.
      // The path has offset=10 outward at t=0.5, so the outline's maxY should increase
      // beyond the original panel halfH. Point count may decrease since the finger joint
      // pattern (many points) is replaced by the 5-point custom profile.
      const panelHalfH = dividerPanel.height / 2;
      const maxY = Math.max(...dividerAfter!.outline.points.map(p => p.y));
      expect(maxY).toBeGreaterThan(panelHalfH);
      // The custom edge path should be stored on the serialized panel
      expect(dividerAfter!.customEdgePaths?.length).toBeGreaterThan(0);
    });
  });

  describe('boolean edge operations on divider panels', () => {
    it('should apply a difference boolean operation (cutout via edge) to a divider panel', () => {
      const { engine, dividerPanel } = boxWithDivider();

      const pointsBefore = dividerPanel.outline.points.length;

      // Apply a subtractive boolean operation (notch from edge)
      const halfW = dividerPanel.width / 2;
      const halfH = dividerPanel.height / 2;

      // A rectangle that cuts into the top edge
      const notchShape = [
        { x: -5, y: halfH - 5 },
        { x: 5, y: halfH - 5 },
        { x: 5, y: halfH + 5 },  // extends beyond top edge
        { x: -5, y: halfH + 5 },
      ];
      void halfW; // suppress unused warning

      const success = engine.dispatch({
        type: 'APPLY_EDGE_OPERATION',
        targetId: 'main-assembly',
        payload: {
          panelId: dividerPanel.id,
          operation: 'difference',
          shape: notchShape,
        },
      });

      expect(success).toBe(true);

      const panelsAfter = engine.generatePanelsFromNodes();
      const dividerAfter = panelsAfter.panels.find(p => p.id === dividerPanel.id);

      expect(dividerAfter).toBeDefined();
      // Boolean operation should change the outline
      expect(dividerAfter!.outline.points.length).toBeGreaterThan(pointsBefore);
    });
  });

  describe('safe zones for divider panels', () => {
    it('should have 2*MT safe zone margin on edges meeting solid faces', () => {
      const { panels } = boxWithDivider();
      const dividerPanel = panels.find(p => p.source.type === 'divider');
      expect(dividerPanel).toBeDefined();

      // All 4 edges should meet solid faces (enclosed box)
      // Safe space should have exclusion margins on all edges
      expect(dividerPanel!.safeSpace).toBeDefined();

      const ss = dividerPanel!.safeSpace!;
      const mt = 3; // default material thickness
      const panelHalfW = dividerPanel!.width / 2;
      const panelHalfH = dividerPanel!.height / 2;

      // Verify exclusions exist for all 4 edges (joints on all edges)
      expect(ss.exclusions.length).toBeGreaterThanOrEqual(4);

      // The safe area (resultPaths) should be inset by 2*MT on all sides
      if (ss.resultPaths.length > 0) {
        const safeMaxX = Math.max(...ss.resultPaths.flatMap(p => p.map(pt => pt.x)));
        const safeMaxY = Math.max(...ss.resultPaths.flatMap(p => p.map(pt => pt.y)));
        // Safe area must not extend to panel edge (should be inset by 2*MT)
        expect(safeMaxX).toBeLessThanOrEqual(panelHalfW - mt * 2 + 0.01);
        expect(safeMaxY).toBeLessThanOrEqual(panelHalfH - mt * 2 + 0.01);
      }
    });

    it('should report unlocked edge status for divider edges adjacent to open faces', () => {
      // Create a box with the top face open - divider's top edge won't have a joint
      const builder = AssemblyBuilder
        .enclosedBox(150, 100, 80)
        .withOpenFaces(['top'])
        .subdivideEvenly('root', 'z', 2);

      const { panels } = builder.build();
      const dividerPanel = panels.find(p => p.source.type === 'divider');
      expect(dividerPanel).toBeDefined();

      // The divider's top edge doesn't meet a solid face (top is open)
      // Its edge status should be 'unlocked' for top
      const topEdgeStatus = dividerPanel!.edgeStatuses?.find(e => e.position === 'top');
      expect(topEdgeStatus?.status).toBe('unlocked');

      // Other edges should still have joints
      const bottomEdgeStatus = dividerPanel!.edgeStatuses?.find(e => e.position === 'bottom');
      expect(bottomEdgeStatus?.status).toBe('outward-only');
    });

    it('should have 0 margin on divider edge adjacent to open face (correct safe zone)', () => {
      // Create a box with the top face open
      const builder = AssemblyBuilder
        .enclosedBox(150, 100, 80)
        .withOpenFaces(['top'])
        .subdivideEvenly('root', 'z', 2);

      const { panels } = builder.build();
      const dividerPanel = panels.find(p => p.source.type === 'divider');
      expect(dividerPanel).toBeDefined();

      const ss = dividerPanel!.safeSpace!;
      const panelHalfH = dividerPanel!.height / 2;

      // With open top face, the top edge has no joint
      // There should be no HORIZONTAL exclusion band at the top edge.
      // A top exclusion is wider than it is tall (horizontal band touching the top).
      // We must distinguish from left/right exclusions which also have maxY = panelHalfH.
      const topExclusion = ss.exclusions.find(excl => {
        const minX = Math.min(...excl.map(p => p.x));
        const maxX = Math.max(...excl.map(p => p.x));
        const minY = Math.min(...excl.map(p => p.y));
        const maxY = Math.max(...excl.map(p => p.y));
        // A top exclusion is a horizontal band: much wider than tall, touching the top
        const isHorizontalBand = (maxX - minX) > (maxY - minY);
        return isHorizontalBand && Math.abs(maxY - panelHalfH) < 0.1;
      });
      // Expected: no top horizontal exclusion (open face = no joint = no margin)
      expect(topExclusion).toBeUndefined();

      // The safe area should extend to the top of the panel (no inset on top)
      if (ss.resultPaths.length > 0) {
        const safeMaxY = Math.max(...ss.resultPaths.flatMap(p => p.map(pt => pt.y)));
        expect(safeMaxY).toBeGreaterThanOrEqual(panelHalfH - 0.01);
      }
    });
  });

  describe('divider panels with grid subdivision', () => {
    it('should apply cutout to grid divider panel', () => {
      const builder = AssemblyBuilder
        .enclosedBox(150, 100, 80)
        .grid('root', 2, 2);

      const { engine, panels } = builder.build();

      // Find a grid divider panel
      const dividerPanel = panels.find(p => p.source.type === 'divider');
      expect(dividerPanel).toBeDefined();

      if (!dividerPanel) return;

      const holesBefore = dividerPanel.holes.length;

      engine.dispatch({
        type: 'ADD_CUTOUT',
        targetId: 'main-assembly',
        payload: {
          panelId: dividerPanel.id,
          cutout: {
            id: 'grid-cutout-1',
            type: 'rect',
            center: { x: 0, y: 0 },
            width: 15,
            height: 15,
          },
        },
      });

      const panelsAfter = engine.generatePanelsFromNodes();
      const dividerAfter = panelsAfter.panels.find(p => p.id === dividerPanel.id);

      expect(dividerAfter).toBeDefined();
      expect(dividerAfter!.holes.length).toBeGreaterThan(holesBefore);
    });
  });
});
