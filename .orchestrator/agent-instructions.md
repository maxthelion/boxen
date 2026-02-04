# Agent Instructions

This file contains instructions that agents should follow when working in this repository. These instructions are included in agent prompts.

## Submodule Handling

The `orchestrator/` directory is a git submodule pointing to the [octopoid](https://github.com/maxthelion/octopoid) repository.

When your task involves modifying files in the `orchestrator/` directory:

### Why This Matters

When you modify files in a submodule, those changes are local to your machine. If you create a PR in the parent repo (boxen) that references a submodule commit that hasn't been pushed to the submodule's remote, anyone who tries to clone or update after the PR is merged will get an error like:

```
Could not find commit 3791d45e...
```

### The Solution: Push Submodule Changes Directly

**Skip the PR stage for submodule changes.** The orchestrator is internal tooling infrastructure - changes to it are low-risk and need to be on the remote before any boxen PR can work.

### Manual Workflow

If you're manually managing git operations (not relying on the automated implementer role):

1. **Make your changes** in `orchestrator/` as needed

2. **Commit in the submodule**:
   ```bash
   cd orchestrator
   git add .
   git commit -m "Your descriptive commit message"
   ```

3. **Push directly to orchestrator main**:
   ```bash
   cd orchestrator
   git push origin HEAD:main
   ```

4. **Back in boxen**, the submodule pointer is now valid:
   ```bash
   cd ..  # Back to boxen root
   git add orchestrator
   git commit -m "Update orchestrator submodule"
   ```

5. **Continue with normal PR workflow** for boxen changes

### Automated Handling

The implementer role automatically detects submodule changes and pushes them to the orchestrator remote before creating boxen PRs. The automation:

1. Detects if `orchestrator/` has uncommitted or unpushed changes
2. Commits any uncommitted changes in the submodule
3. Pushes directly to `origin/main` in the submodule
4. Stages the submodule pointer update in boxen
5. Commits the pointer change before creating the PR

### Key Points

- Orchestrator changes go directly to main (no PR needed for internal tooling)
- Always push submodule commits before referencing them in the parent repo
- The automated system handles this, but be aware if doing manual git operations
