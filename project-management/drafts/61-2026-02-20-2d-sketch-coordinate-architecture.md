---
**Processed:** 2026-02-23
**Mode:** automated
**Actions taken:**
- Sent open questions to human inbox for review
- No tasks proposed (5 open questions blocking scoping)
**Outstanding items:** Awaiting human answers to open questions before work can be scoped
---

# 2D Sketch View: Coordinate & Snapping Architecture Rethink

**Status:** Partial
**Captured:** 2026-02-20

## Raw

> The snapping is still quite problematic. It's kind of difficult to describe the issue. Is there any way that we can test the UI better? Is the React system of rendering fighting us? Ideally, I'd say that we have a coordinate system that is linked to mouse moves etc, and this updates a model in an engine of some sort, and this is then rendered. I don't quite know how the SVG system works but I feel that we might be hitting some limits with it.

## Idea

The 2D sketch view's snapping behavior is unreliable and hard to diagnose. The root concern is whether the current architecture — where coordinate transforms, snapping, hit detection, and state management are all interleaved within React component event handlers — is fundamentally sound, or whether React's rendering model is fighting the coordinate system.

The ideal architecture would be:

1. **Input layer** — Mouse events produce raw screen coordinates
2. **Coordinate engine** — Transforms screen → model coordinates, applies snapping, constraints
3. **Model update** — Engine dispatch with snapped coordinates
4. **Render** — React/SVG renders from model state (read-only)

The question is whether the current system achieves this separation cleanly, or whether React re-renders, SVG viewBox calculations, and inline coordinate math are creating subtle timing/ordering bugs that make snapping unreliable.

## Context

Multiple snapping bugs have surfaced:
- Draft #57: Guideline snap vs axis constraint conflict (task TASK-4457b5df, failed)
- Point order reversal when drawing edge paths (TASK-bdc97543)
- Path crossing not prevented (TASK-65dbf123)
- General difficulty describing snapping issues — the behavior is inconsistent but hard to reproduce

## Current Architecture (from codebase analysis)

### Three coordinate spaces
| Space | Description |
|-------|-------------|
| **Screen** | Browser pixels (`clientX/clientY`) |
| **SVG** | viewBox coordinates, centered on panel, Y-flipped |
| **Model (mm)** | Panel-local coordinates — identical to SVG space |

### Where snapping happens today
| Tool | Snap Type | Location | Mechanism |
|------|-----------|----------|-----------|
| Edge path | Offset interpolation | `getEdgePathOffsetAtT()` | Reads existing path, interpolates |
| Polygon | Angle constraint | `constrainAngle()` | 45-degree quantization with Shift |
| Path close | Start-point proximity | `handleMouseDown()` | Hardcoded hit threshold |
| Inset | Drag limit | `handleMouseMove()` | Math.max clamp |

### Architectural concerns identified

1. **Snapping is ad-hoc** — Each tool implements its own snapping inline in event handlers. No unified snapping system. New tools must reinvent snapping.

2. **Coordinate transforms live in the component** — `screenToSvg()`, `svgToEdgeCoords()`, `edgeCoordsToSvg()` are all defined inside SketchView2D.tsx (~2000+ line component). Not extractable or testable independently.

3. **Hit detection uses magic numbers** — `hitThreshold = Math.max(8, viewBox.width / 25)` with no explanation of why these values. Different thresholds for different tools.

4. **Y-axis flip is implicit** — Handled by a negation in `screenToSvg()` plus CSS `scale(1, -1)`. Correct but fragile and undocumented.

5. **No testable coordinate pipeline** — Because transforms are component methods, they can't be unit-tested without rendering the SVG. This makes snapping bugs hard to reproduce in tests.

## Open Questions

- Is React re-rendering actually causing coordinate bugs (stale closures, batched state updates), or is the issue purely in the snapping logic itself?
- Would extracting the coordinate system into a standalone class/module (outside React) make snapping testable and more reliable?
- Should snapping be computed in a dedicated "snap engine" that takes raw coordinates and returns snapped coordinates, independent of which tool is active?
- Could we add a coordinate debug overlay (showing raw vs snapped positions) to diagnose issues in real-time?
- Is the SVG viewBox approach fundamentally sound, or should we consider Canvas2D or a different rendering strategy for the 2D view?

## Possible Next Steps

- **Investigation:** Extract `screenToSvg()` and snapping functions into a pure utility module and write unit tests. See if bugs reproduce outside React.
- **Debug tooling:** Add a coordinate debug overlay to SketchView2D that shows raw mouse position, snapped position, active snap targets, and coordinate spaces — toggled via the existing debug tag system.
- **Architecture spike:** Prototype a `SketchCoordinateEngine` class that owns all coordinate transforms and snapping, receives mouse events, and emits snapped model coordinates. The React component becomes a thin event forwarder + renderer.
- **Snap engine:** Design a unified snapping system where tools declare snap targets (grid, edge, guideline, angle) and a central resolver picks the best snap.
