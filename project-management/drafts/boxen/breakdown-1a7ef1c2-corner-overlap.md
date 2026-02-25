# Breakdown: TASK-1a7ef1c2 — Fix edge extension corner overlap

**Original task:** Fix edge extension corner overlap — female yields by MT
**Failed attempts:** 3 (450+ tool calls, 0 commits)
**Root cause of failure:** Task requires understanding 3 interconnected systems (axisOwnership, BasePanel extension geometry, validators) and the agent couldn't hold the full picture

## Problem Summary

When two adjacent face panels both have edge extensions (e.g. front and right both extend their top edges on a lidless box), the extensions overlap at the shared corner. The geometry rule says "female yields by MT" — the female panel's extension should be inset by material thickness at the corner.

## Existing Infrastructure (already implemented, NOT wired)

1. **`src/utils/axisOwnership.ts`** — `getOverlapLoser(faceA, faceB, ...)` returns which face yields. `calculateOverlapNotch(...)` returns `{notchDepth: MT, notchLength: overlapLength}`. These work but are NEVER CALLED from panel generation.

2. **`src/engine/nodes/BasePanel.ts:1732-1741`** — Corner skip logic uses `EDGE_ORDER` (processing order: top=0, right=1, bottom=2, left=3) instead of wall priority/gender. This determines which edge "skips" a corner, but doesn't inset by MT.

3. **`src/engine/validators/EdgeExtensionChecker.ts:412`** — `checkCornerOwnership()` detects the overlap but emits WARNING not ERROR.

4. **`tests/integration/geometry/edgeExtensionOverlap.test.ts:176`** — Skipped test that documents what the fix should achieve. Just needs `.skip` removed once the fix lands.

## Sub-Tasks

### Sub-Task A: Wire axisOwnership into BasePanel extension corner logic

**What:** Replace the `EDGE_ORDER` processing-order logic in `BasePanel.applyExtensionToEdge()` with gender-based corner ownership from `axisOwnership.ts`.

**Specifically:**
- Lines 1736-1741: `skipStart`/`skipEnd` currently check `EDGE_ORDER[adjacentEdge] < currentOrder`. Replace with a call to `getOverlapLoser()` to determine whether THIS panel yields at each corner.
- When this panel is the loser (female), the extension must be inset by `materialThickness` at that corner — both the corner point positions AND the extension side span need adjusting.
- The pre-computed `extendedCorners` (BasePanel lines 919-936) assume full extension — they need to account for the MT inset when adjacent panel wins the corner.

**Key files:**
- `src/engine/nodes/BasePanel.ts` — `applyExtensionToEdge()`, extended corner computation
- `src/utils/axisOwnership.ts` — `getOverlapLoser()`, `calculateOverlapNotch()` (read-only, already correct)

**Test:** Enable the skipped test at `tests/integration/geometry/edgeExtensionOverlap.test.ts:176` (remove `.skip`). It must FAIL before the fix and PASS after.

**Acceptance criteria:**
- [ ] Skipped test enabled and passes
- [ ] `getOverlapLoser()` is called during extension geometry generation
- [ ] Female panel's extension is inset by MT at the shared corner
- [ ] Male panel's extension unchanged (occupies full corner)
- [ ] `npm run test:run` passes, `npm run typecheck` passes

### Sub-Task B: Upgrade validator from WARNING to ERROR

**What:** In `EdgeExtensionChecker.checkCornerOwnership()`, change `addWarning` to `addError` so the ComprehensiveValidator catches overlap as a failure.

**Specifically:**
- Line 412: `this.addWarning(...)` → `this.addError(...)`
- Update the message to be more specific: include which panel should yield and by how much
- Add a check: if the geometry IS correctly inset (fix from Sub-Task A working), don't emit the error

**Key files:**
- `src/engine/validators/EdgeExtensionChecker.ts` — `checkCornerOwnership()` method

**Test:** Integration test that creates overlapping extensions WITHOUT the geometry fix → should emit error. With the fix → should pass clean.

**Acceptance criteria:**
- [ ] Validator emits error (not warning) when overlap detected
- [ ] Validator passes clean when geometry is correctly inset
- [ ] Existing edge extension validator tests updated
- [ ] `npm run test:run` passes

### Sub-Task C: Add multi-corner test cases

**What:** The existing skipped test only covers front+right top extensions. Add cases for:
- All four top-edge corners (front+right, right+back, back+left, left+front)
- Bottom-edge corners (same combos)
- Three panels extending the same edge (e.g. front+right+back all extend top)
- Extension amounts that differ (front=20mm, right=10mm)

**Key files:**
- `tests/integration/geometry/edgeExtensionOverlap.test.ts`

**Acceptance criteria:**
- [ ] 8+ new test cases covering various corner combinations
- [ ] All pass after Sub-Task A fix
- [ ] Tests verify actual geometry coordinates (not just validator pass/fail)

## Dependencies

```
Sub-Task A (geometry fix) ← blocks ← Sub-Task B (validator upgrade)
Sub-Task A (geometry fix) ← blocks ← Sub-Task C (test cases)
```

Sub-Task A is the core fix. B and C can run in parallel after A lands.

## Why the Agent Failed

The agent burned turns trying to understand the full extension geometry pipeline (150+ lines of corner-finding, path splicing, wrap-around handling) without realizing that:
1. The resolution logic already exists in `axisOwnership.ts`
2. The skipped test already documents the expected outcome
3. The fix is primarily about WIRING — calling existing functions from the right place

Each sub-task narrows the scope so the agent can focus on one concern.
