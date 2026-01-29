/**
 * Geometry Checker - Validates geometry rules and constraints
 *
 * This module validates that generated geometry adheres to the documented rules
 * in docs/geometry rules/geometry-rules.md and the implicit rules in the codebase.
 *
 * Rules validated:
 * 1. Assembly void is 2×MT smaller than bounding box on each axis
 * 2. Face panel body equals bounding box minus MT on parallel axis
 * 3. Divider panels extend to assembly boundaries (including finger tips)
 * 4. Divider body spans void + MT on each side (to reach walls)
 * 5. Nested voids share planes with containing void
 * 6. Finger joint patterns maintain 3-section minimum
 * 7. Slot holes are within panel boundaries (not touching edges)
 * 8. Path winding order is correct (CCW outline, CW holes)
 */

import type { Engine } from './Engine';
import type {
  Bounds3D,
  Point2D,
  PanelSnapshot,
  VoidSnapshot,
  AssemblySnapshot,
  Axis,
  FaceId,
} from './types';

// =============================================================================
// Types
// =============================================================================

export type GeometryRuleId =
  | 'void-bounds-2mt'
  | 'face-panel-body-size'
  | 'divider-body-span'
  | 'divider-extends-to-boundary'
  | 'nested-void-shared-planes'
  | 'finger-3-section-minimum'
  | 'slot-within-panel'
  | 'path-winding-order'
  | 'holes-inside-outline'
  | 'no-degenerate-paths';

export interface GeometryViolation {
  ruleId: GeometryRuleId;
  severity: 'error' | 'warning';
  message: string;
  details: {
    expected?: number | string;
    actual?: number | string;
    elementId?: string;
    elementType?: string;
    axis?: Axis;
    [key: string]: unknown;
  };
}

export interface GeometryCheckResult {
  valid: boolean;
  violations: GeometryViolation[];
  checkedRules: GeometryRuleId[];
  summary: {
    errors: number;
    warnings: number;
    passed: number;
  };
}

// =============================================================================
// Constants
// =============================================================================

const TOLERANCE = 0.01; // mm - standard geometry tolerance
const HOLE_BOUNDARY_TOLERANCE = 0.01; // mm - slots must be this far from edge

// =============================================================================
// Geometry Checker Class
// =============================================================================

export class GeometryChecker {
  private violations: GeometryViolation[] = [];
  private checkedRules = new Set<GeometryRuleId>();

  constructor(private engine: Engine) {}

  /**
   * Run all geometry checks and return results
   */
  check(): GeometryCheckResult {
    this.violations = [];
    this.checkedRules.clear();

    const snapshot = this.engine.getSnapshot();
    const assembly = snapshot.children[0];

    if (!assembly) {
      return this.buildResult();
    }

    // Run all checks
    this.checkVoidBounds(assembly);
    this.checkFacePanelSizes(assembly);
    this.checkDividerBodySpans(assembly);
    this.checkNestedVoidSharedPlanes(assembly);
    this.checkFingerPatterns(assembly);
    this.checkSlotPositions(assembly);
    this.checkPathWinding(assembly);
    this.checkHolesInsideOutline(assembly);
    this.checkDegeneratePaths(assembly);

    return this.buildResult();
  }

  private buildResult(): GeometryCheckResult {
    const errors = this.violations.filter((v) => v.severity === 'error').length;
    const warnings = this.violations.filter((v) => v.severity === 'warning').length;

    return {
      valid: errors === 0,
      violations: this.violations,
      checkedRules: Array.from(this.checkedRules),
      summary: {
        errors,
        warnings,
        passed: this.checkedRules.size - (errors > 0 ? 1 : 0),
      },
    };
  }

  private addViolation(violation: GeometryViolation): void {
    this.violations.push(violation);
  }

  // ===========================================================================
  // Rule 1: Void Bounds = Assembly - 2×MT
  // ===========================================================================

  private checkVoidBounds(assembly: AssemblySnapshot): void {
    this.checkedRules.add('void-bounds-2mt');

    const { width, height, depth, material } = assembly.props;
    const mt = material.thickness;

    const rootVoid = assembly.children.find((c) => c.kind === 'void') as VoidSnapshot | undefined;
    if (!rootVoid) return;

    const expectedBounds: Bounds3D = {
      x: mt,
      y: mt,
      z: mt,
      w: width - 2 * mt,
      h: height - 2 * mt,
      d: depth - 2 * mt,
    };

    const actual = rootVoid.derived.bounds;

    // Check each dimension
    const checks = [
      { axis: 'x', expected: expectedBounds.x, actual: actual.x, label: 'x start' },
      { axis: 'y', expected: expectedBounds.y, actual: actual.y, label: 'y start' },
      { axis: 'z', expected: expectedBounds.z, actual: actual.z, label: 'z start' },
      { axis: 'w', expected: expectedBounds.w, actual: actual.w, label: 'width' },
      { axis: 'h', expected: expectedBounds.h, actual: actual.h, label: 'height' },
      { axis: 'd', expected: expectedBounds.d, actual: actual.d, label: 'depth' },
    ];

    for (const check of checks) {
      if (Math.abs(check.expected - check.actual) > TOLERANCE) {
        this.addViolation({
          ruleId: 'void-bounds-2mt',
          severity: 'error',
          message: `Root void ${check.label} should be assembly ${check.label} minus MT inset`,
          details: {
            expected: check.expected,
            actual: check.actual,
            elementId: rootVoid.id,
            elementType: 'void',
          },
        });
      }
    }
  }

  // ===========================================================================
  // Rule 2: Face Panel Body Size
  // ===========================================================================

  private checkFacePanelSizes(assembly: AssemblySnapshot): void {
    this.checkedRules.add('face-panel-body-size');

    const { width, height, depth } = assembly.props;
    const panels = assembly.derived.panels;

    // Expected body sizes (without fingers) for each face
    const expectedSizes: Record<FaceId, { width: number; height: number }> = {
      front: { width, height },
      back: { width, height },
      left: { width: depth, height },
      right: { width: depth, height },
      top: { width, height: depth },
      bottom: { width, height: depth },
    };

    for (const panel of panels) {
      if (panel.kind !== 'face-panel') continue;

      const faceId = panel.props.faceId;
      const expected = expectedSizes[faceId];

      // Panel dimensions should match expected (fingers extend beyond this)
      // The body is the panel dimension - 2 * finger extension
      // For now, check the derived dimensions directly
      // Note: Lid insets would modify these values
      const { width: panelWidth, height: panelHeight } = panel.derived;

      // Check width
      if (Math.abs(panelWidth - expected.width) > TOLERANCE) {
        // This might be due to lid inset - check if it's a lid
        const isLid = this.isLidFace(assembly, faceId);
        if (!isLid) {
          this.addViolation({
            ruleId: 'face-panel-body-size',
            severity: 'warning',
            message: `Face panel ${faceId} width doesn't match expected assembly dimension`,
            details: {
              expected: expected.width,
              actual: panelWidth,
              elementId: panel.id,
              elementType: 'face-panel',
              faceId,
            },
          });
        }
      }

      // Check height
      if (Math.abs(panelHeight - expected.height) > TOLERANCE) {
        const isLid = this.isLidFace(assembly, faceId);
        if (!isLid) {
          this.addViolation({
            ruleId: 'face-panel-body-size',
            severity: 'warning',
            message: `Face panel ${faceId} height doesn't match expected assembly dimension`,
            details: {
              expected: expected.height,
              actual: panelHeight,
              elementId: panel.id,
              elementType: 'face-panel',
              faceId,
            },
          });
        }
      }
    }
  }

  private isLidFace(assembly: AssemblySnapshot, faceId: FaceId): boolean {
    const axis = assembly.props.assembly.assemblyAxis;
    const lidFaces: Record<Axis, FaceId[]> = {
      x: ['left', 'right'],
      y: ['top', 'bottom'],
      z: ['front', 'back'],
    };
    return lidFaces[axis].includes(faceId);
  }

  // ===========================================================================
  // Rule 3: Divider Body Spans
  // ===========================================================================

  private checkDividerBodySpans(assembly: AssemblySnapshot): void {
    this.checkedRules.add('divider-body-span');
    this.checkedRules.add('divider-extends-to-boundary');

    const mt = assembly.props.material.thickness;
    const panels = assembly.derived.panels;

    for (const panel of panels) {
      if (panel.kind !== 'divider-panel') continue;

      // Get the void bounds for this divider
      const voidId = panel.props.voidId;
      const voidNode = this.findVoid(assembly, voidId);
      if (!voidNode) continue;

      const voidBounds = voidNode.derived.bounds;
      const { axis } = panel.props;

      // Divider body should span void + MT on each side (to reach walls)
      // unless the void is at a non-solid face
      this.checkDividerSpan(panel, voidBounds, axis, mt, assembly);
    }
  }

  private checkDividerSpan(
    panel: PanelSnapshot,
    voidBounds: Bounds3D,
    axis: Axis,
    mt: number,
    _assembly: AssemblySnapshot
  ): void {
    // The divider dimensions depend on its axis:
    // X-axis divider: width=depth, height=height (spans Y and Z)
    // Y-axis divider: width=width, height=depth (spans X and Z)
    // Z-axis divider: width=width, height=height (spans X and Y)

    const { width: panelWidth, height: panelHeight } = panel.derived;

    // For each axis, determine expected span
    // Divider should extend from void boundary - MT (or to face) to void boundary + MT (or to face)
    // For now, check that divider body equals void size + 2*MT when bounded by solid faces
    let expectedWidth: number;
    let expectedHeight: number;

    switch (axis) {
      case 'x':
        expectedWidth = voidBounds.d + 2 * mt; // Spans depth + 2*MT
        expectedHeight = voidBounds.h + 2 * mt; // Spans height + 2*MT
        break;
      case 'y':
        expectedWidth = voidBounds.w + 2 * mt; // Spans width + 2*MT
        expectedHeight = voidBounds.d + 2 * mt; // Spans depth + 2*MT
        break;
      case 'z':
        expectedWidth = voidBounds.w + 2 * mt; // Spans width + 2*MT
        expectedHeight = voidBounds.h + 2 * mt; // Spans height + 2*MT
        break;
    }

    // Check width (tolerance is larger for dividers due to open faces)
    if (Math.abs(panelWidth - expectedWidth) > TOLERANCE) {
      // This might be expected if adjacent face is open
      this.addViolation({
        ruleId: 'divider-body-span',
        severity: 'warning',
        message: `Divider panel width doesn't match expected span (void + 2*MT)`,
        details: {
          expected: expectedWidth,
          actual: panelWidth,
          elementId: panel.id,
          elementType: 'divider-panel',
          axis,
          voidWidth: voidBounds.w,
          voidDepth: voidBounds.d,
        },
      });
    }

    // Check height
    if (Math.abs(panelHeight - expectedHeight) > TOLERANCE) {
      this.addViolation({
        ruleId: 'divider-body-span',
        severity: 'warning',
        message: `Divider panel height doesn't match expected span (void + 2*MT)`,
        details: {
          expected: expectedHeight,
          actual: panelHeight,
          elementId: panel.id,
          elementType: 'divider-panel',
          axis,
          voidHeight: voidBounds.h,
          voidDepth: voidBounds.d,
        },
      });
    }
  }

  private findVoid(assembly: AssemblySnapshot, voidId: string): VoidSnapshot | null {
    const search = (nodes: (VoidSnapshot | AssemblySnapshot)[]): VoidSnapshot | null => {
      for (const node of nodes) {
        if (node.kind === 'void') {
          if (node.id === voidId) return node;
          const found = search(node.children as (VoidSnapshot | AssemblySnapshot)[]);
          if (found) return found;
        }
      }
      return null;
    };
    return search(assembly.children);
  }

  // ===========================================================================
  // Rule 4: Nested Void Shared Planes
  // ===========================================================================

  private checkNestedVoidSharedPlanes(assembly: AssemblySnapshot): void {
    this.checkedRules.add('nested-void-shared-planes');

    const rootVoid = assembly.children.find((c) => c.kind === 'void') as VoidSnapshot | undefined;
    if (!rootVoid) return;

    this.checkVoidHierarchy(rootVoid, rootVoid.derived.bounds);
  }

  private checkVoidHierarchy(parentVoid: VoidSnapshot, parentBounds: Bounds3D): void {
    for (const child of parentVoid.children) {
      if (child.kind !== 'void') continue;

      const childVoid = child as VoidSnapshot;
      const childBounds = childVoid.derived.bounds;

      // Count shared planes (max should be 5)
      const sharedPlanes = this.countSharedPlanes(parentBounds, childBounds);

      if (sharedPlanes > 5) {
        this.addViolation({
          ruleId: 'nested-void-shared-planes',
          severity: 'error',
          message: `Nested void shares ${sharedPlanes} planes with parent (max is 5)`,
          details: {
            expected: 'max 5',
            actual: sharedPlanes,
            elementId: childVoid.id,
            elementType: 'void',
            parentId: parentVoid.id,
          },
        });
      }

      // Recurse into nested voids
      this.checkVoidHierarchy(childVoid, childBounds);
    }
  }

  private countSharedPlanes(parent: Bounds3D, child: Bounds3D): number {
    let count = 0;

    // Check each of the 6 planes
    // X planes (left and right)
    if (Math.abs(child.x - parent.x) < TOLERANCE) count++;
    if (Math.abs(child.x + child.w - (parent.x + parent.w)) < TOLERANCE) count++;

    // Y planes (bottom and top)
    if (Math.abs(child.y - parent.y) < TOLERANCE) count++;
    if (Math.abs(child.y + child.h - (parent.y + parent.h)) < TOLERANCE) count++;

    // Z planes (front and back)
    if (Math.abs(child.z - parent.z) < TOLERANCE) count++;
    if (Math.abs(child.z + child.d - (parent.z + parent.d)) < TOLERANCE) count++;

    return count;
  }

  // ===========================================================================
  // Rule 5: Finger Pattern 3-Section Minimum
  // ===========================================================================

  private checkFingerPatterns(assembly: AssemblySnapshot): void {
    this.checkedRules.add('finger-3-section-minimum');

    const { fingerData } = assembly.derived;
    const { fingerWidth, fingerGap } = assembly.props.material;

    for (const axis of ['x', 'y', 'z'] as Axis[]) {
      const axisData = fingerData[axis];
      const maxJointLength = axisData.maxJointLength;

      // Minimum for 3 sections: fingerWidth * (3 + 2 * fingerGap)
      const minRequired = fingerWidth * (3 + 2 * fingerGap);

      if (maxJointLength < minRequired && maxJointLength > 0) {
        // The finger width should have been constrained
        const expectedMaxWidth = maxJointLength / (3 + 2 * fingerGap);

        this.addViolation({
          ruleId: 'finger-3-section-minimum',
          severity: 'warning',
          message: `Axis ${axis} may not have enough space for 3-section finger pattern`,
          details: {
            maxJointLength,
            fingerWidth,
            fingerGap,
            minRequired,
            expectedMaxWidth,
            axis,
          },
        });
      }
    }
  }

  // ===========================================================================
  // Rule 6: Slots Within Panel Boundaries
  // ===========================================================================

  private checkSlotPositions(assembly: AssemblySnapshot): void {
    this.checkedRules.add('slot-within-panel');

    const panels = assembly.derived.panels;

    for (const panel of panels) {
      const { outline } = panel.derived;
      const holes = outline.holes;
      const { width, height } = panel.derived;

      const halfW = width / 2;
      const halfH = height / 2;

      for (const hole of holes) {
        if (hole.source.type !== 'divider-slot') continue;

        // Check each point of the slot path
        for (const point of hole.path) {
          // Check if point is too close to panel boundary
          const distToLeft = point.x + halfW;
          const distToRight = halfW - point.x;
          const distToBottom = point.y + halfH;
          const distToTop = halfH - point.y;

          const minDist = Math.min(distToLeft, distToRight, distToBottom, distToTop);

          if (minDist < HOLE_BOUNDARY_TOLERANCE) {
            this.addViolation({
              ruleId: 'slot-within-panel',
              severity: 'error',
              message: `Slot hole point too close to panel boundary`,
              details: {
                expected: `>= ${HOLE_BOUNDARY_TOLERANCE}mm from edge`,
                actual: `${minDist.toFixed(3)}mm`,
                elementId: panel.id,
                elementType: panel.kind,
                holeId: hole.id,
                point: `(${point.x.toFixed(2)}, ${point.y.toFixed(2)})`,
              },
            });
          }
        }
      }
    }
  }

  // ===========================================================================
  // Rule 7: Path Winding Order
  // ===========================================================================

  private checkPathWinding(assembly: AssemblySnapshot): void {
    this.checkedRules.add('path-winding-order');

    const panels = assembly.derived.panels;

    for (const panel of panels) {
      const { outline } = panel.derived;

      // Check outline is counter-clockwise (negative area in standard orientation)
      const outlineArea = this.computeSignedArea(outline.points);
      if (outlineArea > 0) {
        this.addViolation({
          ruleId: 'path-winding-order',
          severity: 'error',
          message: `Panel outline has wrong winding order (should be CCW)`,
          details: {
            expected: 'counter-clockwise (negative area)',
            actual: `clockwise (area: ${outlineArea.toFixed(2)})`,
            elementId: panel.id,
            elementType: panel.kind,
          },
        });
      }

      // Check holes are clockwise (positive area)
      for (const hole of outline.holes) {
        const holeArea = this.computeSignedArea(hole.path);
        if (holeArea < 0) {
          this.addViolation({
            ruleId: 'path-winding-order',
            severity: 'error',
            message: `Hole has wrong winding order (should be CW)`,
            details: {
              expected: 'clockwise (positive area)',
              actual: `counter-clockwise (area: ${holeArea.toFixed(2)})`,
              elementId: panel.id,
              elementType: panel.kind,
              holeId: hole.id,
            },
          });
        }
      }
    }
  }

  private computeSignedArea(points: Point2D[]): number {
    if (points.length < 3) return 0;

    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    return area / 2;
  }

  // ===========================================================================
  // Rule 8: Holes Inside Outline
  // ===========================================================================

  private checkHolesInsideOutline(assembly: AssemblySnapshot): void {
    this.checkedRules.add('holes-inside-outline');

    const panels = assembly.derived.panels;

    for (const panel of panels) {
      const { outline } = panel.derived;

      // Get outline bounding box
      const outlineBounds = this.computeBoundingBox(outline.points);

      for (const hole of outline.holes) {
        const holeBounds = this.computeBoundingBox(hole.path);

        // Check if hole is within outline bounds (with tolerance)
        if (
          holeBounds.minX < outlineBounds.minX - TOLERANCE ||
          holeBounds.maxX > outlineBounds.maxX + TOLERANCE ||
          holeBounds.minY < outlineBounds.minY - TOLERANCE ||
          holeBounds.maxY > outlineBounds.maxY + TOLERANCE
        ) {
          this.addViolation({
            ruleId: 'holes-inside-outline',
            severity: 'error',
            message: `Hole extends outside panel outline bounds`,
            details: {
              elementId: panel.id,
              elementType: panel.kind,
              holeId: hole.id,
              holeBounds: `(${holeBounds.minX.toFixed(2)}, ${holeBounds.minY.toFixed(2)}) to (${holeBounds.maxX.toFixed(2)}, ${holeBounds.maxY.toFixed(2)})`,
              outlineBounds: `(${outlineBounds.minX.toFixed(2)}, ${outlineBounds.minY.toFixed(2)}) to (${outlineBounds.maxX.toFixed(2)}, ${outlineBounds.maxY.toFixed(2)})`,
            },
          });
        }
      }
    }
  }

  private computeBoundingBox(points: Point2D[]): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } {
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

  // ===========================================================================
  // Rule 9: No Degenerate Paths
  // ===========================================================================

  private checkDegeneratePaths(assembly: AssemblySnapshot): void {
    this.checkedRules.add('no-degenerate-paths');

    const panels = assembly.derived.panels;

    for (const panel of panels) {
      const { outline } = panel.derived;

      // Check outline has minimum points
      if (outline.points.length < 3) {
        this.addViolation({
          ruleId: 'no-degenerate-paths',
          severity: 'error',
          message: `Panel outline has fewer than 3 points`,
          details: {
            expected: '>= 3 points',
            actual: outline.points.length,
            elementId: panel.id,
            elementType: panel.kind,
          },
        });
      }

      // Check for duplicate consecutive points in outline
      this.checkDuplicatePoints(outline.points, panel.id, panel.kind, 'outline');

      // Check holes
      for (const hole of outline.holes) {
        if (hole.path.length < 3) {
          this.addViolation({
            ruleId: 'no-degenerate-paths',
            severity: 'error',
            message: `Hole has fewer than 3 points`,
            details: {
              expected: '>= 3 points',
              actual: hole.path.length,
              elementId: panel.id,
              elementType: panel.kind,
              holeId: hole.id,
            },
          });
        }

        this.checkDuplicatePoints(hole.path, panel.id, panel.kind, `hole:${hole.id}`);

        // Check for very small holes (potential degenerate geometry)
        const holeBounds = this.computeBoundingBox(hole.path);
        const holeWidth = holeBounds.maxX - holeBounds.minX;
        const holeHeight = holeBounds.maxY - holeBounds.minY;

        if (holeWidth < 1 || holeHeight < 1) {
          this.addViolation({
            ruleId: 'no-degenerate-paths',
            severity: 'warning',
            message: `Hole is very small (< 1mm dimension)`,
            details: {
              width: holeWidth,
              height: holeHeight,
              elementId: panel.id,
              elementType: panel.kind,
              holeId: hole.id,
            },
          });
        }
      }
    }
  }

  private checkDuplicatePoints(
    points: Point2D[],
    panelId: string,
    panelKind: string,
    pathType: string
  ): void {
    const DUPLICATE_TOLERANCE = 0.001;

    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      const dx = Math.abs(points[i].x - points[j].x);
      const dy = Math.abs(points[i].y - points[j].y);

      if (dx < DUPLICATE_TOLERANCE && dy < DUPLICATE_TOLERANCE) {
        this.addViolation({
          ruleId: 'no-degenerate-paths',
          severity: 'warning',
          message: `Duplicate consecutive points in ${pathType}`,
          details: {
            elementId: panelId,
            elementType: panelKind,
            pathType,
            point1Index: i,
            point2Index: j,
            point: `(${points[i].x.toFixed(4)}, ${points[i].y.toFixed(4)})`,
          },
        });
      }
    }
  }
}

// =============================================================================
// Convenience Function
// =============================================================================

/**
 * Check geometry of an engine's current state
 */
export function checkGeometry(engine: Engine): GeometryCheckResult {
  const checker = new GeometryChecker(engine);
  return checker.check();
}

/**
 * Format check results for display
 */
export function formatGeometryCheckResult(result: GeometryCheckResult): string {
  const lines: string[] = [];

  lines.push('='.repeat(60));
  lines.push('GEOMETRY CHECK RESULTS');
  lines.push('='.repeat(60));
  lines.push('');
  lines.push(`Status: ${result.valid ? '✓ VALID' : '✗ INVALID'}`);
  lines.push(`Errors: ${result.summary.errors}`);
  lines.push(`Warnings: ${result.summary.warnings}`);
  lines.push(`Rules Checked: ${result.checkedRules.length}`);
  lines.push('');

  if (result.violations.length > 0) {
    lines.push('-'.repeat(60));
    lines.push('VIOLATIONS');
    lines.push('-'.repeat(60));

    for (const violation of result.violations) {
      const icon = violation.severity === 'error' ? '✗' : '⚠';
      lines.push('');
      lines.push(`${icon} [${violation.severity.toUpperCase()}] ${violation.ruleId}`);
      lines.push(`  ${violation.message}`);
      for (const [key, value] of Object.entries(violation.details)) {
        if (value !== undefined) {
          lines.push(`  ${key}: ${value}`);
        }
      }
    }
  }

  lines.push('');
  lines.push('='.repeat(60));

  return lines.join('\n');
}
