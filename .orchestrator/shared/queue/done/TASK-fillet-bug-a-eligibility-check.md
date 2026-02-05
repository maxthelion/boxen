# Fix 3D Eligibility Check for Fillet

CREATED: 2026-02-04T15:00:00Z
PRIORITY: P1
COMPLEXITY: S
ROLE: implement
BRANCH: feature/fillet-all-corners-integration-tests
SKIP_PR: true

## Context

The 3D fillet eligibility tooltip shows "No eligible corners on this panel" even when corners are eligible. This is because the eligibility check uses the old `cornerEligibility` data instead of `allCornerEligibility`.

## Task

In `src/operations/eligibility.ts`:

1. Find the `getFilletPanelEligibility` function (around line 103)
2. Change `panel.cornerEligibility` to `panel.allCornerEligibility`

## The Fix

```typescript
// Line 104 - Change from:
const cornerEligibility = panel.cornerEligibility ?? [];

// To:
const cornerEligibility = panel.allCornerEligibility ?? [];
```

## DO NOT

- Do not modify any other functions
- Do not change the logic, just the data source

## Acceptance Criteria

- [ ] `getFilletPanelEligibility` uses `allCornerEligibility`
- [ ] Selecting a panel in 3D with fillet tool no longer shows "No eligible corners" incorrectly
- [ ] Commit changes

CLAIMED_BY: impl-agent-2
CLAIMED_AT: 2026-02-04T15:00:15.767308

COMPLETED_AT: 2026-02-04T15:01:36.787454

## Result
Merged directly to feature/fillet-all-corners-integration-tests
