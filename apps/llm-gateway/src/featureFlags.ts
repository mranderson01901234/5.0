// Phase 1 stub — to be expanded
// Feature flag infrastructure for artifact feature rollout

import { getDatabase } from './database.js';
import { logger } from './log.js';

export interface ArtifactFeatureFlags {
  artifactFeatureEnabled: boolean;
  gatekeeperEnabled: boolean;
  artifactCreationEnabled: boolean;
  exportEnabled: boolean;
  splitViewEnabled: boolean;
  thresholds: {
    high: number;
    med: number;
  };
}

/**
 * Get feature flags for artifact functionality
 * @param userId Optional user ID for per-user flags (gradual rollout)
 * @returns Feature flags object
 */
export async function getFeatureFlags(
  userId?: string
): Promise<ArtifactFeatureFlags> {
  // TODO: Add database lookup for per-user flags
  // TODO: Support gradual rollout (percentage-based)
  
  // Read env vars with defaults
  const flags: ArtifactFeatureFlags = {
    artifactFeatureEnabled: process.env.ARTIFACT_FEATURE_ENABLED === 'true',
    gatekeeperEnabled: process.env.GATEKEEPER_ENABLED !== 'false', // Default: true
    artifactCreationEnabled: process.env.ARTIFACT_CREATION_ENABLED !== 'false', // Default: true (enable by default for Phase 6)
    exportEnabled: process.env.EXPORT_ENABLED !== 'false', // Default: true
    splitViewEnabled: process.env.SPLIT_VIEW_ENABLED !== 'false', // Default: true
    thresholds: {
      high: parseFloat(process.env.GATEKEEPER_HIGH || '0.8'),
      med: parseFloat(process.env.GATEKEEPER_MED || '0.6'),
    },
  };
  
  logger.debug({
    userId,
    flags,
  }, 'Feature flags retrieved');
  
  return flags;
}

/**
 * Check if artifact feature is enabled for a user
 * @param userId User ID to check
 * @returns true if feature is enabled
 */
export async function isArtifactFeatureEnabled(userId?: string): Promise<boolean> {
  const flags = await getFeatureFlags(userId);
  return flags.artifactFeatureEnabled;
}
