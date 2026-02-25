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
import { getSelectionBehaviorForTool, getOperationForTool, getOperation } from '../operations/registry';
import * as THREE from 'three';

export interface PushPullCallbacks {
  onOffsetChange: (faceId: FaceId, offset: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

export interface MoveGizmoCallbacks {
  onDeltaChange: (newDelta: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

export interface InsetCallbacks {
  /** Current extension offset in mm – passed to the gizmo as the drag baseline */
  offset: number;
  onOffsetChange: (newOffset: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

interface Box3DProps {
  pushPullCallbacks?: PushPullCallbacks;
  moveGizmoCallbacks?: MoveGizmoCallbacks;
  insetCallbacks?: InsetCallbacks;
}

export const Box3D: React.FC<Box3DProps> = ({ pushPullCallbacks, moveGizmoCallbacks, insetCallbacks }) => {
  // Model state from engine (returns preview state when preview is active)
  const config = useEngineConfig();
  const rootVoid = useEngineVoidTree();
  const panelCollection = useEnginePanels();
  const faces = useEngineFaces();

  // Main (committed) state - for arrow positioning during preview
  const mainConfig = useEngineMainConfig();
  const mainPanelCollection = useEngineMainPanels();

  // UI state and actions from store
  const { subAssemblyPreview, selectionMode, selectedPanelIds, selectedAssemblyId, selectedSubAssemblyIds, selectedVoidIds, selectedEdges, selectedCornerIds, selectPanel, selectAssembly, selectPanelEdges, selectPanelCorners, toggleFace, hiddenVoidIds, isolatedVoidId, hiddenSubAssemblyIds, isolatedSubAssemblyId, hiddenFaceIds, showDebugAnchors, activeTool, operationState } = useBoxStore();

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

  const scale = 100 / Math.max(width, height, depth);
  const scaledW = width * scale;
  const scaledH = height * scale;
  const scaledD = depth * scale;
  const scaledThickness = config.materialThickness * scale;

  // Original (non-preview) dimensions for bounding box and arrow positioning
  const mainScaledW = mainConfig.width * scale;
  const mainScaledH = mainConfig.height * scale;
  const mainScaledD = mainConfig.depth * scale;

  const boxCenter = { x: width / 2, y: height / 2, z: depth / 2 };

  // Get all leaf voids (selectable cells)
  const leafVoids = getLeafVoids(rootVoid);

  // Get all sub-assemblies
  const subAssemblies = getAllSubAssemblies(rootVoid);

  // Calculate the 8 box corner anchor points (inset by half material thickness)
  // This represents the center of the panel material at each corner.
  const halfMT = scaledThickness / 2;
  const anchorCorners = useMemo(() => {
    const hx = scaledW / 2 - halfMT;
    const hy = scaledH / 2 - halfMT;
    const hz = scaledD / 2 - halfMT;
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
  }, [scaledW, scaledH, scaledD, halfMT]);

  // Bounding box shows preview dimensions when previewing, otherwise main dimensions
  // Always centered at origin (no shift)
  const boundingBoxW = isPreviewActive ? scaledW : mainScaledW;
  const boundingBoxH = isPreviewActive ? scaledH : mainScaledH;
  const boundingBoxD = isPreviewActive ? scaledD : mainScaledD;

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
            dimensions={{ width: scaledW, height: scaledH, depth: scaledD }}
            visible={true}
          />
          <LidFaceHighlight
            axis={config.assembly.assemblyAxis}
            dimensions={{ width: scaledW, height: scaledH, depth: scaledD }}
            visible={true}
          />
        </>
      )}

      {/* Panel toggle buttons - show only when select tool is active and face panels are selected */}
      {activeTool === 'select' && hasFacePanelsSelected &&
        faces && (
          <PanelToggleOverlay
            faces={faces}
            dimensions={{ width: scaledW, height: scaledH, depth: scaledD }}
            thickness={scaledThickness}
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
          scale={scale}
          selectedPanelIds={selectedPanelIds}
          onPanelClick={(selectionMode === 'panel' || selectionMode === null) ? (panelId, e) => {
            const isShiftClick = e?.shiftKey ?? false;
            // Check if active tool needs selection expansion (panel → edges or corners)
            const operationId = getOperationForTool(activeTool);
            if (operationId) {
              const operation = getOperation(operationId);
              const selectionType = operation.selectionType;

              // Edge expansion (inset tool)
              if (selectionType === 'edge') {
                const behavior = getSelectionBehaviorForTool(activeTool, 'panel', selectedEdges.size);
                if (behavior === 'expand') {
                  const panel = panelCollection.panels.find(p => p.id === panelId);
                  if (panel?.edgeStatuses) {
                    selectPanelEdges(panelId, panel.edgeStatuses, isShiftClick);
                    return;
                  }
                }
              }

              // Corner expansion (fillet tool)
              if (selectionType === 'corner') {
                const behavior = getSelectionBehaviorForTool(activeTool, 'panel', selectedCornerIds.size);
                if (behavior === 'expand') {
                  const panel = panelCollection.panels.find(p => p.id === panelId);
                  if (panel?.cornerEligibility) {
                    selectPanelCorners(panelId, panel.cornerEligibility, isShiftClick);
                    return;
                  }
                }
              }
            }
            // Default panel selection behavior (or tool doesn't need expansion)
            selectPanel(panelId, isShiftClick);
          } : undefined}
          onPanelDoubleClick={selectionMode === null ? (panelId) => {
            // Look up panel to get its assembly from source
            const panel = panelCollection.panels.find(p => p.id === panelId);
            const assemblyId = panel?.source.subAssemblyId ?? 'main';
            selectAssembly(assemblyId);
          } : undefined}
          hiddenFaceIds={hiddenFaceIds}
        />
      )}

      {/* Panel edge faces for inset/outset tool */}
      <PanelEdgeRenderer scale={scale} />

      {/* Panel corner indicators for fillet tool */}
      <PanelCornerRenderer scale={scale} />

      {/* Push/Pull arrow indicator when tool is active and face panel is selected */}
      {activeTool === 'push-pull' && mainPanelCollection && pushPullCallbacks && (() => {
        // Find selected face panel - use MAIN panel collection for original position
        // Look up via source metadata since panel IDs are UUIDs
        const selectedPanel = mainPanelCollection.panels.find(p =>
          selectedPanelIds.has(p.id) && p.source.type === 'face' && p.source.faceId
        );
        if (!selectedPanel) return null;

        const faceId = selectedPanel.source.faceId!;
        const panel = selectedPanel;

        const arrowSize = Math.min(mainScaledW, mainScaledH, mainScaledD) * 0.5;

        // Position arrow at the ORIGINAL panel surface (not affected by preview offset)
        const arrowPosition: [number, number, number] = [...panel.position] as [number, number, number];
        const mt = mainConfig.materialThickness * scale;
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
            main: { w: mainScaledW, h: mainScaledH, d: mainScaledD },
            preview: { w: scaledW, h: scaledH, d: scaledD },
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

        return (
          <PushPullArrow
            faceId={faceId}
            position={arrowPosition}
            size={arrowSize}
            offset={0}  // Offset is relative to current drag, starts at 0
            scale={scale}
            onOffsetChange={(newOffset) => pushPullCallbacks.onOffsetChange(faceId, newOffset)}
            onDragStart={pushPullCallbacks.onDragStart}
            onDragEnd={pushPullCallbacks.onDragEnd}
          />
        );
      })()}

      {/* AxisGizmo for Move tool - shows when a divider panel is selected */}
      {activeTool === 'move' && mainPanelCollection && moveGizmoCallbacks && (() => {
        // Read gizmo params from operation state (set by MovePalette at operation start)
        const params = operationState.params as {
          moveDefs?: MoveDef[];
          minDelta?: number;
          maxDelta?: number;
          delta?: number;
        };
        const { moveDefs, minDelta, maxDelta, delta: paramsDelta } = params;
        if (!moveDefs?.length) return null;

        // Find the first selected divider panel for positioning
        // Use MAIN panel collection (stable during preview) for position
        const selectedPanel = mainPanelCollection.panels.find(p =>
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
        const gizmoSize = Math.min(mainScaledW, mainScaledH, mainScaledD) * 0.4;

        const handleMoveDelta = (deltaMm: number) => {
          // deltaMm is cumulative from drag start; use moveInitialDeltaRef (captured
          // at drag start) to compute absolute delta without compounding.
          const newDelta = moveInitialDeltaRef.current + deltaMm;
          const clamped = Math.max(minDelta ?? -50, Math.min(maxDelta ?? 50, newDelta));
          moveGizmoCallbacks.onDeltaChange(clamped);
        };

        const handleMoveDragStart = () => {
          moveInitialDeltaRef.current = currentDelta;
          moveGizmoCallbacks.onDragStart();
        };

        return (
          <AxisGizmo
            position={selectedPanel.position}
            axis={axisVector}
            scale={scale}
            size={gizmoSize}
            bidirectional={true}
            onDelta={handleMoveDelta}
            onDragStart={handleMoveDragStart}
            onDragEnd={moveGizmoCallbacks.onDragEnd}
          />
        );
      })()}

      {/* Axis gizmos for inset/outset tool – one per selected edge */}
      {activeTool === 'inset' && mainPanelCollection && insetCallbacks && selectedEdges.size > 0 && (() => {
        const gizmoSize = Math.min(mainScaledW, mainScaledH, mainScaledD) * 0.4;
        const gizmos: React.ReactElement[] = [];

        // Shared handlers for all inset gizmos. deltaMm from AxisGizmo is cumulative
        // from drag start, so we use insetInitialOffsetRef (captured at drag start)
        // rather than the current offset to avoid compounding across re-renders.
        const handleInsetDelta = (deltaMm: number) => {
          const newOffset = Math.round(insetInitialOffsetRef.current + deltaMm);
          insetCallbacks.onOffsetChange(newOffset);
        };

        const handleInsetDragStart = () => {
          insetInitialOffsetRef.current = insetCallbacks.offset;
          insetCallbacks.onDragStart?.();
        };

        for (const edgeKey of selectedEdges) {
          const colonIndex = edgeKey.lastIndexOf(':');
          if (colonIndex < 0) continue;
          const panelId = edgeKey.slice(0, colonIndex);
          const edge = edgeKey.slice(colonIndex + 1) as EdgePosition;

          const panel = mainPanelCollection.panels.find(p => p.id === panelId);
          if (!panel) continue;

          const halfWidth = (panel.width * scale) / 2;
          const halfHeight = (panel.height * scale) / 2;

          // Clearance so the gizmo floats slightly beyond the edge surface
          const clearance = gizmoSize * 0.25;

          // Compute local-space offset and outward normal for this edge
          let localOffset: THREE.Vector3;
          let localNormal: THREE.Vector3;
          switch (edge) {
            case 'top':
              localOffset = new THREE.Vector3(0, halfHeight + clearance, 0);
              localNormal = new THREE.Vector3(0, 1, 0);
              break;
            case 'bottom':
              localOffset = new THREE.Vector3(0, -(halfHeight + clearance), 0);
              localNormal = new THREE.Vector3(0, -1, 0);
              break;
            case 'left':
              localOffset = new THREE.Vector3(-(halfWidth + clearance), 0, 0);
              localNormal = new THREE.Vector3(-1, 0, 0);
              break;
            case 'right':
            default:
              localOffset = new THREE.Vector3(halfWidth + clearance, 0, 0);
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
              scale={scale}
              size={gizmoSize}
              bidirectional={false}
              onDelta={handleInsetDelta}
              onDragStart={handleInsetDragStart}
              onDragEnd={insetCallbacks.onDragEnd}
            />,
          );
        }

        return <>{gizmos}</>;
      })()}

      {/* Sub-assembly creation preview (wireframe box) */}
      {subAssemblyPreview && (() => {
        const { bounds } = subAssemblyPreview;
        const centerX = (bounds.x + bounds.w / 2 - boxCenter.x) * scale;
        const centerY = (bounds.y + bounds.h / 2 - boxCenter.y) * scale;
        const centerZ = (bounds.z + bounds.d / 2 - boxCenter.z) * scale;
        const scaledW = bounds.w * scale;
        const scaledH = bounds.h * scale;
        const scaledD = bounds.d * scale;

        return (
          <group position={[centerX, centerY, centerZ]}>
            {/* Wireframe outline - scale slightly to prevent z-fighting with panel surfaces */}
            <lineSegments>
              <edgesGeometry args={[new THREE.BoxGeometry(scaledW * 1.001, scaledH * 1.001, scaledD * 1.001)]} />
              <lineBasicMaterial color="#2ecc71" linewidth={2} />
            </lineSegments>
            {/* Semi-transparent fill */}
            <mesh>
              <boxGeometry args={[scaledW, scaledH, scaledD]} />
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
            bounds={{
              x: leafVoid.bounds.x * scale,
              y: leafVoid.bounds.y * scale,
              z: leafVoid.bounds.z * scale,
              w: leafVoid.bounds.w * scale,
              h: leafVoid.bounds.h * scale,
              d: leafVoid.bounds.d * scale,
            }}
            boxCenter={{
              x: boxCenter.x * scale,
              y: boxCenter.y * scale,
              z: boxCenter.z * scale,
            }}
          />
        ))}

      {/* Sub-assemblies (drawers, trays, inserts) */}
      {subAssemblies
        .filter(({ voidId, subAssembly }) =>
          isVoidVisible(voidId, rootVoid, hiddenVoidIds, isolatedVoidId) &&
          isSubAssemblyVisible(subAssembly.id, hiddenSubAssemblyIds, isolatedSubAssemblyId)
        )
        .map(({ voidId, subAssembly, bounds }) => (
          <SubAssembly3D
            key={subAssembly.id}
            subAssembly={subAssembly}
            parentBounds={bounds}
            scale={scale}
            boxCenter={boxCenter}
          />
        ))}
    </group>
  );
};
