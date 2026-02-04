/**
 * Tests for TestFixture - Core composable test fixture class.
 */

import { describe, it, expect } from 'vitest';
import { TestFixture } from './TestFixture';

describe('TestFixture', () => {
  describe('Factory Methods', () => {
    it('creates basic box with open top', () => {
      const { engine, panels } = TestFixture.basicBox(100, 80, 60).build();

      expect(engine).toBeDefined();
      // 6 faces - 1 open (top) = 5 panels
      expect(panels.length).toBe(5);

      // Verify top face is not in panels
      const faceIds = panels.map(p => p.source.faceId);
      expect(faceIds).not.toContain('top');

      // Verify other faces are present
      expect(faceIds).toContain('bottom');
      expect(faceIds).toContain('front');
      expect(faceIds).toContain('back');
      expect(faceIds).toContain('left');
      expect(faceIds).toContain('right');
    });

    it('creates enclosed box with all faces', () => {
      const { panels } = TestFixture.enclosedBox(100, 80, 60).build();

      // All 6 faces should be present
      expect(panels.length).toBe(6);

      const faceIds = panels.map(p => p.source.faceId);
      expect(faceIds).toContain('top');
      expect(faceIds).toContain('bottom');
      expect(faceIds).toContain('front');
      expect(faceIds).toContain('back');
      expect(faceIds).toContain('left');
      expect(faceIds).toContain('right');
    });

    it('respects custom dimensions', () => {
      const { panels } = TestFixture.enclosedBox(200, 150, 100).build();

      // Find the front panel (in XY plane)
      const frontPanel = panels.find(p => p.source.faceId === 'front');
      expect(frontPanel).toBeDefined();

      // Front panel dimensions should be width x height
      expect(frontPanel!.width).toBe(200);
      expect(frontPanel!.height).toBe(150);
    });
  });

  describe('Configuration', () => {
    it('configures open faces with withOpenFaces', () => {
      const { panels } = TestFixture.enclosedBox(100, 80, 60)
        .withOpenFaces(['top', 'front'])
        .build();

      // 6 faces - 2 open = 4 panels
      expect(panels.length).toBe(4);

      const faceIds = panels.map(p => p.source.faceId);
      expect(faceIds).not.toContain('top');
      expect(faceIds).not.toContain('front');
    });

    it('withOpenFaces replaces previous open face config', () => {
      const { panels } = TestFixture.basicBox(100, 80, 60)
        .withOpenFaces(['front']) // Replace open top with open front
        .build();

      // Only front should be open now
      expect(panels.length).toBe(5);

      const faceIds = panels.map(p => p.source.faceId);
      expect(faceIds).toContain('top'); // Now closed
      expect(faceIds).not.toContain('front'); // Now open
    });

    it('withOpenFaces with empty array makes all faces solid', () => {
      const { panels } = TestFixture.basicBox(100, 80, 60)
        .withOpenFaces([])
        .build();

      expect(panels.length).toBe(6);
    });
  });

  describe('Panel Selection', () => {
    it('selects panel by face', () => {
      const { panel } = TestFixture.basicBox(100, 80, 60)
        .panel('front')
        .build();

      expect(panel).toBeDefined();
      expect(panel?.source.faceId).toBe('front');
    });

    it('returns undefined panel when face is open', () => {
      const { panel } = TestFixture.basicBox(100, 80, 60)
        .panel('top') // top is open in basicBox
        .build();

      // Panel should be undefined since top face is open
      expect(panel).toBeUndefined();
    });

    it('selected panel is in the panels array', () => {
      const { panel, panels } = TestFixture.enclosedBox(100, 80, 60)
        .panel('front')
        .build();

      expect(panel).toBeDefined();
      expect(panels).toContain(panel);
    });
  });

  describe('Cloning', () => {
    it('clone creates independent copy', () => {
      const base = TestFixture.basicBox(100, 80, 60);
      const clone = base.clone();

      // Modify clone - make front open too
      clone.withOpenFaces(['top', 'front']);

      // Original unchanged (still just top open)
      const { panels: basePanels } = base.build();
      const { panels: clonePanels } = clone.build();

      expect(basePanels.length).toBe(5); // Original: only top open
      expect(clonePanels.length).toBe(4); // Clone: top and front open
    });

    it('clone preserves panel selection', () => {
      // Create base fixture with panel selection
      const base = TestFixture.enclosedBox(100, 80, 60);
      base.panel('front'); // Select front panel

      // Clone the fixture (should preserve selection)
      const clone = base.clone();

      // Both should have front panel selected
      const { panel: basePanel } = base.panel('front').build();
      const { panel: clonePanel } = clone.panel('front').build();

      expect(basePanel?.source.faceId).toBe('front');
      expect(clonePanel?.source.faceId).toBe('front');
    });

    it('clone allows creating test matrices', () => {
      const base = TestFixture.enclosedBox(100, 80, 60);

      // Create variants with different open faces
      const scenarios = (['top', 'front', 'left'] as const).map(face =>
        base.clone().withOpenFaces([face])
      );

      // Each scenario should have 5 panels (one face open)
      for (const scenario of scenarios) {
        const { panels } = scenario.build();
        expect(panels.length).toBe(5);
      }

      // Original should still have all 6 faces
      const { panels: basePanels } = base.build();
      expect(basePanels.length).toBe(6);
    });
  });

  describe('Build Result', () => {
    it('returns engine in result', () => {
      const { engine } = TestFixture.basicBox(100, 80, 60).build();

      expect(engine).toBeDefined();
      expect(engine.assembly).toBeDefined();
    });

    it('returns fresh panels from engine state', () => {
      const { panels } = TestFixture.basicBox(100, 80, 60).build();

      // Verify panels have expected properties
      for (const panel of panels) {
        expect(panel.id).toBeDefined();
        expect(panel.source).toBeDefined();
        expect(panel.outline).toBeDefined();
        expect(panel.width).toBeGreaterThan(0);
        expect(panel.height).toBeGreaterThan(0);
      }
    });

    it('panels have correct structure', () => {
      const { panel } = TestFixture.enclosedBox(100, 80, 60)
        .panel('front')
        .build();

      expect(panel).toBeDefined();
      expect(panel!.source.type).toBe('face');
      expect(panel!.source.faceId).toBe('front');
      expect(panel!.outline.points.length).toBeGreaterThan(0);
      expect(panel!.visible).toBe(true);
    });
  });
});
