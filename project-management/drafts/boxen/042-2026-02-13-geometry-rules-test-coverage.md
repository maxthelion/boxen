# Geometry Rules Test Coverage Audit

**Status:** Idea
**Captured:** 2026-02-13

## Raw

> go through .claude/rules/geometry.md and check that all the scenarios are covered by automated tests

## Idea

Audit the newly rewritten geometry rules document (`.claude/rules/geometry.md` and `docs/geometry rules/geometry-rules.md`) against existing integration and unit tests. For each rule, determine whether automated tests exist that would catch a regression. Where coverage gaps exist, write the missing tests.

## Context

The geometry rules were just comprehensively rewritten (commit `bce17d6`) to cover physical constraints, the full joint system, divider-to-divider joints (crossing vs terminating), edge extensions, sub-assemblies, and path geometry. Several of these sections are newly documented and may lack test coverage — particularly §5 (divider-to-divider joints) which includes known gaps (§12).

## Open Questions

- Which sections already have solid coverage vs which are untested?
- Should this be one large task or broken down per section?
- Should tests be integration-level (engine + panel generation) or also include validator-level checks?
- How do we handle §12 "Known Gaps" — are those tested separately via the terminating divider fix task, or should this audit include them?

## Possible Next Steps

- Map each numbered rule (§1.1–§12.3) to existing test files
- Produce a coverage matrix (rule ID → test file → pass/fail)
- Write missing integration tests for undercovered rules
- Coordinate with the terminating divider fix task (`project-management/drafts/boxen/fix-terminating-divider-joints.md`) to avoid duplicate test work
