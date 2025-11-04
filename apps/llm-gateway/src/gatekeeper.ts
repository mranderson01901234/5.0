// Phase 1 implementation
// Gatekeeper classifier for determining when to create artifacts vs chat-only responses

import { logger } from './log.js';
import { getFeatureFlags } from './featureFlags.js';
import { providerPool } from './ProviderPool.js';
import { loadConfig } from './config.js';
import type { GatekeeperRequest as GatekeeperInput, GatekeeperResponse as GatekeeperOutput } from '@llm-gateway/shared';

// Simple in-memory cache with 5-minute TTL
const cache = new Map<string, { result: GatekeeperOutput; expires: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Keyword patterns per TRIGGER_SPEC.md
const TABLE_KEYWORDS = [
  /create\s+(a\s+)?table/i,
  /make\s+(a\s+)?table/i,
  /generate\s+(a\s+)?table/i,
  /list\s+in\s+(a\s+)?table/i,
  /show\s+as\s+table/i,
  /format\s+as\s+table/i,
  /comparison\s+table/i,
  /comparison\s+chart/i,
  /data\s+table/i,
  /results\s+table/i,
  /\bwith\s+columns\b/i,
  /\bwith\s+rows\b/i,
  /\bcompare\b.*\bvs\b/i,
];

const DOC_KEYWORDS = [
  /create\s+(a\s+)?document/i,
  /write\s+(a\s+)?document/i,
  /generate\s+(a\s+)?document/i,
  /\bdraft\b/i,
  /\bmemo\b/i,
  /\breport\b/i,
  /\bletter\b/i,
  /\bessay\b/i,
  /\bwith\s+sections\b/i,
  /structured\s+document/i,
  /save\s+as\s+document/i,
  /export\s+as\s+document/i,
  /\bproposal\b/i,
  /summary\s+document/i,
  /analysis\s+document/i,
];

const SHEET_KEYWORDS = [
  /create\s+(a\s+)?spreadsheet/i,
  /make\s+(a\s+)?spreadsheet/i,
  /generate\s+(a\s+)?spreadsheet/i,
  /\bexcel\b/i,
  /google\s+sheets/i,
  /\bcsv\b/i,
  /\bwith\s+sheets\b/i,
  /multiple\s+tabs/i,
  /\bworksheet\b/i,
  /budget\s+spreadsheet/i,
  /tracker\s+spreadsheet/i,
  /\bbudget\b/i,
  /expense\s+tracker/i,
  /\broster\b/i,
];

const IMAGE_KEYWORDS = [
  /generate\s+an?\s+image/i,
  /create\s+an?\s+image/i,
  /draw\s+an?\s+image/i,
  /render\s+an?\s+image/i,
  /photorealistic/i,
  /logo\s+for/i,
  /illustration\s+of/i,
  /drawing\s+of/i,
  /picture\s+of/i,
  /generate\s+a\s+logo/i,
  /create\s+a\s+logo/i,
  /isometric/i,
  /neon/i,
  /mascot/i,
];

const NEGATIVE_PATTERNS = [
  /^what\s+is/i,
  /^how\s+does/i,
  /^why\b/i,
  /^thanks/i,
  /^hello/i,
  /^tell\s+me\s+about/i,
  /\bwrite\s+code\b/i,
  /\bdebug\b/i,
  /\bexplain\s+this\s+code\b/i,
  /^yes\s*$/i,
  /^no\s*$/i,
  /^maybe\s*$/i,
];

/**
 * Compute cache key from input
 */
function getCacheKey(input: GatekeeperInput): string {
  const text = input.userText.toLowerCase().trim();
  return `${input.userId}:${input.threadId}:${text.substring(0, 100)}`;
}

/**
 * Fast keyword matching to determine artifact type and base confidence
 */
function matchKeywords(text: string): { type: "table" | "doc" | "sheet" | "image" | null; confidence: number; rationale: string } {
  const lowerText = text.toLowerCase();
  
  // Check negative patterns first
  for (const pattern of NEGATIVE_PATTERNS) {
    if (pattern.test(text)) {
      return { type: null, confidence: 0.0, rationale: "Negative trigger: simple question or conversational" };
    }
  }
  
  // Count matches per type
  let tableMatches = 0;
  let docMatches = 0;
  let sheetMatches = 0;
  let imageMatches = 0;
  
  for (const pattern of TABLE_KEYWORDS) {
    if (pattern.test(text)) tableMatches++;
  }
  
  for (const pattern of DOC_KEYWORDS) {
    if (pattern.test(text)) docMatches++;
  }
  
  for (const pattern of SHEET_KEYWORDS) {
    if (pattern.test(text)) sheetMatches++;
  }
  
  for (const pattern of IMAGE_KEYWORDS) {
    if (pattern.test(text)) imageMatches++;
  }
  
  // Determine type based on highest match count
  const maxMatches = Math.max(tableMatches, docMatches, sheetMatches, imageMatches);
  
  if (maxMatches === 0) {
    // Ambiguous: check for structured data hints
    if (/\bwith\s+columns?\b/i.test(text) || /\bcolumns?\s*:/i.test(text)) {
      return { type: "table", confidence: 0.65, rationale: "Medium confidence: mentions columns" };
    }
    if (/\bwith\s+sections?\b/i.test(text)) {
      return { type: "doc", confidence: 0.65, rationale: "Medium confidence: mentions sections" };
    }
    if (/\bwith\s+sheets?\b/i.test(text) || /\bmultiple\s+tabs?\b/i.test(text)) {
      return { type: "sheet", confidence: 0.65, rationale: "Medium confidence: mentions multiple sheets" };
    }
    // Very low confidence for ambiguous cases
    return { type: null, confidence: 0.3, rationale: "Ambiguous: no clear artifact pattern" };
  }
  
  // High confidence if multiple keywords match
  const confidence = maxMatches >= 2 ? 0.9 : 0.75;
  
  if (imageMatches > tableMatches && imageMatches > docMatches && imageMatches > sheetMatches) {
    return { type: "image", confidence, rationale: `High confidence: ${imageMatches} image keyword(s) matched` };
  }
  if (tableMatches >= docMatches && tableMatches >= sheetMatches) {
    return { type: "table", confidence, rationale: `High confidence: ${tableMatches} table keyword(s) matched` };
  }
  if (docMatches >= sheetMatches) {
    return { type: "doc", confidence, rationale: `High confidence: ${docMatches} document keyword(s) matched` };
  }
  return { type: "sheet", confidence, rationale: `High confidence: ${sheetMatches} spreadsheet keyword(s) matched` };
}

/**
 * Get default provider and model based on available API keys
 * Priority: google → openai → anthropic
 */
function getDefaultProviderAndModel(): { provider: 'google' | 'openai' | 'anthropic' | null; model: string } {
  const config = loadConfig();
  const hasApiKey = (name: string): boolean => {
    if (name === 'openai') return !!process.env.OPENAI_API_KEY;
    if (name === 'anthropic') return !!process.env.ANTHROPIC_API_KEY;
    if (name === 'google') return !!process.env.GOOGLE_API_KEY;
    return false;
  };
  
  // Priority: google → openai → anthropic
  if (hasApiKey('google')) {
    return { provider: 'google', model: config.models.google };
  }
  if (hasApiKey('openai')) {
    return { provider: 'openai', model: config.models.openai };
  }
  if (hasApiKey('anthropic')) {
    return { provider: 'anthropic', model: config.models.anthropic };
  }
  
  return { provider: null, model: '' };
}

/**
 * Call lightweight LLM to refine ambiguous decisions
 */
async function refineWithLLM(
  text: string,
  initialConfidence: number,
  thresholds: { high: number; med: number }
): Promise<{ confidence: number; rationale: string; type: "table" | "doc" | "sheet" | "image" | null }> {
  const config = loadConfig();
  // Use singleton providerPool instance (idempotent prepare)
  await providerPool.prepare();
  
  // Get default provider/model (priority: google → openai → anthropic)
  const { provider: defaultProvider, model: defaultModel } = getDefaultProviderAndModel();
  
  if (!defaultProvider) {
    logger.warn('No API keys available for gatekeeper LLM call');
    return { confidence: initialConfidence, rationale: "LLM unavailable, using keyword match", type: null };
  }
  
  const provider = providerPool.getProvider(defaultProvider);
  if (!provider) {
    logger.warn({ provider: defaultProvider }, 'Provider not available for gatekeeper LLM call');
    return { confidence: initialConfidence, rationale: "LLM unavailable, using keyword match", type: null };
  }
  
  logger.debug({ provider: defaultProvider, model: defaultModel }, 'Using default provider for gatekeeper refinement');
  
  const fewShotPrompt = `You are an intent classifier. Determine if the user wants to create a structured artifact (table/document/spreadsheet/image) or just chat.

Examples:
Q: "Create a table comparing iPhone 14/15/16 with columns Model, Price, Storage"
A: {"shouldCreate": true, "type": "table", "confidence": 0.9, "rationale": "Explicit table request with structured data"}

Q: "Write a project proposal with sections Overview, Timeline, Budget"
A: {"shouldCreate": true, "type": "doc", "confidence": 0.9, "rationale": "Explicit document request with sections"}

Q: "Generate an isometric neon robot mascot for a tech company"
A: {"shouldCreate": true, "type": "image", "confidence": 0.9, "rationale": "Explicit image generation request"}

Q: "What is machine learning?"
A: {"shouldCreate": false, "type": null, "confidence": 0.1, "rationale": "Simple question, no artifact needed"}

Q: "${text.substring(0, 200)}"
A:`;
  
  try {
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('LLM timeout')), 500);
    });
    
    // Call LLM with timeout using default provider/model
    const stream = provider.stream(
      [{ role: 'user', content: fewShotPrompt }],
      defaultModel,
      { max_tokens: 100, temperature: 0.3 }
    );
    
    const llmPromise = (async () => {
      let response = '';
      for await (const chunk of stream) {
        response += chunk;
      }
      return response.trim();
    })();
    
    const response = await Promise.race([llmPromise, timeoutPromise]);
    
    // Parse JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          confidence: Math.max(0, Math.min(1, parsed.confidence || initialConfidence)),
          rationale: parsed.rationale || "LLM validated",
          type: parsed.shouldCreate ? (parsed.type || null) : null,
        };
      } catch {
        // Fall through to default
      }
    }
    
    // If JSON parsing fails, use initial confidence
    return { confidence: initialConfidence, rationale: "LLM response invalid, using keyword match", type: null };
  } catch (error) {
    logger.debug({ error: error instanceof Error ? error.message : String(error), provider: defaultProvider }, 'LLM call failed or timed out, trying fallback');
    
    // Try fallback provider if primary failed
    if (defaultProvider === 'google' && process.env.OPENAI_API_KEY) {
      logger.debug('Trying OpenAI as fallback for gatekeeper');
      const fallbackProvider = providerPool.getProvider('openai');
      if (fallbackProvider) {
        try {
          const stream = fallbackProvider.stream(
            [{ role: 'user', content: fewShotPrompt }],
            config.models.openai || 'gpt-4o-mini',
            { max_tokens: 100, temperature: 0.3 }
          );
          const llmPromise = (async () => {
            let response = '';
            for await (const chunk of stream) {
              response += chunk;
            }
            return response.trim();
          })();
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('LLM timeout')), 500);
          });
          const response = await Promise.race([llmPromise, timeoutPromise]);
          const jsonMatch = response.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[0]);
              return {
                confidence: Math.max(0, Math.min(1, parsed.confidence || initialConfidence)),
                rationale: parsed.rationale || "LLM validated (fallback)",
                type: parsed.shouldCreate ? (parsed.type || null) : null,
              };
            } catch {
              // Fall through
            }
          }
        } catch {
          // Fall through to keyword match
        }
      }
    } else if (defaultProvider === 'openai' && process.env.GOOGLE_API_KEY) {
      logger.debug('Trying Google as fallback for gatekeeper');
      const fallbackProvider = providerPool.getProvider('google');
      if (fallbackProvider) {
        try {
          const stream = fallbackProvider.stream(
            [{ role: 'user', content: fewShotPrompt }],
            config.models.google || 'gemini-2.5-flash',
            { max_tokens: 100, temperature: 0.3 }
          );
          const llmPromise = (async () => {
            let response = '';
            for await (const chunk of stream) {
              response += chunk;
            }
            return response.trim();
          })();
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('LLM timeout')), 500);
          });
          const response = await Promise.race([llmPromise, timeoutPromise]);
          const jsonMatch = response.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[0]);
              return {
                confidence: Math.max(0, Math.min(1, parsed.confidence || initialConfidence)),
                rationale: parsed.rationale || "LLM validated (fallback)",
                type: parsed.shouldCreate ? (parsed.type || null) : null,
              };
            } catch {
              // Fall through
            }
          }
        } catch {
          // Fall through to keyword match
        }
      }
    }
    
    return { confidence: initialConfidence, rationale: "LLM timeout/error, using keyword match", type: null };
  }
}

/**
 * Classify user intent to determine if artifact should be created
 * @param input User text and conversation context
 * @returns Gatekeeper decision with confidence score
 */
export async function classifyArtifactIntent(
  input: GatekeeperInput
): Promise<GatekeeperOutput> {
  const startTime = Date.now();
  
  // Check feature flags
  const flags = await getFeatureFlags(input.userId);
  if (!flags.gatekeeperEnabled) {
    const latencyMs = Date.now() - startTime;
    logger.info({
      event: 'gatekeeper_decision',
      userId: input.userId,
      threadId: input.threadId,
      userText: input.userText.substring(0, 200),
      shouldCreate: false,
      type: null,
      confidence: 0,
      rationale: "Feature disabled",
      latencyMs,
      cached: false,
      timestamp: Date.now(),
    });
    return {
      shouldCreate: false,
      type: null,
      rationale: "Feature disabled",
      confidence: 0,
    };
  }
  
  // Check cache
  const cacheKey = getCacheKey(input);
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    const latencyMs = Date.now() - startTime;
    logger.info({
      event: 'gatekeeper_decision',
      userId: input.userId,
      threadId: input.threadId,
      userText: input.userText.substring(0, 200),
      shouldCreate: cached.result.shouldCreate,
      type: cached.result.type,
      confidence: cached.result.confidence,
      rationale: cached.result.rationale.substring(0, 100),
      latencyMs,
      cached: true,
      timestamp: Date.now(),
    });
    return cached.result;
  }
  
  // Step 1: Fast keyword matching
  const keywordMatch = matchKeywords(input.userText);
  let { type, confidence, rationale } = keywordMatch;
  
  // Step 2: If ambiguous (between med and high), call LLM
  if (confidence >= flags.thresholds.med && confidence < flags.thresholds.high && type !== null) {
    const llmResult = await refineWithLLM(input.userText, confidence, flags.thresholds);
    confidence = llmResult.confidence;
    rationale = llmResult.rationale;
    if (llmResult.type) {
      type = llmResult.type;
    }
  }
  
  // Step 3: Apply thresholds
  let shouldCreate = false;
  if (confidence >= flags.thresholds.high) {
    shouldCreate = true;
  } else if (confidence >= flags.thresholds.med && confidence < flags.thresholds.high) {
    shouldCreate = true; // Mark for confirmation (decisionLevel can be added later)
  } else {
    shouldCreate = false;
    type = null;
  }
  
  const result: GatekeeperOutput = {
    shouldCreate,
    type,
    rationale: rationale.substring(0, 100),
    confidence: Math.max(0, Math.min(1, confidence)),
  };
  
  // Cache result
  cache.set(cacheKey, {
    result,
    expires: Date.now() + CACHE_TTL_MS,
  });
  
  // Clean up expired cache entries (simple cleanup)
  if (cache.size > 1000) {
    const now = Date.now();
    for (const [key, value] of cache.entries()) {
      if (value.expires <= now) {
        cache.delete(key);
      }
    }
  }
  
  const latencyMs = Date.now() - startTime;
  
  // Emit telemetry event per EVENTS.md
  logger.info({
    event: 'gatekeeper_decision',
    userId: input.userId,
    threadId: input.threadId,
    userText: input.userText.substring(0, 200),
    shouldCreate: result.shouldCreate,
    type: result.type,
    confidence: result.confidence,
    rationale: result.rationale.substring(0, 100),
    latencyMs,
    cached: false,
    timestamp: Date.now(),
  });
  
  return result;
}
