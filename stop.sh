#!/bin/bash

# Stop script for LLM Gateway services

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🛑 Stopping all services...${NC}"

# Kill by PIDs if file exists (graceful shutdown first)
if [ -f .service-pids ]; then
    PIDS=$(cat .service-pids)
    if [ -n "$PIDS" ]; then
        echo -e "${YELLOW}Stopping processes gracefully: $PIDS${NC}"
        # Send SIGTERM first for graceful shutdown (allows database cleanup)
        kill -TERM $PIDS 2>/dev/null || true
        sleep 2
        # Force kill if still running
        kill -9 $PIDS 2>/dev/null || true
        rm -f .service-pids
    fi
fi

# Also kill by port (in case PIDs file is missing)
for port in 8787 3001 5176; do
    if lsof -ti:$port > /dev/null 2>&1; then
        echo -e "${YELLOW}Stopping process on port $port...${NC}"
        PID=$(lsof -ti:$port)
        # Try graceful shutdown first
        kill -TERM $PID 2>/dev/null || true
        sleep 1
        # Force kill if still running
        kill -9 $PID 2>/dev/null || true
    fi
done

# Kill any remaining tsx/node processes related to the services
pkill -f "tsx.*server.ts" 2>/dev/null || true
pkill -f "vite.*web" 2>/dev/null || true

echo -e "${GREEN}✅ All services stopped${NC}"

