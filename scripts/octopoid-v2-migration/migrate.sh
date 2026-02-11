#!/bin/bash
set -e

echo "🚀 Starting Octopoid v2.0 migration"

# 1. Verify we're on a branch
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "octopoid-v2-migration" ]; then
  echo "❌ Not on migration branch. Run: git checkout -b octopoid-v2-migration"
  exit 1
fi

# 2. Pre-flight checks
echo "🔍 Running pre-flight checks..."

# Check if octopoid wrapper exists (for testing without global install)
if [ -f "./octopoid-v2-cli.sh" ]; then
  OCTOPOID_CMD="./octopoid-v2-cli.sh"
  echo "✓ Using local Octopoid wrapper"
# Check if octopoid v2.0 is installed globally
elif command -v octopoid &> /dev/null; then
  OCTOPOID_CMD="octopoid"
  echo "✓ Using globally installed octopoid"
else
  echo "❌ octopoid not found (neither wrapper nor global install)"
  echo ""
  echo "You must install Octopoid v2.0 from source first:"
  echo "  cd /tmp"
  echo "  git clone https://github.com/maxthelion/octopoid.git octopoid-v2"
  echo "  cd octopoid-v2"
  echo "  npx pnpm install && npx pnpm build"
  echo ""
  echo "See PLAYBOOK.md for detailed instructions."
  exit 1
fi

# Verify octopoid version (should be v2.0)
OCTOPOID_VERSION=$($OCTOPOID_CMD --version 2>&1 || echo "unknown")
echo "✓ Found octopoid: $OCTOPOID_VERSION"

# Verify git status is clean
if [ -n "$(git status --porcelain)" ]; then
  echo "⚠️  Warning: Git working directory is not clean"
  echo "Uncommitted changes:"
  git status --short
  echo ""
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted. Commit your changes and try again."
    exit 1
  fi
fi

echo "✓ Pre-flight checks passed"
echo ""

# 3. Backup v1.x state
echo "📦 Backing up v1.x state..."
git mv project-management pm2
git mv .orchestrator .orchestrator-v1
git commit -m "backup: preserve v1.x state before v2.0 migration"

# 4. Initialize v2.0 structure
echo "🏗️  Initializing v2.0 structure..."
$OCTOPOID_CMD init

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
