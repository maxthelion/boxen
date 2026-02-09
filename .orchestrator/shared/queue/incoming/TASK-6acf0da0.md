# [TASK-6acf0da0] Add browser_evaluate programmatic geometry validation to QA agent

ROLE: orchestrator_impl
PRIORITY: P3
BRANCH: main
CREATED: 2026-02-09T12:07:21.154882
CREATED_BY: human
PROJECT: 44c3913a
BLOCKED_BY: 81ccfcbf
CHECKS: gk-testing-octopoid

## Context
Enhance QA agent to run programmatic geometry checks alongside visual inspection via browser_evaluate.

1. Create JS snippet agent injects that accesses the engine, runs ComprehensiveValidator, returns structured { passed, errors, warnings }
2. Expose engine on window in staging builds (window.__BOXEN_ENGINE__ = engine)
3. Update QA prompt: after visual inspection, run browser_evaluate with validation script, include structured results in report
4. Visual pass + programmatic fail should still fail the check

## Acceptance Criteria
- [ ] Validation script via browser_evaluate returns structured results
- [ ] Engine exposed on window in staging/dev builds
- [ ] QA prompt updated to include programmatic validation step
- [ ] QA report includes both visual and programmatic results
