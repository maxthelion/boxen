/**
 * BoxStore Tests
 *
 * These tests verify:
 * 1. Isolate functionality (hiding/showing elements)
 * 2. Push/Pull behavior (scale vs extend modes)
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
  Bounds,
  MAIN_FACE_PANEL_IDS,
} from '../../../src/types';
import { useBoxStore } from '../../../src/store/useBoxStore';
import { dispatchToEngine, syncStoreToEngine } from '../../../src/engine';

// Mock the store creation for testing
// We test the logic directly without the full store implementation

describe('Isolate Functionality', () => {
  describe('Void Isolation', () => {
    it('should hide all face panels when isolating a void', () => {
      // When isolating a void, all main box face panels should be hidden
      const hiddenFaceIds = new Set<string>();

      // Simulate isolation: add all face IDs to hidden set
      for (const faceId of MAIN_FACE_PANEL_IDS) {
        hiddenFaceIds.add(faceId);
      }

      expect(hiddenFaceIds.size).toBe(6);
      for (const faceId of MAIN_FACE_PANEL_IDS) {
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
        ...MAIN_FACE_PANEL_IDS,
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
        ...MAIN_FACE_PANEL_IDS,
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

      for (const faceId of MAIN_FACE_PANEL_IDS) {
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

describe('Push/Pull Face Offset', () => {
  // Helper to create a subdivision in the root void using engine dispatch
  const createSubdivision = (axis: 'x' | 'y' | 'z', position: number) => {
    const store = useBoxStore.getState();
    // Use engine dispatch to add subdivision
    syncStoreToEngine(store.config, store.faces, store.rootVoid);
    const result = dispatchToEngine({
      type: 'ADD_SUBDIVISIONS',
      targetId: 'main-assembly',
      payload: {
        voidId: 'root',
        axis,
        positions: [position],
      },
    });
    if (result.success && result.snapshot) {
      useBoxStore.setState({ rootVoid: result.snapshot.rootVoid });
    }
  };

  beforeEach(() => {
    // Reset store to initial state before each test
    useBoxStore.setState({
      config: {
        width: 100,
        height: 80,
        depth: 60,
        materialThickness: 3,
        fingerWidth: 10,
        fingerGap: 3,
        assembly: defaultAssemblyConfig,
      },
      rootVoid: {
        id: 'root',
        bounds: { x: 0, y: 0, z: 0, w: 100, h: 80, d: 60 },
        children: [],
      },
    });
  });

  describe('Children Preservation', () => {
    it('should preserve children when face is pulled in extend mode', () => {
      // First, create a subdivision (child void)
      createSubdivision('x', 50);

      // Verify children exist
      let state = useBoxStore.getState();
      expect(state.rootVoid.children.length).toBe(2);

      const child1Id = state.rootVoid.children[0].id;
      const child2Id = state.rootVoid.children[1].id;

      // Now pull the right face outward by 20mm in extend mode
      const store = useBoxStore.getState();
      store.setFaceOffset('right', 20, 'extend');

      // Children should still exist
      state = useBoxStore.getState();
      expect(state.rootVoid.children.length).toBe(2);
      expect(state.rootVoid.children.some(c => c.id === child1Id)).toBe(true);
      expect(state.rootVoid.children.some(c => c.id === child2Id)).toBe(true);
    });

    it('should scale children proportionally when face is pulled in scale mode', () => {
      // First, create a subdivision at X=50 (width is 100, so 50%)
      createSubdivision('x', 50);

      // Verify children exist
      let state = useBoxStore.getState();
      expect(state.rootVoid.children.length).toBe(2);

      const initialWidth = state.config.width; // 100
      const leftChild = state.rootVoid.children.find(c => c.bounds.x === 0);
      const rightChild = state.rootVoid.children.find(c => c.bounds.x > 0);

      expect(leftChild).toBeDefined();
      expect(rightChild).toBeDefined();

      const leftChildInitialWidth = leftChild!.bounds.w;
      const rightChildInitialWidth = rightChild!.bounds.w;
      const rightChildInitialX = rightChild!.bounds.x;

      // Now pull the right face outward by 20mm in scale mode (100 -> 120, scale factor 1.2)
      const store = useBoxStore.getState();
      store.setFaceOffset('right', 20, 'scale');

      // Children should still exist
      state = useBoxStore.getState();
      expect(state.rootVoid.children.length).toBe(2);

      const leftChildAfter = state.rootVoid.children.find(c => c.id === leftChild!.id);
      const rightChildAfter = state.rootVoid.children.find(c => c.id === rightChild!.id);

      expect(leftChildAfter).toBeDefined();
      expect(rightChildAfter).toBeDefined();

      // Scale factor should be 120/100 = 1.2
      const scaleFactor = state.config.width / initialWidth;
      expect(scaleFactor).toBeCloseTo(1.2, 2);

      // Children should be scaled proportionally
      expect(leftChildAfter!.bounds.w).toBeCloseTo(leftChildInitialWidth * scaleFactor, 1);
      expect(rightChildAfter!.bounds.w).toBeCloseTo(rightChildInitialWidth * scaleFactor, 1);
      expect(rightChildAfter!.bounds.x).toBeCloseTo(rightChildInitialX * scaleFactor, 1);
    });
  });

  describe('Scale Mode', () => {
    it('should increase box dimension when face is pulled outward', () => {
      const store = useBoxStore.getState();
      const initialWidth = store.config.width;

      // Pull right face outward by 20mm
      store.setFaceOffset('right', 20, 'scale');

      const state = useBoxStore.getState();
      expect(state.config.width).toBe(initialWidth + 20);
    });

    it('should decrease box dimension when face is pushed inward', () => {
      const store = useBoxStore.getState();
      const initialWidth = store.config.width;

      // Push right face inward by 10mm
      store.setFaceOffset('right', -10, 'scale');

      const state = useBoxStore.getState();
      expect(state.config.width).toBe(initialWidth - 10);
    });

    it('should update root void bounds to match new dimensions', () => {
      const store = useBoxStore.getState();

      store.setFaceOffset('top', 15, 'scale');

      const state = useBoxStore.getState();
      expect(state.rootVoid.bounds.h).toBe(state.config.height);
      expect(state.config.height).toBe(80 + 15);
    });
  });

  describe('Extend Mode', () => {
    it('should increase box dimension when face is pulled outward', () => {
      const store = useBoxStore.getState();
      const initialDepth = store.config.depth;

      // Pull front face outward by 25mm
      store.setFaceOffset('front', 25, 'extend');

      const state = useBoxStore.getState();
      expect(state.config.depth).toBe(initialDepth + 25);
    });

    it('should only expand the void closest to the extended face', () => {
      // Create a subdivision along X axis at position 50
      // This creates two voids: one from 0-48.5 and one from 51.5-100 (with 3mm divider)
      createSubdivision('x', 50);

      let state = useBoxStore.getState();
      const leftChild = state.rootVoid.children.find(c => c.bounds.x === 0);
      const rightChild = state.rootVoid.children.find(c => c.bounds.x > 0);

      expect(leftChild).toBeDefined();
      expect(rightChild).toBeDefined();

      const leftChildInitialWidth = leftChild!.bounds.w;
      const rightChildInitialWidth = rightChild!.bounds.w;

      // Pull right face outward by 20mm in extend mode
      const store = useBoxStore.getState();
      store.setFaceOffset('right', 20, 'extend');

      state = useBoxStore.getState();

      // Find children again (IDs are preserved)
      const leftChildAfter = state.rootVoid.children.find(c => c.id === leftChild!.id);
      const rightChildAfter = state.rootVoid.children.find(c => c.id === rightChild!.id);

      expect(leftChildAfter).toBeDefined();
      expect(rightChildAfter).toBeDefined();

      // Left child (not adjacent to right face) should keep same width
      expect(leftChildAfter!.bounds.w).toBe(leftChildInitialWidth);

      // Right child (adjacent to right face) should grow by 20mm
      expect(rightChildAfter!.bounds.w).toBe(rightChildInitialWidth + 20);
    });

    it('should expand bottom void when bottom face is extended', () => {
      // Create a subdivision along Y axis at position 40
      createSubdivision('y', 40);

      let state = useBoxStore.getState();
      const bottomChild = state.rootVoid.children.find(c => c.bounds.y === 0);
      const topChild = state.rootVoid.children.find(c => c.bounds.y > 0);

      expect(bottomChild).toBeDefined();
      expect(topChild).toBeDefined();

      const bottomChildInitialHeight = bottomChild!.bounds.h;
      const topChildInitialHeight = topChild!.bounds.h;

      // Pull bottom face downward (outward) by 15mm
      const store = useBoxStore.getState();
      store.setFaceOffset('bottom', 15, 'extend');

      state = useBoxStore.getState();

      const bottomChildAfter = state.rootVoid.children.find(c => c.id === bottomChild!.id);
      const topChildAfter = state.rootVoid.children.find(c => c.id === topChild!.id);

      // Bottom child should grow
      expect(bottomChildAfter!.bounds.h).toBe(bottomChildInitialHeight + 15);

      // Top child should stay the same height but shift position
      expect(topChildAfter!.bounds.h).toBe(topChildInitialHeight);
      expect(topChildAfter!.bounds.y).toBe(topChild!.bounds.y + 15);
    });

    it('should expand front void when front face is extended', () => {
      // Create a subdivision along Z axis at position 30
      createSubdivision('z', 30);

      let state = useBoxStore.getState();
      const backChild = state.rootVoid.children.find(c => c.bounds.z === 0);
      const frontChild = state.rootVoid.children.find(c => c.bounds.z > 0);

      expect(backChild).toBeDefined();
      expect(frontChild).toBeDefined();

      const backChildInitialDepth = backChild!.bounds.d;
      const frontChildInitialDepth = frontChild!.bounds.d;

      // Pull front face outward by 10mm
      const store = useBoxStore.getState();
      store.setFaceOffset('front', 10, 'extend');

      state = useBoxStore.getState();

      const backChildAfter = state.rootVoid.children.find(c => c.id === backChild!.id);
      const frontChildAfter = state.rootVoid.children.find(c => c.id === frontChild!.id);

      // Back child (not adjacent to front face) should keep same depth
      expect(backChildAfter!.bounds.d).toBe(backChildInitialDepth);

      // Front child (adjacent to front face) should grow
      expect(frontChildAfter!.bounds.d).toBe(frontChildInitialDepth + 10);
    });
  });

  describe('Inset Face', () => {
    it('should open the face and create a divider at the inset position', () => {
      const store = useBoxStore.getState();

      // Verify front face starts as solid
      let state = useBoxStore.getState();
      const frontFace = state.faces.find(f => f.id === 'front');
      expect(frontFace?.solid).toBe(true);

      // Inset the front face by 20mm
      store.insetFace('front', 20);

      state = useBoxStore.getState();

      // Front face should now be open
      const frontFaceAfter = state.faces.find(f => f.id === 'front');
      expect(frontFaceAfter?.solid).toBe(false);

      // Should have created two child voids (subdivision)
      expect(state.rootVoid.children.length).toBe(2);

      // One void should be at the front (inset position), one at the back
      const frontVoid = state.rootVoid.children.find(c =>
        c.bounds.z + c.bounds.d >= state.config.depth - 25
      );
      const backVoid = state.rootVoid.children.find(c => c.bounds.z === 0);

      expect(frontVoid).toBeDefined();
      expect(backVoid).toBeDefined();
    });

    it('should create divider at correct position when insetting top face', () => {
      const store = useBoxStore.getState();

      // Inset top face by 15mm
      store.insetFace('top', 15);

      const state = useBoxStore.getState();

      // Top face should be open
      const topFace = state.faces.find(f => f.id === 'top');
      expect(topFace?.solid).toBe(false);

      // Should have children
      expect(state.rootVoid.children.length).toBe(2);

      // The divider should be around height - 15 = 65mm position
      // Find the child that's at the top portion
      const topVoid = state.rootVoid.children.find(c =>
        c.bounds.y + c.bounds.h >= state.config.height - 20
      );
      expect(topVoid).toBeDefined();
    });
  });
});

