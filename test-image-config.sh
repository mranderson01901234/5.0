#!/bin/bash
echo "=== Testing Image Generation Configuration ==="
echo ""
echo "1. Backend Health Check:"
curl -s http://localhost:8787/api/health | jq '.' 2>/dev/null || echo "Backend not responding"
echo ""
echo "2. Database Schema:"
cd apps/llm-gateway && sqlite3 gateway.db "SELECT sql FROM sqlite_master WHERE type='table' AND name='artifacts';" 2>/dev/null | grep -o "CHECK.*image" || echo "Database check failed"
echo ""
echo "3. Environment Variables:"
grep -E "IMAGE_GEN_ENABLED|VERTEX_AI_ACCESS_TOKEN|GCP_PROJECT_ID" .env 2>/dev/null | head -3 || echo "Check .env file"
echo ""
echo "4. Frontend Proxy Config:"
grep -A 5 "'/api':" apps/web/vite.config.ts | head -6
