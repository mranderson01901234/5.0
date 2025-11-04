#!/bin/bash

# Claude Code Installation Diagnostic Script

echo "=========================================="
echo "  Claude Code Installation Diagnostic"
echo "=========================================="
echo ""

# Check if binary exists
echo "1. Checking binary installation..."
if [ -f ~/.local/share/claude/versions/2.0.32 ]; then
    echo "   ✅ Binary found: ~/.local/share/claude/versions/2.0.32"
    ls -lh ~/.local/share/claude/versions/2.0.32
else
    echo "   ❌ Binary not found"
fi
echo ""

# Check symlink
echo "2. Checking symlink..."
if [ -L ~/.local/bin/claude ]; then
    echo "   ✅ Symlink exists: ~/.local/bin/claude"
    echo "   Target: $(readlink ~/.local/bin/claude)"
else
    echo "   ❌ Symlink not found"
fi
echo ""

# Check PATH
echo "3. Checking PATH..."
if echo $PATH | grep -q "$HOME/.local/bin"; then
    echo "   ✅ ~/.local/bin is in PATH"
else
    echo "   ⚠️  ~/.local/bin is NOT in PATH"
    echo "   Current PATH: $PATH"
    echo ""
    echo "   To fix, add to ~/.bashrc:"
    echo "   export PATH=\"\$HOME/.local/bin:\$PATH\""
fi
echo ""

# Test command availability
echo "4. Testing command availability..."
export PATH="$HOME/.local/bin:$PATH"
if command -v claude &> /dev/null; then
    echo "   ✅ 'claude' command is available"
    echo "   Location: $(which claude)"
else
    echo "   ❌ 'claude' command NOT found"
fi
echo ""

# Test version command
echo "5. Testing version command..."
export PATH="$HOME/.local/bin:$PATH"
if claude --version &> /dev/null; then
    echo "   ✅ Version command works"
    claude --version
else
    echo "   ❌ Version command failed"
    claude --version 2>&1
fi
echo ""

# Check permissions
echo "6. Checking file permissions..."
if [ -f ~/.local/share/claude/versions/2.0.32 ]; then
    if [ -x ~/.local/share/claude/versions/2.0.32 ]; then
        echo "   ✅ Binary is executable"
    else
        echo "   ❌ Binary is NOT executable"
        echo "   Fixing permissions..."
        chmod +x ~/.local/share/claude/versions/2.0.32
    fi
fi
echo ""

# Test actual execution
echo "7. Testing actual execution..."
export PATH="$HOME/.local/bin:$PATH"
timeout 3 claude --help &> /dev/null
if [ $? -eq 0 ] || [ $? -eq 124 ]; then
    echo "   ✅ Claude executes successfully"
else
    echo "   ❌ Claude execution failed"
    echo "   Error output:"
    timeout 3 claude --help 2>&1 | head -5
fi
echo ""

# Check for Node.js (dependency)
echo "8. Checking dependencies..."
if command -v node &> /dev/null; then
    echo "   ✅ Node.js found: $(node --version)"
else
    echo "   ⚠️  Node.js not found in PATH"
    if [ -s "$HOME/.nvm/nvm.sh" ]; then
        echo "   ℹ️  NVM detected - loading..."
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
        echo "   Node.js version: $(node --version)"
    fi
fi
echo ""

echo "=========================================="
echo "  Diagnostic Complete"
echo "=========================================="
echo ""
echo "To use Claude Code:"
echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
echo "  claude"
echo ""

