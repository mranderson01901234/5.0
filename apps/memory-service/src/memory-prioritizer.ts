/**
 * Smart memory prioritization and deduplication
 * Determines which memory to keep when multiple memories exist about the same topic
 */

import type { Memory } from '@llm-gateway/shared';

/**
 * Check if a memory contains update language that suggests it replaces an older one
 */
function containsUpdateLanguage(content: string): boolean {
  const updatePatterns = [
    /\b(?:changed|updated|now|currently|new|changed my mind|prefer now|like now)\b/i,
    /\b(?:no longer|not anymore|don't|doesn't)\b/i,
    /\b(?:instead|rather|switch|switch to)\b/i,
  ];

  return updatePatterns.some(pattern => pattern.test(content));
}

/**
 * Check if a memory is an explicit save (TIER1) vs automatic (TIER3)
 */
function isExplicitSave(memory: Memory): boolean {
  return memory.tier === 'TIER1';
}

/**
 * Calculate semantic similarity between two memory contents
 * Uses embeddings if available, falls back to keyword overlap
 */
function calculateMemorySimilarity(mem1: Memory, mem2: Memory): number {
  // If both have embeddings, use cosine similarity
  // Note: This would require loading embeddings - for now use keyword overlap as fallback
  
  const content1 = mem1.content.toLowerCase();
  const content2 = mem2.content.toLowerCase();
  
  // Extract keywords (remove common words)
  const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'my', 'i', 'me', 'you', 'he', 'she', 'it', 'we', 'they']);
  
  const words1 = new Set(content1.split(/\s+/).filter(w => w.length > 2 && !commonWords.has(w)));
  const words2 = new Set(content2.split(/\s+/).filter(w => w.length > 2 && !commonWords.has(w)));
  
  // Jaccard similarity
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Determine which memory to prioritize when they're about the same topic
 * 
 * Rules (in priority order):
 * 1. Explicit saves (TIER1) > Automatic saves (TIER3) - user explicitly wanted to remember this
 * 2. Update language in newer memory - indicates it's replacing the old one
 * 3. Higher priority score - indicates more important/relevant
 * 4. More recent (if similar priority/tier) - recent info is more likely current
 * 
 * Returns: true if mem1 should be kept, false if mem2 should be kept
 */
export function shouldKeepMemory(mem1: Memory, mem2: Memory): boolean {
  // Rule 1: Explicit saves always win over automatic saves
  const mem1Explicit = isExplicitSave(mem1);
  const mem2Explicit = isExplicitSave(mem2);
  
  if (mem1Explicit && !mem2Explicit) {
    return true; // Keep explicit save
  }
  if (!mem1Explicit && mem2Explicit) {
    return false; // Keep explicit save
  }
  
  // Rule 2: Check for update language - if newer memory has update language, prefer it
  const mem1IsNewer = mem1.updatedAt > mem2.updatedAt;
  const newerMemory = mem1IsNewer ? mem1 : mem2;
  const olderMemory = mem1IsNewer ? mem2 : mem1;
  
  if (containsUpdateLanguage(newerMemory.content)) {
    // Newer memory explicitly updates/changes - prefer it
    return mem1IsNewer;
  }
  
  // Rule 3: Higher priority wins (if significantly different)
  const priorityDiff = mem1.priority - mem2.priority;
  if (Math.abs(priorityDiff) > 0.15) { // Significant difference (>15%)
    return priorityDiff > 0;
  }
  
  // Rule 4: Higher tier wins (TIER1 > TIER2 > TIER3)
  const tierOrder: Record<string, number> = { TIER1: 3, TIER2: 2, TIER3: 1 };
  const tier1 = tierOrder[mem1.tier || 'TIER3'] || 0;
  const tier2 = tierOrder[mem2.tier || 'TIER3'] || 0;
  
  if (tier1 !== tier2) {
    return tier1 > tier2;
  }
  
  // Rule 5: If all else equal, prefer more recent (but only if very similar content)
  const similarity = calculateMemorySimilarity(mem1, mem2);
  if (similarity > 0.7) { // Very similar (>70% keyword overlap)
    // If very similar, newer is likely an update
    return mem1.updatedAt > mem2.updatedAt;
  }
  
  // If not very similar, they might be different contexts - prefer more recent by default
  // But with lower confidence
  return mem1.updatedAt > mem2.updatedAt;
}

/**
 * Deduplicate memories based on topic, using smart prioritization
 * Groups memories by topic pattern and keeps the best one per topic
 */
export function deduplicateMemoriesByTopic(
  memories: Memory[],
  options: {
    minSimilarity?: number; // Minimum similarity to consider duplicates (default: 0.7)
    preferRecent?: boolean;  // Prefer recent when similarity is high (default: true)
  } = {}
): Memory[] {
  const { minSimilarity = 0.7, preferRecent = true } = options;
  
  // Group by detected topic pattern
  const topicGroups = new Map<string, Memory[]>();
  const nonTopicMemories: Memory[] = [];
  
  for (const mem of memories) {
    const content = mem.content.toLowerCase();
    
    // Detect topic pattern: "my [attribute] is [value]"
    const topicMatch = content.match(/my\s+(favorite\s+)?(\w+(?:\s+\w+)?)\s+(?:is|are|was|were)\s+(.+)/);
    
    if (topicMatch) {
      const topic = topicMatch[2].trim(); // e.g., "favorite color"
      const value = topicMatch[3]?.trim();
      
      if (value && value.length >= 2) {
        // Group by topic
        if (!topicGroups.has(topic)) {
          topicGroups.set(topic, []);
        }
        topicGroups.get(topic)!.push(mem);
        continue;
      }
    }
    
    // No topic pattern - keep as non-topic memory
    nonTopicMemories.push(mem);
  }
  
  // For each topic group, keep the best memory
  const deduplicated: Memory[] = [];
  
  for (const [topic, topicMemories] of topicGroups) {
    if (topicMemories.length === 1) {
      // Only one memory for this topic
      deduplicated.push(topicMemories[0]);
      continue;
    }
    
    // Multiple memories for same topic - use smart prioritization
    // Sort by our prioritization logic
    topicMemories.sort((a, b) => {
      if (shouldKeepMemory(a, b)) return -1;
      if (shouldKeepMemory(b, a)) return 1;
      return 0;
    });
    
    // Keep the top one
    deduplicated.push(topicMemories[0]);
  }
  
  // Add non-topic memories (they're context-specific, keep all)
  deduplicated.push(...nonTopicMemories);
  
  return deduplicated;
}

/**
 * Enhanced deduplication using semantic similarity
 * For memories without clear topic patterns, use semantic similarity
 */
export function deduplicateBySemanticSimilarity(
  memories: Memory[],
  minSimilarity: number = 0.85
): Memory[] {
  const seen = new Set<string>();
  const result: Memory[] = [];
  
  for (let i = 0; i < memories.length; i++) {
    const mem1 = memories[i];
    
    if (seen.has(mem1.id)) {
      continue;
    }
    
    let isDuplicate = false;
    
    // Check against all other memories
    for (let j = i + 1; j < memories.length; j++) {
      const mem2 = memories[j];
      
      if (seen.has(mem2.id)) {
        continue;
      }
      
      const similarity = calculateMemorySimilarity(mem1, mem2);
      
      if (similarity >= minSimilarity) {
        // They're similar - use smart prioritization to pick one
        const keep = shouldKeepMemory(mem1, mem2) ? mem1 : mem2;
        const discard = keep.id === mem1.id ? mem2 : mem1;
        
        seen.add(discard.id);
        isDuplicate = keep.id !== mem1.id;
        break;
      }
    }
    
    if (!isDuplicate) {
      result.push(mem1);
      seen.add(mem1.id);
    }
  }
  
  return result;
}

