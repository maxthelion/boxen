# Audit 3D UI Colour Usage — States, Consistency, and Purpose

**Status:** Idea
**Captured:** 2026-02-24

## Raw

> Check which colours are used for what purposes in the 3D UI. There are various states that need to be represented: hover, selected, normal, available for selection, not available for selection. We seem to have yellow, blue (different shades), purple, green, pink for various of these options.

## Idea

The 3D view uses multiple colours to represent interaction states, but it's not clear there's a consistent system. An audit is needed to catalogue what each colour means and whether the mapping is coherent.

### States to represent

- **Normal** — default panel appearance, no interaction
- **Hover** — cursor is over the element
- **Selected** — element is actively selected
- **Available for selection** — element can be clicked in the current mode
- **Not available for selection** — element exists but can't be interacted with right now

### Colours observed

- Yellow
- Blue (multiple shades)
- Purple
- Green
- Pink

Each of these appears in the 3D UI but it's unclear which maps to which state, and whether the mapping is consistent across panel types (face panels, dividers, voids, edges, gizmos).

## Context

Came up while testing PR #77 (InteractionManager). With the interaction system being rewritten, it's a good time to also rationalise the visual feedback. An existing archived plan (`project-management/archive/color-system-plan.md`) covered a centralised colour config — worth reviewing what was implemented from that and what gaps remain.

The colour config file `src/config/colors.ts` may already define some of these, but the 3D renderers may use hardcoded values.

## Open Questions

- What does each colour currently mean? (Needs a code audit of `colors.ts` + all renderer files)
- Are any colours hardcoded in components rather than using the config?
- Is the same state shown with different colours in different contexts?
- Should there be a single colour per state, or is it acceptable to vary by element type?
- Do the colours work for colour-blind users? (Accessibility consideration)

## Possible Next Steps

- Audit task: search codebase for all colour definitions in 3D renderers, catalogue them in a table
- Compare against `src/config/colors.ts` to find hardcoded values
- Propose a rationalised colour map (one colour per state, consistent everywhere)
- Reference the archived color-system-plan.md for prior thinking
