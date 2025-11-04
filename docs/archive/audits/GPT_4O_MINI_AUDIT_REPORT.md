# GPT-4o-mini Implementation Audit Report

**Date**: 2025-01-27  
**Scope**: Audit of gpt-4o-mini implementation to understand how to add other models as default while maintaining all features  
**Issue**: User switched to gemini-2.5-flash and noticed missing memory features

---

## Executive Summary

The audit reveals that **memory events work for ALL models** - they are not model-specific. However, there are several hardcoded references to `gpt-4o-mini` throughout the codebase that could cause issues when switching default models. The main problem is that the **Router** class defaults to `gpt-4o-mini` for cost-optimized routing, which may bypass the configured default model.

---

## Memory Events Implementation

### ✅ Memory Events Work for All Models

**Location**: `apps/llm-gateway/src/routes.ts:1932-1977`

Memory events are **NOT model-specific**. They are controlled by a feature flag and emitted for all models:

```typescript
if (config.flags.memoryEvents) {
  // Emit user messages
  for (const msg of body.messages) {
    emitMessageEvent(userEvent).catch(() => {}); // Fire-and-forget
  }
  
  // Emit assistant response
  if (assistantContent) {
    emitMessageEvent(assistantEvent).catch(() => {}); // Fire-and-forget
  }
}
```

**Key Finding**: Memory events are emitted regardless of which model/provider is used. The issue reported by the user is likely **NOT** due to model-specific code, but possibly:
1. Feature flag `memoryEvents` is disabled
2. Memory service is not running/accessible
3. Network issues preventing event delivery

**Configuration**: `apps/llm-gateway/config/llm-gateway.json`
```json
{
  "flags": {
    "memoryEvents": true  // ← Controls memory events for ALL models
  }
}
```

---

## Hardcoded gpt-4o-mini References

### 1. Router.ts - Cost-Optimized & Fallback Routes

**Location**: `apps/llm-gateway/src/Router.ts:10-31`

**Issue**: Hardcoded `gpt-4o-mini` as the default for cost-optimized routing:

```typescript
private modelRouter = {
  'cost-optimized': {
    provider: 'openai' as const,
    model: 'gpt-4o-mini'  // ← HARDCODED
  },
  'fallback': {
    provider: 'openai' as const,
    model: 'gpt-4o-mini'  // ← HARDCODED
  },
  // ...
};
```

**Impact**: When `router.selectOptimalModel()` is called (lines 1476-1484 in routes.ts), it defaults to `cost-optimized` which forces `gpt-4o-mini` even if the config specifies a different default model.

**Fix Needed**: Router should use `config.models.openai` instead of hardcoded `gpt-4o-mini`, or better yet, use config-based defaults for all routing strategies.

---

### 2. CostTracker.ts - Pricing Rates & Fallback

**Location**: `apps/llm-gateway/src/CostTracker.ts:64-133`

**Issue**: Hardcoded pricing rates and fallback to `gpt-4o-mini`:

```typescript
private modelRates = {
  'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },
  'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gemini-2.0-flash-exp': { input: 0.000075, output: 0.0003 }
  // ← Missing: gemini-2.5-flash pricing
};

private calculateCost(usage: UsageData): CostData {
  const rates = this.modelRates[usage.model as keyof typeof this.modelRates] 
    || this.modelRates['gpt-4o-mini'];  // ← Falls back to gpt-4o-mini
  // ...
}
```

**Impact**: 
- `gemini-2.5-flash` pricing is **missing** - cost tracking will use `gpt-4o-mini` rates as fallback
- Cost reports may be inaccurate for gemini-2.5-flash

**Fix Needed**: Add `gemini-2.5-flash` pricing rates and potentially use a more generic fallback strategy.

---

### 3. Memory Service Summarizer - Hardcoded Model

**Location**: `apps/memory-service/src/summarizer.ts:23-24`

**Issue**: Hardcoded `gpt-4o-mini` for conversation summarization:

```typescript
// Use gpt-4o-mini for cheap, fast summaries
const model = 'gpt-4o-mini';  // ← HARDCODED
```

**Impact**: Memory service always uses `gpt-4o-mini` for summaries, regardless of configured default model. This may require OpenAI API key even if you're using Gemini as default.

**Fix Needed**: Make summarizer model configurable via environment variable or config file.

---

### 4. Gatekeeper LLM Refinement - Hardcoded with Fallback

**Location**: `apps/llm-gateway/src/gatekeeper.ts:219`

**Issue**: Uses `gpt-4o-mini` for LLM-based intent refinement:

```typescript
const stream = provider.stream(
  [{ role: 'user', content: fewShotPrompt }],
  config.models.openai || 'gpt-4o-mini',  // ← Has fallback but still defaults to OpenAI
  { max_tokens: 100, temperature: 0.3 }
);
```

**Impact**: Gatekeeper refinement always uses OpenAI provider, even if default model is Gemini. This requires OpenAI API key.

**Fix Needed**: Should use config-based default model or allow provider selection.

---

### 5. Hybrid RAG Query Expansion - Hardcoded Model

**Location**: `sidecar-hybrid-rag/src/config.ts:63`

**Issue**: Hardcoded `gpt-4o-mini` for query expansion:

```typescript
queryExpansionModel: process.env.QUERY_EXPANSION_MODEL || 'gpt-4o-mini',
```

**Impact**: Query expansion defaults to `gpt-4o-mini` unless environment variable is set.

**Fix Needed**: Can be configured via env var, but should default to config-based default model.

---

### 6. IntelligentModelRouter - Capabilities Definition

**Location**: `apps/llm-gateway/src/IntelligentModelRouter.ts:85-101`

**Status**: ✅ **Properly Configured**

The IntelligentModelRouter has `gemini-2.5-flash` capabilities defined:

```typescript
'gemini-2.5-flash': {
  maxTokens: 16384,
  contextWindow: 1000000,
  costPer1kTokens: { input: 0.0001, output: 0.0004 },
  strengths: ['large-context', 'multimodal', 'cost-efficiency', 'speed'],
  latencyMs: 900,
  qualityScore: 9.0
}
```

**Note**: However, routing rules still reference `gpt-4o-mini` for simple tasks (line 113).

---

## Default Model Selection Flow

### Current Flow (routes.ts:1476-1493)

When no provider/model is explicitly requested:

1. **Smart Routing**: Calls `router.selectOptimalModel()` which defaults to `cost-optimized` → `gpt-4o-mini`
2. **Fallback Chain**: Falls back through providers in order: anthropic → google → openai
3. **Config Usage**: Uses `config.models[provider]` for fallback models

**Problem**: The smart routing defaults to `gpt-4o-mini` before checking config defaults.

---

## Features That Work for All Models

These features are **model-agnostic** and work with any provider/model:

✅ **Memory Events** - Controlled by `memoryEvents` flag  
✅ **Fast Response (FR)** - Works with any provider  
✅ **Context Trimming** - Provider-agnostic  
✅ **Web Search** - Independent of model selection  
✅ **Artifact Creation** - Works with any model  
✅ **Cost Tracking** - Works but may use wrong rates (see CostTracker issue)  
✅ **Database Storage** - Stores messages regardless of model  

---

## Features That Are Model-Specific

These features have hardcoded references to specific models:

⚠️ **Conversation Summarization** - Uses `gpt-4o-mini` (memory-service)  
⚠️ **Gatekeeper LLM Refinement** - Uses OpenAI provider  
⚠️ **Query Expansion** - Defaults to `gpt-4o-mini`  
⚠️ **Smart Routing Default** - Defaults to `gpt-4o-mini` for cost-optimized  

---

## Configuration Points

### Primary Config: `apps/llm-gateway/config/llm-gateway.json`

```json
{
  "models": {
    "openai": "gpt-4o-mini",
    "anthropic": "claude-3-haiku-20240307",
    "google": "gemini-2.5-flash"  // ← User's configured default
  }
}
```

**Issue**: This config is used for fallback providers, but smart routing may bypass it.

---

## Recommendations

### Critical Fixes Needed

1. **Router.ts**: Make `cost-optimized` and `fallback` use config-based defaults instead of hardcoded `gpt-4o-mini`
2. **CostTracker.ts**: Add `gemini-2.5-flash` pricing rates
3. **Summarizer.ts**: Make summarizer model configurable (use env var or config)

### Nice-to-Have Fixes

4. **Gatekeeper.ts**: Allow using configured default model instead of always OpenAI
5. **IntelligentModelRouter**: Update routing rules to use config defaults

### To Verify Memory Events Issue

1. Check `config.flags.memoryEvents` is `true`
2. Verify memory-service is running and accessible at `MEMORY_SERVICE_URL`
3. Check network connectivity between gateway and memory-service
4. Review memory-service logs for received events

---

## Model-Specific Differences

### Provider Differences

- **OpenAI**: Standard message format, system messages in array
- **Google**: Requires `systemInstruction` field (separate from contents array)
- **Anthropic**: Standard message format

**Status**: ✅ All providers properly handle these differences in their respective provider classes.

### Token Limits

- **OpenAI**: 16384 max output tokens (config)
- **Anthropic**: 4096 max output tokens (config)
- **Google**: 8192 max output tokens (config) ← **Note**: Config says 8192, but gemini-2.5-flash can handle more

**Potential Issue**: `maxOutputTokensPerProvider.google` is set to 8192, but gemini-2.5-flash can handle 16384 per IntelligentModelRouter capabilities.

---

## Summary

**Memory events should work for gemini-2.5-flash** - they are not model-specific. The issue is likely:
1. Configuration/network issue, OR
2. Missing cost tracking rates causing confusion, OR
3. Smart routing defaulting to gpt-4o-mini despite config

**To fully support gemini-2.5-flash as default**, these changes are needed:
1. Router.ts: Use config defaults instead of hardcoded models
2. CostTracker.ts: Add gemini-2.5-flash pricing
3. Summarizer.ts: Make model configurable
4. Review maxOutputTokensPerProvider.google (currently 8192, but gemini-2.5-flash supports 16384)

