# Model Configuration Audit - Imagen 4 Integration

## Current Configuration

### Default Models (from `apps/llm-gateway/config/llm-gateway.json`)
```json
{
  "models": {
    "openai": "gpt-4o-mini",
    "anthropic": "claude-3-haiku-20240307",
    "google": "gemini-2.5-flash"
  }
}
```

### API Keys Available
- ✅ `OPENAI_API_KEY` - Set
- ✅ `ANTHROPIC_API_KEY` - Set  
- ✅ `GOOGLE_API_KEY` - Set (used for Gemini API)
- ✅ `VERTEX_AI_ACCESS_TOKEN` - Set (used for Imagen 4)

## Model Selection Logic

### 1. Router Default Selection (`apps/llm-gateway/src/Router.ts`)
**Default**: `cost-optimized` → OpenAI `gpt-4o-mini`
- Lines 10-31: Model router mapping
- Line 61: Defaults to cost-optimized (OpenAI)
- **Issue**: Router always defaults to OpenAI, even if Google is preferred

**Smart Routing**:
- Large context (>50k tokens) → Google `gemini-2.0-flash-exp`
- Complex reasoning → Anthropic `claude-3-5-sonnet-20241022`
- Multimodal → Google `gemini-2.0-flash-exp`
- Web search → Cost-optimized (OpenAI)
- **Default fallback**: Cost-optimized (OpenAI)

### 2. Gatekeeper Model Selection (`apps/llm-gateway/src/gatekeeper.ts`)
**Priority**: Google → OpenAI → Anthropic
- Line 178-198: `getDefaultProviderAndModel()`
- Line 188: If `GOOGLE_API_KEY` exists → uses Google `gemini-2.5-flash` (from config)
- **Correct**: Uses config-based model selection

### 3. Memory Service Summarizer (`apps/memory-service/src/summarizer.ts`)
**Priority**: Google → OpenAI → Anthropic
- Line 17-67: `getDefaultProvider()`
- Line 45: If `GOOGLE_API_KEY` exists → uses Google model from config
- **Correct**: Uses config-based model selection

### 4. Chat Stream Endpoint (`apps/llm-gateway/src/routes.ts`)
**Provider Selection Logic**:
- Line 194-200: Checks API key availability
- Line 1500-1573: Smart routing with fallback order
- Line 1558: Fallback order: `['anthropic', 'google', 'openai']`
- **Issue**: Smart routing selects optimal model, but defaults to OpenAI if no explicit request

## Key Findings

### ✅ No Conflicts with Imagen 4
- **Imagen 4** uses `VERTEX_AI_ACCESS_TOKEN` (Vertex AI API)
- **Google Provider** uses `GOOGLE_API_KEY` (Gemini API)
- **Different APIs**: No conflict between Imagen and Gemini

### ⚠️ Potential Issues

1. **Router Defaults to OpenAI**
   - Router always defaults to `cost-optimized` (OpenAI `gpt-4o-mini`)
   - Even when Google API key is available and preferred
   - **Impact**: Chat uses OpenAI, but memories/gatekeeper use Google

2. **Inconsistent Default Provider**
   - **Chat**: Defaults to OpenAI (`cost-optimized`)
   - **Gatekeeper**: Defaults to Google (if `GOOGLE_API_KEY` exists)
   - **Memory Service**: Defaults to Google (if `GOOGLE_API_KEY` exists)
   - **Impact**: Different services may use different providers

3. **Model Name Mismatch**
   - Config: `gemini-2.5-flash`
   - Router hardcoded: `gemini-2.0-flash-exp` (for context-heavy)
   - **Impact**: Inconsistent model names

## Recommendations

### Fix 1: Make Router Respect Config Default
Update `Router.ts` to check API keys and use config-based default:

```typescript
// Instead of hardcoded default:
selectOptimalModel(...): { provider: string; model: string } {
  // ... existing logic ...
  
  // Default: Use first available provider from config
  const hasApiKey = (name: string): boolean => {
    if (name === 'openai') return !!process.env.OPENAI_API_KEY;
    if (name === 'anthropic') return !!process.env.ANTHROPIC_API_KEY;
    if (name === 'google') return !!process.env.GOOGLE_API_KEY;
    return false;
  };
  
  // Priority: google → openai → anthropic (matching gatekeeper)
  if (hasApiKey('google')) {
    return { provider: 'google', model: this.config.models.google };
  }
  if (hasApiKey('openai')) {
    return { provider: 'openai', model: this.config.models.openai };
  }
  if (hasApiKey('anthropic')) {
    return { provider: 'anthropic', model: this.config.models.anthropic };
  }
  
  // Fallback to cost-optimized
  return this.modelRouter['cost-optimized'];
}
```

### Fix 2: Standardize Model Names
Update Router hardcoded models to match config:
- Change `gemini-2.0-flash-exp` → `gemini-2.5-flash` (from config)

### Fix 3: Document Default Behavior
Add comments explaining:
- Why Router defaults to cost-optimized
- How to change default provider
- Which services use which provider

## Current State Summary

| Service | Default Provider | Model | Selection Logic |
|---------|-----------------|-------|----------------|
| **Chat Router** | OpenAI | gpt-4o-mini | Cost-optimized (hardcoded) |
| **Gatekeeper** | Google | gemini-2.5-flash | Priority: google → openai → anthropic |
| **Memory Summarizer** | Google | gemini-2.5-flash | Priority: google → openai → anthropic |
| **Image Generation** | Vertex AI | imagen-4.0-generate-001 | Uses VERTEX_AI_ACCESS_TOKEN |

## Impact on Memories

**Memories should work** because:
1. Memory service uses Google (if `GOOGLE_API_KEY` exists) ✅
2. Config has correct model: `gemini-2.5-flash` ✅
3. API key is set ✅

**If memories aren't working**, check:
1. Memory service logs for API errors
2. Google API key validity
3. Model name correctness (`gemini-2.5-flash` vs `gemini-2.0-flash-exp`)

