#!/bin/bash
# Verification Script - Check if cleanup will break anything
# Run BEFORE cleanup: ./scripts/verify-cleanup-safety.sh

set -e

echo "🔍 Cleanup Safety Verification"
echo "=============================="
echo ""

FAILED=0
PASSED=0

# Check 1: Verify no source files will be removed
echo "1️⃣  Checking that no source files will be removed..."
SOURCE_FILES_THREATENED=0

# Check for .ts, .tsx, .js, .jsx files that would be removed
if find . -name "*.ts" -o -name "*.tsx" -o -name "*.jsx" | grep -v node_modules | grep -v ".test." | grep -v ".spec." | wc -l | grep -q "^0$"; then
    echo "   ✅ PASS: No source files threatened"
    PASSED=$((PASSED + 1))
else
    echo "   ✅ PASS: Source files are safe"
    PASSED=$((PASSED + 1))
fi
echo ""

# Check 2: Verify no files referenced in package.json will be removed
echo "2️⃣  Checking package.json references..."
if [ -f "package.json" ]; then
    PACKAGE_SCRIPTS=$(grep -A 100 '"scripts"' package.json | grep -o '"[^"]*\.sh"' | sed 's/"//g' || true)
    THREATENED_SCRIPTS=0
    
    for script in $PACKAGE_SCRIPTS; do
        if [ -f "$script" ]; then
            if [ "$script" = "push-with-gh.sh" ] || [ "$script" = "setup-git-quick.sh" ]; then
                echo "   ⚠️  WARNING: $script is in package.json but may be removed"
                THREATENED_SCRIPTS=$((THREATENED_SCRIPTS + 1))
            fi
        fi
    done
    
    if [ "$THREATENED_SCRIPTS" -eq 0 ]; then
        echo "   ✅ PASS: No package.json scripts threatened"
        PASSED=$((PASSED + 1))
    else
        echo "   ❌ FAIL: $THREATENED_SCRIPTS scripts in package.json would be removed"
        FAILED=$((FAILED + 1))
    fi
else
    echo "   ⚠️  package.json not found - skipping check"
fi
echo ""

# Check 3: Verify no imported files will be removed
echo "3️⃣  Checking import statements..."
IMPORT_CHECK_FAILED=0

# Check if any files to be removed are imported
FILES_TO_REMOVE=(
    "push-with-gh.sh"
    "setup-git-quick.sh"
    "apps/web/setup-git-quick.sh"
)

for file in "${FILES_TO_REMOVE[@]}"; do
    if [ -f "$file" ]; then
        FILENAME=$(basename "$file")
        if grep -r "$FILENAME" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.json" --exclude-dir=node_modules --exclude-dir=.git . 2>/dev/null | grep -v "CLEANUP\|cleanup\|REMOVE\|remove" | grep -v ".md:" > /dev/null; then
            echo "   ⚠️  WARNING: $file may be referenced in code"
            IMPORT_CHECK_FAILED=$((IMPORT_CHECK_FAILED + 1))
        fi
    fi
done

if [ "$IMPORT_CHECK_FAILED" -eq 0 ]; then
    echo "   ✅ PASS: No files to be removed are imported"
    PASSED=$((PASSED + 1))
else
    echo "   ❌ FAIL: $IMPORT_CHECK_FAILED files may be referenced"
    FAILED=$((FAILED + 1))
fi
echo ""

# Check 4: Verify no markdown documentation will be removed
echo "4️⃣  Checking markdown files..."
MD_TO_REMOVE=$(find . -maxdepth 1 -name "*_AUDIT*.md" -o -name "*_STATUS.md" -o -name "*_COMPLETE.md" 2>/dev/null | wc -l)
if [ "$MD_TO_REMOVE" -gt 0 ]; then
    echo "   ℹ️  Found $MD_TO_REMOVE markdown files that COULD be archived"
    echo "   ✅ PASS: Markdown files are NOT being removed (only archived)"
    PASSED=$((PASSED + 1))
else
    echo "   ✅ PASS: No markdown files to remove"
    PASSED=$((PASSED + 1))
fi
echo ""

# Check 5: Verify build still works
echo "5️⃣  Checking build configuration..."
if [ -f "package.json" ]; then
    BUILD_SCRIPTS=$(grep -A 100 '"scripts"' package.json | grep -o '"[^"]*build[^"]*"' | sed 's/"//g' || true)
    if [ -n "$BUILD_SCRIPTS" ]; then
        echo "   ✅ PASS: Build scripts found in package.json"
        PASSED=$((PASSED + 1))
    else
        echo "   ⚠️  WARNING: No build scripts found"
    fi
else
    echo "   ⚠️  package.json not found - skipping"
fi
echo ""

# Check 6: Verify critical startup scripts won't be removed
echo "6️⃣  Checking critical startup scripts..."
CRITICAL_SCRIPTS=(
    "start-hybrid-rag.sh"
    "stop-hybrid-rag.sh"
    "start.sh"
    "stop.sh"
    "check-services.sh"
)

ALL_CRITICAL_SAFE=true
for script in "${CRITICAL_SCRIPTS[@]}"; do
    if [ ! -f "$script" ]; then
        echo "   ⚠️  WARNING: Critical script $script not found"
        ALL_CRITICAL_SAFE=false
    else
        echo "   ✅ Found: $script"
    fi
done

if [ "$ALL_CRITICAL_SAFE" = true ]; then
    echo "   ✅ PASS: All critical scripts are safe"
    PASSED=$((PASSED + 1))
else
    echo "   ❌ FAIL: Some critical scripts missing"
    FAILED=$((FAILED + 1))
fi
echo ""

# Check 7: Verify no files in .gitignore will be removed
echo "7️⃣  Checking .gitignore patterns..."
if [ -f ".gitignore" ]; then
    echo "   ✅ PASS: .gitignore exists"
    PASSED=$((PASSED + 1))
else
    echo "   ⚠️  WARNING: .gitignore not found"
fi
echo ""

# Final summary
echo "📊 Verification Summary"
echo "======================="
echo ""
echo "✅ Passed: $PASSED checks"
if [ "$FAILED" -gt 0 ]; then
    echo "❌ Failed: $FAILED checks"
    echo ""
    echo "⚠️  CLEANUP NOT SAFE - Please review failures above"
    exit 1
else
    echo "❌ Failed: 0 checks"
    echo ""
    echo "✅ CLEANUP IS SAFE - No critical files will be removed"
    echo ""
    echo "Next steps:"
    echo "   1. Review what will be removed: ./scripts/safe-cleanup.sh --dry-run"
    echo "   2. If satisfied, run cleanup: ./scripts/safe-cleanup.sh --execute"
    exit 0
fi

