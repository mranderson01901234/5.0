# Starting All Services

## Quick Start

### Option 1: Shell Script (Recommended)
```bash
./start.sh
```

This will:
- Check for `.env` file
- Clean up any existing processes on ports 8787, 3001, 5176
- Start all three services in the background
- Show you the PIDs and log locations
- Wait for Ctrl+C to stop everything

### Option 2: Manual Start
Start each service in separate terminals:

**Terminal 1: Gateway**
```bash
pnpm dev:gateway
```

**Terminal 2: Memory Service**
```bash
cd apps/memory-service && pnpm dev
```

**Terminal 3: Web App**
```bash
pnpm dev:web
```

## Stopping Services

### Option 1: Stop Script
```bash
./stop.sh
```

### Option 2: Manual Stop
Press `Ctrl+C` in each terminal, or kill by port:
```bash
lsof -ti:8787 | xargs kill -9  # Gateway
lsof -ti:3001 | xargs kill -9  # Memory Service
lsof -ti:5176 | xargs kill -9  # Web App
```

## Service URLs

- **Gateway**: http://localhost:8787
- **Memory Service**: http://localhost:3001
- **Web App**: http://localhost:5176

## Logs

Logs are saved to `logs/` directory:
```bash
tail -f logs/gateway.log
tail -f logs/memory-service.log
tail -f logs/web.log
```

## Prerequisites

1. **Root `.env` file** with all required API keys:
   - `OPENAI_API_KEY`
   - `BRAVE_API_KEY`
   - `CLERK_SECRET_KEY`
   - etc. (see `.env.example`)

2. **Dependencies installed**:
   ```bash
   pnpm install
   ```

3. **Redis** (for research features):
   ```bash
   # Install Redis if needed
   # Then start: redis-server
   ```

## Troubleshooting

**Port already in use:**
- The start script automatically kills existing processes
- Or manually: `lsof -ti:PORT | xargs kill -9`

**Service won't start:**
- Check logs in `logs/` directory
- Verify `.env` file exists and has required keys
- Make sure dependencies are installed: `pnpm install`

**Connection refused:**
- Verify the service is running: `lsof -ti:8787`
- Check service logs for errors
- Ensure all services are started

