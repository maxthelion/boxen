# TypeScript Linting Plan

**Generated:** 2026-01-31
**Total Errors:** 165

## Overview

This document catalogs all TypeScript errors in the codebase and provides a prioritized plan for addressing them.

## Error Categories

### 1. Unused Variables/Imports (TS6133, TS6192, TS6196, TS6198) — **110 errors**

The vast majority of errors are unused declarations. These don't affect runtime but indicate dead code that should be cleaned up.

| File | Count | Examples |
|------|-------|----------|
| `useBoxStore.ts` | 14 | `FaceId`, `AssemblyAxis`, `LidTabDirection`, `PanelCollection`, etc. |
| `panelGenerator.ts` | 17 | `getPerpFaceId`, `getAutoExtensionsFromFaceOffsets`, `fingerWidth`, etc. |
| `ComprehensiveValidator.ts` | 9 | `Bounds3D`, `panels`, `mt`, `assembly`, etc. |
| `svgExport.ts` | 5 | `getLidFaceId`, `binWidth`, `binHeight`, `kerf` |
| `useBoxStore.test.ts` | 7 | `create`, `BoxState`, `BoxActions`, `Face`, etc. |
| Others | 58 | Various unused imports and variables |

### 2. Missing `enabled` Property in LidConfig (TS2741) — **10 errors**

Multiple files create `LidConfig` objects without the required `enabled` property.

| File | Lines |
|------|-------|
| `FacePanelNode.ts` | 378, 382 |
| `validators.test.ts` | 801, 801, 886, 886, 920, 920 |

**Example fix:**
```typescript
// Before
{ tabDirection: 'tabs-in', inset: 0 }

// After
{ enabled: true, tabDirection: 'tabs-in', inset: 0 }
```

### 3. `panelCollection` Does Not Exist on State (TS2339, TS2353) — **8 errors**

`useBoxStore.ts` references a `panelCollection` property that doesn't exist in the state type definition.

| Lines | Error |
|-------|-------|
| 2245, 2533 | Object literal property doesn't exist |
| 2268-2274, 2282-2283, 2440, 2507 | Property access on undefined |

### 4. `configure-assembly` Not in OperationId Type (TS2367, TS2345, TS2322) — **9 errors**

Tests and components reference `'configure-assembly'` as an operation, but it's not in the `OperationId` type.

| File | Lines |
|------|-------|
| `Box3D.tsx` | 122, 138, 146 |
| `operations.test.ts` | 789, 826, 834, 859, 876, 903 |

### 5. `label` Property on Face (TS2353) — **6 errors**

Test files create Face objects with a `label` property that doesn't exist in the type.

| File | Lines |
|------|-------|
| `operations.test.ts` | 48-53 |

### 6. Missing Module Export (TS2305) — **1 error**

`useBoxStore.ts:6` imports `ensureEngineInitialized` which doesn't exist in the engine module.

### 7. Missing Properties in Test Fixtures (TS2739, TS2740) — **5 errors**

Test fixtures are missing required properties:

| File | Lines | Missing |
|------|-------|---------|
| `validators.test.ts` | 65, 81 | `width`, `height` on PanelPath |
| `validators.test.ts` | 798, 883, 917 | `FaceOffsets` properties |

### 8. Wrong Property Name (TS2561) — **3 errors**

`validators.test.ts` uses `assemblyAxis` directly on SubAssembly instead of `assembly.assemblyAxis`.

| Lines |
|-------|
| 180, 257, 607 |

### 9. Null Safety Issues (TS18047, TS18048) — **9 errors**

Values that might be null are accessed without checks.

| File | Lines |
|------|-------|
| `DividerPanelNode.ts` | 306, 309, 315, 316, 327, 330, 333 |
| `crossLapSlots.test.ts` | 297 |

### 10. Type Incompatibilities (TS2322, TS2345) — **4 errors**

Function signatures or type assignments don't match.

| File | Line | Issue |
|------|------|-------|
| `BoxTree.tsx` | 1031 | `panelId: string` vs `id: string | null` |
| `comprehensiveGeometry.test.ts` | 1655 | `'SET_FACE_CONFIG'` not a valid action type |
| `editableAreas.test.ts` | 107 | `undefined` not assignable to `EdgeExtensions` |

---

## Top Files by Error Count

| File | Errors |
|------|--------|
| `useBoxStore.ts` | 20 |
| `panelGenerator.ts` | 17 |
| `validators.test.ts` | 15 |
| `ComprehensiveValidator.ts` | 10 |
| `DividerPanelNode.ts` | 10 |
| `operations.test.ts` | 9 |
| `useBoxStore.test.ts` | 7 |
| `svgExport.ts` | 6 |

---

## Priority Recommendations

### High Priority (affects functionality)

1. **Fix `panelCollection` state issues in `useBoxStore.ts`**
   - Property may have been removed but references remain
   - 8 errors

2. **Fix null safety issues in `DividerPanelNode.ts`**
   - Could cause runtime errors
   - 9 errors

3. **Add `enabled` property to all `LidConfig` objects**
   - Type mismatch prevents proper type checking
   - 10 errors

4. **Add missing `width`/`height` to test PanelPath fixtures**
   - Tests may not be validating correctly
   - 2 errors

### Medium Priority (type system consistency)

1. **Add `'configure-assembly'` to `OperationId` type**
   - Or remove references if operation no longer exists
   - 9 errors

2. **Fix `assemblyAxis` → `assembly.assemblyAxis` in test fixtures**
   - Wrong property path in SubAssembly objects
   - 3 errors

3. **Export `ensureEngineInitialized` or remove the import**
   - Missing module export
   - 1 error

4. **Fix `BoxTree.tsx` callback signature**
   - Parameter type mismatch
   - 1 error

### Low Priority (cleanup)

1. **Remove ~110 unused imports/variables across 30+ files**
   - No runtime impact, just code cleanliness
   - Can be done incrementally per-file

2. **Remove `label` property from test Face fixtures**
   - Test data has extra properties
   - 6 errors

---

## Execution Plan

### Phase 1: Critical Fixes
- [ ] Audit `panelCollection` usage in useBoxStore.ts - determine if it should be added to state type or references removed
- [ ] Add null checks in DividerPanelNode.ts
- [ ] Add `enabled: true` to LidConfig objects

### Phase 2: Type Consistency
- [ ] Decide on `configure-assembly` operation status
- [ ] Fix SubAssembly test fixtures
- [ ] Fix missing PanelPath properties in tests
- [ ] Resolve module export issue

### Phase 3: Cleanup
- [ ] Remove unused imports (can use `eslint --fix` with appropriate rules)
- [ ] Remove unused local variables
- [ ] Clean up test fixture extra properties

---

## Notes

- Many unused variables appear to be remnants of refactoring or planned features
- The `panelCollection` errors suggest a recent architectural change where panel generation moved to the engine
- Test files have the most type mismatches, likely due to fixtures created before type changes

---

## Processing Summary (automated)

**Processed:** 2026-02-09
**Agent:** draft-processor
**Age at processing:** 5 days

**Actions taken:**
- Archived to project-management/archive/boxen/
- Proposed 3 tasks (see proposed-tasks/typescript-linting-plan.md)
