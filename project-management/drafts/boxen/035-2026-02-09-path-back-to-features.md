# Path Back to Features

**Status:** Action Plan
**Captured:** 2026-02-09

## Context

Octopoid is working. QA pipeline validated end-to-end today (TASK-251e9f63). Agents can implement, test, and visually verify features autonomously. Huge progress in 5 days.

But we're not back to features yet. The system catches obviously-wrong implementations, but doesn't prevent them. Agents still thrash, architecture still has landmines, tests still miss visual bugs.

**Goal:** Get back to building Boxen features at high velocity, with agents handling 80% of implementation work and humans focusing on architecture, UX, and design.

## What's Blocking Features Now

### Critical Blockers (must fix before trusting agents with features)

1. **Tests don't catch visual bugs**
   - Integration tests exercise engine → panels but don't validate geometry
   - Comprehensive validator exists but isn't required in CI or agent workflows
   - Agents write code that passes tests but produces broken geometry

2. **Architecture landmines**
   - Panel ID confusion causes bugs in every feature touching selection/filtering
   - Coordinate system confusion causes geometry misalignment
   - Inconsistent operation patterns → agents reinvent instead of reuse

3. **Agent rules incomplete**
   - No test-first enforcement (agents write code, then tests)
   - No pattern reuse requirement (agents don't check for existing implementations)
   - No root cause thinking (bandaid fixes instead of proper solutions)

### Nice-to-Have (can work around, but slows things down)

4. **QA screenshots not persisted** (TASK-001cdbe2 will fix)
5. **Gatekeeper dispatch guardrails** (TASK-fad87bf8 will add tests and validation)
6. **File-vs-DB queue sync** (manual fixes work, but annoying)

## The Plan: Three Phases

### Phase 1: Make Tests Catch Visual Bugs (1-2 weeks)

**Objective:** Agents can't merge code that produces obviously broken geometry.

**Actions:**

1. **Require comprehensive validator in CI**
   - Add validator run to GitHub Actions workflow
   - Fail PR if validator reports errors
   - **Task:** Update `.github/workflows/test.yml` to run validator

2. **Require comprehensive validator in agent test suite**
   - Update `.claude/rules/testing.md`: all integration tests must run validator
   - Agents cannot submit without validator passing
   - **Task:** Update testing rules, add to agent prompts

3. **Build test matrix infrastructure**
   - Create fixtures: basic box, subdivided-x, subdivided-z, grid-2x2, grid-3x3
   - Helpers for common assertions (panel count, finger joint alignment, etc.)
   - **Task:** Add `src/engine/integration/fixtures.ts` with test matrix

4. **Update test-first requirement**
   - Integration tests BEFORE implementation
   - Tests verify user-visible outcome (panel geometry, visual state)
   - Tests run validator and assert it passes
   - **Task:** Update `CLAUDE.md` test-first section with validator requirement

**Success metric:** New feature PRs have comprehensive validator passing before human review.

### Phase 2: Fix Architecture Landmines (2-3 weeks, parallel with Phase 1)

**Objective:** Reduce "obviously wrong" bugs caused by confusing architecture.

**Priority 1: Panel IDs**
- Current state: `docs/panel-id-system.md` documents the API, but agents still get it wrong
- Root cause: The API is too complex (runtime UUIDs + canonical keys + conversion functions)
- **Action:** Simplify. Either:
  - A) Use UUIDs everywhere, generate canonical keys only for serialization
  - B) Use canonical keys everywhere, no UUIDs
- **Task:** Design simplified panel ID system, migrate existing code
- **Success:** No more "panel not found" or "wrong panel selected" bugs

**Priority 2: Coordinate Systems**
- Current state: 2D view, 3D world space, panel-local space all use different conventions
- Root cause: Not documented, no clear conversion utilities
- **Action:** Document each coordinate space, provide conversion utilities, add validation
- **Task:** Write `docs/coordinate-systems.md`, add conversion helpers
- **Success:** No more misaligned geometry bugs

**Priority 3: Canonical Operation Patterns**
- Current state: Multiple ways to do the same thing (direct mutations vs. dispatch, custom panel generation vs. `generatePanelsFromNodes()`)
- Root cause: Patterns not documented, no enforcement
- **Action:** Document canonical patterns, create reference implementations, update agent rules
- **Task:** Add `docs/operation-patterns.md`, update `.claude/rules/operations.md`
- **Success:** Code reviews rarely find "why didn't you use pattern X?" issues

**Lower priority: Event Sourcing Consistency**
- Works well enough, just needs consistency (all mutations via dispatch, or none)
- Can defer until architecture is otherwise solid

### Phase 3: Optimize Agent Workflows (1 week, after Phase 1+2 complete)

**Objective:** Reduce agent thrashing and improve code quality.

**Actions:**

1. **Update agent prompts with pattern reuse requirement**
   - Before writing new code, search for existing implementations
   - Use `Glob` and `Grep` to find similar features
   - Reuse proven patterns instead of reinventing

2. **Add architecture gatekeeper check**
   - Flags code duplication (same logic as existing pattern)
   - Flags pattern violations (direct mutation when should dispatch, etc.)
   - Human can override, but agent must justify

3. **Add root cause thinking to feedback loop**
   - When QA fails or review finds bugs, agent must:
     - Read the original implementation
     - Identify root cause (not just symptom)
     - Propose proper fix (not bandaid)
   - Template: "Root cause: X. Proper fix: Y. Why this is better than bandaid Z."

4. **Create reference implementations for complex features**
   - Human writes minimal working example
   - Agent extends/generalizes
   - Reduces architectural mismatch

**Success metric:** Features require 1-2 review cycles instead of 3-5, with most feedback on UX/design rather than bugs.

## Timeline and Prioritization

### Week 1 (Now)
- [x] QA pipeline working end-to-end ✅
- [ ] Comprehensive validator required in CI
- [ ] Comprehensive validator required in agent test suites
- [ ] Updated test-first rules with validator requirement
- [ ] Start: Panel ID system simplification design

### Week 2
- [ ] Test matrix infrastructure (fixtures and helpers)
- [ ] Panel ID system implementation + migration
- [ ] Coordinate systems documentation
- [ ] Start: Canonical operation patterns documentation

### Week 3
- [ ] Finish: Canonical operation patterns documentation
- [ ] Update agent rules with pattern reuse requirement
- [ ] Architecture gatekeeper check (flags duplication and pattern violations)

### Week 4
- [ ] Polish and testing of all Phase 1+2 work
- [ ] **START BUILDING FEATURES AGAIN** 🎉

## Success Criteria

**We're ready for features when:**

1. ✅ QA pipeline catches obviously wrong implementations before human review
2. ✅ Comprehensive validator passes on all PRs (enforced in CI)
3. ✅ Panel ID bugs are rare (< 1 per 10 features)
4. ✅ Coordinate system bugs are rare (< 1 per 10 features)
5. ✅ Agents reuse existing patterns (< 20% code duplication in reviews)
6. ✅ Features require 1-2 review cycles average (down from 3-5)

**Human review focuses on:**
- UX and design decisions
- Feature prioritization and roadmap
- Architectural direction (not bugs!)
- Complex geometry algorithms (CSG, etc.)

**Agents handle autonomously:**
- Feature implementation (80% of work)
- Integration tests
- Visual QA verification
- Routine bug fixes

## What This Unlocks

**Short-term (Weeks 5-8):**
- Ship 2-3 features per week (up from ~0.5 per week currently)
- Roadmap progress: subdivisions, sub-assemblies, advanced operations
- User-facing improvements: better UX, performance, stability

**Medium-term (Months 3-6):**
- Catch up on backlog (all the features we've been delaying)
- Explore new directions (advanced geometry, customization, templates)
- User feedback loop tightens (ship → feedback → iterate faster)

**Long-term (6+ months):**
- Boxen becomes load-bearing product, not side project
- Development velocity sustainable without burning out
- Architecture is solid foundation for ambitious features

## Risks and Mitigations

**Risk: Phase 1+2 takes longer than expected**
- Mitigation: Can start features earlier if validator + panel IDs are done, defer coordinate systems and patterns
- Fallback: Build features in areas unaffected by architectural issues (e.g., export, sharing, UI polish)

**Risk: Agents still produce bugs despite better tests**
- Mitigation: Iterate on gatekeeper checks and validation rules
- Fallback: Increase human review temporarily, extract patterns from bugs into automated checks

**Risk: Architectural work reveals deeper issues**
- Mitigation: Scope fixes narrowly (solve immediate pain points, not perfect architecture)
- Fallback: Document workarounds, defer perfect solution

**Risk: Burn out before finishing Phase 1+2**
- Mitigation: Parallelize work (agents handle some tasks while human focuses on others)
- Fallback: Pause at Phase 1 complete, ship features, return to Phase 2 later

## Concrete Next Steps (This Week)

### Day 1 (Today/Tomorrow)
1. Add comprehensive validator to CI workflow
2. Update `.claude/rules/testing.md` with validator requirement
3. Enqueue task: Design simplified panel ID system

### Day 2-3
1. Enqueue task: Build test matrix fixtures
2. Start panel ID simplification (interactive design session)
3. Update `CLAUDE.md` test-first section

### Day 4-5
1. Document coordinate systems (interactive session)
2. Review and approve validator CI + testing rules changes
3. Plan Week 2 work (panel ID migration, canonical patterns)

### End of Week
- Checkpoint: Can we merge a trivial feature with validator passing?
- If yes: Phase 1 is working, continue to Phase 2
- If no: Debug why validator isn't catching bugs, iterate

## The Philosophy

**Don't let perfect be the enemy of good.**

We don't need perfect architecture. We need:
- Tests that catch obviously wrong bugs
- Architecture that doesn't have obvious landmines
- Agents that can build features without constant human rescue

Once we hit that threshold, we ship features. We improve architecture iteratively as we encounter pain points, not by boiling the ocean upfront.

**The goal is velocity, not perfection.**

Get back to features as soon as the agents can be trusted to build them correctly. Every week spent on infrastructure is a week not shipping to users. Make the minimum investments needed to unblock progress, then iterate.

**Octopoid is the enabler, Boxen is the goal.**

We built Octopoid to make Boxen development sustainable. It's working. Now use it to build Boxen.
