import { describe, it, expect } from 'vitest';
import { AssemblyNode } from '../../../src/engine/nodes/AssemblyNode';
import { MaterialConfig } from '../../../src/engine/types';

describe('BaseAssembly', () => {
  describe('Finger Parameter Validation', () => {
    const defaultMaterial: MaterialConfig = {
      thickness: 3,
      fingerWidth: 10,
      fingerGap: 1.5,
    };

    it('constrains fingerWidth when too large for dimensions', () => {
      // Small 30mm cube with fingerWidth=10, fingerGap=1.5
      // maxJointLength = 30 - 6 = 24mm
      // For 3 sections with gap 1.5: maxFingerWidth = 24 / (3 + 2*1.5) = 24 / 6 = 4mm
      const assembly = new AssemblyNode(30, 30, 30, defaultMaterial);

      const limits = assembly.getFingerParameterLimits();
      expect(limits.maxFingerWidth).toBe(4);

      // The fingerWidth should have been clamped to fit (rounded down to 1 decimal)
      expect(assembly.material.fingerWidth).toBeLessThanOrEqual(4);
      expect(assembly.material.fingerWidth).toBeGreaterThan(0);
    });

    it('constrains fingerGap when too large for dimensions', () => {
      // Use dimensions where a reasonable fingerWidth fits but fingerGap is excessive
      // 80mm cube, thickness=3: maxJointLength = 74mm
      // With fingerWidth=8, initial fingerGap=10:
      // maxFingerWidth = 74 / (3 + 2*10) = 74/23 = 3.2mm
      // So fingerWidth=8 gets constrained first to ~3.2
      // Then fingerGap gets constrained based on the new fingerWidth
      const assembly = new AssemblyNode(80, 80, 80, {
        thickness: 3,
        fingerWidth: 8,
        fingerGap: 10, // Very large gap
      });

      const fw = assembly.material.fingerWidth;
      const fg = assembly.material.fingerGap;
      const maxJointLength = 74;
      const usableLength = maxJointLength - 2 * fg * fw;

      // After validation, 3 sections should fit
      expect(usableLength).toBeGreaterThanOrEqual(3 * fw * 0.99);
    });

    it('allows valid finger parameters', () => {
      const assembly = new AssemblyNode(200, 200, 200, defaultMaterial);

      // Large box should allow the default parameters
      expect(assembly.material.fingerWidth).toBe(10);
      expect(assembly.material.fingerGap).toBe(1.5);
    });

    it('validates parameters when dimensions change', () => {
      const assembly = new AssemblyNode(200, 200, 200, defaultMaterial);

      // Initially valid
      expect(assembly.material.fingerWidth).toBe(10);

      // Shrink the box significantly
      assembly.setDimensions({ width: 30, height: 30, depth: 30 });

      // Finger width should be constrained
      // maxJointLength = 24, maxFingerWidth = 24 / (3 + 3) = 4
      expect(assembly.material.fingerWidth).toBeLessThanOrEqual(4);
    });

    it('validates parameters when material changes', () => {
      const assembly = new AssemblyNode(100, 100, 100, {
        thickness: 3,
        fingerWidth: 5,
        fingerGap: 0.5,
      });

      // Initially valid with small finger width
      expect(assembly.material.fingerWidth).toBe(5);

      // Try to set a finger width that's too large for 3 sections
      // maxJointLength = 94, maxFingerWidth = 94 / (3 + 1) = 23.5
      assembly.setMaterial({ fingerWidth: 30 });

      // Should be constrained to ~23.5
      expect(assembly.material.fingerWidth).toBeLessThanOrEqual(24);
    });

    it('ensures at least 3 sections can fit', () => {
      // Create assembly with various sizes
      const sizes = [50, 60, 80, 100, 150];

      for (const size of sizes) {
        const assembly = new AssemblyNode(size, size, size, {
          thickness: 3,
          fingerWidth: 10,
          fingerGap: 1.5,
        });

        const mt = assembly.material.thickness;
        const fw = assembly.material.fingerWidth;
        const fg = assembly.material.fingerGap;
        const maxJointLength = size - 2 * mt;
        const usableLength = maxJointLength - 2 * fg * fw;

        // After validation, there should be room for at least 3 sections
        // (or fingerWidth is 0 if impossible)
        if (fw > 0) {
          expect(usableLength).toBeGreaterThanOrEqual(3 * fw * 0.99); // Allow small rounding
        }
      }
    });

    it('handles edge case of very thin material', () => {
      const assembly = new AssemblyNode(100, 100, 100, {
        thickness: 0.5,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // maxJointLength = 100 - 1 = 99mm, plenty of room
      expect(assembly.material.fingerWidth).toBe(10);
      expect(assembly.material.fingerGap).toBe(1.5);
    });

    it('handles edge case of thick material', () => {
      const assembly = new AssemblyNode(50, 50, 50, {
        thickness: 10,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // maxJointLength = 50 - 20 = 30mm
      // maxFingerWidth = 30 / (3 + 3) = 5mm
      expect(assembly.material.fingerWidth).toBeLessThanOrEqual(5);
    });

    it('returns correct limits for UI', () => {
      // Use dimensions where fingerWidth=10 fits
      const assembly = new AssemblyNode(100, 100, 100, defaultMaterial);

      // maxJointLength = 100 - 6 = 94mm
      const limits = assembly.getFingerParameterLimits();

      // maxFingerWidth = 94 / (3 + 2*1.5) = 94 / 6 = 15.67
      expect(limits.maxFingerWidth).toBeCloseTo(15.67, 1);

      // maxGap = (94/10 - 3) / 2 = (9.4 - 3) / 2 = 3.2
      expect(limits.maxFingerGap).toBeCloseTo(3.2, 1);
    });

    it('validates both fingerWidth and fingerGap together', () => {
      // Test that validation handles the interdependence correctly
      const assembly = new AssemblyNode(60, 60, 60, {
        thickness: 3,
        fingerWidth: 15, // Too large
        fingerGap: 2,    // Also might need adjustment
      });

      // maxJointLength = 54
      // Initial maxFingerWidth = 54 / (3 + 4) = 7.7
      // After fingerWidth constrained, maxGap recalculated

      const fw = assembly.material.fingerWidth;
      const fg = assembly.material.fingerGap;
      const maxJointLength = 54;
      const usableLength = maxJointLength - 2 * fg * fw;

      // Should still allow 3 sections
      expect(usableLength).toBeGreaterThanOrEqual(3 * fw * 0.99);
    });
  });
});
