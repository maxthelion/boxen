/**
 * PanelEdgeRenderer - Renders clickable edge faces for the inset/outset tool
 *
 * Each panel edge is rendered as a rectangular mesh (the thickness face / end cap)
 * that can be hovered and clicked to select for extension/retraction.
 */

import React, { useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { useBoxStore } from '../store/useBoxStore';
import { useEnginePanels, useEngineConfig } from '../engine';
import { PanelPath, EdgePosition, EdgeStatus, EdgeStatusInfo } from '../types';

// All edge positions in order
const ALL_EDGES: EdgePosition[] = ['top', 'bottom', 'left', 'right'];

// Colors for different edge states
const EDGE_COLORS = {
  // Base colors by status
  locked: '#6c757d',      // Gray - non-interactive
  'outward-only': '#fd7e14', // Orange - can extend outward
  unlocked: '#28a745',    // Green - full flexibility

  // Hover colors (brighter)
  lockedHover: '#868e96',
  'outward-only-hover': '#ff922b',
  unlockedHover: '#51cf66',

  // Selected colors
  selected: '#9b59b6',    // Purple
  selectedHover: '#a855f7',
};

interface EdgeMeshProps {
  edge: EdgePosition;
  status: EdgeStatus;
  isSelected: boolean;
  isHovered: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  width: number;
  height: number;
  thickness: number;
  scale: number;
  onHover: (hovered: boolean) => void;
  onClick: (event: React.MouseEvent) => void;
}

/**
 * Single edge mesh component
 */
const EdgeMesh: React.FC<EdgeMeshProps> = ({
  edge,
  status,
  isSelected,
  isHovered,
  position,
  rotation,
  width,
  height,
  thickness,
  scale,
  onHover,
  onClick,
}) => {
  // Determine color based on state
  const color = useMemo(() => {
    if (isSelected) {
      return isHovered ? EDGE_COLORS.selectedHover : EDGE_COLORS.selected;
    }
    if (status === 'locked') {
      return isHovered ? EDGE_COLORS.lockedHover : EDGE_COLORS.locked;
    }
    if (status === 'outward-only') {
      return isHovered ? EDGE_COLORS['outward-only-hover'] : EDGE_COLORS['outward-only'];
    }
    return isHovered ? EDGE_COLORS.unlockedHover : EDGE_COLORS.unlocked;
  }, [status, isSelected, isHovered]);

  // Opacity: locked edges are dimmer
  const opacity = status === 'locked' ? 0.3 : isSelected ? 0.9 : isHovered ? 0.8 : 0.6;

  // Create geometry for the edge face
  // The edge face is a rectangle with dimensions based on edge position:
  // - Top/bottom edges: width × thickness
  // - Left/right edges: thickness × height
  const geometry = useMemo(() => {
    let edgeWidth: number;
    let edgeHeight: number;

    if (edge === 'top' || edge === 'bottom') {
      edgeWidth = width * scale;
      edgeHeight = thickness * scale;
    } else {
      edgeWidth = thickness * scale;
      edgeHeight = height * scale;
    }

    return new THREE.PlaneGeometry(edgeWidth, edgeHeight);
  }, [edge, width, height, thickness, scale]);

  // Calculate edge position and rotation using proper 3D transforms
  // The edge offset must be in panel-local space, then transformed to world space
  const { edgePosition, edgeRotation } = useMemo(() => {
    const [px, py, pz] = position;
    const halfWidth = (width * scale) / 2;
    const halfHeight = (height * scale) / 2;
    // Small offset to prevent z-fighting with panel edge cap surfaces
    const edgeOffset = 0.05;

    // Create panel's rotation as Euler, then convert to quaternion for transforms
    const panelEuler = new THREE.Euler(rotation[0], rotation[1], rotation[2], 'XYZ');
    const panelQuat = new THREE.Quaternion().setFromEuler(panelEuler);

    // Calculate local offset from panel center to edge center
    // In panel-local space: X = width direction, Y = height direction, Z = thickness (normal)
    // Edge indicators are offset slightly outward from the panel edge caps to avoid z-fighting
    let localOffset: THREE.Vector3;
    let localEdgeRotation: THREE.Euler;

    switch (edge) {
      case 'top':
        // Top edge: slightly above the edge cap surface
        localOffset = new THREE.Vector3(0, halfHeight + edgeOffset, 0);
        localEdgeRotation = new THREE.Euler(Math.PI / 2, 0, 0);
        break;
      case 'bottom':
        // Bottom edge: slightly below the edge cap surface
        localOffset = new THREE.Vector3(0, -halfHeight - edgeOffset, 0);
        localEdgeRotation = new THREE.Euler(-Math.PI / 2, 0, 0);
        break;
      case 'left':
        // Left edge: slightly outside the edge cap surface
        localOffset = new THREE.Vector3(-halfWidth - edgeOffset, 0, 0);
        localEdgeRotation = new THREE.Euler(0, -Math.PI / 2, 0);
        break;
      case 'right':
        // Right edge: slightly outside the edge cap surface
        localOffset = new THREE.Vector3(halfWidth + edgeOffset, 0, 0);
        localEdgeRotation = new THREE.Euler(0, Math.PI / 2, 0);
        break;
    }

    // Transform local offset to world space
    const worldOffset = localOffset.applyQuaternion(panelQuat);
    const worldPosition: [number, number, number] = [
      px + worldOffset.x,
      py + worldOffset.y,
      pz + worldOffset.z,
    ];

    // Combine panel rotation with edge-local rotation
    const edgeQuat = new THREE.Quaternion().setFromEuler(localEdgeRotation);
    const combinedQuat = panelQuat.clone().multiply(edgeQuat);
    const combinedEuler = new THREE.Euler().setFromQuaternion(combinedQuat, 'XYZ');
    const worldRotation: [number, number, number] = [
      combinedEuler.x,
      combinedEuler.y,
      combinedEuler.z,
    ];

    return { edgePosition: worldPosition, edgeRotation: worldRotation };
  }, [edge, position, rotation, width, height, thickness, scale]);

  const handleClick = useCallback((e: any) => {
    e.stopPropagation?.();
    if (status !== 'locked') {
      onClick(e.nativeEvent || e);
    }
  }, [status, onClick]);

  const handlePointerOver = useCallback((e: any) => {
    e.stopPropagation?.();
    onHover(true);
    if (status !== 'locked') {
      document.body.style.cursor = 'pointer';
    }
  }, [status, onHover]);

  const handlePointerOut = useCallback(() => {
    onHover(false);
    document.body.style.cursor = 'auto';
  }, [onHover]);

  return (
    <mesh
      geometry={geometry}
      position={edgePosition}
      rotation={edgeRotation}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <meshStandardMaterial
        color={color}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
};

interface PanelEdgeRendererProps {
  scale: number;
}

/**
 * Renders edge faces for all panels when the inset tool is active
 */
export const PanelEdgeRenderer: React.FC<PanelEdgeRendererProps> = ({ scale }) => {
  const panelCollection = useEnginePanels();
  const config = useEngineConfig();

  const activeTool = useBoxStore((state) => state.activeTool);
  const selectedEdges = useBoxStore((state) => state.selectedEdges);
  const hoveredEdge = useBoxStore((state) => state.hoveredEdge);
  const selectEdge = useBoxStore((state) => state.selectEdge);
  const setHoveredEdge = useBoxStore((state) => state.setHoveredEdge);
  const operationState = useBoxStore((state) => state.operationState);

  // Hooks must be called before any early returns
  const handleEdgeClick = useCallback((panelId: string, edge: EdgePosition, event: React.MouseEvent) => {
    // During an active operation, only shift+click modifies selection
    // Regular clicks pass through to camera controls
    const isOperationActive = operationState.activeOperation !== null;
    if (isOperationActive && !event.shiftKey) {
      return; // Let camera controls handle this click
    }

    // Use additive mode (toggle) when shift is held
    const additive = event.shiftKey;
    selectEdge(panelId, edge, additive);
  }, [selectEdge, operationState.activeOperation]);

  const handleEdgeHover = useCallback((panelId: string, edge: EdgePosition, hovered: boolean) => {
    if (hovered) {
      setHoveredEdge(panelId, edge);
    } else {
      setHoveredEdge(null, null);
    }
  }, [setHoveredEdge]);

  // Only render when inset tool is active
  if (activeTool !== 'inset' || !panelCollection || !config) {
    return null;
  }

  return (
    <>
      {panelCollection.panels.map((panel: PanelPath) => {
        if (!panel.visible) return null;

        // Get edge statuses from the panel (computed by engine)
        const edgeStatuses = panel.edgeStatuses ?? getDefaultEdgeStatuses();

        return ALL_EDGES.map((edge) => {
          const statusInfo = edgeStatuses.find(s => s.position === edge);
          const status = statusInfo?.status ?? 'unlocked';
          const edgeKey = `${panel.id}:${edge}`;
          const isSelected = selectedEdges.has(edgeKey);
          const isHovered = hoveredEdge === edgeKey;

          return (
            <EdgeMesh
              key={edgeKey}
              edge={edge}
              status={status}
              isSelected={isSelected}
              isHovered={isHovered}
              position={panel.position}
              rotation={panel.rotation}
              width={panel.width}
              height={panel.height}
              thickness={panel.thickness}
              scale={scale}
              onHover={(hovered) => handleEdgeHover(panel.id, edge, hovered)}
              onClick={(event) => handleEdgeClick(panel.id, edge, event)}
            />
          );
        });
      })}
    </>
  );
};

/**
 * Default edge statuses (all unlocked) for panels without computed statuses
 */
function getDefaultEdgeStatuses(): EdgeStatusInfo[] {
  return ALL_EDGES.map((position): EdgeStatusInfo => ({
    position,
    status: 'unlocked',
    adjacentFaceId: undefined,
  }));
}
