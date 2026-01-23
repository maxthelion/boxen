import React, { useMemo, useEffect } from 'react';
import { useBoxStore, getLeafVoids, getAllSubdivisions, getAllSubAssemblies, isVoidVisible, isSubAssemblyVisible } from '../store/useBoxStore';
import { VoidMesh } from './VoidMesh';
import { SubAssembly3D } from './SubAssembly3D';
import { FaceWithFingers } from './FaceWithFingers';
import { DividerPanel } from './DividerPanel';
import { PanelCollectionRenderer } from './PanelPathRenderer';
import { FaceId, Bounds, AssemblyConfig, getFaceRole, getLidSide, getLidFaceId } from '../types';
import * as THREE from 'three';

// Flag to switch between old (computed) and new (stored paths) rendering
const USE_STORED_PATHS = true;  // Check panelGenerator holes

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

// Find a void by ID (including inside sub-assemblies)
const findVoid = (root: { id: string; bounds: Bounds; children: any[]; subAssembly?: any }, id: string): { bounds: Bounds } | null => {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findVoid(child, id);
    if (found) return found;
  }
  // Also search inside sub-assembly's void structure
  if (root.subAssembly) {
    const found = findVoid(root.subAssembly.rootVoid, id);
    if (found) return found;
  }
  return null;
};

// Find the parent sub-assembly of a void (if any) and return its world offset
const findParentSubAssemblyOffset = (
  root: { id: string; bounds: Bounds; children: any[]; subAssembly?: any },
  voidId: string,
  subAssemblyInfo?: { bounds: Bounds; clearance: number; materialThickness: number; faceOffsets?: { left: number; right: number; top: number; bottom: number; front: number; back: number } }
): { x: number; y: number; z: number } | null => {
  // Check if this void is the target
  if (root.id === voidId) {
    if (subAssemblyInfo) {
      // This void is inside a sub-assembly, return the offset
      const { bounds, clearance, materialThickness, faceOffsets } = subAssemblyInfo;
      const offsets = faceOffsets || { left: 0, right: 0, top: 0, bottom: 0, front: 0, back: 0 };
      const subOuterW = root.bounds.w + 2 * materialThickness;
      const subOuterH = root.bounds.h + 2 * materialThickness;
      const subOuterD = root.bounds.d + 2 * materialThickness;
      return {
        x: bounds.x + clearance - offsets.left + subOuterW / 2 - root.bounds.w / 2 - materialThickness,
        y: bounds.y + clearance - offsets.bottom + subOuterH / 2 - root.bounds.h / 2 - materialThickness,
        z: bounds.z + clearance - offsets.back + subOuterD / 2 - root.bounds.d / 2 - materialThickness,
      };
    }
    return null; // Void is in main box, no offset needed
  }

  // Check children
  for (const child of root.children) {
    const result = findParentSubAssemblyOffset(child, voidId, subAssemblyInfo);
    if (result !== undefined) return result;
  }

  // Check inside sub-assembly
  if (root.subAssembly) {
    const result = findParentSubAssemblyOffset(
      root.subAssembly.rootVoid,
      voidId,
      {
        bounds: root.bounds,
        clearance: root.subAssembly.clearance,
        materialThickness: root.subAssembly.materialThickness,
        faceOffsets: root.subAssembly.faceOffsets,
      }
    );
    if (result !== undefined) return result;
  }

  return undefined as any; // Not found in this branch
};

// Find the parent sub-assembly of a void and return the sub-assembly + parent bounds
const findParentSubAssemblyInfo = (
  root: { id: string; bounds: Bounds; children: any[]; subAssembly?: any },
  voidId: string,
  parentSubAssembly?: { subAssembly: any; parentBounds: Bounds }
): { subAssembly: any; parentBounds: Bounds } | null => {
  // Check if this void is the target
  if (root.id === voidId) {
    return parentSubAssembly || null;
  }

  // Check children
  for (const child of root.children) {
    const result = findParentSubAssemblyInfo(child, voidId, parentSubAssembly);
    if (result !== undefined) return result;
  }

  // Check inside sub-assembly
  if (root.subAssembly) {
    const result = findParentSubAssemblyInfo(
      root.subAssembly.rootVoid,
      voidId,
      { subAssembly: root.subAssembly, parentBounds: root.bounds }
    );
    if (result !== undefined) return result;
  }

  return undefined as any; // Not found in this branch
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

// Calculate lid intersections for a wall face (when lids have tabs-out)
// Returns DividerIntersection-like objects for slot cutting in walls
const getLidIntersections = (
  faceId: FaceId,
  assembly: AssemblyConfig,
  faces: { id: FaceId; solid: boolean }[],
  boxDimensions: { width: number; height: number; depth: number },
  scale: number,
  materialThickness: number
): DividerIntersection[] => {
  const intersections: DividerIntersection[] = [];
  const { width, height, depth } = boxDimensions;
  const T = materialThickness * scale;

  // Only walls get slots for lid tabs
  if (getFaceRole(faceId, assembly.assemblyAxis) !== 'wall') return [];

  // Check each lid (positive and negative)
  for (const side of ['positive', 'negative'] as const) {
    const lidConfig = assembly.lids[side];

    // Only process if lid has tabs-out, is enabled, AND is inset
    // For flush lids (inset=0), the tabs interlock with wall edges via finger joints
    // Only inset lids need separate slots cut through the wall face
    if (lidConfig.tabDirection !== 'tabs-out') continue;
    if (lidConfig.inset <= 0) continue;  // Flush lids use edge finger joints, not face slots

    const lidFaceId = getLidFaceId(assembly.assemblyAxis, side);
    const lidFace = faces.find(f => f.id === lidFaceId);
    if (!lidFace?.solid) continue;

    const inset = lidConfig.inset * scale;

    // Calculate the slot based on assembly axis and face
    // The slot is a horizontal or vertical line where the lid tabs meet this wall
    let slotPosition: number;  // Position along face's primary axis
    let slotLength: number;     // Length of the intersection
    let orientation: 'horizontal' | 'vertical';
    let startInset = 0;
    let endInset = 0;

    // Determine slot position based on which face and which lid
    switch (assembly.assemblyAxis) {
      case 'y':
        // Top/bottom are lids
        // Walls (front/back/left/right) get horizontal slots at top/bottom edges
        if (side === 'positive') {
          // Top lid - slot at top of wall
          slotPosition = (height / 2 - materialThickness / 2 - lidConfig.inset) * scale;
        } else {
          // Bottom lid - slot at bottom of wall
          slotPosition = (-height / 2 + materialThickness / 2 + lidConfig.inset) * scale;
        }
        orientation = 'horizontal';

        // Slot length depends on which wall
        if (faceId === 'front' || faceId === 'back') {
          slotLength = width * scale;
          // Insets where lid meets left/right walls
          const leftFace = faces.find(f => f.id === 'left');
          const rightFace = faces.find(f => f.id === 'right');
          startInset = leftFace?.solid ? T : 0;
          endInset = rightFace?.solid ? T : 0;
        } else {  // left or right
          slotLength = depth * scale;
          // Insets where lid meets front/back walls
          const backFace = faces.find(f => f.id === 'back');
          const frontFace = faces.find(f => f.id === 'front');
          startInset = (faceId === 'left' ? backFace : frontFace)?.solid ? T : 0;
          endInset = (faceId === 'left' ? frontFace : backFace)?.solid ? T : 0;
        }
        break;

      case 'x':
        // Left/right are lids
        // Walls (front/back/top/bottom) get vertical slots at left/right edges
        if (side === 'positive') {
          // Right lid - slot at right of wall
          slotPosition = (width / 2 - materialThickness / 2 - lidConfig.inset) * scale;
        } else {
          // Left lid - slot at left of wall
          slotPosition = (-width / 2 + materialThickness / 2 + lidConfig.inset) * scale;
        }
        orientation = 'vertical';

        // Slot length depends on which wall
        if (faceId === 'front' || faceId === 'back') {
          slotLength = height * scale;
          const topFace = faces.find(f => f.id === 'top');
          const bottomFace = faces.find(f => f.id === 'bottom');
          startInset = bottomFace?.solid ? T : 0;
          endInset = topFace?.solid ? T : 0;
        } else {  // top or bottom
          slotLength = depth * scale;
          const backFace = faces.find(f => f.id === 'back');
          const frontFace = faces.find(f => f.id === 'front');
          startInset = (faceId === 'top' ? frontFace : backFace)?.solid ? T : 0;
          endInset = (faceId === 'top' ? backFace : frontFace)?.solid ? T : 0;
        }
        break;

      case 'z':
        // Front/back are lids
        // Left/right walls get vertical slots, top/bottom walls get horizontal slots
        if (side === 'positive') {
          // Front lid - slot at front of wall (positive Z)
          if (faceId === 'left') {
            slotPosition = (depth / 2 - materialThickness / 2 - lidConfig.inset) * scale;
          } else if (faceId === 'right') {
            slotPosition = (-depth / 2 + materialThickness / 2 + lidConfig.inset) * scale;
          } else {
            // top/bottom - slot along Y (negative for top, positive for bottom due to rotation)
            slotPosition = (faceId === 'top' ? -1 : 1) * (depth / 2 - materialThickness / 2 - lidConfig.inset) * scale;
          }
        } else {
          // Back lid - slot at back of wall (negative Z)
          if (faceId === 'left') {
            slotPosition = (-depth / 2 + materialThickness / 2 + lidConfig.inset) * scale;
          } else if (faceId === 'right') {
            slotPosition = (depth / 2 - materialThickness / 2 - lidConfig.inset) * scale;
          } else {
            slotPosition = (faceId === 'top' ? 1 : -1) * (depth / 2 - materialThickness / 2 - lidConfig.inset) * scale;
          }
        }

        // Slot length and orientation depend on which wall
        if (faceId === 'left' || faceId === 'right') {
          slotLength = height * scale;
          orientation = 'vertical';
          const topFace = faces.find(f => f.id === 'top');
          const bottomFace = faces.find(f => f.id === 'bottom');
          startInset = bottomFace?.solid ? T : 0;
          endInset = topFace?.solid ? T : 0;
        } else {  // top or bottom
          slotLength = width * scale;
          orientation = 'horizontal';  // Slots run along X on top/bottom faces
          const leftFace = faces.find(f => f.id === 'left');
          const rightFace = faces.find(f => f.id === 'right');
          startInset = leftFace?.solid ? T : 0;
          endInset = rightFace?.solid ? T : 0;
        }
        break;
    }

    intersections.push({
      subdivisionId: `lid-${side}`,
      position: slotPosition,
      length: slotLength,
      orientation,
      dividerBounds: { x: 0, y: 0, z: 0, w: width, h: height, d: depth },
      dividerAxis: assembly.assemblyAxis,
      startInset,
      endInset,
    });
  }

  return intersections;
};

export const Box3D: React.FC = () => {
  const { config, faces, rootVoid, subdivisionPreview, subAssemblyPreview, selectionMode, selectedPanelIds, selectPanel, selectedAssemblyId, selectAssembly, hiddenVoidIds, isolatedVoidId, hiddenSubAssemblyIds, isolatedSubAssemblyId, hiddenFaceIds, panelsDirty, generatePanels, panelCollection, showDebugAnchors } = useBoxStore();
  const { width, height, depth } = config;

  // Auto-generate panels when dirty
  useEffect(() => {
    if (panelsDirty) {
      generatePanels();
    }
  }, [panelsDirty, generatePanels]);

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

  // Get preview void bounds if preview is active, with insets for panel thickness
  const previewVoid = subdivisionPreview ? findVoid(rootVoid, subdivisionPreview.voidId) : null;

  // Calculate offset for preview voids to convert from void coordinates to centered world coordinates
  // This needs to account for: main wall thickness, sub-assembly position, and main box center
  const previewOffset = useMemo(() => {
    if (!subdivisionPreview) return { x: 0, y: 0, z: 0 };

    const mainCenterX = config.width / 2;
    const mainCenterY = config.height / 2;
    const mainCenterZ = config.depth / 2;

    // Find the sub-assembly that contains this void
    const subAssemblyInfo = findParentSubAssemblyInfo(rootVoid, subdivisionPreview.voidId);

    if (!subAssemblyInfo) {
      // Void is in main box - offset just centers the coordinates
      // Void coords use exterior dimensions (0 to width), so we just need to subtract the center
      return {
        x: -mainCenterX,
        y: -mainCenterY,
        z: -mainCenterZ,
      };
    }

    const { subAssembly, parentBounds } = subAssemblyInfo;

    // Sub-assembly outer dimensions
    const subOuterW = subAssembly.rootVoid.bounds.w + 2 * subAssembly.materialThickness;
    const subOuterH = subAssembly.rootVoid.bounds.h + 2 * subAssembly.materialThickness;
    const subOuterD = subAssembly.rootVoid.bounds.d + 2 * subAssembly.materialThickness;

    const offsets = subAssembly.faceOffsets || { left: 0, right: 0, top: 0, bottom: 0, front: 0, back: 0 };

    // Sub-assembly center in main interior coordinates
    const subCenterX = parentBounds.x + subAssembly.clearance - offsets.left + subOuterW / 2;
    const subCenterY = parentBounds.y + subAssembly.clearance - offsets.bottom + subOuterH / 2;
    const subCenterZ = parentBounds.z + subAssembly.clearance - offsets.back + subOuterD / 2;

    // Sub-assembly interior dimensions
    const subInteriorW = subAssembly.rootVoid.bounds.w;
    const subInteriorH = subAssembly.rootVoid.bounds.h;
    const subInteriorD = subAssembly.rootVoid.bounds.d;

    // Offset to convert from sub-assembly interior coordinates to main-box-centered world coordinates
    // Interior coords (0,0,0) is the interior corner of the sub-assembly
    // This corner is at: main wall thickness + sub-assembly position + sub-assembly wall thickness
    // = mainMaterialThickness + (subCenter - subOuterSize/2 + subMaterialThickness)
    // = mainMaterialThickness + subCenter - subInteriorSize/2 - subMaterialThickness + subMaterialThickness
    // = mainMaterialThickness + subCenter - subInteriorSize/2
    return {
      x: config.materialThickness + subCenterX - subInteriorW / 2 - mainCenterX,
      y: config.materialThickness + subCenterY - subInteriorH / 2 - mainCenterY,
      z: config.materialThickness + subCenterZ - subInteriorD / 2 - mainCenterZ,
    };
  }, [rootVoid, subdivisionPreview, config]);

  // Find the sub-assembly that contains this void (for face solid checks)
  const previewSubAssembly = useMemo(() => {
    if (!subdivisionPreview) return null;
    for (const { subAssembly } of subAssemblies) {
      if (findVoid(subAssembly.rootVoid, subdivisionPreview.voidId)) {
        return subAssembly;
      }
    }
    return null;
  }, [subdivisionPreview, subAssemblies]);

  // Calculate inset bounds for preview (accounting for solid outer faces)
  const previewInsetBounds = useMemo(() => {
    if (!previewVoid) return null;
    const { bounds } = previewVoid;
    const tolerance = 0.01;

    // Use sub-assembly's material thickness and faces if inside one
    const mt = previewSubAssembly?.materialThickness ?? config.materialThickness;
    const previewFaces = previewSubAssembly?.faces ?? faces;

    // For sub-assembly voids, check against the sub-assembly's interior dimensions
    // The sub-assembly rootVoid bounds represent the interior space
    const containerW = previewSubAssembly?.rootVoid.bounds.w ?? width;
    const containerH = previewSubAssembly?.rootVoid.bounds.h ?? height;
    const containerD = previewSubAssembly?.rootVoid.bounds.d ?? depth;

    // Check which edges are at outer boundaries (of the containing box/sub-assembly)
    const atLeft = bounds.x < tolerance;
    const atRight = Math.abs(bounds.x + bounds.w - containerW) < tolerance;
    const atBottom = bounds.y < tolerance;
    const atTop = Math.abs(bounds.y + bounds.h - containerH) < tolerance;
    const atBack = bounds.z < tolerance;
    const atFront = Math.abs(bounds.z + bounds.d - containerD) < tolerance;

    // Check which faces are solid (from main box or sub-assembly)
    const leftSolid = previewFaces.find(f => f.id === 'left')?.solid ?? false;
    const rightSolid = previewFaces.find(f => f.id === 'right')?.solid ?? false;
    const bottomSolid = previewFaces.find(f => f.id === 'bottom')?.solid ?? false;
    const topSolid = previewFaces.find(f => f.id === 'top')?.solid ?? false;
    const backSolid = previewFaces.find(f => f.id === 'back')?.solid ?? false;
    const frontSolid = previewFaces.find(f => f.id === 'front')?.solid ?? false;

    // Calculate insets
    const insetLeft = (atLeft && leftSolid) ? mt : 0;
    const insetRight = (atRight && rightSolid) ? mt : 0;
    const insetBottom = (atBottom && bottomSolid) ? mt : 0;
    const insetTop = (atTop && topSolid) ? mt : 0;
    const insetBack = (atBack && backSolid) ? mt : 0;
    const insetFront = (atFront && frontSolid) ? mt : 0;

    return {
      x: bounds.x + insetLeft,
      y: bounds.y + insetBottom,
      z: bounds.z + insetBack,
      w: bounds.w - insetLeft - insetRight,
      h: bounds.h - insetBottom - insetTop,
      d: bounds.d - insetBack - insetFront,
    };
  }, [previewVoid, config.materialThickness, width, height, depth, faces, previewSubAssembly]);

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

  return (
    <group>
      {/* Wireframe box outline - RED shows outer dimensions for alignment verification */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(scaledW, scaledH, scaledD)]} />
        <lineBasicMaterial color="#ff0000" linewidth={2} />
      </lineSegments>

      {/* Debug anchor spheres at box corners (inset by half material thickness) */}
      {showDebugAnchors && anchorCorners.map((corner, idx) => (
        <mesh key={`anchor-${idx}`} position={[corner.x, corner.y, corner.z]}>
          <sphereGeometry args={[2, 16, 16]} />
          <meshStandardMaterial color="#ff6600" />
        </mesh>
      ))}

      {/* Render panels from stored paths when enabled and available */}
      {USE_STORED_PATHS && panelCollection && (
        <PanelCollectionRenderer
          scale={scale}
          selectedPanelIds={selectedPanelIds}
          onPanelClick={(selectionMode === 'panel' || selectionMode === null) ? (panelId, e) => {
            selectPanel(panelId, e?.shiftKey);
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

      {/* Face panels with finger joints and material thickness (old method, when not using stored paths) */}
      {!USE_STORED_PATHS && faceConfigs.map((faceConfig) => {
        const face = faces.find((f) => f.id === faceConfig.id);
        const isSolid = face?.solid ?? true;
        const faceId = `face-${faceConfig.id}`;
        const isHidden = hiddenFaceIds.has(faceId);

        // Skip hidden faces
        if (isHidden) return null;

        let [sizeW, sizeH] = faceConfig.size(scaledW, scaledH, scaledD);
        let position = faceConfig.position(scaledW, scaledH, scaledD);

        // Apply inset adjustments for lid faces
        const faceRole = getFaceRole(faceConfig.id, config.assembly.assemblyAxis);
        const lidSide = getLidSide(faceConfig.id, config.assembly.assemblyAxis);
        if (faceRole === 'lid' && lidSide) {
          const lidConfig = config.assembly.lids[lidSide];
          const inset = lidConfig.inset * scale;

          if (inset > 0) {
            // Adjust position: move lid inward by inset amount
            // Positive lid moves in negative direction, negative lid moves in positive direction
            const insetDirection = lidSide === 'positive' ? -1 : 1;

            switch (config.assembly.assemblyAxis) {
              case 'y':
                // Top/bottom lids - adjust Y position
                position = [position[0], position[1] + insetDirection * inset, position[2]];
                // Size stays the same when inset (tabs still go to walls, just positioned differently)
                // But if inset is large enough, size might need to shrink to fit between walls
                break;
              case 'x':
                // Left/right lids - adjust X position
                position = [position[0] + insetDirection * inset, position[1], position[2]];
                break;
              case 'z':
                // Front/back lids - adjust Z position
                position = [position[0], position[1], position[2] + insetDirection * inset];
                break;
            }
          }
        }
        const isSelectedPanel = selectedPanelIds.has(`face-${faceConfig.id}`);
        const isSelectedAssembly = selectedAssemblyId === 'main';
        const isPanelMode = selectionMode === 'panel';
        const isAssemblyMode = selectionMode === 'assembly';

        // Calculate which dividers intersect this face
        const dividerIntersections = getDividerIntersections(
          faceConfig.id,
          subdivisions,
          { width, height, depth },
          scale,
          config.materialThickness
        );

        // Calculate which lid tabs intersect this face (for walls when lids have tabs-out)
        const lidIntersections = getLidIntersections(
          faceConfig.id,
          config.assembly,
          faces,
          { width, height, depth },
          scale,
          config.materialThickness
        );

        const handleClick = (e?: React.MouseEvent) => {
          if (isPanelMode && isSolid) {
            selectPanel(`face-${faceConfig.id}`, e?.shiftKey);
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
            lidIntersections={lidIntersections}
            assembly={config.assembly}
            onClick={(isPanelMode && isSolid) || isAssemblyMode ? handleClick : undefined}
          />
        );
      })}

      {/* Existing subdivision panels with finger joints (old method, when not using stored paths) */}
      {!USE_STORED_PATHS && subdivisions.map((sub) => {
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

        const isSelected = selectedPanelIds.has(`sub-${sub.id}`);
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
            onClick={isPanelMode ? (e?: React.MouseEvent) => {
              selectPanel(`sub-${sub.id}`, e?.shiftKey);
            } : undefined}
          />
        );
      })}

      {/* Preview panels (semi-transparent, different color) with thickness */}
      {subdivisionPreview && previewVoid && previewInsetBounds && subdivisionPreview.positions.map((pos, idx) => {
        const bounds = previewInsetBounds;
        let position: [number, number, number];
        let rotation: [number, number, number];
        let size: [number, number];

        // Apply offset for converting void coords to centered world coords
        // The offset already includes the main center subtraction
        const offsetX = previewOffset.x;
        const offsetY = previewOffset.y;
        const offsetZ = previewOffset.z;

        const centerX = (bounds.x + bounds.w / 2 + offsetX) * scale;
        const centerY = (bounds.y + bounds.h / 2 + offsetY) * scale;
        const centerZ = (bounds.z + bounds.d / 2 + offsetZ) * scale;

        switch (subdivisionPreview.axis) {
          case 'x':
            position = [(pos + offsetX) * scale, centerY, centerZ];
            rotation = [0, Math.PI / 2, 0];
            size = [bounds.d * scale, bounds.h * scale];
            break;
          case 'y':
            position = [centerX, (pos + offsetY) * scale, centerZ];
            rotation = [Math.PI / 2, 0, 0];
            size = [bounds.w * scale, bounds.d * scale];
            break;
          case 'z':
            position = [centerX, centerY, (pos + offsetZ) * scale];
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
