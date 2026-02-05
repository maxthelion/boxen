# Fix Safe Space Extension Gap

CREATED: 2026-02-04T16:40:00Z
PRIORITY: P2
COMPLEXITY: S
ROLE: implement
BRANCH: main
SKIP_PR: true

## Root Cause (from previous investigation)

In `src/engine/safeSpace.ts`, there's a **gap between body region and extension region**.

- Panel with 10mm bottom extension
- Expected: 1 contiguous safe region from body through extension
- Actual: 2 separate regions with a 3mm gap at body boundary
- **Bug:** Extension starts at `halfH + mt` instead of `halfH`

The safe space inset margin is being incorrectly applied to the extension side.

## Task

1. Open `src/engine/safeSpace.ts`
2. Find where edge extensions affect the safe space outline
3. Fix: Extension region should start at body boundary (`halfH`), NOT `halfH + mt`
4. Run tests: `npm run test:run -- src/engine/safeSpace.test.ts`
5. Verify the gap is gone (1 contiguous region, not 2)

## The Fix Pattern

```typescript
// WRONG: adds material thickness gap
extensionStart = halfH + mt

// CORRECT: contiguous with body
extensionStart = halfH
```

## DO NOT

- Do not refactor unrelated code
- Just fix the gap calculation

## Acceptance Criteria

- [ ] Safe space tests pass
- [ ] Body and extension regions are contiguous (no gap)
- [ ] Commit changes

CLAIMED_BY: impl-agent-1
CLAIMED_AT: 2026-02-04T16:55:46.998543

COMPLETED_AT: 2026-02-04T17:01:35.243024

## Result
Merged directly to main
