# LLM Prompt Instructions for Chainable Assembly Creation

**Status:** Idea
**Captured:** 2026-02-10

## Raw

> I want to create a set of instructions that can be sent to an llm alongside a users prompt. These instructions would explain that an assembly can be created. That it has outer panel faces. That it has an axis running through it that determines which panels are sides and which are lids. That the outer dimensions of an assembly can be changed. That many operations can be chained together on an assembly: its voids can be subdivided. Edges can be extended and have cut outs. Then it would cover rules about edge joints and which ones fit. The goal would be to take a prompt from a user such as "I want a set of drawers, dimensions of width 200, h 300, d 100. Split into 4 drawers". And the prompt would create a chainable js string that could be evaluated using the chainable object creation we have in our test fixtures. It should be given a thorough explanation of what that is, and the functions available.

## Idea

Create a **system prompt document** that teaches an LLM how to translate natural-language box descriptions into executable JavaScript using Boxen's `TestFixture` chainable builder API.

The LLM would receive:
1. **Conceptual model** - what an assembly is, faces, axes, voids, subdivisions, edge operations
2. **API reference** - every chainable method with signatures and examples
3. **Rules/constraints** - what combinations are valid (joint rules, edge eligibility, subdivision constraints)
4. **Examples** - natural language input → JS output pairs

Given a user prompt like *"set of drawers, 200w x 300h x 100d, 4 drawers"*, the LLM would output:

```javascript
TestFixture.basicBox(200, 300, 100)
  .withOpenFaces(['front'])
  .panel('front')
  .withExtension('bottom', 15)
  .and()
  // ... subdivisions, sub-assemblies, etc.
  .build()
```

The output string could then be `eval()`'d (or parsed into an action sequence) to create real engine state.

## Context

The TestFixture API already exists in `src/test/fixtures/` and provides a fluent builder pattern for tests. It's a natural fit for LLM code generation because:
- Chainable/fluent API is easy for LLMs to produce
- The API surface is small and well-typed
- It maps 1:1 to engine actions

## What Exists Today

### TestFixture (entry point)
- `TestFixture.basicBox(w, h, d)` - open-top box
- `TestFixture.enclosedBox(w, h, d)` - all faces solid
- `.withOpenFaces(['top', 'front', ...])` - configure open faces
- `.panel('front')` - select a panel → returns PanelBuilder
- `.clone()` - deep copy
- `.build()` - execute and return `{ engine, panels, panel? }`

### PanelBuilder (panel operations)
- `.withExtension('top', 30)` - extend an edge outward
- `.withExtensions(['top', 'bottom'], 20)` - extend multiple edges
- `.withCutout(rect(x, y, w, h))` - add rectangular cutout
- `.withCutout(circle(cx, cy, r))` - add circular cutout
- `.withCutouts([shape1, shape2])` - multiple cutouts
- `.withFillet(['bottom:left', 'bottom:right'], 5)` - round corners
- `.and()` - return to TestFixture for more chaining

### Shape helpers
- `rect(x, y, width, height)` - rectangle
- `circle(cx, cy, radius, segments?)` - circle approximation
- `polygon([x,y], [x,y], ...)` - arbitrary polygon
- `lShape(x, y, w, h, notchW, notchH)` - L-shaped cutout

### Missing from TestFixture (exists as engine actions but not chainable)
- Subdivisions (`ADD_SUBDIVISION`, `ADD_SUBDIVISIONS`, `ADD_GRID_SUBDIVISION`)
- Sub-assembly creation (`CREATE_SUB_ASSEMBLY`)
- Assembly axis (`SET_ASSEMBLY_AXIS`)
- Feet (`SET_FEET_CONFIG`)
- Lid configuration (`SET_LID_CONFIG`)
- Material config changes (`SET_MATERIAL`)

## Open Questions

- **Scope of the prompt**: Should it cover *all* engine actions, or just the most common ones for typical box designs?
- **Output format**: Raw JS string to eval? Or a JSON action sequence that gets replayed through `engine.dispatch()`? The action sequence is safer but less readable.
- **Subdivision API gap**: TestFixture doesn't expose subdivision/sub-assembly methods yet. Do we extend the builder first, or have the LLM output raw engine dispatch calls for those?
- **Validation**: Should the LLM be told about validation rules so it avoids invalid output, or do we validate after and give feedback?
- **Iteration**: Could the LLM receive error feedback from a failed `build()` and self-correct?
- **Where does this run?** In the app (user types a prompt, LLM generates code, app evals it)? Or externally (user prompts ChatGPT/Claude, pastes output into app)?

## Possible Next Steps

- **Extend TestFixture API** to cover subdivisions, sub-assemblies, axis, feet, lids - closing the gap between engine actions and chainable methods
- **Write the system prompt document** as a standalone markdown file that can be injected into any LLM context
- **Create example pairs** - 10-20 natural language descriptions paired with correct JS output, to serve as few-shot examples in the prompt
- **Build an in-app integration** - text input that sends the prompt + system instructions to an LLM API and evals the result
- **Test with real prompts** - try various box descriptions and see where the LLM struggles
