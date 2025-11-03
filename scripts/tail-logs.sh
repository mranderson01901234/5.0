#!/bin/bash

# Tail logs for web search debugging
# Usage: ./scripts/tail-logs.sh [service]
# Services: gateway, memory, web, all

SERVICE=${1:-all}

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Log file locations (if you redirect output)
LOG_DIR="${LOG_DIR:-./logs}"
mkdir -p "$LOG_DIR"

case "$SERVICE" in
  gateway|llm-gateway)
    echo -e "${BLUE}📋 Tailing LLM Gateway logs...${NC}"
    echo -e "${YELLOW}If running with pnpm dev, use:${NC}"
    echo "  pnpm --filter @llm-gateway/app dev 2>&1 | tee $LOG_DIR/gateway.log"
    echo ""
    echo -e "${BLUE}Or if log file exists:${NC}"
    tail -f "$LOG_DIR/gateway.log" 2>/dev/null || echo "No log file found at $LOG_DIR/gateway.log"
    ;;
  memory|memory-service)
    echo -e "${BLUE}📋 Tailing Memory Service logs...${NC}"
    echo -e "${YELLOW}If running with pnpm dev, use:${NC}"
    echo "  pnpm --filter @memory-service/app dev 2>&1 | tee $LOG_DIR/memory.log"
    echo ""
    echo -e "${BLUE}Or if log file exists:${NC}"
    tail -f "$LOG_DIR/memory.log" 2>/dev/null || echo "No log file found at $LOG_DIR/memory.log"
    ;;
  web)
    echo -e "${BLUE}📋 Tailing Web app logs (browser console)...${NC}"
    echo -e "${YELLOW}Web app logs go to browser console.${NC}"
    echo -e "${YELLOW}Open DevTools (F12) to see logs.${NC}"
    ;;
  all)
    echo -e "${BLUE}📋 Tailing all service logs...${NC}"
    echo ""
    echo -e "${GREEN}=== LLM Gateway ==="${NC}"
    tail -f "$LOG_DIR/gateway.log" 2>/dev/null &
    GATEWAY_PID=$!
    
    echo -e "${GREEN}=== Memory Service ==="${NC}"
    tail -f "$LOG_DIR/memory.log" 2>/dev/null &
    MEMORY_PID=$!
    
    wait $GATEWAY_PID $MEMORY_PID
    ;;
  *)
    echo "Usage: $0 [gateway|memory|web|all]"
    exit 1
    ;;
esac

