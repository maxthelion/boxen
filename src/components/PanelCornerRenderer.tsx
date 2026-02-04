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
import { AllCornerId, AllCornerEligibility } from '../engine/types';
import { useColors } from '../hooks/useColors';

// Corner indicator dimensions in mm
const CORNER_INDICATOR_OUTER_RADIUS = 5;
const CORNER_INDICATOR_INNER_RADIUS = 3;  // Creates ring effect

interface CornerMeshProps {
  cornerId: AllCornerId;
  isEligible: boolean;
  maxRadius: number;
  isSelected: boolean;
  isHovered: boolean;
  panelPosition: [number, number, number];  // Panel center in world space
  rotation: [number, number, number];
  localPosition: { x: number; y: number };  // Corner position in panel-local 2D coordinates
  thickness: number;  // Panel thickness for positioning on outer face
  scale: number;
  onHover: (hovered: boolean) => void;
  onClick: (event: React.MouseEvent) => void;
}

/**
 * Single corner mesh component
 *
 * Renders a corner indicator at the specified local 2D position on a panel.
 * The localPosition is transformed to world space using the panel's position and rotation.
 */
const CornerMesh: React.FC<CornerMeshProps> = ({
  cornerId: _cornerId,  // Used for key, passed through
  isEligible,
  maxRadius: _maxRadius,  // Used in tooltip, passed through for future use
  isSelected,
  isHovered,
  panelPosition,
  rotation,
  localPosition,
  thickness,
  scale,
  onHover,
  onClick,
}) => {
  const colors = useColors();

  // Determine color based on state
  const color = useMemo(() => {
    if (isSelected) {
      return isHovered ? colors.corner.selected.hover : colors.corner.selected.base;
    }
    if (!isEligible) {
      return isHovered ? colors.corner.ineligible.hover : colors.corner.ineligible.base;
    }
    return isHovered ? colors.corner.eligible.hover : colors.corner.eligible.base;
  }, [isEligible, isSelected, isHovered, colors]);

  // Opacity: selected corners are solid, ineligible are dimmer
  const opacity = isSelected ? colors.opacity.solid : !isEligible ? colors.opacity.subtle : colors.opacity.selected;

  // Create geometry: filled circle for selected, ring for unselected
  const geometry = useMemo(() => {
    if (isSelected) {
      // Solid filled circle for selected corners
      return new THREE.CircleGeometry(
        CORNER_INDICATOR_OUTER_RADIUS * scale,
        24  // segments for smooth circle
      );
    }
    // Ring for unselected corners
    return new THREE.RingGeometry(
      CORNER_INDICATOR_INNER_RADIUS * scale,
      CORNER_INDICATOR_OUTER_RADIUS * scale,
      24  // segments for smooth ring
    );
  }, [scale, isSelected]);

  // Calculate corner position in world space
  // localPosition is in panel-local 2D coordinates (from allCornerEligibility)
  const cornerPosition = useMemo(() => {
    const [px, py, pz] = panelPosition;

    // Scale the local position
    const localX = localPosition.x * scale;
    const localY = localPosition.y * scale;

    // Position on outer face: half thickness + small offset to prevent z-fighting
    const zOffset = (thickness * scale / 2) + 0.05;

    // Create panel's rotation as Euler, then convert to quaternion for transforms
    const panelEuler = new THREE.Euler(rotation[0], rotation[1], rotation[2], 'XYZ');
    const panelQuat = new THREE.Quaternion().setFromEuler(panelEuler);

    // Local offset from panel center to corner (on panel outer surface)
    const localOffset = new THREE.Vector3(localX, localY, zOffset);

    // Transform local offset to world space
    const worldOffset = localOffset.applyQuaternion(panelQuat);

    return [
      px + worldOffset.x,
      py + worldOffset.y,
      pz + worldOffset.z,
    ] as [number, number, number];
  }, [panelPosition, rotation, localPosition, thickness, scale]);

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
      <meshBasicMaterial
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
  // Uses AllCornerId format: "outline:index" or "hole:holeId:index"
  const handleCornerClick = useCallback((panelId: string, cornerId: AllCornerId, event: React.MouseEvent) => {
    // During an active operation, only shift+click modifies selection
    const isOperationActive = operationState.activeOperation !== null;
    if (isOperationActive && !event.shiftKey) {
      return; // Let camera controls handle this click
    }

    // Build corner key: "panelId:cornerId"
    const cornerKey = `${panelId}:${cornerId}`;
    // Use additive mode (toggle) when shift is held
    const additive = event.shiftKey;
    selectCorner(cornerKey, additive);
  }, [selectCorner, operationState.activeOperation]);

  // Handle corner hover
  const handleCornerHover = useCallback((panelId: string, cornerId: AllCornerId, hovered: boolean) => {
    if (hovered) {
      setHoveredCorner(`${panelId}:${cornerId}`);
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

        // Get ALL corner eligibility from the panel (computed by engine)
        // This includes corners from outline AND all holes
        const allCornerEligibility = panel.allCornerEligibility ?? [];

        return allCornerEligibility.map((eligibility: AllCornerEligibility) => {
          const cornerKey = `${panel.id}:${eligibility.id}`;
          const isSelected = selectedCornerIds.has(cornerKey);
          const isHovered = hoveredCorner === cornerKey;

          return (
            <CornerMesh
              key={cornerKey}
              cornerId={eligibility.id}
              isEligible={eligibility.eligible}
              maxRadius={eligibility.maxRadius}
              isSelected={isSelected}
              isHovered={isHovered}
              panelPosition={panel.position}
              rotation={panel.rotation}
              localPosition={eligibility.position}
              thickness={config.materialThickness}
              scale={scale}
              onHover={(hovered) => handleCornerHover(panel.id, eligibility.id, hovered)}
              onClick={(event) => handleCornerClick(panel.id, eligibility.id, event)}
            />
          );
        });
      })}
    </>
  );
};
