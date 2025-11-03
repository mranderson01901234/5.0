#!/bin/bash

# Health check script for LLM Gateway with Hybrid RAG
# Checks status of all services and their components

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "════════════════════════════════════════════════════════════"
echo "  🔍 Hybrid RAG System Health Check"
echo "════════════════════════════════════════════════════════════"
echo -e "${NC}"
echo ""

# Function to check port
check_port() {
    if lsof -ti:$1 > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to check HTTP endpoint
check_http() {
    if curl -s "$1" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Core Services
echo -e "${BLUE}📍 Core Services:${NC}"
echo ""

# Gateway (8787)
if check_port 8787; then
    echo -e "  ${GREEN}✅ Gateway${NC} (port 8787)"
    if check_http "http://localhost:8787"; then
        echo -e "     ${GREEN}HTTP: OK${NC}"
    else
        echo -e "     ${YELLOW}HTTP: Not responding${NC}"
    fi
else
    echo -e "  ${RED}❌ Gateway${NC} (port 8787) - Not running"
fi

# Memory Service (3001)
if check_port 3001; then
    echo -e "  ${GREEN}✅ Memory Service${NC} (port 3001)"
    if check_http "http://localhost:3001/v1/metrics"; then
        echo -e "     ${GREEN}HTTP: OK${NC}"
    else
        echo -e "     ${YELLOW}HTTP: Not responding${NC}"
    fi
else
    echo -e "  ${RED}❌ Memory Service${NC} (port 3001) - Not running"
fi

# Hybrid RAG (3002)
if check_port 3002; then
    echo -e "  ${GREEN}✅ Hybrid RAG${NC} (port 3002)"
    if check_http "http://localhost:3002/health"; then
        HEALTH=$(curl -s http://localhost:3002/health | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")
        if [ "$HEALTH" = "healthy" ] || [ "$HEALTH" = "degraded" ]; then
            echo -e "     ${GREEN}Health: $HEALTH${NC}"
        else
            echo -e "     ${YELLOW}Health: $HEALTH${NC}"
        fi
    else
        echo -e "     ${YELLOW}HTTP: Not responding${NC}"
    fi
else
    echo -e "  ${RED}❌ Hybrid RAG${NC} (port 3002) - Not running"
fi

# Web UI (5173)
if check_port 5173; then
    echo -e "  ${GREEN}✅ Web UI${NC} (port 5173)"
    if check_http "http://localhost:5173"; then
        echo -e "     ${GREEN}HTTP: OK${NC}"
    else
        echo -e "     ${YELLOW}HTTP: Not responding${NC}"
    fi
else
    echo -e "  ${RED}❌ Web UI${NC} (port 5173) - Not running"
fi

echo ""

# Databases
echo -e "${BLUE}💾 Databases:${NC}"
echo ""

if [ -f apps/llm-gateway/gateway.db ] && [ -s apps/llm-gateway/gateway.db ]; then
    SIZE=$(du -h apps/llm-gateway/gateway.db | cut -f1)
    echo -e "  ${GREEN}✅ Gateway DB${NC} ($SIZE)"
else
    echo -e "  ${YELLOW}⚠️  Gateway DB${NC} - Not initialized"
fi

if [ -f apps/memory-service/data/memory.db ] && [ -s apps/memory-service/data/memory.db ]; then
    SIZE=$(du -h apps/memory-service/data/memory.db | cut -f1)
    echo -e "  ${GREEN}✅ Memory DB${NC} ($SIZE)"
else
    echo -e "  ${YELLOW}⚠️  Memory DB${NC} - Not initialized"
fi

echo ""

# RAG Layer Dependencies
echo -e "${BLUE}🔍 Hybrid RAG Layer Status:${NC}"
echo ""

# Qdrant Vector Store
if docker ps --format '{{.Names}}' | grep -q qdrant; then
    QDRANT_STATUS=$(docker ps --filter "name=qdrant" --format "{{.Status}}")
    echo -e "  ${GREEN}✅ Qdrant Vector Store${NC}"
    echo -e "     ${GREEN}Status: $QDRANT_STATUS${NC}"
    echo -e "     ${GREEN}Vector RAG: Enabled${NC}"
elif docker ps -a --format '{{.Names}}' | grep -q qdrant; then
    echo -e "  ${YELLOW}⚠️  Qdrant Vector Store${NC}"
    echo -e "     ${RED}Not running${NC}"
    echo -e "     ${YELLOW}Vector RAG: Disabled${NC}"
    echo -e "     ${CYAN}Start: docker start qdrant${NC}"
else
    echo -e "  ${RED}❌ Qdrant Vector Store${NC}"
    echo -e "     ${YELLOW}Vector RAG: Disabled${NC}"
    echo -e "     ${CYAN}Install: docker run -d -p 6333:6333 --name qdrant qdrant/qdrant${NC}"
fi

# Redis (optional, for caching)
if check_port 6379; then
    echo -e "  ${GREEN}✅ Redis${NC} (port 6379)"
    echo -e "     ${GREEN}Cache: Enabled${NC}"
elif docker ps --format '{{.Names}}' | grep -q redis; then
    echo -e "  ${GREEN}✅ Redis${NC} (Docker)"
    echo -e "     ${GREEN}Cache: Enabled${NC}"
else
    echo -e "  ${YELLOW}⚠️  Redis${NC} - Not running"
    echo -e "     ${YELLOW}Cache: Disabled (service will still work)${NC}"
fi

echo ""
echo -e "  ${GREEN}✅ Web RAG${NC} (Brave API)"
echo -e "  ${GREEN}✅ Memory RAG${NC} (SQLite)"

echo ""

# Environment Check
echo -e "${BLUE}🔑 Environment Check:${NC}"
echo ""

check_env_var() {
    local var=$1
    local name=$2
    if [ -n "${!var}" ]; then
        VALUE="${!var}"
        # Mask API keys
        if [[ "$var" == *"API_KEY"* ]]; then
            MASKED="${VALUE:0:8}...${VALUE: -4}"
            echo -e "  ${GREEN}✅ $name${NC} ($MASKED)"
        else
            echo -e "  ${GREEN}✅ $name${NC} (${VALUE:0:50})"
        fi
    else
        echo -e "  ${RED}❌ $name${NC} - Not set"
    fi
}

# Load .env if exists
if [ -f .env ]; then
    source .env
    
    check_env_var "OPENAI_API_KEY" "OpenAI API Key"
    check_env_var "BRAVE_API_KEY" "Brave API Key"
    
    if [ -n "$ANTHROPIC_API_KEY" ]; then
        check_env_var "ANTHROPIC_API_KEY" "Anthropic API Key"
    elif [ -n "$OPENAI_API_KEY" ]; then
        echo -e "  ${GREEN}✅ LLM Provider${NC} (OpenAI)"
    else
        echo -e "  ${RED}❌ LLM Provider${NC} - No API key configured"
    fi
else
    echo -e "  ${RED}❌ .env file not found${NC}"
fi

echo ""

# Recent Logs Summary
echo -e "${BLUE}📊 Recent Log Summary:${NC}"
echo ""

if [ -f logs/gateway.log ]; then
    ERROR_COUNT=$(tail -100 logs/gateway.log | grep -i "error" | wc -l | tr -d ' ')
    if [ "$ERROR_COUNT" -gt 0 ]; then
        echo -e "  ${YELLOW}⚠️  Gateway: $ERROR_COUNT errors in last 100 lines${NC}"
    else
        echo -e "  ${GREEN}✅ Gateway: No recent errors${NC}"
    fi
fi

if [ -f logs/hybrid-rag.log ]; then
    ERROR_COUNT=$(tail -100 logs/hybrid-rag.log | grep -i "error" | wc -l | tr -d ' ')
    if [ "$ERROR_COUNT" -gt 0 ]; then
        echo -e "  ${YELLOW}⚠️  Hybrid RAG: $ERROR_COUNT errors in last 100 lines${NC}"
    else
        echo -e "  ${GREEN}✅ Hybrid RAG: No recent errors${NC}"
    fi
fi

if [ -f logs/memory-service.log ]; then
    ERROR_COUNT=$(tail -100 logs/memory-service.log | grep -i "error" | wc -l | tr -d ' ')
    if [ "$ERROR_COUNT" -gt 0 ]; then
        echo -e "  ${YELLOW}⚠️  Memory Service: $ERROR_COUNT errors in last 100 lines${NC}"
    else
        echo -e "  ${GREEN}✅ Memory Service: No recent errors${NC}"
    fi
fi

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

# Quick Test
echo -e "${BLUE}🧪 Quick Connectivity Test:${NC}"
echo ""

TEST_QUERY='{"userId":"test-user","threadId":"test-thread","query":"test"}'
HYBRID_RAG_RESPONSE=$(curl -s -X POST http://localhost:3002/v1/rag/hybrid \
    -H "Content-Type: application/json" \
    -d "$TEST_QUERY" 2>/dev/null)

if [ $? -eq 0 ] && echo "$HYBRID_RAG_RESPONSE" | grep -q "memories\|webResults\|vectorResults"; then
    echo -e "  ${GREEN}✅ Hybrid RAG endpoint responding${NC}"
else
    echo -e "  ${RED}❌ Hybrid RAG endpoint not responding${NC}"
fi

echo ""
echo -e "${CYAN}Run './start-hybrid-rag.sh' to start all services${NC}"
echo ""

