# Canonical Patterns Document and Operation Reference Implementations

**Status:** Idea
**Captured:** 2026-02-24
**Source:** draft 103 (Problems Holding Back Speed)

## Problem

Agents write new code that works slightly differently from existing patterns, introducing bugs. The builder API (`src/builder/`) helps for test setup, but there's no "how to write an operation" guide that agents can follow.

## What's Needed

### 1. Canonical Patterns Document

A `docs/canonical-patterns.md` covering:

- **Adding a new operation**: Which files to touch, how to wire store→engine→snapshot→UI
- **Panel generation**: Always use `generatePanelsFromNodes()`, never construct panels manually
- **Finger joints**: Always use `fingerJoints.ts`, never calculate manually
- **Dispatching changes**: Always `engine.dispatch()`, never mutate nodes directly
- **Preview pattern**: `startPreview()` → mutate `_previewScene` → `commitPreview()` / `discardPreview()`
- **Coordinate transforms**: Use `sketchCoordinates.ts` utilities, never inline transform math

### 2. Reference Implementations

Tag 2-3 existing operations as "reference implementations" that agents should study:

- **Simple parameter operation**: Chamfer or fillet (has preview, params, apply)
- **Immediate operation**: Toggle face (no preview, instant)
- **2D drawing operation**: Path tool (mouse handlers, coordinate transforms, snap)

Add comments at the top of these files: `// REFERENCE IMPLEMENTATION — see docs/canonical-patterns.md`

### 3. Rule Enforcement

Add to `.claude/rules/` or CLAUDE.md:
- "Before writing a new operation, read the reference implementation for your operation type"
- "Before writing geometry code, check if a utility already exists in `src/utils/`"

## Existing Docs

- `docs/adding-operations.md` — step-by-step guide (exists but may need updating)
- `.claude/rules/operations.md` — quick reference
- `CLAUDE.md` — mentions operations system

The new doc would complement these by focusing on *patterns to follow* rather than *steps to execute*.
