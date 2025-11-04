# Gateway Database Scripts

## migrate-database.ts

Ensures all required tables exist in the gateway database. This script is idempotent and safe to run multiple times.

### Usage

```bash
cd apps/llm-gateway
npx tsx scripts/migrate-database.ts
```

### What it does

- Creates the `artifacts` table if it doesn't exist
- Creates the `exports` table if it doesn't exist  
- Creates the `cost_tracking` table if it doesn't exist
- Creates all necessary indexes

### When to run

- After updating the codebase if you encounter database-related errors
- If you get "no such table" errors
- After a fresh clone or database reset
- As part of deployment/setup process

### Note

The database schema is automatically created when the server starts via `src/database.ts`. However, if the server was running before schema changes were added, you may need to run this migration manually to add the new tables.

