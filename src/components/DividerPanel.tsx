import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useBoxStore } from '../store/useBoxStore';
import { Subdivision, FaceId } from '../types';
import { generateFingerJointPath, Point } from '../utils/fingerJoints';

interface DividerPanelProps {
  subdivision: Subdivision;
  position: [number, number, number];
  rotation: [number, number, number];
  sizeW: number;  // Width in scaled units (first dimension)
  sizeH: number;  // Height in scaled units (second dimension)
  scale: number;
  boxDimensions: { width: number; height: number; depth: number };
  isSelected: boolean;
  onClick?: () => void;
}

// Determine which outer faces a divider edge meets based on axis and bounds
interface EdgeMeeting {
  position: 'top' | 'bottom' | 'left' | 'right';
  meetsFace: FaceId | null;  // Which outer face this edge meets, or null if it meets another divider
}

const getDividerEdgeMeetings = (
  axis: 'x' | 'y' | 'z',
  bounds: { x: number; y: number; z: number; w: number; h: number; d: number },
  boxDimensions: { width: number; height: number; depth: number }
): EdgeMeeting[] => {
  const { width, height, depth } = boxDimensions;
  const tolerance = 0.01;  // Small tolerance for floating point comparison

  const atLeft = bounds.x < tolerance;
  const atRight = Math.abs(bounds.x + bounds.w - width) < tolerance;
  const atBottom = bounds.y < tolerance;
  const atTop = Math.abs(bounds.y + bounds.h - height) < tolerance;
  const atBack = bounds.z < tolerance;
  const atFront = Math.abs(bounds.z + bounds.d - depth) < tolerance;

  switch (axis) {
    case 'x':
      // X-axis divider is a YZ plane - edges along Y (vertical) and Z (depth)
      // In 2D local coords: width is depth (Z), height is height (Y)
      // Top/bottom edges are horizontal (along Z/depth)
      // Left/right edges are vertical (along Y/height)
      return [
        { position: 'top', meetsFace: atTop ? 'top' : null },
        { position: 'bottom', meetsFace: atBottom ? 'bottom' : null },
        { position: 'left', meetsFace: atBack ? 'back' : null },   // left in local = back in world
        { position: 'right', meetsFace: atFront ? 'front' : null }, // right in local = front in world
      ];

    case 'y':
      // Y-axis divider is an XZ plane - edges along X (width) and Z (depth)
      // In 2D local coords: width is width (X), height is depth (Z)
      // Top/bottom edges are horizontal (along X/width)
      // Left/right edges are vertical (along Z/depth)
      return [
        { position: 'top', meetsFace: atFront ? 'front' : null },   // top in local = front in world
        { position: 'bottom', meetsFace: atBack ? 'back' : null },  // bottom in local = back in world
        { position: 'left', meetsFace: atLeft ? 'left' : null },
        { position: 'right', meetsFace: atRight ? 'right' : null },
      ];

    case 'z':
      // Z-axis divider is an XY plane - edges along X (width) and Y (height)
      // In 2D local coords: width is width (X), height is height (Y)
      return [
        { position: 'top', meetsFace: atTop ? 'top' : null },
        { position: 'bottom', meetsFace: atBottom ? 'bottom' : null },
        { position: 'left', meetsFace: atLeft ? 'left' : null },
        { position: 'right', meetsFace: atRight ? 'right' : null },
      ];
  }
};

// Dividers always have tabs going INTO the outer faces (outer faces have slots)
const shouldDividerTabOut = (meetsFace: FaceId | null): boolean => {
  // If this edge meets an outer face, it has tabs extending outward
  return meetsFace !== null;
};

export const DividerPanel: React.FC<DividerPanelProps> = ({
  subdivision,
  position,
  rotation,
  sizeW,
  sizeH,
  scale,
  boxDimensions,
  isSelected,
  onClick,
}) => {
  const { config, faces } = useBoxStore();
  const { materialThickness, fingerWidth, fingerGap } = config;

  // Compute outline points and geometry data together
  const panelData = useMemo(() => {
    const scaledThickness = materialThickness * scale;
    const scaledFingerWidth = fingerWidth * scale;

    const edgeMeetings = getDividerEdgeMeetings(subdivision.axis, subdivision.bounds, boxDimensions);

    const halfW = sizeW / 2;
    const halfH = sizeH / 2;

    // Check which edges have tabs (meet outer faces)
    const topMeeting = edgeMeetings.find(e => e.position === 'top')!;
    const bottomMeeting = edgeMeetings.find(e => e.position === 'bottom')!;
    const leftMeeting = edgeMeetings.find(e => e.position === 'left')!;
    const rightMeeting = edgeMeetings.find(e => e.position === 'right')!;

    const topHasTabs = shouldDividerTabOut(topMeeting.meetsFace) &&
                       (topMeeting.meetsFace ? faces.find(f => f.id === topMeeting.meetsFace)?.solid : false);
    const bottomHasTabs = shouldDividerTabOut(bottomMeeting.meetsFace) &&
                          (bottomMeeting.meetsFace ? faces.find(f => f.id === bottomMeeting.meetsFace)?.solid : false);
    const leftHasTabs = shouldDividerTabOut(leftMeeting.meetsFace) &&
                        (leftMeeting.meetsFace ? faces.find(f => f.id === leftMeeting.meetsFace)?.solid : false);
    const rightHasTabs = shouldDividerTabOut(rightMeeting.meetsFace) &&
                         (rightMeeting.meetsFace ? faces.find(f => f.id === rightMeeting.meetsFace)?.solid : false);

    // Inset corners where tabs will extend
    const corners: Record<string, Point> = {
      topLeft: {
        x: -halfW + (leftHasTabs ? scaledThickness : 0),
        y: halfH - (topHasTabs ? scaledThickness : 0),
      },
      topRight: {
        x: halfW - (rightHasTabs ? scaledThickness : 0),
        y: halfH - (topHasTabs ? scaledThickness : 0),
      },
      bottomRight: {
        x: halfW - (rightHasTabs ? scaledThickness : 0),
        y: -halfH + (bottomHasTabs ? scaledThickness : 0),
      },
      bottomLeft: {
        x: -halfW + (leftHasTabs ? scaledThickness : 0),
        y: -halfH + (bottomHasTabs ? scaledThickness : 0),
      },
    };

    const edgeConfigs = [
      { start: corners.topLeft, end: corners.topRight, meeting: topMeeting, hasTabs: topHasTabs },
      { start: corners.topRight, end: corners.bottomRight, meeting: rightMeeting, hasTabs: rightHasTabs },
      { start: corners.bottomRight, end: corners.bottomLeft, meeting: bottomMeeting, hasTabs: bottomHasTabs },
      { start: corners.bottomLeft, end: corners.topLeft, meeting: leftMeeting, hasTabs: leftHasTabs },
    ];

    // Collect outline points for custom edge rendering
    const outerPoints: Point[] = [];

    for (const { start, end, meeting, hasTabs } of edgeConfigs) {
      const edgeLength = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));

      let points: Point[];

      if (hasTabs && meeting.meetsFace) {
        // Use the MAXIMUM of corner insets - ensures correct gap on the inset side
        // The non-inset side (open face) will have slightly smaller gap, which is fine
        const isHorizontalEdge = meeting.position === 'top' || meeting.position === 'bottom';
        // Use Math.max: prioritize correct alignment on the closed/inset side
        // The open side will have a smaller margin, but fit is more important than aesthetics
        const cornerInset = isHorizontalEdge
          ? Math.max(leftHasTabs ? scaledThickness : 0, rightHasTabs ? scaledThickness : 0)
          : Math.max(topHasTabs ? scaledThickness : 0, bottomHasTabs ? scaledThickness : 0);
        const adjustedGapMultiplier = Math.max(0, fingerGap - cornerInset / scaledFingerWidth);

        points = generateFingerJointPath(start, end, {
          edgeLength,
          fingerWidth: scaledFingerWidth,
          materialThickness: scaledThickness,
          isTabOut: true,
          kerf: 0,
          yUp: true,
          cornerGapMultiplier: adjustedGapMultiplier,
        });
      } else {
        points = [start, end];
      }

      // Add points (skip first point after first edge to avoid duplicates)
      const startIndex = outerPoints.length === 0 ? 0 : 1;
      for (let i = startIndex; i < points.length; i++) {
        outerPoints.push(points[i]);
      }
    }

    return { outerPoints, scaledThickness, scaledFingerWidth, topHasTabs, bottomHasTabs, leftHasTabs, rightHasTabs, corners, edgeConfigs };
  }, [subdivision, sizeW, sizeH, scale, config, faces, boxDimensions, materialThickness, fingerWidth, fingerGap]);

  const geometry = useMemo(() => {
    if (!panelData) return null;

    const { scaledThickness, scaledFingerWidth, topHasTabs, bottomHasTabs, leftHasTabs, rightHasTabs, edgeConfigs } = panelData;

    const shape = new THREE.Shape();
    let isFirst = true;

    for (const { start, end, meeting, hasTabs } of edgeConfigs) {
      const edgeLength = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));

      let points: Point[];

      if (hasTabs && meeting.meetsFace) {
        // Use the MAXIMUM of corner insets - ensures correct gap on the inset side
        // The non-inset side (open face) will have slightly smaller gap, which is fine
        const isHorizontalEdge = meeting.position === 'top' || meeting.position === 'bottom';
        // Use Math.max: prioritize correct alignment on the closed/inset side
        // The open side will have a smaller margin, but fit is more important than aesthetics
        const cornerInset = isHorizontalEdge
          ? Math.max(leftHasTabs ? scaledThickness : 0, rightHasTabs ? scaledThickness : 0)
          : Math.max(topHasTabs ? scaledThickness : 0, bottomHasTabs ? scaledThickness : 0);
        const adjustedGapMultiplier = Math.max(0, fingerGap - cornerInset / scaledFingerWidth);

        points = generateFingerJointPath(start, end, {
          edgeLength,
          fingerWidth: scaledFingerWidth,
          materialThickness: scaledThickness,
          isTabOut: true,
          kerf: 0,
          yUp: true,
          cornerGapMultiplier: adjustedGapMultiplier,
        });
      } else {
        points = [start, end];
      }

      for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        if (isFirst && i === 0) {
          shape.moveTo(pt.x, pt.y);
          isFirst = false;
        } else {
          shape.lineTo(pt.x, pt.y);
        }
      }
    }

    shape.closePath();

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: scaledThickness,
      bevelEnabled: false,
    };

    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.translate(0, 0, -scaledThickness / 2);

    return geo;
  }, [panelData, fingerGap]);

  // Create custom edge geometry for outline (avoiding triangulation artifacts from EdgesGeometry)
  const customEdgesGeometry = useMemo(() => {
    if (!panelData) return null;

    const { outerPoints, scaledThickness } = panelData;
    const frontZ = scaledThickness / 2;
    const backZ = -scaledThickness / 2;

    const vertices: number[] = [];

    const addSegment = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => {
      vertices.push(x1, y1, z1, x2, y2, z2);
    };

    // Front face outline
    for (let i = 0; i < outerPoints.length; i++) {
      const p1 = outerPoints[i];
      const p2 = outerPoints[(i + 1) % outerPoints.length];
      addSegment(p1.x, p1.y, frontZ, p2.x, p2.y, frontZ);
    }

    // Back face outline
    for (let i = 0; i < outerPoints.length; i++) {
      const p1 = outerPoints[i];
      const p2 = outerPoints[(i + 1) % outerPoints.length];
      addSegment(p1.x, p1.y, backZ, p2.x, p2.y, backZ);
    }

    // Connecting edges between front and back
    for (const p of outerPoints) {
      addSegment(p.x, p.y, frontZ, p.x, p.y, backZ);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    return geo;
  }, [panelData]);

  const handleClick = onClick ? (e: THREE.Event) => {
    e.stopPropagation();
    onClick();
  } : undefined;

  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={geometry} onClick={handleClick}>
        <meshStandardMaterial
          color={isSelected ? '#9b59b6' : '#f39c12'}
          transparent
          opacity={isSelected ? 0.9 : 0.7}
          side={THREE.DoubleSide}
        />
      </mesh>
      {customEdgesGeometry && (
        <lineSegments geometry={customEdgesGeometry}>
          <lineBasicMaterial color={isSelected ? '#7b4397' : '#c77b05'} linewidth={1} />
        </lineSegments>
      )}
    </group>
  );
};
