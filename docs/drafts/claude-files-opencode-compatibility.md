# Claude Files OpenCode Compatibility

**Status:** Idea
**Captured:** 2026-02-09

## Raw

> get all the claude files to work with opencode

## Idea

Ensure all Claude-specific configuration files, documentation, and tooling are compatible with and optimized for OpenCode. This includes:

- CLAUDE.md and other Claude-specific docs
- Any `.claude/` configuration directories
- Agent instructions or guidelines written for Claude
- Skills, prompts, or workflows defined for Claude

The goal is to make the project seamlessly work with both Claude and OpenCode assistants without fragmentation.

## Context

The project currently has Claude-specific documentation and configuration. As OpenCode becomes available, we want to ensure the same level of context and guidance is available regardless of which assistant is being used.

## Open Questions

- What specific incompatibilities exist between Claude and OpenCode file formats?
- Are there OpenCode-specific equivalents for Claude skills/workflows?
- Should we maintain separate files or create a unified format that works with both?
- What testing is needed to verify compatibility?

## Possible Next Steps

- Audit existing Claude files to identify potential compatibility issues
- Research OpenCode's expected file formats and conventions
- Create a compatibility layer or adapter if needed
- Test both assistants with the same project files
- Document any differences or limitations
