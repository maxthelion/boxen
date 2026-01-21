import React from 'react';
import { useBoxStore, getLeafVoids, getAllSubdivisions, getAllSubAssemblies, isVoidVisible, isSubAssemblyVisible } from '../store/useBoxStore';
import { VoidMesh } from './VoidMesh';
import { SubAssembly3D } from './SubAssembly3D';
import { FaceWithFingers } from './FaceWithFingers';
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
      size: (w, h) => [w, h - 2 * T],
    },
    {
      id: 'back',
      position: (w, h, d) => [0, 0, -d / 2 + halfT],  // outer surface at z = -d/2
      rotation: [0, Math.PI, 0],
      size: (w, h) => [w, h - 2 * T],
    },
    {
      id: 'left',
      position: (w, h, d) => [-w / 2 + halfT, 0, 0],  // outer surface at x = -w/2
      rotation: [0, -Math.PI / 2, 0],
      size: (w, h, d) => [d, h - 2 * T],
    },
    {
      id: 'right',
      position: (w, h, d) => [w / 2 - halfT, 0, 0],  // outer surface at x = w/2
      rotation: [0, Math.PI / 2, 0],
      size: (w, h, d) => [d, h - 2 * T],
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
      {/* Wireframe box outline */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(scaledW, scaledH, scaledD)]} />
        <lineBasicMaterial color="#333" />
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
            onClick={(isPanelMode && isSolid) || isAssemblyMode ? handleClick : undefined}
          />
        );
      })}

      {/* Existing subdivision panels with material thickness */}
      {subdivisions.map((sub) => {
        let position: [number, number, number];
        let rotation: [number, number, number];
        let size: [number, number];

        const { bounds } = sub;
        const centerX = (bounds.x + bounds.w / 2 - boxCenter.x) * scale;
        const centerY = (bounds.y + bounds.h / 2 - boxCenter.y) * scale;
        const centerZ = (bounds.z + bounds.d / 2 - boxCenter.z) * scale;

        switch (sub.axis) {
          case 'x':
            position = [(sub.position - boxCenter.x) * scale, centerY, centerZ];
            rotation = [0, Math.PI / 2, 0];
            size = [bounds.d * scale, bounds.h * scale];
            break;
          case 'y':
            position = [centerX, (sub.position - boxCenter.y) * scale, centerZ];
            rotation = [Math.PI / 2, 0, 0];
            size = [bounds.w * scale, bounds.d * scale];
            break;
          case 'z':
            position = [centerX, centerY, (sub.position - boxCenter.z) * scale];
            rotation = [0, 0, 0];
            size = [bounds.w * scale, bounds.h * scale];
            break;
        }

        const isSelected = selectionMode === 'panel' && selectedPanelId === `sub-${sub.id}`;
        const isPanelMode = selectionMode === 'panel';

        return (
          <mesh
            key={sub.id}
            position={position}
            rotation={rotation}
            onClick={isPanelMode ? (e) => {
              e.stopPropagation();
              selectPanel(isSelected ? null : `sub-${sub.id}`);
            } : undefined}
          >
            <boxGeometry args={[size[0], size[1], scaledThickness]} />
            <meshStandardMaterial
              color={isSelected ? '#9b59b6' : '#f39c12'}
              transparent
              opacity={isSelected ? 0.9 : 0.7}
            />
          </mesh>
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
