/**
 * InteractionController - Canvas-level pointer event handler
 *
 * Renders nothing. Attaches DOM event listeners to the R3F canvas element and
 * routes all pointer events through the InteractionManager. Meshes are passive
 * targets; all interaction interpretation happens here.
 *
 * Usage: render <InteractionController onCameraEnabledChange={...} /> inside Canvas.
 */

import React, { useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  InteractionManager,
  raycastScene,
  resolveAction,
  unprojectPointerToPlane,
  type InteractionMode,
  type InteractionTarget,
} from '../interaction/InteractionManager';
import { useBoxStore } from '../store/useBoxStore';
import { useEnginePanels, useEngineConfig } from '../engine';
import type { EdgePosition } from '../types';

interface InteractionControllerProps {
  onCameraEnabledChange: (enabled: boolean) => void;
}

export const InteractionController: React.FC<InteractionControllerProps> = ({
  onCameraEnabledChange,
}) => {
  const { camera, scene, gl } = useThree();
  const managerRef = useRef(new InteractionManager());

  // Store state for mode derivation
  const activeTool = useBoxStore((s) => s.activeTool);
  const operationState = useBoxStore((s) => s.operationState);
  const selectionMode = useBoxStore((s) => s.selectionMode);

  // Engine state for panel lookup
  const panelCollection = useEnginePanels();
  const engineConfig = useEngineConfig();

  // Refs for stable event-handler closures (avoids stale captures)
  const modeRef = useRef<InteractionMode>({ type: 'select', target: 'panel' });
  const panelCollectionRef = useRef(panelCollection);
  const scaleRef = useRef(1);
  const cameraRef = useRef(camera);
  const sceneRef = useRef(scene);

  // Double-click detection
  const lastClickRef = useRef({ time: 0, panelId: '' });

  // Derive interaction mode from activeTool / operationState / selectionMode
  const derivedMode = useMemo((): InteractionMode => {
    if (operationState.activeOperation !== null) {
      return { type: 'operate', operation: operationState.activeOperation };
    }
    if (selectionMode === 'void') {
      return { type: 'select', target: 'void' };
    }
    if (activeTool === 'inset') {
      return { type: 'select', target: 'edge' };
    }
    if (activeTool === 'fillet') {
      return { type: 'select', target: 'corner' };
    }
    return { type: 'select', target: 'panel' };
  }, [activeTool, operationState.activeOperation, selectionMode]);

  // Keep refs in sync with reactive state.
  // useLayoutEffect ensures modeRef is updated before the browser paints,
  // so clicks on newly-visible gizmos always see the correct mode ('operate').
  useLayoutEffect(() => { modeRef.current = derivedMode; }, [derivedMode]);
  useEffect(() => { panelCollectionRef.current = panelCollection; }, [panelCollection]);
  useEffect(() => { cameraRef.current = camera; }, [camera]);
  useEffect(() => { sceneRef.current = scene; }, [scene]);
  useEffect(() => {
    if (engineConfig) {
      const { width, height, depth } = engineConfig;
      scaleRef.current = 100 / Math.max(width, height, depth);
    }
  }, [engineConfig]);

  // Attach DOM event listeners (once, to avoid stale closures use refs for all state)
  useEffect(() => {
    const canvas = gl.domElement;
    const manager = managerRef.current;

    /** Convert DOM pointer coordinates to NDC (-1..1) */
    const getNDC = (e: PointerEvent): THREE.Vector2 => {
      const rect = canvas.getBoundingClientRect();
      return new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
    };

    /**
     * Dispatch a resolved action to the store.
     * Panel→edge and panel→corner expansions are handled before this call.
     */
    const dispatchResolved = (
      action: ReturnType<typeof resolveAction>,
      hit: InteractionTarget | null,
      ndc: THREE.Vector2,
    ) => {
      const store = useBoxStore.getState();
      const panels = panelCollectionRef.current?.panels;

      switch (action.type) {
        case 'select-panel':
          store.selectPanel(action.panelId, action.additive);
          break;

        case 'select-void':
          store.selectVoid(action.voidId, action.additive);
          break;

        case 'select-edge':
          store.selectEdge(action.panelId, action.edge as EdgePosition, action.additive);
          break;

        case 'select-corner': {
          store.selectAllCorner(action.panelId, action.cornerId as any, action.additive);
          break;
        }

        case 'select-assembly': {
          // resolveAction passes panelId as assemblyId — resolve via panel source
          const panel = panels?.find((p) => p.id === action.assemblyId);
          const assemblyId = panel?.source.subAssemblyId ?? 'main';
          store.selectAssembly(assemblyId);
          break;
        }

        case 'clear-selection':
          store.clearSelection();
          break;

        case 'start-drag': {
          if (hit?.type !== 'gizmo') break;
          const gizmoWorldPos = hit.worldPos ?? new THREE.Vector3(0, 0, 0);
          const startWorldPos = unprojectPointerToPlane(ndc, gizmoWorldPos, cameraRef.current);
          if (!startWorldPos) break;
          manager.startDrag(
            action.gizmoId,
            action.axis,
            startWorldPos,
            {
              onDelta: hit.onDelta,
              onDragStart: hit.onDragStart,
              onDragEnd: hit.onDragEnd,
            },
            gizmoWorldPos,
          );
          onCameraEnabledChange(false);
          break;
        }

        // noop, continue-drag, camera, cancel-operation — no store update needed
        default:
          break;
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // Left button only

      const ndc = getNDC(e);
      const camera = cameraRef.current;
      const scene = sceneRef.current;
      const hit = raycastScene(ndc, camera, scene);

      // Double-click detection
      const now = Date.now();
      const hitPanelId = hit?.type === 'panel' ? hit.panelId : '';
      const isDoubleClick =
        now - lastClickRef.current.time < 300 &&
        hitPanelId !== '' &&
        lastClickRef.current.panelId === hitPanelId;
      lastClickRef.current = { time: now, panelId: hitPanelId };

      const mode = modeRef.current;

      // Tool-specific expansion: panel → edges or panel → corners
      // This runs BEFORE resolveAction because resolveAction would fall through to 'camera'
      if (hit?.type === 'panel' && mode.type === 'select') {
        const selectMode = mode as { type: 'select'; target: string };

        if (selectMode.target === 'edge') {
          const panel = panelCollectionRef.current?.panels.find((p) => p.id === hit.panelId);
          if (panel?.edgeStatuses) {
            useBoxStore.getState().selectPanelEdges(hit.panelId, panel.edgeStatuses, e.shiftKey);
            return;
          }
        }

        if (selectMode.target === 'corner') {
          const panel = panelCollectionRef.current?.panels.find((p) => p.id === hit.panelId);
          if (panel?.allCornerEligibility) {
            useBoxStore.getState().selectPanelAllCorners(
              hit.panelId,
              panel.allCornerEligibility,
              e.shiftKey,
            );
            return;
          }
        }
      }

      const action = resolveAction({
        mode,
        hit,
        isDragging: manager.isDragging,
        shiftKey: e.shiftKey,
        pointerPos: ndc,
        isDoubleClick,
      });

      dispatchResolved(action, hit, ndc);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!manager.isDragging || !manager.activeDrag) return;

      const ndc = getNDC(e);
      const gizmoWorldPos = manager.activeDrag.gizmoWorldPos;
      const worldPos = unprojectPointerToPlane(ndc, gizmoWorldPos, cameraRef.current);
      if (!worldPos) return;

      manager.continueDrag(worldPos, scaleRef.current);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (manager.isDragging) {
        manager.endDrag();
        onCameraEnabledChange(true);
      }
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
    };
  }, [gl, onCameraEnabledChange]); // Only re-setup when gl changes; all state via refs

  return null;
};
