# [TASK-48ffe60a] Add edge case tests: zero-radius, multi-panel, geometry validation

ROLE: implement
PRIORITY: P1
BRANCH: feature/dca27809
CREATED: 2026-02-05T22:18:12.813382
CREATED_BY: human

## Context

Add edge case test coverage to `tests/integration/serialization/urlState.test.ts` on branch `feature/dca27809`.

Add a new `describe('edge cases')` block (or add to existing structure) with these tests:

1. **Zero-radius fillet omission**: Create engine with assembly, apply `SET_CORNER_FILLET` with radius=0 to a panel corner. Serialize with `serializeProject()`. Verify the `po` field either omits the zero-radius fillet entirely or that after roundtrip deserialization, the panel outline is unchanged (no fillet geometry added).

2. **Multiple panels with different operations**: Apply a corner fillet to the front panel and a cutout (rect or circle) to the back panel. Serialize → deserialize → verify both operations survive the roundtrip. Check that front panel has fillet and back panel has cutout after restore.

3. **Geometry validation after restore**: After a full serialize → deserialize → syncStoreToEngine() cycle with panel operations applied, run `checkEngineGeometry(engine)` (imported from `src/engine/geometryChecker.ts`). Assert `result.valid === true` and `result.summary.errors === 0`.

Follow the existing test patterns in the file — use `createEngineWithAssembly()` helper, dispatch actions, then test serialization roundtrip. Look at how existing integration tests set up engine state for reference.

Run `npm run test:run -- tests/integration/serialization/urlState.test.ts` to verify all tests pass including the new ones.

## Acceptance Criteria
- [ ] Test exists for zero-radius fillet being omitted or having no geometry effect after roundtrip
- [ ] Test exists for multiple panels with different operations surviving roundtrip
- [ ] Test exists that runs checkEngineGeometry() after deserialization and asserts valid geometry
- [ ] All new tests pass
- [ ] All existing tests still pass

CLAIMED_BY: impl-agent-1
CLAIMED_AT: 2026-02-05T23:11:41.149902

SUBMITTED_AT: 2026-02-05T23:15:53.560115
COMMITS_COUNT: 1
TURNS_USED: 50

ACCEPTED_AT: 2026-02-06T05:25:49.902289
ACCEPTED_BY: manual-accept
