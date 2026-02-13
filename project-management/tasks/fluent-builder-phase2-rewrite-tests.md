# Phase 2: Rewrite Existing Tests to Use TestFixture Fluent Builder

**Priority:** Low
**Source:** Phase 1 (fluent-builder-phase1-fill-gaps) completed 2026-02-13
**Depends on:** Phase 1 complete (merged)

## Context

`TestFixture` now supports a full fluent API: `withDimensions`, `withMaterial`, `withFeet`, `withLid`, `withAxis`, `subdivide`, `subdivideEvenly`, `grid`, plus `PanelBuilder` for extensions/cutouts/fillets. Many existing tests still use raw `createEngineWithAssembly()` + `engine.dispatch()` for setup.

This task rewrites test **setup** code to use the fluent builder where it improves readability. It does NOT change what the tests assert — only how they set up state.

## Scope

### Files to Rewrite (33 files use raw `engine.dispatch()`)

**High-value targets** (standard box setup + subdivisions/operations):

| File | Lines | Setup Pattern | Notes |
|------|-------|--------------|-------|
| `tests/integration/operations/subdivide.test.ts` | - | `createEngineWithAssembly` + `ADD_SUBDIVISION` | Direct match for `.subdivide()` |
| `tests/integration/geometry/gridSubdivisions.test.ts` | - | `createEngineWithAssembly` + grid setup | Direct match for `.grid()` |
| `tests/integration/operations/cornerFillet.test.ts` | - | `createEngineWithAssembly` + fillet setup | Match for `.panel().withFillet()` |
| `tests/integration/operations/pushPull.test.ts` | - | `createEngineWithAssembly` + push-pull | Match for `.withDimensions()` setup |
| `tests/integration/operations/insetOutset.test.ts` | - | `createEngineWithAssembly` | Standard box setup |
| `tests/integration/operations/secondOperations.test.ts` | - | Complex multi-op setup | Good fluent chain candidate |
| `tests/integration/geometry/edgeExtensionOverlap.test.ts` | - | Extensions | Match for `.panel().withExtension()` |
| `tests/integration/geometry/booleanEdgeOperations.test.ts` | - | Edge ops | Extension patterns |
| `tests/integration/geometry/pushPullOperations.test.ts` | - | Push-pull | Dimension changes |
| `tests/integration/geometry/subAssemblyPushPull.test.ts` | - | Sub-assembly | May need new builder methods |
| `tests/integration/joints/terminatingDividerJoints.test.ts` | - | `createEngineWithAssembly` + subdivisions | Direct match |
| `tests/integration/joints/crossLapSlots.test.ts` | - | Grid subdivisions | Direct match for `.grid()` |
| `tests/integration/joints/fingerMating.test.ts` | - | Basic box + face config | Match for `withOpenFaces` |
| `src/engine/integration/fillet.test.ts` | 110 | `createEngineWithAssembly` + dispatch | Easy win — standard box setup |
| `src/test/fixtures/filletApplication.test.ts` (partial) | 329 | Mixed: TestFixture + raw dispatch in `beforeEach` | Only the "preview and commit" section uses raw setup — rest already uses builder |
| `src/engine/integration/fillet.test.ts` | 110 | `createEngineWithAssembly` | Basic fillet tests |

**Lower priority** (unit tests or tests with very custom setup):

| File | Notes |
|------|-------|
| `tests/unit/validators/*.test.ts` | Validator tests — may be too specialized |
| `tests/unit/engine/BasePanel.test.ts` | Tests internals, not user-facing setup |
| `tests/unit/engine/geometryChecker.test.ts` | Tests internals |
| `tests/unit/store/operations.test.ts` | Store tests, not engine tests |
| `tests/integration/geometry/comprehensive.test.ts` | Large, complex — do last |
| `tests/integration/serialization/*.test.ts` | Serialization-specific setup |
| `tests/integration/geometry/voidBounds.test.ts` | Void internals |
| `tests/integration/geometry/safeSpace.test.ts` | Specialized geometry |

### Files to Skip

- `tests/integration/operations/_template.test.ts` — template, not a real test
- `src/test/fixtures/filletUIBugs.test.ts` — tests store-engine boundary with global singleton + preview/main scene separation; TestFixture can't replace this
- `src/test/fixtures/filletUIFlow.test.ts` — tests UI geometry contracts with preview/main scene reading; needs global singleton
- Any test that needs access to engine internals not exposed by the builder (e.g., direct node manipulation)
- Tests where the raw dispatch IS what's being tested (not just setup)

## Rules

1. **Only change setup code.** Assertions must remain identical.
2. **All tests must pass before AND after each file is rewritten.** Run the specific file's tests after each rewrite.
3. **If a test needs something the builder can't express, leave it as-is.** Don't force the builder where it doesn't fit.
4. **One file per commit.** This makes it easy to bisect if something breaks.
5. **Preserve test intent.** If the raw setup makes the test's intent clearer (e.g., testing a specific dispatch sequence), keep the raw setup.

## Example Transformation

**Before:**
```typescript
const engine = createEngineWithAssembly(200, 150, 100, { thickness: 6, fingerWidth: 10, fingerGap: 1.5 });
engine.dispatch({ type: 'TOGGLE_FACE', targetId: 'main-assembly', payload: { faceId: 'top' } });
engine.dispatch({ type: 'ADD_SUBDIVISION', targetId: 'main-assembly', payload: { voidId: rootVoidId, axis: 'x', position: 100 } });
const panels = engine.generatePanelsFromNodes().panels;
```

**After:**
```typescript
const { engine, panels } = TestFixture
  .basicBox(200, 150, 100, { thickness: 6, fingerWidth: 10, fingerGap: 1.5 })
  .subdivide('root', 'x', 100)
  .build();
```

## Success Criteria

1. All rewritten tests still pass
2. No change to what is asserted — only setup code changes
3. Each rewritten file committed separately
4. Files where the builder doesn't fit are left unchanged with a brief comment explaining why
5. Full test suite passes at the end

## Suggested Order

Start with the easy wins: `src/engine/integration/fillet.test.ts` (110 lines, standard box setup) and the partial rewrite of `filletApplication.test.ts`. Then do the integration tests by category: subdivisions/joints first (direct match for new `.subdivide()`/`.grid()` methods), then operations, then geometry. Skip `filletUIBugs.test.ts` and `filletUIFlow.test.ts` — they test store-engine integration and need the global singleton.
