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

  // Calculate edge position offset from panel center
  const edgePosition = useMemo((): [number, number, number] => {
    const [px, py, pz] = position;
    const halfWidth = (width * scale) / 2;
    const halfHeight = (height * scale) / 2;

    // Edge faces are positioned at the edge of the panel
    switch (edge) {
      case 'top':
        return [px, py + halfHeight, pz];
      case 'bottom':
        return [px, py - halfHeight, pz];
      case 'left':
        return [px - halfWidth, py, pz];
      case 'right':
        return [px + halfWidth, py, pz];
    }
  }, [edge, position, width, height, scale]);

  // Calculate edge rotation
  // The edge face needs to be rotated to face outward from the panel edge
  const edgeRotation = useMemo((): [number, number, number] => {
    const [rx, ry, rz] = rotation;

    // Apply additional rotation based on which edge this is
    // The base rotation is the panel's rotation, then we rotate the edge face
    // to be perpendicular to the panel and face outward
    switch (edge) {
      case 'top':
        // Rotate 90° around X to face up, but aligned with panel thickness
        return [rx + Math.PI / 2, ry, rz];
      case 'bottom':
        // Rotate -90° around X to face down
        return [rx - Math.PI / 2, ry, rz];
      case 'left':
        // Rotate 90° around Y to face left
        return [rx, ry - Math.PI / 2, rz];
      case 'right':
        // Rotate -90° around Y to face right
        return [rx, ry + Math.PI / 2, rz];
    }
  }, [edge, rotation]);

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

  // Only render when inset tool is active
  if (activeTool !== 'inset' || !panelCollection || !config) {
    return null;
  }

  const handleEdgeClick = useCallback((panelId: string, edge: EdgePosition, event: React.MouseEvent) => {
    const shiftKey = event.shiftKey;
    selectEdge(panelId, edge, shiftKey);
  }, [selectEdge]);

  const handleEdgeHover = useCallback((panelId: string, edge: EdgePosition, hovered: boolean) => {
    if (hovered) {
      setHoveredEdge(panelId, edge);
    } else {
      setHoveredEdge(null, null);
    }
  }, [setHoveredEdge]);

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
