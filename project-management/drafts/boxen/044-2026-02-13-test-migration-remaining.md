# Remaining Test Migrations to TestFixture

**Status:** Idea
**Captured:** 2026-02-13
**Source:** 032-fluent-builder-extraction.md (Phase 3 leftovers)

## Summary

Phase 2 of the TestFixture rewrite converted 7 test files but intentionally skipped several others. This draft documents the specific blockers and recommends how to handle each category.

## Category 1: Custom Material Config

These files pass non-default `materialConfig` (usually `fingerGap`) to `createEngineWithAssembly`:

| File | Custom Config |
|------|--------------|
| `tests/integration/operations/pushPullOperations.test.ts` | `fingerGap: 0.1` |
| `tests/integration/operations/subAssemblyPushPull.test.ts` | `fingerGap: 0.1` |
| `tests/integration/operations/booleanEdgeOperations.test.ts` | `fingerGap: 10` |

**Issue:** `TestFixture.enclosedBox()` uses a hardcoded default material config. There's no way to pass `fingerGap` at construction time.

**Recommendation:** Now that `withMaterial()` exists, these files CAN be converted. The pattern would be:
```typescript
TestFixture.enclosedBox(200, 150, 100)
  .withMaterial({ fingerGap: 0.1 })
  .build()
```
This should work because `withMaterial()` dispatches `SET_MATERIAL` which updates the assembly before `build()` generates panels. **Recommend converting these — low risk, straightforward.**

## Category 2: Internal API Tests

These files use `createEngine()` (not `createEngineWithAssembly`), access `VoidNode` directly, call `assembly.getPanels()`, or test engine internals:

| File | Why Skipped |
|------|------------|
| `tests/integration/geometry/gridSubdivisions.test.ts` | Uses `assembly.getPanels()` directly, tests void tree structure |
| `tests/integration/operations/secondOperations.test.ts` | Tests operation sequencing with direct engine access |
| `tests/integration/geometry/fingerMating.test.ts` | Tests finger joint alignment at the mating-edge level |
| `tests/integration/geometry/crossLapSlots.test.ts` | Tests cross-lap joint geometry, accesses internal node structure |
| `tests/integration/geometry/terminatingDividerJoints.test.ts` | Tests divider joint classification, uses node internals |

**Issue:** These tests are specifically testing engine internals, not user-visible outcomes. The TestFixture is designed for setup-then-assert-on-panels, but these tests need to inspect the engine's internal node tree.

**Recommendation:** Leave these as-is. They are legitimately testing internal APIs — converting them to use the builder would hide the thing they're testing. The builder is for *setup*, and these tests need visibility into engine internals for their assertions. **Do not convert.**

## Open Questions

- Should the internal API tests be documented somewhere as "intentionally not using TestFixture"?
- Are there other test files beyond these two categories that were missed in the audit?

## Possible Next Steps

- Convert Category 1 files (custom material config) — quick wins now that `withMaterial()` exists
- Leave Category 2 files alone, optionally add a comment explaining why they use raw engine APIs
