/**
 * Fillet Application Integration Tests
 *
 * Tests that verify fillet operations actually change the panel geometry,
 * not just that actions succeed. These tests use the AssemblyBuilder system
 * to create realistic box scenarios and verify user-visible outcomes.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AssemblyBuilder } from '../../builder';
import type { Engine } from '../../engine/Engine';

describe('Fillet application', () => {
  describe('basic fillet geometry', () => {
    it('applying fillet to corner increases outline points', () => {
      // Setup: panel with all 4 adjacent faces open (4 eligible corners)
      const { panel, engine } = AssemblyBuilder
        .basicBox(100, 80, 60)
        .withOpenFaces(['top', 'bottom', 'left', 'right'])
        .panel('front')
        .build();

      expect(panel).toBeDefined();
      if (!panel) return;

      // Simple rectangle should have 4 points
      const pointsBefore = panel.outline.points.length;
      expect(pointsBefore).toBe(4);

      // Find an eligible corner
      const eligibleCorners = panel.allCornerEligibility?.filter(c => c.eligible) ?? [];
      expect(eligibleCorners.length).toBeGreaterThan(0);

      const corner = eligibleCorners[0];

      // Apply fillet to first corner
      engine.dispatch({
        type: 'SET_ALL_CORNER_FILLET',
        targetId: 'main-assembly',
        payload: { panelId: panel.id, cornerId: corner.id, radius: 5 },
      });

      // Get updated panel
      const updatedPanels = engine.generatePanelsFromNodes().panels;
      const updatedPanel = updatedPanels.find(p => p.id === panel.id);

      expect(updatedPanel).toBeDefined();
      if (!updatedPanel) return;

      // Arc points should replace the corner point, resulting in more points
      expect(updatedPanel.outline.points.length).toBeGreaterThan(pointsBefore);
    });

    it('fillet with radius 0 does not change geometry', () => {
      const { panel, engine } = AssemblyBuilder
        .basicBox(100, 80, 60)
        .withOpenFaces(['top', 'bottom', 'left', 'right'])
        .panel('front')
        .build();

      expect(panel).toBeDefined();
      if (!panel) return;

      const pointsBefore = panel.outline.points.length;

      const eligibleCorners = panel.allCornerEligibility?.filter(c => c.eligible) ?? [];
      if (eligibleCorners.length === 0) return;

      // Apply fillet with radius 0
      engine.dispatch({
        type: 'SET_ALL_CORNER_FILLET',
        targetId: 'main-assembly',
        payload: { panelId: panel.id, cornerId: eligibleCorners[0].id, radius: 0 },
      });

      const updatedPanels = engine.generatePanelsFromNodes().panels;
      const updatedPanel = updatedPanels.find(p => p.id === panel.id);

      expect(updatedPanel?.outline.points.length).toBe(pointsBefore);
    });

    it('multiple fillets add multiple arc segments', () => {
      const { panel, engine } = AssemblyBuilder
        .basicBox(100, 80, 60)
        .withOpenFaces(['top', 'bottom', 'left', 'right'])
        .panel('front')
        .build();

      expect(panel).toBeDefined();
      if (!panel) return;

      const pointsBefore = panel.outline.points.length;
      expect(pointsBefore).toBe(4);

      const eligibleCorners = panel.allCornerEligibility?.filter(c => c.eligible) ?? [];
      // Should have 4 eligible corners on a simple rectangle
      expect(eligibleCorners.length).toBe(4);

      // Apply fillets to all 4 corners using batch action
      engine.dispatch({
        type: 'SET_ALL_CORNER_FILLETS_BATCH',
        targetId: 'main-assembly',
        payload: {
          fillets: eligibleCorners.map(c => ({
            panelId: panel.id,
            cornerId: c.id,
            radius: 5,
          })),
        },
      });

      const updatedPanels = engine.generatePanelsFromNodes().panels;
      const updatedPanel = updatedPanels.find(p => p.id === panel.id);

      expect(updatedPanel).toBeDefined();
      if (!updatedPanel) return;

      // Each arc adds multiple points (8 by default), so 4 corners * 9 points = 36
      // (9 because arc has 8 segments = 9 points including endpoints)
      expect(updatedPanel.outline.points.length).toBeGreaterThan(pointsBefore * 2);
    });

    it('fillet is removed when radius set to 0', () => {
      const { panel, engine } = AssemblyBuilder
        .basicBox(100, 80, 60)
        .withOpenFaces(['top', 'bottom', 'left', 'right'])
        .panel('front')
        .build();

      expect(panel).toBeDefined();
      if (!panel) return;

      const eligibleCorners = panel.allCornerEligibility?.filter(c => c.eligible) ?? [];
      if (eligibleCorners.length === 0) return;

      const corner = eligibleCorners[0];

      // Apply fillet
      engine.dispatch({
        type: 'SET_ALL_CORNER_FILLET',
        targetId: 'main-assembly',
        payload: { panelId: panel.id, cornerId: corner.id, radius: 5 },
      });

      let updatedPanels = engine.generatePanelsFromNodes().panels;
      let updatedPanel = updatedPanels.find(p => p.id === panel.id);
      const pointsWithFillet = updatedPanel?.outline.points.length ?? 0;
      expect(pointsWithFillet).toBeGreaterThan(4);

      // Remove fillet by setting radius to 0
      engine.dispatch({
        type: 'SET_ALL_CORNER_FILLET',
        targetId: 'main-assembly',
        payload: { panelId: panel.id, cornerId: corner.id, radius: 0 },
      });

      updatedPanels = engine.generatePanelsFromNodes().panels;
      updatedPanel = updatedPanels.find(p => p.id === panel.id);

      // Should return to original 4 points
      expect(updatedPanel?.outline.points.length).toBe(4);
    });
  });

  describe('fillet with finger joints', () => {
    it('panel with finger joints has no eligible corners', () => {
      // Enclosed box - all panels have finger joints on all edges
      const { panel } = AssemblyBuilder
        .enclosedBox(100, 80, 60)
        .panel('front')
        .build();

      expect(panel).toBeDefined();
      if (!panel) return;

      // All edges have finger joints, so no corners should be eligible
      const eligibleCorners = panel.allCornerEligibility?.filter(c => c.eligible) ?? [];
      expect(eligibleCorners.length).toBe(0);
    });

    it('panel with one open edge has no eligible corners', () => {
      // Basic box has only top open - other 3 edges have finger joints
      // For the front panel: top edge is free, but left/right/bottom have joints
      // No corner has BOTH adjacent edges free
      const { panel } = AssemblyBuilder
        .basicBox(100, 80, 60)
        .panel('front')
        .build();

      expect(panel).toBeDefined();
      if (!panel) return;

      const eligibleCorners = panel.allCornerEligibility?.filter(c => c.eligible) ?? [];
      // Even with top edge free, corners still touch edges with joints
      expect(eligibleCorners.length).toBe(0);
    });

    it('panel with two adjacent open edges has one eligible corner', () => {
      // Open top and left faces
      // For front panel: top-left corner has both edges free
      const { panel } = AssemblyBuilder
        .basicBox(100, 80, 60)
        .withOpenFaces(['top', 'left'])
        .panel('front')
        .build();

      expect(panel).toBeDefined();
      if (!panel) return;

      const eligibleCorners = panel.allCornerEligibility?.filter(c => c.eligible) ?? [];
      // Only the corner where both adjacent edges are free should be eligible
      expect(eligibleCorners.length).toBe(1);
    });
  });

  describe('preview and commit', () => {
    let engine: Engine;

    beforeEach(() => {
      ({ engine } = AssemblyBuilder
        .enclosedBox(100, 80, 60)
        .withOpenFaces(['top', 'bottom', 'left', 'right'])
        .build());
    });

    it('preview shows fillet geometry', () => {
      const panels = engine.generatePanelsFromNodes().panels;
      const frontPanel = panels.find(p => p.source.faceId === 'front');
      expect(frontPanel).toBeDefined();
      if (!frontPanel) return;

      const eligibleCorners = frontPanel.allCornerEligibility?.filter(c => c.eligible) ?? [];
      expect(eligibleCorners.length).toBeGreaterThan(0);

      // Start preview
      engine.startPreview();

      // Apply fillet in preview
      engine.dispatch({
        type: 'SET_ALL_CORNER_FILLET',
        targetId: 'main-assembly',
        payload: { panelId: frontPanel.id, cornerId: eligibleCorners[0].id, radius: 5 },
      });

      // Get preview panels
      const previewPanels = engine.generatePanelsFromNodes().panels;
      const previewFrontPanel = previewPanels.find(p => p.id === frontPanel.id);

      expect(previewFrontPanel).toBeDefined();
      if (!previewFrontPanel) return;

      // Preview should show fillet
      expect(previewFrontPanel.outline.points.length).toBeGreaterThan(4);
    });

    it('commit persists fillet geometry', () => {
      const panels = engine.generatePanelsFromNodes().panels;
      const frontPanel = panels.find(p => p.source.faceId === 'front');
      expect(frontPanel).toBeDefined();
      if (!frontPanel) return;

      const eligibleCorners = frontPanel.allCornerEligibility?.filter(c => c.eligible) ?? [];
      expect(eligibleCorners.length).toBeGreaterThan(0);

      // Start preview and apply fillet
      engine.startPreview();
      engine.dispatch({
        type: 'SET_ALL_CORNER_FILLET',
        targetId: 'main-assembly',
        payload: { panelId: frontPanel.id, cornerId: eligibleCorners[0].id, radius: 5 },
      });

      // Commit preview
      engine.commitPreview();

      // Get committed panels
      const committedPanels = engine.generatePanelsFromNodes().panels;
      const committedFrontPanel = committedPanels.find(p => p.source.faceId === 'front');

      expect(committedFrontPanel).toBeDefined();
      if (!committedFrontPanel) return;

      // Fillet should be persisted
      expect(committedFrontPanel.outline.points.length).toBeGreaterThan(4);
    });

    it('cancel removes fillet geometry', () => {
      const panels = engine.generatePanelsFromNodes().panels;
      const frontPanel = panels.find(p => p.source.faceId === 'front');
      expect(frontPanel).toBeDefined();
      if (!frontPanel) return;

      const eligibleCorners = frontPanel.allCornerEligibility?.filter(c => c.eligible) ?? [];
      expect(eligibleCorners.length).toBeGreaterThan(0);

      const pointsBefore = frontPanel.outline.points.length;

      // Start preview and apply fillet
      engine.startPreview();
      engine.dispatch({
        type: 'SET_ALL_CORNER_FILLET',
        targetId: 'main-assembly',
        payload: { panelId: frontPanel.id, cornerId: eligibleCorners[0].id, radius: 5 },
      });

      // Discard preview
      engine.discardPreview();

      // Get panels after discard
      const discardedPanels = engine.generatePanelsFromNodes().panels;
      const discardedFrontPanel = discardedPanels.find(p => p.source.faceId === 'front');

      expect(discardedFrontPanel).toBeDefined();
      if (!discardedFrontPanel) return;

      // Should return to original geometry
      expect(discardedFrontPanel.outline.points.length).toBe(pointsBefore);
    });
  });
});
