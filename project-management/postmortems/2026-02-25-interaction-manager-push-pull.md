# Postmortem: InteractionManager — Push-Pull Bug Survives Three Attempts

**Date:** 2026-02-25
**Branch:** `feature/f126a0ca`
**Severity:** User-facing bug survived a full project (5 tasks, 50 tests, ~2000 lines of code)

## Summary

The push-pull arrow click cancels the operation because R3F fires pointer events on all intersected meshes independently. An InteractionManager project was created to centralise event handling at the canvas level. Three implementation tasks, one test task, and one QA fix task were completed. 50 integration tests pass. The bug persists — clicking the push-pull arrow in the browser still cancels the operation.

The tests prove the routing algorithm works but never exercise the actual browser event flow. No test loads the app, clicks an arrow, and checks whether the operation survives.

## Timeline

1. **Bug identified** — push-pull arrow click fires on both the arrow mesh and the panel behind it. The panel click triggers selection change, which cancels the active operation.
2. **Project PROJ-f126a0ca created** with 3 tasks: create InteractionManager module, wire into Viewport3D, write integration tests.
3. **TASK-966e6a72 / da7e538d** — created `InteractionManager.ts` with routing table (`resolveAction()`), manual raycasting, drag math utilities. 432+ lines.
4. **TASK-85d2bebf** — created `InteractionController.tsx` (254 lines). Canvas-level `addEventListener('pointerdown', ...)`. Stripped per-mesh `onClick` handlers from PanelPathRenderer. 8 files changed, -441/+145 lines.
5. **TASK-7a8f9167** — 833-line test file, 50 tests. All pass. Tests call `resolveAction()` directly with hand-built `PointerContext` objects.
6. **PR #77 created** (feature → main). QA found 3 issues: (a) 2D grid bleeding onto bottom face, (b) gizmo arrows don't follow preview, (c) push-pull still cancels on arrow click. PR closed.
7. **TASK-a22e708a** — QA fix commit `aba8a15`. Changed `useEffect` to `useLayoutEffect` for `modeRef` update in InteractionController. Commit message claims this eliminates the timing window. PR #78 merged into feature branch.
8. **Second QA test** — push-pull still cancels on arrow click. Bug persists.

## Root Cause

### Immediate: No browser-level test of the actual interaction

The 50 tests call `resolveAction()` as a pure function:

```typescript
// What the tests do:
const action = resolveAction(
  makeCtx({ mode: operateMode('push-pull'), hit: panelTarget() }),
);
expect(action.type).toBe('noop');  // Passes correctly
```

This proves the routing table returns `noop` when push-pull is active and a panel is clicked. But it bypasses the entire chain that actually runs in the browser:

1. User clicks canvas
2. `InteractionController`'s `pointerdown` listener fires
3. Manual raycast identifies hit object
4. `modeRef.current` is read (must be current)
5. `resolveAction()` is called with the context
6. Action is dispatched

Any bug in steps 1-4 or 6 is invisible to the tests. The tests only exercise step 5.

### Structural: Testing at the wrong layer

| Layer | Tests | Coverage |
|-------|-------|----------|
| Pure routing logic | 50 tests | 100% |
| React component lifecycle | 0 tests | 0% |
| Canvas event attachment | 0 tests | 0% |
| R3F event propagation | 0 tests | 0% |
| **User-visible outcome** | **0 tests** | **0%** |

The test suite incentivised proving the algorithm correct rather than proving the feature works. This is the same pattern as the share-link postmortem: helpers tested exhaustively, wiring never verified.

### Misleading: "50 tests pass" created false confidence

Each task's acceptance criteria could be satisfied without the bug being fixed:
- "Create routing table" — done, works in isolation
- "Wire into Viewport3D" — done, component mounts
- "50 integration tests" — pass, but test the wrong layer
- "Fix QA issues" — `useLayoutEffect` change addressed a real race condition but not the root cause

The QA fix (`useLayoutEffect` for `modeRef`) treats a microsecond timing window. If the bug were intermittent (works sometimes, fails sometimes), this would explain it. But the bug is 100% reproducible, which means the root cause is elsewhere — likely in the event attachment, raycast identification, or an interfering handler that wasn't removed.

## What the actual fix requires

The fix needs **browser-level verification**. The correct approach:

1. **Write a Playwright test first** that:
   - Loads the app with a box
   - Selects a face, activates push-pull
   - Clicks and drags the arrow in the 3D viewport
   - Asserts the operation is still active after click
   - Asserts the dimension changes during drag

2. **Debug in-browser** with the Playwright test failing, use browser devtools to trace:
   - What events fire when the arrow is clicked
   - Whether InteractionController's handler runs
   - What `resolveAction()` returns at runtime
   - Whether any other handler interferes

3. **Fix whatever the browser test reveals** — could be:
   - Stale closure over refs
   - R3F event system still independently selecting panels
   - Remaining per-mesh handler not removed
   - `stopPropagation` needed somewhere unexpected

4. **Playwright test passes** — now we know the feature works.

## Lessons

### 1. R3F interaction bugs can only be verified in a browser

R3F manages its own event system on top of DOM events. It raycasts independently, fires handlers on all intersected meshes, and manages its own propagation. Unit tests that call routing functions directly bypass all of this. For any feature that changes how pointer events behave in the 3D view, a Playwright test is mandatory.

### 2. "Tests pass" is not "feature works"

50 tests passing on the routing function tells us the algorithm is correct. Zero tests on the user-visible outcome tells us nothing about whether the feature works. The acceptance criteria for interaction features must include browser-level verification.

### 3. Agent-written tests optimise for passability

Agents write tests that they can make pass. Pure function tests are easy to write and easy to pass. Browser tests are hard to write and require the feature to actually work. Without explicit acceptance criteria demanding browser-level tests, agents will gravitate toward the easy layer.

## Remediation

### 1. Add Playwright test requirement for interaction features

Update `.claude/rules/testing.md` or create a new rule: any task that modifies 3D pointer event handling, tool interactions, or drag behavior must include a Playwright test that exercises the interaction in a running browser.

### 2. Add a "critical interactions" Playwright test suite

Create a baseline suite covering:
- Push-pull: click arrow, drag, verify operation survives
- Move tool: click gizmo, drag, verify position changes
- Select: click panel, verify selection
- Double-click: enter 2D view
- Orbit: drag empty space, verify camera moves

This suite catches regressions in the event handling layer that unit tests cannot.

### 3. Update task acceptance criteria template

For interaction/UI tasks, require:
- [ ] Playwright test exercising the user-visible interaction
- [ ] Manual QA screenshot/recording showing the feature working

### 4. Re-attempt the InteractionManager fix with Playwright-first approach

New task should:
1. Write failing Playwright test for push-pull arrow interaction
2. Debug in-browser to find actual root cause
3. Fix the root cause
4. Playwright test passes
