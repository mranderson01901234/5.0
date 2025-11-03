# Why Ingestion Count is 0

## The Situation

When you checked:
```bash
sqlite3 apps/ingestion-service/data/ingestion.db "SELECT COUNT(*) FROM ingested_content;"
# Result: 0
```

This means **no items have been ingested yet** by the automated scheduler.

## Why This Happens

### 1. **Staggered Initial Schedule**

The ingestion service uses a **staggered scheduling** approach:
- When the service starts, each of the 10 RSS sources gets a **random delay** between 0-60 minutes
- This spreads the load across the first hour
- Sources process **maximum 2 per minute** to avoid spikes

**Example:**
- Source 1 might run at 0 minutes
- Source 2 might run at 15 minutes  
- Source 3 might run at 37 minutes
- etc.

### 2. **Service Must Be Running**

The scheduler only works when the service is actively running. If you:
- Started the service but then stopped it
- Or haven't started it at all
- Then nothing will be ingested

### 3. **Check Status**

To see what's scheduled:
```bash
# Check if service is running
ps aux | grep ingestion

# Check source status
sqlite3 apps/ingestion-service/data/ingestion.db \
  "SELECT id, name, enabled, last_fetch_at, success_count FROM sources;"
```

If `last_fetch_at` is NULL, that source hasn't run yet.

## Solution: Manual Test (Already Done!)

I just ran a manual test and it worked! The test script ingested **20 items** from Hacker News:

```bash
cd apps/ingestion-service
pnpm exec tsx src/test-ingestion.ts hackernews
```

**Result:** ✅ 20 items ingested successfully

Now check again:
```bash
sqlite3 apps/ingestion-service/data/ingestion.db "SELECT COUNT(*) FROM ingested_content;"
# Should show: 20 (or more if service has run)
```

## To Get Automated Ingestion Running

### Option 1: Wait for Scheduled Time

If the service is running, it will automatically ingest within the first hour (staggered).

### Option 2: Manually Trigger All Sources

You can manually trigger ingestion for testing:
```bash
cd apps/ingestion-service

# Test a specific source
pnpm exec tsx src/test-ingestion.ts hackernews
pnpm exec tsx src/test-ingestion.ts techcrunch
pnpm exec tsx src/test-ingestion.ts theverge
# etc.
```

### Option 3: Start Service and Wait

```bash
cd apps/ingestion-service
INGESTION_ENABLED=true pnpm start
# Leave it running - it will process sources automatically
```

## Verify It's Working

After some time (or manual triggers):

```bash
# Count total items
sqlite3 apps/ingestion-service/data/ingestion.db "SELECT COUNT(*) FROM ingested_content;"

# See recent items
sqlite3 apps/ingestion-service/data/ingestion.db \
  "SELECT title, category, ingested_at FROM ingested_content ORDER BY ingested_at DESC LIMIT 10;"

# Check source stats
sqlite3 apps/ingestion-service/data/ingestion.db \
  "SELECT name, last_fetch_at, success_count, failure_count FROM sources;"
```

## Expected Behavior

Once working:
- **Per hour**: 50-200 items (depends on RSS feed activity)
- **Per day**: 500-2,000 items
- **Storage**: ~50-200 MB/month

The count of 0 just means either:
1. Service hasn't run long enough (needs up to 1 hour for first ingestion)
2. Service isn't currently running
3. Sources are still waiting for their scheduled time

**The test proved the code works** - now you just need the service running for automated ingestion!

