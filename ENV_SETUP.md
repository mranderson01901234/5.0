# Environment Variables Setup

## Single Source of Truth: Root `.env` File

All services in this monorepo automatically load environment variables from **one single file**:

```
/.env (at the root of the project)
```

## Why This System

Previously, each service had its own `.env` file, causing confusion:
- ❌ `apps/llm-gateway/.env`
- ❌ `apps/memory-service/.env`
- ❌ `apps/web/.env`

Now:
- ✅ **One root `.env` file**
- ✅ All services automatically load from it
- ✅ No more confusion about where to put API keys

## How It Works

All services use a unified loader (`apps/shared-env-loader.ts`) that:
1. Automatically finds the root `.env` file
2. Loads all variables from it
3. Makes them available via `process.env.*`

## Required API Keys

Add these to your root `.env` file:

```bash
# LLM Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...

# Web Search
BRAVE_API_KEY=BSAiZiud_...
NEWSDATA_API_KEY=...

# Authentication
CLERK_SECRET_KEY=sk_live_...
CLERK_JWT_ISSUER=https://...

# Feature Flags
RESEARCH_SIDECAR_ENABLED=true
FEATURE_MEMORY_REVIEW_TRIGGER=true
FEATURE_RESEARCH_INJECTION=true

# Redis (if using research features)
REDIS_URL=redis://localhost:6379
```

## Local Overrides (Optional)

If you need service-specific overrides, you can still use:
- `apps/llm-gateway/.env` (for gateway-specific vars)
- `apps/memory-service/.env` (for memory-service-specific vars)

**Note:** Root `.env` values take precedence - local files are for overrides only.

## Verification

After setting up your `.env` file, restart services:
```bash
pnpm dev:gateway    # Restart gateway
cd apps/memory-service && pnpm dev  # Restart memory service
```

All services will automatically load variables from the root `.env` file.

