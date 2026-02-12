# Feedback for Octopoid Team: Installation Experience

**Date:** 2026-02-11
**From:** Boxen project (early v2.0 adopter)
**Context:** Attempted v2.0 migration, hit installation blocker

**UPDATE (2026-02-11):** ✅ **ISSUE RESOLVED** - The team updated the README to make source install the primary path. This feedback document is kept for reference, but the issue is already fixed!

---

## ✅ Resolution

The Octopoid team already addressed this! The latest README (commit b88794b on feature/client-server-architecture) now:

1. **Lines 77-78:** Explicitly states `"Note: The npm package is not yet published. Install from source for now."`
2. **Lines 79-98:** Makes "Install from Source (Current Method)" the **primary installation path**
3. **Lines 100-105:** Shows "Install from npm (Coming Soon)" as secondary with note "Not yet published - use source install above"

This matches **Option 2** from our recommendations below. Perfect! 🎉

---

## Original Feedback (Now Resolved)

### TL;DR

We're **very excited** about v2.0 - you addressed all our P0 requirements! 🎉 But we hit a migration blocker: `@octopoid/client` isn't published to npm yet, which broke our migration script.

**Quick fix:** Either publish to npm OR update docs to make "install from source" the primary path. **[✅ DONE]**

---

## What Happened

### Positive: Requirements Exceeded Expectations

Your team delivered **massive updates today (2026-02-11)** that resolved all our P0/P1 blockers:

✅ Task-specific worktrees (commit 6f0e836)
✅ Drafts/Projects API (commit 917fed0)
✅ Per-task logging + auto turn counting (commit 187bfb8)
✅ Gatekeeper multi-check (commit 11defa8)
✅ Burnout detection (commit 11defa8)
✅ Dashboard API integration (commit aa6d85e)

**This is fantastic work.** We documented our detailed requirements, and you implemented nearly everything. Thank you! 🙏

### Friction: Installation Blocker

When we tried to migrate using your README instructions, we hit this:

```bash
npm install -g octopoid
# OR
npm install @octopoid/client
```

**Result:**
```
npm ERR! 404 Not Found - GET https://registry.npmjs.org/@octopoid%2fclient
npm ERR! 404  '@octopoid/client@*' is not in this registry.
```

This broke our migration script, which had already:
1. Backed up v1.x state (moved files)
2. Attempted npm install (failed)
3. Left repo in partially migrated state

**Workaround:** Install from source (works fine):
```bash
git clone https://github.com/maxthelion/octopoid.git
cd octopoid
pnpm install && pnpm build
cd packages/client && npm link
```

---

## Why This Matters

### For New Users

The README shows two installation methods:
```bash
# Install from npm
npm install -g octopoid

# Or install from source
git clone https://github.com/maxthelion/octopoid.git
# ...
```

The "Or" phrasing suggests npm is the primary path, but it doesn't work yet. New users will hit this immediately.

### For Migration Scripts

Any automation that assumes `npm install @octopoid/client` works will fail. Our migration script needed pre-flight checks to catch this before moving files.

### For Documentation

Multiple places mention npm installation:
- README.md: "npm install -g octopoid"
- Our requirements doc referenced npm install
- Migration scripts assumed npm availability

This creates a **documentation-reality gap** where instructions don't match the actual installation path.

---

## Recommendations

### Option 1: Publish to npm (Preferred)

If you're planning to publish soon:

1. **Publish `@octopoid/client` to npm**
   ```bash
   cd packages/client
   npm publish --access public
   ```

2. **Publish `octopoid` CLI wrapper** (if separate)
   ```bash
   npm publish --access public
   ```

3. **Update README** to make npm the primary method:
   ```markdown
   ## Installation

   npm install -g octopoid

   ### Alternative: Install from Source
   (For contributors or if npm install fails)
   ```

**Pros:**
- Standard npm workflow users expect
- Works with automation/scripts
- Easier for non-technical users

**Cons:**
- Need to set up npm publishing
- Need to handle versioning/releases

### Option 2: Make Source Install Primary

If you're not ready to publish yet:

1. **Update README** to flip the order:
   ```markdown
   ## Installation

   ### From Source (Current Method)

   git clone https://github.com/maxthelion/octopoid.git
   cd octopoid
   pnpm install && pnpm build
   cd packages/client && npm link

   ### From npm (Coming Soon)

   npm install -g octopoid

   (Note: Not published yet - use source install above)
   ```

2. **Add troubleshooting section:**
   ```markdown
   ## Troubleshooting

   ### "octopoid: command not found"

   Ensure npm global bin is in your PATH:
   npm config get prefix
   # Add $(npm config get prefix)/bin to PATH
   ```

3. **Update migration docs** to require source install first

**Pros:**
- Matches current reality
- No npm publishing needed yet
- Clear expectations

**Cons:**
- More complex for new users
- Requires pnpm + build tools

### Option 3: Hybrid Approach

Publish a **minimal stub** to npm that checks for local source install:

```javascript
// @octopoid/client on npm (stub)
#!/usr/bin/env node

const { execSync } = require('child_process');

// Check if built from source
try {
  require.resolve('../../../packages/client/dist');
  // Local source install exists - use it
  require('../../../packages/client/dist/cli.js');
} catch {
  console.error('Octopoid must be installed from source:');
  console.error('  git clone https://github.com/maxthelion/octopoid.git');
  console.error('  cd octopoid && pnpm install && pnpm build');
  process.exit(1);
}
```

**Pros:**
- `npm install` doesn't fail (package exists)
- Clear error message with instructions
- Easy transition when ready to publish full package

**Cons:**
- More complex packaging
- Still requires source install

---

## Impact on Our Migration

### What We Did

1. **Updated PLAYBOOK.md** with "Install from source" prerequisite
2. **Updated migrate.sh** with pre-flight check:
   ```bash
   if ! command -v octopoid &> /dev/null; then
     echo "Install octopoid from source first"
     exit 1
   fi
   ```
3. **Removed npm install** from migration script
4. **Documented workaround** in our status report

### What We Need

**Short term:** Just a heads-up about when npm publishing is planned (days? weeks? months?) so we know whether to:
- Wait for npm publish before migrating
- Document "source install only" for our team
- Plan for source install in all our automation

**Long term:** Consistent installation experience once v2.0 is stable.

---

## Questions for You

1. **When do you plan to publish to npm?**
   - This week? This month? Not planned yet?

2. **Should we expect `npm install -g octopoid` to work eventually?**
   - Or is source install the intended path?

3. **Is there a private npm registry we should be using?**
   - Or is this blocked on v2.0 reaching a specific maturity level?

4. **Do you want us to document the source install path more formally?**
   - We can contribute to your README if helpful

---

## Overall Feedback

Despite the installation hiccup, we're **extremely impressed** with v2.0. The features you implemented (task-specific worktrees, per-task logging, burnout detection, gatekeeper multi-check) show you took our requirements seriously and delivered beyond expectations.

The installation issue is a **docs/publishing problem**, not a code problem. Once resolved, v2.0 looks production-ready for migration.

**We're still planning to migrate** - just need to document the source install path for our team.

---

## Related Documents

- `project-management/drafts/octopoid/v2-implementation-status.md` - Full feature analysis
- `project-management/drafts/octopoid/octopoid-project-management-requirements.md` - Our requirements
- `scripts/octopoid-v2-migration/PLAYBOOK.md` - Updated migration guide
- `scripts/octopoid-v2-migration/migrate.sh` - Migration script with pre-flight checks

---

**Thank you for the amazing work on v2.0!** Looking forward to migrating once we confirm the installation path.

— Boxen project team
