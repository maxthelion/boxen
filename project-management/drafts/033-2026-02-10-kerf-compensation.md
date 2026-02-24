# Introduce Kerf Compensation

**Status:** Idea
**Captured:** 2026-02-10

## Raw

> Introduce kerf compensation. Finger joints are too loose when cut from the svg. Tabs need to be slightly widened and slots made more narrow. This should be in the engine, but only used for the svg export.

## Idea

Laser cutting removes material (the kerf). Without compensation, finger joints end up loose because tabs are cut slightly smaller than designed and slots slightly larger. Kerf compensation should:

- **Widen tabs** by half the kerf on each side (tabs grow by the full kerf amount)
- **Narrow slots** by half the kerf on each side (slots shrink by the full kerf amount)

This should live in the engine's path generation so it's applied consistently, but it should **only affect SVG export** — the 3D preview and 2D editor should show nominal (uncompensated) geometry.

## Context

Investigation found that kerf compensation is completely broken:

- The export modal has a "Kerf compensation (mm)" input (default 0.1mm) — `ExportModal.tsx:33`
- The value is threaded through function signatures (`generatePanelPathSVG`, `generatePackedBedSVG`, etc.)
- But **no function ever reads the kerf value** to modify geometry
- V1 finger joints (`generateFingerJointPath`) declare `kerf` in `FingerJointConfig` but never use it
- V2 finger joints (`generateFingerJointPathV2`) don't even have kerf in their config interface
- The setting is entirely inert — changing it has zero effect on exported SVGs

The user has confirmed real-world cuts are too loose, so compensation is needed.

## Where It Should Be Applied

Kerf affects more than just finger joints. For a correct implementation:

| Feature | Tab side | Slot/hole side |
|---------|----------|---------------|
| Finger joint tabs | Widen by kerf | — |
| Finger joint slots | — | Narrow by kerf |
| Panel outline | Outset by half-kerf (panel grows) | — |
| Cutout holes | Inset by half-kerf (hole shrinks) | — |
| Divider slots in faces | — | Narrow by kerf |

The simplest correct approach: **offset the entire cut path outward by half the kerf**. Outer contours expand, inner contours (holes) shrink. This is a standard CNC/laser approach and handles all cases uniformly.

## Open Questions

- **Path offset vs per-feature adjustment?** A general path inset/outset is more correct but harder to implement (needs polygon offset algorithm). Per-feature kerf (just widening tabs/narrowing slots) is simpler but doesn't handle outline edges or cutouts.
- **Where in the pipeline?** Options: (a) pass kerf into V2 finger generation, (b) apply a polygon offset to final PanelPath points before SVG export, (c) apply offset during SVG path generation. Option (b) is cleanest — one transform, all features covered.
- **Polygon offset library?** Clipper.js / clipper2 are the standard for polygon offsetting. Or roll a simple one for axis-aligned paths.
- **Should kerf affect the 2D editor at all?** Maybe a toggle to preview "as cut" vs "as designed"?

## Possible Next Steps

- **Quick fix**: Add kerf to `FingerJointConfigV2`, widen tabs and narrow slots in `generateFingerJointPathV2`. Covers finger joints only. Fast to implement.
- **Proper fix**: Implement polygon offset on the final `PanelPath` outline and holes before SVG export. Covers everything. More work but correct.
- Clean up dead kerf parameters in V1 legacy code
- Add a test: export with kerf > 0, verify tab widths are wider than nominal by the kerf amount
