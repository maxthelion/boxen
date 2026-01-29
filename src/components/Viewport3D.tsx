import { useEffect, useRef, useImperativeHandle, forwardRef, useCallback, useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import { Box3D, PushPullCallbacks } from './Box3D';
import { ViewportToolbar } from './ViewportToolbar';
import { EditorToolbar } from './EditorToolbar';
import { PushPullPalette, PushPullMode } from './PushPullPalette';
import { SubdividePalette } from './SubdividePalette';
import { MovePalette } from './MovePalette';
import { CreateSubAssemblyPalette } from './CreateSubAssemblyPalette';
import { ConfigurePalette } from './ConfigurePalette';
import { ScalePalette } from './ScalePalette';
import { useBoxStore } from '../store/useBoxStore';
import { useEnginePanels } from '../engine';
import { FaceId } from '../types';
import { logPushPull } from '../utils/pushPullDebug';

export interface Viewport3DHandle {
  getCanvas: () => HTMLCanvasElement | null;
}

export const Viewport3D = forwardRef<Viewport3DHandle>((_, ref) => {
  // Model state from engine
  const panelCollection = useEnginePanels();

  // UI state and actions from store
  const clearSelection = useBoxStore((state) => state.clearSelection);
  const selectedPanelIds = useBoxStore((state) => state.selectedPanelIds);
  const toggleFace = useBoxStore((state) => state.toggleFace);
  const purgeVoid = useBoxStore((state) => state.purgeVoid);
  const activeTool = useBoxStore((state) => state.activeTool);
  const setActiveTool = useBoxStore((state) => state.setActiveTool);
  const insetFace = useBoxStore((state) => state.insetFace);

  // Operation system from store
  const operationState = useBoxStore((state) => state.operationState);
  const startOperation = useBoxStore((state) => state.startOperation);
  const updateOperationParams = useBoxStore((state) => state.updateOperationParams);
  const applyOperation = useBoxStore((state) => state.applyOperation);
  const cancelOperation = useBoxStore((state) => state.cancelOperation);

  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Push/Pull palette state (local UI state only)
  const [pushPullMode, setPushPullMode] = useState<PushPullMode>('scale');
  const [palettePosition, setPalettePosition] = useState({ x: 20, y: 150 });
  const [isDraggingArrow, setIsDraggingArrow] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0); // Track current offset for UI display

  // Subdivide palette state (local UI state only)
  const [subdividePalettePosition, setSubdividePalettePosition] = useState({ x: 20, y: 150 });

  // Move palette state (local UI state only)
  const [movePalettePosition, setMovePalettePosition] = useState({ x: 20, y: 150 });

  // Create sub-assembly palette state (local UI state only)
  const [createSubAssemblyPalettePosition, setCreateSubAssemblyPalettePosition] = useState({ x: 20, y: 150 });

  // Configure palette state (local UI state only)
  const [configurePalettePosition, setConfigurePalettePosition] = useState({ x: 20, y: 150 });

  // Scale palette state (local UI state only)
  const [scalePalettePosition, setScalePalettePosition] = useState({ x: 20, y: 150 });

  // Get selected face ID for push-pull tool
  // Panel IDs are UUIDs, so we need to look up the panel source metadata
  const selectedFaceId = useMemo(() => {
    if (!panelCollection) return null;
    for (const panelId of selectedPanelIds) {
      const panel = panelCollection.panels.find(p => p.id === panelId);
      if (panel?.source.type === 'face' && panel.source.faceId) {
        return panel.source.faceId;
      }
    }
    return null;
  }, [selectedPanelIds, panelCollection]);

  // Start operation when entering push-pull mode with a face selected
  useEffect(() => {
    const isOperationActive = operationState.activeOperation === 'push-pull';
    if (activeTool === 'push-pull' && selectedFaceId && !isOperationActive) {
      startOperation('push-pull');
      // Initialize params (no offset yet)
      updateOperationParams({ faceId: selectedFaceId, offset: 0, mode: pushPullMode });
      setCurrentOffset(0);
    }
  }, [activeTool, selectedFaceId, operationState.activeOperation, startOperation, updateOperationParams, pushPullMode]);

  // Cancel operation when leaving push-pull mode or deselecting face
  useEffect(() => {
    if (operationState.activeOperation === 'push-pull') {
      if (activeTool !== 'push-pull' || !selectedFaceId) {
        cancelOperation();
        setCurrentOffset(0);
      }
    }
  }, [activeTool, selectedFaceId, operationState.activeOperation, cancelOperation]);

  // Handle offset change (from palette slider or arrow drag)
  const handlePreviewOffsetChange = useCallback((offset: number) => {
    logPushPull({
      action: 'Viewport3D - handlePreviewOffsetChange called',
      faceId: selectedFaceId ?? undefined,
      offset,
      mode: pushPullMode,
      previewState: {
        hasPreview: operationState.activeOperation === 'push-pull',
        type: operationState.activeOperation ?? undefined,
      },
      extra: {
        willUpdate: !!(selectedFaceId && operationState.activeOperation === 'push-pull'),
      },
    });
    if (selectedFaceId && operationState.activeOperation === 'push-pull') {
      setCurrentOffset(offset);
      updateOperationParams({ faceId: selectedFaceId, offset, mode: pushPullMode });
    }
  }, [selectedFaceId, operationState.activeOperation, pushPullMode, updateOperationParams]);

  // Handle apply - commit the operation and close
  const handleApplyOffset = useCallback(() => {
    if (operationState.activeOperation === 'push-pull' && currentOffset !== 0) {
      applyOperation();
      setCurrentOffset(0);
      // Close the operation - switch back to select tool
      setActiveTool('select');
      clearSelection();
    }
  }, [operationState.activeOperation, currentOffset, applyOperation, setActiveTool, clearSelection]);

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
      // Cancel the operation first, then apply inset to main state
      cancelOperation();
      insetFace(selectedFaceId, Math.abs(currentOffset));
      setCurrentOffset(0);
      setActiveTool('select');
    }
  }, [selectedFaceId, currentOffset, cancelOperation, insetFace, setActiveTool]);

  // Close palette when tool changes away from push-pull
  const handlePaletteClose = useCallback(() => {
    cancelOperation();
    setCurrentOffset(0);
    setActiveTool('select');
  }, [cancelOperation, setActiveTool]);

  // Close subdivide palette
  const handleSubdividePaletteClose = useCallback(() => {
    setActiveTool('select');
  }, [setActiveTool]);

  // Close move palette
  const handleMovePaletteClose = useCallback(() => {
    setActiveTool('select');
  }, [setActiveTool]);

  // Close create sub-assembly palette
  const handleCreateSubAssemblyPaletteClose = useCallback(() => {
    setActiveTool('select');
  }, [setActiveTool]);

  // Close configure palette
  const handleConfigurePaletteClose = useCallback(() => {
    setActiveTool('select');
  }, [setActiveTool]);

  // Close scale palette
  const handleScalePaletteClose = useCallback(() => {
    setActiveTool('select');
  }, [setActiveTool]);

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
        if (activeTool === 'push-pull' && operationState.activeOperation === 'push-pull') {
          cancelOperation();
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
      } else if (e.key === 's' || e.key === 'S') {
        setActiveTool(activeTool === 'subdivide' ? 'select' : 'subdivide');
      } else if (e.key === 'm' || e.key === 'M') {
        setActiveTool(activeTool === 'move' ? 'select' : 'move');
      } else if (e.key === 'v' || e.key === 'V') {
        setActiveTool('select');
      } else if (e.key === 'g' || e.key === 'G') {
        setActiveTool(activeTool === 'configure' ? 'select' : 'configure');
      } else if (e.key === 'r' || e.key === 'R') {
        setActiveTool(activeTool === 'scale' ? 'select' : 'scale');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection, handleDeleteSelectedPanels, activeTool, setActiveTool, operationState.activeOperation, cancelOperation]);

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

      {/* Subdivide Tool Palette - only mount when tool is active */}
      {activeTool === 'subdivide' && (
        <SubdividePalette
          visible={true}
          position={subdividePalettePosition}
          onPositionChange={setSubdividePalettePosition}
          onClose={handleSubdividePaletteClose}
          containerRef={canvasContainerRef as React.RefObject<HTMLElement>}
        />
      )}

      {/* Move Tool Palette - only mount when tool is active */}
      {activeTool === 'move' && (
        <MovePalette
          visible={true}
          position={movePalettePosition}
          onPositionChange={setMovePalettePosition}
          onClose={handleMovePaletteClose}
          containerRef={canvasContainerRef as React.RefObject<HTMLElement>}
        />
      )}

      {/* Create Sub-Assembly Tool Palette - only mount when tool is active */}
      {activeTool === 'create-sub-assembly' && (
        <CreateSubAssemblyPalette
          visible={true}
          position={createSubAssemblyPalettePosition}
          onPositionChange={setCreateSubAssemblyPalettePosition}
          onClose={handleCreateSubAssemblyPaletteClose}
          containerRef={canvasContainerRef as React.RefObject<HTMLElement>}
        />
      )}

      {/* Configure Palette - for assembly or face settings */}
      <ConfigurePalette
        visible={activeTool === 'configure'}
        position={configurePalettePosition}
        onPositionChange={setConfigurePalettePosition}
        onClose={handleConfigurePaletteClose}
        containerRef={canvasContainerRef as React.RefObject<HTMLElement>}
      />

      {/* Scale Palette - only mount when tool is active */}
      <ScalePalette
        visible={activeTool === 'scale'}
        position={scalePalettePosition}
        onPositionChange={setScalePalettePosition}
        onClose={handleScalePaletteClose}
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
