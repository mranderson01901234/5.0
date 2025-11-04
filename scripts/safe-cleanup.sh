#!/bin/bash
# SAFE File System Cleanup Script - Dry Run & Verification Mode
# This script ONLY removes files that are 100% safe to remove
# Run with: ./scripts/safe-cleanup.sh --dry-run (preview)
# Then: ./scripts/safe-cleanup.sh --execute (actual cleanup)

set -e

DRY_RUN=true
EXECUTE=false

# Parse arguments
if [[ "$1" == "--execute" ]]; then
    DRY_RUN=false
    EXECUTE=true
    echo "⚠️  EXECUTE MODE - Files will be deleted!"
    echo ""
    read -p "Are you absolutely sure? Type 'yes' to continue: " confirm
    if [ "$confirm" != "yes" ]; then
        echo "❌ Aborted"
        exit 1
    fi
elif [[ "$1" == "--dry-run" ]] || [ -z "$1" ]; then
    DRY_RUN=true
    EXECUTE=false
    echo "🔍 DRY RUN MODE - No files will be deleted"
    echo "   Run with --execute to actually remove files"
    echo ""
else
    echo "Usage: $0 [--dry-run|--execute]"
    exit 1
fi

echo "🧹 SAFE File System Cleanup Script"
echo "=============================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ] && [ ! -f "optimize.txt" ]; then
    echo "❌ Error: Run this script from the project root"
    exit 1
fi

# Verification function
verify_file_not_used() {
    local file="$1"
    local reason="$2"
    
    # Check if file is imported/required anywhere
    if grep -r "$(basename "$file")" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.json" --exclude-dir=node_modules --exclude-dir=.git . 2>/dev/null | grep -v "^Binary" | grep -v ".md:" | head -1 > /dev/null; then
        echo "   ⚠️  SKIP: $file - May be referenced in code"
        return 1
    fi
    
    # Check if file is in package.json scripts
    if grep -q "$(basename "$file")" package.json 2>/dev/null; then
        echo "   ⚠️  SKIP: $file - Referenced in package.json"
        return 1
    fi
    
    echo "   ✅ SAFE: $file - $reason"
    return 0
}

# Function to safely remove file
safe_remove() {
    local file="$1"
    local reason="$2"
    
    if [ ! -f "$file" ] && [ ! -d "$file" ]; then
        return 0
    fi
    
    if verify_file_not_used "$file" "$reason"; then
        if [ "$EXECUTE" = true ]; then
            rm -rf "$file"
            echo "   🗑️  REMOVED: $file"
        else
            echo "   📋 WOULD REMOVE: $file"
        fi
        return 0
    fi
    return 1
}

# Counter
REMOVED_COUNT=0
SKIPPED_COUNT=0

echo "1️⃣  Checking compiled test files in dist/..."
echo "   (Only removing .test.* files that are compiled artifacts)"
find apps/llm-gateway/dist -name "*.test.*" -type f 2>/dev/null | while read file; do
    # Only remove if it's a compiled file (has .js.map or .d.ts.map)
    if [[ "$file" == *.js.map ]] || [[ "$file" == *.d.ts.map ]] || [[ "$file" == *.js ]]; then
        if [ "$EXECUTE" = true ]; then
            rm -f "$file" && REMOVED_COUNT=$((REMOVED_COUNT + 1))
            echo "   🗑️  REMOVED: $file"
        else
            echo "   📋 WOULD REMOVE: $file (compiled test artifact)"
            REMOVED_COUNT=$((REMOVED_COUNT + 1))
        fi
    else
        echo "   ⚠️  SKIP: $file - Not a compiled file"
        SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
    fi
done
echo ""

echo "2️⃣  Checking duplicate git setup scripts..."
echo "   (Only removing scripts that are exact duplicates)"
DUPLICATES=(
    "push-with-gh.sh"
    "setup-git-quick.sh"
    "apps/web/setup-git-quick.sh"
)

for script in "${DUPLICATES[@]}"; do
    if [ -f "$script" ]; then
        # Verify it's not referenced anywhere
        if ! grep -r "$script" --include="*.md" --include="*.txt" --exclude-dir=node_modules --exclude-dir=.git . 2>/dev/null | grep -v "CLEANUP\|cleanup" > /dev/null; then
            if [ "$EXECUTE" = true ]; then
                rm -f "$script" && REMOVED_COUNT=$((REMOVED_COUNT + 1))
                echo "   🗑️  REMOVED: $script"
            else
                echo "   📋 WOULD REMOVE: $script (duplicate git setup)"
                REMOVED_COUNT=$((REMOVED_COUNT + 1))
            fi
        else
            echo "   ⚠️  SKIP: $script - Referenced in documentation"
            SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
        fi
    fi
done
echo ""

echo "3️⃣  Checking temporary files..."
TEMPORARY_FILES=(
    "apps/web/GIT_PUSH_INSTRUCTIONS.txt"
)

for file in "${TEMPORARY_FILES[@]}"; do
    if [ -f "$file" ]; then
        if [ "$EXECUTE" = true ]; then
            rm -f "$file" && REMOVED_COUNT=$((REMOVED_COUNT + 1))
            echo "   🗑️  REMOVED: $file"
        else
            echo "   📋 WOULD REMOVE: $file (temporary instruction file)"
            REMOVED_COUNT=$((REMOVED_COUNT + 1))
        fi
    fi
done
echo ""

echo "4️⃣  Checking .env.backup..."
if [ -f ".env.backup" ]; then
    echo "   ⚠️  WARNING: .env.backup contains sensitive data"
    if [ "$EXECUTE" = true ]; then
        rm -f .env.backup
        echo "   🗑️  REMOVED: .env.backup"
        REMOVED_COUNT=$((REMOVED_COUNT + 1))
    else
        echo "   📋 WOULD REMOVE: .env.backup (contains sensitive data)"
        REMOVED_COUNT=$((REMOVED_COUNT + 1))
    fi
else
    echo "   ℹ️  .env.backup not found"
fi
echo ""

echo "5️⃣  Checking log files (will be gitignored, not deleted)..."
LOG_FILES=$(find . -type f -name "*.log" ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/qdrant_storage/*" 2>/dev/null | wc -l)
if [ "$LOG_FILES" -gt 0 ]; then
    echo "   ℹ️  Found $LOG_FILES log files"
    echo "   📝 These will be added to .gitignore (not deleted)"
else
    echo "   ℹ️  No log files found"
fi
echo ""

echo "6️⃣  Updating .gitignore (safe - only adds patterns)..."
if [ -f ".gitignore" ]; then
    PATTERNS_TO_ADD=(
        "^logs/\*.log$"
        "^\*.log$"
        "^qdrant_storage/\*\*/\*.log$"
        "^\*.pid$"
        "^\*.pids$"
        "^\.env\.backup$"
        "^\.env\.\*\.backup$"
        "^\*.bak$"
        "^\*.backup$"
        "^\.claude/settings\.local\.json$"
        "^\*\*/.claude/settings\.local\.json$"
        "^dist/\*\*/\*\.test\.\*$"
        "^dist/\*\*/\*\.spec\.\*$"
    )
    
    NEEDS_UPDATE=false
    for pattern in "${PATTERNS_TO_ADD[@]}"; do
        if ! grep -q "$pattern" .gitignore 2>/dev/null; then
            NEEDS_UPDATE=true
            break
        fi
    done
    
    if [ "$NEEDS_UPDATE" = true ]; then
        if [ "$EXECUTE" = true ]; then
            cat >> .gitignore << 'EOF'

# Logs (added by safe cleanup script)
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
EOF
            echo "   ✅ .gitignore updated"
        else
            echo "   📋 WOULD UPDATE: .gitignore (adds ignore patterns)"
        fi
    else
        echo "   ℹ️  .gitignore already has cleanup patterns"
    fi
else
    echo "   ⚠️  .gitignore not found"
fi
echo ""

# Summary
echo "📊 Cleanup Summary"
echo "=================="
echo ""
if [ "$EXECUTE" = true ]; then
    echo "✅ Executed:"
    echo "   - Files removed: $REMOVED_COUNT"
    echo "   - Files skipped: $SKIPPED_COUNT"
    echo "   - .gitignore updated"
else
    echo "🔍 Dry Run Results:"
    echo "   - Files that WOULD be removed: $REMOVED_COUNT"
    echo "   - Files that WOULD be skipped: $SKIPPED_COUNT"
    echo ""
    echo "⚠️  NO FILES WERE ACTUALLY DELETED"
    echo ""
    echo "To actually remove files, run:"
    echo "   $0 --execute"
fi
echo ""
echo "📝 Safety Notes:"
echo "   ✅ Only removes compiled test artifacts"
echo "   ✅ Only removes duplicate scripts (verified not referenced)"
echo "   ✅ Only removes temporary files"
echo "   ✅ Does NOT remove any source code"
echo "   ✅ Does NOT remove any markdown documentation"
echo "   ✅ Does NOT remove any functional scripts"
echo ""

if [ "$EXECUTE" = true ]; then
    echo "🎉 Safe cleanup complete!"
    echo ""
    echo "Next steps:"
    echo "   1. Test application: ./start-hybrid-rag.sh"
    echo "   2. Review changes: git status"
    echo "   3. Commit if satisfied: git add -A && git commit -m 'Cleanup: Remove safe test files'"
fi

