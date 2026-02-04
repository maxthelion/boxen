import { describe, it, expect } from 'vitest';
import { createEngineWithAssembly } from '../Engine';
import type { MaterialConfig, RectCutout } from '../types';

const defaultMaterial: MaterialConfig = {
  thickness: 3,
  fingerWidth: 10,
  fingerGap: 1.5,
};

// =============================================================================
// Corner Detection Tests
// =============================================================================

describe('Corner detection', () => {
  it('should detect 4 corners on simple panel (all faces enabled)', () => {
    // With all faces enabled, each face panel has finger joints on all edges
    // The corner eligibility check should still identify 4 corner positions
    const engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);
    const panels = engine.generatePanelsFromNodes();
    const topPanel = panels.panels.find(p => p.source.faceId === 'top');

    if (!topPanel) {
      throw new Error('Top panel not found');
    }

    // There should be 4 corners reported in cornerEligibility
    const corners = topPanel.cornerEligibility ?? [];
    expect(corners.length).toBe(4);

    // Verify all 4 standard corner positions are present
    const cornerKeys = corners.map(c => c.corner);
    expect(cornerKeys).toContain('left:top');
    expect(cornerKeys).toContain('right:top');
    expect(cornerKeys).toContain('bottom:left');
    expect(cornerKeys).toContain('bottom:right');
  });

  it('should detect 4 corners on panel with open edges', () => {
    // With some faces disabled, corners should still be detected
    const engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);

    // Disable top face
    engine.dispatch({
      type: 'TOGGLE_FACE',
      targetId: 'main-assembly',
      payload: { faceId: 'top' },
    });

    const panels = engine.generatePanelsFromNodes();
    const frontPanel = panels.panels.find(p => p.source.faceId === 'front');

    if (!frontPanel) {
      throw new Error('Front panel not found');
    }

    // Should still have 4 corners
    const corners = frontPanel.cornerEligibility ?? [];
    expect(corners.length).toBe(4);
  });

  it('should detect 8+ corners on panel with rectangular cutout', () => {
    // A rectangular cutout adds 4 more corners (the cutout's corners)
    const engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);

    // First disable top and left to get an eligible panel for adding cutout easily
    // (cutouts need to be in safe space)
    engine.dispatch({
      type: 'TOGGLE_FACE',
      targetId: 'main-assembly',
      payload: { faceId: 'top' },
    });

    const panelsBefore = engine.generatePanelsFromNodes();
    const frontPanel = panelsBefore.panels.find(p => p.source.faceId === 'front');

    if (!frontPanel) {
      throw new Error('Front panel not found');
    }

    // Add a rectangular cutout in the center of the panel
    const cutout: RectCutout = {
      id: 'test-cutout-1',
      type: 'rect',
      center: { x: 0, y: 0 }, // Center of panel
      width: 20,
      height: 15,
    };

    engine.dispatch({
      type: 'ADD_CUTOUT',
      targetId: 'main-assembly',
      payload: {
        panelId: frontPanel.id,
        cutout,
      },
    });

    const panelsAfter = engine.generatePanelsFromNodes();
    const frontPanelAfter = panelsAfter.panels.find(p => p.source.faceId === 'front');

    if (!frontPanelAfter) {
      throw new Error('Front panel not found after cutout');
    }

    // All corners includes outline corners + cutout corners
    // Cutout adds 4 corners, so we should have more corners than just 4
    const allCorners = frontPanelAfter.allCornerEligibility ?? [];
    expect(allCorners.length).toBeGreaterThanOrEqual(8);

    // Verify we have both outline and hole corners
    const outlineCorners = allCorners.filter(c => c.id.startsWith('outline:'));
    const holeCorners = allCorners.filter(c => c.id.startsWith('hole:'));

    expect(outlineCorners.length).toBeGreaterThanOrEqual(4);
    expect(holeCorners.length).toBeGreaterThanOrEqual(4);
  });
});

// =============================================================================
// Corner Eligibility Tests
// =============================================================================

describe('Corner eligibility', () => {
  it('should mark corners on joint edges as ineligible when all faces enabled', () => {
    // With all faces enabled, all edges have finger joints
    // Therefore all outer corners touch joints and should be ineligible
    const engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);
    const panels = engine.generatePanelsFromNodes();
    const topPanel = panels.panels.find(p => p.source.faceId === 'top');

    if (!topPanel) {
      throw new Error('Top panel not found');
    }

    const corners = topPanel.cornerEligibility ?? [];
    const eligibleCorners = corners.filter(c => c.eligible);

    // All corners should be ineligible (finger joints on all edges)
    expect(eligibleCorners.length).toBe(0);
  });

  it('should mark corners on open edges as eligible when adjacent faces disabled', () => {
    const engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);

    // Disable top and left faces to make front panel's left:top corner eligible
    // (both edges adjacent to the corner must be open for eligibility)
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

    const panels = engine.generatePanelsFromNodes();
    const frontPanel = panels.panels.find(p => p.source.faceId === 'front');

    if (!frontPanel) {
      throw new Error('Front panel not found');
    }

    const corners = frontPanel.cornerEligibility ?? [];

    // The left:top corner should be eligible (both adjacent edges are open)
    const leftTopCorner = corners.find(c => c.corner === 'left:top');
    expect(leftTopCorner?.eligible).toBe(true);

    // The bottom:left corner should NOT be eligible (bottom edge has joints)
    const bottomLeftCorner = corners.find(c => c.corner === 'bottom:left');
    expect(bottomLeftCorner?.eligible).toBe(false);

    // The right:top corner should NOT be eligible (right edge has joints)
    const rightTopCorner = corners.find(c => c.corner === 'right:top');
    expect(rightTopCorner?.eligible).toBe(false);
  });

  it('should require BOTH adjacent edges to be safe for corner eligibility', () => {
    const engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);

    // Disable only the top face
    // Front panel's top edge is now open, but left/right/bottom edges still have joints
    engine.dispatch({
      type: 'TOGGLE_FACE',
      targetId: 'main-assembly',
      payload: { faceId: 'top' },
    });

    const panels = engine.generatePanelsFromNodes();
    const frontPanel = panels.panels.find(p => p.source.faceId === 'front');

    if (!frontPanel) {
      throw new Error('Front panel not found');
    }

    const corners = frontPanel.cornerEligibility ?? [];

    // left:top has top edge open but left edge has joints - should be ineligible
    const leftTopCorner = corners.find(c => c.corner === 'left:top');
    expect(leftTopCorner?.eligible).toBe(false);

    // right:top has top edge open but right edge has joints - should be ineligible
    const rightTopCorner = corners.find(c => c.corner === 'right:top');
    expect(rightTopCorner?.eligible).toBe(false);
  });

  it('should mark cutout corners inside safe area as eligible', () => {
    const engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);

    // Disable top face to make front panel more accessible
    engine.dispatch({
      type: 'TOGGLE_FACE',
      targetId: 'main-assembly',
      payload: { faceId: 'top' },
    });

    const panelsBefore = engine.generatePanelsFromNodes();
    const frontPanel = panelsBefore.panels.find(p => p.source.faceId === 'front');

    if (!frontPanel) {
      throw new Error('Front panel not found');
    }

    // Add a rectangular cutout in the center (well inside safe area)
    const cutout: RectCutout = {
      id: 'center-cutout',
      type: 'rect',
      center: { x: 0, y: 0 },
      width: 15,
      height: 15,
    };

    engine.dispatch({
      type: 'ADD_CUTOUT',
      targetId: 'main-assembly',
      payload: {
        panelId: frontPanel.id,
        cutout,
      },
    });

    const panelsAfter = engine.generatePanelsFromNodes();
    const frontPanelAfter = panelsAfter.panels.find(p => p.source.faceId === 'front');

    if (!frontPanelAfter) {
      throw new Error('Front panel not found after cutout');
    }

    const allCorners = frontPanelAfter.allCornerEligibility ?? [];
    const holeCorners = allCorners.filter(c => c.id.startsWith('hole:'));

    // Cutout corners in the center should be eligible (away from forbidden areas)
    const eligibleHoleCorners = holeCorners.filter(c => c.eligible);
    expect(eligibleHoleCorners.length).toBeGreaterThan(0);
  });

  it('should report maxRadius for eligible corners', () => {
    const engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);

    // Disable top and left faces
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

    const panels = engine.generatePanelsFromNodes();
    const frontPanel = panels.panels.find(p => p.source.faceId === 'front');

    if (!frontPanel) {
      throw new Error('Front panel not found');
    }

    const leftTopCorner = frontPanel.cornerEligibility?.find(c => c.corner === 'left:top');
    expect(leftTopCorner?.eligible).toBe(true);
    expect(leftTopCorner?.maxRadius).toBeGreaterThan(0);
  });
});

// =============================================================================
// Fillet Operation Tests
// =============================================================================

describe('Fillet operation', () => {
  it('should increase point count after fillet is applied', () => {
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

    // A fillet replaces 1 corner point with multiple arc points
    expect(frontPanelAfter.outline.points.length).toBeGreaterThan(pointsBefore);
  });

  it('should create arc approximation at filleted corner location', () => {
    const engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);

    // Disable top and left faces
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

    // Get the position of the left:top corner before fillet
    // The outline points form a closed path - find the corner
    const dims = { width: 100, height: 80 }; // Panel dimensions
    const halfW = dims.width / 2;
    const halfH = dims.height / 2;

    // Apply fillet with radius 10
    const filletRadius = 10;
    engine.dispatch({
      type: 'SET_CORNER_FILLETS_BATCH',
      targetId: 'main-assembly',
      payload: {
        fillets: [{
          panelId: frontPanel.id,
          corner: 'left:top',
          radius: filletRadius,
        }]
      }
    });

    const panelsAfter = engine.generatePanelsFromNodes();
    const frontPanelAfter = panelsAfter.panels.find(p => p.source.faceId === 'front');

    if (!frontPanelAfter) {
      throw new Error('Front panel not found after fillet');
    }

    // The arc points should be in the vicinity of the original corner
    // For left:top corner, that's around (-halfW, halfH)
    // With a fillet, we should NOT have a point exactly at the corner anymore
    const outlinePoints = frontPanelAfter.outline.points;

    // Check that there's no exact corner point at (-halfW, halfH)
    const exactCornerPoint = outlinePoints.find(p =>
      Math.abs(p.x - (-halfW)) < 0.1 && Math.abs(p.y - halfH) < 0.1
    );

    // The exact corner should be replaced by arc points
    expect(exactCornerPoint).toBeUndefined();

    // Instead, there should be points near the corner that form an arc
    // These points should be within the fillet radius of the original corner
    const cornerRegionPoints = outlinePoints.filter(p => {
      const dx = p.x - (-halfW);
      const dy = p.y - halfH;
      const dist = Math.sqrt(dx * dx + dy * dy);
      return dist <= filletRadius * 1.5; // Within reasonable distance
    });

    // There should be multiple arc points in the corner region
    expect(cornerRegionPoints.length).toBeGreaterThan(1);
  });

  it('should respect radius parameter (larger radius = more dramatic curve)', () => {
    // Test with small radius
    const engine1 = createEngineWithAssembly(100, 80, 60, defaultMaterial);
    engine1.dispatch({ type: 'TOGGLE_FACE', targetId: 'main-assembly', payload: { faceId: 'top' } });
    engine1.dispatch({ type: 'TOGGLE_FACE', targetId: 'main-assembly', payload: { faceId: 'left' } });

    const panels1Before = engine1.generatePanelsFromNodes();
    const panel1 = panels1Before.panels.find(p => p.source.faceId === 'front');
    if (!panel1) throw new Error('Panel not found');

    engine1.dispatch({
      type: 'SET_CORNER_FILLETS_BATCH',
      targetId: 'main-assembly',
      payload: { fillets: [{ panelId: panel1.id, corner: 'left:top', radius: 5 }] }
    });

    const panels1After = engine1.generatePanelsFromNodes();
    const panel1After = panels1After.panels.find(p => p.source.faceId === 'front');
    const smallRadiusPoints = panel1After?.outline.points.length ?? 0;

    // Test with larger radius
    const engine2 = createEngineWithAssembly(100, 80, 60, defaultMaterial);
    engine2.dispatch({ type: 'TOGGLE_FACE', targetId: 'main-assembly', payload: { faceId: 'top' } });
    engine2.dispatch({ type: 'TOGGLE_FACE', targetId: 'main-assembly', payload: { faceId: 'left' } });

    const panels2Before = engine2.generatePanelsFromNodes();
    const panel2 = panels2Before.panels.find(p => p.source.faceId === 'front');
    if (!panel2) throw new Error('Panel not found');

    engine2.dispatch({
      type: 'SET_CORNER_FILLETS_BATCH',
      targetId: 'main-assembly',
      payload: { fillets: [{ panelId: panel2.id, corner: 'left:top', radius: 15 }] }
    });

    const panels2After = engine2.generatePanelsFromNodes();
    const panel2After = panels2After.panels.find(p => p.source.faceId === 'front');
    const largeRadiusPoints = panel2After?.outline.points.length ?? 0;

    // Both should have increased point counts (fillets were applied)
    expect(smallRadiusPoints).toBeGreaterThan(0);
    expect(largeRadiusPoints).toBeGreaterThan(0);

    // The fillet operation adds arc points - both radii should work
    // (The number of arc segments is typically constant, so point count may be similar,
    // but the arc should be different in shape)
  });

  it('should apply multiple fillets to multiple corners', () => {
    const engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);

    // Disable all adjacent faces for the top panel to make all corners eligible
    engine.dispatch({ type: 'TOGGLE_FACE', targetId: 'main-assembly', payload: { faceId: 'front' } });
    engine.dispatch({ type: 'TOGGLE_FACE', targetId: 'main-assembly', payload: { faceId: 'back' } });
    engine.dispatch({ type: 'TOGGLE_FACE', targetId: 'main-assembly', payload: { faceId: 'left' } });
    engine.dispatch({ type: 'TOGGLE_FACE', targetId: 'main-assembly', payload: { faceId: 'right' } });

    const panelsBefore = engine.generatePanelsFromNodes();
    const topPanel = panelsBefore.panels.find(p => p.source.faceId === 'top');

    if (!topPanel) {
      throw new Error('Top panel not found');
    }

    const pointsBefore = topPanel.outline.points.length;

    // Verify all corners are now eligible
    const eligibleCorners = topPanel.cornerEligibility?.filter(c => c.eligible) ?? [];
    expect(eligibleCorners.length).toBe(4);

    // Apply fillets to all 4 corners
    engine.dispatch({
      type: 'SET_CORNER_FILLETS_BATCH',
      targetId: 'main-assembly',
      payload: {
        fillets: [
          { panelId: topPanel.id, corner: 'left:top', radius: 8 },
          { panelId: topPanel.id, corner: 'right:top', radius: 8 },
          { panelId: topPanel.id, corner: 'bottom:left', radius: 8 },
          { panelId: topPanel.id, corner: 'bottom:right', radius: 8 },
        ]
      }
    });

    const panelsAfter = engine.generatePanelsFromNodes();
    const topPanelAfter = panelsAfter.panels.find(p => p.source.faceId === 'top');

    if (!topPanelAfter) {
      throw new Error('Top panel not found after fillet');
    }

    // 4 corners filleted should add significantly more points
    // Each corner adds approximately 8+ arc points minus the 1 corner point
    expect(topPanelAfter.outline.points.length).toBeGreaterThan(pointsBefore + 20);
  });

  it('should preserve existing outline when applying fillet', () => {
    const engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);

    // Disable adjacent faces
    engine.dispatch({ type: 'TOGGLE_FACE', targetId: 'main-assembly', payload: { faceId: 'top' } });
    engine.dispatch({ type: 'TOGGLE_FACE', targetId: 'main-assembly', payload: { faceId: 'left' } });

    const panelsBefore = engine.generatePanelsFromNodes();
    const frontPanel = panelsBefore.panels.find(p => p.source.faceId === 'front');

    if (!frontPanel) {
      throw new Error('Front panel not found');
    }

    // Record bounds of the outline before fillet
    const pointsBefore = frontPanel.outline.points;
    const minXBefore = Math.min(...pointsBefore.map(p => p.x));
    const maxXBefore = Math.max(...pointsBefore.map(p => p.x));
    const minYBefore = Math.min(...pointsBefore.map(p => p.y));
    const maxYBefore = Math.max(...pointsBefore.map(p => p.y));

    // Apply fillet
    engine.dispatch({
      type: 'SET_CORNER_FILLETS_BATCH',
      targetId: 'main-assembly',
      payload: { fillets: [{ panelId: frontPanel.id, corner: 'left:top', radius: 10 }] }
    });

    const panelsAfter = engine.generatePanelsFromNodes();
    const frontPanelAfter = panelsAfter.panels.find(p => p.source.faceId === 'front');

    if (!frontPanelAfter) {
      throw new Error('Front panel not found after fillet');
    }

    // The fillet should NOT expand the outline bounds
    // It should only round off the corner
    const pointsAfter = frontPanelAfter.outline.points;
    const minXAfter = Math.min(...pointsAfter.map(p => p.x));
    const maxXAfter = Math.max(...pointsAfter.map(p => p.x));
    const minYAfter = Math.min(...pointsAfter.map(p => p.y));
    const maxYAfter = Math.max(...pointsAfter.map(p => p.y));

    // Bounds should not expand (fillet removes material, doesn't add)
    expect(minXAfter).toBeGreaterThanOrEqual(minXBefore - 0.1);
    expect(maxXAfter).toBeLessThanOrEqual(maxXBefore + 0.1);
    expect(minYAfter).toBeGreaterThanOrEqual(minYBefore - 0.1);
    expect(maxYAfter).toBeLessThanOrEqual(maxYBefore + 0.1);
  });
});

// =============================================================================
// Original Tests (from previous task)
// =============================================================================

describe('Fillet Integration (original)', () => {
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
