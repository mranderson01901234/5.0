# SAFE CLEANUP PROCESS - No Refactoring Guarantee

## ✅ 100% Safe Cleanup Process

This document explains how to ensure cleanup **WILL NOT** refactor your codebase.

---

## 🛡️ Safety Guarantees

### What WILL Be Removed (100% Safe):
1. **Compiled test files** (`dist/**/*.test.*`) - Build artifacts only
2. **Duplicate git scripts** - Exact duplicates, verified not referenced
3. **Temporary files** - One-time instruction files
4. **Log files** - Runtime logs (added to .gitignore, not deleted)

### What WILL NOT Be Removed (Protected):
1. ✅ **All source code** (`.ts`, `.tsx`, `.js`, `.jsx`)
2. ✅ **All components** (`apps/web/src/components/`)
3. ✅ **All hooks** (`apps/web/src/hooks/`)
4. ✅ **All stores** (`apps/web/src/store/`)
5. ✅ **All services** (`apps/web/src/services/`)
6. ✅ **All markdown docs** (kept, optionally archived)
7. ✅ **All functional scripts** (`start-*.sh`, `check-*.sh`)
8. ✅ **All test source files** (only compiled artifacts removed)
9. ✅ **All configuration files** (package.json, tsconfig.json, etc.)

---

## 🔍 Verification Process

### Step 1: Run Safety Verification
```bash
./scripts/verify-cleanup-safety.sh
```

This checks:
- ✅ No source files will be removed
- ✅ No package.json scripts will be removed
- ✅ No imported files will be removed
- ✅ Critical startup scripts are safe
- ✅ Build configuration is intact

### Step 2: Dry Run (Preview)
```bash
./scripts/safe-cleanup.sh --dry-run
```

This shows:
- 📋 What WOULD be removed (nothing actually deleted)
- ⚠️  What will be skipped (safety checks)
- 📝 What will be added to .gitignore

### Step 3: Review Output
Check the dry-run output:
- ✅ Only compiled test files shown?
- ✅ Only duplicate scripts shown?
- ✅ No source code files listed?
- ✅ No component files listed?

### Step 4: Execute (Only if 100% Safe)
```bash
./scripts/safe-cleanup.sh --execute
```

---

## 🔒 Safety Mechanisms

### 1. File Verification
Every file is checked before removal:
- ✅ Not imported in code
- ✅ Not referenced in package.json
- ✅ Not in critical script list
- ✅ Not a source file

### 2. Dry Run Mode
- Default mode is DRY RUN (no deletions)
- Must explicitly use `--execute` flag
- Requires typing "yes" confirmation

### 3. Git Backup
- Creates backup commit before cleanup
- Can restore with: `git reset --hard HEAD~1`

### 4. Conservative Approach
- Only removes obvious duplicates
- Only removes compiled artifacts
- Never removes source code
- Never removes documentation

---

## 📋 Pre-Cleanup Checklist

Before running cleanup, verify:

- [ ] Run `./scripts/verify-cleanup-safety.sh` - All checks pass
- [ ] Run `./scripts/safe-cleanup.sh --dry-run` - Review output
- [ ] Check no source files are listed for removal
- [ ] Check no components are listed for removal
- [ ] Check no hooks are listed for removal
- [ ] Check no stores are listed for removal
- [ ] Check no services are listed for removal
- [ ] Check no functional scripts are listed
- [ ] Back up current state: `git commit -am "Pre-cleanup backup"`

---

## 🚨 What If Something Goes Wrong?

### Immediate Restore:
```bash
# Restore from git backup
git reset --hard HEAD~1

# Or restore specific files
git checkout HEAD~1 -- path/to/file
```

### Verify Nothing Broke:
```bash
# Test application startup
./start-hybrid-rag.sh

# Check build
cd apps/web && npm run build

# Check linting
npm run lint
```

---

## 📊 What Gets Removed (Detailed)

### Category 1: Compiled Test Files
**Location**: `apps/llm-gateway/dist/**/*.test.*`

**Why Safe**:
- These are build artifacts (compiled from source)
- Source test files remain in `src/`
- Can be regenerated with `npm run build`

**Example**:
```
❌ WOULD REMOVE: dist/PromptBuilder.test.js.map
❌ WOULD REMOVE: dist/routes.test.js
✅ KEEPS: src/utils/__tests__/PromptBuilder.test.ts
```

### Category 2: Duplicate Scripts
**Files**:
- `push-with-gh.sh` (duplicate of `push-to-github.sh`)
- `setup-git-quick.sh` (duplicate of `setup-github-cli.sh`)
- `apps/web/setup-git-quick.sh` (duplicate)

**Why Safe**:
- Verified not referenced in package.json
- Verified not imported in code
- Exact duplicates with same functionality
- Active versions remain (`push-to-github.sh`, `setup-github-cli.sh`)

### Category 3: Temporary Files
**Files**:
- `apps/web/GIT_PUSH_INSTRUCTIONS.txt` (one-time instructions)

**Why Safe**:
- Temporary instruction file
- Not referenced anywhere
- Not functional code

### Category 4: Backup Files
**Files**:
- `.env.backup` (contains sensitive data)

**Why Safe**:
- Backup file (should not be in repo)
- Contains sensitive credentials
- Original `.env` file remains

---

## ✅ Guarantee

**The cleanup script WILL NOT:**
- ❌ Remove any `.ts` or `.tsx` source files
- ❌ Remove any `.js` or `.jsx` source files
- ❌ Remove any component files
- ❌ Remove any hook files
- ❌ Remove any store files
- ❌ Remove any service files
- ❌ Remove any configuration files
- ❌ Remove any functional scripts
- ❌ Remove any markdown documentation
- ❌ Modify any source code
- ❌ Refactor any code

**The cleanup script WILL ONLY:**
- ✅ Remove compiled build artifacts
- ✅ Remove duplicate scripts (verified safe)
- ✅ Remove temporary files
- ✅ Add patterns to .gitignore

---

## 🎯 Recommended Workflow

1. **Read this document** - Understand what will be removed
2. **Run verification** - `./scripts/verify-cleanup-safety.sh`
3. **Run dry-run** - `./scripts/safe-cleanup.sh --dry-run`
4. **Review output** - Confirm only safe files listed
5. **Test application** - Ensure everything works before cleanup
6. **Backup** - `git commit -am "Pre-cleanup backup"`
7. **Execute** - `./scripts/safe-cleanup.sh --execute`
8. **Verify** - Test application after cleanup
9. **Commit** - `git commit -am "Cleanup: Remove safe test files"`

---

## 📞 If You're Unsure

**Don't run cleanup if:**
- ❌ Verification script fails
- ❌ Dry-run shows source files
- ❌ Dry-run shows components
- ❌ You're not 100% confident

**Instead:**
- Review the audit report: `CLEANUP_AUDIT_REPORT.md`
- Manually review each file
- Only remove files you're certain about
- Test after each removal

---

**Remember**: When in doubt, don't clean up. It's better to keep extra files than to break something.

