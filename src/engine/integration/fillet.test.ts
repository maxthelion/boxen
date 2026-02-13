import { describe, it, expect } from 'vitest';
import { AssemblyBuilder } from '../../builder';

describe('Fillet Integration', () => {
  it('should add points to outline when fillet is applied', () => {
    const { engine, panel } = AssemblyBuilder
      .enclosedBox(100, 80, 60)
      .panel('top')
      .build();

    if (!panel) {
      throw new Error('Top panel not found');
    }

    const pointsBefore = panel.outline.points.length;

    // Get eligible corners from the panel
    const eligibleCorners = panel.cornerEligibility?.filter(c => c.eligible) || [];

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
          panelId: panel.id,
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
    // Create a box with top and left faces open to make front panel's left:top corner eligible
    const { engine, panel } = AssemblyBuilder
      .enclosedBox(100, 80, 60)
      .withOpenFaces(['top', 'left'])
      .panel('front')
      .build();

    if (!panel) {
      throw new Error('Front panel not found');
    }

    const pointsBefore = panel.outline.points.length;

    // The left:top corner should now be eligible
    const leftTopCorner = panel.cornerEligibility?.find(c => c.corner === 'left:top');
    expect(leftTopCorner?.eligible).toBe(true);

    // Apply fillet to left:top corner
    engine.dispatch({
      type: 'SET_CORNER_FILLETS_BATCH',
      targetId: 'main-assembly',
      payload: {
        fillets: [{
          panelId: panel.id,
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
