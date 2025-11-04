#!/bin/bash
# File System Cleanup Script
# Based on CLEANUP_AUDIT_REPORT.md
# Run with: ./scripts/cleanup-files.sh

set -e

echo "🧹 File System Cleanup Script"
echo "=============================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ] && [ ! -f "optimize.txt" ]; then
    echo "❌ Error: Run this script from the project root"
    exit 1
fi

# Backup current state
echo "📦 Creating backup commit..."
git add -A 2>/dev/null || true
git commit -m "Pre-cleanup backup" --allow-empty 2>/dev/null || echo "No changes to commit"

echo ""
echo "🔍 Starting cleanup..."
echo ""

# Priority 1: Remove compiled test files from dist/
echo "1️⃣  Removing compiled test files from dist/..."
find apps/llm-gateway/dist -name "*.test.*" -type f 2>/dev/null | while read file; do
    echo "   Removing: $file"
    rm -f "$file"
done
echo "   ✅ Done"
echo ""

# Priority 2: Remove duplicate git setup scripts
echo "2️⃣  Removing duplicate git setup scripts..."
rm -f push-with-gh.sh setup-git-quick.sh apps/web/setup-git-quick.sh 2>/dev/null
echo "   ✅ Removed duplicate scripts"
echo ""

# Priority 3: Remove temporary text files
echo "3️⃣  Removing temporary files..."
rm -f apps/web/GIT_PUSH_INSTRUCTIONS.txt 2>/dev/null
echo "   ✅ Removed temporary files"
echo ""

# Priority 4: Remove .env.backup (contains sensitive data)
echo "4️⃣  Removing .env.backup..."
if [ -f ".env.backup" ]; then
    rm -f .env.backup
    echo "   ✅ Removed .env.backup (contains sensitive data)"
else
    echo "   ℹ️  .env.backup not found"
fi
echo ""

# Priority 5: Create archive structure
echo "5️⃣  Creating archive directories..."
mkdir -p docs/archive/{audits,status,testing,implementation} 2>/dev/null
echo "   ✅ Archive directories created"
echo ""

# Priority 6: Archive audit reports (dry run first)
echo "6️⃣  Archiving audit reports..."
AUDIT_COUNT=$(find . -maxdepth 1 -name "*_AUDIT*.md" -type f 2>/dev/null | wc -l)
if [ "$AUDIT_COUNT" -gt 0 ]; then
    echo "   Found $AUDIT_COUNT audit files"
    read -p "   Move audit files to docs/archive/audits/? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        mv *_AUDIT*.md docs/archive/audits/ 2>/dev/null || true
        mv docs/audits/*.md docs/archive/audits/ 2>/dev/null || true
        echo "   ✅ Audit files archived"
    else
        echo "   ⏭️  Skipped"
    fi
else
    echo "   ℹ️  No audit files found"
fi
echo ""

# Priority 7: Archive status reports
echo "7️⃣  Archiving status reports..."
STATUS_COUNT=$(find . -maxdepth 1 \( -name "*_STATUS.md" -o -name "*_COMPLETE.md" \) -type f 2>/dev/null | wc -l)
if [ "$STATUS_COUNT" -gt 0 ]; then
    echo "   Found $STATUS_COUNT status files"
    read -p "   Move status files to docs/archive/status/? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        mv *_STATUS.md docs/archive/status/ 2>/dev/null || true
        mv *_COMPLETE.md docs/archive/status/ 2>/dev/null || true
        echo "   ✅ Status files archived"
    else
        echo "   ⏭️  Skipped"
    fi
else
    echo "   ℹ️  No status files found"
fi
echo ""

# Priority 8: Update .gitignore
echo "8️⃣  Updating .gitignore..."
if [ -f ".gitignore" ]; then
    # Check if patterns already exist
    if ! grep -q "^logs/\*.log$" .gitignore 2>/dev/null; then
        cat >> .gitignore << 'EOF'

# Logs (added by cleanup script)
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
echo "✅ Completed:"
echo "   - Removed compiled test files"
echo "   - Removed duplicate scripts"
echo "   - Removed temporary files"
echo "   - Created archive directories"
echo "   - Updated .gitignore"
echo ""
echo "📝 Next Steps:"
echo "   1. Review archived files: ls -la docs/archive/"
echo "   2. Test application: ./start-hybrid-rag.sh"
echo "   3. Commit changes: git add -A && git commit -m 'Cleanup: Remove test files and archive docs'"
echo ""
echo "🎉 Cleanup complete!"

