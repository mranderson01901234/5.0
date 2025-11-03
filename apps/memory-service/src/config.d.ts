/**
 * Research configuration with graceful degradation
 */
export interface ResearchConfig {
    enabled: boolean;
    memoryReviewTrigger: boolean;
    researchInjection: boolean;
    newsdataFallback: boolean;
    braveApiKey: string | null;
    newsdataApiKey: string | null;
    redisUrl: string;
}
/**
 * Initialize and validate research configuration
 * Logs warnings for missing keys and disables features gracefully
 */
export declare function loadResearchConfig(): ResearchConfig;
/**
 * Get current research config (lazy initialization)
 */
export declare function getResearchConfig(): ResearchConfig;
/**
 * Check if research is enabled
 */
export declare function isResearchEnabled(): boolean;
//# sourceMappingURL=config.d.ts.map