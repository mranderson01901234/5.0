#!/bin/bash

# Master start script for LLM Gateway with Hybrid RAG
# Starts all services in the correct order with proper logging and health checks
#
# IMPORTANT: This script aggressively kills all tsx watch processes before starting
# to prevent "EMFILE: too many open files" errors. If you see these errors:
# 1. Run: pkill -f 'tsx.*watch' && ./start-hybrid-rag.sh
# 2. Check for zombie processes: ps aux | grep tsx
# 3. Check file descriptor limit: ulimit -n

set -o pipefail  # Fail on piped commands, but allow individual checks

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Banner
echo -e "${BLUE}"
echo "════════════════════════════════════════════════════════════"
echo "  🚀 LLM Gateway with Hybrid RAG - Master Startup Script"
echo "════════════════════════════════════════════════════════════"
echo -e "${NC}"

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ Error: .env file not found in root directory${NC}"
    echo -e "${YELLOW}Please create .env file with required API keys${NC}"
    echo -e "${CYAN}Required keys:${NC}"
    echo -e "  - GOOGLE_API_KEY (for Gemini LLM - default model)"
    echo -e "  - OPENAI_API_KEY (for embeddings and optional GPT models)"
    echo -e "  - BRAVE_API_KEY (for web search)"
    echo -e "  - ANTHROPIC_API_KEY (optional, for Claude models)"
    echo -e "  - CLERK_SECRET_KEY (for authentication)"
    exit 1
fi

# Load .env to check for keys
source .env 2>/dev/null || true

echo -e "${BLUE}📋 Pre-flight checks...${NC}"

# Check for critical API keys
MISSING_KEYS=()
if [ -z "$GOOGLE_API_KEY" ]; then
    MISSING_KEYS+=("GOOGLE_API_KEY")
fi
if [ -z "$OPENAI_API_KEY" ]; then
    MISSING_KEYS+=("OPENAI_API_KEY")
fi
if [ -z "$BRAVE_API_KEY" ]; then
    MISSING_KEYS+=("BRAVE_API_KEY")
fi
if [ -z "$CLERK_SECRET_KEY" ]; then
    MISSING_KEYS+=("CLERK_SECRET_KEY")
fi

if [ ${#MISSING_KEYS[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Missing API keys in .env:${NC}"
    for key in "${MISSING_KEYS[@]}"; do
        echo -e "  ${RED}  - $key${NC}"
    done
    echo -e "${YELLOW}Some features may not work without these keys${NC}"
    echo ""
fi

# Function to check if port is in use
check_port() {
    if lsof -ti:$1 > /dev/null 2>&1; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Function to check HTTP endpoint (uses wget if curl not available)
check_http() {
    local url=$1
    if command -v curl > /dev/null 2>&1; then
        curl -s "$url" > /dev/null 2>&1
    elif command -v wget > /dev/null 2>&1; then
        wget -q --spider "$url" > /dev/null 2>&1
    else
        # Fallback: just check if port is listening
        local port=$(echo "$url" | sed -n 's|.*:\([0-9]*\).*|\1|p')
        check_port "$port"
    fi
}

# Function to kill process on port
kill_port() {
    local port=$1
    local service=$2
    if check_port $port; then
        echo -e "${YELLOW}⚠️  Port $port is in use ($service), killing existing process...${NC}"
        local pids=$(lsof -ti:$port 2>/dev/null)
        if [ -n "$pids" ]; then
            echo "$pids" | xargs kill -9 2>/dev/null || true
            sleep 1
        fi
    fi
}

# Check and kill existing processes
echo -e "${BLUE}🧹 Cleaning up existing processes...${NC}"

# Kill all tsx watch processes first (they consume many file descriptors)
echo -e "${YELLOW}  Killing all tsx watch processes...${NC}"
pkill -f "tsx.*watch" 2>/dev/null || true
pkill -f "tsx.*server.ts" 2>/dev/null || true
pkill -f "tsx.*index.ts" 2>/dev/null || true
sleep 2  # Give processes time to exit

# Kill processes by port
kill_port 8787 "Gateway"
kill_port 3001 "Memory Service"
kill_port 3002 "Hybrid RAG"
kill_port 3003 "Ingestion Service (if enabled)"
kill_port 5173 "Web UI"
kill_port 6333 "Qdrant (optional)"

# One more pass to ensure everything is cleaned up
pkill -f "tsx.*watch" 2>/dev/null || true
sleep 1

echo ""

# Create logs directory
mkdir -p logs
echo -e "${GREEN}✅ Logs directory ready${NC}"

# Optional: Check for Qdrant
if docker ps --format '{{.Names}}' | grep -q qdrant; then
    echo -e "${GREEN}✅ Qdrant container detected (vector search enabled)${NC}"
elif docker ps -a --format '{{.Names}}' | grep -q qdrant; then
    echo -e "${YELLOW}⚠️  Qdrant container exists but not running (vector search disabled)${NC}"
    echo -e "${CYAN}   To enable: docker start qdrant${NC}"
else
    echo -e "${YELLOW}⚠️  Qdrant not detected (vector search will be disabled)${NC}"
    echo -e "${CYAN}   To enable: docker run -d -p 6333:6333 --name qdrant qdrant/qdrant${NC}"
fi

# Check for Redis (required for Phase 7: telemetry, export queue, WebSocket)
echo -e "${BLUE}🔍 Checking Redis...${NC}"
REDIS_AVAILABLE=false
if command -v redis-cli > /dev/null 2>&1; then
    if redis-cli ping > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Redis is running (telemetry, export queue, and WebSocket enabled)${NC}"
        REDIS_AVAILABLE=true
    else
        echo -e "${RED}❌ Redis is not responding${NC}"
        echo -e "${YELLOW}   Phase 7 features (telemetry, export queue, WebSocket) will be disabled${NC}"
        echo -e "${CYAN}   To start Redis:${NC}"
        echo -e "${CYAN}     - Linux: sudo systemctl start redis${NC}"
        echo -e "${CYAN}     - macOS: brew services start redis${NC}"
        echo -e "${CYAN}     - Docker: docker run -d -p 6379:6379 redis:alpine${NC}"
        echo -e "${YELLOW}   Continuing without Redis...${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  redis-cli not found (Redis may not be installed)${NC}"
    echo -e "${YELLOW}   Phase 7 features (telemetry, export queue, WebSocket) will be disabled${NC}"
    echo -e "${CYAN}   To install Redis:${NC}"
    echo -e "${CYAN}     - Linux: sudo apt-get install redis-server${NC}"
    echo -e "${CYAN}     - macOS: brew install redis${NC}"
    echo -e "${CYAN}     - Docker: docker run -d -p 6379:6379 redis:alpine${NC}"
    echo -e "${YELLOW}   Continuing without Redis...${NC}"
fi

# Check if ingestion service should be started (default: disabled)
# Read from .env file directly to avoid variable conflicts
INGESTION_ENABLED_VAL=$(grep -E "^INGESTION_ENABLED=" .env 2>/dev/null | cut -d '=' -f2 | tr -d '"' | tr -d "'" || echo "false")
INGESTION_PORT=3003
if [ "$INGESTION_ENABLED_VAL" = "true" ]; then
    INGESTION_ENABLED=true
    # Use custom port if specified, otherwise use 3003 (avoid conflict with hybrid-rag on 3002)
    INGESTION_PORT_VAL=$(grep -E "^INGESTION_SERVICE_PORT=" .env 2>/dev/null | cut -d '=' -f2 | tr -d '"' | tr -d "'" || echo "")
    if [ -n "$INGESTION_PORT_VAL" ]; then
        INGESTION_PORT=$INGESTION_PORT_VAL
    fi
else
    INGESTION_ENABLED=false
fi

echo ""
echo -e "${BLUE}🚀 Starting services...${NC}"
echo ""

# Get absolute path to script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

# Load nvm if available
if [ -s "$HOME/.nvm/nvm.sh" ]; then
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
fi

# Verify pnpm is available
if ! command -v pnpm > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: pnpm not found${NC}"
    echo -e "${YELLOW}Please ensure Node.js and pnpm are installed${NC}"
    exit 1
fi

# Start Memory Service first (dependency for Hybrid RAG)
echo -e "${CYAN}📦 Starting Memory Service (port 3001)...${NC}"
cd "$SCRIPT_DIR/apps/memory-service" || {
    echo -e "${RED}❌ Error: Cannot access apps/memory-service directory${NC}"
    exit 1
}
pnpm dev > "$SCRIPT_DIR/logs/memory-service.log" 2>&1 &
MEMORY_PID=$!
cd "$SCRIPT_DIR" || exit 1
echo -e "${GREEN}   Started (PID: $MEMORY_PID)${NC}"
echo -n "   "
MEMORY_READY=false
for i in {1..30}; do
    # Check if process is still running
    if ! kill -0 $MEMORY_PID 2>/dev/null; then
        echo -e "\n${RED}❌ Process died${NC}"
        echo -e "${YELLOW}   Last 10 lines of log:${NC}"
        tail -10 "$SCRIPT_DIR/logs/memory-service.log" | sed 's/^/   /'
        exit 1
    fi
    # Check if metrics endpoint responds
    if check_http http://localhost:3001/v1/metrics; then
        echo -e "${GREEN}✅ Ready${NC}"
        MEMORY_READY=true
        break
    fi
    # Check for errors in log after a few seconds
    if [ $i -gt 5 ]; then
        # Ignore expected errors (Redis not available)
        if grep -qi "EMFILE\|too many open files\|Cannot find module\|SyntaxError\|ReferenceError" "$SCRIPT_DIR/logs/memory-service.log" 2>/dev/null; then
            echo -e "\n${RED}❌ Startup error detected${NC}"
            echo -e "${YELLOW}   Error in log:${NC}"
            grep -i "EMFILE\|too many open files\|Cannot find module\|SyntaxError\|ReferenceError" "$SCRIPT_DIR/logs/memory-service.log" | tail -3 | sed 's/^/   /'
            echo -e "${CYAN}   Run: pkill -f 'tsx.*watch' && ./start-hybrid-rag.sh${NC}"
            exit 1
        fi
    fi
    sleep 1
    echo -n "."
done
if [ "$MEMORY_READY" = false ]; then
    echo -e "\n${RED}❌ Memory Service failed to start after 30 seconds${NC}"
    echo -e "${YELLOW}   Check logs: tail -20 logs/memory-service.log${NC}"
    exit 1
fi
echo ""

sleep 1

# Start Hybrid RAG second (dependency for Gateway)
echo -e "${CYAN}📦 Starting Hybrid RAG (port 3002)...${NC}"
cd "$SCRIPT_DIR/sidecar-hybrid-rag" || {
    echo -e "${RED}❌ Error: Cannot access sidecar-hybrid-rag directory${NC}"
    exit 1
}
pnpm dev > "$SCRIPT_DIR/logs/hybrid-rag.log" 2>&1 &
HYBRID_RAG_PID=$!
cd "$SCRIPT_DIR" || exit 1
echo -e "${GREEN}   Started (PID: $HYBRID_RAG_PID)${NC}"
echo -n "   "
HYBRID_RAG_READY=false
for i in {1..30}; do
    # Check if process is still running
    if ! kill -0 $HYBRID_RAG_PID 2>/dev/null; then
        echo -e "\n${RED}❌ Process died${NC}"
        echo -e "${YELLOW}   Last 10 lines of log:${NC}"
        tail -10 "$SCRIPT_DIR/logs/hybrid-rag.log" | sed 's/^/   /'
        exit 1
    fi
    # Check if health endpoint responds
    if check_http http://localhost:3002/health; then
        echo -e "${GREEN}✅ Ready${NC}"
        HYBRID_RAG_READY=true
        break
    fi
    # Check for errors in log after a few seconds
    if [ $i -gt 5 ]; then
        # Ignore expected errors (Redis/Qdrant not available)
        if grep -qi "EMFILE\|too many open files\|Cannot find module\|SyntaxError\|ReferenceError" "$SCRIPT_DIR/logs/hybrid-rag.log" 2>/dev/null; then
            echo -e "\n${RED}❌ Startup error detected${NC}"
            echo -e "${YELLOW}   Error in log:${NC}"
            grep -i "EMFILE\|too many open files\|Cannot find module\|SyntaxError\|ReferenceError" "$SCRIPT_DIR/logs/hybrid-rag.log" | tail -3 | sed 's/^/   /'
            echo -e "${CYAN}   Run: pkill -f 'tsx.*watch' && ./start-hybrid-rag.sh${NC}"
            exit 1
        fi
        # Check if service is responding (even if degraded)
        if check_http http://localhost:3002/health; then
            echo -e "${GREEN}✅ Ready (degraded mode - Qdrant/Redis not available)${NC}"
            HYBRID_RAG_READY=true
            break
        fi
    fi
    sleep 1
    echo -n "."
done
if [ "$HYBRID_RAG_READY" = false ]; then
    echo -e "\n${RED}❌ Hybrid RAG failed to start after 30 seconds${NC}"
    echo -e "${YELLOW}   Check logs: tail -20 logs/hybrid-rag.log${NC}"
    exit 1
fi
echo ""

sleep 1

# Build shared package (required for gateway imports)
echo -e "${CYAN}🔨 Building shared package...${NC}"
cd "$SCRIPT_DIR/packages/shared" || {
    echo -e "${RED}❌ Error: Cannot access packages/shared directory${NC}"
    exit 1
}
if ! pnpm build > "$SCRIPT_DIR/logs/shared-build.log" 2>&1; then
    echo -e "${RED}❌ Failed to build shared package${NC}"
    echo -e "${YELLOW}   Check logs: tail -20 logs/shared-build.log${NC}"
    exit 1
fi
cd "$SCRIPT_DIR" || exit 1
echo -e "${GREEN}✅ Shared package built${NC}"

# Ensure native modules are built (better-sqlite3)
echo -e "${CYAN}🔨 Building native modules...${NC}"
cd "$SCRIPT_DIR"
pnpm rebuild better-sqlite3 > "$SCRIPT_DIR/logs/native-build.log" 2>&1 || true

# Fix ingestion-service better-sqlite3 if needed (copy from working memory-service)
if [ ! -f "$SCRIPT_DIR/apps/ingestion-service/node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3/build/Release/better_sqlite3.node" ]; then
  if [ -f "$SCRIPT_DIR/apps/memory-service/node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3/build/Release/better_sqlite3.node" ]; then
    mkdir -p "$SCRIPT_DIR/apps/ingestion-service/node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3/build/Release"
    cp "$SCRIPT_DIR/apps/memory-service/node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3/build/Release/better_sqlite3.node" \
       "$SCRIPT_DIR/apps/ingestion-service/node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3/build/Release/" 2>/dev/null || true
  fi
fi

echo -e "${GREEN}✅ Native modules ready${NC}"

sleep 1

# Start Gateway third (uses port 8787)
echo -e "${CYAN}📦 Starting Gateway (port 8787)...${NC}"
cd "$SCRIPT_DIR/apps/llm-gateway" || {
    echo -e "${RED}❌ Error: Cannot access apps/llm-gateway directory${NC}"
    exit 1
}
# Ensure gateway uses correct port
GATEWAY_PORT=8787 pnpm dev > "$SCRIPT_DIR/logs/gateway.log" 2>&1 &
GATEWAY_PID=$!
cd "$SCRIPT_DIR" || exit 1
echo -e "${GREEN}   Started (PID: $GATEWAY_PID)${NC}"
echo -n "   "
GATEWAY_READY=false
for i in {1..40}; do
    # Check if process is still running
    if ! kill -0 $GATEWAY_PID 2>/dev/null; then
        echo -e "\n${RED}❌ Process died${NC}"
        echo -e "${YELLOW}   Last 10 lines of log:${NC}"
        tail -10 "$SCRIPT_DIR/logs/gateway.log" | sed 's/^/   /'
        exit 1
    fi
    # Check if health endpoint responds
    if check_http http://localhost:8787/v1; then
        echo -e "${GREEN}✅ Ready${NC}"
        GATEWAY_READY=true
        break
    fi
    # Check for errors in log after a few seconds
    if [ $i -gt 5 ]; then
        # Ignore expected errors (Redis not available)
        if grep -qi "EMFILE\|too many open files\|Cannot find module\|SyntaxError\|ReferenceError" "$SCRIPT_DIR/logs/gateway.log" 2>/dev/null; then
            echo -e "\n${RED}❌ Startup error detected${NC}"
            echo -e "${YELLOW}   Error in log:${NC}"
            grep -i "EMFILE\|too many open files\|Cannot find module\|SyntaxError\|ReferenceError" "$SCRIPT_DIR/logs/gateway.log" | tail -3 | sed 's/^/   /'
            echo -e "${CYAN}   Run: pkill -f 'tsx.*watch' && ./start-hybrid-rag.sh${NC}"
            exit 1
        fi
    fi
    sleep 1
    echo -n "."
done
if [ "$GATEWAY_READY" = false ]; then
    echo -e "\n${RED}❌ Gateway failed to start after 40 seconds${NC}"
    echo -e "${YELLOW}   Check logs: tail -20 logs/gateway.log${NC}"
    exit 1
fi
echo ""

sleep 1

# Start Ingestion Service (optional, if enabled)
INGESTION_PID=""
if [ "$INGESTION_ENABLED" = true ]; then
    echo -e "${CYAN}📦 Starting Ingestion Service (port $INGESTION_PORT)...${NC}"
    cd "$SCRIPT_DIR/apps/ingestion-service" || {
        echo -e "${RED}❌ Error: Cannot access apps/ingestion-service directory${NC}"
        exit 1
    }
    INGESTION_SERVICE_PORT=$INGESTION_PORT INGESTION_ENABLED=true pnpm dev > "$SCRIPT_DIR/logs/ingestion-service.log" 2>&1 &
    INGESTION_PID=$!
    cd "$SCRIPT_DIR" || exit 1
    echo -e "${GREEN}   Started (PID: $INGESTION_PID)${NC}"
    echo -n "   "
    INGESTION_READY=false
    for i in {1..30}; do
        # Check if process is still running
        if ! kill -0 $INGESTION_PID 2>/dev/null; then
            echo -e "\n${YELLOW}⚠️  Ingestion Service process died (non-critical)${NC}"
            INGESTION_PID=""
            break
        fi
        # Check if health endpoint responds
        if check_http http://localhost:$INGESTION_PORT/health; then
            echo -e "${GREEN}✅ Ready${NC}"
            INGESTION_READY=true
            break
        fi
        sleep 1
        echo -n "."
    done
    if [ "$INGESTION_READY" = false ] && [ -n "$INGESTION_PID" ]; then
        echo -e "\n${YELLOW}⚠️  Ingestion Service health check timeout (non-critical, continuing...)${NC}"
    fi
    echo ""
    sleep 1
else
    echo -e "${CYAN}📦 Ingestion Service:${NC} ${YELLOW}Skipped (disabled)${NC}"
    echo ""
fi

# Start Web UI last
echo -e "${CYAN}📦 Starting Web UI (port 5173)...${NC}"
cd "$SCRIPT_DIR/apps/web" || {
    echo -e "${RED}❌ Error: Cannot access apps/web directory${NC}"
    exit 1
}
pnpm dev > "$SCRIPT_DIR/logs/web.log" 2>&1 &
WEB_PID=$!
cd "$SCRIPT_DIR" || exit 1
echo -e "${GREEN}   Started (PID: $WEB_PID)${NC}"
echo -n "   "
for i in {1..60}; do
    if check_http http://localhost:5173; then
        echo -e "${GREEN}✅ Ready${NC}"
        break
    fi
    sleep 1
    echo -n "."
done
echo ""

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ All services started!${NC}"
echo ""
echo -e "${BLUE}📍 Services:${NC}"
echo -e "  ${GREEN}Gateway:${NC}       http://localhost:8787${CYAN} (PID: $GATEWAY_PID)${NC}"
echo -e "  ${GREEN}Memory Service:${NC} http://localhost:3001${CYAN} (PID: $MEMORY_PID)${NC}"
echo -e "  ${GREEN}Hybrid RAG:${NC}     http://localhost:3002${CYAN} (PID: $HYBRID_RAG_PID)${NC}"
if [ -n "$INGESTION_PID" ]; then
    echo -e "  ${GREEN}Ingestion Service:${NC} http://localhost:$INGESTION_PORT${CYAN} (PID: $INGESTION_PID)${NC}"
fi
echo -e "  ${GREEN}Web UI:${NC}         http://localhost:5173${CYAN} (PID: $WEB_PID)${NC}"
echo ""

# Check service health
echo -e "${BLUE}🏥 Health Checks:${NC}"
check_health() {
    local name=$1
    local url=$2
    if check_http "$url"; then
        echo -e "  ${GREEN}✅ $name${NC}"
    else
        echo -e "  ${RED}❌ $name${NC}"
    fi
}

check_health "Gateway" "http://localhost:8787/v1"
check_health "Memory Service" "http://localhost:3001/v1/metrics"
check_health "Hybrid RAG" "http://localhost:3002/health"
if [ -n "$INGESTION_PID" ]; then
    check_health "Ingestion Service" "http://localhost:$INGESTION_PORT/health"
fi
check_health "Web UI" "http://localhost:5173"

echo ""

# Database status
echo -e "${BLUE}💾 Database Status:${NC}"
if [ -f apps/llm-gateway/gateway.db ] && [ -s apps/llm-gateway/gateway.db ]; then
    echo -e "  ${GREEN}✅ Gateway DB:${NC} Ready"
else
    echo -e "  ${YELLOW}⚠️  Gateway DB:${NC} Will initialize on first use"
fi

if [ -f apps/memory-service/data/memory.db ] && [ -s apps/memory-service/data/memory.db ]; then
    echo -e "  ${GREEN}✅ Memory DB:${NC} Ready"
else
    echo -e "  ${YELLOW}⚠️  Memory DB:${NC} Will initialize on first use"
fi

if [ "$INGESTION_ENABLED" = true ]; then
    if [ -f apps/ingestion-service/data/ingestion.db ] && [ -s apps/ingestion-service/data/ingestion.db ]; then
        echo -e "  ${GREEN}✅ Ingestion DB:${NC} Ready"
    else
        echo -e "  ${YELLOW}⚠️  Ingestion DB:${NC} Will initialize on first use"
    fi
fi

# RAG Layer Status
echo ""
echo -e "${BLUE}🔍 Hybrid RAG Layer Status:${NC}"
if docker ps --format '{{.Names}}' | grep -q qdrant; then
    echo -e "  ${GREEN}✅ Vector RAG:${NC} Enabled (Qdrant running)"
else
    echo -e "  ${YELLOW}⚠️  Vector RAG:${NC} Disabled (Qdrant not running)"
fi

# Check for required API keys
echo -e "  ${GREEN}✅ Web RAG:${NC} Ready (Brave API)"
echo -e "  ${GREEN}✅ Memory RAG:${NC} Ready (SQLite)"
if [ "$INGESTION_ENABLED" = true ]; then
    echo -e "  ${GREEN}✅ Ingestion RAG:${NC} Ready (RSS feeds)"
fi

# LLM Configuration
echo ""
echo -e "${BLUE}🤖 LLM Configuration:${NC}"
echo -e "  ${GREEN}✅ Default Model:${NC} gemini-2.5-flash (Google)"
if [ -n "$GOOGLE_API_KEY" ]; then
    echo -e "  ${GREEN}✅ Google API:${NC} Configured"
else
    echo -e "  ${RED}❌ Google API:${NC} Missing"
fi
if [ -n "$OPENAI_API_KEY" ]; then
    echo -e "  ${GREEN}✅ OpenAI API:${NC} Configured (for embeddings)"
else
    echo -e "  ${YELLOW}⚠️  OpenAI API:${NC} Missing (embeddings disabled)"
fi
if [ -n "$ANTHROPIC_API_KEY" ]; then
    echo -e "  ${GREEN}✅ Anthropic API:${NC} Configured (optional)"
else
    echo -e "  ${YELLOW}⚠️  Anthropic API:${NC} Not configured (optional)"
fi

# Phase 7 Infrastructure Status
echo ""
echo -e "${BLUE}⚙️  Phase 7 Infrastructure:${NC}"
if [ "$REDIS_AVAILABLE" = true ]; then
    echo -e "  ${GREEN}✅ Redis:${NC} Connected (telemetry, export queue, WebSocket enabled)"
else
    echo -e "  ${YELLOW}⚠️  Redis:${NC} Not available (Phase 7 features disabled)"
fi

echo ""
echo -e "${BLUE}📊 Logs:${NC}"
echo -e "  ${CYAN}tail -f logs/gateway.log${NC}        - Gateway logs"
echo -e "  ${CYAN}tail -f logs/memory-service.log${NC} - Memory service logs"
echo -e "  ${CYAN}tail -f logs/hybrid-rag.log${NC}     - Hybrid RAG logs"
if [ -n "$INGESTION_PID" ]; then
    echo -e "  ${CYAN}tail -f logs/ingestion-service.log${NC} - Ingestion service logs"
fi
echo -e "  ${CYAN}tail -f logs/web.log${NC}            - Web UI logs"
echo ""

echo -e "${BLUE}🛠️  Useful Commands:${NC}"
echo -e "  ${CYAN}./check-hybrid-rag.sh${NC}           - Check all service status"
echo -e "  ${CYAN}./stop-hybrid-rag.sh${NC}            - Stop all services"
echo -e "  ${CYAN}tail -f logs/hybrid-rag.log${NC}     - Monitor Hybrid RAG"
echo ""

# Test Hybrid RAG
echo -e "${BLUE}🧪 Quick Test:${NC}"
echo -e "${CYAN}curl -s http://localhost:3002/health | jq .${NC}"
echo ""

echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

# Save PIDs to file for easy stopping
PIDS="$GATEWAY_PID $MEMORY_PID $HYBRID_RAG_PID"
if [ -n "$INGESTION_PID" ]; then
    PIDS="$PIDS $INGESTION_PID"
fi
PIDS="$PIDS $WEB_PID"
echo "$PIDS" > "$SCRIPT_DIR/.hybrid-rag-pids"

echo -e "${CYAN}Press Ctrl+C to stop all services${NC}"
echo ""

# Function to stop all services
stop_services() {
    echo ""
    echo -e "${YELLOW}🛑 Stopping all services...${NC}"
    
    if [ -n "$GATEWAY_PID" ]; then
        kill -9 $GATEWAY_PID 2>/dev/null || true
        echo -e "${GREEN}  ✅ Gateway stopped${NC}"
    fi
    
    if [ -n "$MEMORY_PID" ]; then
        kill -9 $MEMORY_PID 2>/dev/null || true
        echo -e "${GREEN}  ✅ Memory Service stopped${NC}"
    fi
    
    if [ -n "$HYBRID_RAG_PID" ]; then
        kill -9 $HYBRID_RAG_PID 2>/dev/null || true
        echo -e "${GREEN}  ✅ Hybrid RAG stopped${NC}"
    fi
    
    if [ -n "$INGESTION_PID" ]; then
        kill -9 $INGESTION_PID 2>/dev/null || true
        echo -e "${GREEN}  ✅ Ingestion Service stopped${NC}"
    fi
    
    if [ -n "$WEB_PID" ]; then
        kill -9 $WEB_PID 2>/dev/null || true
        echo -e "${GREEN}  ✅ Web UI stopped${NC}"
    fi
    
    rm -f .hybrid-rag-pids
    echo -e "${GREEN}✅ All services stopped${NC}"
    exit 0
}

# Set up interrupt handler
trap stop_services INT TERM

# Wait for services
echo -e "${GREEN}🎉 Services running in background. Logs are being written to logs/ directory${NC}"
echo ""

# Keep script running and show live status
while true; do
    sleep 30
    
    # Check if services are still running
    if ! check_port 8787; then
        echo -e "${RED}❌ Gateway stopped unexpectedly${NC}"
        break
    fi
    
    if ! check_port 3001; then
        echo -e "${RED}❌ Memory Service stopped unexpectedly${NC}"
        break
    fi
    
    if ! check_port 3002; then
        echo -e "${RED}❌ Hybrid RAG stopped unexpectedly${NC}"
        break
    fi
    
    if [ -n "$INGESTION_PID" ] && ! check_port $INGESTION_PORT; then
        echo -e "${YELLOW}⚠️  Ingestion Service stopped unexpectedly (non-critical)${NC}"
        INGESTION_PID=""
    fi
    
    if ! check_port 5173; then
        echo -e "${RED}❌ Web UI stopped unexpectedly${NC}"
        break
    fi
done

stop_services
