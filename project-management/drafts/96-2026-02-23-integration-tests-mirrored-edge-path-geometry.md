# Add integration tests for mirrored edge path geometry in BasePanel

**Status:** Idea
**Author:** testing-analyst
**Captured:** 2026-02-23

## Gap

The mirror checkbox feature (TASK-2e891732) added `mirrored: true` support to `SET_EDGE_PATH`. The state machine correctly stores the flag (tested in EditorStateMachine.test.ts), and the mirroring logic lives in `BasePanel.ts` (lines 1322–1338). However, no integration test verifies that dispatching `SET_EDGE_PATH` with `mirrored: true` actually produces symmetric outline geometry. The gap is at the most critical layer: the final panel output from `generatePanelsFromNodes()`.

## Proposed Test

Using `AssemblyBuilder.basicBox()` with an open top face:

1. Dispatch `SET_EDGE_PATH` with a half-path (t=0.0 to t=0.5) and `mirrored: true`
   - Path: `[{t:0,offset:0}, {t:0.25,offset:-10}, {t:0.5,offset:-10}]`
2. Call `engine.generatePanelsFromNodes()` to get the actual panel
3. Inspect the panel's `customEdgePaths` array
4. Assert that the resulting edge path is symmetric: for every point at `t`,    there is a corresponding point at `1-t` with the same `offset`

Also test the negative case: `mirrored: false` should NOT produce a reflected second half.

Fixture: Use `AssemblyBuilder` from `src/builder` (see existing test pattern in `edgePathCrossing.test.ts`). No mocking required — pure engine integration.

## Why This Matters

If the mirroring logic in `BasePanel.ts` has a bug (e.g., off-by-one in the expansion loop, incorrect handling of the center point at t=0.5, or wrong `1-t` calculation), there is no test that would catch it. The feature was added in the most recent task and is used in a user-facing drawing flow (edge path palette). A regression here would produce asymmetric shapes silently — the state machine would still show `mirrored: true`, but the panel geometry would be wrong.
