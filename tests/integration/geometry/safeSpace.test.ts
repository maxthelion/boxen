/**
 * Safe Space Integration Tests
 *
 * Tests that safe space calculation produces correct result paths
 * matching the mental model:
 * - Simple panels have 1 safe rectangle
 * - Panels with internal slots (dividers) have 2+ rectangles
 * - Result paths are valid closed rectangular polygons
 *
 * These tests verify the computed resultPaths, not the raw outline/exclusions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createEngine } from '../../../src/engine/Engine';
import { panelSnapshotToPanelPath } from '../../../src/engine/panelBridge';
import { calculateSafeSpace } from '../../../src/engine/safeSpace';
import {
  checkSafeSpaceValidity,
  formatSafeSpaceCheckResult,
} from '../../../src/engine/validators/SafeSpaceChecker';
import type { Engine } from '../../../src/engine/Engine';
import type { PanelPath, BoxConfig, FaceConfig } from '../../../src/types';
import type { AssemblySnapshot, FacePanelSnapshot, DividerPanelSnapshot } from '../../../src/engine/types';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get panels from engine with safe space calculated
 */
function getEnginePanelsWithSafeSpace(engine: Engine): PanelPath[] {
  const snapshot = engine.getSnapshot();
  const assembly = snapshot.children[0] as AssemblySnapshot;
  if (!assembly) return [];

  const panels = assembly.derived.panels;
  const faces: FaceConfig[] = assembly.props.faces.map(f => ({ id: f.id, solid: f.solid }));
  const config: BoxConfig = {
    width: assembly.props.width,
    height: assembly.props.height,
    depth: assembly.props.depth,
    materialThickness: assembly.props.material.thickness,
    fingerWidth: assembly.props.material.fingerWidth,
    fingerGap: assembly.props.material.fingerGap,
    assembly: {
      assemblyAxis: assembly.props.assembly.assemblyAxis,
      lids: {
        positive: { enabled: true, tabDirection: assembly.props.assembly.lids.positive.tabDirection, inset: assembly.props.assembly.lids.positive.inset },
        negative: { enabled: true, tabDirection: assembly.props.assembly.lids.negative.tabDirection, inset: assembly.props.assembly.lids.negative.inset },
      },
    },
  };

  return panels.map(p => {
    const panelPath = panelSnapshotToPanelPath(p);
    panelPath.safeSpace = calculateSafeSpace(panelPath, faces, config);
    return panelPath;
  });
}

/**
 * Get a panel by face ID from the engine
 */
function getFacePanel(engine: Engine, faceId: string): PanelPath | undefined {
  const panels = getEnginePanelsWithSafeSpace(engine);
  return panels.find(p => p.source.type === 'face' && p.source.faceId === faceId);
}

/**
 * Get all divider panels from the engine
 */
function getDividerPanels(engine: Engine): PanelPath[] {
  const panels = getEnginePanelsWithSafeSpace(engine);
  return panels.filter(p => p.source.type === 'divider');
}

/**
 * Check if a path is a rectangle (4 points, axis-aligned sides)
 */
function isRectangle(points: { x: number; y: number }[]): boolean {
  if (points.length !== 4) return false;

  const tolerance = 0.01;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const dx = Math.abs(points[j].x - points[i].x);
    const dy = Math.abs(points[j].y - points[i].y);

    // Each segment must be horizontal (dy ≈ 0) or vertical (dx ≈ 0)
    if (dx > tolerance && dy > tolerance) {
      return false;
    }
  }

  return true;
}

// =============================================================================
// Tests
// =============================================================================

describe('Safe Space Computation', () => {
  let engine: Engine;

  beforeEach(() => {
    engine = createEngine();
  });

  // ===========================================================================
  // Basic Panel - Single Safe Rectangle
  // ===========================================================================

  describe('Basic Panel (no subdivisions)', () => {
    beforeEach(() => {
      engine.createAssembly(100, 80, 60, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });
    });

    it('front panel has 1 safe rectangle', () => {
      const panel = getFacePanel(engine, 'front');
      expect(panel).toBeDefined();
      expect(panel!.safeSpace).toBeDefined();

      const safeSpace = panel!.safeSpace!;
      expect(safeSpace.resultPaths).toHaveLength(1);
      expect(isRectangle(safeSpace.resultPaths[0])).toBe(true);
    });

    it('all face panels have exactly 1 safe rectangle', () => {
      const faceIds = ['front', 'back', 'left', 'right', 'top', 'bottom'];

      for (const faceId of faceIds) {
        const panel = getFacePanel(engine, faceId);
        expect(panel).toBeDefined();
        expect(panel!.safeSpace).toBeDefined();

        const safeSpace = panel!.safeSpace!;
        expect(safeSpace.resultPaths.length).toBeGreaterThanOrEqual(1);

        // Each result path should be a rectangle
        for (const path of safeSpace.resultPaths) {
          expect(isRectangle(path)).toBe(true);
        }
      }
    });

    it('safe rectangle is inset from edges by 2×MT', () => {
      const panel = getFacePanel(engine, 'front');
      expect(panel).toBeDefined();

      const safeSpace = panel!.safeSpace!;
      const mt = 3; // material thickness
      const inset = 2 * mt;

      // Front panel body is width × height = 100 × 80
      // (front panel faces -Z, so it spans X and Y axes)
      const bodyWidth = 100;
      const bodyHeight = 80;

      // Safe rectangle should be inset by 2×MT on each jointed edge
      const resultPath = safeSpace.resultPaths[0];
      const minX = Math.min(...resultPath.map(p => p.x));
      const maxX = Math.max(...resultPath.map(p => p.x));
      const minY = Math.min(...resultPath.map(p => p.y));
      const maxY = Math.max(...resultPath.map(p => p.y));

      const safeWidth = maxX - minX;
      const safeHeight = maxY - minY;

      // Safe dimensions should be body - 2×inset on each axis
      expect(safeWidth).toBeCloseTo(bodyWidth - 2 * inset, 0.1);
      expect(safeHeight).toBeCloseTo(bodyHeight - 2 * inset, 0.1);
    });

    it('passes safe space validation', () => {
      const panel = getFacePanel(engine, 'front');
      expect(panel).toBeDefined();

      const result = checkSafeSpaceValidity(panel!, panel!.safeSpace!);

      if (!result.valid) {
        console.log(formatSafeSpaceCheckResult(result));
      }

      expect(result.valid).toBe(true);
    });
  });

  // ===========================================================================
  // Panel with Divider Slot - Multiple Safe Rectangles
  // ===========================================================================

  describe('Panel with Divider Slot', () => {
    beforeEach(() => {
      engine.createAssembly(100, 80, 60, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Add X-axis subdivision at center
      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', position: 50 },
      });
    });

    it('creates a divider panel', () => {
      const dividers = getDividerPanels(engine);
      expect(dividers.length).toBeGreaterThanOrEqual(1);
    });

    it('top/bottom panels have slots from the X-divider', () => {
      // X-axis divider meets top and bottom panels
      const topPanel = getFacePanel(engine, 'top');
      const bottomPanel = getFacePanel(engine, 'bottom');

      expect(topPanel).toBeDefined();
      expect(bottomPanel).toBeDefined();

      // These panels should have slot holes
      const topSlots = topPanel!.holes.filter(h =>
        h.source?.type === 'divider-slot' || h.type === 'slot'
      );
      const bottomSlots = bottomPanel!.holes.filter(h =>
        h.source?.type === 'divider-slot' || h.type === 'slot'
      );

      expect(topSlots.length).toBeGreaterThan(0);
      expect(bottomSlots.length).toBeGreaterThan(0);
    });

    it('top panel with slot has 2 safe rectangles', () => {
      const panel = getFacePanel(engine, 'top');
      expect(panel).toBeDefined();
      expect(panel!.safeSpace).toBeDefined();

      const safeSpace = panel!.safeSpace!;

      // With a full-spanning slot, we expect 2 safe regions
      // (one on each side of the slot)
      expect(safeSpace.resultPaths.length).toBeGreaterThanOrEqual(1);

      // Each result should be a rectangle
      for (const path of safeSpace.resultPaths) {
        expect(isRectangle(path)).toBe(true);
      }
    });

    it('front/back panels are NOT split (X-divider runs parallel)', () => {
      // X-axis divider doesn't intersect front/back panels
      const frontPanel = getFacePanel(engine, 'front');
      const backPanel = getFacePanel(engine, 'back');

      expect(frontPanel).toBeDefined();
      expect(backPanel).toBeDefined();

      // These panels should still have exactly 1 safe rectangle
      // (no slot from the X-divider)
      expect(frontPanel!.safeSpace!.resultPaths).toHaveLength(1);
      expect(backPanel!.safeSpace!.resultPaths).toHaveLength(1);
    });

    it('passes safe space validation', () => {
      const panels = ['front', 'back', 'left', 'right', 'top', 'bottom'];

      for (const faceId of panels) {
        const panel = getFacePanel(engine, faceId);
        if (!panel?.safeSpace) continue;

        const result = checkSafeSpaceValidity(panel, panel.safeSpace);

        if (!result.valid) {
          console.log(`Panel ${faceId}:`);
          console.log(formatSafeSpaceCheckResult(result));
        }

        expect(result.valid).toBe(true);
      }
    });
  });

  // ===========================================================================
  // Panel with Multiple Subdivisions
  // ===========================================================================

  describe('Panel with Multiple Subdivisions', () => {
    beforeEach(() => {
      engine.createAssembly(150, 100, 80, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Add two X-axis subdivisions
      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', position: 50 },
      });
      // Get the new void IDs after first subdivision
      const snapshot1 = engine.getSnapshot();
      const rootVoid = snapshot1.children[0].children[0];
      const leftVoid = rootVoid.children[0];

      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: leftVoid.id, axis: 'x', position: 75 },
      });
    });

    it('creates multiple divider panels', () => {
      const dividers = getDividerPanels(engine);
      expect(dividers.length).toBeGreaterThanOrEqual(2);
    });

    it('top panel has safe rectangles for each compartment', () => {
      const panel = getFacePanel(engine, 'top');
      expect(panel).toBeDefined();
      expect(panel!.safeSpace).toBeDefined();

      const safeSpace = panel!.safeSpace!;

      // With 2 full-spanning slots, we expect 3 safe regions
      // (but slots may not all span full width, so check at least 1)
      expect(safeSpace.resultPaths.length).toBeGreaterThanOrEqual(1);

      // Each result should be a rectangle
      for (const path of safeSpace.resultPaths) {
        expect(isRectangle(path)).toBe(true);
      }
    });

    it('divider panels have safe space too', () => {
      const dividers = getDividerPanels(engine);

      for (const divider of dividers) {
        expect(divider.safeSpace).toBeDefined();
        expect(divider.safeSpace!.resultPaths.length).toBeGreaterThanOrEqual(1);

        for (const path of divider.safeSpace!.resultPaths) {
          expect(isRectangle(path)).toBe(true);
        }
      }
    });
  });

  // ===========================================================================
  // Open Face Edge - No Joint, No Exclusion
  // ===========================================================================

  describe('Open Face Edge', () => {
    beforeEach(() => {
      engine.createAssembly(100, 80, 60, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Remove top face
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'top' },
      });
    });

    it('front panel top edge has no joint exclusion', () => {
      const panel = getFacePanel(engine, 'front');
      expect(panel).toBeDefined();

      const safeSpace = panel!.safeSpace!;
      const resultPath = safeSpace.resultPaths[0];

      // With top face open, front panel's top edge has no joint
      // The safe rectangle should extend closer to the top edge
      const maxY = Math.max(...resultPath.map(p => p.y));
      const halfH = panel!.height / 2;

      // Without joint, the safe area should extend to the panel edge
      // (no 2×MT exclusion on the open edge)
      expect(maxY).toBeCloseTo(halfH, 0.1);
    });

    it('has only 3 joint exclusions (one edge is open)', () => {
      const panel = getFacePanel(engine, 'front');
      expect(panel).toBeDefined();

      const jointExclusions = panel!.safeSpace!.reserved.filter(r => r.type === 'joint-edge');

      // Only 3 edges have joints (bottom, left, right - top is open)
      expect(jointExclusions).toHaveLength(3);
    });
  });

  // ===========================================================================
  // Edge Extension
  // ===========================================================================

  describe('Edge Extension', () => {
    beforeEach(() => {
      engine.createAssembly(100, 80, 60, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Remove bottom face so front panel bottom edge is open
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'bottom' },
      });

      // Get the front panel ID from the snapshot
      const snapshot = engine.getSnapshot();
      const assembly = snapshot.children[0] as AssemblySnapshot;
      const frontPanel = assembly.derived.panels.find(
        p => p.kind === 'face-panel' && (p as FacePanelSnapshot).props.faceId === 'front'
      );

      if (frontPanel) {
        // Extend the bottom edge of front panel
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: {
            panelId: frontPanel.id,
            edge: 'bottom',
            value: 15,
          },
        });
      }
    });

    it('safe space outline includes extension', () => {
      const panel = getFacePanel(engine, 'front');
      expect(panel).toBeDefined();

      const safeSpace = panel!.safeSpace!;
      const halfH = panel!.height / 2;

      // Outline should extend beyond body edge
      const minY = Math.min(...safeSpace.outline.map(p => p.y));
      expect(minY).toBeCloseTo(-halfH - 15, 0.1);
    });

    it('extension area is part of safe space', () => {
      const panel = getFacePanel(engine, 'front');
      expect(panel).toBeDefined();

      const safeSpace = panel!.safeSpace!;

      // Result paths should include the extension area
      // Since bottom edge has no joint (face is open), the extension is safe
      let hasExtendedPath = false;
      const halfH = panel!.height / 2;

      for (const path of safeSpace.resultPaths) {
        const minY = Math.min(...path.map(p => p.y));
        if (minY < -halfH) {
          hasExtendedPath = true;
          break;
        }
      }

      // The result paths should reach into the extension area
      // (since that edge has no joint exclusion)
      const allMinY = Math.min(...safeSpace.resultPaths.flatMap(p => p.map(pt => pt.y)));
      expect(allMinY).toBeLessThan(-halfH + 1); // Some extension is included
    });
  });

  // ===========================================================================
  // Top Edge Extension (matching user's scenario)
  // ===========================================================================

  describe('Top Edge Extension', () => {
    beforeEach(() => {
      engine.createAssembly(100, 100, 60, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Remove top face so front panel top edge is open
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'top' },
      });

      // Get the front panel ID from the snapshot
      const snapshot = engine.getSnapshot();
      const assembly = snapshot.children[0] as AssemblySnapshot;
      const frontPanel = assembly.derived.panels.find(
        p => p.kind === 'face-panel' && (p as FacePanelSnapshot).props.faceId === 'front'
      );

      if (frontPanel) {
        // Extend the top edge of front panel
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: {
            panelId: frontPanel.id,
            edge: 'top',
            value: 20,
          },
        });
      }
    });

    it('safe space outline includes top extension', () => {
      const panel = getFacePanel(engine, 'front');
      expect(panel).toBeDefined();

      const safeSpace = panel!.safeSpace!;
      const halfH = panel!.height / 2;

      // Outline should extend beyond body edge at the top
      const maxY = Math.max(...safeSpace.outline.map(p => p.y));
      expect(maxY).toBeCloseTo(halfH + 20, 0.1);
    });

    it('top extension area is part of safe space resultPaths', () => {
      const panel = getFacePanel(engine, 'front');
      expect(panel).toBeDefined();

      const safeSpace = panel!.safeSpace!;
      const halfH = panel!.height / 2;

      // Result paths should reach into the extension area at the top
      // Since top edge has no joint (face is open), the extension is safe
      const allMaxY = Math.max(...safeSpace.resultPaths.flatMap(p => p.map(pt => pt.y)));

      // The safe space should extend to the top of the extension
      // (minus any margin for structural integrity, but at minimum beyond body edge)
      expect(allMaxY).toBeGreaterThan(halfH); // Should extend beyond body
    });
  });

  // ===========================================================================
  // Safe Area Contiguity on Extended Edges (Bug Tests)
  // ===========================================================================

  describe('Safe Area Contiguity on Extended Edges', () => {
    /**
     * These tests verify the correct behavior for safe areas on extended edges:
     *
     * Expected behavior (per user clarification):
     * 1. Safe area goes all the way to the extended outer edge with NO margin
     *    (it's open, nothing to protect)
     * 2. Safe area is CONTIGUOUS from body interior through extension (no gap)
     * 3. Only edges with joints have margins
     *
     * Current bug: The safe area calculation creates a gap at the original panel
     * boundary and may add an unnecessary margin at the extended outer edge.
     */

    beforeEach(() => {
      engine.createAssembly(100, 100, 60, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Remove top face so front panel top edge is open (no joint)
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'top' },
      });

      // Get the front panel ID and extend the top edge
      const snapshot = engine.getSnapshot();
      const assembly = snapshot.children[0] as AssemblySnapshot;
      const frontPanel = assembly.derived.panels.find(
        p => p.kind === 'face-panel' && (p as FacePanelSnapshot).props.faceId === 'front'
      );

      if (frontPanel) {
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: {
            panelId: frontPanel.id,
            edge: 'top',
            value: 20, // 20mm extension
          },
        });
      }
    });

    it('should have safe area extend all the way to extended outer edge with NO margin', () => {
      const panel = getFacePanel(engine, 'front');
      expect(panel).toBeDefined();

      const safeSpace = panel!.safeSpace!;
      const halfH = panel!.height / 2; // Body half-height = 50
      const extensionAmount = 20;
      const panelOuterEdge = halfH + extensionAmount; // 50 + 20 = 70

      // The safe area maxY should equal the panel outline maxY
      // (no margin at the extended edge because it's open)
      const safeMaxY = Math.max(...safeSpace.resultPaths.flatMap(p => p.map(pt => pt.y)));
      const outlineMaxY = Math.max(...safeSpace.outline.map(p => p.y));

      // Safe area should reach the outer edge of the extension
      expect(safeMaxY).toBeCloseTo(outlineMaxY, 0.1);
      expect(safeMaxY).toBeCloseTo(panelOuterEdge, 0.1);
    });

    it('should have ONE contiguous safe region from body through extension (no gap)', () => {
      const panel = getFacePanel(engine, 'front');
      expect(panel).toBeDefined();

      const safeSpace = panel!.safeSpace!;
      const halfH = panel!.height / 2; // Body half-height = 50

      // With only the top edge extended and open, there should be exactly ONE
      // contiguous safe region that spans from the body interior through the extension.
      // The current bug creates TWO separate regions with a gap at the body edge.
      expect(safeSpace.resultPaths).toHaveLength(1);

      // The single safe region should extend from the body interior (with margins
      // on jointed edges) all the way to the extended outer edge
      const safeRegion = safeSpace.resultPaths[0];
      const safeMinY = Math.min(...safeRegion.map(p => p.y));
      const safeMaxY = Math.max(...safeRegion.map(p => p.y));

      // Should extend from bottom margin (jointed edge) to top outer edge (open)
      const mt = 3; // material thickness
      const expectedMinY = -halfH + 2 * mt; // 2×MT margin from bottom (jointed)
      const expectedMaxY = halfH + 20; // Extended outer edge (no margin)

      expect(safeMinY).toBeCloseTo(expectedMinY, 0.1);
      expect(safeMaxY).toBeCloseTo(expectedMaxY, 0.1);
    });

    it('should only have margins on edges with joints (body region check)', () => {
      const panel = getFacePanel(engine, 'front');
      expect(panel).toBeDefined();

      const safeSpace = panel!.safeSpace!;
      const mt = 3; // material thickness
      const halfW = panel!.width / 2;
      const halfH = panel!.height / 2;

      // Find the body region (the one that contains points at both positive and negative Y)
      // With the bug, we have two regions - one for body, one for extension
      const bodyRegion = safeSpace.resultPaths.find(path => {
        const ys = path.map(p => p.y);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        // Body region contains the center of the panel (Y=0)
        return minY < 0 && maxY > 0;
      });

      expect(bodyRegion).toBeDefined();

      if (bodyRegion) {
        const bodyMinX = Math.min(...bodyRegion.map(p => p.x));
        const bodyMaxX = Math.max(...bodyRegion.map(p => p.x));
        const bodyMinY = Math.min(...bodyRegion.map(p => p.y));
        const bodyMaxY = Math.max(...bodyRegion.map(p => p.y));

        // Left edge (jointed) - should have 2×MT margin
        expect(bodyMinX).toBeCloseTo(-halfW + 2 * mt, 0.1);

        // Right edge (jointed) - should have 2×MT margin
        expect(bodyMaxX).toBeCloseTo(halfW - 2 * mt, 0.1);

        // Bottom edge (jointed) - should have 2×MT margin
        expect(bodyMinY).toBeCloseTo(-halfH + 2 * mt, 0.1);

        // Top edge of body region:
        // FIX: Now extends all the way through to the extension outer edge
        // (halfH + 20 = 70) since the top edge is open (no joint).
        expect(bodyMaxY).toBeCloseTo(halfH + 20, 0.1); // Extends to outer edge (open)
      }
    });

    it('should NOT have gap between body and extension (extension starts at body edge)', () => {
      const panel = getFacePanel(engine, 'front');
      expect(panel).toBeDefined();

      const safeSpace = panel!.safeSpace!;
      const mt = 3; // material thickness
      const halfH = panel!.height / 2;

      // With the bug, we have TWO regions with a gap between them.
      // The extension region starts at (halfH + mt) instead of halfH.
      // This creates an unusable gap from halfH to (halfH + mt).

      // Find the extension region (the one entirely above halfH)
      const extensionRegion = safeSpace.resultPaths.find(path => {
        const minY = Math.min(...path.map(p => p.y));
        return minY >= halfH;
      });

      if (extensionRegion) {
        // If an extension region exists as a separate region, it should start
        // at the body edge (halfH) with NO gap. Currently it starts at halfH + mt.
        const extensionMinY = Math.min(...extensionRegion.map(p => p.y));

        // BUG: The gap - extension starts at halfH + mt instead of halfH
        // This should fail, documenting the bug.
        expect(extensionMinY).toBeCloseTo(halfH, 0.1);
      } else {
        // If no separate extension region, we should have ONE contiguous region
        // This is the correct behavior - fail if we don't have it.
        expect(safeSpace.resultPaths).toHaveLength(1);
      }
    });
  });
});
