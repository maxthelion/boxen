import React, { useMemo } from 'react';
import * as THREE from 'three';
import { PanelPath, PathPoint } from '../types';
import { useBoxStore } from '../store/useBoxStore';

interface PanelPathRendererProps {
  panel: PanelPath;
  scale: number;
  isSelected: boolean;
  onClick?: () => void;
  color?: string;
  selectedColor?: string;
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
  onClick,
  color = '#3498db',
  selectedColor = '#9b59b6',
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

  if (!visible || !geometry) {
    return null;
  }

  const handleClick = onClick ? (e: any) => {
    e.stopPropagation?.();
    onClick();
  } : undefined;

  return (
    <group position={scaledPosition} rotation={rotation}>
      <mesh geometry={geometry} onClick={handleClick}>
        <meshStandardMaterial
          color={isSelected ? selectedColor : color}
          transparent
          opacity={isSelected ? 0.9 : 0.7}
          side={THREE.DoubleSide}
        />
      </mesh>
      {edgeGeometry && (
        <lineSegments geometry={edgeGeometry}>
          <lineBasicMaterial
            color={isSelected ? '#7b4397' : '#1a5276'}
            linewidth={1}
          />
        </lineSegments>
      )}
    </group>
  );
};

// Render all panels from a collection
interface PanelCollectionRendererProps {
  scale: number;
  selectedPanelId: string | null;
  onPanelClick?: (panelId: string) => void;
  hiddenFaceIds?: Set<string>;
}

export const PanelCollectionRenderer: React.FC<PanelCollectionRendererProps> = ({
  scale,
  selectedPanelId,
  onPanelClick,
  hiddenFaceIds = new Set(),
}) => {
  const panelCollection = useBoxStore((state) => state.panelCollection);

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

        return (
          <PanelPathRenderer
            key={panel.id}
            panel={panel}
            scale={scale}
            isSelected={selectedPanelId === panel.id}
            onClick={onPanelClick ? () => onPanelClick(panel.id) : undefined}
            color={isDivider ? '#f39c12' : '#3498db'}
            selectedColor={isDivider ? '#9b59b6' : '#9b59b6'}
          />
        );
      })}
    </>
  );
};
