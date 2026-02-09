# Proposed Tasks from: typescript-linting-plan.md

**Source:** project-management/drafts/boxen/typescript-linting-plan.md
**Processed:** 2026-02-09

## Task 1: Fix critical TypeScript errors (Phase 1)

- **Title:** Fix panelCollection state, null safety, and LidConfig TypeScript errors
- **Role:** implement
- **Priority:** P2
- **Complexity:** M
- **Description:** Fix the 27 highest-priority TypeScript errors: (1) Audit and fix 8 `panelCollection` references in useBoxStore.ts — determine if property should be added to state type or references removed. (2) Add null checks in DividerPanelNode.ts (9 errors at lines 306-333). (3) Add `enabled: true` to all LidConfig objects missing it (10 errors in FacePanelNode.ts and test files).
- **Success criteria:**
  - `npm run typecheck` shows 27 fewer errors
  - No runtime regressions (existing tests still pass)
  - panelCollection usage is resolved consistently

## Task 2: Fix medium-priority TypeScript errors (Phase 2)

- **Title:** Fix configure-assembly type, SubAssembly fixtures, and module export errors
- **Role:** implement
- **Priority:** P3
- **Complexity:** S
- **Description:** Fix 13 medium-priority errors: (1) Add `configure-assembly` to OperationId type or remove references (9 errors). (2) Fix `assemblyAxis` property path in test fixtures (3 errors). (3) Export `ensureEngineInitialized` or remove import (1 error).
- **Success criteria:**
  - `npm run typecheck` shows 13 fewer errors
  - All existing tests still pass

## Task 3: Clean up unused imports and variables (Phase 3)

- **Title:** Remove ~110 unused imports and variables across 30+ files
- **Role:** implement
- **Priority:** P4
- **Complexity:** M
- **Description:** Remove unused imports (TS6133, TS6192, TS6196, TS6198) across the codebase. Highest-count files: panelGenerator.ts (17), useBoxStore.ts (14), ComprehensiveValidator.ts (9), useBoxStore.test.ts (7). Also remove `label` property from test Face fixtures (6 errors). Can use eslint --fix with appropriate rules for bulk removal.
- **Success criteria:**
  - `npm run typecheck` shows 0 unused variable/import errors
  - No runtime regressions
