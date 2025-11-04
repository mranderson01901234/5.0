#!/bin/bash

# Claude Code Launcher - Ensures proper environment setup

# Load NVM if available
if [ -s "$HOME/.nvm/nvm.sh" ]; then
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
fi

# Ensure ~/.local/bin is in PATH
export PATH="$HOME/.local/bin:$PATH"

# Launch Claude Code
exec claude "$@"

