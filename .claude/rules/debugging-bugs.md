# Bug Debugging Playbook

**When to use:** When investigating reported bugs, unexpected behavior, or test failures.

## Test-First Debugging Principle

**The test must FAIL before the fix.**

This proves:
1. You can reproduce the bug
2. You understand the expected behavior
3. Your fix actually addresses the root cause
4. The bug won't regress

## Debugging Tools

**Validators:**
- `src/engine/validators/ComprehensiveValidator.ts` - All-in-one geometry validation
- `src/engine/validators/PathChecker.ts` - Path validity (axis-aligned, no duplicates)
- `src/engine/validators/EdgeExtensionChecker.ts` - Edge extension rules
- `src/utils/pathValidation.ts` - Detects invalid geometry programmatically

**3D Rendering:**
- `docs/debugging-3d-rendering.md` - Comprehensive 3D debugging guide
- Enable `slot-geometry` debug tag in `PanelPathRenderer.tsx`

**Test Helpers:**
- `createEngineWithAssembly()` - Realistic engine state
- `generatePanelsFromNodes()` - Actual panels with finger joints
- Use fluent operation builder pattern from existing tests

## Bug Triage Decision Tree

### 1. Reproduce the bug
- What operations were performed?
- Can you reproduce it with a test?
- If no → ask for more details before proceeding

### 2. Classify the issue
**Is it visible in browser?**
- **No** → Logic error, missing feature
- **Yes** → Go to step 3

### 3. Geometry vs Rendering?
**Run validators on engine state:**
```typescript
const result = ComprehensiveValidator.validate(engine.getSnapshot())
if (!result.valid) {
  // GEOMETRY BUG - engine produces wrong state
} else {
  // RENDERING BUG - engine correct, view layer broken
}
```

**Geometry bug indicators:**
- Panels wrong size/position
- Finger joints misaligned
- Objects overlap in 3D
- Validators fail

**Rendering bug indicators:**
- Validators pass
- Holes show as extrusions (winding)
- Missing geometry in view
- See `docs/debugging-3d-rendering.md`

### 4. Check test coverage
- Search test files for similar operations
- If coverage exists but passes → test checks wrong thing
- If no coverage → write the test first

### 5. Write failing test
**Use realistic state:**
```typescript
const engine = createEngineWithAssembly({
  width: 200, height: 150, depth: 100,
  materialThickness: 6,
})

// Replicate user's operations
engine.dispatch({ type: 'OPERATION_NAME', ... })

// Get actual panels (with finger joints!)
const panels = generatePanelsFromNodes(engine._scene)

// Validate outcome (not intermediate state)
const result = ComprehensiveValidator.validate(engine.getSnapshot())
expect(result.valid).toBe(true) // Should FAIL before fix
```

### 6. Fix and verify
- Fix should make test pass
- Run full test suite
- Check in browser if needed

## Common Bug Patterns

### Pattern 1: Holes render as extrusions
- **Cause:** Winding order mismatch
- **Test:** `validatePanelPath(outline, holes)`
- **Debug:** Enable `slot-geometry` tag

### Pattern 2: Missing geometry after operation
- **Cause:** Mutation doesn't reach final panel
- **Test:** Check `panel.outline.points` length, not helper return
- **Debug:** Trace from action dispatch to panel generation

### Pattern 3: Works alone, fails with finger joints
- **Cause:** Algorithm assumes simple polygon
- **Test:** Use `generatePanelsFromNodes()` not mock rectangles
- **Debug:** Real panels have 100+ points from joints

### Pattern 4: Tests pass, browser broken
- **Cause:** Engine→React serialization issue
- **Test:** Compare engine snapshot to `useEnginePanels()` result
- **Debug:** Check `panelBridge.ts`

## Anti-Patterns

❌ Edit code before writing test
❌ Test intermediate state instead of final outcome
❌ Use simple 4-point rectangles instead of real panels with joints
❌ Skip geometry validators
❌ Assume user is wrong
❌ "Works on my machine" without reproducing their operations
❌ Band-aid fixes without understanding root cause

## When to Escalate

**Escalate after 2 hours if:**
- Browser/OS-specific bug
- Validators pass but visual bug persists
- Requires three.js/rendering internals
- Architectural change needed
- Root cause unclear

**Before escalating, provide:**
- Failing test that reproduces bug
- Operations to reproduce
- What you've ruled out
- Root cause theory
