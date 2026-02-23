/**
 * Integration test: self-intersecting edge paths should be rejected.
 *
 * This test demonstrates the bug: currently, there is no validation to prevent
 * self-intersecting edge paths from being committed. After the fix, the
 * validation functions should detect and block such paths.
 *
 * Tests written FIRST (before implementation) — they fail initially, proving
 * the feature doesn't exist yet.
 */
import { describe, it, expect } from 'vitest';
import { AssemblyBuilder } from '../../builder';
import {
  detectEdgePathSelfIntersection,
  detectEdgePathCrossing,
} from '../../utils/edgePathValidation';
import type { EdgePathPoint } from '../../engine/types';

describe('Edge path crossing validation — integration', () => {
  it('self-intersecting edge path is detected before being dispatched to the engine', () => {
    // Create a box with the top face open (so top edge is eligible for modification)
    const { engine, panels } = AssemblyBuilder
      .basicBox(200, 150, 100)
      .withOpenFaces(['top'])
      .build();

    const frontPanel = panels.find(p => p.source.faceId === 'front');
    expect(frontPanel).toBeDefined();
    if (!frontPanel) return;

    // A self-intersecting edge path in (t, offset) space:
    // The segment (0,0)→(0.7,-10) and segment (0.3,-5)→(1,0) cross each other.
    const selfCrossingPoints: EdgePathPoint[] = [
      { t: 0, offset: 0 },
      { t: 0.7, offset: -10 },  // goes far right-and-deep
      { t: 0.3, offset: -5 },   // jumps back-left (backward in t) — creates crossing
      { t: 1, offset: 0 },
    ];

    // The validation function MUST detect this self-intersection
    const hasSelfIntersection = detectEdgePathSelfIntersection(selfCrossingPoints);
    expect(hasSelfIntersection).toBe(true);

    // Because it's invalid, we should NOT dispatch it.
    // Verify the panel still has no customEdgePaths stored.
    if (hasSelfIntersection) {
      // Skip dispatch — validation prevented it
    } else {
      engine.dispatch({
        type: 'SET_EDGE_PATH',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          path: {
            edge: 'top',
            baseOffset: 0,
            points: selfCrossingPoints,
            mirrored: false,
          },
        },
      });
    }

    const panelsAfter = engine.generatePanelsFromNodes();
    const frontPanelAfter = panelsAfter.panels.find(p => p.source.faceId === 'front');
    expect(frontPanelAfter).toBeDefined();
    if (!frontPanelAfter) return;

    // The panel should have no custom edge paths (they were blocked by validation)
    const customEdgePaths = frontPanelAfter.customEdgePaths ?? [];
    expect(customEdgePaths.length).toBe(0);
  });

  it('valid edge path is NOT rejected by validation', () => {
    const { panels } = AssemblyBuilder
      .basicBox(200, 150, 100)
      .withOpenFaces(['top'])
      .build();

    const frontPanel = panels.find(p => p.source.faceId === 'front');
    expect(frontPanel).toBeDefined();
    if (!frontPanel) return;

    // A valid rectangular notch — monotone in t, no crossings
    const validPath: EdgePathPoint[] = [
      { t: 0, offset: 0 },
      { t: 0.2, offset: 0 },
      { t: 0.2, offset: -8 },
      { t: 0.7, offset: -8 },
      { t: 0.7, offset: 0 },
      { t: 1, offset: 0 },
    ];

    expect(detectEdgePathSelfIntersection(validPath)).toBe(false);
  });

  it('new freeform path crossing existing edge path is detected', () => {
    const { engine, panels } = AssemblyBuilder
      .basicBox(200, 150, 100)
      .withOpenFaces(['top'])
      .build();

    const frontPanel = panels.find(p => p.source.faceId === 'front');
    expect(frontPanel).toBeDefined();
    if (!frontPanel) return;

    // First: commit a valid existing deep notch
    const existingPath: EdgePathPoint[] = [
      { t: 0, offset: 0 },
      { t: 0.3, offset: 0 },
      { t: 0.3, offset: -15 },  // left wall — goes deep
      { t: 0.7, offset: -15 },  // notch bottom
      { t: 0.7, offset: 0 },    // right wall — comes back up
      { t: 1, offset: 0 },
    ];

    engine.dispatch({
      type: 'SET_EDGE_PATH',
      targetId: 'main-assembly',
      payload: {
        panelId: frontPanel.id,
        path: { edge: 'top', baseOffset: 0, points: existingPath, mirrored: false },
      },
    });

    // Now draw a new diagonal path that cuts through the existing notch walls
    const newPath: EdgePathPoint[] = [
      { t: 0.1, offset: 0 },
      { t: 0.9, offset: -20 },  // diagonal that crosses the existing notch's left and right walls
    ];

    // The crossing should be detected
    const hasCrossing = detectEdgePathCrossing(existingPath, newPath);
    expect(hasCrossing).toBe(true);
  });

  it('two rectangular notches on different t-ranges do not cross', () => {
    // Non-overlapping rectangular notches should not be flagged as crossing
    const leftNotch: EdgePathPoint[] = [
      { t: 0, offset: 0 },
      { t: 0.1, offset: 0 },
      { t: 0.1, offset: -5 },
      { t: 0.4, offset: -5 },
      { t: 0.4, offset: 0 },
      { t: 1, offset: 0 },
    ];
    const rightNotch: EdgePathPoint[] = [
      { t: 0, offset: 0 },
      { t: 0.6, offset: 0 },
      { t: 0.6, offset: -5 },
      { t: 0.9, offset: -5 },
      { t: 0.9, offset: 0 },
      { t: 1, offset: 0 },
    ];

    expect(detectEdgePathCrossing(leftNotch, rightNotch)).toBe(false);
  });
});
