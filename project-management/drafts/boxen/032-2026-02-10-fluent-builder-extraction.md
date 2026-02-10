# Extract Fluent Builder from Test Suite

**Status:** Idea
**Captured:** 2026-02-10

## Raw

> Pull the fluent builder out of the test suite so it can be used elsewhere. Fill in all the gaps in the operations. Afterwards, revisit test suite so that it is always used consistently.

## Idea

The `TestFixture` / `PanelBuilder` fluent API currently lives in `src/test/fixtures/` and is only used by tests. It should be promoted to a first-class part of the codebase so it can be used by:

1. **Tests** (current use) — but consistently, replacing hand-built `ProjectState` objects and raw `engine.dispatch()` calls
2. **LLM-generated assembly code** (see draft 031) — an LLM outputs a builder chain that gets eval'd
3. **Share link presets / scripted demos** — programmatic state setup
4. **Anything else** that needs to declaratively build an assembly

### Phase 1: Fill the operation gaps

The builder currently covers: box creation, open faces, edge extensions, cutouts, fillets, chamfers. Missing:

| Operation | Engine action | Proposed builder method |
|-----------|--------------|----------------------|
| Single-axis subdivision | `ADD_SUBDIVISION` | `.subdivide(axis, position)` |
| Multi-position subdivision | `ADD_SUBDIVISIONS` | `.subdivide(axis, count)` (evenly spaced) |
| Grid subdivision | `ADD_GRID_SUBDIVISION` | `.grid(xCount, zCount)` or `.subdivide({x: 3, z: 2})` |
| Sub-assembly creation | `CREATE_SUB_ASSEMBLY` | `.createSubAssembly(voidId, opts?)` |
| Assembly axis | `SET_ASSEMBLY_AXIS` | `.withAxis('y')` |
| Feet | `SET_FEET_CONFIG` | `.withFeet(config)` |
| Lid config | `SET_LID_CONFIG` | `.withLid('positive', config)` |
| Material config | `SET_MATERIAL` | `.withMaterial({ thickness: 6 })` |
| Dimension changes | `SET_DIMENSIONS` | `.withDimensions({ width: 200 })` |
| Remove subdivision | `REMOVE_SUBDIVISION` | `.removeSubdivision(voidId)` |

### Phase 2: Extract to `src/builder/`

Move from `src/test/fixtures/` to `src/builder/` (or similar non-test location). Tests re-export from the new location. No test should break — just import paths change.

### Phase 3: Migrate tests to use the builder consistently

Audit all tests that:
- Manually construct `ProjectState` objects (like the serialization roundtrip tests)
- Call `engine.dispatch()` directly for setup (not for testing dispatch itself)
- Duplicate setup logic across multiple test files

Migrate them to use the builder. Tests that are *specifically testing* dispatch behavior should keep using dispatch directly — the builder is for *setup*, not for testing the dispatch mechanism itself.

## Context

Came up while investigating draft 031 (LLM assembly prompt). The builder API is the natural target for LLM code generation, but it's incomplete — subdivisions, sub-assemblies, and several other operations are missing. And it lives in test-only code, making it awkward to use elsewhere.

The serialization tests (e.g., `tests/integration/serialization/urlState.test.ts`) are a good example of the inconsistency: they hand-build `ProjectState` with computed void bounds instead of using the builder, making them verbose and fragile.

## Open Questions

- **Naming**: Keep `TestFixture` name or rename to `AssemblyBuilder`/`BoxBuilder` since it's no longer test-specific?
- **Void selection**: How does the builder target a specific void for subdivision? By index? By path? Need a `.void(selector)` method?
- **Chaining depth**: For sub-assemblies, do we need a nested builder? e.g., `.createSubAssembly(voidId).withOpenFaces(['top']).withAxis('z').done()`
- **Backward compat**: Should `src/test/fixtures/` become a thin re-export of `src/builder/`, or just update all imports?

## Possible Next Steps

- Enumerate every test file that sets up engine state, categorize how it does it (builder vs dispatch vs hand-built)
- Design the subdivision/sub-assembly builder API (this is the trickiest part — void targeting)
- Implement Phase 1 (fill gaps) as a task — can be done without moving files
- Implement Phase 2 (extract) as a follow-up
- Phase 3 (migrate tests) can be broken into per-file tasks for agents
