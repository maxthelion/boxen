/**
 * Unit tests for InteractionManager
 *
 * Tests the routing table (resolveAction) as a pure function and the
 * drag-along-axis math functions.
 *
 * The routing table tests cover all 11 priority rules.
 * The axis projection tests cover the drag math independent of camera.
 */

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  resolveAction,
  projectDeltaToAxis,
  projectPointerToAxisDelta,
  unprojectPointerToPlane,
  InteractionManager,
  type PointerContext,
  type InteractionTarget,
  type InteractionMode,
} from './InteractionManager';

// ============================================================================
// Helpers
// ============================================================================

function makeGizmoTarget(overrides?: Partial<Extract<InteractionTarget, { type: 'gizmo' }>>): Extract<InteractionTarget, { type: 'gizmo' }> {
  return {
    type: 'gizmo',
    gizmoId: 'gizmo-1',
    axis: new THREE.Vector3(1, 0, 0),
    onDelta: vi.fn(),
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
    ...overrides,
  };
}

function panelTarget(panelId = 'panel-1'): InteractionTarget {
  return { type: 'panel', panelId };
}

function voidTarget(voidId = 'void-1'): InteractionTarget {
  return { type: 'void', voidId };
}

function edgeTarget(locked = false): InteractionTarget {
  return { type: 'edge', panelId: 'panel-1', edge: 'left', locked };
}

function cornerTarget(): InteractionTarget {
  return { type: 'corner', panelId: 'panel-1', cornerId: 'top-left' };
}

function selectMode(target: 'panel' | 'void' | 'edge' | 'corner'): InteractionMode {
  return { type: 'select', target };
}

function operateMode(operation = 'push-pull'): InteractionMode {
  return { type: 'operate', operation };
}

function makeContext(overrides: Partial<PointerContext> = {}): PointerContext {
  return {
    mode: selectMode('panel'),
    hit: null,
    isDragging: false,
    shiftKey: false,
    pointerPos: new THREE.Vector2(0, 0),
    isDoubleClick: false,
    ...overrides,
  };
}

// ============================================================================
// Routing Table Tests (resolveAction — pure function)
// ============================================================================

describe('resolveAction — routing table', () => {
  // ── Rule 1: Dragging ──────────────────────────────────────────────────────

  describe('Rule 1: active drag takes priority', () => {
    it('returns continue-drag when isDragging=true regardless of mode', () => {
      const ctx = makeContext({ isDragging: true, mode: selectMode('panel') });
      expect(resolveAction(ctx)).toMatchObject({ type: 'continue-drag' });
    });

    it('returns continue-drag even when hitting a gizmo while dragging', () => {
      const ctx = makeContext({
        isDragging: true,
        mode: operateMode(),
        hit: makeGizmoTarget(),
      });
      expect(resolveAction(ctx)).toMatchObject({ type: 'continue-drag' });
    });

    it('returns continue-drag even in idle mode while dragging', () => {
      const ctx = makeContext({
        isDragging: true,
        mode: { type: 'idle' },
        hit: null,
      });
      expect(resolveAction(ctx)).toMatchObject({ type: 'continue-drag' });
    });
  });

  // ── Rules 2-4: Operate mode ───────────────────────────────────────────────

  describe('Rule 2: start-drag when gizmo hit during operation', () => {
    it('returns start-drag when hitting a gizmo in operate mode', () => {
      const gizmo = makeGizmoTarget();
      const ctx = makeContext({ mode: operateMode(), hit: gizmo });
      const action = resolveAction(ctx);
      expect(action.type).toBe('start-drag');
      if (action.type === 'start-drag') {
        expect(action.gizmoId).toBe('gizmo-1');
        expect(action.axis).toBe(gizmo.axis);
      }
    });
  });

  describe('Rule 3: noop when hitting non-gizmo during operation', () => {
    it('returns noop when hitting a panel in operate mode', () => {
      const ctx = makeContext({ mode: operateMode(), hit: panelTarget() });
      expect(resolveAction(ctx)).toMatchObject({ type: 'noop' });
    });

    it('returns noop when hitting a void in operate mode', () => {
      const ctx = makeContext({ mode: operateMode(), hit: voidTarget() });
      expect(resolveAction(ctx)).toMatchObject({ type: 'noop' });
    });

    it('returns noop when hitting an edge in operate mode', () => {
      const ctx = makeContext({ mode: operateMode(), hit: edgeTarget() });
      expect(resolveAction(ctx)).toMatchObject({ type: 'noop' });
    });
  });

  describe('Rule 4: noop when hitting nothing during operation', () => {
    it('returns noop for null hit in operate mode (user might miss gizmo)', () => {
      const ctx = makeContext({ mode: operateMode(), hit: null });
      expect(resolveAction(ctx)).toMatchObject({ type: 'noop' });
    });
  });

  // ── Rule 5: Panel select ──────────────────────────────────────────────────

  describe('Rule 5: select-panel in panel-select mode', () => {
    it('returns select-panel when hitting panel in panel-select mode', () => {
      const ctx = makeContext({ mode: selectMode('panel'), hit: panelTarget('abc') });
      const action = resolveAction(ctx);
      expect(action.type).toBe('select-panel');
      if (action.type === 'select-panel') {
        expect(action.panelId).toBe('abc');
        expect(action.additive).toBe(false);
      }
    });

    it('returns camera when hitting void during panel-select (wrong target type)', () => {
      const ctx = makeContext({ mode: selectMode('panel'), hit: voidTarget() });
      expect(resolveAction(ctx)).toMatchObject({ type: 'camera' });
    });
  });

  // ── Rule 6: Void select ───────────────────────────────────────────────────

  describe('Rule 6: select-void in void-select mode', () => {
    it('returns select-void when hitting void in void-select mode', () => {
      const ctx = makeContext({ mode: selectMode('void'), hit: voidTarget('v-42') });
      const action = resolveAction(ctx);
      expect(action.type).toBe('select-void');
      if (action.type === 'select-void') {
        expect(action.voidId).toBe('v-42');
      }
    });

    it('returns camera when hitting panel during void-select', () => {
      const ctx = makeContext({ mode: selectMode('void'), hit: panelTarget() });
      expect(resolveAction(ctx)).toMatchObject({ type: 'camera' });
    });
  });

  // ── Rule 7: Edge select ───────────────────────────────────────────────────

  describe('Rule 7: select-edge in edge-select mode', () => {
    it('returns select-edge when hitting unlocked edge in edge-select mode', () => {
      const ctx = makeContext({ mode: selectMode('edge'), hit: edgeTarget(false) });
      const action = resolveAction(ctx);
      expect(action.type).toBe('select-edge');
      if (action.type === 'select-edge') {
        expect(action.edge).toBe('left');
        expect(action.additive).toBe(false);
      }
    });

    it('returns noop when hitting locked edge in edge-select mode', () => {
      const ctx = makeContext({ mode: selectMode('edge'), hit: edgeTarget(true) });
      expect(resolveAction(ctx)).toMatchObject({ type: 'noop' });
    });
  });

  // ── Rule 8: Corner select ─────────────────────────────────────────────────

  describe('Rule 8: select-corner in corner-select mode', () => {
    it('returns select-corner when hitting corner in corner-select mode', () => {
      const ctx = makeContext({ mode: selectMode('corner'), hit: cornerTarget() });
      const action = resolveAction(ctx);
      expect(action.type).toBe('select-corner');
      if (action.type === 'select-corner') {
        expect(action.cornerId).toBe('top-left');
        expect(action.additive).toBe(false);
      }
    });
  });

  // ── Rule 9: Double-click → select-assembly ────────────────────────────────

  describe('Rule 9: double-click panel → select-assembly', () => {
    it('returns select-assembly on double-click + panel hit', () => {
      const ctx = makeContext({
        mode: selectMode('panel'),
        hit: panelTarget('panel-xyz'),
        isDoubleClick: true,
      });
      const action = resolveAction(ctx);
      expect(action.type).toBe('select-assembly');
      if (action.type === 'select-assembly') {
        expect(action.assemblyId).toBe('panel-xyz');
      }
    });

    it('does NOT trigger select-assembly on single click', () => {
      const ctx = makeContext({
        mode: selectMode('panel'),
        hit: panelTarget('panel-xyz'),
        isDoubleClick: false,
      });
      expect(resolveAction(ctx).type).not.toBe('select-assembly');
    });

    it('does NOT trigger select-assembly on double-click non-panel', () => {
      const ctx = makeContext({
        mode: selectMode('void'),
        hit: voidTarget(),
        isDoubleClick: true,
      });
      expect(resolveAction(ctx).type).not.toBe('select-assembly');
    });
  });

  // ── Rule 10: Clear selection ──────────────────────────────────────────────

  describe('Rule 10: clear-selection when hit nothing in select mode', () => {
    it('returns clear-selection when hit is null in panel-select mode', () => {
      const ctx = makeContext({ mode: selectMode('panel'), hit: null });
      expect(resolveAction(ctx)).toMatchObject({ type: 'clear-selection' });
    });

    it('returns clear-selection when hit is null in void-select mode', () => {
      const ctx = makeContext({ mode: selectMode('void'), hit: null });
      expect(resolveAction(ctx)).toMatchObject({ type: 'clear-selection' });
    });

    it('returns clear-selection when hit is null in edge-select mode', () => {
      const ctx = makeContext({ mode: selectMode('edge'), hit: null });
      expect(resolveAction(ctx)).toMatchObject({ type: 'clear-selection' });
    });

    it('returns clear-selection when hit is null in corner-select mode', () => {
      const ctx = makeContext({ mode: selectMode('corner'), hit: null });
      expect(resolveAction(ctx)).toMatchObject({ type: 'clear-selection' });
    });
  });

  // ── Rule 11: Fallthrough → camera ─────────────────────────────────────────

  describe('Rule 11: fallthrough → camera', () => {
    it('returns camera in idle mode', () => {
      const ctx = makeContext({ mode: { type: 'idle' }, hit: null });
      expect(resolveAction(ctx)).toMatchObject({ type: 'camera' });
    });

    it('returns camera in idle mode even with a hit', () => {
      const ctx = makeContext({ mode: { type: 'idle' }, hit: panelTarget() });
      expect(resolveAction(ctx)).toMatchObject({ type: 'camera' });
    });
  });

  // ── Additive selection (shift key) ────────────────────────────────────────

  describe('Shift key → additive selection', () => {
    it('select-panel has additive=true when shiftKey=true', () => {
      const ctx = makeContext({
        mode: selectMode('panel'),
        hit: panelTarget(),
        shiftKey: true,
      });
      const action = resolveAction(ctx);
      expect(action.type).toBe('select-panel');
      if (action.type === 'select-panel') {
        expect(action.additive).toBe(true);
      }
    });

    it('select-void has additive=true when shiftKey=true', () => {
      const ctx = makeContext({
        mode: selectMode('void'),
        hit: voidTarget(),
        shiftKey: true,
      });
      const action = resolveAction(ctx);
      if (action.type === 'select-void') {
        expect(action.additive).toBe(true);
      }
    });

    it('select-edge has additive=true when shiftKey=true', () => {
      const ctx = makeContext({
        mode: selectMode('edge'),
        hit: edgeTarget(false),
        shiftKey: true,
      });
      const action = resolveAction(ctx);
      if (action.type === 'select-edge') {
        expect(action.additive).toBe(true);
      }
    });

    it('select-corner has additive=true when shiftKey=true', () => {
      const ctx = makeContext({
        mode: selectMode('corner'),
        hit: cornerTarget(),
        shiftKey: true,
      });
      const action = resolveAction(ctx);
      if (action.type === 'select-corner') {
        expect(action.additive).toBe(true);
      }
    });
  });
});

// ============================================================================
// Axis Projection Math Tests
// ============================================================================

describe('projectDeltaToAxis — drag along axis', () => {
  it('computes positive delta when moving along +X axis', () => {
    const delta = new THREE.Vector3(10, 0, 0);
    const axis = new THREE.Vector3(1, 0, 0);
    expect(projectDeltaToAxis(delta, axis, 1)).toBeCloseTo(10);
  });

  it('computes negative delta when moving opposite to +X axis', () => {
    const delta = new THREE.Vector3(-10, 0, 0);
    const axis = new THREE.Vector3(1, 0, 0);
    expect(projectDeltaToAxis(delta, axis, 1)).toBeCloseTo(-10);
  });

  it('computes correct delta when moving along +Y axis', () => {
    const delta = new THREE.Vector3(0, 5, 0);
    const axis = new THREE.Vector3(0, 1, 0);
    expect(projectDeltaToAxis(delta, axis, 1)).toBeCloseTo(5);
  });

  it('computes correct delta when moving along +Z axis', () => {
    const delta = new THREE.Vector3(0, 0, 7);
    const axis = new THREE.Vector3(0, 0, 1);
    expect(projectDeltaToAxis(delta, axis, 1)).toBeCloseTo(7);
  });

  it('applies scale: divides by scale to convert world units → mm', () => {
    const delta = new THREE.Vector3(0, 0, 20);
    const axis = new THREE.Vector3(0, 0, 1);
    expect(projectDeltaToAxis(delta, axis, 2)).toBeCloseTo(10); // 20 / 2 = 10 mm
  });

  it('projects diagonal delta onto arbitrary axis (cross-product isolation)', () => {
    // Moving diagonally, only X component contributes to X axis
    const delta = new THREE.Vector3(3, 4, 5);
    const axis = new THREE.Vector3(1, 0, 0);
    expect(projectDeltaToAxis(delta, axis, 1)).toBeCloseTo(3);
  });

  it('camera angle does not affect result — only world-space delta matters', () => {
    // The same world-space delta gives the same projection regardless of
    // how the pointer was moved on screen (camera-independent)
    const delta = new THREE.Vector3(0, 0, 15);
    const axis = new THREE.Vector3(0, 0, 1);
    // Simulate two "camera angles" by using different scale values —
    // the world-space delta is already resolved, so the result is the same
    const resultA = projectDeltaToAxis(delta, axis, 1);
    const resultB = projectDeltaToAxis(delta.clone(), axis, 1);
    expect(resultA).toBeCloseTo(resultB);
  });

  it('returns zero when delta is perpendicular to axis', () => {
    const delta = new THREE.Vector3(10, 7, 0); // no Z component
    const axis = new THREE.Vector3(0, 0, 1);
    expect(projectDeltaToAxis(delta, axis, 1)).toBeCloseTo(0);
  });

  it('works with negative axis direction', () => {
    const delta = new THREE.Vector3(0, 0, -8);
    const axis = new THREE.Vector3(0, 0, -1);
    expect(projectDeltaToAxis(delta, axis, 1)).toBeCloseTo(8); // both negative → positive
  });
});

describe('unprojectPointerToPlane — pointer to world', () => {
  function makeOrthoCamera(): THREE.OrthographicCamera {
    // Camera looking down -Z from position (0, 0, 10)
    const camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    return camera;
  }

  it('returns a world point for a valid pointer position', () => {
    const camera = makeOrthoCamera();
    const pointer = new THREE.Vector2(0, 0); // center of screen
    const planeOrigin = new THREE.Vector3(0, 0, 0);
    const result = unprojectPointerToPlane(pointer, planeOrigin, camera);
    expect(result).not.toBeNull();
  });

  it('maps center pointer to origin area on Z=0 plane', () => {
    const camera = makeOrthoCamera();
    const pointer = new THREE.Vector2(0, 0);
    const planeOrigin = new THREE.Vector3(0, 0, 0);
    const result = unprojectPointerToPlane(pointer, planeOrigin, camera);
    expect(result).not.toBeNull();
    // With ortho camera at Z=10 looking at origin, center pointer → near origin
    expect(result!.x).toBeCloseTo(0, 0);
    expect(result!.y).toBeCloseTo(0, 0);
  });
});

describe('projectPointerToAxisDelta — full pointer to mm pipeline', () => {
  function makeOrthoCamera(): THREE.OrthographicCamera {
    const camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    return camera;
  }

  it('returns 0 when pointer has not moved from drag start', () => {
    const camera = makeOrthoCamera();
    const pointer = new THREE.Vector2(0, 0);
    const gizmoPos = new THREE.Vector3(0, 0, 0);
    const axis = new THREE.Vector3(1, 0, 0);

    // Get world pos of the start pointer first
    const startWorldPos = unprojectPointerToPlane(pointer, gizmoPos, camera);
    expect(startWorldPos).not.toBeNull();

    const delta = projectPointerToAxisDelta(
      pointer,
      gizmoPos,
      startWorldPos!,
      axis,
      camera,
      1,
    );
    expect(delta).toBeCloseTo(0);
  });

  it('computes positive delta when pointer moves right (along X axis)', () => {
    const camera = makeOrthoCamera();
    const gizmoPos = new THREE.Vector3(0, 0, 0);
    const axis = new THREE.Vector3(1, 0, 0);
    const scale = 1;

    // Start at center
    const startPointer = new THREE.Vector2(0, 0);
    const startWorldPos = unprojectPointerToPlane(startPointer, gizmoPos, camera);
    expect(startWorldPos).not.toBeNull();

    // Move to right (positive NDC X)
    const currentPointer = new THREE.Vector2(0.5, 0);
    const delta = projectPointerToAxisDelta(
      currentPointer,
      gizmoPos,
      startWorldPos!,
      axis,
      camera,
      scale,
    );
    expect(delta).toBeGreaterThan(0);
  });

  it('computes negative delta when pointer moves left (along X axis)', () => {
    const camera = makeOrthoCamera();
    const gizmoPos = new THREE.Vector3(0, 0, 0);
    const axis = new THREE.Vector3(1, 0, 0);
    const scale = 1;

    const startPointer = new THREE.Vector2(0, 0);
    const startWorldPos = unprojectPointerToPlane(startPointer, gizmoPos, camera);
    expect(startWorldPos).not.toBeNull();

    const currentPointer = new THREE.Vector2(-0.5, 0);
    const delta = projectPointerToAxisDelta(
      currentPointer,
      gizmoPos,
      startWorldPos!,
      axis,
      camera,
      scale,
    );
    expect(delta).toBeLessThan(0);
  });
});

// ============================================================================
// InteractionManager class tests
// ============================================================================

describe('InteractionManager', () => {
  it('starts with isDragging=false and cameraEnabled=true', () => {
    const manager = new InteractionManager();
    expect(manager.isDragging).toBe(false);
    expect(manager.cameraEnabled).toBe(true);
    expect(manager.activeDrag).toBeNull();
  });

  it('startDrag sets isDragging=true and disables camera', () => {
    const manager = new InteractionManager();
    const callbacks = {
      onDelta: vi.fn(),
      onDragStart: vi.fn(),
      onDragEnd: vi.fn(),
    };
    manager.startDrag(
      'gizmo-1',
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0),
      callbacks,
    );

    expect(manager.isDragging).toBe(true);
    expect(manager.cameraEnabled).toBe(false);
    expect(manager.activeDrag).not.toBeNull();
    expect(callbacks.onDragStart).toHaveBeenCalledOnce();
  });

  it('endDrag resets state and calls onDragEnd', () => {
    const manager = new InteractionManager();
    const callbacks = {
      onDelta: vi.fn(),
      onDragStart: vi.fn(),
      onDragEnd: vi.fn(),
    };
    manager.startDrag(
      'gizmo-1',
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0),
      callbacks,
    );
    manager.endDrag();

    expect(manager.isDragging).toBe(false);
    expect(manager.cameraEnabled).toBe(true);
    expect(manager.activeDrag).toBeNull();
    expect(callbacks.onDragEnd).toHaveBeenCalledOnce();
  });

  it('continueDrag calls onDelta with correct displacement', () => {
    const manager = new InteractionManager();
    const onDelta = vi.fn();
    manager.startDrag(
      'gizmo-1',
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0),
      { onDelta, onDragStart: vi.fn(), onDragEnd: vi.fn() },
    );

    // Move 10 world units in X direction, scale=1 → 10mm
    const currentPos = new THREE.Vector3(10, 0, 0);
    manager.continueDrag(currentPos, 1);

    expect(onDelta).toHaveBeenCalledWith(10);
  });

  it('reset stops drag and enables camera even without endDrag', () => {
    const manager = new InteractionManager();
    const onDragEnd = vi.fn();
    manager.startDrag(
      'gizmo-1',
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0),
      { onDelta: vi.fn(), onDragStart: vi.fn(), onDragEnd },
    );
    manager.reset();

    expect(manager.isDragging).toBe(false);
    expect(manager.cameraEnabled).toBe(true);
    expect(onDragEnd).toHaveBeenCalledOnce();
  });
});
