# PR #77 InteractionManager Feedback

**Status:** Active
**PR:** https://github.com/maxthelion/boxen/pull/77
**Branch:** feature/f126a0ca

## Issues Found During Review

### 1. 2D grid bleeding through onto bottom face

A grid is visible on the bottom face of the box in the 3D view. It looks like the 2D sketch editing grid is rendering when it shouldn't be. This may be a side effect of the Viewport3D cleanup — possibly a guard condition was removed that previously hid the grid, or the grid component's visibility is no longer gated on being in 2D edit mode.

**To investigate:**
- Check if `Viewport3D.tsx` changes removed a condition that controlled grid visibility
- Check if the `<Grid>` component from `@react-three/drei` is now always rendered
- Check if the 2D `SketchView2D` grid is somehow composited into the 3D scene

### 2. Gizmo arrows don't follow the preview during drag

When moving a divider or offsetting an edge, the arrows (from AxisGizmo) stay anchored at their original position instead of moving with the preview object. The arrows should track the preview position so they stay visually attached to the thing being dragged.

**To investigate:**
- The old AxisGizmo had internal drag state that updated its own position during drag
- The new InteractionController handles drag math centrally but may not be feeding the updated position back to the gizmo's transform
- Check whether `AxisGizmo` receives updated position props from the preview state, or if it only gets the initial position

### 3. Push-pull still cancels when clicking the arrow (PRIMARY BUG)

This was the original motivation for the entire InteractionManager project. Clicking the push-pull arrow to start dragging still cancels the operation. The interaction manager was supposed to prevent panel clicks from firing during active operations, but the bug persists.

This is a **blocking issue** — it's the core problem the PR exists to solve.

**To investigate:**
- The InteractionController may not be intercepting pointer events before they reach other handlers
- There may be residual event paths that still trigger selection changes
- The `resolveAction()` routing may not correctly identify gizmo clicks during `operate` mode
- Check whether `onPointerMissed` or similar Canvas-level events are still firing
