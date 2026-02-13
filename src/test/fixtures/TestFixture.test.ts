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

  describe('withDimensions', () => {
    it('updates width', () => {
      const { panels } = TestFixture.enclosedBox(100, 80, 60)
        .withDimensions({ width: 200 })
        .build();

      const front = panels.find(p => p.source.faceId === 'front');
      expect(front!.width).toBe(200);
    });

    it('updates multiple dimensions at once', () => {
      const { panels } = TestFixture.enclosedBox(100, 80, 60)
        .withDimensions({ width: 200, height: 150 })
        .build();

      const front = panels.find(p => p.source.faceId === 'front');
      expect(front!.width).toBe(200);
      expect(front!.height).toBe(150);
    });

    it('is chainable', () => {
      const { panels } = TestFixture.enclosedBox(100, 80, 60)
        .withDimensions({ width: 200 })
        .withOpenFaces(['top'])
        .build();

      expect(panels.length).toBe(5);
      const front = panels.find(p => p.source.faceId === 'front');
      expect(front!.width).toBe(200);
    });
  });

  describe('withMaterial', () => {
    it('updates material thickness', () => {
      const { engine } = TestFixture.enclosedBox(100, 80, 60)
        .withMaterial({ thickness: 6 })
        .build();

      const snapshot = engine.getSnapshot();
      expect(snapshot.children[0].props.material.thickness).toBe(6);
    });

    it('is chainable', () => {
      const { engine } = TestFixture.enclosedBox(100, 80, 60)
        .withMaterial({ thickness: 6 })
        .withDimensions({ width: 200 })
        .build();

      const snapshot = engine.getSnapshot();
      expect(snapshot.children[0].props.material.thickness).toBe(6);
      expect(snapshot.children[0].props.width).toBe(200);
    });
  });

  describe('withFeet', () => {
    it('enables feet', () => {
      const { engine } = TestFixture.basicBox(100, 80, 60)
        .withFeet({ enabled: true, height: 10, width: 15, inset: 5, gap: 2 })
        .build();

      const snapshot = engine.getSnapshot();
      expect(snapshot.children[0].props.feet?.enabled).toBe(true);
      expect(snapshot.children[0].props.feet?.height).toBe(10);
    });

    it('disables feet with null', () => {
      const { engine } = TestFixture.basicBox(100, 80, 60)
        .withFeet({ enabled: true, height: 10, width: 15, inset: 5, gap: 2 })
        .withFeet(null)
        .build();

      const snapshot = engine.getSnapshot();
      expect(snapshot.children[0].props.feet).toBeUndefined();
    });
  });

  describe('withLid', () => {
    it('sets lid tab direction', () => {
      const { engine } = TestFixture.enclosedBox(100, 80, 60)
        .withLid('positive', { tabDirection: 'tabs-out' })
        .build();

      const snapshot = engine.getSnapshot();
      expect(snapshot.children[0].props.assembly.lids.positive.tabDirection).toBe('tabs-out');
    });
  });

  describe('withAxis', () => {
    it('changes assembly axis', () => {
      const { engine } = TestFixture.enclosedBox(100, 80, 60)
        .withAxis('x')
        .build();

      const snapshot = engine.getSnapshot();
      expect(snapshot.children[0].props.assembly.assemblyAxis).toBe('x');
    });
  });

  describe('subdivide', () => {
    it('adds a divider panel', () => {
      const { panels } = TestFixture.basicBox(200, 100, 100)
        .subdivide('root', 'x', 100)
        .build();

      const dividers = panels.filter(p => p.source.type === 'divider');
      expect(dividers.length).toBe(1);
    });

    it('creates two child voids', () => {
      const fixture = TestFixture.basicBox(200, 100, 100)
        .subdivide('root', 'x', 100);

      // Should be able to access both child voids
      const id0 = fixture.childVoid(0);
      const id1 = fixture.childVoid(1);
      expect(id0).toBeDefined();
      expect(id1).toBeDefined();
      expect(id0).not.toBe(id1);
    });

    it('supports chained subdivisions using childVoid callback', () => {
      const { panels } = TestFixture.basicBox(200, 100, 100)
        .subdivide('root', 'x', 100)
        .subdivide(f => f.childVoid(0), 'z', 50)
        .build();

      // Should have 2 dividers: one from root split, one from child split
      const dividers = panels.filter(p => p.source.type === 'divider');
      expect(dividers.length).toBe(2);
    });

    it('throws on out-of-range childVoid index', () => {
      const fixture = TestFixture.basicBox(200, 100, 100)
        .subdivide('root', 'x', 100);

      expect(() => fixture.childVoid(2)).toThrow('index out of range');
    });
  });

  describe('subdivideEvenly', () => {
    it('creates even compartments', () => {
      const { panels } = TestFixture.basicBox(200, 100, 100)
        .subdivideEvenly('root', 'x', 3)
        .build();

      // 3 compartments = 2 dividers
      const dividers = panels.filter(p => p.source.type === 'divider');
      expect(dividers.length).toBe(2);
    });

    it('creates correct number of child voids', () => {
      const fixture = TestFixture.basicBox(200, 100, 100)
        .subdivideEvenly('root', 'x', 3);

      expect(fixture.childVoid(0)).toBeDefined();
      expect(fixture.childVoid(1)).toBeDefined();
      expect(fixture.childVoid(2)).toBeDefined();
      expect(() => fixture.childVoid(3)).toThrow('index out of range');
    });

    it('does nothing for count < 2', () => {
      const { panels } = TestFixture.basicBox(200, 100, 100)
        .subdivideEvenly('root', 'x', 1)
        .build();

      const dividers = panels.filter(p => p.source.type === 'divider');
      expect(dividers.length).toBe(0);
    });
  });

  describe('grid', () => {
    it('creates a 2x2 grid', () => {
      const { panels } = TestFixture.basicBox(200, 100, 200)
        .grid('root', 2, 2)
        .build();

      // 2x2 grid = 1 x-divider + 1 z-divider = 2 divider panels
      const dividers = panels.filter(p => p.source.type === 'divider');
      expect(dividers.length).toBe(2);
    });

    it('creates 4 child voids for 2x2 grid', () => {
      const fixture = TestFixture.basicBox(200, 100, 200)
        .grid('root', 2, 2);

      expect(fixture.childVoid(0)).toBeDefined();
      expect(fixture.childVoid(1)).toBeDefined();
      expect(fixture.childVoid(2)).toBeDefined();
      expect(fixture.childVoid(3)).toBeDefined();
      expect(() => fixture.childVoid(4)).toThrow('index out of range');
    });

    it('creates a 3x2 grid', () => {
      const { panels } = TestFixture.basicBox(300, 100, 200)
        .grid('root', 3, 2)
        .build();

      // 3x2 grid = 2 x-dividers + 1 z-divider = 3 divider panels
      const dividers = panels.filter(p => p.source.type === 'divider');
      expect(dividers.length).toBe(3);
    });
  });

  describe('Integration: fluent subdivision scenario', () => {
    it('builds a box with nested subdivisions entirely via fluent API', () => {
      // Create a box, subdivide root on X, then subdivide the first child on Z
      const { engine, panels } = TestFixture
        .basicBox(200, 150, 100, { thickness: 6, fingerWidth: 10, fingerGap: 1.5 })
        .subdivide('root', 'x', 100)
        .subdivide(f => f.childVoid(0), 'z', 50)
        .build();

      // Verify engine is valid
      expect(engine).toBeDefined();
      expect(engine.assembly).toBeDefined();

      // Should have face panels + divider panels
      const facePanels = panels.filter(p => p.source.type === 'face');
      const dividerPanels = panels.filter(p => p.source.type === 'divider');

      // 5 face panels (open top) + 2 dividers
      expect(facePanels.length).toBe(5);
      expect(dividerPanels.length).toBe(2);

      // All panels should have valid outlines with finger joints (many points)
      for (const panel of panels) {
        expect(panel.outline.points.length).toBeGreaterThan(4);
      }
    });

    it('combines grid with configuration methods', () => {
      const { panels, engine } = TestFixture
        .basicBox(200, 100, 200)
        .withMaterial({ thickness: 6 })
        .grid('root', 2, 2)
        .build();

      const snapshot = engine.getSnapshot();
      expect(snapshot.children[0].props.material.thickness).toBe(6);

      const dividers = panels.filter(p => p.source.type === 'divider');
      expect(dividers.length).toBe(2);
    });
  });
});
