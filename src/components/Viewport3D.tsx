import { useEffect, useRef, useImperativeHandle, forwardRef, useCallback, useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import { Box3D, PushPullCallbacks } from './Box3D';
import { ViewportToolbar } from './ViewportToolbar';
import { EditorToolbar } from './EditorToolbar';
import { PushPullPalette, PushPullMode } from './PushPullPalette';
import { useBoxStore } from '../store/useBoxStore';
import { FaceId } from '../types';
import { logPushPull } from '../utils/pushPullDebug';

export interface Viewport3DHandle {
  getCanvas: () => HTMLCanvasElement | null;
}

export const Viewport3D = forwardRef<Viewport3DHandle>((_, ref) => {
  const clearSelection = useBoxStore((state) => state.clearSelection);
  const selectedPanelIds = useBoxStore((state) => state.selectedPanelIds);
  const panelCollection = useBoxStore((state) => state.panelCollection);
  const toggleFace = useBoxStore((state) => state.toggleFace);
  const purgeVoid = useBoxStore((state) => state.purgeVoid);
  const activeTool = useBoxStore((state) => state.activeTool);
  const setActiveTool = useBoxStore((state) => state.setActiveTool);
  const insetFace = useBoxStore((state) => state.insetFace);

  // Preview system from store
  const previewState = useBoxStore((state) => state.previewState);
  const startPreview = useBoxStore((state) => state.startPreview);
  const updatePreviewFaceOffset = useBoxStore((state) => state.updatePreviewFaceOffset);
  const commitPreview = useBoxStore((state) => state.commitPreview);
  const cancelPreview = useBoxStore((state) => state.cancelPreview);

  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Push/Pull palette state (local UI state only)
  const [pushPullMode, setPushPullMode] = useState<PushPullMode>('scale');
  const [palettePosition, setPalettePosition] = useState({ x: 20, y: 150 });
  const [isDraggingArrow, setIsDraggingArrow] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0); // Track current offset for UI display

  // Get selected face ID for push-pull tool
  const selectedFaceId = useMemo(() => {
    const selected = Array.from(selectedPanelIds).find(id => id.startsWith('face-'));
    return selected ? selected.replace('face-', '') as FaceId : null;
  }, [selectedPanelIds]);

  // Start preview when entering push-pull mode with a face selected
  useEffect(() => {
    if (activeTool === 'push-pull' && selectedFaceId && !previewState) {
      startPreview('push-pull', { faceId: selectedFaceId, mode: pushPullMode });
      setCurrentOffset(0);
    }
  }, [activeTool, selectedFaceId, previewState, startPreview, pushPullMode]);

  // Cancel preview when leaving push-pull mode or deselecting face
  useEffect(() => {
    if (previewState?.type === 'push-pull') {
      if (activeTool !== 'push-pull' || !selectedFaceId) {
        cancelPreview();
        setCurrentOffset(0);
      }
    }
  }, [activeTool, selectedFaceId, previewState, cancelPreview]);

  // Handle preview offset change (from palette slider or arrow drag)
  const handlePreviewOffsetChange = useCallback((offset: number) => {
    logPushPull({
      action: 'Viewport3D - handlePreviewOffsetChange called',
      faceId: selectedFaceId ?? undefined,
      offset,
      mode: pushPullMode,
      previewState: {
        hasPreview: !!previewState,
        type: previewState?.type,
      },
      extra: {
        willUpdate: !!(selectedFaceId && previewState?.type === 'push-pull'),
      },
    });
    if (selectedFaceId && previewState?.type === 'push-pull') {
      setCurrentOffset(offset);
      updatePreviewFaceOffset(selectedFaceId, offset, pushPullMode);
    }
  }, [selectedFaceId, previewState, pushPullMode, updatePreviewFaceOffset]);

  // Handle apply - commit the preview and close the operation
  const handleApplyOffset = useCallback(() => {
    if (previewState?.type === 'push-pull' && currentOffset !== 0) {
      commitPreview();
      setCurrentOffset(0);
      // Close the operation - switch back to select tool
      setActiveTool('select');
      clearSelection();
    }
  }, [previewState, currentOffset, commitPreview, setActiveTool, clearSelection]);

  // Push-pull callbacks for Box3D (arrow dragging)
  const pushPullCallbacks: PushPullCallbacks = useMemo(() => ({
    onOffsetChange: (_faceId: FaceId, offset: number) => {
      handlePreviewOffsetChange(offset);
    },
    onDragStart: () => setIsDraggingArrow(true),
    onDragEnd: () => setIsDraggingArrow(false),
  }), [handlePreviewOffsetChange]);

  // Handle inset face (open face + create divider at offset)
  const handleInsetFace = useCallback(() => {
    if (selectedFaceId && currentOffset < 0) {
      // Cancel the preview first, then apply inset to main state
      cancelPreview();
      insetFace(selectedFaceId, Math.abs(currentOffset));
      setCurrentOffset(0);
      setActiveTool('select');
    }
  }, [selectedFaceId, currentOffset, cancelPreview, insetFace, setActiveTool]);

  // Close palette when tool changes away from push-pull
  const handlePaletteClose = useCallback(() => {
    cancelPreview();
    setCurrentOffset(0);
    setActiveTool('select');
  }, [cancelPreview, setActiveTool]);

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
        if (activeTool === 'push-pull' && previewState) {
          cancelPreview();
          setCurrentOffset(0);
        }
        clearSelection();
        if (activeTool === 'push-pull') {
          setActiveTool('select');
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault(); // Prevent browser back navigation on Backspace
        handleDeleteSelectedPanels();
      } else if (e.key === 'q' || e.key === 'Q') {
        setActiveTool(activeTool === 'push-pull' ? 'select' : 'push-pull');
      } else if (e.key === 'v' || e.key === 'V') {
        setActiveTool('select');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection, handleDeleteSelectedPanels, activeTool, setActiveTool, previewState, cancelPreview]);

  return (
    <div className="viewport-container" ref={canvasContainerRef}>
      <ViewportToolbar />
      <EditorToolbar mode="3d" activeTool={activeTool} onToolChange={setActiveTool} />

      {/* Push/Pull Tool Palette */}
      <PushPullPalette
        visible={activeTool === 'push-pull' && selectedFaceId !== null}
        position={palettePosition}
        selectedFaceId={selectedFaceId}
        offset={currentOffset}
        mode={pushPullMode}
        onOffsetChange={handlePreviewOffsetChange}
        onModeChange={setPushPullMode}
        onApply={handleApplyOffset}
        onInsetFace={handleInsetFace}
        onClose={handlePaletteClose}
        onPositionChange={setPalettePosition}
        containerRef={canvasContainerRef as React.RefObject<HTMLElement>}
      />

      <Canvas
        camera={{ position: [150, 150, 150], fov: 50 }}
        style={{ background: '#1a1a2e' }}
        gl={{ preserveDrawingBuffer: true }}
        onPointerMissed={() => {
          // Don't clear selection when in push-pull mode - user might be clicking the arrow
          // which doesn't always register as a mesh hit
          if (activeTool === 'push-pull' && selectedFaceId) {
            return;
          }
          clearSelection();
        }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <pointLight position={[-10, -10, -5]} intensity={0.5} />

        <Box3D pushPullCallbacks={pushPullCallbacks} />

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
          enablePan={!isDraggingArrow}
          enableZoom={!isDraggingArrow}
          enableRotate={!isDraggingArrow}
          minDistance={50}
          maxDistance={500}
          target={[0, 0, 0]}
        />

        <Environment preset="studio" />
      </Canvas>
    </div>
  );
});

Viewport3D.displayName = 'Viewport3D';
