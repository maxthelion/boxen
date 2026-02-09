# Problems Holding Back Speed

**Status:** Analysis
**Captured:** 2026-02-09

## The Core Problem

Features are being built, but when checked by a human, they're **obviously wrong**. This creates a vicious cycle:

1. Feature implemented by agent
2. Human reviews → finds obvious bugs (geometry wrong, feature doesn't work as described, visual artifacts)
3. Feedback given → agent thrashes with bandaid fixes instead of addressing root cause
4. More review cycles → exhausts human, wastes agent time
5. Eventually works or gets abandoned

The expensive part is the **human check**. If features worked the first time (or at least failed in non-obvious ways that need human judgment), the system would move fast. But catching obviously-wrong implementations drains human energy that should go toward architecture and design.

## Why Features Are Obviously Wrong

### 1. Inadequate Automated Testing

**Current state:**
- Tests exist but don't catch geometry bugs that are visually obvious
- Unit tests pass while integration is broken (algorithms work in isolation, fail when composed)
- No test coverage for "does this look right?" — only "does the data structure match expectations?"

**What's missing:**
- Testing philosophy that prioritizes user-visible outcomes over implementation details
- Test matrix covering common scenarios (basic box, subdivided box, with finger joints, etc.)
- Validation that geometry is renderable (no degenerate paths, correct winding order, etc.)

**Result:** Agents write code that passes tests but produces wrong visual output. Human discovers this during manual review.

### 2. Architecture Not Fit for Purpose

**Lingering issues that cause bugs:**

**Panel IDs:**
- Runtime UUIDs vs. canonical keys for serialization
- No clear API, agents reinvent ID handling each time
- Causes bugs in selection, filtering, share links

**Coordinate system confusion:**
- 2D view uses different coordinate conventions than 3D
- Panel outlines vs. viewport coordinates vs. world space
- Agents get this wrong repeatedly, causing misaligned geometry

**Event sourcing half-implemented:**
- Action dispatching exists but isn't consistently used
- Some operations mutate directly, others go through dispatch
- Creates subtle timing bugs and undo/redo failures

**Result:** Even simple features trip over architectural landmines. The architecture makes it easy to write broken code.

### 3. Inconsistent Code Paths

**Pattern:** Agents write brand new code that works slightly differently, rather than reusing existing patterns.

**Examples:**
- New operation creates panels from scratch instead of using `generatePanelsFromNodes()`
- Custom finger joint calculation instead of reusing `fingerJoints.ts`
- Direct geometry manipulation instead of going through the engine's action system

**Why this happens:**
- Agents don't know which patterns are canonical
- Existing patterns aren't documented or discoverable
- It's easier to write new code than find and adapt existing code

**Result:** Multiple implementations of the same concept, each with different bugs. Maintenance nightmare.

### 4. Thrashing on Feedback

**Pattern:** When a human points out a bug, the agent applies a bandaid fix instead of understanding the root cause.

**Example:**
- Bug: "center line renders on all 3 axes instead of just Y"
- Bandaid: Remove X and Z lines
- Root cause: Component doesn't accept an axis parameter, always renders all 3
- Better fix: Add axis prop, make it dynamic

**Why this happens:**
- Agent doesn't re-read context before fixing
- Pressure to "just make it work" rather than "make it right"
- Lack of architectural understanding

**Result:** Fixes that work for the specific test case but break in other scenarios or create technical debt.

## Solutions

### 1. Improve Automated Testing

**Testing philosophy (highest priority):**
- Test user-visible outcomes, not implementation details
- Integration tests that exercise full render path (engine → panels → 3D view)
- Validation tests that catch unrenderable geometry before human sees it
- See: `.claude/rules/geometry.md`, test-first development requirement in `CLAUDE.md`

**Test matrix:**
- Basic box (no subdivisions)
- Subdivided box (X, Y, Z axes)
- Grid (2×2, 3×3)
- With finger joints, without finger joints
- Sub-assemblies (drawer, tray)

**Comprehensive validator:**
- Already exists: `src/engine/validators/ComprehensiveValidator.ts`
- Checks geometry rules, finger joint alignment, panel dimensions, slot positions
- Should run in CI and in agent test suites
- Catches 80% of "obviously wrong" bugs before human review

### 2. Playwright QA as a Cheap Step

**Philosophy:** Playwright QA is for code that should already be working.

**When to use:**
- After implementation passes unit tests and integration tests
- After validator confirms geometry is sound
- As final verification before merging

**What it catches:**
- "Feature doesn't work" (button does nothing, UI doesn't respond)
- "Visual glitches" (z-fighting, gaps, misaligned panels)
- "Wrong behavior" (operation does opposite of description)

**What it doesn't replace:**
- Integration tests (Playwright is too slow for rapid iteration)
- Geometry validation (visual inspection can miss subtle bugs)
- Unit tests (Playwright can't pinpoint which function broke)

**ROI:** High. Catches obvious bugs that would otherwise require human review, at the cost of a few minutes of agent time.

### 3. Fix Architecture Fit-for-Purpose Issues

**Panel IDs:**
- Document the canonical API in `docs/panel-id-system.md` (already exists)
- Add rule: agents MUST use the documented API, not custom ID logic
- Consider: simplify the system if it's still confusing after documentation

**Coordinate systems:**
- Document each coordinate space and when to use it
- Provide conversion utilities
- Add validation that catches coordinate system mismatches

**Event sourcing:**
- Either commit fully (all mutations via dispatch) or remove it (allow direct mutations)
- Document the decision and enforce it in code reviews

**General principle:** Make it harder to write broken code than correct code. If agents keep making the same mistake, the architecture is wrong.

### 4. Reuse Existing Patterns

**Make patterns discoverable:**
- Document canonical implementations in `CLAUDE.md` or `.claude/rules/`
- Add "See existing implementation: X" comments in prompts
- Create reference examples for common operations

**Enforce reuse:**
- Gatekeeper checks flag code duplication
- Code review looks for "why not use existing pattern X?"
- Postmortems when new code breaks because it didn't reuse a proven pattern

**Specific targets:**
- Panel generation: always use `generatePanelsFromNodes()`
- Finger joints: always use `fingerJoints.ts` utilities
- Operations: always dispatch actions, never mutate directly

### 5. Better Rules for Developing Agents

**Test-first requirement:**
- Write integration tests BEFORE implementation
- Tests must verify user-visible outcome, not intermediate state
- Tests should FAIL initially (proves they're testing the right thing)

**Architecture awareness:**
- Read existing implementations before writing new code
- Use established patterns (don't reinvent)
- Ask "is there existing code that does something similar?"

**Root cause thinking:**
- When fixing a bug, understand WHY it happened
- Don't apply bandaid fixes
- If the fix feels hacky, it probably is

**Reference implementation pattern:**
- For complex features, human writes a minimal working example first
- Agent extends/generalizes the example rather than starting from scratch
- Reduces architectural mismatch

## Additional Observations

### The "Obviously Wrong" Threshold

What makes a bug "obviously wrong" vs. "needs human judgment"?

**Obviously wrong:**
- Feature described as "add button to X" but no button appears
- Operation described as "Y-axis only" but renders on all 3 axes
- Geometry renders inside-out or with holes

**Needs human judgment:**
- Feature works but UX is awkward
- Geometry is correct but performance is poor
- Implementation is correct but approach is suboptimal

Automation should catch everything in the "obviously wrong" category. Human review focuses on the judgment category.

### The Testing Gap

We have two extremes:
- **Unit tests:** Fast, precise, but don't catch integration bugs
- **Human review:** Catches everything, but expensive and slow

What's missing is the middle layer:
- **Integration tests:** Exercise full system, catch composition bugs
- **Validation tests:** Check invariants (geometry rules, data integrity)
- **Visual regression tests:** Catch rendering changes

Playwright QA fills some of this gap, but we also need programmatic validation that doesn't require visual inspection.

### The Architecture Debt Problem

Some issues (panel IDs, coordinate systems) have been "lingering" for months. Why haven't they been fixed?

**Chicken-and-egg:**
- Can't fix panel IDs while building features that depend on them
- Can't stop building features to fix panel IDs (users need features)

**Automation breaks this:**
- Agents build features on current architecture
- Human improves architecture in parallel
- Eventually, features get refactored to use improved architecture

This only works if agents can build features without human hand-holding. If every feature needs multiple review cycles due to architectural issues, the human never gets time for architectural work.

### The Feedback Loop Timing

**Current state:**
- Agent builds feature (2-4 hours)
- Human reviews (finds bugs immediately, but review happens hours/days later)
- Agent fixes (30 minutes)
- Repeat

**Ideal state:**
- Agent builds feature (2-4 hours)
- Automated checks catch obvious bugs (5 minutes)
- Agent fixes (30 minutes)
- Human reviews working feature (finds UX issues, design improvements)

The key is moving "obviously wrong" detection from human review to automated checks. This tightens the feedback loop from hours to minutes.

### Code Patterns as Compression

When agents reuse existing patterns, they're using a form of compression:
- Pattern = many decisions already made and validated
- Reusing pattern = inheriting those decisions
- Writing new code = re-making all those decisions (opportunity for bugs)

The architecture should make patterns easily discoverable and obviously correct. If an agent reaches for custom code instead of a pattern, either:
1. The pattern is hard to find (discoverability problem)
2. The pattern doesn't fit (abstraction problem)
3. No pattern exists (missing infrastructure)

All three are architectural issues.

## Implications

**For Octopoid:**
- Gatekeeper architecture check should flag code duplication and pattern violations
- Gatekeeper testing check should verify comprehensive validator passes
- Self-merge should require passing tests AND validator
- QA gatekeeper is the last check, not the first

**For Boxen architecture work:**
- Priority: Fix panel ID system (causes too many bugs)
- Priority: Document coordinate systems (causes too many bugs)
- Priority: Establish canonical operation patterns (reduce code duplication)
- Lower priority: Event sourcing (works well enough, just needs consistency)

**For agent development:**
- Update test-first requirement to include validation tests
- Add "read existing implementations first" rule
- Add "use comprehensive validator" requirement
- Create reference implementations for complex features

**For testing strategy:**
- Build test matrix (basic, subdivided, grid scenarios)
- Run comprehensive validator in CI
- Add Playwright QA as post-implementation verification
- Focus unit tests on algorithms, integration tests on user-visible outcomes

## Next Steps

**Immediate (this week):**
- [ ] Update `.claude/rules/testing.md` with comprehensive validator requirement
- [ ] Add gatekeeper check for code pattern violations
- [ ] Document coordinate systems

**Short-term (this month):**
- [ ] Fix panel ID system architectural issues
- [ ] Build test matrix infrastructure
- [ ] Create reference implementations for common operations
- [ ] Establish canonical patterns document

**Medium-term (next 2-3 months):**
- [ ] Refactor existing features to use canonical patterns
- [ ] Comprehensive validator passes on all features
- [ ] Playwright QA integrated into all app PRs
- [ ] Architecture debt paid down (coordinate systems, event sourcing consistency)
