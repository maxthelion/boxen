import { describe, it, expect } from 'vitest';
import {
  getAdjacentFace,
  getLidGender,
  getEdgeGender,
  getDividerEdgeGender,
  getAllEdgeGenders,
  validateMatingGenders,
} from './genderRules';
import { Face, AssemblyConfig, FaceId } from '../types';

describe('Gender Rules', () => {
  // Standard test configuration
  const allSolidFaces: Face[] = [
    { id: 'front', solid: true },
    { id: 'back', solid: true },
    { id: 'left', solid: true },
    { id: 'right', solid: true },
    { id: 'top', solid: true },
    { id: 'bottom', solid: true },
  ];

  const defaultAssembly: AssemblyConfig = {
    assemblyAxis: 'y',
    lids: {
      positive: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
      negative: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
    },
  };

  describe('getAdjacentFace', () => {
    it('returns correct adjacent face for front panel', () => {
      expect(getAdjacentFace('front', 'top')).toBe('top');
      expect(getAdjacentFace('front', 'bottom')).toBe('bottom');
      expect(getAdjacentFace('front', 'left')).toBe('left');
      expect(getAdjacentFace('front', 'right')).toBe('right');
    });

    it('returns correct adjacent face for back panel (mirrored left/right)', () => {
      expect(getAdjacentFace('back', 'top')).toBe('top');
      expect(getAdjacentFace('back', 'bottom')).toBe('bottom');
      // Back panel left edge meets right panel, and vice versa
      expect(getAdjacentFace('back', 'left')).toBe('right');
      expect(getAdjacentFace('back', 'right')).toBe('left');
    });

    it('returns correct adjacent faces for side panels', () => {
      expect(getAdjacentFace('left', 'left')).toBe('back');
      expect(getAdjacentFace('left', 'right')).toBe('front');
      expect(getAdjacentFace('right', 'left')).toBe('front');
      expect(getAdjacentFace('right', 'right')).toBe('back');
    });

    it('returns correct adjacent faces for top panel', () => {
      expect(getAdjacentFace('top', 'top')).toBe('back');
      expect(getAdjacentFace('top', 'bottom')).toBe('front');
      expect(getAdjacentFace('top', 'left')).toBe('left');
      expect(getAdjacentFace('top', 'right')).toBe('right');
    });
  });

  describe('getLidGender', () => {
    it('returns male for tabs-out lid', () => {
      const assembly: AssemblyConfig = {
        assemblyAxis: 'y',
        lids: {
          positive: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
          negative: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
        },
      };
      expect(getLidGender('top', assembly)).toBe('male');
      expect(getLidGender('bottom', assembly)).toBe('male');
    });

    it('returns female for tabs-in lid', () => {
      const assembly: AssemblyConfig = {
        assemblyAxis: 'y',
        lids: {
          positive: { enabled: true, tabDirection: 'tabs-in', inset: 0 },
          negative: { enabled: true, tabDirection: 'tabs-in', inset: 0 },
        },
      };
      expect(getLidGender('top', assembly)).toBe('female');
      expect(getLidGender('bottom', assembly)).toBe('female');
    });

    it('returns null for non-lid faces', () => {
      expect(getLidGender('front', defaultAssembly)).toBeNull();
      expect(getLidGender('back', defaultAssembly)).toBeNull();
      expect(getLidGender('left', defaultAssembly)).toBeNull();
      expect(getLidGender('right', defaultAssembly)).toBeNull();
    });

    it('handles different assembly axes', () => {
      const xAxisAssembly: AssemblyConfig = {
        assemblyAxis: 'x',
        lids: {
          positive: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
          negative: { enabled: true, tabDirection: 'tabs-in', inset: 0 },
        },
      };
      // X axis: right = positive lid, left = negative lid
      expect(getLidGender('right', xAxisAssembly)).toBe('male');
      expect(getLidGender('left', xAxisAssembly)).toBe('female');
      // Other faces are walls
      expect(getLidGender('top', xAxisAssembly)).toBeNull();
      expect(getLidGender('front', xAxisAssembly)).toBeNull();
    });
  });

  describe('getEdgeGender', () => {
    it('returns null when adjacent face is open', () => {
      const facesWithOpenTop: Face[] = [
        { id: 'front', solid: true },
        { id: 'back', solid: true },
        { id: 'left', solid: true },
        { id: 'right', solid: true },
        { id: 'top', solid: false }, // Open top
        { id: 'bottom', solid: true },
      ];

      // Front top edge meets open top face - no joint
      expect(getEdgeGender('front', 'top', facesWithOpenTop, defaultAssembly)).toBeNull();
      // Front bottom edge meets solid bottom - should have joint
      expect(getEdgeGender('front', 'bottom', facesWithOpenTop, defaultAssembly)).not.toBeNull();
    });

    it('lid edges get lid gender (tabs-out = male)', () => {
      // Top panel edges meeting walls should be male (tabs-out)
      expect(getEdgeGender('top', 'bottom', allSolidFaces, defaultAssembly)).toBe('male');
      expect(getEdgeGender('top', 'left', allSolidFaces, defaultAssembly)).toBe('male');
      expect(getEdgeGender('bottom', 'top', allSolidFaces, defaultAssembly)).toBe('male');
    });

    it('lid edges get lid gender (tabs-in = female)', () => {
      const tabsInAssembly: AssemblyConfig = {
        assemblyAxis: 'y',
        lids: {
          positive: { enabled: true, tabDirection: 'tabs-in', inset: 0 },
          negative: { enabled: true, tabDirection: 'tabs-in', inset: 0 },
        },
      };
      expect(getEdgeGender('top', 'bottom', allSolidFaces, tabsInAssembly)).toBe('female');
      expect(getEdgeGender('bottom', 'top', allSolidFaces, tabsInAssembly)).toBe('female');
    });

    it('wall edges meeting lids get opposite of lid gender', () => {
      // Front panel top edge meets top lid (which is male/tabs-out)
      // So front should be female (receives tabs)
      expect(getEdgeGender('front', 'top', allSolidFaces, defaultAssembly)).toBe('female');
      expect(getEdgeGender('front', 'bottom', allSolidFaces, defaultAssembly)).toBe('female');
      expect(getEdgeGender('left', 'top', allSolidFaces, defaultAssembly)).toBe('female');
    });

    it('wall-to-wall edges use priority system', () => {
      // Priorities: front=1, back=2, left=3, right=4
      // Lower priority = male, higher = female

      // Front (1) meets left (3): front gets male
      expect(getEdgeGender('front', 'left', allSolidFaces, defaultAssembly)).toBe('male');
      // Left (3) meets front (1): left gets female
      expect(getEdgeGender('left', 'right', allSolidFaces, defaultAssembly)).toBe('female');

      // Front (1) meets right (4): front gets male
      expect(getEdgeGender('front', 'right', allSolidFaces, defaultAssembly)).toBe('male');
      // Right (4) meets front (1): right gets female
      expect(getEdgeGender('right', 'left', allSolidFaces, defaultAssembly)).toBe('female');
    });
  });

  describe('getDividerEdgeGender', () => {
    it('returns male when meeting solid face', () => {
      expect(getDividerEdgeGender(true)).toBe('male');
    });

    it('returns null when meeting open face', () => {
      expect(getDividerEdgeGender(false)).toBeNull();
    });
  });

  describe('getAllEdgeGenders', () => {
    it('returns genders for all four edges', () => {
      const genders = getAllEdgeGenders('front', allSolidFaces, defaultAssembly);

      expect(genders.top).toBeDefined();
      expect(genders.bottom).toBeDefined();
      expect(genders.left).toBeDefined();
      expect(genders.right).toBeDefined();
    });

    it('front panel has consistent gender pattern', () => {
      const genders = getAllEdgeGenders('front', allSolidFaces, defaultAssembly);

      // Top and bottom meet lids (male), so front gets female
      expect(genders.top).toBe('female');
      expect(genders.bottom).toBe('female');
      // Left and right are wall-to-wall, front has lower priority
      expect(genders.left).toBe('male');
      expect(genders.right).toBe('male');
    });
  });

  describe('validateMatingGenders', () => {
    it('returns true for valid mating pairs with all solid faces', () => {
      // All mating pairs should have opposite genders
      expect(validateMatingGenders('front', 'top', allSolidFaces, defaultAssembly)).toBe(true);
      expect(validateMatingGenders('front', 'bottom', allSolidFaces, defaultAssembly)).toBe(true);
      expect(validateMatingGenders('front', 'left', allSolidFaces, defaultAssembly)).toBe(true);
      expect(validateMatingGenders('front', 'right', allSolidFaces, defaultAssembly)).toBe(true);
      expect(validateMatingGenders('left', 'top', allSolidFaces, defaultAssembly)).toBe(true);
      expect(validateMatingGenders('back', 'right', allSolidFaces, defaultAssembly)).toBe(true);
    });

    it('returns true when both edges have no joint (open face)', () => {
      const facesWithOpenTop: Face[] = allSolidFaces.map((f) =>
        f.id === 'top' ? { ...f, solid: false } : f
      );

      // Front top edge and top bottom edge - both should be null
      expect(validateMatingGenders('front', 'top', facesWithOpenTop, defaultAssembly)).toBe(true);
    });

    it('validates all 12 edges of a box', () => {
      // Every edge pair in a fully closed box should validate
      const edgePairs: Array<[FaceId, 'top' | 'bottom' | 'left' | 'right']> = [
        ['front', 'top'],
        ['front', 'bottom'],
        ['front', 'left'],
        ['front', 'right'],
        ['back', 'top'],
        ['back', 'bottom'],
        ['back', 'left'],
        ['back', 'right'],
        ['left', 'top'],
        ['left', 'bottom'],
        ['right', 'top'],
        ['right', 'bottom'],
      ];

      for (const [face, edge] of edgePairs) {
        expect(
          validateMatingGenders(face, edge, allSolidFaces, defaultAssembly)
        ).toBe(true);
      }
    });
  });

  describe('Different assembly axes', () => {
    it('X axis assembly has left/right as lids', () => {
      const xAxisAssembly: AssemblyConfig = {
        assemblyAxis: 'x',
        lids: {
          positive: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
          negative: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
        },
      };

      // Left and right are lids
      expect(getEdgeGender('left', 'top', allSolidFaces, xAxisAssembly)).toBe('male');
      expect(getEdgeGender('right', 'top', allSolidFaces, xAxisAssembly)).toBe('male');

      // Front meeting left lid should be female
      expect(getEdgeGender('front', 'left', allSolidFaces, xAxisAssembly)).toBe('female');
    });

    it('Z axis assembly has front/back as lids', () => {
      const zAxisAssembly: AssemblyConfig = {
        assemblyAxis: 'z',
        lids: {
          positive: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
          negative: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
        },
      };

      // Front and back are lids
      expect(getEdgeGender('front', 'top', allSolidFaces, zAxisAssembly)).toBe('male');
      expect(getEdgeGender('back', 'top', allSolidFaces, zAxisAssembly)).toBe('male');

      // Top meeting front lid should be female
      expect(getEdgeGender('top', 'bottom', allSolidFaces, zAxisAssembly)).toBe('female');
    });
  });

  describe('Mixed lid directions', () => {
    it('handles top tabs-out, bottom tabs-in', () => {
      const mixedAssembly: AssemblyConfig = {
        assemblyAxis: 'y',
        lids: {
          positive: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
          negative: { enabled: true, tabDirection: 'tabs-in', inset: 0 },
        },
      };

      // Top lid is male (tabs-out)
      expect(getEdgeGender('top', 'bottom', allSolidFaces, mixedAssembly)).toBe('male');
      // Bottom lid is female (tabs-in)
      expect(getEdgeGender('bottom', 'top', allSolidFaces, mixedAssembly)).toBe('female');

      // Front meeting top should be female (opposite of top's male)
      expect(getEdgeGender('front', 'top', allSolidFaces, mixedAssembly)).toBe('female');
      // Front meeting bottom should be male (opposite of bottom's female)
      expect(getEdgeGender('front', 'bottom', allSolidFaces, mixedAssembly)).toBe('male');
    });
  });
});
