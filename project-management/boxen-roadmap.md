# Boxen App Roadmap

**Status:** Living Document
**Last Updated:** 2026-02-08

What's built, what's in flight, and where the app is headed.

For the project management / orchestrator roadmap, see [octopoid-roadmap.md](drafts/octopoid/octopoid-roadmap.md).

---

## What's Built

The core loop works end-to-end:

```
Design box → configure dimensions → add dividers → modify panels → export SVG for laser cutting
```

### Core Engine
- Scene tree: assemblies, voids, faces, panels, dividers
- Operation system: parameter operations (with preview), immediate operations, view operations
- Panel generation: outlines with finger joints, slots, holes
- Cross-lap joints for intersecting dividers
- Multi-axis subdivision (grid patterns)
- Sub-assemblies (drawers, trays, inserts)

### Panel Operations
- Push/pull (extrude panel faces)
- Edge extensions (inset/outset with finger joints)
- Corner fillets (all-corners detection, structural + computed points)
- Assembly feet
- Custom edge paths (drawn in 2D editor)
- Basic cutouts (drawn in 2D editor)

### 2D Editor
- SVG canvas with pan/zoom
- Safe-space visualization (where operations are valid)
- Edge path drawing tool
- Cutout polygon drawing
- Snap system with edge/point snapping (PR #48, pending review)

### 3D Viewport
- Three.js rendering with orbit controls
- Panel selection and highlighting
- Void selection for subdivision
- Center lines for axis visualization (PR #50, pending review)
- Void mesh transparency fix (PR #51, pending review)

### Infrastructure
- Share link serialization (URL-encoded state)
- SVG export for laser cutting
- Geometry validation (path checking, edge extension rules, comprehensive validator)
- Tagged debug system

---

## In Flight

### Open PRs (4)

| PR | Feature | Status |
|----|---------|--------|
| #48 | 2D view snapping system | Provisional, needs review |
| #50 | Replace axis arrow with center lines | Provisional, needs review |
| #51 | Fix void mesh transparency | Provisional, needs review |
| #52 | Rename Inset tool to Offset | Provisional, needs review |

### In-Progress Plans

| Plan | What Remains |
|------|-------------|
| [panel-2d-editing-plan.md](drafts/boxen/panel-2d-editing-plan.md) | Cutout editing, unified path drawing, advanced tools (line, polygon, freeform), import (bitmap/SVG), panel feature copying |
| [panel-operations-plan.md](drafts/boxen/panel-operations-plan.md) | Assembly/panel splitting, 3D edge/corner selection, axis-based section ownership |
| [user-experience-plan.md](drafts/boxen/user-experience-plan.md) | First-run experience, project templates, collapsible sidebar |

---

## Near-Term

These are the highest-impact improvements with the least risk.

### Clear the PR backlog
4 PRs and ~8 provisional tasks are waiting for review. These are small, isolated changes (snapping, QoL fixes, transparency) that should merge quickly.

### First-run experience
New users currently see a default box with no guidance. The [UX plan](drafts/boxen/user-experience-plan.md) calls for: axis selection on first load, floating panel toggles, simplified options for beginners, progressive disclosure of advanced features. High user-facing impact, low technical risk.

### Project templates
Preset starting points: basic box, drawer unit, grid organizer, tray. Reduces the gap between "open the app" and "have something useful." Pairs naturally with the first-run experience.

### Fix fillet max radius
The tangent-distance calculation in `allCorners.ts` may be incorrect, leading to arcs that extend beyond edge boundaries. See [fillet-max-radius-geometry.md](drafts/boxen/fillet-max-radius-geometry.md) for the geometry analysis and proposed fix.

---

## Medium-Term

These need design work or depend on near-term items.

### Panel identity consolidation
Three overlapping systems for identifying panels (UUIDs, stable keys, PanelSource) cause serialization bugs: edge extensions lost on share link load, custom edge paths not serialized, sub-assembly panel key collisions. See [operation-sourced-identity.md](drafts/boxen/operation-sourced-identity.md) for the full proposal. **This is the most important architectural fix** — every new panel operation makes the fragmentation worse.

### Freeform polygon tool simplification
The current polygon drawing UX is clunky. The [plan](drafts/boxen/freeform-polygon-tool-plan.md) proposes: live preview, immediate palette on draw start, ghost line showing next segment, implicit close on approach. Would make cutout creation much more natural.

### Panel eligibility coloring
Show green/pink highlighting to indicate which panels are valid targets for the active tool. Depends on color system (now complete, archived). See [panel-eligibility-coloring-plan.md](drafts/boxen/panel-eligibility-coloring-plan.md).

### 3D edge and corner selection
Currently operations require switching to the 2D editor. Adding clickable edges and corners in the 3D view would let users apply fillets, extensions, and edge paths without switching views. Part of the [panel operations plan](drafts/boxen/panel-operations-plan.md).

### Template edge extensions
Preset edge patterns (scallop, wave, decorative) that can be applied to any open edge. See [template-edge-extensions-plan.md](drafts/boxen/template-edge-extensions-plan.md).

---

## Longer-Term

These are significant features that need research or are blocked by earlier work.

### Event sourcing / undo-redo
The architecture already supports this (all mutations go through `engine.dispatch()`). The [proposal](drafts/boxen/event-sourcing-proposal.md) adds command history and snapshot-based undo. Would transform the editing experience but is a large change.

### Sub-assembly operations
Operations (fillets, extensions, custom paths) applied to sub-assembly panels (drawers, trays). Needs validation rules for what's allowed at each nesting level. See [subassembly-operations-plan.md](drafts/boxen/subassembly-operations-plan.md).

### Import features
Bitmap tracing and SVG import for custom panel shapes and decorative cutouts. Part of the [2D editing plan](drafts/boxen/panel-2d-editing-plan.md) Phase 7.

### Assembly/panel splitting
Split a panel along an axis to create independent sections, or split an entire assembly. Part of the [panel operations plan](drafts/boxen/panel-operations-plan.md).

### Visual regression testing
Automated Playwright tests that screenshot the app and compare against baselines. See [playwright-visual-testing-plan.md](drafts/boxen/playwright-visual-testing-plan.md). Would catch rendering regressions that unit tests miss.

---

## Technical Debt

| Issue | Impact | Plan |
|-------|--------|------|
| Panel identity fragmentation | Serialization bugs, lost operations | [operation-sourced-identity.md](drafts/boxen/operation-sourced-identity.md) |
| 165 TypeScript errors | Blocks strict mode | [typescript-linting-plan.md](drafts/boxen/typescript-linting-plan.md) |
| ~~Color system scattered~~ | Complete — `src/config/colors.ts` | Archived |
| Visibility system uses semantic IDs | Fragile, needs migration to visibility keys | [visibility-system-migration-plan.md](drafts/boxen/visibility-system-migration-plan.md) |
| 3D overlay z-fighting | Fillet circles and selection indicators overlap | [3d-overlay-depth-plan.md](drafts/boxen/3d-overlay-depth-plan.md) |

---

## Dependency Map

```
Clear PR backlog ──────────────────────── (immediate)

First-run experience ──────────────────── (standalone)
    └── Project templates ─────────────── (pairs with first-run)

Fix fillet max radius ─────────────────── (standalone)

Panel identity consolidation ──────────── (standalone, unblocks serialization)
    └── Sub-assembly operations ────────── (needs scoped panel keys)

Panel eligibility coloring ─────────────── (color system complete, ready to build)

Freeform polygon simplification ───────── (standalone)
    └── Advanced drawing tools ─────────── (line, import, etc.)

3D edge/corner selection ──────────────── (standalone)
    └── Template edge extensions ───────── (benefits from 3D selection)

Event sourcing ────────────────────────── (standalone, large)

TypeScript linting ────────────────────── (standalone, incremental)
```
