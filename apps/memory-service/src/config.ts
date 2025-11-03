/**
 * Research configuration with graceful degradation
 */

import { pino } from 'pino';

const logger = pino({ name: 'config' });

export interface ResearchConfig {
  enabled: boolean;
  memoryReviewTrigger: boolean;
  researchInjection: boolean;
  newsdataFallback: boolean;
  braveApiKey: string | null;
  newsdataApiKey: string | null;
  redisUrl: string;
}

let config: ResearchConfig | null = null;
let configInitialized = false;

/**
 * Initialize and validate research configuration
 * Logs warnings for missing keys and disables features gracefully
 */
export function loadResearchConfig(): ResearchConfig {
  if (configInitialized && config) {
    return config;
  }

  const enabled = process.env.RESEARCH_SIDECAR_ENABLED === 'true';
  const memoryReviewTrigger = process.env.FEATURE_MEMORY_REVIEW_TRIGGER !== 'false';
  const researchInjection = process.env.FEATURE_RESEARCH_INJECTION !== 'false';
  const newsdataFallback = process.env.FEATURE_NEWSDATA_FALLBACK === 'true';

  const braveApiKey = process.env.BRAVE_API_KEY || null;
  const newsdataApiKey = process.env.NEWSDATA_API_KEY || null;
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  // Validation and graceful degradation
  let hasWarnings = false;

  if (enabled) {
    if (!braveApiKey) {
      logger.warn('RESEARCH_SIDECAR_ENABLED=true but BRAVE_API_KEY missing. Research disabled.');
      hasWarnings = true;
    }
    if (newsdataFallback && !newsdataApiKey) {
      logger.warn('FEATURE_NEWSDATA_FALLBACK=true but NEWSDATA_API_KEY missing. Fallback disabled.');
      hasWarnings = true;
    }
  }

  // If enabled but missing required keys, disable gracefully
  const effectiveEnabled = enabled && braveApiKey !== null;

  config = {
    enabled: effectiveEnabled,
    memoryReviewTrigger,
    researchInjection,
    newsdataFallback: newsdataFallback && newsdataApiKey !== null,
    braveApiKey,
    newsdataApiKey,
    redisUrl,
  };

  configInitialized = true;

  if (!hasWarnings && effectiveEnabled) {
    logger.info('Research sidecar enabled and configured');
  }

  return config;
}

/**
 * Get current research config (lazy initialization)
 */
export function getResearchConfig(): ResearchConfig {
  return loadResearchConfig();
}

/**
 * Check if research is enabled
 */
export function isResearchEnabled(): boolean {
  return loadResearchConfig().enabled;
}

