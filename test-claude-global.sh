#!/bin/bash

# Test script to verify Claude Code is globally available
# This simulates opening a fresh terminal

echo "Testing Claude Code availability..."
echo ""

# Test 1: Check if command exists
if command -v claude &> /dev/null; then
    echo "✅ 'claude' command is available"
    echo "   Location: $(which claude)"
else
    echo "❌ 'claude' command NOT found"
    echo ""
    echo "To fix:"
    echo "  1. Open a new terminal, OR"
    echo "  2. Run: source ~/.bashrc"
    exit 1
fi

# Test 2: Check version
echo ""
echo "✅ Version check:"
claude --version

# Test 3: Test from different directories
echo ""
echo "✅ Testing from different directories:"
cd /tmp && claude --version > /dev/null 2>&1 && echo "   /tmp: ✅ Works" || echo "   /tmp: ❌ Failed"
cd ~ && claude --version > /dev/null 2>&1 && echo "   HOME: ✅ Works" || echo "   HOME: ❌ Failed"
cd /home/dp/Desktop/2.0 && claude --version > /dev/null 2>&1 && echo "   Project: ✅ Works" || echo "   Project: ❌ Failed"

echo ""
echo "🎉 Claude Code is ready to use!"
echo ""
echo "You can now run 'claude' from anywhere."

