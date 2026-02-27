# /pull - Pull Boxen and Octopoid

Pull the latest changes for both the main Boxen repo and the octopoid submodule.

## Steps

1. Stash any uncommitted changes if needed (warn the user, don't silently stash)
2. Pull the main repo: `git pull --rebase origin main`
3. Pull the octopoid submodule: `(cd orchestrator && git pull origin main)`
4. Reinstall the octopoid venv if `orchestrator/pyproject.toml` changed:
   ```bash
   (cd orchestrator && ./venv/bin/pip install -e ".[dev]")
   ```
5. Commit the updated submodule ref if it changed:
   ```bash
   git add orchestrator
   git commit -m "chore: update octopoid submodule ref"
   git push origin main
   ```
6. Report what changed (new commits in each repo)

## Error handling

- If pull fails due to unstaged changes, tell the user and list the dirty files. Do NOT stash or reset without asking.
- If the venv is missing, recreate it: `(cd orchestrator && python3 -m venv venv && venv/bin/pip install -e ".[dev]")`
- The package is now `octopoid` (not `orchestrator`). Imports are `from octopoid.queue_utils import get_sdk` etc.
