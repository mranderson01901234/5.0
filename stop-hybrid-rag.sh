#!/bin/bash

# Stop script for LLM Gateway with Hybrid RAG
# Gracefully stops all services

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}🛑 Stopping Hybrid RAG Services...${NC}"
echo ""

# Function to kill service on port
kill_service() {
    local port=$1
    local name=$2
    
    if lsof -ti:$port > /dev/null 2>&1; then
        echo -e "${CYAN}Stopping $name (port $port)...${NC}"
        lsof -ti:$port | xargs kill -9 2>/dev/null || true
        sleep 1
        echo -e "${GREEN}  ✅ $name stopped${NC}"
    else
        echo -e "${YELLOW}  ⚠️  $name not running${NC}"
    fi
}

# Stop services in reverse order
kill_service 5173 "Web UI"
kill_service 8787 "Gateway"
kill_service 3002 "Hybrid RAG"
kill_service 3001 "Memory Service"

# Kill all tsx watch processes (they can accumulate and consume file descriptors)
echo -e "${CYAN}Killing all tsx watch processes...${NC}"
pkill -f "tsx.*watch" 2>/dev/null || true
pkill -f "tsx.*server.ts" 2>/dev/null || true
pkill -f "tsx.*index.ts" 2>/dev/null || true
sleep 1

# Remove PID file
if [ -f .hybrid-rag-pids ]; then
    rm -f .hybrid-rag-pids
fi

echo ""
echo -e "${GREEN}✅ All services stopped${NC}"

