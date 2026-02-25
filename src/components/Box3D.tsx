import React, { useMemo, useRef } from 'react';
import { useBoxStore, getLeafVoids, getAllSubAssemblies, isVoidVisible, isSubAssemblyVisible, computeVisuallySelectedPanelIds } from '../store/useBoxStore';
import { useEngineConfig, useEngineVoidTree, useEnginePanels, useEngineMainPanels, useEngineMainConfig, useEngineFaces } from '../engine';
import { VoidMesh } from './VoidMesh';
import { SubAssembly3D } from './SubAssembly3D';
import { PanelCollectionRenderer } from './PanelPathRenderer';
import { PanelEdgeRenderer } from './PanelEdgeRenderer';
import { PanelCornerRenderer } from './PanelCornerRenderer';
import { PushPullArrow } from './PushPullArrow';
import { AxisGizmo } from './AxisGizmo';
import { AssemblyAxisIndicator, LidFaceHighlight } from './AssemblyAxisIndicator';
import { PanelToggleOverlay } from './PanelToggleOverlay';
import { FaceId, EdgePosition } from '../types';
import { MoveDef } from './MovePalette';
import { logPushPull } from '../utils/pushPullDebug';
import * as THREE from 'three';

export const Box3D: React.FC = () => {
  // Model state from engine (returns preview state when preview is active)
  const config = useEngineConfig();
  const rootVoid = useEngineVoidTree();
  const panelCollection = useEnginePanels();
  const faces = useEngineFaces();

  // Main (committed) state - for arrow positioning during preview
  const mainConfig = useEngineMainConfig();
  const mainPanelCollection = useEngineMainPanels();

  // UI state and actions from store
  const { subAssemblyPreview, selectedPanelIds, selectedAssemblyId, selectedSubAssemblyIds, selectedEdges, hiddenVoidIds, isolatedVoidId, hiddenSubAssemblyIds, isolatedSubAssemblyId, hiddenFaceIds, showDebugAnchors, activeTool, operationState, updateOperationParams, toggleFace } = useBoxStore();

  // Compute visually selected panels (includes cascade from assembly selection)
  const allPanels = panelCollection?.panels ?? [];
  const visuallySelectedPanelIds = computeVisuallySelectedPanelIds(
    { selectedPanelIds, selectedAssemblyId, selectedSubAssemblyIds },
    allPanels
  );

  // Get the set of visually selected face IDs by looking up panel source metadata
  const selectedFaceIds = useMemo(() => {
    const faceIds = new Set<FaceId>();
    for (const panelId of visuallySelectedPanelIds) {
      const panel = allPanels.find(p => p.id === panelId);
      if (panel?.source.type === 'face' && panel.source.faceId) {
        faceIds.add(panel.source.faceId);
      }
    }
    return faceIds;
  }, [visuallySelectedPanelIds, allPanels]);

  // Check if any face panels are visually selected
  const hasFacePanelsSelected = selectedFaceIds.size > 0;

  // Check if a preview is currently active
  const isPreviewActive = operationState.activeOperation !== null;

  // Refs that capture initial values at drag start for move and inset gizmos.
  // AxisGizmo reports cumulative delta from drag start, so consumers must use
  // initialValue + deltaMm rather than currentValue + deltaMm to avoid
  // exponential compounding across re-renders during a drag.
  const moveInitialDeltaRef = useRef<number>(0);
  const insetInitialOffsetRef = useRef<number>(0);

  // Early return if engine not initialized
  if (!config || !rootVoid || !mainConfig) return null;

  const { width, height, depth } = config;
  const materialThickness = config.materialThickness;

  // 1 Three.js world unit = 1mm — no normalization scale factor
  const boxCenter = { x: width / 2, y: height / 2, z: depth / 2 };

  // Get all leaf voids (selectable cells)
  const leafVoids = getLeafVoids(rootVoid);

  // Get all sub-assemblies
  const subAssemblies = getAllSubAssemblies(rootVoid);

  // Calculate the 8 box corner anchor points (inset by half material thickness)
  // This represents the center of the panel material at each corner.
  const halfMT = materialThickness / 2;
  const anchorCorners = useMemo(() => {
    const hx = width / 2 - halfMT;
    const hy = height / 2 - halfMT;
    const hz = depth / 2 - halfMT;
    return [
      { x: -hx, y: -hy, z: -hz },
      { x: hx, y: -hy, z: -hz },
      { x: -hx, y: hy, z: -hz },
      { x: hx, y: hy, z: -hz },
      { x: -hx, y: -hy, z: hz },
      { x: hx, y: -hy, z: hz },
      { x: -hx, y: hy, z: hz },
      { x: hx, y: hy, z: hz },
    ];
  }, [width, height, depth, halfMT]);

  // Bounding box shows preview dimensions when previewing, otherwise main dimensions
  // Always centered at origin (no shift)
  const boundingBoxW = isPreviewActive ? width : mainConfig.width;
  const boundingBoxH = isPreviewActive ? height : mainConfig.height;
  const boundingBoxD = isPreviewActive ? depth : mainConfig.depth;

  return (
    <group>
      {/* Wireframe box outline - shows current assembly dimensions */}
      {/* Scale slightly larger than panels (1.001x) to prevent z-fighting with coplanar panel surfaces */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(boundingBoxW * 1.001, boundingBoxH * 1.001, boundingBoxD * 1.001)]} />
        <lineBasicMaterial color={isPreviewActive ? '#ffcc00' : '#ff0000'} linewidth={2} />
      </lineSegments>

      {/* Assembly axis indicator - shows when main assembly is selected or configure tool is active */}
      {(selectedAssemblyId === 'main' || activeTool === 'configure-assembly') && config.assembly?.assemblyAxis && (
        <>
          <AssemblyAxisIndicator
            axis={config.assembly.assemblyAxis}
            dimensions={{ width, height, depth }}
            visible={true}
          />
          <LidFaceHighlight
            axis={config.assembly.assemblyAxis}
            dimensions={{ width, height, depth }}
            visible={true}
          />
        </>
      )}

      {/* Panel toggle buttons - show only when select tool is active and face panels are selected */}
      {activeTool === 'select' && hasFacePanelsSelected &&
        faces && (
          <PanelToggleOverlay
            faces={faces}
            dimensions={{ width, height, depth }}
            thickness={materialThickness}
            onToggle={toggleFace}
            visible={true}
            selectedFaceIds={selectedFaceIds}
          />
        )}

      {/* Debug anchor spheres at box corners (inset by half material thickness) */}
      {showDebugAnchors && anchorCorners.map((corner, idx) => (
        <mesh key={`anchor-${idx}`} position={[corner.x, corner.y, corner.z]}>
          <sphereGeometry args={[2, 16, 16]} />
          <meshStandardMaterial color="#ff6600" />
        </mesh>
      ))}

      {/* Render panels from engine-generated paths */}
      {panelCollection && (
        <PanelCollectionRenderer
          scale={1}
          selectedPanelIds={selectedPanelIds}
          hiddenFaceIds={hiddenFaceIds}
        />
      )}

      {/* Panel edge faces for inset/outset tool */}
      <PanelEdgeRenderer scale={1} />

      {/* Panel corner indicators for fillet tool */}
      <PanelCornerRenderer scale={1} />

      {/* Push/Pull arrow indicator when tool is active and face panel is selected */}
      {activeTool === 'push-pull' && mainPanelCollection && (() => {
        // Find selected face panel - use MAIN panel collection for original position
        // Look up via source metadata since panel IDs are UUIDs
        const selectedPanel = mainPanelCollection.panels.find(p =>
          selectedPanelIds.has(p.id) && p.source.type === 'face' && p.source.faceId
        );
        if (!selectedPanel) return null;

        const faceId = selectedPanel.source.faceId!;
        const panel = selectedPanel;

        const arrowSize = Math.min(mainConfig.width, mainConfig.height, mainConfig.depth) * 0.5;

        // Position arrow at the current (preview) panel surface so it tracks the drag
        const arrowPosition: [number, number, number] = [...panel.position] as [number, number, number];
        const mt = mainConfig.materialThickness;
        switch (faceId) {
          case 'front': arrowPosition[2] += mt / 2; break;
          case 'back': arrowPosition[2] -= mt / 2; break;
          case 'left': arrowPosition[0] -= mt / 2; break;
          case 'right': arrowPosition[0] += mt / 2; break;
          case 'top': arrowPosition[1] += mt / 2; break;
          case 'bottom': arrowPosition[1] -= mt / 2; break;
        }

        // Log arrow position calculation
        const previewPanel = panelCollection?.panels.find(p => p.id === panel.id);
        logPushPull({
          action: 'Box3D - arrow position calculated',
          faceId,
          arrowPosition,
          panelPosition: {
            mainPanel: panel.position as [number, number, number],
            previewPanel: previewPanel?.position as [number, number, number],
          },
          scaledDimensions: {
            main: { w: mainConfig.width, h: mainConfig.height, d: mainConfig.depth },
            preview: { w: width, h: height, d: depth },
          },
          previewState: {
            hasPreview: isPreviewActive,
            type: operationState.activeOperation ?? undefined,
            configDimensions: isPreviewActive && config ? {
              width: config.width,
              height: config.height,
              depth: config.depth,
            } : undefined,
          },
        });

        // onOffsetChange updates the operation params directly (no parent callback needed)
        const currentMode = (operationState.params as any)?.mode ?? 'scale';
        const currentAssemblyId = (operationState.params as any)?.assemblyId ?? 'main-assembly';

        return (
          <PushPullArrow
            faceId={faceId}
            position={arrowPosition}
            size={arrowSize}
            offset={0}  // Offset is relative to current drag, starts at 0
            scale={1}
            onOffsetChange={(newOffset) => {
              updateOperationParams({ faceId, offset: newOffset, mode: currentMode, assemblyId: currentAssemblyId });
            }}
          />
        );
      })()}

      {/* AxisGizmo for Move tool - shows when a divider panel is selected */}
      {activeTool === 'move' && mainPanelCollection && (() => {
        // Read gizmo params from operation state (set by MovePalette at operation start)
        const params = operationState.params as {
          moveDefs?: MoveDef[];
          minDelta?: number;
          maxDelta?: number;
          delta?: number;
        };
        const { moveDefs, delta: paramsDelta } = params;
        if (!moveDefs?.length) return null;

        // Find the first selected divider panel for positioning
        // Use PREVIEW panel collection so the gizmo follows the divider during drag
        const selectedPanel = panelCollection?.panels.find(p =>
          selectedPanelIds.has(p.id) && p.source.type === 'divider'
        );
        if (!selectedPanel) return null;

        const axis = selectedPanel.source.axis;
        if (!axis || (axis !== 'x' && axis !== 'y' && axis !== 'z')) return null;

        // Map axis string to world-space unit vector
        const axisVectors: Record<'x' | 'y' | 'z', THREE.Vector3> = {
          x: new THREE.Vector3(1, 0, 0),
          y: new THREE.Vector3(0, 1, 0),
          z: new THREE.Vector3(0, 0, 1),
        };
        const axisVector = axisVectors[axis];

        const currentDelta = paramsDelta ?? 0;
        const gizmoSize = Math.min(mainConfig.width, mainConfig.height, mainConfig.depth) * 0.4;

        const handleMoveDelta = (deltaMm: number) => {
          // Read current params from the store to get moveDefs and bounds.
          // deltaMm is cumulative from drag start; use moveInitialDeltaRef (captured
          // at drag start) to compute absolute delta without compounding.
          const currentState = useBoxStore.getState();
          const currentParams = currentState.operationState.params as {
            moveDefs?: MoveDef[];
            minDelta?: number;
            maxDelta?: number;
          };
          const { moveDefs: currentMoveDefs, minDelta: currentMin = -50, maxDelta: currentMax = 50 } = currentParams;
          if (!currentMoveDefs?.length) return;

          const newDelta = moveInitialDeltaRef.current + deltaMm;
          const clamped = Math.max(currentMin, Math.min(currentMax, newDelta));

          // Build moves array for the engine preview action
          const moves = currentMoveDefs.map((m: MoveDef) => ({
            subdivisionId: m.subdivisionId,
            newPosition: m.currentPosition + clamped,
            isGridDivider: m.isGridDivider,
            gridPositionIndex: m.gridPositionIndex,
            parentVoidId: m.parentVoidId,
            axis: m.axis,
          }));

          updateOperationParams({ moves, delta: clamped });
        };

        const handleMoveDragStart = () => {
          moveInitialDeltaRef.current = currentDelta;
        };

        return (
          <AxisGizmo
            position={selectedPanel.position}
            axis={axisVector}
            size={gizmoSize}
            bidirectional={true}
            onDelta={handleMoveDelta}
            onDragStart={handleMoveDragStart}
          />
        );
      })()}

      {/* Axis gizmos for inset/outset tool – one per selected edge */}
      {activeTool === 'inset' && mainPanelCollection && selectedEdges.size > 0 && (() => {
        const gizmoSize = Math.min(mainConfig.width, mainConfig.height, mainConfig.depth) * 0.4;
        const gizmos: React.ReactElement[] = [];

        // Shared handlers for all inset gizmos. deltaMm from AxisGizmo is cumulative
        // from drag start, so we use insetInitialOffsetRef (captured at drag start)
        // rather than the current offset to avoid compounding across re-renders.
        // Read params from store at callback time (feature branch inline-store pattern).
        const handleInsetDelta = (deltaMm: number) => {
          const insetParams = useBoxStore.getState().operationState.params as any;
          const edges: string[] = insetParams?.edges ?? [];
          const baseExtensions: Record<string, number> = insetParams?.baseExtensions ?? {};
          const newOffset = Math.round(insetInitialOffsetRef.current + deltaMm);
          updateOperationParams({ edges, offset: newOffset, baseExtensions });
        };

        const handleInsetDragStart = () => {
          const insetParams = useBoxStore.getState().operationState.params as any;
          insetInitialOffsetRef.current = insetParams?.offset ?? 0;
        };

        for (const edgeKey of selectedEdges) {
          const colonIndex = edgeKey.lastIndexOf(':');
          if (colonIndex < 0) continue;
          const panelId = edgeKey.slice(0, colonIndex);
          const edge = edgeKey.slice(colonIndex + 1) as EdgePosition;

          const panel = panelCollection?.panels.find(p => p.id === panelId);
          if (!panel) continue;

          const halfWidth = panel.width / 2;
          const halfHeight = panel.height / 2;

          // Clearance so the gizmo floats slightly beyond the edge surface
          const clearance = gizmoSize * 0.25;

          // Read current inset offset from operation params (needed for gizmo position)
          const insetParams = operationState.params as any;
          const currentOffset: number = insetParams?.offset ?? 0;

          // Compute local-space offset and outward normal for this edge
          // Include currentOffset (in mm, which equals world units) so the gizmo
          // follows the preview edge during drag
          let localOffset: THREE.Vector3;
          let localNormal: THREE.Vector3;
          switch (edge) {
            case 'top':
              localOffset = new THREE.Vector3(0, halfHeight + clearance + currentOffset, 0);
              localNormal = new THREE.Vector3(0, 1, 0);
              break;
            case 'bottom':
              localOffset = new THREE.Vector3(0, -(halfHeight + clearance + currentOffset), 0);
              localNormal = new THREE.Vector3(0, -1, 0);
              break;
            case 'left':
              localOffset = new THREE.Vector3(-(halfWidth + clearance + currentOffset), 0, 0);
              localNormal = new THREE.Vector3(-1, 0, 0);
              break;
            case 'right':
            default:
              localOffset = new THREE.Vector3(halfWidth + clearance + currentOffset, 0, 0);
              localNormal = new THREE.Vector3(1, 0, 0);
              break;
          }

          // Transform local offset and normal to world space using panel rotation
          const panelEuler = new THREE.Euler(panel.rotation[0], panel.rotation[1], panel.rotation[2], 'XYZ');
          const panelQuat = new THREE.Quaternion().setFromEuler(panelEuler);

          const worldOffset = localOffset.clone().applyQuaternion(panelQuat);
          const gizmoPosition: [number, number, number] = [
            panel.position[0] + worldOffset.x,
            panel.position[1] + worldOffset.y,
            panel.position[2] + worldOffset.z,
          ];

          const worldNormal = localNormal.clone().applyQuaternion(panelQuat);

          gizmos.push(
            <AxisGizmo
              key={edgeKey}
              position={gizmoPosition}
              axis={worldNormal}
              size={gizmoSize}
              bidirectional={false}
              onDelta={handleInsetDelta}
              onDragStart={handleInsetDragStart}
            />,
          );
        }

        return <>{gizmos}</>;
      })()}

      {/* Sub-assembly creation preview (wireframe box) */}
      {subAssemblyPreview && (() => {
        const { bounds } = subAssemblyPreview;
        const centerX = bounds.x + bounds.w / 2 - boxCenter.x;
        const centerY = bounds.y + bounds.h / 2 - boxCenter.y;
        const centerZ = bounds.z + bounds.d / 2 - boxCenter.z;
        const previewW = bounds.w;
        const previewH = bounds.h;
        const previewD = bounds.d;

        return (
          <group position={[centerX, centerY, centerZ]}>
            {/* Wireframe outline - scale slightly to prevent z-fighting with panel surfaces */}
            <lineSegments>
              <edgesGeometry args={[new THREE.BoxGeometry(previewW * 1.001, previewH * 1.001, previewD * 1.001)]} />
              <lineBasicMaterial color="#2ecc71" linewidth={2} />
            </lineSegments>
            {/* Semi-transparent fill */}
            <mesh>
              <boxGeometry args={[previewW, previewH, previewD]} />
              <meshStandardMaterial
                color="#2ecc71"
                transparent
                opacity={0.15}
                depthWrite={false}
              />
            </mesh>
          </group>
        );
      })()}

      {/* Void cells (leaf voids are selectable) - filtered by visibility */}
      {leafVoids
        .filter((leafVoid) => isVoidVisible(leafVoid.id, rootVoid, hiddenVoidIds, isolatedVoidId))
        .map((leafVoid) => (
          <VoidMesh
            key={leafVoid.id}
            voidId={leafVoid.id}
            bounds={leafVoid.bounds}
            boxCenter={boxCenter}
          />
        ))}

      {/* Sub-assemblies (drawers, trays, inserts) */}
      {subAssemblies
        .filter(({ voidId, subAssembly }) =>
          isVoidVisible(voidId, rootVoid, hiddenVoidIds, isolatedVoidId) &&
          isSubAssemblyVisible(subAssembly.id, hiddenSubAssemblyIds, isolatedSubAssemblyId)
        )
        .map(({ subAssembly, bounds }) => (
          <SubAssembly3D
            key={subAssembly.id}
            subAssembly={subAssembly}
            parentBounds={bounds}
            scale={1}
            boxCenter={boxCenter}
          />
        ))}
    </group>
  );
};
