import React, { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import { Box3D } from './Box3D';
import { ViewportToolbar } from './ViewportToolbar';
import { EditorToolbar } from './EditorToolbar';
import { useBoxStore } from '../store/useBoxStore';
import { FaceId } from '../types';

export interface Viewport3DHandle {
  getCanvas: () => HTMLCanvasElement | null;
}

export const Viewport3D = forwardRef<Viewport3DHandle>((_, ref) => {
  const clearSelection = useBoxStore((state) => state.clearSelection);
  const selectedPanelIds = useBoxStore((state) => state.selectedPanelIds);
  const panelCollection = useBoxStore((state) => state.panelCollection);
  const toggleFace = useBoxStore((state) => state.toggleFace);
  const purgeVoid = useBoxStore((state) => state.purgeVoid);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Expose method to get the canvas element
  useImperativeHandle(ref, () => ({
    getCanvas: () => {
      if (!canvasContainerRef.current) return null;
      return canvasContainerRef.current.querySelector('canvas');
    },
  }));

  // Handle deletion of selected panels
  const handleDeleteSelectedPanels = useCallback(() => {
    if (selectedPanelIds.size === 0 || !panelCollection) return;

    // Process each selected panel
    for (const panelId of selectedPanelIds) {
      const panel = panelCollection.panels.find(p => p.id === panelId);
      if (!panel) continue;

      if (panel.source.type === 'face') {
        // Face panel: toggle to non-solid (make it open)
        const faceId = panel.source.faceId;
        if (faceId) {
          toggleFace(faceId as FaceId);
        }
      } else if (panel.source.type === 'divider') {
        // Divider panel: remove the subdivision
        // subdivisionId format is "{voidId}-split"
        const subdivisionId = panel.source.subdivisionId;
        if (subdivisionId && subdivisionId.endsWith('-split')) {
          const voidId = subdivisionId.slice(0, -6); // Remove '-split' suffix
          purgeVoid(voidId);
        }
      }
    }

    // Clear selection after deletion
    clearSelection();
  }, [selectedPanelIds, panelCollection, toggleFace, purgeVoid, clearSelection]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'Escape') {
        clearSelection();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault(); // Prevent browser back navigation on Backspace
        handleDeleteSelectedPanels();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection, handleDeleteSelectedPanels]);

  return (
    <div className="viewport-container" ref={canvasContainerRef}>
      <ViewportToolbar />
      <EditorToolbar mode="3d" />
      <Canvas
        camera={{ position: [150, 150, 150], fov: 50 }}
        style={{ background: '#1a1a2e' }}
        gl={{ preserveDrawingBuffer: true }}
        onPointerMissed={() => clearSelection()}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <pointLight position={[-10, -10, -5]} intensity={0.5} />

        <Box3D />

        <Grid
          args={[200, 200]}
          cellSize={10}
          cellThickness={0.5}
          cellColor="#444"
          sectionSize={50}
          sectionThickness={1}
          sectionColor="#666"
          fadeDistance={400}
          fadeStrength={1}
          followCamera={false}
          position={[0, -60, 0]}
        />

        <OrbitControls
          makeDefault
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={50}
          maxDistance={500}
        />

        <Environment preset="studio" />
      </Canvas>
    </div>
  );
});

Viewport3D.displayName = 'Viewport3D';
