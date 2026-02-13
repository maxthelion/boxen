# Create /design-box Slash Command

## Summary

Create a Claude Code slash command `/design-box` that takes a natural language description of a box/assembly and outputs a share link URL. The command uses the AssemblyBuilder (currently TestFixture) fluent API to generate the assembly, then serializes it to a share link.

Example:
```
/design-box a set of drawers, 200w x 300h x 100d, split into 4 drawers
```

Outputs:
```
http://localhost:5173/?p=NoIgLg...
```

## How It Works

1. The slash command prompt contains a **system prompt section** that teaches the LLM:
   - What an assembly is (faces, axes, voids, subdivisions, edge operations)
   - The full AssemblyBuilder API with signatures and examples
   - Geometry rules and constraints (joint rules, edge eligibility, subdivision constraints)
   - Several natural-language → builder-code example pairs

2. The LLM reads the user's description and generates a builder chain

3. The command runs the generated code via `npx tsx` to produce engine state

4. The engine state is serialized to a share link URL using `scripts/generate-share-link.ts`

## Deliverables

### 1. System prompt document

Create a standalone markdown file (e.g., `docs/llm-assembly-prompt.md`) that can be injected into the slash command. This should cover:

**Conceptual model:**
- Assembly = box with 6 faces, configurable dimensions
- Assembly axis determines which panels are sides vs lids
- Voids = interior spaces that can be subdivided
- Edge operations (extensions, cutouts, fillets) modify panel outlines
- Joint rules (male/female/open edges, wall priority)

**Full API reference** (current TestFixture/AssemblyBuilder methods):
- Entry points: `.basicBox(w, h, d)`, `.enclosedBox(w, h, d)`
- Configuration: `.withOpenFaces()`, `.withDimensions()`, `.withMaterial()`, `.withFeet()`, `.withLid()`, `.withAxis()`
- Subdivisions: `.withSubdivision()`, `.withGridSubdivision()`, `.lastChildVoids()`, `.findVoid()`
- Panel operations: `.panel(faceId)` → `.withExtension()`, `.withCutout()`, `.withFillet()`, `.and()`
- Shape helpers: `rect()`, `circle()`, `polygon()`, `lShape()`
- Build: `.build()` returns `{ engine, panels }`

**Constraints/rules:**
- Only open or female edges can be extended
- Extensions span full panel width
- Subdivision creates child voids (use `lastChildVoids()` to target them)
- Material thickness affects joint geometry

**Example pairs** (at least 5):
- Simple open-top box
- Box with subdivisions (organizer)
- Box with drawers (sub-assemblies — note: builder method may not exist yet, use engine.dispatch fallback)
- Box with edge extensions (feet, handles)
- Box with cutouts and fillets

### 2. Slash command

`.claude/commands/design-box.md` — takes the user's description as argument, includes the system prompt, instructs the LLM to:
1. Generate a `.ts` script that uses the builder API and calls `generate-share-link.ts` logic to serialize
2. Run it with `npx tsx`
3. Output the share link URL

### 3. Runner script

A small TypeScript script (e.g., `scripts/build-assembly.ts`) that:
- Accepts a builder chain as a string argument or stdin
- Imports TestFixture/AssemblyBuilder
- Evals the builder code
- Serializes the resulting engine state to a share link URL
- Prints the URL to stdout

This keeps the slash command simple — it generates code, pipes it to the runner, and returns the URL.

## Success Criteria

- [ ] `/design-box a simple open-top box, 150x100x80` produces a valid share link
- [ ] `/design-box organizer with 3x2 grid, 200x50x150` produces a box with grid subdivisions
- [ ] `/design-box box with finger-pull cutout on front, 100x80x60` produces a box with a cutout
- [ ] Share links open correctly in the app and show the described assembly
- [ ] System prompt document is comprehensive enough that the LLM rarely produces invalid output
- [ ] Command works end-to-end without manual intervention

## Dependencies

- TestFixture API must cover subdivisions, material, feet, lids (done — merged in PR #63)
- Share link generation script exists (`scripts/generate-share-link.ts` — done)
- Missing: sub-assembly builder methods (draft 043). Drawers/trays will need raw `engine.dispatch()` fallback until those are added.

## Notes

- Start with the system prompt document — get that right and the command is straightforward
- Test the prompt by manually giving it to Claude and checking the output before wiring up the command
- The runner script should have good error messages when the builder code fails (invalid face IDs, bad dimensions, etc.)
