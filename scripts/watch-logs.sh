#!/bin/bash

# Live log watcher with color-coded output
# Usage: ./scripts/watch-logs.sh [gateway|memory|all]

LOG_DIR="./logs"
mkdir -p "$LOG_DIR"

SERVICE=${1:-all}

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

# Function to colorize log lines
colorize() {
  while IFS= read -r line; do
    if echo "$line" | grep -qi "error\|failed\|exception"; then
      echo -e "${RED}$line${NC}"
    elif echo "$line" | grep -qi "warn"; then
      echo -e "${YELLOW}$line${NC}"
    elif echo "$line" | grep -qi "web.*search\|research_summary\|sources\|brave"; then
      echo -e "${CYAN}$line${NC}"
    elif echo "$line" | grep -qi "info\|success\|✓"; then
      echo -e "${GREEN}$line${NC}"
    else
      echo "$line"
    fi
  done
}

case "$SERVICE" in
  gateway)
    echo -e "${BLUE}📋 Watching LLM Gateway logs (Ctrl+C to stop)${NC}"
    echo -e "${YELLOW}Waiting for log file: $LOG_DIR/gateway.log${NC}"
    echo ""
    
    # Wait for file to exist, then tail
    while [ ! -f "$LOG_DIR/gateway.log" ]; do
      sleep 1
    done
    
    tail -f "$LOG_DIR/gateway.log" 2>/dev/null | colorize
    ;;
    
  memory)
    echo -e "${BLUE}📋 Watching Memory Service logs (Ctrl+C to stop)${NC}"
    echo -e "${YELLOW}Waiting for log file: $LOG_DIR/memory.log${NC}"
    echo ""
    
    # Wait for file to exist, then tail
    while [ ! -f "$LOG_DIR/memory.log" ]; do
      sleep 1
    done
    
    tail -f "$LOG_DIR/memory.log" 2>/dev/null | colorize
    ;;
    
  all)
    echo -e "${BLUE}📋 Watching ALL service logs (Ctrl+C to stop)${NC}"
    echo ""
    
    # Use multitail if available, otherwise use regular tail
    if command -v multitail &> /dev/null; then
      multitail -s 2 \
        -l "tail -f $LOG_DIR/gateway.log" \
        -l "tail -f $LOG_DIR/memory.log"
    else
      # Fallback: use tail with labels
      (tail -f "$LOG_DIR/gateway.log" 2>/dev/null | sed 's/^/[GATEWAY] /' | colorize) &
      (tail -f "$LOG_DIR/memory.log" 2>/dev/null | sed 's/^/[MEMORY] /' | colorize) &
      wait
    fi
    ;;
    
  *)
    echo "Usage: $0 [gateway|memory|all]"
    exit 1
    ;;
esac

