# Starting Services

## Quick Start

Run these commands in separate terminals:

### Terminal 1: Gateway (Required)
```bash
pnpm dev:gateway
```
Or:
```bash
cd apps/llm-gateway && pnpm dev
```
Listens on: `http://localhost:8787`

### Terminal 2: Memory Service (Required for research features)
```bash
cd apps/memory-service && pnpm dev
```
Listens on: `http://localhost:3001`

### Terminal 3: Web App (Frontend)
```bash
pnpm dev:web
```
Or:
```bash
cd apps/web && pnpm dev
```
Listens on: `http://localhost:5176` (or Vite's default)

## All Services Together

For a full development setup, you need all 3 services running:
1. **Gateway** - Handles chat streaming, routes to LLM providers
2. **Memory Service** - Handles research, web search, memory management
3. **Web App** - Frontend UI

## Troubleshooting

**"Connection refused" errors:**
- Check if the service is running: `lsof -ti:8787` (gateway) or `lsof -ti:3001` (memory)
- Verify the service started without errors
- Check that `.env` file has required API keys

**Port already in use:**
- Kill the process: `lsof -ti:8787 | xargs kill -9`
- Or change the port in `.env`
