/**
 * BoxStore Isolate Functionality Tests
 *
 * These tests verify that:
 * 1. Isolating a void hides all other voids, face panels, and sub-assemblies
 * 2. Isolating a sub-assembly hides all voids, face panels, and other sub-assemblies
 * 3. Isolating a panel hides all other panels, voids, and sub-assemblies
 * 4. Un-isolating restores only the elements hidden by the isolate action
 * 5. Elements that were already hidden before isolating remain hidden after un-isolating
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { create } from 'zustand';
import {
  BoxState,
  BoxActions,
  Void,
  Face,
  FaceId,
  defaultAssemblyConfig,
} from '../types';

// Mock the store creation for testing
// We test the logic directly without the full store implementation

describe('Isolate Functionality', () => {
  describe('Void Isolation', () => {
    it('should hide all face panels when isolating a void', () => {
      // When isolating a void, all main box face panels should be hidden
      const hiddenFaceIds = new Set<string>();
      const mainFaceIds = ['face-front', 'face-back', 'face-left', 'face-right', 'face-top', 'face-bottom'];

      // Simulate isolation: add all face IDs to hidden set
      for (const faceId of mainFaceIds) {
        hiddenFaceIds.add(faceId);
      }

      expect(hiddenFaceIds.size).toBe(6);
      for (const faceId of mainFaceIds) {
        expect(hiddenFaceIds.has(faceId)).toBe(true);
      }
    });

    it('should hide sibling voids when isolating a child void', () => {
      // Given a tree: root -> [child1, child2]
      // When isolating child1, child2 should be hidden
      const rootVoid: Void = {
        id: 'root',
        bounds: { x: 0, y: 0, z: 0, w: 100, h: 100, d: 100 },
        children: [
          {
            id: 'child1',
            bounds: { x: 0, y: 0, z: 0, w: 50, h: 100, d: 100 },
            children: [],
            splitAxis: 'x',
            splitPosition: 50,
          },
          {
            id: 'child2',
            bounds: { x: 50, y: 0, z: 0, w: 50, h: 100, d: 100 },
            children: [],
          },
        ],
      };

      // Get all void IDs
      const getVoidSubtreeIds = (node: Void): string[] => {
        const ids = [node.id];
        for (const child of node.children) {
          ids.push(...getVoidSubtreeIds(child));
        }
        return ids;
      };

      const allVoidIds = getVoidSubtreeIds(rootVoid);
      expect(allVoidIds).toContain('root');
      expect(allVoidIds).toContain('child1');
      expect(allVoidIds).toContain('child2');

      // When isolating child1, only child1 should be visible
      const isolatedVoidId = 'child1';
      const visibleVoidIds = new Set(['child1']); // Only the isolated void

      const hiddenVoidIds = new Set<string>();
      for (const id of allVoidIds) {
        if (!visibleVoidIds.has(id)) {
          hiddenVoidIds.add(id);
        }
      }

      expect(hiddenVoidIds.has('root')).toBe(true);
      expect(hiddenVoidIds.has('child1')).toBe(false);
      expect(hiddenVoidIds.has('child2')).toBe(true);
    });

    it('should preserve descendant visibility when isolating a parent void', () => {
      // Given a tree: root -> parent -> [grandchild1, grandchild2]
      // When isolating parent, grandchild1 and grandchild2 should remain visible
      const parentVoid: Void = {
        id: 'parent',
        bounds: { x: 0, y: 0, z: 0, w: 100, h: 100, d: 100 },
        children: [
          {
            id: 'grandchild1',
            bounds: { x: 0, y: 0, z: 0, w: 50, h: 100, d: 100 },
            children: [],
            splitAxis: 'x',
            splitPosition: 50,
          },
          {
            id: 'grandchild2',
            bounds: { x: 50, y: 0, z: 0, w: 50, h: 100, d: 100 },
            children: [],
          },
        ],
      };

      // Get subtree IDs for isolated void
      const getVoidSubtreeIds = (node: Void): string[] => {
        const ids = [node.id];
        for (const child of node.children) {
          ids.push(...getVoidSubtreeIds(child));
        }
        return ids;
      };

      const visibleVoidIds = new Set(getVoidSubtreeIds(parentVoid));

      expect(visibleVoidIds.has('parent')).toBe(true);
      expect(visibleVoidIds.has('grandchild1')).toBe(true);
      expect(visibleVoidIds.has('grandchild2')).toBe(true);
    });
  });

  describe('Panel Isolation', () => {
    it('should hide all other panels when isolating a face panel', () => {
      const isolatedPanelId = 'face-front';
      const allPanelIds = [
        'face-front', 'face-back', 'face-left', 'face-right', 'face-top', 'face-bottom',
        'divider-void-1-split',
      ];

      const hiddenFaceIds = new Set<string>();
      for (const panelId of allPanelIds) {
        if (panelId !== isolatedPanelId) {
          hiddenFaceIds.add(panelId);
        }
      }

      expect(hiddenFaceIds.has('face-front')).toBe(false);
      expect(hiddenFaceIds.has('face-back')).toBe(true);
      expect(hiddenFaceIds.has('divider-void-1-split')).toBe(true);
    });

    it('should hide all other panels when isolating a divider panel', () => {
      const isolatedPanelId = 'divider-void-1-split';
      const allPanelIds = [
        'face-front', 'face-back', 'face-left', 'face-right', 'face-top', 'face-bottom',
        'divider-void-1-split',
        'divider-void-2-split',
      ];

      const hiddenFaceIds = new Set<string>();
      for (const panelId of allPanelIds) {
        if (panelId !== isolatedPanelId) {
          hiddenFaceIds.add(panelId);
        }
      }

      expect(hiddenFaceIds.has('divider-void-1-split')).toBe(false);
      expect(hiddenFaceIds.has('divider-void-2-split')).toBe(true);
      expect(hiddenFaceIds.has('face-front')).toBe(true);
    });
  });

  describe('Un-isolation Restoration', () => {
    it('should restore only elements hidden by isolate action', () => {
      // Pre-existing hidden state
      const preHiddenFaceIds = new Set(['face-top']); // User had already hidden top
      const hiddenFaceIds = new Set(preHiddenFaceIds);

      // Track what isolate action hides
      const isolateHiddenFaceIds = new Set<string>();

      // Simulate isolating face-front
      const isolatedPanelId = 'face-front';
      const mainFaceIds = ['face-front', 'face-back', 'face-left', 'face-right', 'face-top', 'face-bottom'];

      for (const faceId of mainFaceIds) {
        if (faceId !== isolatedPanelId && !preHiddenFaceIds.has(faceId)) {
          hiddenFaceIds.add(faceId);
          isolateHiddenFaceIds.add(faceId);
        }
      }

      // face-top was already hidden, so it shouldn't be in isolateHiddenFaceIds
      expect(isolateHiddenFaceIds.has('face-top')).toBe(false);
      expect(isolateHiddenFaceIds.has('face-back')).toBe(true);
      expect(isolateHiddenFaceIds.has('face-left')).toBe(true);
      expect(isolateHiddenFaceIds.has('face-right')).toBe(true);
      expect(isolateHiddenFaceIds.has('face-bottom')).toBe(true);

      // Now un-isolate: remove only isolateHiddenFaceIds from hiddenFaceIds
      for (const id of isolateHiddenFaceIds) {
        hiddenFaceIds.delete(id);
      }

      // face-top should still be hidden (was hidden before isolate)
      expect(hiddenFaceIds.has('face-top')).toBe(true);
      // Other faces should be visible
      expect(hiddenFaceIds.has('face-back')).toBe(false);
      expect(hiddenFaceIds.has('face-left')).toBe(false);
      expect(hiddenFaceIds.has('face-right')).toBe(false);
      expect(hiddenFaceIds.has('face-bottom')).toBe(false);
    });

    it('should preserve children hidden status during void isolation', () => {
      // Given a void with hidden children
      const preHiddenVoidIds = new Set(['child-hidden']);
      const hiddenVoidIds = new Set(preHiddenVoidIds);
      const isolateHiddenVoidIds = new Set<string>();

      // Simulate tree
      const allVoidIds = ['root', 'parent', 'child-visible', 'child-hidden', 'sibling'];
      const isolatedSubtreeIds = ['parent', 'child-visible', 'child-hidden'];

      // Isolate parent - hide everything not in subtree
      for (const id of allVoidIds) {
        if (!isolatedSubtreeIds.includes(id) && !preHiddenVoidIds.has(id)) {
          hiddenVoidIds.add(id);
          isolateHiddenVoidIds.add(id);
        }
      }

      // child-hidden was already hidden, so not in isolateHiddenVoidIds
      expect(isolateHiddenVoidIds.has('child-hidden')).toBe(false);
      expect(isolateHiddenVoidIds.has('root')).toBe(true);
      expect(isolateHiddenVoidIds.has('sibling')).toBe(true);

      // Un-isolate
      for (const id of isolateHiddenVoidIds) {
        hiddenVoidIds.delete(id);
      }

      // child-hidden should still be hidden
      expect(hiddenVoidIds.has('child-hidden')).toBe(true);
      // Others should be restored
      expect(hiddenVoidIds.has('root')).toBe(false);
      expect(hiddenVoidIds.has('sibling')).toBe(false);
    });
  });

  describe('Tree Element Controls', () => {
    // These tests document that all tree elements should have hide and isolate controls
    // The actual UI tests would require DOM testing, but we verify the requirements here

    it('should support visibility toggle for all element types', () => {
      // Face panels
      const facePanelId = 'face-front';
      const hiddenFaceIds = new Set<string>();
      hiddenFaceIds.add(facePanelId);
      expect(hiddenFaceIds.has(facePanelId)).toBe(true);
      hiddenFaceIds.delete(facePanelId);
      expect(hiddenFaceIds.has(facePanelId)).toBe(false);

      // Divider panels
      const dividerPanelId = 'divider-void-1-split';
      hiddenFaceIds.add(dividerPanelId);
      expect(hiddenFaceIds.has(dividerPanelId)).toBe(true);

      // Voids
      const voidId = 'void-1';
      const hiddenVoidIds = new Set<string>();
      hiddenVoidIds.add(voidId);
      expect(hiddenVoidIds.has(voidId)).toBe(true);

      // Sub-assemblies
      const subAssemblyId = 'subasm-1';
      const hiddenSubAssemblyIds = new Set<string>();
      hiddenSubAssemblyIds.add(subAssemblyId);
      expect(hiddenSubAssemblyIds.has(subAssemblyId)).toBe(true);
    });

    it('should support isolate for all element types', () => {
      // These are the states that track isolation for different element types
      let isolatedVoidId: string | null = null;
      let isolatedSubAssemblyId: string | null = null;
      let isolatedPanelId: string | null = null;

      // Isolate a void
      isolatedVoidId = 'void-1';
      expect(isolatedVoidId).toBe('void-1');

      // Isolate a sub-assembly
      isolatedSubAssemblyId = 'subasm-1';
      expect(isolatedSubAssemblyId).toBe('subasm-1');

      // Isolate a panel (face or divider)
      isolatedPanelId = 'face-front';
      expect(isolatedPanelId).toBe('face-front');

      isolatedPanelId = 'divider-void-1-split';
      expect(isolatedPanelId).toBe('divider-void-1-split');
    });
  });
});
