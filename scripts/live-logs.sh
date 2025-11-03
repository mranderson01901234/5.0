#!/bin/bash

# Simple live log watcher - just tail the logs
# Best for quick debugging

LOG_DIR="./logs"

# Show help
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
  echo "Live Log Watcher"
  echo ""
  echo "Usage: $0 [gateway|memory|both]"
  echo ""
  echo "Examples:"
  echo "  $0 gateway   # Watch LLM Gateway logs"
  echo "  $0 memory    # Watch Memory Service logs"
  echo "  $0 both      # Watch both (split terminal recommended)"
  echo ""
  echo "Prerequisites:"
  echo "  - Services must be running with output redirected to logs/"
  echo "  - Or use: ./scripts/start-services-with-logs.sh"
  exit 0
fi

SERVICE=${1:-both}

case "$SERVICE" in
  gateway)
    echo "📋 Watching LLM Gateway logs..."
    tail -f "$LOG_DIR/gateway.log" 2>/dev/null || echo "⚠️  No log file found. Start service with: cd apps/llm-gateway && pnpm dev 2>&1 | tee ../../logs/gateway.log"
    ;;
  memory)
    echo "📋 Watching Memory Service logs..."
    tail -f "$LOG_DIR/memory.log" 2>/dev/null || echo "⚠️  No log file found. Start service with: cd apps/memory-service && pnpm dev 2>&1 | tee ../../logs/memory.log"
    ;;
  both)
    echo "📋 Watching BOTH services (use Ctrl+C to stop)..."
    echo ""
    echo "Gateway logs (top):"
    echo "Memory logs (bottom):"
    echo ""
    
    # Use tail -f on both files
    tail -f "$LOG_DIR/gateway.log" "$LOG_DIR/memory.log" 2>/dev/null || {
      echo "⚠️  Log files not found!"
      echo ""
      echo "Start services with logging:"
      echo "  ./scripts/start-services-with-logs.sh"
      echo ""
      echo "Or manually:"
      echo "  Terminal 1: cd apps/llm-gateway && pnpm dev 2>&1 | tee ../../logs/gateway.log"
      echo "  Terminal 2: cd apps/memory-service && pnpm dev 2>&1 | tee ../../logs/memory.log"
    }
    ;;
  *)
    echo "Invalid option: $SERVICE"
    echo "Use: gateway, memory, or both"
    exit 1
    ;;
esac

