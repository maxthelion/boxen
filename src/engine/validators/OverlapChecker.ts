/**
 * Overlap Checker - Validates that no two panels occupy the same 3D space
 *
 * This module checks for panel body intersections that would indicate
 * invalid geometry (e.g., overlapping panels, panels clipping through each other).
 *
 * Rules validated:
 * 1. overlap:no-body-intersection - Panel bodies must not overlap in 3D space
 *
 * Algorithm:
 * 1. Broad phase (AABB): Compute axis-aligned bounding box for each panel
 * 2. Narrow phase (OBB/SAT): For overlapping AABBs, use Separating Axis Theorem
 *
 * Note: Panels touching at surfaces is OK (normal assembly). Only interior
 * overlap (> tolerance) is flagged as an error.
 *
 * IMPORTANT: These rules should NOT be modified without consulting the user first.
 * They encode critical geometric constraints for laser-cut assembly.
 */

import type { Engine } from '../Engine';
import type { PanelSnapshot, Point2D, Point3D, Transform3D, AssemblySnapshot, DividerPanelSnapshot, FacePanelSnapshot, FaceId, EdgePosition } from '../types';

// =============================================================================
// Types
// =============================================================================

export type OverlapRuleId = 'overlap:no-body-intersection' | 'overlap:conflicting-extensions';

export interface OverlapValidationError {
  rule: OverlapRuleId;
  severity: 'error' | 'warning';
  message: string;
  details: {
    panelAId?: string;
    panelAKind?: string;
    panelBId?: string;
    panelBKind?: string;
    overlapAmount?: number;
    [key: string]: unknown;
  };
}

export interface OverlapCheckResult {
  valid: boolean;
  errors: OverlapValidationError[];
  warnings: OverlapValidationError[];
  summary: {
    rulesChecked: OverlapRuleId[];
    errorCount: number;
    warningCount: number;
    panelCount: number;
    pairsChecked: number;
  };
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Small epsilon for floating-point comparisons.
 * Used as a baseline tolerance when no material thickness overlap is expected.
 */
const EPSILON = 0.01; // mm

// =============================================================================
// Geometry Types
// =============================================================================

/**
 * Axis-Aligned Bounding Box
 */
interface AABB {
  min: Point3D;
  max: Point3D;
}

/**
 * Oriented Bounding Box (for SAT collision detection)
 */
interface OBB {
  center: Point3D;
  halfExtents: Point3D; // Half-sizes along each local axis
  axes: [Point3D, Point3D, Point3D]; // Local axes (unit vectors) in world space
}

// =============================================================================
// Overlap Checker Class
// =============================================================================

export class OverlapChecker {
  private errors: OverlapValidationError[] = [];
  private warnings: OverlapValidationError[] = [];
  private rulesChecked = new Set<OverlapRuleId>();
  private panelCount = 0;
  private pairsChecked = 0;
  private materialThickness = 0;

  constructor(private engine: Engine) {}

  /**
   * Run all overlap checks and return results
   */
  check(): OverlapCheckResult {
    this.errors = [];
    this.warnings = [];
    this.rulesChecked.clear();
    this.panelCount = 0;
    this.pairsChecked = 0;

    const snapshot = this.engine.getSnapshot();
    const assembly = snapshot.children[0] as AssemblySnapshot | undefined;

    if (!assembly) {
      return this.buildResult();
    }

    // Get material thickness for tolerance calculation
    // In finger joint boxes, adjacent panels intentionally overlap by MT at corners
    this.materialThickness = assembly.props.material.thickness;

    const panels = assembly.derived.panels;
    this.panelCount = panels.length;

    this.checkNoBodyIntersection(panels);
    this.checkConflictingExtensions(panels);

    return this.buildResult();
  }

  private buildResult(): OverlapCheckResult {
    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      summary: {
        rulesChecked: Array.from(this.rulesChecked),
        errorCount: this.errors.length,
        warningCount: this.warnings.length,
        panelCount: this.panelCount,
        pairsChecked: this.pairsChecked,
      },
    };
  }

  private addError(
    rule: OverlapRuleId,
    message: string,
    details: OverlapValidationError['details']
  ): void {
    this.rulesChecked.add(rule);
    this.errors.push({ rule, severity: 'error', message, details });
  }

  private markRuleChecked(rule: OverlapRuleId): void {
    this.rulesChecked.add(rule);
  }

  // ===========================================================================
  // Rule: overlap:no-body-intersection
  // ===========================================================================

  private checkNoBodyIntersection(panels: PanelSnapshot[]): void {
    this.markRuleChecked('overlap:no-body-intersection');

    if (panels.length < 2) {
      return;
    }

    // Compute AABBs for all panels
    const aabbs: AABB[] = panels.map((panel) => this.computeAABB(panel));

    // Calculate tolerance based on material thickness
    // In finger joint boxes, adjacent face panels intentionally share corner volume
    // of approximately MT × MT × MT at each corner. This is normal and expected.
    // We allow overlap up to MT + epsilon, flagging only overlap beyond this.
    const overlapTolerance = this.materialThickness + EPSILON;

    // Check all pairs (O(n^2), but n is typically small: 6-20 panels)
    for (let i = 0; i < panels.length; i++) {
      for (let j = i + 1; j < panels.length; j++) {
        this.pairsChecked++;

        // Skip cross-lap joint pairs (perpendicular dividers intentionally intersect)
        if (this.areCrossLapDividers(panels[i], panels[j])) {
          continue;
        }

        // Broad phase: AABB overlap check (using epsilon tolerance)
        if (!this.aabbOverlap(aabbs[i], aabbs[j])) {
          continue;
        }

        // Narrow phase: OBB/SAT overlap check
        const obbA = this.computeOBB(panels[i]);
        const obbB = this.computeOBB(panels[j]);

        const overlap = this.obbOverlapAmount(obbA, obbB);

        // Only flag overlap that exceeds expected material thickness overlap
        if (overlap > overlapTolerance) {
          this.addError(
            'overlap:no-body-intersection',
            `Panels overlap in 3D space beyond material thickness`,
            {
              panelAId: panels[i].id,
              panelAKind: panels[i].kind,
              panelBId: panels[j].id,
              panelBKind: panels[j].kind,
              overlapAmount: overlap,
              tolerance: overlapTolerance,
            }
          );
        }
      }
    }
  }

  /**
   * Check if two panels are perpendicular dividers that form a cross-lap joint.
   * Cross-lap joints are designed to have dividers pass through each other at half-depth,
   * so overlap between perpendicular dividers is expected and should not be flagged.
   */
  private areCrossLapDividers(panelA: PanelSnapshot, panelB: PanelSnapshot): boolean {
    // Both must be divider panels
    if (panelA.kind !== 'divider-panel' || panelB.kind !== 'divider-panel') {
      return false;
    }

    // They must be on different axes (perpendicular)
    const dividerA = panelA as DividerPanelSnapshot;
    const dividerB = panelB as DividerPanelSnapshot;

    return dividerA.props.axis !== dividerB.props.axis;
  }

  // ===========================================================================
  // Rule: overlap:conflicting-extensions
  // Checks for adjacent face panels that both extend edges meeting at a corner
  // ===========================================================================

  private checkConflictingExtensions(panels: PanelSnapshot[]): void {
    this.markRuleChecked('overlap:conflicting-extensions');

    // Filter to face panels only
    const facePanels = panels.filter(
      (p): p is FacePanelSnapshot => p.kind === 'face-panel'
    );

    if (facePanels.length < 2) {
      return;
    }

    // Build a map of face panels by faceId
    const faceMap = new Map<FaceId, FacePanelSnapshot>();
    for (const panel of facePanels) {
      // Skip sub-assembly panels
      if (panel.props.assemblyId) continue;
      faceMap.set(panel.props.faceId, panel);
    }

    // Define adjacent face pairs and their shared edges
    // When face A has extension on edgeA and face B has extension on edgeB,
    // their finger joints may clash at the corner
    const adjacentPairs: Array<{
      faceA: FaceId;
      faceB: FaceId;
      edgeA: EdgePosition; // Edge on face A that faces the corner
      edgeB: EdgePosition; // Edge on face B that faces the corner
      sharedEdge: EdgePosition; // The edge both panels can extend (e.g., 'top')
    }> = [
      // Vertical wall pairs sharing top edge
      { faceA: 'front', faceB: 'right', edgeA: 'right', edgeB: 'left', sharedEdge: 'top' },
      { faceA: 'right', faceB: 'back', edgeA: 'right', edgeB: 'left', sharedEdge: 'top' },
      { faceA: 'back', faceB: 'left', edgeA: 'right', edgeB: 'left', sharedEdge: 'top' },
      { faceA: 'left', faceB: 'front', edgeA: 'right', edgeB: 'left', sharedEdge: 'top' },
      // Vertical wall pairs sharing bottom edge
      { faceA: 'front', faceB: 'right', edgeA: 'right', edgeB: 'left', sharedEdge: 'bottom' },
      { faceA: 'right', faceB: 'back', edgeA: 'right', edgeB: 'left', sharedEdge: 'bottom' },
      { faceA: 'back', faceB: 'left', edgeA: 'right', edgeB: 'left', sharedEdge: 'bottom' },
      { faceA: 'left', faceB: 'front', edgeA: 'right', edgeB: 'left', sharedEdge: 'bottom' },
    ];

    for (const pair of adjacentPairs) {
      const panelA = faceMap.get(pair.faceA);
      const panelB = faceMap.get(pair.faceB);

      if (!panelA || !panelB) continue;

      const extA = panelA.props.edgeExtensions[pair.sharedEdge];
      const extB = panelB.props.edgeExtensions[pair.sharedEdge];

      // Both panels have extensions on the shared edge (e.g., both have top extensions)
      if (extA > EPSILON && extB > EPSILON) {
        // Check if either panel has finger joints on the edge facing the corner
        // Face panels at perpendicular corners have finger joints where they meet
        // When both extend, their finger tabs will clash in the extended region
        this.addError(
          'overlap:conflicting-extensions',
          `Adjacent panels both extend ${pair.sharedEdge} edge - finger joints will clash at corner`,
          {
            panelAId: panelA.id,
            panelAKind: panelA.kind,
            panelAFace: pair.faceA,
            panelAExtension: extA,
            panelBId: panelB.id,
            panelBKind: panelB.kind,
            panelBFace: pair.faceB,
            panelBExtension: extB,
            sharedEdge: pair.sharedEdge,
          }
        );
      }
    }
  }

  // ===========================================================================
  // Geometry Helpers
  // ===========================================================================

  /**
   * Compute Axis-Aligned Bounding Box for a panel
   * Uses the actual 2D outline bounds (which include finger joint protrusions)
   * and extrudes them by thickness to get the true 3D bounds.
   */
  private computeAABB(panel: PanelSnapshot): AABB {
    const { thickness, worldTransform, outline } = panel.derived;

    // Compute the actual 2D bounding box from the outline points
    // This includes finger joint protrusions, not just the panel body
    const outline2DBounds = this.compute2DOutlineBounds(outline.points);

    const halfT = thickness / 2;

    // Create 8 corners from the actual outline bounds
    const localCorners: Point3D[] = [
      { x: outline2DBounds.minX, y: outline2DBounds.minY, z: -halfT },
      { x: outline2DBounds.maxX, y: outline2DBounds.minY, z: -halfT },
      { x: outline2DBounds.maxX, y: outline2DBounds.maxY, z: -halfT },
      { x: outline2DBounds.minX, y: outline2DBounds.maxY, z: -halfT },
      { x: outline2DBounds.minX, y: outline2DBounds.minY, z: halfT },
      { x: outline2DBounds.maxX, y: outline2DBounds.minY, z: halfT },
      { x: outline2DBounds.maxX, y: outline2DBounds.maxY, z: halfT },
      { x: outline2DBounds.minX, y: outline2DBounds.maxY, z: halfT },
    ];

    // Transform corners to world space
    const worldCorners = localCorners.map((corner) =>
      this.transformPoint(corner, worldTransform)
    );

    // Compute AABB from world corners
    const min: Point3D = { x: Infinity, y: Infinity, z: Infinity };
    const max: Point3D = { x: -Infinity, y: -Infinity, z: -Infinity };

    for (const corner of worldCorners) {
      min.x = Math.min(min.x, corner.x);
      min.y = Math.min(min.y, corner.y);
      min.z = Math.min(min.z, corner.z);
      max.x = Math.max(max.x, corner.x);
      max.y = Math.max(max.y, corner.y);
      max.z = Math.max(max.z, corner.z);
    }

    return { min, max };
  }

  /**
   * Compute the 2D bounding box from outline points
   */
  private compute2DOutlineBounds(points: Point2D[]): { minX: number; maxX: number; minY: number; maxY: number } {
    if (points.length === 0) {
      return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    }

    let minX = points[0].x;
    let maxX = points[0].x;
    let minY = points[0].y;
    let maxY = points[0].y;

    for (const p of points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }

    return { minX, maxX, minY, maxY };
  }

  /**
   * Check if two AABBs overlap (with epsilon tolerance for touching)
   * This is a broad-phase check - we use a small epsilon here,
   * and apply the full MT-based tolerance in the narrow phase.
   */
  private aabbOverlap(a: AABB, b: AABB): boolean {
    // Check for separation along each axis
    // Allow for touching (overlap within epsilon)
    if (a.max.x < b.min.x - EPSILON || b.max.x < a.min.x - EPSILON) return false;
    if (a.max.y < b.min.y - EPSILON || b.max.y < a.min.y - EPSILON) return false;
    if (a.max.z < b.min.z - EPSILON || b.max.z < a.min.z - EPSILON) return false;
    return true;
  }

  /**
   * Compute Oriented Bounding Box for a panel
   * Uses actual outline bounds (including finger joints) for accurate collision detection
   */
  private computeOBB(panel: PanelSnapshot): OBB {
    const { thickness, worldTransform, outline } = panel.derived;

    // Compute the actual 2D bounding box from the outline points
    const outline2DBounds = this.compute2DOutlineBounds(outline.points);

    // Calculate center and half-extents from actual outline bounds
    const centerX = (outline2DBounds.minX + outline2DBounds.maxX) / 2;
    const centerY = (outline2DBounds.minY + outline2DBounds.maxY) / 2;
    const halfW = (outline2DBounds.maxX - outline2DBounds.minX) / 2;
    const halfH = (outline2DBounds.maxY - outline2DBounds.minY) / 2;

    const halfExtents: Point3D = {
      x: halfW,
      y: halfH,
      z: thickness / 2,
    };

    // Center in local space (may not be origin if outline is asymmetric)
    const localCenter: Point3D = { x: centerX, y: centerY, z: 0 };
    const center = this.transformPoint(localCenter, worldTransform);

    // Get local axes in world space (unit vectors)
    const axes = this.getRotatedAxes(worldTransform.rotation);

    return { center, halfExtents, axes };
  }

  /**
   * Check OBB overlap using Separating Axis Theorem
   * Returns the penetration depth (positive = overlap, negative = separated)
   */
  private obbOverlapAmount(a: OBB, b: OBB): number {
    // For two OBBs, we need to test 15 potential separating axes:
    // - 3 face normals from box A
    // - 3 face normals from box B
    // - 9 cross products of edge pairs (Ax × Bx, Ax × By, etc.)

    // Vector from A center to B center
    const d: Point3D = {
      x: b.center.x - a.center.x,
      y: b.center.y - a.center.y,
      z: b.center.z - a.center.z,
    };

    let minPenetration = Infinity;

    // Test the 6 face normals
    for (let i = 0; i < 3; i++) {
      const penetration = this.testAxis(a, b, a.axes[i], d);
      if (penetration < 0) return penetration; // Separated
      minPenetration = Math.min(minPenetration, penetration);
    }

    for (let i = 0; i < 3; i++) {
      const penetration = this.testAxis(a, b, b.axes[i], d);
      if (penetration < 0) return penetration; // Separated
      minPenetration = Math.min(minPenetration, penetration);
    }

    // Test the 9 cross products
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const axis = this.cross(a.axes[i], b.axes[j]);
        const len = this.vectorLength(axis);

        // Skip degenerate axes (parallel edges)
        if (len < 0.001) continue;

        // Normalize
        const normalizedAxis: Point3D = {
          x: axis.x / len,
          y: axis.y / len,
          z: axis.z / len,
        };

        const penetration = this.testAxis(a, b, normalizedAxis, d);
        if (penetration < 0) return penetration; // Separated
        minPenetration = Math.min(minPenetration, penetration);
      }
    }

    return minPenetration;
  }

  /**
   * Test a single separating axis
   * Returns penetration depth (positive = overlap, negative = separated)
   */
  private testAxis(a: OBB, b: OBB, axis: Point3D, d: Point3D): number {
    // Project the half-extents of both boxes onto the axis
    const projA = this.projectOBBOntoAxis(a, axis);
    const projB = this.projectOBBOntoAxis(b, axis);

    // Project the distance vector onto the axis
    const distance = Math.abs(this.dot(d, axis));

    // Separation = distance - combined projections
    // Positive overlap means penetration
    const overlap = projA + projB - distance;
    return overlap;
  }

  /**
   * Project OBB half-extents onto an axis
   */
  private projectOBBOntoAxis(obb: OBB, axis: Point3D): number {
    // Sum of projections of each local axis scaled by half-extent
    return (
      Math.abs(this.dot(obb.axes[0], axis)) * obb.halfExtents.x +
      Math.abs(this.dot(obb.axes[1], axis)) * obb.halfExtents.y +
      Math.abs(this.dot(obb.axes[2], axis)) * obb.halfExtents.z
    );
  }

  /**
   * Transform a point from local to world space using Euler angles
   */
  private transformPoint(point: Point3D, transform: Transform3D): Point3D {
    const [rx, ry, rz] = transform.rotation;
    const [tx, ty, tz] = transform.position;

    // Apply rotation (Euler angles in XYZ order)
    const rotated = this.rotateEulerXYZ(point, rx, ry, rz);

    // Apply translation
    return {
      x: rotated.x + tx,
      y: rotated.y + ty,
      z: rotated.z + tz,
    };
  }

  /**
   * Get local axes after rotation (Euler XYZ)
   */
  private getRotatedAxes(rotation: [number, number, number]): [Point3D, Point3D, Point3D] {
    const [rx, ry, rz] = rotation;

    // Unit vectors along local X, Y, Z
    const localX: Point3D = { x: 1, y: 0, z: 0 };
    const localY: Point3D = { x: 0, y: 1, z: 0 };
    const localZ: Point3D = { x: 0, y: 0, z: 1 };

    return [
      this.rotateEulerXYZ(localX, rx, ry, rz),
      this.rotateEulerXYZ(localY, rx, ry, rz),
      this.rotateEulerXYZ(localZ, rx, ry, rz),
    ];
  }

  /**
   * Rotate a point using Euler angles (XYZ order)
   */
  private rotateEulerXYZ(p: Point3D, rx: number, ry: number, rz: number): Point3D {
    // Rotation around X axis
    const cosX = Math.cos(rx);
    const sinX = Math.sin(rx);
    const y1 = p.y * cosX - p.z * sinX;
    const z1 = p.y * sinX + p.z * cosX;

    // Rotation around Y axis
    const cosY = Math.cos(ry);
    const sinY = Math.sin(ry);
    const x2 = p.x * cosY + z1 * sinY;
    const z2 = -p.x * sinY + z1 * cosY;

    // Rotation around Z axis
    const cosZ = Math.cos(rz);
    const sinZ = Math.sin(rz);
    const x3 = x2 * cosZ - y1 * sinZ;
    const y3 = x2 * sinZ + y1 * cosZ;

    return { x: x3, y: y3, z: z2 };
  }

  /**
   * Dot product of two vectors
   */
  private dot(a: Point3D, b: Point3D): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  /**
   * Cross product of two vectors
   */
  private cross(a: Point3D, b: Point3D): Point3D {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    };
  }

  /**
   * Length of a vector
   */
  private vectorLength(v: Point3D): number {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Check for panel overlaps in an engine's current state
 */
export function checkOverlap(engine: Engine): OverlapCheckResult {
  const checker = new OverlapChecker(engine);
  return checker.check();
}

/**
 * Format check results for display
 */
export function formatOverlapCheckResult(result: OverlapCheckResult): string {
  const lines: string[] = [];

  lines.push('='.repeat(60));
  lines.push('OVERLAP CHECK RESULTS');
  lines.push('='.repeat(60));
  lines.push('');
  lines.push(`Status: ${result.valid ? '✓ VALID' : '✗ INVALID'}`);
  lines.push(`Errors: ${result.summary.errorCount}`);
  lines.push(`Warnings: ${result.summary.warningCount}`);
  lines.push(`Panels Checked: ${result.summary.panelCount}`);
  lines.push(`Pairs Checked: ${result.summary.pairsChecked}`);
  lines.push(`Rules Checked: ${result.summary.rulesChecked.length}`);
  lines.push('');

  if (result.errors.length > 0) {
    lines.push('-'.repeat(60));
    lines.push('ERRORS');
    lines.push('-'.repeat(60));

    for (const error of result.errors) {
      lines.push('');
      lines.push(`✗ [${error.rule}]`);
      lines.push(`  ${error.message}`);
      for (const [key, value] of Object.entries(error.details)) {
        if (value !== undefined) {
          lines.push(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
        }
      }
    }
  }

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push('-'.repeat(60));
    lines.push('WARNINGS');
    lines.push('-'.repeat(60));

    for (const warning of result.warnings) {
      lines.push('');
      lines.push(`⚠ [${warning.rule}]`);
      lines.push(`  ${warning.message}`);
      for (const [key, value] of Object.entries(warning.details)) {
        if (value !== undefined) {
          lines.push(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
        }
      }
    }
  }

  lines.push('');
  lines.push('='.repeat(60));

  return lines.join('\n');
}
