import { logger } from '../log.js';

export interface PromptOptimization {
  original: string;
  optimized: string;
  improvements: string[]; // List of what was changed
  shouldSuggest: boolean; // True only if improvements are significant
  qualityScore: number; // 0-100, how much better the optimized version is
}

// Art quality enhancers
const QUALITY_ENHANCERS = [
  'high detail',
  'professional quality',
  'sharp focus',
  'award winning',
  'masterpiece',
];

// Lighting terms
const LIGHTING_TERMS = [
  'cinematic lighting',
  'dramatic lighting',
  'natural lighting',
  'studio lighting',
  'golden hour',
  'soft lighting',
];

// Style descriptors
const STYLE_DESCRIPTORS = [
  'photorealistic',
  'hyperrealistic',
  'detailed',
  'intricate',
  'elegant',
  'beautiful',
  'stunning',
];

// Technical quality
const TECHNICAL_QUALITY = [
  '8k',
  '4k',
  'ultra hd',
  'high resolution',
];

/**
 * Aggressively optimizes image prompts for best quality results
 */
export function optimizeImagePrompt(prompt: string): PromptOptimization {
  const original = prompt.trim();
  const improvements: string[] = [];
  let qualityScore = 0;

  // Step 1: Clean and extract core subject
  let optimized = cleanPrompt(original, improvements);

  // Step 2: Analyze existing quality
  const hasQualityTerms = hasQualityDescriptors(optimized);
  const hasLighting = hasLightingTerms(optimized);
  const hasStyle = hasStyleDescriptors(optimized);
  const hasTechnical = hasTechnicalQuality(optimized);

  // Step 3: Build optimized prompt with professional structure
  const coreSubject = extractCoreSubject(optimized);
  const existingDetails = extractExistingDetails(optimized);

  // Rebuild prompt with optimal structure: [Subject], [Style], [Quality], [Technical], [Lighting]
  const parts: string[] = [];

  // Core subject (always first)
  parts.push(coreSubject);

  // Add style if missing
  if (!hasStyle && shouldAddStyle(coreSubject)) {
    parts.push(selectBestStyle(coreSubject));
    improvements.push('Added professional style descriptor');
    qualityScore += 25;
  } else if (hasStyle) {
    // Keep existing style
    const style = existingDetails.style;
    if (style) parts.push(style);
  }

  // Add quality descriptors if missing
  if (!hasQualityTerms) {
    parts.push(selectQualityEnhancer(coreSubject));
    improvements.push('Added quality enhancers');
    qualityScore += 20;
  }

  // Add technical quality if missing
  if (!hasTechnical) {
    parts.push('8k uhd');
    improvements.push('Added technical quality specification');
    qualityScore += 15;
  }

  // Add lighting if missing and appropriate
  if (!hasLighting && shouldAddLighting(coreSubject)) {
    parts.push(selectBestLighting(coreSubject));
    improvements.push('Added lighting specification');
    qualityScore += 20;
  }

  // Combine parts
  optimized = parts.filter(p => p).join(', ');

  // Step 4: Final polish
  optimized = polishPrompt(optimized);

  // Calculate if suggestion is significant enough to show
  const shouldSuggest = qualityScore >= 30 && improvements.length >= 2;

  if (shouldSuggest) {
    logger.debug({
      original: original.substring(0, 50),
      optimized: optimized.substring(0, 50),
      qualityScore,
      improvements
    }, 'Prompt optimization suggested');
  }

  return {
    original,
    optimized,
    improvements,
    shouldSuggest,
    qualityScore
  };
}

/**
 * Clean prompt by removing conversational fluff and instructions
 */
function cleanPrompt(prompt: string, improvements: string[]): string {
  let cleaned = prompt;

  // Remove conversational prefixes
  const conversationalPrefixes = /^(?:please |can you |could you |would you |i want |i need |i'd like )/i;
  if (conversationalPrefixes.test(cleaned)) {
    cleaned = cleaned.replace(conversationalPrefixes, '');
    improvements.push('Removed conversational prefix');
  }

  // Remove instruction keywords
  const instructionPattern = /^(?:create|generate|make|draw|paint|sketch|produce|build|design|show me|give me)\s+(?:an?|the|me|some)?\s*(?:image|picture|photo|illustration|graphic|artwork|drawing|painting|sketch|render)?\s*(?:of|showing|depicting|that shows|with)?\s*/i;
  if (instructionPattern.test(cleaned)) {
    cleaned = cleaned.replace(instructionPattern, '');
    improvements.push('Removed instruction keywords');
  }

  // Remove weak quality terms
  const weakTerms = /\b(?:good|nice|pretty|cool|awesome|great|beautiful looking)\b/gi;
  if (weakTerms.test(cleaned)) {
    cleaned = cleaned.replace(weakTerms, '');
    improvements.push('Removed weak quality descriptors');
  }

  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

/**
 * Extract the core subject without modifiers
 */
function extractCoreSubject(prompt: string): string {
  // Remove quality/style descriptors to get core subject
  let subject = prompt
    .replace(/\b(?:photorealistic|hyperrealistic|realistic|detailed|intricate|cinematic|dramatic)\b/gi, '')
    .replace(/\b(?:8k|4k|uhd|hd|high resolution|high detail|professional quality)\b/gi, '')
    .replace(/\b(?:masterpiece|award winning|stunning|beautiful|elegant)\b/gi, '')
    .replace(/\b(?:lighting|light|lit)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Capitalize first letter
  if (subject.length > 0) {
    subject = subject.charAt(0).toUpperCase() + subject.slice(1);
  }

  return subject || prompt;
}

/**
 * Extract existing style/quality details
 */
function extractExistingDetails(prompt: string): { style?: string } {
  const lower = prompt.toLowerCase();

  // Check for existing style
  let style: string | undefined;
  for (const descriptor of STYLE_DESCRIPTORS) {
    if (lower.includes(descriptor)) {
      style = descriptor;
      break;
    }
  }

  return { style };
}

/**
 * Check if prompt has quality descriptors
 */
function hasQualityDescriptors(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return QUALITY_ENHANCERS.some(term => lower.includes(term));
}

/**
 * Check if prompt has lighting terms
 */
function hasLightingTerms(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return LIGHTING_TERMS.some(term => lower.includes(term)) || /\b(?:light|lighting|lit)\b/i.test(prompt);
}

/**
 * Check if prompt has style descriptors
 */
function hasStyleDescriptors(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return STYLE_DESCRIPTORS.some(term => lower.includes(term));
}

/**
 * Check if prompt has technical quality specs
 */
function hasTechnicalQuality(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return TECHNICAL_QUALITY.some(term => lower.includes(term));
}

/**
 * Determine if subject needs style descriptor
 */
function shouldAddStyle(subject: string): boolean {
  const lower = subject.toLowerCase();

  // Don't add style to abstract concepts
  if (/\b(?:concept|abstract|pattern|texture)\b/i.test(subject)) {
    return false;
  }

  return true;
}

/**
 * Determine if subject needs lighting
 */
function shouldAddLighting(subject: string): boolean {
  const lower = subject.toLowerCase();

  // Add lighting to scenes, portraits, and objects
  if (/\b(?:scene|landscape|portrait|person|people|face|object|product|building|architecture)\b/i.test(subject)) {
    return true;
  }

  return true; // Default to adding lighting
}

/**
 * Select best style for subject
 */
function selectBestStyle(subject: string): string {
  const lower = subject.toLowerCase();

  // Portraits and people
  if (/\b(?:portrait|person|people|face|man|woman|child|human)\b/i.test(subject)) {
    return 'photorealistic';
  }

  // Landscapes and nature
  if (/\b(?:landscape|nature|scenery|mountain|ocean|forest|sky)\b/i.test(subject)) {
    return 'stunning, highly detailed';
  }

  // Objects and products
  if (/\b(?:product|object|item|device|tool)\b/i.test(subject)) {
    return 'professional product photography';
  }

  // Architecture
  if (/\b(?:building|architecture|interior|room|house)\b/i.test(subject)) {
    return 'architectural visualization';
  }

  // Default
  return 'photorealistic, highly detailed';
}

/**
 * Select quality enhancer
 */
function selectQualityEnhancer(subject: string): string {
  return 'professional quality, sharp focus, high detail';
}

/**
 * Select best lighting for subject
 */
function selectBestLighting(subject: string): string {
  const lower = subject.toLowerCase();

  // Outdoor scenes
  if (/\b(?:outdoor|landscape|nature|sky|sunset|sunrise)\b/i.test(subject)) {
    return 'natural lighting, golden hour';
  }

  // Portraits
  if (/\b(?:portrait|person|face)\b/i.test(subject)) {
    return 'professional studio lighting';
  }

  // Products
  if (/\b(?:product|object)\b/i.test(subject)) {
    return 'studio lighting, soft shadows';
  }

  // Default
  return 'cinematic lighting';
}

/**
 * Final polish on the prompt
 */
function polishPrompt(prompt: string): string {
  // Remove duplicate commas and spaces
  let polished = prompt.replace(/,+/g, ',').replace(/\s+/g, ' ');

  // Remove trailing/leading commas
  polished = polished.replace(/^,\s*|\s*,$/g, '').trim();

  // Ensure proper spacing after commas
  polished = polished.replace(/,(?!\s)/g, ', ');

  return polished;
}
