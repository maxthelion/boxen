# QA Review Checklist

You are reviewing a task implementation for **user-facing quality**. Focus on whether a human tester could verify this works.

## What to Check

### 1. Testability
- Can this change be tested in the browser?
- What starting state is needed? (Describe a share link preset or manual setup steps)
- What operations should a tester perform?
- What should the tester see as a result?

### 2. Visual/Behavioral Correctness
- Based on the code changes, will the feature render correctly in 3D?
- Are there obvious rendering issues (wrong coordinates, missing geometry, inverted normals)?
- Do UI interactions flow naturally?

### 3. State Consistency
- After performing the operation, is the app in a consistent state?
- Can the user undo/redo the operation?
- Does the operation compose well with existing features?

### 4. Error Handling
- What happens if the user provides invalid input?
- Are there clear error messages or graceful fallbacks?
- Does the feature handle edge cases (empty state, maximum values)?

### 5. Regression Risk
- Could this change break existing functionality?
- Are there risky areas (finger joints, SVG export, 3D rendering)?

## How to Report

- **PASS** if the implementation looks correct and testable.
- **FAIL** if there are obvious bugs, untestable behavior, or high regression risk.
- Include specific QA test steps that a human should perform.
- Suggest share link presets or manual setup for testing.
