/**
 * STL Export Utility
 *
 * Generates STL files from the box panel collection for use in CAD programs.
 */

import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { PanelCollection, PanelPath } from '../types';

/**
 * Create a 3D mesh from a panel path
 */
function createPanelMesh(panel: PanelPath, materialThickness: number): THREE.Mesh | null {
  if (!panel.outline || !panel.outline.points || panel.outline.points.length < 3) return null;

  // Create shape from outline
  const shape = new THREE.Shape();
  const firstPoint = panel.outline.points[0];
  shape.moveTo(firstPoint.x, firstPoint.y);

  for (let i = 1; i < panel.outline.points.length; i++) {
    const point = panel.outline.points[i];
    shape.lineTo(point.x, point.y);
  }
  shape.closePath();

  // Add holes
  if (panel.holes && panel.holes.length > 0) {
    for (const hole of panel.holes) {
      if (!hole.path || !hole.path.points || hole.path.points.length < 3) continue;

      const holePath = new THREE.Path();
      holePath.moveTo(hole.path.points[0].x, hole.path.points[0].y);
      for (let i = 1; i < hole.path.points.length; i++) {
        holePath.lineTo(hole.path.points[i].x, hole.path.points[i].y);
      }
      holePath.closePath();
      shape.holes.push(holePath);
    }
  }

  // Extrude the shape
  const extrudeSettings = {
    depth: materialThickness,
    bevelEnabled: false,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  const material = new THREE.MeshStandardMaterial({ color: 0xcccccc });
  const mesh = new THREE.Mesh(geometry, material);

  // Apply transform from panel (position and rotation arrays)
  if (panel.position) {
    mesh.position.set(
      panel.position[0],
      panel.position[1],
      panel.position[2]
    );
  }
  if (panel.rotation) {
    mesh.rotation.set(
      panel.rotation[0],
      panel.rotation[1],
      panel.rotation[2]
    );
  }

  return mesh;
}

/**
 * Generate a Three.js Group containing all panels as 3D meshes
 */
export function generateBoxGroup(
  panelCollection: PanelCollection,
  materialThickness: number
): THREE.Group {
  const group = new THREE.Group();

  for (const panel of panelCollection.panels) {
    if (!panel.visible) continue;

    const mesh = createPanelMesh(panel, materialThickness);
    if (mesh) {
      group.add(mesh);
    }
  }

  return group;
}

/**
 * Export panel collection to STL format
 */
export function generateSTL(
  panelCollection: PanelCollection,
  materialThickness: number,
  binary: boolean = true
): string | DataView {
  const group = generateBoxGroup(panelCollection, materialThickness);
  const exporter = new STLExporter();

  if (binary) {
    return exporter.parse(group, { binary: true }) as DataView;
  } else {
    return exporter.parse(group, { binary: false }) as string;
  }
}

/**
 * Download STL file
 */
export function downloadSTL(
  panelCollection: PanelCollection,
  materialThickness: number,
  filename: string = 'boxen-model.stl',
  binary: boolean = true
): void {
  const result = generateSTL(panelCollection, materialThickness, binary);

  let blob: Blob;
  if (binary && result instanceof DataView) {
    blob = new Blob([result], { type: 'application/octet-stream' });
  } else {
    blob = new Blob([result as string], { type: 'text/plain' });
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
