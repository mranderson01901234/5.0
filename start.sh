#!/bin/bash

# Master start script for LLM Gateway monorepo
# Starts all services in the correct order

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ Error: .env file not found in root directory${NC}"
    echo -e "${YELLOW}Please create .env file with required API keys${NC}"
    exit 1
fi

echo -e "${BLUE}🚀 Starting LLM Gateway Services...${NC}"
echo ""

# Function to check if port is in use
check_port() {
    if lsof -ti:$1 > /dev/null 2>&1; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Function to kill process on port
kill_port() {
    local port=$1
    if check_port $port; then
        echo -e "${YELLOW}⚠️  Port $port is in use, killing existing process...${NC}"
        lsof -ti:$port | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
}

# Check and kill existing processes
echo -e "${BLUE}Cleaning up existing processes...${NC}"
kill_port 8787  # Gateway
kill_port 3001  # Memory Service
kill_port 5173  # Web (Vite default port)

echo ""

# Create logs directory
mkdir -p logs

# Optional: Initialize databases if needed
if [ ! -f apps/llm-gateway/gateway.db ] || [ ! -s apps/llm-gateway/gateway.db ]; then
    echo -e "${YELLOW}📊 Initializing gateway database...${NC}"
    node scripts/init_gateway_db.mjs 2>/dev/null || echo -e "${YELLOW}   Database will initialize on first use${NC}"
fi

# Start services in background
echo -e "${GREEN}📦 Starting Gateway (port 8787)...${NC}"
cd apps/llm-gateway
pnpm dev > ../../logs/gateway.log 2>&1 &
GATEWAY_PID=$!
cd ../..
echo -e "${GREEN}   Gateway started (PID: $GATEWAY_PID)${NC}"

# Wait a moment for gateway to start and check if it's ready
sleep 2
if curl -s http://localhost:8787/health > /dev/null 2>&1 || curl -s http://localhost:8787 > /dev/null 2>&1; then
    echo -e "${GREEN}   ✅ Gateway is ready${NC}"
else
    echo -e "${YELLOW}   ⚠️  Gateway starting (may take a few seconds)${NC}"
fi

echo -e "${GREEN}💾 Starting Memory Service (port 3001)...${NC}"
cd apps/memory-service
pnpm dev > ../../logs/memory-service.log 2>&1 &
MEMORY_PID=$!
cd ../..
echo -e "${GREEN}   Memory Service started (PID: $MEMORY_PID)${NC}"

# Wait a moment for memory service to start and check if it's ready
sleep 2
if curl -s http://localhost:3001/health > /dev/null 2>&1 || curl -s http://localhost:3001/v1/metrics > /dev/null 2>&1; then
    echo -e "${GREEN}   ✅ Memory Service is ready${NC}"
else
    echo -e "${YELLOW}   ⚠️  Memory Service starting (may take a few seconds)${NC}"
fi

echo -e "${GREEN}🌐 Starting Web App (port 5173)...${NC}"
cd apps/web
pnpm dev > ../../logs/web.log 2>&1 &
WEB_PID=$!
cd ../..
echo -e "${GREEN}   Web App started (PID: $WEB_PID)${NC}"

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ All services started!${NC}"
echo ""
echo -e "${BLUE}Services:${NC}"
echo -e "  ${GREEN}Gateway:${NC}        http://localhost:8787 (PID: $GATEWAY_PID)"
echo -e "  ${GREEN}Memory Service:${NC} http://localhost:3001 (PID: $MEMORY_PID)"
echo -e "  ${GREEN}Web App:${NC}        http://localhost:5173 (PID: $WEB_PID)"
echo ""
echo -e "${BLUE}Database Status:${NC}"
if [ -f apps/llm-gateway/gateway.db ] && [ -s apps/llm-gateway/gateway.db ]; then
    echo -e "  ${GREEN}✅ Gateway DB:${NC} Optimized with RAG-ready schema"
else
    echo -e "  ${YELLOW}⚠️  Gateway DB:${NC} Will initialize on first use"
fi
if [ -f apps/memory-service/data/memory.db ] && [ -s apps/memory-service/data/memory.db ]; then
    echo -e "  ${GREEN}✅ Memory DB:${NC} Optimized with embedding support"
else
    echo -e "  ${YELLOW}⚠️  Memory DB:${NC} Will initialize on first use"
fi
echo ""
echo -e "${BLUE}Logs:${NC}"
echo -e "  ${YELLOW}tail -f logs/gateway.log${NC}"
echo -e "  ${YELLOW}tail -f logs/memory-service.log${NC}"
echo -e "  ${YELLOW}tail -f logs/web.log${NC}"
echo ""
echo -e "${BLUE}Useful Commands:${NC}"
echo -e "  ${YELLOW}node scripts/check_database_status.mjs${NC}  - Check database optimizations"
echo -e "  ${YELLOW}./stop.sh${NC} or ${YELLOW}kill $GATEWAY_PID $MEMORY_PID $WEB_PID${NC}  - Stop all services"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""

# Save PIDs to file for easy stopping
echo "$GATEWAY_PID $MEMORY_PID $WEB_PID" > .service-pids

# Wait for user interrupt
trap "echo ''; echo -e '${YELLOW}Stopping all services...${NC}'; kill $GATEWAY_PID $MEMORY_PID $WEB_PID 2>/dev/null || true; rm -f .service-pids; exit" INT TERM

echo -e "${BLUE}Press Ctrl+C to stop all services${NC}"
echo ""

# Wait for services
wait

