/**
 * PanelCornerRenderer - Renders clickable corner indicators for the fillet tool
 *
 * Each panel corner is rendered as a small circle (disc) on the panel face
 * that can be hovered and clicked to select for filleting.
 */

import React, { useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { useBoxStore } from '../store/useBoxStore';
import { useEnginePanels, useEngineConfig } from '../engine';
import { PanelPath } from '../types';
import { CornerKey, CornerEligibility, ALL_CORNERS } from '../engine/types';

// Corner indicator radius in mm
const CORNER_INDICATOR_RADIUS = 4;

// Colors for different corner states
const CORNER_COLORS = {
  // Base colors by eligibility
  eligible: '#28a745',     // Green - can fillet
  ineligible: '#6c757d',   // Gray - cannot fillet

  // Hover colors (brighter)
  eligibleHover: '#51cf66',
  ineligibleHover: '#868e96',

  // Selected colors
  selected: '#9b59b6',     // Purple
  selectedHover: '#a855f7',
};

interface CornerMeshProps {
  corner: CornerKey;
  isEligible: boolean;
  maxRadius: number;
  isSelected: boolean;
  isHovered: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  panelWidth: number;
  panelHeight: number;
  scale: number;
  onHover: (hovered: boolean) => void;
  onClick: (event: React.MouseEvent) => void;
}

/**
 * Get corner position offset in panel-local coordinates
 */
function getCornerOffset(corner: CornerKey, halfWidth: number, halfHeight: number): [number, number] {
  switch (corner) {
    case 'left:top':
      return [-halfWidth, halfHeight];
    case 'right:top':
      return [halfWidth, halfHeight];
    case 'bottom:left':
      return [-halfWidth, -halfHeight];
    case 'bottom:right':
      return [halfWidth, -halfHeight];
  }
}

/**
 * Single corner mesh component
 */
const CornerMesh: React.FC<CornerMeshProps> = ({
  corner,
  isEligible,
  maxRadius: _maxRadius,  // Used in tooltip, passed through for future use
  isSelected,
  isHovered,
  position,
  rotation,
  panelWidth,
  panelHeight,
  scale,
  onHover,
  onClick,
}) => {
  // Determine color based on state
  const color = useMemo(() => {
    if (isSelected) {
      return isHovered ? CORNER_COLORS.selectedHover : CORNER_COLORS.selected;
    }
    if (!isEligible) {
      return isHovered ? CORNER_COLORS.ineligibleHover : CORNER_COLORS.ineligible;
    }
    return isHovered ? CORNER_COLORS.eligibleHover : CORNER_COLORS.eligible;
  }, [isEligible, isSelected, isHovered]);

  // Opacity: ineligible corners are dimmer
  const opacity = !isEligible ? 0.3 : isSelected ? 0.9 : isHovered ? 0.8 : 0.6;

  // Create circle geometry for corner indicator
  const geometry = useMemo(() => {
    return new THREE.CircleGeometry(CORNER_INDICATOR_RADIUS * scale, 16);
  }, [scale]);

  // Calculate corner position in world space
  const cornerPosition = useMemo(() => {
    const [px, py, pz] = position;
    const halfWidth = (panelWidth * scale) / 2;
    const halfHeight = (panelHeight * scale) / 2;

    // Get corner offset in panel-local space
    const [localX, localY] = getCornerOffset(corner, halfWidth, halfHeight);

    // Offset slightly in front of panel to prevent z-fighting
    const zOffset = 0.1;

    // Create panel's rotation as Euler, then convert to quaternion for transforms
    const panelEuler = new THREE.Euler(rotation[0], rotation[1], rotation[2], 'XYZ');
    const panelQuat = new THREE.Quaternion().setFromEuler(panelEuler);

    // Local offset from panel center to corner (on panel surface)
    const localOffset = new THREE.Vector3(localX, localY, zOffset);

    // Transform local offset to world space
    const worldOffset = localOffset.applyQuaternion(panelQuat);

    return [
      px + worldOffset.x,
      py + worldOffset.y,
      pz + worldOffset.z,
    ] as [number, number, number];
  }, [corner, position, rotation, panelWidth, panelHeight, scale]);

  // Corner indicator faces the same direction as the panel
  const cornerRotation = useMemo(() => {
    return rotation;
  }, [rotation]);

  const handleClick = useCallback((e: any) => {
    e.stopPropagation?.();
    if (isEligible) {
      onClick(e.nativeEvent || e);
    }
  }, [isEligible, onClick]);

  const handlePointerOver = useCallback((e: any) => {
    e.stopPropagation?.();
    onHover(true);
    if (isEligible) {
      document.body.style.cursor = 'pointer';
    }
  }, [isEligible, onHover]);

  const handlePointerOut = useCallback(() => {
    onHover(false);
    document.body.style.cursor = 'auto';
  }, [onHover]);

  return (
    <mesh
      geometry={geometry}
      position={cornerPosition}
      rotation={cornerRotation}
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

interface PanelCornerRendererProps {
  scale: number;
}

/**
 * Renders corner indicators for all panels when the fillet tool is active
 */
export const PanelCornerRenderer: React.FC<PanelCornerRendererProps> = ({ scale }) => {
  const panelCollection = useEnginePanels();
  const config = useEngineConfig();

  const activeTool = useBoxStore((state) => state.activeTool);
  const selectedCornerIds = useBoxStore((state) => state.selectedCornerIds);
  const hoveredCorner = useBoxStore((state) => state.hoveredCorner);
  const selectCorner = useBoxStore((state) => state.selectCorner);
  const setHoveredCorner = useBoxStore((state) => state.setHoveredCorner);
  const operationState = useBoxStore((state) => state.operationState);

  // Handle corner click
  const handleCornerClick = useCallback((panelId: string, corner: CornerKey, event: React.MouseEvent) => {
    // During an active operation, only shift+click modifies selection
    const isOperationActive = operationState.activeOperation !== null;
    if (isOperationActive && !event.shiftKey) {
      return; // Let camera controls handle this click
    }

    // Build corner key: "panelId:corner"
    const cornerKey = `${panelId}:${corner}`;
    // Use additive mode (toggle) when shift is held
    const additive = event.shiftKey;
    selectCorner(cornerKey, additive);
  }, [selectCorner, operationState.activeOperation]);

  // Handle corner hover
  const handleCornerHover = useCallback((panelId: string, corner: CornerKey, hovered: boolean) => {
    if (hovered) {
      setHoveredCorner(`${panelId}:${corner}`);
    } else {
      setHoveredCorner(null);
    }
  }, [setHoveredCorner]);

  // Only render when fillet tool is active
  if (activeTool !== 'fillet' || !panelCollection || !config) {
    return null;
  }

  return (
    <>
      {panelCollection.panels.map((panel: PanelPath) => {
        if (!panel.visible) return null;

        // Get corner eligibility from the panel (computed by engine)
        const cornerEligibility = panel.cornerEligibility ?? getDefaultCornerEligibility();

        return ALL_CORNERS.map((corner) => {
          const eligibility = cornerEligibility.find(e => e.corner === corner);
          const isEligible = eligibility?.eligible ?? false;
          const maxRadius = eligibility?.maxRadius ?? 0;
          const cornerKey = `${panel.id}:${corner}`;
          const isSelected = selectedCornerIds.has(cornerKey);
          const isHovered = hoveredCorner === cornerKey;

          return (
            <CornerMesh
              key={cornerKey}
              corner={corner}
              isEligible={isEligible}
              maxRadius={maxRadius}
              isSelected={isSelected}
              isHovered={isHovered}
              position={panel.position}
              rotation={panel.rotation}
              panelWidth={panel.width}
              panelHeight={panel.height}
              scale={scale}
              onHover={(hovered) => handleCornerHover(panel.id, corner, hovered)}
              onClick={(event) => handleCornerClick(panel.id, corner, event)}
            />
          );
        });
      })}
    </>
  );
};

/**
 * Default corner eligibility (all ineligible) for panels without computed eligibility
 */
function getDefaultCornerEligibility(): CornerEligibility[] {
  return ALL_CORNERS.map((corner): CornerEligibility => ({
    corner,
    eligible: false,
    maxRadius: 0,
    freeLength1: 0,
    freeLength2: 0,
  }));
}
