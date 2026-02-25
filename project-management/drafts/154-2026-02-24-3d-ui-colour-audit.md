# Audit 3D UI Colour Usage — States, Consistency, and Purpose

**Status:** Active
**Captured:** 2026-02-24
**Audited:** 2026-02-25

## Raw

> Check which colours are used for what purposes in the 3D UI. There are various states that need to be represented: hover, selected, normal, available for selection, not available for selection. We seem to have yellow, blue (different shades), purple, green, pink for various of these options.

## Audit Results

### Current State Mapping

| Visual Colour | Hex | Meaning | Config key |
|---------------|-----|---------|------------|
| **Blue (medium)** | `#3498db` | Normal face panel | `panel.face.base` |
| **Orange/Yellow** | `#f39c12` | Normal divider panel | `panel.divider.base` |
| **Teal** | `#1abc9c` | Normal sub-assembly panel | `panel.subAssembly.base` |
| **Green (bright)** | `#4ade80` | Eligible for current tool | `eligibility.eligible.base` |
| **Pink** | `#f472b6` | Ineligible for current tool | `eligibility.ineligible.base` |
| **Green (medium)** | `#6ab04c` | Hovered (any panel type) | `interactive.hover.base` |
| **Purple** | `#9b59b6` | Selected | `selection.primary.base` |
| **Green (vivid)** | `#00ff00` | New panel during preview | `panel.preview.base` |
| **Dark blue** | `#1e5a9e` | Push-pull extending | `operation.positive.base` |
| **Dark red** | `#b33939` | Push-pull retracting | `operation.negative.base` |
| **Orange** | `#ffaa00` | Dragging | `operation.dragging` |
| **Cyan** | `#00bcd4` | Fillet-eligible corner | `corner.eligible.base` |
| **Red** | `#ff0000` | Assembly bounding box | `bounds.assembly` |
| **Yellow** | `#ffcc00` | Bounding box during preview | `bounds.previewActive` |
| **Gray** | `#6c757d` | Disabled/locked | `interactive.disabled.base` |

### Problem 1: Hover replaces base colour with a fixed green

`PanelPathRenderer.tsx:358`:
```typescript
const displayColor = isSelected ? selectedColor : isHovered ? hoveredColor : color;
```

All panels turn the same green (`#6ab04c`) on hover, regardless of type. A blue face panel, orange divider, and teal sub-assembly all become identical green. This means:

- **You lose type information on hover** — can't tell if you're hovering a face vs divider
- **Green is overloaded** — hover green, eligible green, and preview green are three different greens representing three different states

**Proposed fix:** Hover should be a tint (lighten toward white) of the base colour, not a separate hue. A hovered blue panel becomes lighter blue, a hovered orange divider becomes lighter orange.

Implementation: replace `hoveredColor` prop with a `lighten()` utility:
```typescript
// Lighten a hex colour by blending toward white
function lighten(hex: string, amount: number = 0.3): string { ... }

const displayColor = isSelected ? selectedColor : isHovered ? lighten(color) : color;
```

This eliminates `interactive.hover` entirely from the config and removes one of the three "green" meanings.

### Problem 2: Hardcoded colours bypass the config

These components use literal hex values instead of the color config:

| File | What | Hardcoded | Should use |
|------|------|-----------|------------|
| **Box3D.tsx:110** | Bounding box line | `#ffcc00` / `#ff0000` | `colors.bounds.*` (exists, not wired) |
| **Box3D.tsx:146** | Axis indicator mesh | `#ff6600` | New `colors.axis.*` entry |
| **Box3D.tsx:422,428** | Sub-assembly axis lines | `#2ecc71` | `colors.axis.*` |
| **SubAssembly3D.tsx:65** | Selected/unselected wireframe | `#e74c3c` / `#666` | `colors.selection.primary` / new entry |
| **AxisGizmo.tsx:108-109** | Arrow defaults | `#4fc3f7` / `#81d4fa` | Not in config at all |
| **AxisGizmo.tsx:224,231,243** | Shaft and labels | `#888`, `#666`, `#fff` | New gizmo config entries |
| **Viewport3D.tsx:907** | Canvas background | `#1a1a2e` | New `colors.background` entry |
| **Viewport3D.tsx:931,934** | Grid | `#444` / `#666` | New `colors.grid` entries |
| **FacePreview.tsx:136-206** | SVG strokes | `#333`, `#e74c3c`, `#f39c12` | Config entries |
| **SketchView2D.tsx:2237-2238** | Draft path colour | `#888` | `colors.sketch.*` |
| **SketchView2D.tsx:2492-2506** | Close/merge indicators | `#e74c3c`, `#2ecc71` | Config entries |

### Problem 3: Selection colour inconsistency

- **PanelPathRenderer** uses purple (`#9b59b6`) for selected panels
- **SubAssembly3D** uses red (`#e74c3c`) for selected sub-assembly wireframe
- Both represent "selected" but look completely different

### Problem 4: Green overload (3 states, 1 hue family)

| State | Hex | Shade |
|-------|-----|-------|
| Hover | `#6ab04c` | Medium green |
| Eligible | `#4ade80` | Bright green |
| Preview panel | `#00ff00` | Vivid green |

If hover becomes a tint (Problem 1 fix), this reduces to two greens. Preview green (`#00ff00`) is also questionable — it's very saturated and could be confused with eligible.

### Problem 5: Accessibility

Green (`#4ade80`) vs pink (`#f472b6`) for eligible/ineligible is better than red/green, but FacePreview and SketchView2D still use raw red (`#e74c3c`) vs green (`#2ecc71`) which fails for red-green colour blindness.

## Proposed Colour Model

### Principle: Hue encodes identity, lightness encodes state

| Layer | What it communicates | How |
|-------|---------------------|-----|
| **Hue** | Element type (face, divider, sub-assembly) | Distinct base colours |
| **Lightness** | Interaction state (normal, hover, selected) | Tint toward white |
| **Saturation** | Eligibility | Desaturate ineligible panels |

### State rendering:

| State | Visual treatment |
|-------|-----------------|
| **Normal** | Base colour at default opacity |
| **Hover** | Base colour lightened ~25% toward white |
| **Selected** | Base colour lightened ~50% toward white + edge outline |
| **Eligible** | Base colour unchanged (or subtle brightening) |
| **Ineligible** | Desaturated + lower opacity |

Selected also uses the tint model — a selected face panel becomes very light blue, a selected divider becomes very light orange. An edge outline (or glow) provides the additional "this is actively selected" signal without replacing the hue. This eliminates purple entirely from the panel rendering pipeline.

This means:
- You always know what type of element you're looking at (hue preserved in every state)
- Hover and selected are different degrees of the same treatment (lightness)
- No purple/green/pink overlays that obscure panel type
- Eligibility is communicated through saturation, not a separate green/pink hue

### Config changes:

1. Remove `interactive.hover` (replaced by lighten utility)
2. Remove `selection.primary` / `selection.secondary` (replaced by lighten + outline)
3. Remove `eligibility.eligible` and `eligibility.ineligible` (replaced by saturation adjustment)
4. Add utility functions: `lighten(color, amount)`, `desaturate(color, amount)`
5. Add missing config entries: `background`, `grid.3d`, `gizmo.shaft`, `gizmo.label`
6. Add `selectedOutline` colour for the edge highlight on selected panels
7. Wire all hardcoded colours to config

## Proposed Tasks

### Task 1: Add lighten/desaturate utilities and convert hover + selection to tint model

- Add `lighten()` and `desaturate()` to a new `src/utils/colorUtils.ts`
- Change PanelPathRenderer to use `lighten(baseColor, 0.25)` for hover, `lighten(baseColor, 0.5)` for selected
- Add edge outline rendering for selected panels (bright white or light version of base)
- Remove `hoveredColor` and `selectedColor` props from PanelPathRenderer
- Remove `interactive.hover` and `selection.primary` from config (or deprecate)
- Fix SubAssembly3D to use same tint model instead of hardcoded red
- QA flow: hover a face panel (lighter blue), hover a divider (lighter orange), select either (very light + outline)

### Task 2: Wire hardcoded 3D colours to config

- Box3D: replace `#ffcc00`/`#ff0000` with `colors.bounds.*`
- Box3D: replace `#ff6600`/`#2ecc71` with axis colours
- SubAssembly3D: replace `#e74c3c` with `colors.selection.primary.base`
- AxisGizmo: add config defaults, wire shaft/label colours
- Viewport3D: add `background` and `grid.3d` to config
- No visual changes expected — just centralising

### Task 3: Wire hardcoded 2D/preview colours to config

- FacePreview: replace hardcoded strokes with config entries
- SketchView2D: replace `#888`, `#e74c3c`, `#2ecc71` with config entries
- Add any missing sketch config entries

### Task 4: Replace eligibility green/pink with saturation model (optional)

- Instead of replacing base colour with green/pink, keep base colour and adjust saturation
- Eligible: normal saturation (maybe subtle glow or outline)
- Ineligible: desaturated + reduced opacity
- This is a bigger UX change — may want to prototype first

## Open Questions (remaining)

- What lightness amounts feel right for hover (~25%) and selected (~50%)? Needs visual tuning.
- Should the selected outline be white, or a saturated version of the base colour?
- Preview panels (`#00ff00`) — should these use a different indicator (outline, animation) rather than a hue?
- Do we need a colourblind mode, or is the saturation-based model sufficient?
