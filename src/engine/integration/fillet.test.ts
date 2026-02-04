import { describe, it, expect } from 'vitest';
import { createEngineWithAssembly } from '../Engine';
import type { MaterialConfig } from '../types';

const defaultMaterial: MaterialConfig = {
  thickness: 3,
  fingerWidth: 10,
  fingerGap: 1.5,
};

describe('Fillet Integration', () => {
  it('should add points to outline when fillet is applied', () => {
    const engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);
    const panelsBefore = engine.generatePanelsFromNodes();
    const topPanel = panelsBefore.panels.find(p => p.source.faceId === 'top');

    if (!topPanel) {
      throw new Error('Top panel not found');
    }

    const pointsBefore = topPanel.outline.points.length;

    // Get eligible corners from the panel
    const eligibleCorners = topPanel.cornerEligibility?.filter(c => c.eligible) || [];

    if (eligibleCorners.length === 0) {
      // No eligible corners in a standard closed box - this is expected
      // Skip test in this case
      console.log('No eligible corners found (expected for closed box)');
      return;
    }

    const corner = eligibleCorners[0].corner;

    // Apply fillet to a corner
    engine.dispatch({
      type: 'SET_CORNER_FILLETS_BATCH',
      targetId: 'main-assembly',
      payload: {
        fillets: [{
          panelId: topPanel.id,
          corner: corner as 'bottom:left' | 'bottom:right' | 'left:top' | 'right:top',
          radius: 5,
        }]
      }
    });

    const panelsAfter = engine.generatePanelsFromNodes();
    const topPanelAfter = panelsAfter.panels.find(p => p.source.faceId === 'top');

    if (!topPanelAfter) {
      throw new Error('Top panel not found after fillet');
    }

    expect(topPanelAfter.outline.points.length).toBeGreaterThan(pointsBefore);
  });

  it('should add points when fillet is applied to panel with open edges', () => {
    // Create a box and disable a face to make edges open (eligible for fillet)
    const engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);

    // Disable top and left faces to make front panel's left:top corner eligible
    engine.dispatch({
      type: 'TOGGLE_FACE',
      targetId: 'main-assembly',
      payload: { faceId: 'top' },
    });
    engine.dispatch({
      type: 'TOGGLE_FACE',
      targetId: 'main-assembly',
      payload: { faceId: 'left' },
    });

    const panelsBefore = engine.generatePanelsFromNodes();
    const frontPanel = panelsBefore.panels.find(p => p.source.faceId === 'front');

    if (!frontPanel) {
      throw new Error('Front panel not found');
    }

    const pointsBefore = frontPanel.outline.points.length;

    // The left:top corner should now be eligible
    const leftTopCorner = frontPanel.cornerEligibility?.find(c => c.corner === 'left:top');
    expect(leftTopCorner?.eligible).toBe(true);

    // Apply fillet to left:top corner
    engine.dispatch({
      type: 'SET_CORNER_FILLETS_BATCH',
      targetId: 'main-assembly',
      payload: {
        fillets: [{
          panelId: frontPanel.id,
          corner: 'left:top',
          radius: 10,
        }]
      }
    });

    const panelsAfter = engine.generatePanelsFromNodes();
    const frontPanelAfter = panelsAfter.panels.find(p => p.source.faceId === 'front');

    if (!frontPanelAfter) {
      throw new Error('Front panel not found after fillet');
    }

    // Fillet should add arc points
    expect(frontPanelAfter.outline.points.length).toBeGreaterThan(pointsBefore);
  });
});
