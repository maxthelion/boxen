# Unified Pointer Interaction Manager for 3D/2D Views

**Status:** Idea
**Captured:** 2026-02-24

## Raw

> Clicking and dragging do different things at different points in the operation lifecycle (sometimes selecting, sometimes changing values for the operation, sometimes changing the camera). We're tackling it piecemeal, when it needs to be seen as part of a bigger pattern. The gizmo rewrite didn't fix the fundamental problem — clicking on an arrow or face during push-pull still cancels the operation by triggering panel selection underneath.

## The Problem

Every pointer event in the 3D view can mean one of several things depending on context:

| User Action | During Selection | During Operation | During Drag |
|-------------|-----------------|------------------|-------------|
| Click mesh | Select panel | ??? (currently: re-selects, cancels op) | N/A |
| Click empty | Clear selection | Should cancel? Or no-op? | N/A |
| Drag mesh | Orbit (passthrough) | Adjust value via gizmo | Already dragging |
| Drag empty | Orbit camera | Orbit camera | Already dragging |

The "???" row is the bug. There's no single place that decides "what does this click mean right now?" Instead, each component independently decides:

- **PanelPathRenderer** — "I was clicked, so I'll call `selectPanel()`"
- **AxisGizmo** — "I was clicked, so I'll start a drag"
- **Viewport3D useEffect** — "selectedFaceId changed, so I'll cancel the operation"
- **OrbitControls** — "nobody told me to stop, so I'll orbit"

These fire independently and race against each other.

## Current Architecture (Audit)

### Where pointer events are handled (12+ locations)

| Layer | Component | Events | What It Does |
|-------|-----------|--------|-------------|
| Canvas | Viewport3D | `onPointerMissed` | Clear selection on empty click |
| Canvas | OrbitControls | drag | Camera orbit/pan/zoom |
| 3D Mesh | AxisGizmo | down/move/up/enter/leave | Drag-along-axis for gizmos |
| 3D Mesh | PanelPathRenderer | click, dblclick, over/out | Panel selection + hover |
| 3D Mesh | VoidMesh | click, over/out | Void selection (only in void mode) |
| 3D Mesh | PanelEdgeRenderer | click, over/out | Edge selection (inset tool) |
| SVG | SketchView2D | mousedown/move/up | Drawing, panning, edge drag |

### Ad-hoc coordination mechanisms

1. **Drag flags** — `isDraggingArrow`, `isDraggingMoveGizmo` in Viewport3D. Each new gizmo adds another flag. OrbitControls checks all of them.

2. **Conditional handler mounting** — VoidMesh attaches `onClick` only when `selectionMode === 'void'`. PanelEdgeRenderer only renders when `activeTool === 'inset'`. PanelPathRenderer always has handlers but sometimes no-ops inside them.

3. **stopPropagation()** — Every handler calls it independently. If one forgets, events leak through. If one calls it but another handler on a different mesh in the same raycast already fired, it's too late.

4. **useEffect watchers** — Viewport3D has effects that watch store state (selectedFaceId, activeTool) and cancel operations when state changes unexpectedly. These are the most fragile part — a legitimate interaction triggers a state change that an effect interprets as "operation should cancel."

5. **Tool-gated logic** — `activeTool` checked inside 6+ handlers to decide behavior. No central mapping of tool → allowed interactions.

## Why Piecemeal Fixes Don't Work

The gizmo rewrite (PR #75) correctly implemented `stopPropagation()` on AxisGizmo. But the panel click handler fires on a *different mesh in the same raycast*, which `stopPropagation()` on the gizmo mesh doesn't prevent. React Three Fiber fires events on all intersected meshes independently.

Any fix to this specific bug (e.g., "don't selectPanel when operation is active") will paper over the symptom. The next tool or interaction will hit the same class of problem because there's no single authority deciding "what does this pointer event mean right now?"

## Proposed Solution: Interaction State Machine

### Core Idea

A single `InteractionManager` that owns the interpretation of all pointer events. Components register what they *can* do, the manager decides what *actually happens* based on the current state.

### Interaction Modes

```typescript
type InteractionMode =
  | { type: 'select'; target: 'panel' | 'void' | 'edge' | 'corner' }
  | { type: 'operate'; operation: string; phase: 'idle' | 'adjusting' }
  | { type: 'draw'; tool: string }  // 2D view
  | { type: 'camera' }  // orbit/pan/zoom
```

### Event Routing Table

The manager maintains a priority-ordered routing table:

```typescript
const ROUTING: Route[] = [
  // Highest priority: active drag always wins
  { when: (state) => state.isDragging, handle: 'continue-drag' },

  // Gizmo hover/click during operation
  { when: (state) => state.mode.type === 'operate' && state.hitGizmo, handle: 'start-drag' },

  // Panel click during operation — IGNORE (don't re-select)
  { when: (state) => state.mode.type === 'operate' && state.hitPanel, handle: 'noop' },

  // Panel click during selection
  { when: (state) => state.mode.type === 'select' && state.hitPanel, handle: 'select-panel' },

  // Empty click during operation — cancel
  { when: (state) => state.mode.type === 'operate' && state.hitNothing, handle: 'cancel-op' },

  // Empty click during selection — clear selection
  { when: (state) => state.mode.type === 'select' && state.hitNothing, handle: 'clear-selection' },

  // Fallthrough: camera control
  { when: () => true, handle: 'camera' },
];
```

### How Components Participate

Components stop being event handlers and become event *targets*:

```typescript
// PanelPathRenderer — registers as clickable, doesn't handle clicks
<mesh
  userData={{ interactionTarget: { type: 'panel', id: panelId } }}
  // NO onClick handler
/>

// AxisGizmo — registers as draggable, doesn't handle selection
<mesh
  userData={{ interactionTarget: { type: 'gizmo', axis: axisVec, onDelta } }}
  // NO onClick handler that might conflict
/>
```

The InteractionManager intercepts all pointer events at the Canvas level, raycasts, inspects `userData.interactionTarget` on the first hit, and routes to the correct behavior.

### Benefits

1. **Single decision point** — No more racing handlers. One function decides what every click/drag means.
2. **Explicit routing table** — Easy to read, test, and extend. "What happens when I click a panel during push-pull?" → look at the table.
3. **No stopPropagation needed** — Events don't bubble to individual meshes. The manager consumes them.
4. **Camera control is the default** — If nothing else claims the event, orbit/pan/zoom. No need to gate OrbitControls with flags.
5. **Tool changes are declarative** — Switching tools changes the interaction mode, which changes the routing. No scattered useEffect watchers.

## Implementation Options

### Option A: Canvas-Level Interceptor (Recommended)

Replace all per-mesh event handlers with a single `onPointerDown`/`onPointerMove`/`onPointerUp` on the Canvas element. Manually raycast to determine what was hit.

**Pros:** Complete control, no R3F event system quirks, testable.
**Cons:** Lose R3F's built-in hover/click detection. Need to manage raycasting manually.

```typescript
// In Viewport3D
<Canvas
  onPointerDown={(e) => interactionManager.handlePointerDown(e, camera, scene)}
  onPointerMove={(e) => interactionManager.handlePointerMove(e, camera, scene)}
  onPointerUp={(e) => interactionManager.handlePointerUp(e, camera, scene)}
>
  {/* OrbitControls enabled/disabled by interactionManager.allowCamera */}
  <OrbitControls enabled={interactionManager.cameraEnabled} />
  ...
</Canvas>
```

### Option B: R3F Event Layer with Priority

Keep R3F's event system but add a priority/claim mechanism. First handler to "claim" the event wins; others see it as claimed.

**Pros:** Less rewriting, keeps R3F hover/raycast.
**Cons:** Still distributed, just with coordination. Harder to reason about.

### Option C: Hybrid — Canvas for clicks, R3F for hover

Use Canvas-level interception for click/drag (the conflict-prone events) but keep R3F's `onPointerOver/Out` for hover effects (cursor, highlight — never cause conflicts).

**Pros:** Best of both worlds. Hover is low-risk and benefits from R3F's per-mesh tracking.
**Cons:** Two event systems, but clearly separated by concern.

## Context

This issue has caused problems across multiple PRs and task iterations:
- Draft #57 (2D snapping conflict) — same class of problem in 2D
- PR #75 (AxisGizmo rewrite) — gizmo works but breaks panel selection
- Task 4457b5df (snapping) — failed 3 times partly due to event conflicts
- Push-pull has "never worked well" per user — fundamental architecture gap

The 2D view (SketchView2D) has a *different* version of this problem — mouse handlers are monolithic functions with nested if/else chains checking tool state. A unified approach could apply to both views.

## Open Questions

- Should the interaction manager live in the store (Zustand) or be a React context?
- How does this interact with keyboard modifiers (Shift for multi-select, Shift for angle constraint)?
- Should the 2D view use the same manager or a parallel one with the same pattern?
- Performance: manual raycasting vs R3F's built-in — is there a measurable difference?
- Migration path: can we introduce this incrementally (one tool at a time)?

## Possible Next Steps

1. Prototype Option C (hybrid) for push-pull only — prove the pattern works
2. Migrate remaining tools one at a time
3. Extract the routing table as a testable pure function
4. Apply same pattern to 2D view event handling
