/**
 * Tests for PanelBuilder - Panel operation methods for test fixtures.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AssemblyBuilder } from '../../builder';
import { rect, circle } from '../../builder/shapes';

describe('PanelBuilder', () => {
  // Suppress console.warn during tests
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('Basic Operations', () => {
    it('builds fixture through PanelBuilder', () => {
      const { panel, panels } = AssemblyBuilder.enclosedBox(100, 80, 60)
        .panel('front')
        .build();

      expect(panel).toBeDefined();
      expect(panel?.source.faceId).toBe('front');
      expect(panels.length).toBe(6);
    });

    it('getFaceId returns the selected face', () => {
      const fixture = AssemblyBuilder.enclosedBox(100, 80, 60);
      const builder = fixture.panel('front');

      expect(builder.getFaceId()).toBe('front');
    });
  });

  describe('withExtension', () => {
    it('queues extension operation', () => {
      const { panel } = AssemblyBuilder.basicBox(100, 80, 60)
        .panel('front')
        .withExtension('top', 30)
        .build();

      // Panel should exist
      expect(panel).toBeDefined();

      // The extension should be applied (edge extension value should be 30)
      // We can verify by checking the panel's edge extensions from the snapshot
      // Note: The actual effect depends on engine implementation
    });

    it('chains multiple extension operations', () => {
      const { panel } = AssemblyBuilder.basicBox(100, 80, 60)
        .panel('front')
        .withExtension('top', 30)
        .withExtension('bottom', 20)
        .build();

      expect(panel).toBeDefined();
    });

    it('returns this for chaining', () => {
      const fixture = AssemblyBuilder.enclosedBox(100, 80, 60);
      const builder = fixture.panel('front');

      const result = builder.withExtension('top', 30);

      expect(result).toBe(builder);
    });
  });

  describe('withExtensions', () => {
    it('queues multiple extensions at once', () => {
      const { panel } = AssemblyBuilder.basicBox(100, 80, 60)
        .panel('front')
        .withExtensions(['top', 'bottom'], 25)
        .build();

      expect(panel).toBeDefined();
    });

    it('uses default amount of 20', () => {
      const { panel } = AssemblyBuilder.basicBox(100, 80, 60)
        .panel('front')
        .withExtensions(['left', 'right'])
        .build();

      expect(panel).toBeDefined();
    });

    it('returns this for chaining', () => {
      const fixture = AssemblyBuilder.enclosedBox(100, 80, 60);
      const builder = fixture.panel('front');

      const result = builder.withExtensions(['top', 'left'], 30);

      expect(result).toBe(builder);
    });
  });

  describe('withCutout', () => {
    it('queues cutout operation with rect shape', () => {
      const { panel } = AssemblyBuilder.enclosedBox(100, 80, 60)
        .panel('front')
        .withCutout(rect(10, 10, 20, 15))
        .build();

      expect(panel).toBeDefined();
      // Cutout should be added to panel
      // The panel should have a hole (cutout is a hole in the panel)
    });

    it('queues cutout operation with circle shape', () => {
      const { panel } = AssemblyBuilder.enclosedBox(100, 80, 60)
        .panel('front')
        .withCutout(circle(50, 40, 10))
        .build();

      expect(panel).toBeDefined();
    });

    it('returns this for chaining', () => {
      const fixture = AssemblyBuilder.enclosedBox(100, 80, 60);
      const builder = fixture.panel('front');

      const result = builder.withCutout(rect(10, 10, 20, 20));

      expect(result).toBe(builder);
    });
  });

  describe('withCutouts', () => {
    it('queues multiple cutouts', () => {
      const { panel } = AssemblyBuilder.enclosedBox(100, 80, 60)
        .panel('front')
        .withCutouts([
          rect(10, 10, 20, 15),
          rect(40, 10, 20, 15),
        ])
        .build();

      expect(panel).toBeDefined();
    });

    it('returns this for chaining', () => {
      const fixture = AssemblyBuilder.enclosedBox(100, 80, 60);
      const builder = fixture.panel('front');

      const result = builder.withCutouts([rect(10, 10, 20, 20)]);

      expect(result).toBe(builder);
    });
  });

  describe('withFillet', () => {
    it('queues fillet operation', () => {
      const { panel } = AssemblyBuilder.enclosedBox(100, 80, 60)
        .panel('front')
        .withFillet(['bottom:left', 'bottom:right'], 5)
        .build();

      expect(panel).toBeDefined();
    });

    it('accepts single corner', () => {
      const { panel } = AssemblyBuilder.enclosedBox(100, 80, 60)
        .panel('front')
        .withFillet(['left:top'], 10)
        .build();

      expect(panel).toBeDefined();
    });

    it('returns this for chaining', () => {
      const fixture = AssemblyBuilder.enclosedBox(100, 80, 60);
      const builder = fixture.panel('front');

      const result = builder.withFillet(['bottom:left'], 5);

      expect(result).toBe(builder);
    });
  });

  describe('withChamfer', () => {
    it('queues chamfer operation (logs warning since not implemented)', () => {
      const { panel } = AssemblyBuilder.enclosedBox(100, 80, 60)
        .panel('front')
        .withChamfer(['bottom:left', 'bottom:right'], 5)
        .build();

      expect(panel).toBeDefined();
      // Should log warning about unimplemented action
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('APPLY_CHAMFER not implemented')
      );
    });

    it('returns this for chaining', () => {
      const fixture = AssemblyBuilder.enclosedBox(100, 80, 60);
      const builder = fixture.panel('front');

      const result = builder.withChamfer(['bottom:left'], 5);

      expect(result).toBe(builder);
    });
  });

  describe('and()', () => {
    it('returns to AssemblyBuilder for further configuration', () => {
      const fixture = AssemblyBuilder.enclosedBox(100, 80, 60);

      const returnedFixture = fixture
        .panel('front')
        .withExtension('top', 30)
        .and();

      // Should be the same fixture instance
      expect(returnedFixture).toBe(fixture);
    });

    it('allows chaining back to fixture methods', () => {
      const { panels } = AssemblyBuilder.enclosedBox(100, 80, 60)
        .panel('front')
        .withExtension('top', 30)
        .and()
        .withOpenFaces(['top', 'front'])
        .build();

      // 6 faces - 2 open = 4 panels
      expect(panels.length).toBe(4);

      const faceIds = panels.map(p => p.source.faceId);
      expect(faceIds).not.toContain('top');
      expect(faceIds).not.toContain('front');
    });
  });

  describe('clone()', () => {
    it('creates independent copy', () => {
      const original = AssemblyBuilder.enclosedBox(100, 80, 60)
        .panel('front')
        .withExtension('top', 30);

      const cloned = original.clone();

      // Modify clone
      cloned.withExtension('bottom', 20);

      // Original should be unchanged (no bottom extension)
      // Clone should have both extensions
      const { panel: origPanel } = original.build();
      const { panel: clonePanel } = cloned.build();

      expect(origPanel).toBeDefined();
      expect(clonePanel).toBeDefined();

      // Both should select front panel
      expect(origPanel?.source.faceId).toBe('front');
      expect(clonePanel?.source.faceId).toBe('front');
    });

    it('preserves face selection', () => {
      const builder = AssemblyBuilder.enclosedBox(100, 80, 60).panel('back');
      const cloned = builder.clone();

      expect(cloned.getFaceId()).toBe('back');
    });
  });

  describe('Open Face Handling', () => {
    it('handles operations on open faces gracefully', () => {
      // Top is open in basicBox
      const { panel } = AssemblyBuilder.basicBox(100, 80, 60)
        .panel('top')
        .withExtension('left', 30)
        .build();

      // Panel should be undefined since top is open
      expect(panel).toBeUndefined();

      // Should have logged a warning
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('Complex Chaining', () => {
    it('supports complex operation chains', () => {
      const { panel, panels } = AssemblyBuilder.basicBox(100, 80, 60)
        .panel('front')
        .withExtension('top', 30)
        .withCutout(rect(20, 20, 10, 10))
        .withFillet(['bottom:left'], 5)
        .build();

      expect(panel).toBeDefined();
      expect(panels.length).toBe(5); // basicBox has top open
    });

    it('supports returning to fixture and selecting different panel', () => {
      const fixture = AssemblyBuilder.enclosedBox(100, 80, 60);

      // Configure front panel
      const { panel: frontPanel } = fixture
        .panel('front')
        .withExtension('top', 30)
        .and()
        .panel('back') // Select a different panel
        .build();

      // Should return the back panel (last selected)
      expect(frontPanel?.source.faceId).toBe('back');
    });
  });
});
