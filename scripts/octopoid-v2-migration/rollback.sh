#!/bin/bash
# Simple rollback - just reset git

echo "⚠️  Rolling back v2.0 migration..."
echo "This will undo the last 2 commits (v2.0 init + backup)"
echo ""
read -p "Are you sure? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Cancelled."
  exit 1
fi

git reset --hard HEAD~2  # Undo last 2 commits
git clean -fd            # Remove untracked files (node_modules, .octopoid, etc.)

echo "✅ Rollback complete - back to v1.x state"
