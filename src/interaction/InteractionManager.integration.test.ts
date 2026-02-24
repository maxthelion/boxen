/**
 * Integration tests for InteractionManager — full interaction flow scenarios
 *
 * These tests exercise the complete interaction lifecycle as it would occur
 * in the running app:
 *
 *  - Push-pull: clicking panel during active operation does NOT cancel
 *  - Move: panel click during active move is ignored
 *  - Selection: click, shift-click, click-empty, void mode, inset mode
 *  - Camera: drag empty → orbits, gizmo drag → camera disabled
 *  - Double-click: panel → assembly selected
 *  - Edge cases: pointer capture, ESC/reset, blur, multiple gizmos, rapid clicks
 */

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  resolveAction,
  InteractionManager,
  type PointerContext,
  type InteractionTarget,
  type InteractionMode,
  type InteractionAction,
} from './InteractionManager';

// ============================================================================
// Helpers
// ============================================================================

function panelTarget(panelId = 'panel-1'): InteractionTarget {
  return { type: 'panel', panelId };
}

function voidTarget(voidId = 'void-1'): InteractionTarget {
  return { type: 'void', voidId };
}

function edgeTarget(edge = 'left', locked = false): InteractionTarget {
  return { type: 'edge', panelId: 'panel-1', edge, locked };
}

function cornerTarget(cornerId = 'outline:0'): InteractionTarget {
  return { type: 'corner', panelId: 'panel-1', cornerId };
}

function gizmoTarget(
  gizmoId = 'gizmo-push-pull',
  overrides?: Partial<Extract<InteractionTarget, { type: 'gizmo' }>>,
): Extract<InteractionTarget, { type: 'gizmo' }> {
  return {
    type: 'gizmo',
    gizmoId,
    axis: new THREE.Vector3(0, 0, 1),
    worldPos: new THREE.Vector3(0, 0, 5),
    onDelta: vi.fn(),
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
    ...overrides,
  };
}

function operateMode(operation = 'push-pull'): InteractionMode {
  return { type: 'operate', operation };
}

function selectMode(target: 'panel' | 'void' | 'edge' | 'corner'): InteractionMode {
  return { type: 'select', target };
}

function makeCtx(overrides: Partial<PointerContext> = {}): PointerContext {
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
// Push-pull lifecycle
// ============================================================================

describe('Push-pull interaction lifecycle', () => {
  /**
   * CRITICAL: When an operation (push-pull) is active, clicking a panel
   * must NOT cancel the operation. The routing table returns 'noop' so that
   * the user can accidentally miss the gizmo without losing their work.
   */
  it('clicking panel DURING push-pull does NOT cancel operation', () => {
    const action = resolveAction(
      makeCtx({ mode: operateMode('push-pull'), hit: panelTarget() }),
    );
    expect(action.type).toBe('noop');
    expect(action.type).not.toBe('cancel-operation');
    expect(action.type).not.toBe('clear-selection');
  });

  it('clicking empty space DURING push-pull does NOT cancel operation', () => {
    const action = resolveAction(
      makeCtx({ mode: operateMode('push-pull'), hit: null }),
    );
    expect(action.type).toBe('noop');
    expect(action.type).not.toBe('cancel-operation');
    expect(action.type).not.toBe('clear-selection');
  });

  it('clicking gizmo DURING push-pull starts a drag', () => {
    const gizmo = gizmoTarget('push-pull-arrow');
    const action = resolveAction(
      makeCtx({ mode: operateMode('push-pull'), hit: gizmo }),
    );
    expect(action.type).toBe('start-drag');
    if (action.type === 'start-drag') {
      expect(action.gizmoId).toBe('push-pull-arrow');
    }
  });

  it('drag continues once started — further panel hits are ignored', () => {
    // Once isDragging=true, the routing table short-circuits to continue-drag
    // regardless of what is hit or what mode is active.
    const action = resolveAction(
      makeCtx({
        mode: operateMode('push-pull'),
        hit: panelTarget(),
        isDragging: true,
      }),
    );
    expect(action.type).toBe('continue-drag');
  });

  it('push-pull drag full lifecycle via InteractionManager', () => {
    const manager = new InteractionManager();
    const onDelta = vi.fn();
    const onDragStart = vi.fn();
    const onDragEnd = vi.fn();

    // Start drag
    manager.startDrag(
      'push-pull-arrow',
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, 0),
      { onDelta, onDragStart, onDragEnd },
      new THREE.Vector3(0, 0, 5),
    );

    expect(manager.isDragging).toBe(true);
    expect(manager.cameraEnabled).toBe(false);
    expect(onDragStart).toHaveBeenCalledOnce();

    // Continue drag — move 10 world units along Z (scale=1 → 10mm)
    manager.continueDrag(new THREE.Vector3(0, 0, 10), 1);
    expect(onDelta).toHaveBeenCalledWith(10);

    // End drag
    manager.endDrag();
    expect(manager.isDragging).toBe(false);
    expect(manager.cameraEnabled).toBe(true);
    expect(onDragEnd).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// Move lifecycle
// ============================================================================

describe('Move tool interaction lifecycle', () => {
  it('panel click during move operation is ignored (noop)', () => {
    const action = resolveAction(
      makeCtx({ mode: operateMode('move'), hit: panelTarget() }),
    );
    expect(action.type).toBe('noop');
  });

  it('clicking empty during move operation is noop (not cancel)', () => {
    const action = resolveAction(
      makeCtx({ mode: operateMode('move'), hit: null }),
    );
    expect(action.type).toBe('noop');
  });

  it('clicking move gizmo starts drag', () => {
    const gizmo = gizmoTarget('move-gizmo-x');
    const action = resolveAction(
      makeCtx({ mode: operateMode('move'), hit: gizmo }),
    );
    expect(action.type).toBe('start-drag');
    if (action.type === 'start-drag') {
      expect(action.gizmoId).toBe('move-gizmo-x');
      expect(action.axis.x).toBe(gizmo.axis.x);
    }
  });

  it('move drag: multiple continueDrag calls accumulate correctly', () => {
    const manager = new InteractionManager();
    const onDelta = vi.fn();

    manager.startDrag(
      'move-gizmo-x',
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0),
      { onDelta, onDragStart: vi.fn(), onDragEnd: vi.fn() },
    );

    // Each call computes delta from start position
    manager.continueDrag(new THREE.Vector3(5, 0, 0), 1);
    expect(onDelta).toHaveBeenLastCalledWith(5);

    manager.continueDrag(new THREE.Vector3(10, 0, 0), 1);
    expect(onDelta).toHaveBeenLastCalledWith(10);

    manager.continueDrag(new THREE.Vector3(-3, 0, 0), 1);
    expect(onDelta).toHaveBeenLastCalledWith(-3);
  });
});

// ============================================================================
// Selection modes
// ============================================================================

describe('Selection mode routing', () => {
  describe('Panel selection', () => {
    it('click panel → select-panel', () => {
      const action = resolveAction(
        makeCtx({ mode: selectMode('panel'), hit: panelTarget('abc') }),
      );
      expect(action.type).toBe('select-panel');
      if (action.type === 'select-panel') {
        expect(action.panelId).toBe('abc');
        expect(action.additive).toBe(false);
      }
    });

    it('shift+click panel → additive select-panel', () => {
      const action = resolveAction(
        makeCtx({ mode: selectMode('panel'), hit: panelTarget('abc'), shiftKey: true }),
      );
      expect(action.type).toBe('select-panel');
      if (action.type === 'select-panel') {
        expect(action.additive).toBe(true);
      }
    });

    it('click empty → clear-selection', () => {
      const action = resolveAction(
        makeCtx({ mode: selectMode('panel'), hit: null }),
      );
      expect(action.type).toBe('clear-selection');
    });
  });

  describe('Void mode', () => {
    it('click void → select-void', () => {
      const action = resolveAction(
        makeCtx({ mode: selectMode('void'), hit: voidTarget('my-void') }),
      );
      expect(action.type).toBe('select-void');
      if (action.type === 'select-void') {
        expect(action.voidId).toBe('my-void');
      }
    });

    it('click panel in void mode → camera (wrong target type)', () => {
      // Panel hits don't produce selection in void mode — fall through to camera
      const action = resolveAction(
        makeCtx({ mode: selectMode('void'), hit: panelTarget() }),
      );
      expect(action.type).toBe('camera');
    });

    it('click empty in void mode → clear-selection', () => {
      const action = resolveAction(
        makeCtx({ mode: selectMode('void'), hit: null }),
      );
      expect(action.type).toBe('clear-selection');
    });
  });

  describe('Inset tool (edge selection mode)', () => {
    it('click unlocked edge → select-edge', () => {
      const action = resolveAction(
        makeCtx({ mode: selectMode('edge'), hit: edgeTarget('top', false) }),
      );
      expect(action.type).toBe('select-edge');
      if (action.type === 'select-edge') {
        expect(action.edge).toBe('top');
      }
    });

    it('click locked edge → noop (ineligible)', () => {
      const action = resolveAction(
        makeCtx({ mode: selectMode('edge'), hit: edgeTarget('left', true) }),
      );
      expect(action.type).toBe('noop');
    });

    it('shift+click edge → additive', () => {
      const action = resolveAction(
        makeCtx({
          mode: selectMode('edge'),
          hit: edgeTarget('bottom', false),
          shiftKey: true,
        }),
      );
      expect(action.type).toBe('select-edge');
      if (action.type === 'select-edge') {
        expect(action.additive).toBe(true);
      }
    });

    it('click panel in edge mode → camera (expansion handled by controller, not routing)', () => {
      // Panel hits fall through when target is edge — the controller handles expansion
      const action = resolveAction(
        makeCtx({ mode: selectMode('edge'), hit: panelTarget() }),
      );
      expect(action.type).toBe('camera');
    });
  });

  describe('Fillet tool (corner selection mode)', () => {
    it('click corner → select-corner', () => {
      const action = resolveAction(
        makeCtx({ mode: selectMode('corner'), hit: cornerTarget('outline:3') }),
      );
      expect(action.type).toBe('select-corner');
      if (action.type === 'select-corner') {
        expect(action.cornerId).toBe('outline:3');
      }
    });

    it('shift+click corner → additive', () => {
      const action = resolveAction(
        makeCtx({
          mode: selectMode('corner'),
          hit: cornerTarget('outline:5'),
          shiftKey: true,
        }),
      );
      if (action.type === 'select-corner') {
        expect(action.additive).toBe(true);
      }
    });
  });
});

// ============================================================================
// Camera interaction
// ============================================================================

describe('Camera interaction', () => {
  it('drag on empty space → camera action (OrbitControls handles it)', () => {
    const action = resolveAction(
      makeCtx({ mode: selectMode('panel'), hit: null }),
    );
    expect(action.type).toBe('clear-selection');
    // Note: idle mode with no hit returns camera
    const idleAction = resolveAction(
      makeCtx({ mode: { type: 'idle' }, hit: null }),
    );
    expect(idleAction.type).toBe('camera');
  });

  it('InteractionManager.cameraEnabled is true initially', () => {
    const manager = new InteractionManager();
    expect(manager.cameraEnabled).toBe(true);
  });

  it('gizmo drag disables camera (cameraEnabled → false)', () => {
    const manager = new InteractionManager();
    manager.startDrag(
      'gizmo-1',
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0),
      { onDelta: vi.fn(), onDragStart: vi.fn(), onDragEnd: vi.fn() },
    );
    expect(manager.cameraEnabled).toBe(false);
  });

  it('after gizmo drag ends, camera is re-enabled', () => {
    const manager = new InteractionManager();
    manager.startDrag(
      'gizmo-1',
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0),
      { onDelta: vi.fn(), onDragStart: vi.fn(), onDragEnd: vi.fn() },
    );
    manager.endDrag();
    expect(manager.cameraEnabled).toBe(true);
  });

  it('no drag → camera action in idle mode', () => {
    const action = resolveAction(
      makeCtx({ mode: { type: 'idle' }, hit: panelTarget() }),
    );
    expect(action.type).toBe('camera');
  });

  it('resolveAction returns camera when hitting panel of wrong type during select', () => {
    // In void-select mode, hitting a panel falls through to camera
    const action = resolveAction(
      makeCtx({ mode: selectMode('void'), hit: panelTarget() }),
    );
    expect(action.type).toBe('camera');
  });
});

// ============================================================================
// Double-click → assembly selected
// ============================================================================

describe('Double-click panel → select-assembly', () => {
  it('double-click panel in select mode → select-assembly', () => {
    const action = resolveAction(
      makeCtx({
        mode: selectMode('panel'),
        hit: panelTarget('panel-xyz'),
        isDoubleClick: true,
      }),
    );
    expect(action.type).toBe('select-assembly');
    if (action.type === 'select-assembly') {
      expect(action.assemblyId).toBe('panel-xyz');
    }
  });

  it('single click on same panel is NOT treated as assembly select', () => {
    const action = resolveAction(
      makeCtx({
        mode: selectMode('panel'),
        hit: panelTarget('panel-xyz'),
        isDoubleClick: false,
      }),
    );
    expect(action.type).toBe('select-panel');
    expect(action.type).not.toBe('select-assembly');
  });

  it('double-click in operate mode does NOT select assembly (gizmo mode takes priority)', () => {
    // In operate mode, panel hits are noop regardless of double-click
    const action = resolveAction(
      makeCtx({
        mode: operateMode('push-pull'),
        hit: panelTarget('panel-xyz'),
        isDoubleClick: true,
      }),
    );
    expect(action.type).toBe('noop');
    expect(action.type).not.toBe('select-assembly');
  });

  it('double-click on void does NOT trigger assembly select', () => {
    const action = resolveAction(
      makeCtx({
        mode: selectMode('void'),
        hit: voidTarget('void-1'),
        isDoubleClick: true,
      }),
    );
    // Void hits in void-select mode → select-void (even on double-click)
    expect(action.type).toBe('select-void');
    expect(action.type).not.toBe('select-assembly');
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge case: pointer capture — drag continues after pointer leaves gizmo', () => {
  /**
   * Once a drag is started, ALL subsequent pointer events route to continue-drag
   * regardless of where the pointer is. This simulates pointer capture behaviour
   * where the dragging state is authoritative.
   */
  it('isDragging=true → continue-drag regardless of current hit', () => {
    // Hit is null (pointer left gizmo area)
    expect(resolveAction(makeCtx({ isDragging: true, hit: null })).type)
      .toBe('continue-drag');

    // Hit is a different gizmo
    expect(resolveAction(makeCtx({
      isDragging: true,
      hit: gizmoTarget('different-gizmo'),
    })).type).toBe('continue-drag');

    // Hit is a panel
    expect(resolveAction(makeCtx({
      isDragging: true,
      mode: operateMode(),
      hit: panelTarget(),
    })).type).toBe('continue-drag');

    // Hit is a void
    expect(resolveAction(makeCtx({
      isDragging: true,
      mode: selectMode('void'),
      hit: voidTarget(),
    })).type).toBe('continue-drag');
  });

  it('isDragging=true → continue-drag regardless of mode', () => {
    const modes: InteractionMode[] = [
      selectMode('panel'),
      selectMode('void'),
      selectMode('edge'),
      selectMode('corner'),
      operateMode('push-pull'),
      operateMode('move'),
      { type: 'idle' },
    ];

    for (const mode of modes) {
      const action = resolveAction(makeCtx({ isDragging: true, mode }));
      expect(action.type).toBe('continue-drag');
    }
  });
});

describe('Edge case: ESC / reset cleans up drag state', () => {
  it('reset() during active drag calls onDragEnd and resets all state', () => {
    const manager = new InteractionManager();
    const onDragEnd = vi.fn();

    manager.startDrag(
      'gizmo-1',
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0),
      { onDelta: vi.fn(), onDragStart: vi.fn(), onDragEnd },
    );

    expect(manager.isDragging).toBe(true);

    // ESC key handler would call manager.reset()
    manager.reset();

    expect(manager.isDragging).toBe(false);
    expect(manager.activeDrag).toBeNull();
    expect(manager.cameraEnabled).toBe(true);
    expect(onDragEnd).toHaveBeenCalledOnce();
  });

  it('reset() without active drag is a safe no-op', () => {
    const manager = new InteractionManager();
    expect(() => manager.reset()).not.toThrow();
    expect(manager.isDragging).toBe(false);
    expect(manager.cameraEnabled).toBe(true);
  });

  it('endDrag() without active drag is a safe no-op', () => {
    const manager = new InteractionManager();
    expect(() => manager.endDrag()).not.toThrow();
    expect(manager.isDragging).toBe(false);
  });
});

describe('Edge case: window blur during drag', () => {
  it('reset() (called on blur) cleans up drag state', () => {
    const manager = new InteractionManager();
    const onDragEnd = vi.fn();

    manager.startDrag(
      'gizmo-1',
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, 0),
      { onDelta: vi.fn(), onDragStart: vi.fn(), onDragEnd },
    );

    // Simulate window blur event handler calling reset()
    manager.reset();

    expect(manager.isDragging).toBe(false);
    expect(manager.cameraEnabled).toBe(true);
    expect(onDragEnd).toHaveBeenCalledOnce();
  });
});

describe('Edge case: multiple gizmos visible — only clicked one drags', () => {
  /**
   * When multiple gizmos exist (e.g., X, Y, Z move arrows), the raycasting
   * returns only the closest hit. resolveAction uses only the hit target,
   * so only the gizmo at the hit position starts dragging.
   */
  it('start-drag action captures only the hit gizmo ID and axis', () => {
    const clickedGizmo = gizmoTarget('gizmo-x', {
      axis: new THREE.Vector3(1, 0, 0),
    });
    const action = resolveAction(
      makeCtx({ mode: operateMode(), hit: clickedGizmo }),
    );
    expect(action.type).toBe('start-drag');
    if (action.type === 'start-drag') {
      expect(action.gizmoId).toBe('gizmo-x');
      expect(action.axis.x).toBe(1);
      expect(action.axis.y).toBe(0);
      expect(action.axis.z).toBe(0);
    }
  });

  it('a different gizmo can be started on the next pointer-down (after first drag ends)', () => {
    const manager = new InteractionManager();
    const onDelta1 = vi.fn();
    const onDelta2 = vi.fn();

    // Start drag on gizmo-x
    manager.startDrag(
      'gizmo-x',
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0),
      { onDelta: onDelta1, onDragStart: vi.fn(), onDragEnd: vi.fn() },
    );
    manager.continueDrag(new THREE.Vector3(5, 0, 0), 1);
    manager.endDrag();

    expect(onDelta1).toHaveBeenCalledWith(5);
    expect(manager.isDragging).toBe(false);

    // Start drag on gizmo-z next
    manager.startDrag(
      'gizmo-z',
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, 0),
      { onDelta: onDelta2, onDragStart: vi.fn(), onDragEnd: vi.fn() },
    );
    manager.continueDrag(new THREE.Vector3(0, 0, 7), 1);
    manager.endDrag();

    expect(onDelta2).toHaveBeenCalledWith(7);
    expect(onDelta1).toHaveBeenCalledTimes(1); // not called again
  });
});

describe('Edge case: rapid clicks — no stale state', () => {
  it('rapid startDrag/endDrag cycles leave clean state', () => {
    const manager = new InteractionManager();

    for (let i = 0; i < 5; i++) {
      const callbacks = {
        onDelta: vi.fn(),
        onDragStart: vi.fn(),
        onDragEnd: vi.fn(),
      };
      manager.startDrag(
        `gizmo-${i}`,
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(i, 0, 0),
        callbacks,
      );
      manager.endDrag();
    }

    expect(manager.isDragging).toBe(false);
    expect(manager.activeDrag).toBeNull();
    expect(manager.cameraEnabled).toBe(true);
  });

  it('multiple resolveAction calls with no-hit during operation never cancel', () => {
    // Simulate user clicking rapidly in empty space during push-pull — must all be noop
    const results: InteractionAction[] = [];
    for (let i = 0; i < 10; i++) {
      results.push(resolveAction(makeCtx({ mode: operateMode('push-pull'), hit: null })));
    }
    for (const action of results) {
      expect(action.type).toBe('noop');
    }
  });

  it('multiple panel clicks during operation all return noop (not cancel)', () => {
    const results: InteractionAction[] = [];
    for (let i = 0; i < 5; i++) {
      results.push(
        resolveAction(makeCtx({ mode: operateMode('push-pull'), hit: panelTarget(`panel-${i}`) })),
      );
    }
    for (const action of results) {
      expect(action.type).toBe('noop');
    }
  });
});

// ============================================================================
// InteractionController mode derivation logic (standalone, no React hooks)
// ============================================================================

describe('Mode derivation: operation state overrides tool mode', () => {
  /**
   * When an operation is active (push-pull, inset-outset, etc.), the interaction
   * mode becomes 'operate'. This means the operation takes priority over the
   * active tool for routing purposes.
   */

  it('in operate mode, even panel-select activeTool cannot select panels', () => {
    // Simulates: user has push-pull active and accidentally clicks a panel
    // The mode is 'operate', so the result must be noop
    const action = resolveAction(
      makeCtx({ mode: operateMode('push-pull'), hit: panelTarget() }),
    );
    expect(action.type).toBe('noop');
  });

  it('in operate mode, void hits are also noop', () => {
    const action = resolveAction(
      makeCtx({ mode: operateMode('inset-outset'), hit: voidTarget() }),
    );
    expect(action.type).toBe('noop');
  });

  it('operate mode with gizmo hit starts drag immediately', () => {
    const gizmo = gizmoTarget('offset-arrow');
    const action = resolveAction(
      makeCtx({ mode: operateMode('inset-outset'), hit: gizmo }),
    );
    expect(action.type).toBe('start-drag');
  });
});

// ============================================================================
// Drag math integration: pointer-to-world projection
// ============================================================================

describe('Drag math: projectPointerToAxisDelta via InteractionManager', () => {
  it('manager computes correct delta during drag via continueDrag', () => {
    const manager = new InteractionManager();
    const onDelta = vi.fn();

    const axis = new THREE.Vector3(0, 0, 1);
    const startWorld = new THREE.Vector3(0, 0, 0);
    const scale = 1;

    manager.startDrag('gizmo-1', axis, startWorld, {
      onDelta,
      onDragStart: vi.fn(),
      onDragEnd: vi.fn(),
    });

    // Move 20 mm in Z
    manager.continueDrag(new THREE.Vector3(0, 0, 20), scale);
    expect(onDelta).toHaveBeenCalledWith(20);

    // Move back to -10 mm in Z
    manager.continueDrag(new THREE.Vector3(0, 0, -10), scale);
    expect(onDelta).toHaveBeenLastCalledWith(-10);

    manager.endDrag();
  });

  it('scale factor correctly converts world units to mm', () => {
    const manager = new InteractionManager();
    const onDelta = vi.fn();

    // scale = 0.5: 1 world unit = 2mm
    manager.startDrag(
      'gizmo-1',
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0),
      { onDelta, onDragStart: vi.fn(), onDragEnd: vi.fn() },
    );

    manager.continueDrag(new THREE.Vector3(10, 0, 0), 0.5);
    expect(onDelta).toHaveBeenCalledWith(20); // 10 / 0.5 = 20mm

    manager.endDrag();
  });

  it('off-axis pointer movement does not contribute to drag delta', () => {
    const manager = new InteractionManager();
    const onDelta = vi.fn();

    // Axis is Z; move in XY should give ~0 delta
    manager.startDrag(
      'gizmo-1',
      new THREE.Vector3(0, 0, 1), // Z axis
      new THREE.Vector3(0, 0, 0),
      { onDelta, onDragStart: vi.fn(), onDragEnd: vi.fn() },
    );

    manager.continueDrag(new THREE.Vector3(100, 100, 0), 1); // XY movement only
    expect(onDelta).toHaveBeenCalledWith(0);

    manager.endDrag();
  });

  it('gizmoWorldPos is separate from startWorldPos', () => {
    const manager = new InteractionManager();
    const onDelta = vi.fn();

    const gizmoWorldPos = new THREE.Vector3(0, 5, 0); // gizmo is at Y=5
    const startWorldPos = new THREE.Vector3(0, 5, 0); // pointer started at gizmo center

    manager.startDrag(
      'gizmo-1',
      new THREE.Vector3(0, 1, 0),
      startWorldPos,
      { onDelta, onDragStart: vi.fn(), onDragEnd: vi.fn() },
      gizmoWorldPos,
    );

    expect(manager.activeDrag?.gizmoWorldPos).toBe(gizmoWorldPos);
    expect(manager.activeDrag?.startWorldPos).toBe(startWorldPos);

    manager.endDrag();
  });
});

// ============================================================================
// Dead code verification (symbolic — confirms the routing table does not
// implement any cancelled/cancel-operation paths that could be triggered
// by ordinary interaction during an active operation)
// ============================================================================

describe('Dead code verification: no cancel-operation on non-ESC events', () => {
  it('resolveAction never returns cancel-operation for pointer events', () => {
    // All combinations that could plausibly occur during normal use should never
    // produce cancel-operation (that is triggered by ESC key, not pointer events)
    const scenarios: PointerContext[] = [
      makeCtx({ mode: operateMode(), hit: null }),
      makeCtx({ mode: operateMode(), hit: panelTarget() }),
      makeCtx({ mode: operateMode(), hit: voidTarget() }),
      makeCtx({ mode: operateMode(), hit: edgeTarget() }),
      makeCtx({ mode: selectMode('panel'), hit: null }),
      makeCtx({ mode: selectMode('panel'), hit: panelTarget() }),
      makeCtx({ mode: { type: 'idle' }, hit: null }),
      makeCtx({ isDragging: true, hit: null }),
      makeCtx({ isDragging: true, hit: panelTarget() }),
    ];

    for (const ctx of scenarios) {
      const action = resolveAction(ctx);
      expect(action.type).not.toBe('cancel-operation');
    }
  });
});
