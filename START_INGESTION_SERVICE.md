# How to Start Ingestion Service

## Correct Command

Since you're already in the `apps/` directory:

```bash
# From apps/ directory:
cd ingestion-service
INGESTION_ENABLED=true pnpm start
```

Or from root directory:

```bash
# From root (2.0/) directory:
cd apps/ingestion-service
INGESTION_ENABLED=true pnpm start
```

## Quick Start (One Command)

From root directory:

```bash
cd /home/dp/Desktop/2.0/apps/ingestion-service && INGESTION_ENABLED=true pnpm start
```

## What to Expect

You should see:
```
[ingestion-service] Starting Ingestion Service (Phase 1: RSS Feeds)
[ingestion-db] Ingestion database schema initialized
[ingestion-config] Sources initialized count=10
[ingestion-scheduler] Scheduler initialized count=10
[ingestion-service] Ingestion service started
[ingestion-service] Health check server started port=3002
```

The service will:
- Create database at `apps/ingestion-service/data/ingestion.db`
- Start hourly scheduler
- Begin ingesting from RSS feeds within the first hour (staggered)
- Run health check server on port 3002

## Verify It's Working

```bash
# Check health endpoint
curl http://localhost:3002/health

# Check database (after some items are ingested)
sqlite3 apps/ingestion-service/data/ingestion.db "SELECT COUNT(*) FROM ingested_content;"
```

## Stop the Service

Press `Ctrl+C` to stop gracefully.

