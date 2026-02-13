# Systematic Bug Debugging Playbook

**Status:** Idea
**Captured:** 2026-02-13

## Raw

> I want to rethink how bugs are reported and debugged. If I see something wrong, I will report it with a screenshot. The immediate thing to try to establish is what operations were applied to get to the broken state. It should also be established how the result differs from what should be expected. It should be established whether this is a geometry issue or not. A geometry issue is one where objects are overlapping in 3d space, joints aren't mating etc. It should be established whether an integration test exists that would cover this situation. This should follow our holistic testing strategy that prioritises outside in testing. If there is a geometry issue, we should replicate the operations the user reported to create a failing test and figure out why it is doing that. This means using the fluent operation builder and running geometry validations against the result. If the tests pass, we should consider how the engine creates state that is rendered by react in the browser. We should theorize why this might not be working in the way expected. In summary, I want there to be a systematic playbook for finding bugs that involves reasoning about the state we expect and testing it. I don't want to do a huge amount of back and forth to try to communicate this. We should save user testing for the end. WE might even want to include playwright mcp testing when we think that the bug has been correctly identified. Don't rush to overly simplistic conclusions or apply bandaid fixes. THink about how systems work holistically.

## Idea

Create a systematic debugging playbook that prioritizes reproducing bugs via tests before manual investigation. When a bug is reported:

1. **Establish the reproduction path** - What operations were performed to reach the broken state?
2. **Define expected vs actual** - How does the result differ from what should happen?
3. **Classify the bug type** - Is this a geometry issue (overlapping objects, misaligned joints) or something else?
4. **Check for existing test coverage** - Does an integration test already cover this scenario?
5. **Write a failing test first** - Use the fluent operation builder to replicate the user's operations and run geometry validations
6. **If tests pass but bug exists** - Investigate the engine→React rendering pipeline for state serialization issues
7. **Use Playwright for end-to-end validation** - Once the bug is identified, verify the fix with browser-level tests
8. **Think holistically** - Avoid band-aid fixes, understand the system behavior

This follows the outside-in testing philosophy: start with integration tests that replicate user actions, then drill down to the root cause.

## Alignment with Test-First Philosophy

This playbook implements the test-first philosophy from CLAUDE.md:

> "Before implementing a new feature that modifies geometry or user-facing behavior,
> write integration tests FIRST that test the final artifact, not intermediate state."

**Key principle:** The test should FAIL before the fix, proving the bug exists.

For bugs, this means:
1. Write test that reproduces user's operations
2. Test should FAIL (proving we can detect the bug)
3. Fix the bug
4. Test should PASS
5. Test becomes regression prevention

## Context

Current debugging often involves back-and-forth conversation to establish reproduction steps. This wastes time and can lead to surface-level fixes that don't address root causes.

The test-first debugging approach:
- Forces clear understanding of expected behavior
- Creates regression tests automatically
- Prevents overly simplistic conclusions
- Documents the bug and fix for future reference

## Debugging Tools Reference

**Existing validators:**
- `src/engine/validators/ComprehensiveValidator.ts` - All-in-one geometry validation
- `src/engine/validators/PathChecker.ts` - Path validity (axis-aligned, no duplicates)
- `src/engine/validators/EdgeExtensionChecker.ts` - Edge extension rules
- `src/utils/pathValidation.ts` - Detects invalid geometry programmatically

**3D rendering issues:**
- See `docs/debugging-3d-rendering.md` for comprehensive 3D debugging guide
- Enable `slot-geometry` debug tag for detailed geometry logging in `PanelPathRenderer.tsx`

**Test helpers:**
- `createEngineWithAssembly()` - Create realistic engine state
- `generatePanelsFromNodes()` - Get actual panel dimensions with finger joints
- Fluent operation builder pattern (see existing integration tests)

## Bug Triage Flowchart

**1. Can you see it in the browser?**
- Yes → Is the 3D geometry wrong or just the rendering?
  - Geometry wrong → Check engine state (step 3)
  - Rendering wrong → See `docs/debugging-3d-rendering.md`
- No → Missing feature or logic error (step 4)

**2. Is it a geometry issue?**
- Objects overlapping in 3D space
- Finger joints misaligned
- Panels wrong size or position
- Holes rendering as extrusions (winding order)
→ Write integration test with geometry validators

**3. Check engine state first**
- Run `ComprehensiveValidator` on engine snapshot
- Check if error is in model or view layer
- If validators pass but browser shows bug → rendering pipeline issue

**4. Is there test coverage?**
- Search for similar operations in test files
- If coverage exists but passes → test is checking wrong thing
- If no coverage → this is the test you write first

## Common Bug Patterns

### Type 1: Holes rendering as extrusions
**Cause:** Winding order mismatch (outline and holes must be opposite)
**Debug:** Enable `slot-geometry` tag, check winding in `PanelPathRenderer`
**Test:** Validate path with `validatePanelPath(outline, holes)`

### Type 2: Missing geometry after operation
**Cause:** Operation mutates intermediate state but doesn't apply to final panel
**Debug:** Check if operation action is dispatched vs helper function called
**Test:** Verify `panel.outline.points` changed, not just helper return value

### Type 3: Operation works in isolation but fails with finger joints
**Cause:** Algorithm assumes simple polygon, doesn't preserve complex paths
**Debug:** Test with actual panel from `generatePanelsFromNodes()`
**Test:** Include finger joints in test setup (100+ points, not 4-point rectangle)

### Type 4: Tests pass but browser shows bug
**Cause:** Engine state correct but serialization/rendering broken
**Debug:** Check `panelBridge.ts` and snapshot conversion
**Test:** Compare engine snapshot to what React receives via `useEnginePanels()`

## Anti-Patterns to Avoid

❌ **Don't start by editing source code** - Write the failing test first

❌ **Don't test intermediate state** - Test the final user-visible outcome
- BAD: `expect(extractAffectedEdges()).toHaveProperty('north')`
- GOOD: `expect(panel.outline.points.length).toBeGreaterThan(originalLength)`

❌ **Don't use simple test shapes** - Use realistic state with finger joints
- BAD: Rectangle with 4 points
- GOOD: Panel with 100+ points from actual finger joint generation

❌ **Don't skip geometry validators** - Always run comprehensive checks

❌ **Don't assume the user is wrong** - If they report it, there's usually something real

❌ **Don't rush to "works on my machine"** - Reproduce their exact operations

❌ **Don't apply band-aid fixes** - Understand the root cause and system behavior

## When to Escalate

Escalate to user/human if:
- Bug only reproduces in specific browser/OS
- Geometry validators pass but visual bug persists
- Bug involves complex three.js rendering internals
- Fix would require architectural changes
- Root cause unclear after 2+ hours investigation

**Before escalating, provide:**
- The failing test you wrote
- The operations to reproduce
- What you've ruled out
- Your theory of root cause

## Open Questions

- **Playbook format:** Should this be a `.claude/rules/` document, a checklist in CLAUDE.md, or a separate debugging guide?
- **Screenshot integration:** How should screenshots be used? Store them? Reference them in tests?
- **Geometry validation tooling:** Do we need additional helpers for common geometry assertions?
- **Playwright integration:** When is browser-level testing worth the overhead vs integration tests?
- **Bug report template:** Should we formalize bug reports with required fields (operations, expected, actual)?

## Possible Next Steps

1. **Write the playbook** - Create a step-by-step debugging guide in `.claude/rules/debugging-bugs.md`
2. **Add to agent prompts** - Include playbook reference in implement/test agent prompts
3. **Create bug report template** - Standardize how bugs are reported (operations, screenshot, expected vs actual)
4. **Expand geometry validators** - Add helpers for common assertions (joints align, no overlap, etc.)
5. **Document common patterns** - Catalog typical bug types and their debugging approaches
6. **Train on examples** - Walk through 2-3 real bugs using the playbook to refine it
