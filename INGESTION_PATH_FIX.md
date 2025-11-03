# Ingestion Database Path Fix

## Problem
The ingestion context retrieval was failing with:
```
Error: Cannot open database because the directory does not exist
Path: "../../ingestion-service/data/ingestion.db"
```

## Root Cause
The relative path `../../ingestion-service/data/ingestion.db` didn't resolve correctly from memory-service's execution context.

## Solution
Changed to absolute path resolution using `fileURLToPath` and `resolve`:

```typescript
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workspaceRoot = resolve(__dirname, '../../../../');
const defaultDbPath = resolve(workspaceRoot, 'apps/ingestion-service/data/ingestion.db');
```

## Path Calculation
- Source file: `apps/memory-service/src/ingestion/context.ts`
- `__dirname`: `apps/memory-service/src/ingestion/`
- Go up 4 levels: `../../../../` → workspace root (`/home/dp/Desktop/2.0/`)
- Then: `apps/ingestion-service/data/ingestion.db`
- Final: `/home/dp/Desktop/2.0/apps/ingestion-service/data/ingestion.db`

## Testing
After restarting memory-service, the path should resolve correctly and ingestion context should work.

## Verify Fix
1. Restart memory-service
2. Send a test query
3. Check logs - should see "Ingestion database connected" instead of path errors
4. Check for `ingestion_context` events in gateway logs

