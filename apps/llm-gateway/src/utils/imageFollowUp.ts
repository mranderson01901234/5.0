import { logger } from '../log.js';

export interface FollowUpContext {
  prompt: string;
  userId: string;
  hasMemories?: boolean;
  recentMemoryTopics?: string[];
  isRepeatUser?: boolean;
}

/**
 * Generates a contextual follow-up message after image generation
 * - Rotates through different response styles
 * - Integrates user memory context when available
 * - Nudges for iteration or memory storage
 */
export function generateImageFollowUp(context: FollowUpContext): string {
  const { prompt, hasMemories, recentMemoryTopics, isRepeatUser } = context;

  // Extract key subject from prompt
  const subject = extractSubject(prompt);

  // Select response template based on context
  const templates = getTemplatePool(context);
  const template = selectTemplate(templates, context);

  // Generate response
  const response = template(subject, recentMemoryTopics);

  logger.debug({
    subject,
    hasMemories,
    templateType: template.name
  }, 'Generated image follow-up');

  return response;
}

/**
 * Extract main subject from prompt
 */
function extractSubject(prompt: string): string {
  // Remove common instruction prefixes
  const cleaned = prompt
    .replace(/^(?:create|generate|make|draw|show me|paint|sketch|a |an |the )\s*/i, '')
    .replace(/,.*$/, '') // Remove everything after first comma
    .replace(/\b(?:high detail|professional|8k|photorealistic|cinematic).*$/i, '');

  // Get first few words
  const words = cleaned.trim().split(/\s+/).slice(0, 3).join(' ');
  return words || 'image';
}

/**
 * Get pool of templates based on context
 */
function getTemplatePool(context: FollowUpContext) {
  const { hasMemories, isRepeatUser } = context;

  const templates = [
    // Style 1: Iterative improvement suggestion
    function iterativeImprovement(subject: string): string {
      return `I've generated your ${subject} image. If you'd like me to refine it—perhaps adjusting the style, perspective, or adding specific details—just let me know what to tweak.`;
    },

    // Style 2: Variation offer
    function variationOffer(subject: string): string {
      return `Here's your ${subject}. Want to see variations? I can generate different perspectives, color schemes, or artistic styles for the same concept.`;
    },

    // Style 3: Memory integration
    function memoryIntegration(subject: string, topics?: string[]): string {
      if (topics && topics.length > 0) {
        return `Created your ${subject} image. Based on what we've worked on before (${topics[0]}), would you like me to remember your image style preferences for future generations?`;
      }
      return `Your ${subject} is ready. Should I remember your preferences for future image requests? I can learn what styles and subjects you typically prefer.`;
    },

    // Style 4: Creative expansion
    function creativeExpansion(subject: string): string {
      return `Generated your ${subject}. Thinking ahead—would this work better in a different setting or time period? I can explore creative variations if you'd like.`;
    },

    // Style 5: Technical refinement
    function technicalRefinement(subject: string): string {
      return `Your ${subject} image is complete. If the composition, lighting, or any technical aspect needs adjustment, I'm ready to regenerate with your refinements.`;
    },

    // Style 6: Simple iteration nudge
    function simpleNudge(subject: string): string {
      return `Here's your ${subject}. Feel free to ask for changes—I can iterate on this as many times as needed to get it right.`;
    },

    // Style 7: Series suggestion (for repeat users)
    function seriesSuggestion(subject: string): string {
      return `${subject} created. If you're building a series or collection, I can maintain consistent style across multiple images. Just let me know what else you need.`;
    },

    // Style 8: Memory storage offer
    function memoryStorageOffer(subject: string): string {
      return `Your ${subject} is ready. Want me to remember this for future reference? I can store your image projects and preferences to help with continuity.`;
    },
  ];

  // Filter templates based on context
  if (hasMemories && isRepeatUser) {
    // Favor memory-aware and advanced templates for returning users
    return [
      templates[2], // memoryIntegration
      templates[6], // seriesSuggestion
      templates[3], // creativeExpansion
      templates[0], // iterativeImprovement
    ];
  } else if (isRepeatUser) {
    // Favor iteration and variation for repeat users
    return [
      templates[0], // iterativeImprovement
      templates[1], // variationOffer
      templates[6], // seriesSuggestion
      templates[4], // technicalRefinement
    ];
  } else {
    // Simpler, friendlier templates for new users
    return [
      templates[5], // simpleNudge
      templates[7], // memoryStorageOffer
      templates[1], // variationOffer
      templates[0], // iterativeImprovement
    ];
  }
}

/**
 * Select template using rotating selection with context awareness
 */
function selectTemplate(
  templates: Array<(subject: string, topics?: string[]) => string>,
  context: FollowUpContext
) {
  // Use timestamp-based rotation to vary responses
  const index = Math.floor(Date.now() / (1000 * 60 * 5)) % templates.length;

  return templates[index];
}

/**
 * Check if user has generated images recently (for repeat user detection)
 */
export function isRepeatImageUser(userId: string, recentCount: number): boolean {
  // This would be populated from database in real implementation
  return recentCount > 2;
}
