import React, { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { PanelPath, PathPoint } from '../types';
import { useBoxStore } from '../store/useBoxStore';
import { useEnginePanels } from '../engine';

interface PanelPathRendererProps {
  panel: PanelPath;
  scale: number;
  isSelected: boolean;
  isHovered?: boolean;
  onClick?: (event?: React.MouseEvent) => void;
  onDoubleClick?: (event?: React.MouseEvent) => void;
  onHover?: (hovered: boolean) => void;
  color?: string;
  selectedColor?: string;
  hoveredColor?: string;
}

// Convert stored PathPoints to THREE.js geometry
const createGeometryFromPath = (
  outline: PathPoint[],
  holes: { points: PathPoint[] }[],
  thickness: number,
  scale: number
): THREE.ExtrudeGeometry => {
  const scaledThickness = thickness * scale;

  // Create the main shape from outline points (scaled)
  const shape = new THREE.Shape();
  if (outline.length > 0) {
    const first = outline[0];
    shape.moveTo(first.x * scale, first.y * scale);

    for (let i = 1; i < outline.length; i++) {
      const pt = outline[i];
      shape.lineTo(pt.x * scale, pt.y * scale);
    }

    shape.closePath();
  }

  // Add holes (scaled)
  for (const hole of holes) {
    if (hole.points.length > 0) {
      const holePath = new THREE.Path();
      const first = hole.points[0];
      holePath.moveTo(first.x * scale, first.y * scale);
      for (let i = 1; i < hole.points.length; i++) {
        holePath.lineTo(hole.points[i].x * scale, hole.points[i].y * scale);
      }
      holePath.closePath();
      shape.holes.push(holePath);
    }
  }

  // Extrude
  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: scaledThickness,
    bevelEnabled: false,
  };

  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geo.translate(0, 0, -scaledThickness / 2);

  return geo;
};

// Create edge geometry for wireframe outline
const createEdgeGeometry = (
  outline: PathPoint[],
  holes: { points: PathPoint[] }[],
  thickness: number,
  scale: number
): THREE.BufferGeometry => {
  const scaledThickness = thickness * scale;
  const frontZ = scaledThickness / 2;
  const backZ = -scaledThickness / 2;

  const vertices: number[] = [];

  const addSegment = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => {
    // Skip zero-length segments
    if (Math.abs(x1 - x2) < 0.001 && Math.abs(y1 - y2) < 0.001 && Math.abs(z1 - z2) < 0.001) {
      return;
    }
    vertices.push(x1, y1, z1, x2, y2, z2);
  };

  // Add path outline, connecting consecutive points
  // Only connects distinct points (skips if next point is same as current)
  const addPathOutline = (points: PathPoint[], z: number) => {
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      addSegment(p1.x * scale, p1.y * scale, z, p2.x * scale, p2.y * scale, z);
    }
  };

  // Add connecting edges between front and back faces
  // Only at unique positions (skips duplicate points)
  const addConnectingEdges = (points: PathPoint[]) => {
    const seen = new Set<string>();
    for (const p of points) {
      const key = `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      addSegment(p.x * scale, p.y * scale, frontZ, p.x * scale, p.y * scale, backZ);
    }
  };

  // Outer path
  addPathOutline(outline, frontZ);
  addPathOutline(outline, backZ);
  addConnectingEdges(outline);

  // Hole paths
  for (const hole of holes) {
    addPathOutline(hole.points, frontZ);
    addPathOutline(hole.points, backZ);
    addConnectingEdges(hole.points);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  return geometry;
};

export const PanelPathRenderer: React.FC<PanelPathRendererProps> = ({
  panel,
  scale,
  isSelected,
  isHovered = false,
  onClick,
  onDoubleClick,
  onHover,
  color = '#3498db',
  selectedColor = '#9b59b6',
  hoveredColor = '#6ab04c',
}) => {
  const { outline, holes, thickness, position, rotation, visible } = panel;

  // Scale the stored position for rendering
  const scaledPosition: [number, number, number] = useMemo(() => [
    position[0] * scale,
    position[1] * scale,
    position[2] * scale,
  ], [position, scale]);

  const geometry = useMemo(() => {
    if (!visible || outline.points.length === 0) return null;
    return createGeometryFromPath(
      outline.points,
      holes.map(h => ({ points: h.path.points })),
      thickness,
      scale
    );
  }, [outline, holes, thickness, scale, visible]);

  const edgeGeometry = useMemo(() => {
    if (!visible || outline.points.length === 0) return null;
    return createEdgeGeometry(
      outline.points,
      holes.map(h => ({ points: h.path.points })),
      thickness,
      scale
    );
  }, [outline, holes, thickness, scale, visible]);

  // Properly dispose of geometry when it changes or component unmounts
  useEffect(() => {
    return () => {
      if (geometry) {
        geometry.dispose();
      }
      if (edgeGeometry) {
        edgeGeometry.dispose();
      }
    };
  }, [geometry, edgeGeometry]);

  if (!visible || !geometry) {
    return null;
  }

  const handleClick = onClick ? (e: any) => {
    e.stopPropagation?.();
    // Extract native event for shiftKey access
    const nativeEvent = e.nativeEvent || e;
    onClick(nativeEvent);
  } : undefined;

  const handleDoubleClick = onDoubleClick ? (e: any) => {
    e.stopPropagation?.();
    const nativeEvent = e.nativeEvent || e;
    onDoubleClick(nativeEvent);
  } : undefined;

  const handlePointerOver = onHover ? (e: any) => {
    e.stopPropagation?.();
    onHover(true);
    document.body.style.cursor = 'pointer';
  } : undefined;

  const handlePointerOut = onHover ? () => {
    onHover(false);
    document.body.style.cursor = 'auto';
  } : undefined;

  // Determine color - selected takes priority, then hovered, then default
  const displayColor = isSelected ? selectedColor : isHovered ? hoveredColor : color;
  const displayOpacity = isSelected ? 0.9 : isHovered ? 0.8 : 0.7;

  return (
    <group position={scaledPosition} rotation={rotation}>
      <mesh
        geometry={geometry}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <meshStandardMaterial
          color={displayColor}
          transparent
          opacity={displayOpacity}
          side={THREE.DoubleSide}
        />
      </mesh>
      {edgeGeometry && (
        <lineSegments geometry={edgeGeometry}>
          <lineBasicMaterial
            color={isSelected ? '#7b4397' : isHovered ? '#2d6a4f' : '#1a5276'}
            linewidth={1}
          />
        </lineSegments>
      )}
    </group>
  );
};

// Helper to get assembly ID from panel source
const getAssemblyIdFromPanel = (panel: PanelPath): string => {
  // Use source.subAssemblyId if set, otherwise it's 'main'
  return panel.source.subAssemblyId ?? 'main';
};


// Render all panels from a collection
interface PanelCollectionRendererProps {
  scale: number;
  selectedPanelIds: Set<string>;
  onPanelClick?: (panelId: string, event?: React.MouseEvent) => void;
  onPanelDoubleClick?: (panelId: string, event?: React.MouseEvent) => void;
  hiddenFaceIds?: Set<string>;
}

export const PanelCollectionRenderer: React.FC<PanelCollectionRendererProps> = ({
  scale,
  selectedPanelIds,
  onPanelClick,
  onPanelDoubleClick,
  hiddenFaceIds = new Set(),
}) => {
  // Use preview panel collection when available, otherwise main collection from engine
  const mainPanelCollection = useEnginePanels();
  const previewPanelCollection = useBoxStore((state) => state.previewPanelCollection);
  const panelCollection = previewPanelCollection ?? mainPanelCollection;

  const hoveredPanelId = useBoxStore((state) => state.hoveredPanelId);
  const hoveredAssemblyId = useBoxStore((state) => state.hoveredAssemblyId);
  const selectedAssemblyId = useBoxStore((state) => state.selectedAssemblyId);
  const selectedSubAssemblyIds = useBoxStore((state) => state.selectedSubAssemblyIds);
  const setHoveredPanel = useBoxStore((state) => state.setHoveredPanel);

  if (!panelCollection) {
    return null;
  }

  return (
    <>
      {panelCollection.panels.map((panel: PanelPath) => {
        // Check visibility
        if (!panel.visible) return null;
        if (hiddenFaceIds.has(panel.id)) return null;

        const isDivider = panel.source.type === 'divider';
        const isSubAssemblyPanel = !!panel.source.subAssemblyId;

        // Get this panel's parent assembly
        const panelAssemblyId = getAssemblyIdFromPanel(panel);

        // Check if this panel or its assembly is selected/hovered
        const isPanelSelected = selectedPanelIds.has(panel.id);
        // Assembly can be selected via selectAssembly (selectedAssemblyId) or selectSubAssembly (selectedSubAssemblyIds)
        const isAssemblySelected = selectedAssemblyId === panelAssemblyId ||
          (panelAssemblyId !== 'main' && selectedSubAssemblyIds.has(panelAssemblyId));
        const isPanelHovered = hoveredPanelId === panel.id;
        const isAssemblyHovered = hoveredAssemblyId === panelAssemblyId;

        // Panel is "selected" if directly selected OR its assembly is selected
        const isSelected = isPanelSelected || isAssemblySelected;
        // Panel is "hovered" if directly hovered OR its assembly is hovered
        const isHovered = isPanelHovered || isAssemblyHovered;

        // Color based on panel type
        // Sub-assembly: teal, Divider: orange, Main box: blue
        const color = isSubAssemblyPanel ? '#1abc9c' : isDivider ? '#f39c12' : '#3498db';

        return (
          <PanelPathRenderer
            key={panel.id}
            panel={panel}
            scale={scale}
            isSelected={isSelected}
            isHovered={isHovered}
            onClick={onPanelClick ? (e) => onPanelClick(panel.id, e) : undefined}
            onDoubleClick={onPanelDoubleClick ? (e) => onPanelDoubleClick(panel.id, e) : undefined}
            onHover={(hovered) => setHoveredPanel(hovered ? panel.id : null)}
            color={color}
            selectedColor={'#9b59b6'}
          />
        );
      })}
    </>
  );
};
