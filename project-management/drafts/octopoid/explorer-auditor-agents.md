# Explorer/Auditor Agents

**Source:** Extracted from `project-breakdown-system.md` (2026-02-05)
**Status:** Not implemented

## Concept

Agents that randomly sample from lists or directories to maintain quality and prune complexity:

- Pick something at random to examine
- Track what they've looked at (avoid re-checking recently)
- Prioritize older/stale items
- Make recommendations based on findings

## Use Cases

| Agent | Source | Examines | Outputs |
|-------|--------|----------|---------|
| `test-gap-auditor` | Test matrix gaps | Random untested scenario | Recommendation: add test |
| `doc-auditor` | `docs/` directory | Random document | Recommendation: update/archive/delete |
| `code-auditor` | Source files | Random file | Recommendation: refactor/simplify |
| `draft-auditor` | `project-management/drafts/` | Random draft | Recommendation: archive/enqueue/revise |

## Design

### Audit Log

```sql
CREATE TABLE audit_log (
    id TEXT PRIMARY KEY,
    agent TEXT NOT NULL,
    item_type TEXT,           -- 'file', 'test_gap', 'draft', etc.
    item_path TEXT,
    examined_at TEXT,
    finding TEXT,
    recommendation_id TEXT    -- links to recommendation if one was created
);
```

### Selection Algorithm

Weighted random selection favoring older/stale items, skipping recently examined ones:

```python
def pick_item_to_examine(agent_name, item_list):
    recent = get_recent_audits(agent=agent_name, days=7)
    recent_paths = {r.item_path for r in recent}
    candidates = [i for i in item_list if i.path not in recent_paths]
    if not candidates:
        return None
    weights = [min((now - item.modified_at).days, 365) + 1 for item in candidates]
    return random.choices(candidates, weights=weights, k=1)[0]
```

### Agent Config

```yaml
- name: doc-auditor
  role: auditor
  focus: documentation
  interval_seconds: 3600
  config:
    source_glob: "docs/**/*.md"
    lookback_days: 7
    priority_age_days: 30
```

### Findings vs Recommendations

Not every examination produces a recommendation:
- "Document is current, no action needed" → log only
- "Document references removed feature" → recommendation
- "Test gap is actually covered by integration test" → log only
- "Test gap is real, should add unit test" → recommendation

## Benefits

- Continuous maintenance without dedicated effort
- Random sampling catches things that fall through the cracks
- Audit trail shows what's been examined and when
- Scales naturally with codebase size

## Dependencies

- Recommendation system (for outputting findings) — see `recommendation-consolidation.md`

## Open Questions

- Multiple auditors examining same area — partition or overlap?
- Audit log retention — prune after N days?
- If auditor creates too many low-value recommendations, how to tune?
