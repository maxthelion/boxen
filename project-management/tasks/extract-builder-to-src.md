# Extract TestFixture to src/builder/ and Rename to AssemblyBuilder

## Summary

Move the fluent builder API from `src/test/fixtures/` to `src/builder/` (or similar non-test location) and rename `TestFixture` to `AssemblyBuilder`. This makes it a first-class part of the codebase usable by LLM prompts, share link presets, scripted demos, and tests.

## Current State

Files to move:
- `src/test/fixtures/TestFixture.ts` → `src/builder/AssemblyBuilder.ts`
- `src/test/fixtures/PanelBuilder.ts` → `src/builder/PanelBuilder.ts`
- `src/test/fixtures/types.ts` → `src/builder/types.ts`
- `src/test/fixtures/index.ts` → `src/builder/index.ts`

Tests to keep in place (update imports only):
- `src/test/fixtures/TestFixture.test.ts` → rename to `src/test/fixtures/AssemblyBuilder.test.ts` or move to `src/builder/__tests__/`

## Steps

1. Create `src/builder/` directory
2. Move files, renaming `TestFixture` → `AssemblyBuilder` throughout
3. Update `src/test/fixtures/index.ts` to re-export from `src/builder/` for backward compat (thin shim)
4. Update all test imports — search for `TestFixture` across all test files
5. Update `CLAUDE.md` project structure section to document `src/builder/`
6. Run full test suite — zero failures expected (pure rename + move)

## Success Criteria

- [ ] `src/builder/AssemblyBuilder.ts` exists and exports `AssemblyBuilder` class
- [ ] `src/builder/index.ts` exports everything
- [ ] All existing tests pass with updated imports
- [ ] No references to `TestFixture` remain (except possibly in git history)
- [ ] `CLAUDE.md` documents the builder directory
- [ ] `src/test/fixtures/` either removed or contains only a re-export shim

## Notes

- This is a pure mechanical refactor — no logic changes
- The backward-compat shim in `src/test/fixtures/` is optional. If all imports are updated, it can be deleted entirely. Prefer deleting over shimming.
- Consider whether `PanelBuilder` should also be renamed (it's already a good name)
