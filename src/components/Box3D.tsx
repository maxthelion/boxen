import React from 'react';
import { useBoxStore, getLeafVoids, getAllSubdivisions, getAllSubAssemblies, isVoidVisible, isSubAssemblyVisible } from '../store/useBoxStore';
import { VoidMesh } from './VoidMesh';
import { SubAssembly3D } from './SubAssembly3D';
import { FaceWithFingers } from './FaceWithFingers';
import { DividerPanel } from './DividerPanel';
import { FaceId, Bounds } from '../types';
import * as THREE from 'three';

// Face configs for a box with OUTER dimensions w × h × d.
//
// Edge length matching (mating edges must have same length for finger alignment):
// - front↔top: both w
// - front↔left: both h-2T
// - left↔top: both d
//
// Sizing:
// - front/back: w × (h-2T) — tabs on top/bottom extend height to h
// - left/right: d × (h-2T) — tabs on top/bottom extend height to h
// - top/bottom: w × d — full size, slots cut inward
const getFaceConfigs = (scaledThickness: number): {
  id: FaceId;
  position: (w: number, h: number, d: number) => [number, number, number];
  rotation: [number, number, number];
  size: (w: number, h: number, d: number) => [number, number];
}[] => {
  const halfT = scaledThickness / 2;
  const T = scaledThickness;
  return [
    {
      id: 'front',
      position: (w, h, d) => [0, 0, d / 2 - halfT],  // outer surface at z = d/2
      rotation: [0, 0, 0],
      size: (w, h) => [w, h],  // full height - corner insets handle tab overlaps
    },
    {
      id: 'back',
      position: (w, h, d) => [0, 0, -d / 2 + halfT],  // outer surface at z = -d/2
      rotation: [0, Math.PI, 0],
      size: (w, h) => [w, h],  // full height - corner insets handle tab overlaps
    },
    {
      id: 'left',
      position: (w, h, d) => [-w / 2 + halfT, 0, 0],  // outer surface at x = -w/2
      rotation: [0, -Math.PI / 2, 0],
      size: (w, h, d) => [d, h],  // full height - corner insets handle tab overlaps
    },
    {
      id: 'right',
      position: (w, h, d) => [w / 2 - halfT, 0, 0],  // outer surface at x = w/2
      rotation: [0, Math.PI / 2, 0],
      size: (w, h, d) => [d, h],  // full height - corner insets handle tab overlaps
    },
    {
      id: 'top',
      position: (w, h, d) => [0, h / 2 - halfT, 0],  // outer surface at y = h/2
      rotation: [-Math.PI / 2, 0, 0],
      size: (w, h, d) => [w, d],
    },
    {
      id: 'bottom',
      position: (w, h, d) => [0, -h / 2 + halfT, 0],  // outer surface at y = -h/2
      rotation: [Math.PI / 2, 0, 0],
      size: (w, h, d) => [w, d],
    },
  ];
};

// Find a void by ID
const findVoid = (root: { id: string; bounds: Bounds; children: any[] }, id: string): { bounds: Bounds } | null => {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findVoid(child, id);
    if (found) return found;
  }
  return null;
};

// Divider intersection with a face - used for cutting slots
export interface DividerIntersection {
  subdivisionId: string;
  // Position along the face in local 2D coordinates (after scaling)
  // For horizontal slots: x position of slot center
  // For vertical slots: y position of slot center
  position: number;
  // Length of the slot (how much of the face edge the divider spans)
  length: number;
  // Whether the slot is horizontal or vertical on the face
  orientation: 'horizontal' | 'vertical';
  // The divider's bounds (needed for finger pattern calculation)
  dividerBounds: Bounds;
  // The divider's axis
  dividerAxis: 'x' | 'y' | 'z';
  // Insets at start and end of the slot (where divider meets perpendicular outer faces)
  // These must be subtracted from the slot length to get the finger region
  startInset: number;  // Inset at start of slot (scaled)
  endInset: number;    // Inset at end of slot (scaled)
}

// Calculate which dividers intersect a given face
const getDividerIntersections = (
  faceId: FaceId,
  subdivisions: { id: string; axis: 'x' | 'y' | 'z'; position: number; bounds: Bounds }[],
  boxDimensions: { width: number; height: number; depth: number },
  scale: number,
  materialThickness: number
): DividerIntersection[] => {
  const { width, height, depth } = boxDimensions;
  const intersections: DividerIntersection[] = [];
  const T = materialThickness * scale;  // Scaled material thickness
  const tolerance = 0.01;

  for (const sub of subdivisions) {
    const { axis, position, bounds } = sub;
    let intersects = false;
    let localPosition = 0;
    let length = 0;
    let orientation: 'horizontal' | 'vertical' = 'horizontal';
    let startInset = 0;  // Inset at start of slot
    let endInset = 0;    // Inset at end of slot

    // Helper to check if divider meets an outer face
    const meetsBottom = bounds.y < tolerance;
    const meetsTop = bounds.y + bounds.h > height - tolerance;
    const meetsLeft = bounds.x < tolerance;
    const meetsRight = bounds.x + bounds.w > width - tolerance;
    const meetsBack = bounds.z < tolerance;
    const meetsFront = bounds.z + bounds.d > depth - tolerance;

    switch (faceId) {
      case 'front':
      case 'back':
        // Front/back faces are intersected by X and Y axis dividers
        if (axis === 'x') {
          // X-axis divider creates a vertical slot on front/back
          if ((faceId === 'front' && meetsFront) || (faceId === 'back' && meetsBack)) {
            intersects = true;
            localPosition = (position - width / 2) * scale;
            length = bounds.h * scale;
            orientation = 'vertical';
            // Vertical slot: start=bottom, end=top
            startInset = meetsBottom ? T : 0;
            endInset = meetsTop ? T : 0;
          }
        } else if (axis === 'y') {
          // Y-axis divider creates a horizontal slot on front/back
          if ((faceId === 'front' && meetsFront) || (faceId === 'back' && meetsBack)) {
            intersects = true;
            localPosition = (position - height / 2) * scale;
            length = bounds.w * scale;
            orientation = 'horizontal';
            // Horizontal slot: start=left, end=right
            startInset = meetsLeft ? T : 0;
            endInset = meetsRight ? T : 0;
          }
        }
        break;

      case 'left':
      case 'right':
        // Left/right faces are intersected by Y and Z axis dividers
        if (axis === 'y') {
          // Y-axis divider creates a horizontal slot on left/right
          if ((faceId === 'left' && meetsLeft) || (faceId === 'right' && meetsRight)) {
            intersects = true;
            localPosition = (position - height / 2) * scale;
            length = bounds.d * scale;
            orientation = 'horizontal';
            // Horizontal slot on left/right: start=back, end=front
            startInset = meetsBack ? T : 0;
            endInset = meetsFront ? T : 0;
          }
        } else if (axis === 'z') {
          // Z-axis divider creates a vertical slot on left/right
          if ((faceId === 'left' && meetsLeft) || (faceId === 'right' && meetsRight)) {
            intersects = true;
            localPosition = (faceId === 'left' ? -1 : 1) * (position - depth / 2) * scale;
            length = bounds.h * scale;
            orientation = 'vertical';
            // Vertical slot: start=bottom, end=top
            startInset = meetsBottom ? T : 0;
            endInset = meetsTop ? T : 0;
          }
        }
        break;

      case 'top':
      case 'bottom':
        // Top/bottom faces are intersected by X and Z axis dividers
        if (axis === 'x') {
          // X-axis divider creates a slot along Z on top/bottom
          if ((faceId === 'top' && meetsTop) || (faceId === 'bottom' && meetsBottom)) {
            intersects = true;
            localPosition = (position - width / 2) * scale;
            length = bounds.d * scale;
            orientation = 'vertical';  // Along Y in local 2D (which is Z in world)
            // For top: start=front (negative local Y), end=back
            // For bottom: start=back (negative local Y), end=front
            if (faceId === 'top') {
              startInset = meetsFront ? T : 0;
              endInset = meetsBack ? T : 0;
            } else {
              startInset = meetsBack ? T : 0;
              endInset = meetsFront ? T : 0;
            }
          }
        } else if (axis === 'z') {
          // Z-axis divider creates a slot along X on top/bottom
          if ((faceId === 'top' && meetsTop) || (faceId === 'bottom' && meetsBottom)) {
            intersects = true;
            localPosition = (faceId === 'top' ? -1 : 1) * (position - depth / 2) * scale;
            length = bounds.w * scale;
            orientation = 'horizontal';  // Along X in local 2D
            // Horizontal slot: start=left, end=right
            startInset = meetsLeft ? T : 0;
            endInset = meetsRight ? T : 0;
          }
        }
        break;
    }

    if (intersects) {
      intersections.push({
        subdivisionId: sub.id,
        position: localPosition,
        length,
        orientation,
        dividerBounds: bounds,
        dividerAxis: axis,
        startInset,
        endInset,
      });
    }
  }

  return intersections;
};

export const Box3D: React.FC = () => {
  const { config, faces, rootVoid, subdivisionPreview, selectionMode, selectedPanelId, selectPanel, selectedAssemblyId, selectAssembly, hiddenVoidIds, isolatedVoidId, hiddenSubAssemblyIds, isolatedSubAssemblyId } = useBoxStore();
  const { width, height, depth } = config;

  const scale = 100 / Math.max(width, height, depth);
  const scaledW = width * scale;
  const scaledH = height * scale;
  const scaledD = depth * scale;
  const scaledThickness = config.materialThickness * scale;

  const boxCenter = { x: width / 2, y: height / 2, z: depth / 2 };

  // Get face configs with proper thickness offset
  const faceConfigs = getFaceConfigs(scaledThickness);

  // Get all leaf voids (selectable cells)
  const leafVoids = getLeafVoids(rootVoid);

  // Get all subdivisions for rendering divider planes
  const subdivisions = getAllSubdivisions(rootVoid);

  // Get all sub-assemblies
  const subAssemblies = getAllSubAssemblies(rootVoid);

  // Get preview void bounds if preview is active
  const previewVoid = subdivisionPreview ? findVoid(rootVoid, subdivisionPreview.voidId) : null;

  return (
    <group>
      {/* Wireframe box outline - RED shows outer dimensions for alignment verification */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(scaledW, scaledH, scaledD)]} />
        <lineBasicMaterial color="#ff0000" linewidth={2} />
      </lineSegments>

      {/* Face panels with finger joints and material thickness */}
      {faceConfigs.map((faceConfig) => {
        const face = faces.find((f) => f.id === faceConfig.id);
        const isSolid = face?.solid ?? true;
        const [sizeW, sizeH] = faceConfig.size(scaledW, scaledH, scaledD);
        const position = faceConfig.position(scaledW, scaledH, scaledD);
        const isSelectedPanel = selectionMode === 'panel' && selectedPanelId === `face-${faceConfig.id}`;
        const isSelectedAssembly = selectionMode === 'assembly' && selectedAssemblyId === 'main';
        const isPanelMode = selectionMode === 'panel';
        const isAssemblyMode = selectionMode === 'assembly';

        // Calculate which dividers intersect this face
        const dividerIntersections = getDividerIntersections(
          faceConfig.id,
          subdivisions,
          { width, height, depth },
          scale
        );

        const handleClick = () => {
          if (isPanelMode && isSolid) {
            selectPanel(isSelectedPanel ? null : `face-${faceConfig.id}`);
          } else if (isAssemblyMode) {
            selectAssembly(isSelectedAssembly ? null : 'main');
          }
        };

        return (
          <FaceWithFingers
            key={faceConfig.id}
            faceId={faceConfig.id}
            position={position}
            rotation={faceConfig.rotation}
            sizeW={sizeW}
            sizeH={sizeH}
            scale={scale}
            isSelected={isSelectedPanel || isSelectedAssembly}
            isSolid={isSolid}
            dividerIntersections={dividerIntersections}
            onClick={(isPanelMode && isSolid) || isAssemblyMode ? handleClick : undefined}
          />
        );
      })}

      {/* Existing subdivision panels with finger joints */}
      {subdivisions.map((sub) => {
        let position: [number, number, number];
        let rotation: [number, number, number];
        let sizeW: number;
        let sizeH: number;

        const { bounds } = sub;
        const centerX = (bounds.x + bounds.w / 2 - boxCenter.x) * scale;
        const centerY = (bounds.y + bounds.h / 2 - boxCenter.y) * scale;
        const centerZ = (bounds.z + bounds.d / 2 - boxCenter.z) * scale;

        switch (sub.axis) {
          case 'x':
            position = [(sub.position - boxCenter.x) * scale, centerY, centerZ];
            rotation = [0, Math.PI / 2, 0];
            sizeW = bounds.d * scale;
            sizeH = bounds.h * scale;
            break;
          case 'y':
            position = [centerX, (sub.position - boxCenter.y) * scale, centerZ];
            rotation = [Math.PI / 2, 0, 0];
            sizeW = bounds.w * scale;
            sizeH = bounds.d * scale;
            break;
          case 'z':
            position = [centerX, centerY, (sub.position - boxCenter.z) * scale];
            rotation = [0, 0, 0];
            sizeW = bounds.w * scale;
            sizeH = bounds.h * scale;
            break;
        }

        const isSelected = selectionMode === 'panel' && selectedPanelId === `sub-${sub.id}`;
        const isPanelMode = selectionMode === 'panel';

        return (
          <DividerPanel
            key={sub.id}
            subdivision={sub}
            position={position}
            rotation={rotation}
            sizeW={sizeW}
            sizeH={sizeH}
            scale={scale}
            boxDimensions={{ width, height, depth }}
            isSelected={isSelected}
            onClick={isPanelMode ? () => {
              selectPanel(isSelected ? null : `sub-${sub.id}`);
            } : undefined}
          />
        );
      })}

      {/* Preview panels (semi-transparent, different color) with thickness */}
      {subdivisionPreview && previewVoid && subdivisionPreview.positions.map((pos, idx) => {
        const { bounds } = previewVoid;
        let position: [number, number, number];
        let rotation: [number, number, number];
        let size: [number, number];

        const centerX = (bounds.x + bounds.w / 2 - boxCenter.x) * scale;
        const centerY = (bounds.y + bounds.h / 2 - boxCenter.y) * scale;
        const centerZ = (bounds.z + bounds.d / 2 - boxCenter.z) * scale;

        switch (subdivisionPreview.axis) {
          case 'x':
            position = [(pos - boxCenter.x) * scale, centerY, centerZ];
            rotation = [0, Math.PI / 2, 0];
            size = [bounds.d * scale, bounds.h * scale];
            break;
          case 'y':
            position = [centerX, (pos - boxCenter.y) * scale, centerZ];
            rotation = [Math.PI / 2, 0, 0];
            size = [bounds.w * scale, bounds.d * scale];
            break;
          case 'z':
            position = [centerX, centerY, (pos - boxCenter.z) * scale];
            rotation = [0, 0, 0];
            size = [bounds.w * scale, bounds.h * scale];
            break;
        }

        return (
          <mesh key={`preview-${idx}`} position={position} rotation={rotation}>
            <boxGeometry args={[size[0], size[1], scaledThickness]} />
            <meshStandardMaterial
              color="#2ecc71"
              transparent
              opacity={0.7}
            />
          </mesh>
        );
      })}

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
