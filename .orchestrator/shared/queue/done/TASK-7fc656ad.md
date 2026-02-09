# [TASK-7fc656ad] Extend SerializedState interface for panel operations

ROLE: implement
PRIORITY: P1
BRANCH: feature/dca27809
CREATED: 2026-02-05T15:51:37.280624
CREATED_BY: human
BLOCKED_BY: a0051d93

## Context
In `/Users/maxwilliams/dev/boxen/src/utils/urlState.ts`, extend the `SerializedState` interface (around line 30) to include panel operations. Add optional field `po?: Record<string, SerializedPanelOps>` where key is panel ID. Create new interface `SerializedPanelOps` with: `cf?: Record<string, number>` for corner fillets (corner key → radius), `acf?: Record<string, number>` for all-corner fillets (cornerId → radius), `co?: SerializedCutout[]` for cutouts. Follow the compact naming convention used elsewhere (e.g., `w` for width, `mt` for materialThickness). Also add `SerializedCutout` type with minimal fields needed to reconstruct.

## Acceptance Criteria
- [ ] SerializedState interface has optional `po` field for panel operations
- [ ] SerializedPanelOps interface defined with cf, acf, co fields
- [ ] SerializedCutout type defined with compact field names
- [ ] TypeScript compiles without errors

CLAIMED_BY: unknown
CLAIMED_AT: 2026-02-05T16:55:24.022529

FAILED_AT: 2026-02-05T16:55:24.402527

## Error
```
Command '['git', 'checkout', '-B', 'feature/dca27809', 'origin/feature/dca27809']' returned non-zero exit status 128.
```

CLAIMED_BY: impl-agent-1
CLAIMED_AT: 2026-02-05T16:56:43.714965

SUBMITTED_AT: 2026-02-05T16:58:33.909561
COMMITS_COUNT: 1
TURNS_USED: 50
