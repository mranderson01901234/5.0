#!/bin/bash

# Start services with log files for easy tailing
# Creates logs directory and redirects stdout/stderr to files

LOG_DIR="./logs"
mkdir -p "$LOG_DIR"

echo "🚀 Starting services with log files..."
echo "📁 Logs directory: $LOG_DIR"
echo ""
echo "To tail logs in separate terminals:"
echo "  Terminal 1: tail -f $LOG_DIR/gateway.log"
echo "  Terminal 2: tail -f $LOG_DIR/memory.log"
echo ""
echo "Or use: ./scripts/tail-logs.sh all"
echo ""

# Start LLM Gateway
echo "Starting LLM Gateway..."
cd apps/llm-gateway
pnpm dev > "../../$LOG_DIR/gateway.log" 2>&1 &
GATEWAY_PID=$!
echo "Gateway started (PID: $GATEWAY_PID)"
cd ../..

# Start Memory Service
echo "Starting Memory Service..."
cd apps/memory-service
pnpm dev > "../../$LOG_DIR/memory.log" 2>&1 &
MEMORY_PID=$!
echo "Memory Service started (PID: $MEMORY_PID)"
cd ../..

echo ""
echo "✅ Services started!"
echo ""
echo "To stop services:"
echo "  kill $GATEWAY_PID $MEMORY_PID"
echo ""
echo "Log files:"
echo "  - $LOG_DIR/gateway.log"
echo "  - $LOG_DIR/memory.log"

# Wait for interrupt
trap "kill $GATEWAY_PID $MEMORY_PID 2>/dev/null; exit" INT TERM
wait

