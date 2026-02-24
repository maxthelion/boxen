# Missing Builder Operations

**Status:** Idea
**Captured:** 2026-02-13
**Source:** 032-fluent-builder-extraction.md (Phase 1 gaps)

## Summary

The `TestFixture` builder covers most common operations but is missing a few that haven't been needed by tests yet. These should be added organically when tests or other consumers need them, or proactively if the builder is extracted for non-test use.

## Missing Operations

| Operation | Engine Action | Proposed Method |
|-----------|--------------|-----------------|
| Sub-assembly creation | `CREATE_SUB_ASSEMBLY` | `.createSubAssembly(voidId, opts?)` |
| Assembly axis | `SET_ASSEMBLY_AXIS` | `.withAxis('y')` |
| Remove subdivision | `REMOVE_SUBDIVISION` | `.removeSubdivision(voidId)` |

## Notes

- Sub-assembly creation is the most complex — may need a nested builder pattern (e.g., `.createSubAssembly(voidId).withOpenFaces(['top']).withAxis('z').done()`)
- Assembly axis and remove subdivision are straightforward one-liner methods
- None of these are currently blocking any test conversions

## Possible Next Steps

- Add methods as needed when writing tests that require them
- If the builder is extracted to `src/builder/` (see task), add all three for API completeness
