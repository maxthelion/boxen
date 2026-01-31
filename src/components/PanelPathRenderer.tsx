import React, { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { PanelPath, PathPoint, EditorTool } from '../types';
import { useBoxStore, isPanelSelectedIn3DView, getAssemblyIdForPanel } from '../store/useBoxStore';
import { useEnginePanels, useEngineMainPanels, getEngine } from '../engine';
import { debug, enableDebugTag } from '../utils/debug';
import { useColors, getColors } from '../hooks/useColors';

/**
 * Determine panel eligibility for the active tool.
 * Returns 'eligible', 'ineligible', or null (no eligibility coloring).
 */
function getPanelEligibility(
  panel: PanelPath,
  activeTool: EditorTool
): 'eligible' | 'ineligible' | null {
  // Only show eligibility coloring for relevant tools
  if (!['inset', 'fillet', 'move', 'push-pull'].includes(activeTool)) {
    return null;
  }

  switch (activeTool) {
    case 'inset':
      // Eligible if any edge is not locked
      const hasNonLockedEdge = panel.edgeStatuses?.some(
        e => e.status !== 'locked'
      );
      return hasNonLockedEdge ? 'eligible' : 'ineligible';

    case 'fillet':
      // Eligible if any corner is eligible
      const hasEligibleCorner = panel.cornerEligibility?.some(
        c => c.eligible
      );
      return hasEligibleCorner ? 'eligible' : 'ineligible';

    case 'move':
      // Only dividers are eligible
      return panel.source.type === 'divider' ? 'eligible' : 'ineligible';

    case 'push-pull':
      // Only face panels are eligible
      return panel.source.type === 'face' ? 'eligible' : 'ineligible';

    default:
      return null;
  }
}

// Enable debug tags for debugging
// enableDebugTag('selection');  // Disabled - too verbose
enableDebugTag('slot-geometry');

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

// Helper to compute signed area (for winding order detection)
const computeSignedArea = (points: PathPoint[]): number => {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    area += (p2.x - p1.x) * (p2.y + p1.y);
  }
  return area / 2;
};

// Convert stored PathPoints to THREE.js geometry
const createGeometryFromPath = (
  outline: PathPoint[],
  holes: { points: PathPoint[] }[],
  thickness: number,
  scale: number,
  panelId?: string
): THREE.ExtrudeGeometry => {
  const scaledThickness = thickness * scale;

  // Debug: Log geometry info - check for issues with outline and holes
  const outlineArea = computeSignedArea(outline);
  const outlineMinX = Math.min(...outline.map(p => p.x));
  const outlineMaxX = Math.max(...outline.map(p => p.x));
  const outlineMinY = Math.min(...outline.map(p => p.y));
  const outlineMaxY = Math.max(...outline.map(p => p.y));

  debug('slot-geometry', `=== Panel ${panelId} Geometry ===`);
  debug('slot-geometry', `Outline: ${outline.length} points, signedArea=${outlineArea.toFixed(2)} (${outlineArea > 0 ? 'CW' : 'CCW'})`);
  debug('slot-geometry', `  Bounds: [${outlineMinX.toFixed(1)},${outlineMinY.toFixed(1)} to ${outlineMaxX.toFixed(1)},${outlineMaxY.toFixed(1)}]`);

  // Check for duplicate/near-duplicate consecutive points in outline
  const duplicateOutlinePoints: string[] = [];
  for (let i = 0; i < outline.length; i++) {
    const p1 = outline[i];
    const p2 = outline[(i + 1) % outline.length];
    const dist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
    if (dist < 0.01) {
      duplicateOutlinePoints.push(`[${i}→${(i + 1) % outline.length}]: (${p1.x.toFixed(2)},${p1.y.toFixed(2)}) → (${p2.x.toFixed(2)},${p2.y.toFixed(2)}) dist=${dist.toFixed(4)}`);
    }
  }
  if (duplicateOutlinePoints.length > 0) {
    debug('slot-geometry', `  ⚠️ DUPLICATE POINTS IN OUTLINE: ${duplicateOutlinePoints.length}`);
    duplicateOutlinePoints.forEach(d => debug('slot-geometry', `    ${d}`));
  }

  // Log all outline points
  debug('slot-geometry', `  Outline points: ${outline.map((p, i) => `[${i}](${p.x.toFixed(1)},${p.y.toFixed(1)})`).join(' → ')}`);

  if (holes.length > 0) {
    debug('slot-geometry', `Holes: ${holes.length}`);

    for (let i = 0; i < holes.length; i++) {
      const hole = holes[i];
      const holeArea = computeSignedArea(hole.points);
      const minX = Math.min(...hole.points.map(p => p.x));
      const maxX = Math.max(...hole.points.map(p => p.x));
      const minY = Math.min(...hole.points.map(p => p.y));
      const maxY = Math.max(...hole.points.map(p => p.y));

      // Check if hole is within outline bounds
      const isWithinBounds = minX >= outlineMinX && maxX <= outlineMaxX && minY >= outlineMinY && maxY <= outlineMaxY;

      // Check for same winding as outline (would cause extrusion instead of cut)
      const sameWinding = (outlineArea > 0) === (holeArea > 0);

      debug('slot-geometry', `  Hole ${i}: ${hole.points.length} pts, area=${holeArea.toFixed(2)} (${holeArea > 0 ? 'CW' : 'CCW'}) ${sameWinding ? '⚠️ SAME WINDING AS OUTLINE' : '✓ opposite winding'}`);
      debug('slot-geometry', `    Bounds: [${minX.toFixed(1)},${minY.toFixed(1)} to ${maxX.toFixed(1)},${maxY.toFixed(1)}] within=${isWithinBounds}`);
      debug('slot-geometry', `    Points: ${hole.points.map((p, j) => `[${j}](${p.x.toFixed(1)},${p.y.toFixed(1)})`).join(' → ')}`);

      // Check for duplicate points in hole
      for (let j = 0; j < hole.points.length; j++) {
        const p1 = hole.points[j];
        const p2 = hole.points[(j + 1) % hole.points.length];
        const dist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
        if (dist < 0.01) {
          debug('slot-geometry', `    ⚠️ DUPLICATE POINT: [${j}→${(j + 1) % hole.points.length}] dist=${dist.toFixed(4)}`);
        }
      }
    }
  } else {
    debug('slot-geometry', `Holes: none`);
  }

  // THREE.js expects:
  // - Main shape: counter-clockwise (CCW) winding
  // - Holes: clockwise (CW) winding
  // Our outline is CW (positive area) and holes are CCW (negative area)
  // So we need to reverse both to match THREE.js expectations

  // Reverse outline to make it CCW (THREE.js expectation for main shape)
  const outlineAreaForCorrection = computeSignedArea(outline);
  const needsOutlineReverse = outlineAreaForCorrection > 0;
  const correctedOutline = needsOutlineReverse ? [...outline].reverse() : outline;

  if (needsOutlineReverse || holes.some(h => computeSignedArea(h.points) < 0)) {
    debug('slot-geometry', `  Winding correction: outline=${needsOutlineReverse ? 'reversed' : 'ok'}, holes=${holes.filter(h => computeSignedArea(h.points) < 0).length} reversed`);
  }

  // Create the main shape from outline points (scaled)
  const shape = new THREE.Shape();
  if (correctedOutline.length > 0) {
    const first = correctedOutline[0];
    shape.moveTo(first.x * scale, first.y * scale);

    for (let i = 1; i < correctedOutline.length; i++) {
      const pt = correctedOutline[i];
      shape.lineTo(pt.x * scale, pt.y * scale);
    }

    shape.closePath();
  }

  // Add holes (scaled) - reverse to make CW (THREE.js expectation for holes)
  // Also filter out degenerate holes that touch the outline boundary
  for (const hole of holes) {
    if (hole.points.length > 0) {
      // Check if hole touches outline boundary - this creates degenerate geometry
      // that THREE.js can't triangulate (happens when slot coincides with finger joint tab)
      const holeMinX = Math.min(...hole.points.map(p => p.x));
      const holeMaxX = Math.max(...hole.points.map(p => p.x));
      const holeMinY = Math.min(...hole.points.map(p => p.y));
      const holeMaxY = Math.max(...hole.points.map(p => p.y));

      const touchesLeft = Math.abs(holeMinX - outlineMinX) < 0.01;
      const touchesRight = Math.abs(holeMaxX - outlineMaxX) < 0.01;
      const touchesBottom = Math.abs(holeMinY - outlineMinY) < 0.01;
      const touchesTop = Math.abs(holeMaxY - outlineMaxY) < 0.01;

      if (touchesLeft || touchesRight || touchesBottom || touchesTop) {
        debug('slot-geometry', `  ⚠️ SKIPPING degenerate hole that touches outline boundary`);
        continue;
      }

      const holeArea = computeSignedArea(hole.points);
      const correctedHolePoints = holeArea < 0 ? [...hole.points].reverse() : hole.points;

      const holePath = new THREE.Path();
      const first = correctedHolePoints[0];
      holePath.moveTo(first.x * scale, first.y * scale);
      for (let i = 1; i < correctedHolePoints.length; i++) {
        holePath.lineTo(correctedHolePoints[i].x * scale, correctedHolePoints[i].y * scale);
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

// Default colors from config (used when props not provided)
const defaultPanelColors = getColors();

export const PanelPathRenderer: React.FC<PanelPathRendererProps> = ({
  panel,
  scale,
  isSelected,
  isHovered = false,
  onClick,
  onDoubleClick,
  onHover,
  color = defaultPanelColors.panel.face.base,
  selectedColor = defaultPanelColors.selection.primary.base,
  hoveredColor = defaultPanelColors.interactive.hover.base,
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
      scale,
      panel.id
    );
  }, [outline, holes, thickness, scale, visible, panel.id]);

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

  // Edge color is a darker variant of the display color
  // Use the same color but rendered as lines (appears darker naturally)
  const edgeColor = displayColor;

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
            color={edgeColor}
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
  // Get centralized colors
  const colors = useColors();

  // Get panel collection from engine - automatically includes preview when active
  const panelCollection = useEnginePanels();
  // Get main (committed) panels to compare and identify new preview-only panels
  const mainPanelCollection = useEngineMainPanels();

  const hoveredPanelId = useBoxStore((state) => state.hoveredPanelId);
  const hoveredAssemblyId = useBoxStore((state) => state.hoveredAssemblyId);
  const selectedAssemblyId = useBoxStore((state) => state.selectedAssemblyId);
  const selectedSubAssemblyIds = useBoxStore((state) => state.selectedSubAssemblyIds);
  const setHoveredPanel = useBoxStore((state) => state.setHoveredPanel);

  // Edge selection state for inset tool highlighting
  const selectedEdges = useBoxStore((state) => state.selectedEdges);
  const activeTool = useBoxStore((state) => state.activeTool);

  // Build a set of panel IDs that have at least one selected edge
  const panelsWithSelectedEdges = useMemo(() => {
    if (activeTool !== 'inset' || selectedEdges.size === 0) {
      return new Set<string>();
    }
    const panelIds = new Set<string>();
    for (const edgeKey of selectedEdges) {
      // Edge key format: "panelId:edge"
      const colonIndex = edgeKey.lastIndexOf(':');
      if (colonIndex > 0) {
        const panelId = edgeKey.slice(0, colonIndex);
        panelIds.add(panelId);
      }
    }
    return panelIds;
  }, [selectedEdges, activeTool]);

  // Debug: Log selection state
  useEffect(() => {
    debug('selection', `=== Selection State ===`);
    debug('selection', `selectedPanelIds: ${JSON.stringify(Array.from(selectedPanelIds))}`);
    debug('selection', `selectedAssemblyId: ${selectedAssemblyId}`);
    debug('selection', `selectedSubAssemblyIds: ${JSON.stringify(Array.from(selectedSubAssemblyIds))}`);
    debug('selection', `hoveredPanelId: ${hoveredPanelId}`);
    debug('selection', `hoveredAssemblyId: ${hoveredAssemblyId}`);
    if (panelCollection) {
      debug('selection', `Panel IDs in collection: ${panelCollection.panels.map(p => p.id).join(', ')}`);
    }
  }, [selectedPanelIds, selectedAssemblyId, selectedSubAssemblyIds, hoveredPanelId, hoveredAssemblyId, panelCollection]);

  // Check if we're rendering a preview
  const engine = getEngine();
  const isPreviewMode = engine.hasPreview();

  // Build set of main panel IDs to identify which panels are new in preview
  const mainPanelIds = useMemo(() => {
    if (!mainPanelCollection) return new Set<string>();
    return new Set(mainPanelCollection.panels.map(p => p.id));
  }, [mainPanelCollection]);

  if (!panelCollection) {
    return null;
  }

  return (
    <>
      {panelCollection.panels.map((panel: PanelPath) => {
        // Check visibility
        if (!panel.visible) return null;
        // Check hidden by UUID (for dividers) or by face-* format (for faces)
        if (hiddenFaceIds.has(panel.id)) return null;
        if (panel.source.type === 'face' && panel.source.faceId) {
          // Check legacy face-* format used by visibility system
          const legacyFaceId = panel.source.subAssemblyId
            ? `subasm-${panel.source.subAssemblyId}-face-${panel.source.faceId}`
            : `face-${panel.source.faceId}`;
          if (hiddenFaceIds.has(legacyFaceId)) return null;
        }

        const isDivider = panel.source.type === 'divider';
        const isSubAssemblyPanel = !!panel.source.subAssemblyId;

        // Get this panel's parent assembly (using centralized helper)
        const panelAssemblyId = getAssemblyIdForPanel(panel.id);

        // Check if this panel should appear selected in 3D view
        // In 3D, we show cascade: selected assemblies highlight all their panels
        // Also highlight if the panel has selected edges (for inset tool)
        const isSelectedByPanelOrAssembly = isPanelSelectedIn3DView(panel.id, {
          selectedPanelIds,
          selectedAssemblyId,
          selectedSubAssemblyIds,
        });
        const hasSelectedEdge = panelsWithSelectedEdges.has(panel.id);
        const isSelected = isSelectedByPanelOrAssembly || hasSelectedEdge;

        // Check hover state
        const isPanelHovered = hoveredPanelId === panel.id;
        const isAssemblyHovered = hoveredAssemblyId === panelAssemblyId;
        const isHovered = isPanelHovered || isAssemblyHovered;

        // Debug: Log why each panel is selected/hovered
        if (isSelected || isHovered) {
          const isPanelDirectlySelected = selectedPanelIds.has(panel.id);
          const isAssemblySelected = selectedAssemblyId === panelAssemblyId;
          debug('selection', `Panel ${panel.id}: visuallySelected=${isSelected} (direct=${isPanelDirectlySelected}, asmSel=${isAssemblySelected}, hasEdge=${hasSelectedEdge}), hovered=${isHovered}, asmId=${panelAssemblyId}`);
        }

        // Determine panel color based on eligibility and panel type
        // Priority: selection > hover > eligibility > panel type
        const isNewPreviewPanel = isPreviewMode && !mainPanelIds.has(panel.id);
        const eligibility = getPanelEligibility(panel, activeTool);

        // Base color by panel type
        let baseColor: string;
        if (isNewPreviewPanel) {
          baseColor = colors.panel.preview.base;
        } else if (eligibility === 'eligible') {
          baseColor = colors.eligibility.eligible.base;
        } else if (eligibility === 'ineligible') {
          baseColor = colors.eligibility.ineligible.base;
        } else if (isSubAssemblyPanel) {
          baseColor = colors.panel.subAssembly.base;
        } else if (isDivider) {
          baseColor = colors.panel.divider.base;
        } else {
          baseColor = colors.panel.face.base;
        }

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
            color={baseColor}
            selectedColor={colors.selection.primary.base}
            hoveredColor={colors.interactive.hover.base}
          />
        );
      })}
    </>
  );
};
