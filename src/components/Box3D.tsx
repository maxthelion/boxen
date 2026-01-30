import React, { useMemo } from 'react';
import { useBoxStore, getLeafVoids, getAllSubAssemblies, isVoidVisible, isSubAssemblyVisible, computeVisuallySelectedPanelIds } from '../store/useBoxStore';
import { useEngineConfig, useEngineVoidTree, useEnginePanels, useEngineMainPanels, useEngineMainConfig, useEngineFaces } from '../engine';
import { VoidMesh } from './VoidMesh';
import { SubAssembly3D } from './SubAssembly3D';
import { PanelCollectionRenderer } from './PanelPathRenderer';
import { PanelEdgeRenderer } from './PanelEdgeRenderer';
import { PushPullArrow } from './PushPullArrow';
import { AssemblyAxisIndicator, LidFaceHighlight } from './AssemblyAxisIndicator';
import { PanelToggleOverlay } from './PanelToggleOverlay';
import { FaceId } from '../types';
import { logPushPull } from '../utils/pushPullDebug';
import * as THREE from 'three';

export interface PushPullCallbacks {
  onOffsetChange: (faceId: FaceId, offset: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

interface Box3DProps {
  pushPullCallbacks?: PushPullCallbacks;
}

export const Box3D: React.FC<Box3DProps> = ({ pushPullCallbacks }) => {
  // Model state from engine (returns preview state when preview is active)
  const config = useEngineConfig();
  const rootVoid = useEngineVoidTree();
  const panelCollection = useEnginePanels();
  const faces = useEngineFaces();

  // Main (committed) state - for arrow positioning during preview
  const mainConfig = useEngineMainConfig();
  const mainPanelCollection = useEngineMainPanels();

  // UI state and actions from store
  const { subAssemblyPreview, selectionMode, selectedPanelIds, selectedAssemblyId, selectedSubAssemblyIds, selectedVoidIds, selectPanel, selectAssembly, selectPanelEdges, toggleFace, hiddenVoidIds, isolatedVoidId, hiddenSubAssemblyIds, isolatedSubAssemblyId, hiddenFaceIds, showDebugAnchors, activeTool, operationState } = useBoxStore();

  // Compute visually selected panels (includes cascade from assembly selection)
  const allPanelIds = panelCollection?.panels.map(p => p.id) ?? [];
  const visuallySelectedPanelIds = computeVisuallySelectedPanelIds(
    { selectedPanelIds, selectedAssemblyId, selectedSubAssemblyIds },
    allPanelIds
  );

  // Get the set of visually selected face IDs
  const selectedFaceIds = useMemo(() => {
    const faceIds = new Set<FaceId>();
    for (const panelId of visuallySelectedPanelIds) {
      if (panelId.startsWith('face-')) {
        faceIds.add(panelId.replace('face-', '') as FaceId);
      }
    }
    return faceIds;
  }, [visuallySelectedPanelIds]);

  // Check if any face panels are visually selected
  const hasFacePanelsSelected = selectedFaceIds.size > 0;

  // Check if a preview is currently active
  const isPreviewActive = operationState.activeOperation !== null;

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
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(boundingBoxW, boundingBoxH, boundingBoxD)]} />
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

      {/* Panel toggle buttons - show when any face panels are visually selected or configure tool is active */}
      {(hasFacePanelsSelected || activeTool === 'configure-assembly') &&
        faces && (
          <PanelToggleOverlay
            faces={faces}
            dimensions={{ width: scaledW, height: scaledH, depth: scaledD }}
            thickness={scaledThickness}
            onToggle={toggleFace}
            visible={true}
            selectedFaceIds={activeTool === 'configure-assembly' ? undefined : selectedFaceIds}
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
            // When inset tool is active, clicking a panel selects all its eligible edges
            if (activeTool === 'inset') {
              const panel = panelCollection.panels.find(p => p.id === panelId);
              if (panel?.edgeStatuses) {
                selectPanelEdges(panelId, panel.edgeStatuses);
              }
            } else {
              selectPanel(panelId, e?.shiftKey);
            }
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

      {/* Push/Pull arrow indicator when tool is active and face panel is selected */}
      {activeTool === 'push-pull' && mainPanelCollection && pushPullCallbacks && (() => {
        // Find selected face panel - use MAIN panel collection for original position
        const selectedFaceId = Array.from(selectedPanelIds).find(id => id.startsWith('face-'));
        if (!selectedFaceId) return null;

        const faceId = selectedFaceId.replace('face-', '') as FaceId;
        const panel = mainPanelCollection.panels.find(p => p.id === selectedFaceId);
        if (!panel) return null;

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
        const previewPanel = panelCollection?.panels.find(p => p.id === selectedFaceId);
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
            {/* Wireframe outline */}
            <lineSegments>
              <edgesGeometry args={[new THREE.BoxGeometry(scaledW, scaledH, scaledD)]} />
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
