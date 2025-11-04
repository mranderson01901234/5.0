# File System Cleanup Audit Report
**Date**: 2025-11-04  
**Scope**: Test files, temporary files, and non-functional files  
**Total Size**: 3.7GB

---

## Executive Summary

This audit identifies files that can be safely removed or archived to reduce repository size and improve maintainability.

**Key Findings**:
- ✅ **190+ markdown documentation files** (many are audit/status reports)
- ✅ **30+ test files** (test scripts, spec files)
- ✅ **15+ log/temporary files** (not in gitignore)
- ✅ **25+ shell scripts** (some duplicate/unused)
- ✅ **Large build artifacts** in `.git/objects` (113MB Chrome .deb file)

**Recommendation**: Archive or remove ~200 files, reduce repository size by ~150MB

---

## 1. TEST FILES (Can be removed or moved to test directory)

### Root Level Test Files
```
./test-memory-system.mjs                    # Test script - move to tests/
```

### LLM Gateway Test Files
```
./apps/llm-gateway/test-image-api.mjs      # Test script
./apps/llm-gateway/test-imagen-direct.mjs  # Test script
./apps/llm-gateway/test-imagen.ts          # Test file
./apps/llm-gateway/test_query_analyzer.ts  # Test file
./apps/llm-gateway/vitest.config.ts        # Test config (keep if using vitest)
```

### Compiled Test Files (in dist/)
```
./apps/llm-gateway/dist/*.test.*            # 20+ compiled test files
```
**Action**: Remove compiled test files from dist/ (should be gitignored)

### Test Directories
```
./apps/llm-gateway/src/utils/__tests__      # Test directory (keep if active)
```

**Recommendation**: 
- Move test scripts to `tests/` directory
- Remove compiled test files from `dist/`
- Keep test source files if tests are actively used

---

## 2. LOG FILES (Should be gitignored)

### Application Logs
```
./logs/memory-service.log
./logs/gateway.log
./logs/web.log
./logs/memory.log
./logs/ingestion-service.log
./logs/hybrid-rag.log
./logs/native-build.log
./logs/shared-build.log
```

### Qdrant Storage Logs (many files)
```
./qdrant_storage/**/*.log                   # Internal database logs
```
**Action**: These are runtime logs - should be in .gitignore

**Recommendation**: Add to `.gitignore`:
```
logs/*.log
qdrant_storage/**/*.log
*.log
```

---

## 3. TEMPORARY & BACKUP FILES

### Backup Files
```
./.env.backup                               # Environment backup (sensitive - remove)
```

### PID Files (should be gitignored)
```
./.hybrid-rag-pids                           # Process IDs
./.service-pids                              # Process IDs
```

**Recommendation**: Add to `.gitignore`:
```
*.pid
*.pids
.env.backup
.env.*.backup
```

---

## 4. DOCUMENTATION FILES (190+ files - many are audit reports)

### Audit Reports (Can be archived)
```
./AGENTIC_RAG_ASSESSMENT.md
./AGENTIC_RAG_IMPLEMENTATION_PLAN.md
./ARTIFACT_CONTAINER_AUDIT.md
./ARTIFACT_PORTAL_FIX_REPORT.md
./ARTIFACT_SCROLL_AUDIT.md
./ARTIFACT_SCROLL_FINDINGS_TABLE.md
./ARTIFACT_SCROLL_FIX_REPORT.md
./ARTIFACT_SCROLL_FIX_SUMMARY.md
./ARTIFACT_SCROLL_REAUDIT_REPORT.md
./ARTIFACT_SCROLL_ROOTCAUSE.md
./ARTIFACT_SCROLL_RUNTIME_CHECKLIST.md
./AUDIT.md
./AUTOOPEN_AUDIT.md
./AUTOOPEN_STATUS.md
./DATABASE_INFRASTRUCTURE_AUDIT.md
./DATABASE_PRE_RAG_AUDIT.md
./DATABASE_PRE_RESTORE_CHECKLIST.md
./FILE_UPLOAD_AUDIT.md
./GPT_4O_MINI_AUDIT_REPORT.md
./HAIKU_3_AUTO_UPDATE_AUDIT.md
./HYBRID_RAG_AUDIT.md
./IMAGE_GEN_CONFIG_CHECK.md
./IMAGEN4_FINAL_FIX.md
./IMAGEN4_FIX_SUMMARY.md
./IMAGEN4_FRONTEND_AUDIT_REPORT.md
./IMAGEN_4_IMPLEMENTATION_AUDIT.md
./IMAGE_VISION_AUDIT.md
./MEMORY_AUDIT_REPORT.md
./MEMORY_FEATURE_AUDIT.md
./MEMORY_SAVE_AUDIT.md
./MEMORY_SAVING_AUDIT.md
./MEMORY_SERVICE_FAILURE_INVESTIGATION.md
./MODEL_CONFIGURATION_AUDIT.md
./SCROLL_AUDIT.md
./SCROLL_FIX_SUMMARY.md
./SETUP_AUDIT.md
./STARTUP_SCRIPT_AUDIT.md
./WEB_APPLICATION_AUDIT.md
./WEB_SEARCH_FUNCTIONALITY_AUDIT.md
./docs/audits/*.md                           # 3 audit files
./docs/MEMORY_AUDIT.md
```

### Status Reports (Can be archived)
```
./AUTOOPEN_STATUS.md
./CHAT_OPTIMIZATION_PHASE1_COMPLETE.md
./HOTFIX_SUMMARY.md
./HOTFIX_VERIFICATION.md
./INCHAT_ARTIFACT_STATUS.md
./INCHAT_IMAGE_STATUS.md
./MEMORY_RECALL_STATUS.md
./MEMORY_SAVING_IMPLEMENTATION_SUMMARY.md
./PHASE1_STATUS.md
./PHASE2_STATUS.md
./PHASE3_STATUS.md
./PHASE4_STATUS.md
./PHASE5_STATUS.md
./PHASE6_STATUS.md
./SETUP_COMPLETE.md
```

### Implementation Summaries (Can be consolidated)
```
./CHAT_FLOW_FIXES_APPLIED.md
./CHAT_THINKING_INTEGRATION.md
./ENTERPRISE_CHAT_IMPROVEMENTS_COMPLETE.md
./EXPLICIT_MEMORY_FEATURE_COMPLETE.md
./FRONTEND_IMPLEMENTATION_COMPLETE.md
./IMAGE_GEN_ENDPOINT_FIX.md
./IMAGEN_4_IMPLEMENTATION_COMPLETE.md
./IMAGEN4_ISSUE_RESOLVED.md
./IMAGEN_OPTIMIZATION_COMPLETE.md
./IMAGE_VISION_IMPLEMENTATION_SUMMARY.md
./INGESTION_INTEGRATION_COMPLETE.md
./MEMORY_RECALL_FIX_COMPLETE.md
./MOBILE_BUILD_COMPLETE.md
./OPTIMIZATION_CRITICAL_BUG_FIX_RESULTS.md
./OPTIMIZATION_FIXES_RESULTS.md
./OPTIMIZATION_INTEGRATION_RESULTS.md
./OPTIMIZATION_NEXT_STEPS_RESULTS.md
./PHASE1_IMPLEMENTATION_SUMMARY.md
./PHASE2_IMMEDIATE_FIXES_COMPLETE.md
./PHASE2_IMPLEMENTATION_SUMMARY.md
./PHASE3_IMPLEMENTATION_SUMMARY.md
./PHASE4_IMPLEMENTATION_SUMMARY.md
./PIPELINE_OPTIMIZATION_COMPLETE.md
./PIPELINE_OPTIMIZATION_FINAL_SUMMARY.md
./RESEARCH_IMPLEMENTATION_SUMMARY.md
./SCROLL_FIX_SUMMARY.md
./SPLIT_VIEW_FIX_COMPLETE.md
./TEST_FIX_SUMMARY.md
./TESTING_RESULTS_SUMMARY.md
./UI_UPGRADE_SUMMARY.md
./USER_PROFILE_PHASE1_SUMMARY.md
./UTILITY_INTEGRATION_RESULTS.md
./WEB_SEARCH_CONTEXT_FIX_COMPLETE.md
```

### Testing Documentation (Can be consolidated)
```
./BROWSER_TESTING_GUIDE.md
./MANUAL_CHAT_TEST_GUIDE.md
./TESTING_CHECKLIST.md
./TESTING_GUIDE.md
./TESTING_PLAN.md
./TESTING_SUMMARY.md
./TESTING_TOOLS.md
./TEST_PROMPTS_FOR_INGESTION.md
./TEST_PROMPTS.md
./VERIFICATION_GUIDE.md
```

### Planning Documents (Keep main ones, archive old)
```
./AGENTIC_RAG_IMPLEMENTATION_PLAN.md
./ARCHITECTURE_DOCUMENTATION.md
./HYBRID_AGENTIC_RAG_BLUEPRINT.md
./HYBRID_RAG_ARCHITECTURE_ANALYSIS.md
./HYBRID_RAG_SETUP.md
./IMPLEMENTATION_PLAN.md
./IMPLEMENTATION_READINESS.md
./IMPLEMENTATION_STATUS.md
./MEMORY_IMPLEMENTATION_PLAN.md
./NEXT_STEPS.md
./NEXT_STEPS_SUMMARY.md
./OPTIMIZATION_NEXT_STEPS_RESULTS.md
./PIPELINE_OPTIMIZATION_IMPLEMENTATION_PLAN.md
./PLAN.md
./WEB_APP_PHASE_PLAN.md
./WEB_APP_PHASE_TRACKER.md
```

**Recommendation**: 
- Archive all audit/status reports to `docs/archive/audits/`
- Consolidate implementation summaries into `docs/CHANGELOG.md`
- Keep only active planning documents
- Move old testing docs to `docs/archive/testing/`

**Estimated Space Savings**: ~5-10MB

---

## 5. SHELL SCRIPTS (Review for duplicates/unused)

### Git Setup Scripts (Some duplicates)
```
./push-to-github.sh                         # ✅ Active - GitHub CLI version
./push-with-gh.sh                           # ⚠️ Duplicate helper script
./setup-github-cli.sh                       # ✅ Active - Main setup script
./setup-git.sh                              # ⚠️ Older version?
./setup-git-quick.sh                        # ⚠️ Duplicate quick version
./apps/web/setup-git-quick.sh               # ⚠️ Duplicate in apps/web/
```

### Test/Debug Scripts
```
./check-claude.sh                           # ✅ Active
./check-hybrid-rag.sh                      # ✅ Active
./check-services.sh                         # ✅ Active
./claude-code.sh                            # ✅ Active
./test-claude-global.sh                     # ✅ Active
./test-image-config.sh                      # ⚠️ Test script - move to tests/
```

### Service Management Scripts
```
./start-hybrid-rag.sh                      # ✅ Active
./stop-hybrid-rag.sh                        # ✅ Active
./start.sh                                  # ✅ Active
./stop.sh                                   # ✅ Active
./install-browsers.sh                       # ⚠️ One-time script - can archive
```

### Scripts Directory
```
./scripts/live-logs.sh                      # ✅ Active
./scripts/manual_test_flow.sh               # ⚠️ Test script - move to tests/
./scripts/start-services-with-logs.sh       # ✅ Active
./scripts/tail-logs.sh                      # ✅ Active
./scripts/watch-logs.sh                     # ✅ Active
```

**Recommendation**: 
- Remove duplicate git setup scripts (keep `setup-github-cli.sh` and `push-to-github.sh`)
- Move test scripts to `scripts/tests/` or `tests/`
- Archive one-time scripts like `install-browsers.sh`

---

## 6. LARGE FILES (Already handled)

### Already Removed
```
✅ google-chrome-stable.deb (113MB) - Moved to Desktop
```

### In Git History (Large object)
```
.git/objects/29/454f746e406e88941f85fa9bf4c5bbb0dbf9dd  # 113MB Chrome file
```
**Action**: Already in .gitignore, but still in git history. Consider `git gc` to clean up.

---

## 7. CONFIGURATION FILES (Review)

### Claude Settings (Local configs)
```
./.claude/settings.local.json              # ✅ Local config - should be gitignored
./apps/.claude/settings.local.json         # ✅ Local config - should be gitignored
```
**Action**: Add to `.gitignore`:
```
.claude/settings.local.json
**/.claude/settings.local.json
```

### Text Files
```
./apps/web/GIT_PUSH_INSTRUCTIONS.txt       # ⚠️ Temporary - can remove
./optimizedblueprint.txt                    # ⚠️ Review if needed
./optimize.txt                              # ✅ Active audit file - keep
```

---

## 8. BUILD ARTIFACTS (Should be gitignored)

### Compiled Test Files
```
./apps/llm-gateway/dist/*.test.*           # 20+ compiled test files
```
**Action**: Should not be committed - add to `.gitignore`:
```
dist/**/*.test.*
dist/**/*.spec.*
```

---

## CLEANUP RECOMMENDATIONS

### Priority 1: Immediate Cleanup (Safe to Remove)

1. **Remove compiled test files from dist/**
   ```bash
   find apps/llm-gateway/dist -name "*.test.*" -delete
   ```

2. **Remove duplicate git setup scripts**
   ```bash
   rm push-with-gh.sh setup-git-quick.sh apps/web/setup-git-quick.sh
   ```

3. **Remove temporary text files**
   ```bash
   rm apps/web/GIT_PUSH_INSTRUCTIONS.txt
   ```

4. **Remove .env.backup** (contains sensitive data)
   ```bash
   rm .env.backup
   ```

### Priority 2: Archive Documentation (Keep but organize)

1. **Create archive structure**
   ```bash
   mkdir -p docs/archive/{audits,status,testing,implementation}
   ```

2. **Move audit reports**
   ```bash
   mv *_AUDIT*.md docs/archive/audits/ 2>/dev/null
   mv docs/audits/*.md docs/archive/audits/ 2>/dev/null
   ```

3. **Move status reports**
   ```bash
   mv *_STATUS.md docs/archive/status/ 2>/dev/null
   mv *_COMPLETE.md docs/archive/status/ 2>/dev/null
   ```

4. **Move implementation summaries**
   ```bash
   mv *_IMPLEMENTATION*.md docs/archive/implementation/ 2>/dev/null
   mv *_SUMMARY.md docs/archive/implementation/ 2>/dev/null
   ```

### Priority 3: Update .gitignore

Add these patterns:
```
# Logs
logs/*.log
*.log
qdrant_storage/**/*.log

# PID files
*.pid
*.pids

# Backup files
.env.backup
.env.*.backup
*.bak
*.backup

# Local configs
.claude/settings.local.json
**/.claude/settings.local.json

# Compiled test files
dist/**/*.test.*
dist/**/*.spec.*
```

### Priority 4: Move Test Scripts

```bash
mkdir -p tests/scripts
mv test-*.mjs tests/scripts/
mv test-*.ts tests/scripts/
mv apps/llm-gateway/test-*.mjs tests/scripts/
mv apps/llm-gateway/test-*.ts tests/scripts/
mv scripts/manual_test_flow.sh tests/scripts/
mv test-image-config.sh tests/scripts/
```

---

## ESTIMATED SPACE SAVINGS

| Category | Files | Estimated Size |
|----------|-------|----------------|
| Compiled test files | ~20 | ~500KB |
| Log files | ~10 | ~5MB |
| Duplicate scripts | ~3 | ~10KB |
| Documentation archive | ~150 | ~15MB |
| Large file cleanup | 1 | 113MB (already done) |
| **Total** | **~184** | **~130MB** |

---

## ACTION PLAN

### Step 1: Create Cleanup Script
Create `scripts/cleanup-files.sh` to automate safe removals

### Step 2: Archive Documentation
Move old audit/status docs to `docs/archive/`

### Step 3: Update .gitignore
Add patterns for logs, backups, compiled tests

### Step 4: Move Test Files
Organize test scripts into `tests/` directory

### Step 5: Clean Git History (Optional)
```bash
git gc --aggressive --prune=now
```

---

## FILES TO KEEP (Active/Documentation)

### Active Documentation
- `README.md` - Main readme
- `ARCHITECTURE_DOCUMENTATION.md` - Architecture docs
- `API_SPEC.md` - API specification
- `EVENTS.md` - Event specifications
- `PLAN.md` - Current plan
- `optimize.txt` - Active optimization audit
- `QUICKSTART.md` - Quick start guide
- `SETUP_COMPLETE.md` - Setup status

### Active Scripts
- `start-hybrid-rag.sh` - Main startup
- `stop-hybrid-rag.sh` - Main shutdown
- `setup-github-cli.sh` - Git setup
- `push-to-github.sh` - Git push helper
- `check-*.sh` - Service check scripts

---

## SAFETY CHECKLIST

Before cleanup:
- [ ] Backup current state: `git commit -am "Pre-cleanup backup"`
- [ ] Review each category manually
- [ ] Test that services still start after cleanup
- [ ] Verify no critical files are removed

After cleanup:
- [ ] Run `git status` to review changes
- [ ] Test application startup
- [ ] Verify build process still works
- [ ] Commit cleanup changes

---

**Next Steps**: Run cleanup script or manually review and remove files category by category.

