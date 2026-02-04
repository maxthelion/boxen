/**
 * 2D View After Extension Integration Tests
 *
 * Tests that switching to 2D view (Tab) works correctly after applying
 * edge extensions. This reproduces a bug where the 2D view breaks after
 * applying inset/push-pull operations.
 *
 * The 2D view (SketchView2D) requires:
 * - Valid panel data with outline points
 * - Safe space computation for edit regions
 * - Edge segments for interaction
 * - ViewBox calculation from panel dimensions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createBasicBox, defaultMaterial } from '../../fixtures';
import { calculateSafeSpace } from '../../../src/engine/safeSpace';
import type { Engine } from '../../../src/engine/Engine';
import type { PanelPath, FaceConfig, BoxConfig, PathPoint } from '../../../src/types';

type EdgePosition = 'top' | 'bottom' | 'left' | 'right';

// Replicate the edge segment classification from SketchView2D
const classifySegment = (
  p1: PathPoint,
  p2: PathPoint,
  panelWidth: number,
  panelHeight: number,
  tolerance: number = 5
): EdgePosition | null => {
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  const nearTop = (p: PathPoint) => Math.abs(p.y - halfH) < tolerance;
  const nearBottom = (p: PathPoint) => Math.abs(p.y + halfH) < tolerance;
  const nearLeft = (p: PathPoint) => Math.abs(p.x + halfW) < tolerance;
  const nearRight = (p: PathPoint) => Math.abs(p.x - halfW) < tolerance;

  if (nearTop(p1) && nearTop(p2)) return 'top';
  if (nearBottom(p1) && nearBottom(p2)) return 'bottom';
  if (nearLeft(p1) && nearLeft(p2)) return 'left';
  if (nearRight(p1) && nearRight(p2)) return 'right';

  return null;
};

// Replicate getEdgeSegments from SketchView2D
const getEdgeSegments = (
  points: PathPoint[],
  panelWidth: number,
  panelHeight: number
): Record<EdgePosition, { start: PathPoint; end: PathPoint }[]> => {
  const edges: Record<EdgePosition, { start: PathPoint; end: PathPoint }[]> = {
    top: [],
    bottom: [],
    left: [],
    right: [],
  };

  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const edge = classifySegment(p1, p2, panelWidth, panelHeight);
    if (edge) {
      edges[edge].push({ start: p1, end: p2 });
    }
  }

  return edges;
};

describe('2D View After Extension', () => {
  let engine: Engine;

  beforeEach(() => {
    engine = createBasicBox(defaultMaterial);
  });

  // Helper to find a face panel
  function getFacePanel(faceId: string): PanelPath | undefined {
    const { panels } = engine.generatePanelsFromNodes();
    return panels.find(p => p.source.faceId === faceId);
  }

  // Helper to compute safe space for a panel (as SketchView2D does)
  function computeSafeSpace(panel: PanelPath): ReturnType<typeof calculateSafeSpace> {
    const snapshot = engine.getSnapshot();
    const assembly = snapshot.children[0];
    if (!assembly) throw new Error('No assembly found');

    const faces: FaceConfig[] = (assembly.props?.faces ?? []).map(
      (f: { id: string; solid: boolean }) => ({ id: f.id, solid: f.solid })
    );

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

    return calculateSafeSpace(panel, faces, config);
  }

  // ===========================================================================
  // Basic 2D View Data (no extensions)
  // ===========================================================================

  describe('Basic 2D View Data (baseline)', () => {
    it('should provide valid panel data for 2D view', () => {
      const frontPanel = getFacePanel('front');
      expect(frontPanel).toBeDefined();
      expect(frontPanel!.outline.points.length).toBeGreaterThan(0);
      expect(frontPanel!.width).toBeGreaterThan(0);
      expect(frontPanel!.height).toBeGreaterThan(0);
    });

    it('should compute valid safe space for 2D view', () => {
      const frontPanel = getFacePanel('front');
      expect(frontPanel).toBeDefined();

      const safeSpace = computeSafeSpace(frontPanel!);
      expect(safeSpace).toBeDefined();
      expect(safeSpace.outline.length).toBeGreaterThan(0);
      expect(safeSpace.resultPaths.length).toBeGreaterThan(0);
    });

    it('should have dimensions usable for viewBox calculation', () => {
      const frontPanel = getFacePanel('front');
      expect(frontPanel).toBeDefined();

      // SketchView2D computes viewBox from panel dimensions
      const padding = 20;
      const viewBoxWidth = frontPanel!.width + padding * 2;
      const viewBoxHeight = frontPanel!.height + padding * 2;

      expect(viewBoxWidth).toBeGreaterThan(0);
      expect(viewBoxHeight).toBeGreaterThan(0);
      expect(Number.isFinite(viewBoxWidth)).toBe(true);
      expect(Number.isFinite(viewBoxHeight)).toBe(true);
    });
  });

  // ===========================================================================
  // 2D View After Single Edge Extension
  // ===========================================================================

  describe('After Single Edge Extension', () => {
    it('should provide valid panel data after extending bottom edge', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      // Apply edge extension (like inset-outset or push-pull operation)
      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          edge: 'bottom',
          value: 10,
        },
      });

      // Get updated panel
      const updatedPanel = getFacePanel('front');
      expect(updatedPanel).toBeDefined();
      expect(updatedPanel!.outline.points.length).toBeGreaterThan(0);
      expect(updatedPanel!.width).toBeGreaterThan(0);
      expect(updatedPanel!.height).toBeGreaterThan(0);
    });

    it('should compute valid safe space after edge extension', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          edge: 'bottom',
          value: 10,
        },
      });

      const updatedPanel = getFacePanel('front');
      expect(updatedPanel).toBeDefined();

      // This is what SketchView2D does to compute safe space
      const safeSpace = computeSafeSpace(updatedPanel!);

      // Verify safe space is valid for 2D view rendering
      expect(safeSpace).toBeDefined();
      expect(safeSpace.outline).toBeDefined();
      expect(safeSpace.outline.length).toBeGreaterThan(0);
      expect(safeSpace.resultPaths).toBeDefined();
      expect(safeSpace.resultPaths.length).toBeGreaterThan(0);

      // Verify all points are finite (not NaN or Infinity)
      for (const point of safeSpace.outline) {
        expect(Number.isFinite(point.x)).toBe(true);
        expect(Number.isFinite(point.y)).toBe(true);
      }

      for (const path of safeSpace.resultPaths) {
        for (const point of path) {
          expect(Number.isFinite(point.x)).toBe(true);
          expect(Number.isFinite(point.y)).toBe(true);
        }
      }
    });

    it('should have valid dimensions for viewBox after extension', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          edge: 'bottom',
          value: 10,
        },
      });

      const updatedPanel = getFacePanel('front');
      expect(updatedPanel).toBeDefined();

      // SketchView2D computes viewBox from panel dimensions
      const padding = 20;
      const viewBoxWidth = updatedPanel!.width + padding * 2;
      const viewBoxHeight = updatedPanel!.height + padding * 2;

      expect(viewBoxWidth).toBeGreaterThan(0);
      expect(viewBoxHeight).toBeGreaterThan(0);
      expect(Number.isFinite(viewBoxWidth)).toBe(true);
      expect(Number.isFinite(viewBoxHeight)).toBe(true);
    });
  });

  // ===========================================================================
  // 2D View After Multiple Edge Extensions
  // ===========================================================================

  describe('After Multiple Edge Extensions', () => {
    it('should provide valid panel data after extending multiple edges', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      // Apply batch extension to multiple edges
      engine.dispatch({
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: 'main-assembly',
        payload: {
          extensions: [
            { panelId: frontPanel.id, edge: 'bottom', value: 10 },
            { panelId: frontPanel.id, edge: 'left', value: 8 },
          ],
        },
      });

      const updatedPanel = getFacePanel('front');
      expect(updatedPanel).toBeDefined();
      expect(updatedPanel!.outline.points.length).toBeGreaterThan(0);
    });

    it('should compute valid safe space after multiple extensions', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      engine.dispatch({
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: 'main-assembly',
        payload: {
          extensions: [
            { panelId: frontPanel.id, edge: 'bottom', value: 10 },
            { panelId: frontPanel.id, edge: 'right', value: 10 },
          ],
        },
      });

      const updatedPanel = getFacePanel('front');
      expect(updatedPanel).toBeDefined();

      const safeSpace = computeSafeSpace(updatedPanel!);
      expect(safeSpace).toBeDefined();
      expect(safeSpace.resultPaths.length).toBeGreaterThan(0);

      // Safe space should account for extensions
      expect(updatedPanel!.edgeExtensions?.bottom).toBe(10);
      expect(updatedPanel!.edgeExtensions?.right).toBe(10);
    });
  });

  // ===========================================================================
  // 2D View After Preview → Commit Cycle
  // ===========================================================================

  describe('After Preview → Commit Cycle', () => {
    it('should provide valid 2D view data after preview is committed', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      // Start preview (as operations do)
      engine.startPreview();

      // Apply extension in preview
      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          edge: 'bottom',
          value: 15,
        },
      });

      // Commit preview (user clicks Apply)
      engine.commitPreview();

      // Now get panel data for 2D view
      const updatedPanel = getFacePanel('front');
      expect(updatedPanel).toBeDefined();

      // Panel data should be valid for 2D view
      expect(updatedPanel!.outline.points.length).toBeGreaterThan(0);
      expect(updatedPanel!.width).toBeGreaterThan(0);
      expect(updatedPanel!.height).toBeGreaterThan(0);

      // Safe space should be computable
      const safeSpace = computeSafeSpace(updatedPanel!);
      expect(safeSpace).toBeDefined();
      expect(safeSpace.resultPaths.length).toBeGreaterThan(0);
    });

    it('should provide valid 2D view data after preview is discarded', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');
      const originalWidth = frontPanel.width;
      const originalHeight = frontPanel.height;

      // Start preview
      engine.startPreview();

      // Apply extension in preview
      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          edge: 'bottom',
          value: 15,
        },
      });

      // Discard preview (user clicks Cancel)
      engine.discardPreview();

      // Now get panel data for 2D view
      const restoredPanel = getFacePanel('front');
      expect(restoredPanel).toBeDefined();

      // Panel should be restored to original state
      expect(restoredPanel!.width).toBe(originalWidth);
      expect(restoredPanel!.height).toBe(originalHeight);
      expect(restoredPanel!.edgeExtensions?.bottom ?? 0).toBe(0);

      // 2D view data should still be valid
      expect(restoredPanel!.outline.points.length).toBeGreaterThan(0);

      const safeSpace = computeSafeSpace(restoredPanel!);
      expect(safeSpace).toBeDefined();
      expect(safeSpace.resultPaths.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle zero extension (no-op)', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          edge: 'bottom',
          value: 0,
        },
      });

      const updatedPanel = getFacePanel('front');
      expect(updatedPanel).toBeDefined();
      expect(updatedPanel!.outline.points.length).toBeGreaterThan(0);

      const safeSpace = computeSafeSpace(updatedPanel!);
      expect(safeSpace.resultPaths.length).toBeGreaterThan(0);
    });

    it('should handle small extension values', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          edge: 'bottom',
          value: 0.5, // Very small extension
        },
      });

      const updatedPanel = getFacePanel('front');
      expect(updatedPanel).toBeDefined();
      expect(updatedPanel!.outline.points.length).toBeGreaterThan(0);

      const safeSpace = computeSafeSpace(updatedPanel!);
      expect(safeSpace.resultPaths.length).toBeGreaterThan(0);
    });

    it('should handle extension on different panels', () => {
      // Extend bottom panel instead of front
      const bottomPanel = getFacePanel('bottom');
      if (!bottomPanel) throw new Error('Bottom panel not found');

      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: bottomPanel.id,
          edge: 'bottom', // This is a different edge on the bottom panel
          value: 10,
        },
      });

      const updatedPanel = getFacePanel('bottom');
      expect(updatedPanel).toBeDefined();
      expect(updatedPanel!.outline.points.length).toBeGreaterThan(0);

      const safeSpace = computeSafeSpace(updatedPanel!);
      expect(safeSpace.resultPaths.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Edge Segment Computation (critical for 2D view interaction)
  // ===========================================================================

  describe('Edge Segment Computation', () => {
    it('should compute valid edge segments before extension', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      // This is what SketchView2D does to compute edge segments
      const edgeSegments = getEdgeSegments(
        frontPanel.outline.points,
        frontPanel.width,
        frontPanel.height
      );

      // All four edges should have segments
      expect(edgeSegments.top.length).toBeGreaterThan(0);
      expect(edgeSegments.bottom.length).toBeGreaterThan(0);
      expect(edgeSegments.left.length).toBeGreaterThan(0);
      expect(edgeSegments.right.length).toBeGreaterThan(0);
    });

    it('should compute valid edge segments after extension', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          edge: 'bottom',
          value: 10,
        },
      });

      const updatedPanel = getFacePanel('front');
      expect(updatedPanel).toBeDefined();

      // Edge segments should still be computable
      // Note: panel.width/height are BODY dimensions (without extensions)
      const edgeSegments = getEdgeSegments(
        updatedPanel!.outline.points,
        updatedPanel!.width,
        updatedPanel!.height
      );

      // The extended edge (bottom) might have different segment count
      // but all edges should still have some segments
      expect(edgeSegments.top.length).toBeGreaterThan(0);
      expect(edgeSegments.bottom.length).toBeGreaterThan(0);
      expect(edgeSegments.left.length).toBeGreaterThan(0);
      expect(edgeSegments.right.length).toBeGreaterThan(0);
    });

    it('should have consistent segment coordinates (no NaN or Infinity)', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          edge: 'bottom',
          value: 10,
        },
      });

      const updatedPanel = getFacePanel('front');
      expect(updatedPanel).toBeDefined();

      const edgeSegments = getEdgeSegments(
        updatedPanel!.outline.points,
        updatedPanel!.width,
        updatedPanel!.height
      );

      // Verify all segment coordinates are finite
      for (const edge of ['top', 'bottom', 'left', 'right'] as EdgePosition[]) {
        for (const seg of edgeSegments[edge]) {
          expect(Number.isFinite(seg.start.x)).toBe(true);
          expect(Number.isFinite(seg.start.y)).toBe(true);
          expect(Number.isFinite(seg.end.x)).toBe(true);
          expect(Number.isFinite(seg.end.y)).toBe(true);
        }
      }
    });
  });

  // ===========================================================================
  // Complete 2D View Data Flow (simulating what SketchView2D computes)
  // ===========================================================================

  describe('Complete 2D View Data Flow', () => {
    it('should provide all data needed by SketchView2D after extension', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      // Apply extension
      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          edge: 'bottom',
          value: 10,
        },
      });

      // Get updated panel (this is what useEnginePanels returns)
      const panel = getFacePanel('front');
      expect(panel).toBeDefined();

      // 1. Panel outline points (for rendering the panel shape)
      expect(panel!.outline.points.length).toBeGreaterThan(0);
      for (const point of panel!.outline.points) {
        expect(Number.isFinite(point.x)).toBe(true);
        expect(Number.isFinite(point.y)).toBe(true);
      }

      // 2. Panel dimensions (for viewBox and edge classification)
      expect(panel!.width).toBeGreaterThan(0);
      expect(panel!.height).toBeGreaterThan(0);
      expect(Number.isFinite(panel!.width)).toBe(true);
      expect(Number.isFinite(panel!.height)).toBe(true);

      // 3. Safe space (for determining editable regions)
      const safeSpace = computeSafeSpace(panel!);
      expect(safeSpace).toBeDefined();
      expect(safeSpace.resultPaths.length).toBeGreaterThan(0);

      // 4. Edge segments (for edge interaction)
      const edgeSegments = getEdgeSegments(
        panel!.outline.points,
        panel!.width,
        panel!.height
      );
      expect(edgeSegments.top.length).toBeGreaterThan(0);
      expect(edgeSegments.bottom.length).toBeGreaterThan(0);
      expect(edgeSegments.left.length).toBeGreaterThan(0);
      expect(edgeSegments.right.length).toBeGreaterThan(0);

      // 5. ViewBox calculation
      const padding = 20;
      const viewBoxWidth = panel!.width + padding * 2;
      const viewBoxHeight = panel!.height + padding * 2;
      expect(viewBoxWidth).toBeGreaterThan(0);
      expect(viewBoxHeight).toBeGreaterThan(0);

      // 6. Edge extensions should be reflected
      expect(panel!.edgeExtensions?.bottom).toBe(10);
    });
  });
});
