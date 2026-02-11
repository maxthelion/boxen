#!/bin/bash
set -e

echo "🚀 Starting Octopoid v2.0 migration"

# 1. Verify we're on a branch
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "octopoid-v2-migration" ]; then
  echo "❌ Not on migration branch. Run: git checkout -b octopoid-v2-migration"
  exit 1
fi

# 2. Backup v1.x state
echo "📦 Backing up v1.x state..."
git mv project-management pm2
git mv .orchestrator .orchestrator-v1
git commit -m "backup: preserve v1.x state before v2.0 migration"

# 3. Install v2.0
echo "📥 Installing Octopoid v2.0..."
npm install @octopoid/client

# 4. Initialize
echo "🏗️  Initializing v2.0 structure..."
npx octopoid init

# 5. Create CLAUDE.local.md symlink (optional)
echo "🔗 Creating CLAUDE.local.md symlink..."
if [ -f "project-management/claude-interactive-role.md" ]; then
  ln -s project-management/claude-interactive-role.md CLAUDE.local.md
  echo "CLAUDE.local.md" >> .gitignore
fi

# 6. Commit v2.0 structure
git add -A
git commit -m "feat: initialize Octopoid v2.0 structure"

echo ""
echo "✅ Migration complete!"
echo ""
echo "Next steps:"
echo "  1. Run: scripts/octopoid-v2-migration/verify-basics.sh"
echo "  2. Compare: scripts/octopoid-v2-migration/compare-structures.sh"
echo "  3. Test: scripts/octopoid-v2-migration/test-task-lifecycle.sh"
echo ""
echo "To rollback: scripts/octopoid-v2-migration/rollback.sh"
