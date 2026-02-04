/**
 * Viewport3D - Main 3D view with toolbar and operation palettes
 *
 * IMPORTANT: Before modifying this file, read .claude/rules/operations.md
 * which describes the pattern for adding new operations and mounting palettes.
 *
 * When adding a new operation palette:
 * 1. Import the palette component
 * 2. Add position state: const [myOpPosition, setMyOpPosition] = useState(...)
 * 3. Mount conditionally: {activeTool === 'my-op' && <MyOpPalette ... />}
 */

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
import { InsetPalette, PanelEdgeGroup } from './InsetPalette';
import { FilletAllCornersPalette, PanelAllCornerGroup } from './FilletAllCornersPalette';
import { IneligibilityTooltip } from './IneligibilityTooltip';
import { useBoxStore } from '../store/useBoxStore';
import { EdgePosition, EdgeStatus } from '../types';
import { useEnginePanels, getEngine } from '../engine';
import { CornerKey, AllCornerId } from '../engine/types';
import { FaceId } from '../types';
import { logPushPull } from '../utils/pushPullDebug';
import { useIneligibilityTooltip } from '../hooks/useIneligibilityTooltip';

export interface Viewport3DHandle {
  getCanvas: () => HTMLCanvasElement | null;
}

export const Viewport3D = forwardRef<Viewport3DHandle>((_, ref) => {
  // Model state from engine
  const panelCollection = useEnginePanels();

  // UI state and actions from store
  const clearSelection = useBoxStore((state) => state.clearSelection);
  const selectedPanelIds = useBoxStore((state) => state.selectedPanelIds);
  const selectedEdges = useBoxStore((state) => state.selectedEdges);
  const toggleFace = useBoxStore((state) => state.toggleFace);
  const toggleSubAssemblyFace = useBoxStore((state) => state.toggleSubAssemblyFace);
  const purgeVoid = useBoxStore((state) => state.purgeVoid);
  const activeTool = useBoxStore((state) => state.activeTool);
  const setActiveTool = useBoxStore((state) => state.setActiveTool);
  const insetFace = useBoxStore((state) => state.insetFace);
  const selectEdge = useBoxStore((state) => state.selectEdge);
  const selectPanelEdges = useBoxStore((state) => state.selectPanelEdges);
  const selectPanelCorners = useBoxStore((state) => state.selectPanelCorners);

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

  // Inset palette state (local UI state only)
  const [insetPalettePosition, setInsetPalettePosition] = useState({ x: 20, y: 150 });
  const [insetOffset, setInsetOffset] = useState(0);
  const baseExtensionsRef = useRef<Record<string, number>>({});

  // Fillet palette state (local UI state only)
  const [filletPalettePosition, setFilletPalettePosition] = useState({ x: 20, y: 150 });
  const [filletRadius, setFilletRadius] = useState(5);
  const selectedCornerIds = useBoxStore((state) => state.selectedCornerIds);
  const selectedAllCornerIds = useBoxStore((state) => state.selectedAllCornerIds);
  const selectAllCorner = useBoxStore((state) => state.selectAllCorner);
  const clearAllCornerSelection = useBoxStore((state) => state.clearAllCornerSelection);

  // Ineligibility tooltip
  const tooltipMessage = useIneligibilityTooltip();

  // Get selected face ID and assembly ID for push-pull tool
  // Panel IDs are UUIDs, so we need to look up the panel source metadata
  const selectedFaceInfo = useMemo(() => {
    if (!panelCollection) return null;
    for (const panelId of selectedPanelIds) {
      const panel = panelCollection.panels.find(p => p.id === panelId);
      if (panel?.source.type === 'face' && panel.source.faceId) {
        return {
          faceId: panel.source.faceId,
          // Use sub-assembly ID if present, otherwise main assembly
          assemblyId: panel.source.subAssemblyId ?? 'main-assembly',
        };
      }
    }
    return null;
  }, [selectedPanelIds, panelCollection]);

  const selectedFaceId = selectedFaceInfo?.faceId ?? null;
  const selectedAssemblyId = selectedFaceInfo?.assemblyId ?? 'main-assembly';

  // For sub-assemblies, always use extend mode (scale doesn't make sense)
  const isSubAssembly = selectedAssemblyId !== 'main-assembly';
  const effectiveMode = isSubAssembly ? 'extend' : pushPullMode;

  // Start operation when entering push-pull mode with a face selected
  useEffect(() => {
    const isOperationActive = operationState.activeOperation === 'push-pull';
    if (activeTool === 'push-pull' && selectedFaceId && !isOperationActive) {
      startOperation('push-pull');
      // Initialize params (no offset yet) - include assemblyId for sub-assembly support
      // For sub-assemblies, force extend mode
      updateOperationParams({ faceId: selectedFaceId, offset: 0, mode: effectiveMode, assemblyId: selectedAssemblyId });
      setCurrentOffset(0);
    }
  }, [activeTool, selectedFaceId, selectedAssemblyId, operationState.activeOperation, startOperation, updateOperationParams, effectiveMode]);

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
      mode: effectiveMode,
      previewState: {
        hasPreview: operationState.activeOperation === 'push-pull',
        type: operationState.activeOperation ?? undefined,
      },
      extra: {
        willUpdate: !!(selectedFaceId && operationState.activeOperation === 'push-pull'),
        assemblyId: selectedAssemblyId,
        isSubAssembly,
      },
    });
    if (selectedFaceId && operationState.activeOperation === 'push-pull') {
      setCurrentOffset(offset);
      updateOperationParams({ faceId: selectedFaceId, offset, mode: effectiveMode, assemblyId: selectedAssemblyId });
    }
  }, [selectedFaceId, selectedAssemblyId, operationState.activeOperation, effectiveMode, isSubAssembly, updateOperationParams]);

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

  // Inset/Outset operation handlers
  const selectedEdgesArray = useMemo(() => Array.from(selectedEdges), [selectedEdges]);

  // Build panel edge groups for the InsetPalette
  // Groups panels that have selected edges, showing all their edges
  const panelEdgeGroups = useMemo((): PanelEdgeGroup[] => {
    if (activeTool !== 'inset' || !panelCollection) {
      return [];
    }

    // Get unique panel IDs from selected edges
    const panelIdsWithEdges = new Set<string>();
    for (const edgeKey of selectedEdges) {
      const colonIndex = edgeKey.lastIndexOf(':');
      if (colonIndex > 0) {
        panelIdsWithEdges.add(edgeKey.slice(0, colonIndex));
      }
    }

    if (panelIdsWithEdges.size === 0) {
      return [];
    }

    // Build groups for each panel
    const groups: PanelEdgeGroup[] = [];
    const allEdges: EdgePosition[] = ['top', 'bottom', 'left', 'right'];

    for (const panelId of panelIdsWithEdges) {
      const panel = panelCollection.panels.find(p => p.id === panelId);
      if (!panel) continue;

      // Get panel name from source
      let panelName: string;
      if (panel.source.type === 'face' && panel.source.faceId) {
        // Capitalize face name
        const faceId = panel.source.faceId;
        panelName = faceId.charAt(0).toUpperCase() + faceId.slice(1);
      } else if (panel.source.type === 'divider') {
        panelName = `Divider`;
        if (panel.source.axis) {
          panelName += ` (${panel.source.axis.toUpperCase()})`;
        }
      } else {
        panelName = 'Panel';
      }

      // Build edge info from panel's edge statuses
      const edges = allEdges.map(position => {
        const statusInfo = panel.edgeStatuses?.find(s => s.position === position);
        const status: EdgeStatus = statusInfo?.status ?? 'unlocked';
        const isSelected = selectedEdges.has(`${panelId}:${position}`);

        return { position, status, isSelected };
      });

      groups.push({ panelId, panelName, edges });
    }

    return groups;
  }, [activeTool, panelCollection, selectedEdges]);

  // Handle edge toggle from palette
  const handleEdgeToggle = useCallback((panelId: string, edge: EdgePosition) => {
    // Toggle the edge selection
    selectEdge(panelId, edge, true);  // additive = true to toggle
  }, [selectEdge]);

  // Compute base extensions for selected edges from the committed scene
  const computeBaseExtensions = useCallback((edges: string[]): Record<string, number> => {
    const engine = getEngine();
    // Get panels from main scene (not preview) to get committed extension values
    const mainScene = engine.getMainScene();
    const assembly = mainScene.primaryAssembly;
    if (!assembly) return {};

    const baseExtensions: Record<string, number> = {};
    for (const edgeKey of edges) {
      const colonIndex = edgeKey.lastIndexOf(':');
      if (colonIndex > 0) {
        const panelId = edgeKey.slice(0, colonIndex);
        const edge = edgeKey.slice(colonIndex + 1) as 'top' | 'bottom' | 'left' | 'right';
        const extensions = assembly.getPanelEdgeExtensions(panelId);
        baseExtensions[edgeKey] = extensions[edge] ?? 0;
      }
    }
    return baseExtensions;
  }, []);

  // Compute current fillet radii for selected corners from the committed scene
  const computeCurrentFilletRadii = useCallback((corners: string[]): Record<string, number> => {
    const engine = getEngine();
    // Get from main scene (not preview) to get committed fillet values
    const mainScene = engine.getMainScene();
    const assembly = mainScene.primaryAssembly;
    if (!assembly) return {};

    const radii: Record<string, number> = {};
    for (const cornerKey of corners) {
      // Corner key format: "panelId:corner" where corner is like "left:top"
      const parts = cornerKey.split(':');
      if (parts.length >= 3) {
        const panelId = parts.slice(0, -2).join(':');
        const corner = `${parts[parts.length - 2]}:${parts[parts.length - 1]}` as CornerKey;
        const radius = assembly.getPanelCornerFillet(panelId, corner);
        radii[cornerKey] = radius;
      }
    }
    return radii;
  }, []);

  // Start operation when entering inset mode with edges selected
  useEffect(() => {
    const isOperationActive = operationState.activeOperation === 'inset-outset';
    if (activeTool === 'inset' && selectedEdgesArray.length > 0 && !isOperationActive) {
      // Compute base extensions from committed state BEFORE starting preview
      const baseExtensions = computeBaseExtensions(selectedEdgesArray);
      baseExtensionsRef.current = baseExtensions;

      startOperation('inset-outset');
      updateOperationParams({ edges: selectedEdgesArray, offset: 0, baseExtensions });
      setInsetOffset(0);
    }
  }, [activeTool, selectedEdgesArray, operationState.activeOperation, startOperation, updateOperationParams, computeBaseExtensions]);

  // Cancel operation when leaving inset mode or deselecting all edges
  useEffect(() => {
    if (operationState.activeOperation === 'inset-outset') {
      if (activeTool !== 'inset' || selectedEdgesArray.length === 0) {
        cancelOperation();
        setInsetOffset(0);
      }
    }
  }, [activeTool, selectedEdgesArray.length, operationState.activeOperation, cancelOperation]);

  // Auto-expand selected panels to edges when inset tool is activated
  useEffect(() => {
    if (activeTool === 'inset' && selectedPanelIds.size > 0 && selectedEdges.size === 0 && panelCollection) {
      // Expand each selected panel to its eligible edges (additive to accumulate all)
      for (const panelId of selectedPanelIds) {
        const panel = panelCollection.panels.find(p => p.id === panelId);
        if (panel?.edgeStatuses) {
          selectPanelEdges(panelId, panel.edgeStatuses, true);
        }
      }
    }
  }, [activeTool, selectedPanelIds, selectedEdges.size, panelCollection, selectPanelEdges]);

  // Track previous edges for change detection
  const prevEdgesRef = useRef<string[]>([]);

  // Re-apply preview when selection changes during active operation
  // This ensures added edges get the operation applied and removed edges revert
  useEffect(() => {
    const isOperationActive = operationState.activeOperation === 'inset-outset';
    if (!isOperationActive) {
      // Reset tracking when operation is not active
      prevEdgesRef.current = [];
      return;
    }

    // Check if selection actually changed (not just a re-render)
    const prevEdges = prevEdgesRef.current;
    const currentEdges = selectedEdgesArray;

    const edgesChanged =
      prevEdges.length !== currentEdges.length ||
      prevEdges.some((e, i) => e !== currentEdges[i]) ||
      currentEdges.some((e, i) => e !== prevEdges[i]);

    if (edgesChanged && prevEdges.length > 0) {
      // Selection changed during active operation - re-apply preview with new selection
      // Recompute base extensions for the new selection
      const baseExtensions = computeBaseExtensions(currentEdges);
      baseExtensionsRef.current = baseExtensions;
      updateOperationParams({ edges: currentEdges, offset: insetOffset, baseExtensions });
    }

    // Update tracking
    prevEdgesRef.current = [...currentEdges];
  }, [selectedEdgesArray, operationState.activeOperation, insetOffset, updateOperationParams]);

  // Handle inset offset change
  const handleInsetOffsetChange = useCallback((offset: number) => {
    if (operationState.activeOperation === 'inset-outset') {
      setInsetOffset(offset);
      updateOperationParams({ edges: selectedEdgesArray, offset, baseExtensions: baseExtensionsRef.current });
    }
  }, [operationState.activeOperation, selectedEdgesArray, updateOperationParams]);

  // Handle inset apply
  const handleInsetApply = useCallback(() => {
    if (operationState.activeOperation === 'inset-outset' && insetOffset !== 0) {
      applyOperation();
      setInsetOffset(0);
      setActiveTool('select');
    }
  }, [operationState.activeOperation, insetOffset, applyOperation, setActiveTool]);

  // Close inset palette
  const handleInsetPaletteClose = useCallback(() => {
    cancelOperation();
    setInsetOffset(0);
    setActiveTool('select');
  }, [cancelOperation, setActiveTool]);

  // =========================================================================
  // Fillet operation handlers
  // =========================================================================

  const selectedCornersArray = useMemo(() => Array.from(selectedCornerIds), [selectedCornerIds]);

  // Build panel all-corner groups for the FilletAllCornersPalette
  // This uses allCornerEligibility which includes all corners in outline + holes
  const panelAllCornerGroups = useMemo((): PanelAllCornerGroup[] => {
    if (activeTool !== 'fillet' || !panelCollection) {
      return [];
    }

    // Get unique panel IDs from selected all-corners
    const panelIdsWithCorners = new Set<string>();
    for (const cornerKey of selectedAllCornerIds) {
      // Format: "panelId:cornerId" where cornerId is like "outline:5" or "hole:holeId:3"
      const firstColonIndex = cornerKey.indexOf(':');
      if (firstColonIndex > 0) {
        panelIdsWithCorners.add(cornerKey.slice(0, firstColonIndex));
      }
    }

    // If no corners selected, show all panels that have eligible corners
    if (panelIdsWithCorners.size === 0) {
      for (const panel of panelCollection.panels) {
        if (panel.allCornerEligibility && panel.allCornerEligibility.some(c => c.eligible)) {
          panelIdsWithCorners.add(panel.id);
        }
      }
    }

    if (panelIdsWithCorners.size === 0) {
      return [];
    }

    // Build groups for each panel
    const groups: PanelAllCornerGroup[] = [];

    for (const panelId of panelIdsWithCorners) {
      const panel = panelCollection.panels.find(p => p.id === panelId);
      if (!panel || !panel.allCornerEligibility) continue;

      // Get panel name from source
      let panelName: string;
      if (panel.source.type === 'face' && panel.source.faceId) {
        const faceId = panel.source.faceId;
        panelName = faceId.charAt(0).toUpperCase() + faceId.slice(1);
      } else if (panel.source.type === 'divider') {
        panelName = `Divider`;
        if (panel.source.axis) {
          panelName += ` (${panel.source.axis.toUpperCase()})`;
        }
      } else {
        panelName = 'Panel';
      }

      // Convert AllCornerEligibility to AllCornerInfo
      const corners = panel.allCornerEligibility.map(eligibility => {
        const cornerKey = `${panelId}:${eligibility.id}`;
        const isSelected = selectedAllCornerIds.has(cornerKey);

        return {
          id: eligibility.id,
          isEligible: eligibility.eligible,
          maxRadius: eligibility.maxRadius,
          isSelected,
          position: eligibility.position,
          type: eligibility.type,
          location: eligibility.location,
        };
      });

      groups.push({ panelId, panelName, corners });
    }

    return groups;
  }, [activeTool, panelCollection, selectedAllCornerIds]);

  // Calculate max radius for all-corners fillet (from panelAllCornerGroups)
  const filletAllMaxRadius = useMemo(() => {
    let minMax = Infinity;
    for (const group of panelAllCornerGroups) {
      for (const corner of group.corners) {
        if (corner.isSelected && corner.isEligible && corner.maxRadius > 0) {
          minMax = Math.min(minMax, corner.maxRadius);
        }
      }
    }
    return minMax === Infinity ? 0 : minMax;
  }, [panelAllCornerGroups]);

  // Handle all-corner toggle from FilletAllCornersPalette
  const handleAllCornerToggle = useCallback((panelId: string, cornerId: AllCornerId) => {
    selectAllCorner(panelId, cornerId, true);  // additive = true to toggle
  }, [selectAllCorner]);

  // Handle select all eligible corners for FilletAllCornersPalette
  const handleSelectAllEligible = useCallback(() => {
    if (!panelCollection) return;

    // Collect all eligible corner keys across all panels
    const eligibleCornerKeys: string[] = [];
    for (const panel of panelCollection.panels) {
      if (panel.allCornerEligibility) {
        for (const eligibility of panel.allCornerEligibility) {
          if (eligibility.eligible) {
            eligibleCornerKeys.push(`${panel.id}:${eligibility.id}`);
          }
        }
      }
    }

    // Select all at once using selectAllCorners
    const selectAllCorners = useBoxStore.getState().selectAllCorners;
    selectAllCorners(eligibleCornerKeys);
  }, [panelCollection]);

  // Auto-expand selected panels to corners when fillet tool is activated
  useEffect(() => {
    if (activeTool === 'fillet' && selectedPanelIds.size > 0 && selectedCornerIds.size === 0 && panelCollection) {
      // Expand each selected panel to all its corners
      for (const selectedId of selectedPanelIds) {
        // The selected ID might be in 'face-front' format (from BoxTree) or UUID format
        // Try to find panel by ID first, then by source.faceId
        let panel = panelCollection.panels.find(p => p.id === selectedId);

        if (!panel && selectedId.startsWith('face-')) {
          // Try matching by faceId (e.g., 'face-front' -> find panel with source.faceId === 'front')
          const faceId = selectedId.replace('face-', '');
          panel = panelCollection.panels.find(p =>
            p.source.type === 'face' && p.source.faceId === faceId
          );
        }

        if (panel?.cornerEligibility) {
          // Use the actual panel UUID for corner selection (additive to accumulate all)
          selectPanelCorners(panel.id, panel.cornerEligibility, true);
        }
      }
    }
  }, [activeTool, selectedPanelIds, selectedCornerIds.size, panelCollection, selectPanelCorners]);

  // Start fillet operation when entering fillet mode with corners selected
  useEffect(() => {
    const isOperationActive = operationState.activeOperation === 'corner-fillet';
    if (activeTool === 'fillet' && selectedCornersArray.length > 0 && !isOperationActive) {
      // Compute current fillet radii from committed state BEFORE starting preview
      const currentRadii = computeCurrentFilletRadii(selectedCornersArray);
      const existingRadii = Object.values(currentRadii).filter(r => r > 0);

      // Use minimum existing radius if any corners have fillets, otherwise default to 5
      const initialRadius = existingRadii.length > 0
        ? Math.min(...existingRadii)
        : 5;

      setFilletRadius(initialRadius);
      startOperation('corner-fillet');
      updateOperationParams({ corners: selectedCornersArray, radius: initialRadius });
    }
  }, [activeTool, selectedCornersArray, operationState.activeOperation, startOperation, updateOperationParams, computeCurrentFilletRadii]);

  // Cancel fillet operation when leaving fillet mode or deselecting all corners
  useEffect(() => {
    if (operationState.activeOperation === 'corner-fillet') {
      if (activeTool !== 'fillet' || selectedCornersArray.length === 0) {
        cancelOperation();
        setFilletRadius(5);
      }
    }
  }, [activeTool, selectedCornersArray.length, operationState.activeOperation, cancelOperation]);

  // Re-apply preview when selection changes during active fillet operation
  useEffect(() => {
    const isOperationActive = operationState.activeOperation === 'corner-fillet';
    if (isOperationActive && selectedCornersArray.length > 0) {
      updateOperationParams({ corners: selectedCornersArray, radius: filletRadius });
    }
  }, [selectedCornersArray, operationState.activeOperation, filletRadius, updateOperationParams]);

  // Handle fillet radius change
  const handleFilletRadiusChange = useCallback((radius: number) => {
    if (operationState.activeOperation === 'corner-fillet') {
      setFilletRadius(radius);
      updateOperationParams({ corners: selectedCornersArray, radius });
    }
  }, [operationState.activeOperation, selectedCornersArray, updateOperationParams]);

  // Handle fillet apply
  const handleFilletApply = useCallback(() => {
    if (operationState.activeOperation === 'corner-fillet' && filletRadius > 0) {
      applyOperation();
      setFilletRadius(5);
      setActiveTool('select');
    }
  }, [operationState.activeOperation, filletRadius, applyOperation, setActiveTool]);

  // Close fillet palette
  const handleFilletPaletteClose = useCallback(() => {
    cancelOperation();
    setFilletRadius(5);
    setActiveTool('select');
  }, [cancelOperation, setActiveTool]);

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
          // Check if this is a sub-assembly face
          if (panel.source.subAssemblyId) {
            toggleSubAssemblyFace(panel.source.subAssemblyId, faceId as FaceId);
          } else {
            toggleFace(faceId as FaceId);
          }
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
  }, [selectedPanelIds, panelCollection, toggleFace, toggleSubAssemblyFace, purgeVoid, clearSelection]);

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
        isSubAssembly={selectedAssemblyId !== 'main-assembly'}
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

      {/* Inset/Outset Palette */}
      <InsetPalette
        visible={activeTool === 'inset' && panelEdgeGroups.length > 0}
        position={insetPalettePosition}
        panelEdgeGroups={panelEdgeGroups}
        offset={insetOffset}
        onEdgeToggle={handleEdgeToggle}
        onOffsetChange={handleInsetOffsetChange}
        onApply={handleInsetApply}
        onClose={handleInsetPaletteClose}
        onPositionChange={setInsetPalettePosition}
        containerRef={canvasContainerRef as React.RefObject<HTMLElement>}
        closeOnClickOutside={false}
      />

      {/* Corner Fillet Palette (All Corners - outline + holes) */}
      <FilletAllCornersPalette
        visible={activeTool === 'fillet' && panelAllCornerGroups.length > 0}
        position={filletPalettePosition}
        panelCornerGroups={panelAllCornerGroups}
        radius={filletRadius}
        maxRadius={filletAllMaxRadius}
        onCornerToggle={handleAllCornerToggle}
        onSelectAllEligible={handleSelectAllEligible}
        onClearSelection={clearAllCornerSelection}
        onRadiusChange={handleFilletRadiusChange}
        onApply={handleFilletApply}
        onClose={handleFilletPaletteClose}
        onPositionChange={setFilletPalettePosition}
        containerRef={canvasContainerRef as React.RefObject<HTMLElement>}
        closeOnClickOutside={false}
      />

      {/* Ineligibility Tooltip - shows why hovered items can't be operated on */}
      <IneligibilityTooltip message={tooltipMessage} visible={!!tooltipMessage} />

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
