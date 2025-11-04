import { logger } from '../log.js';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Content policy patterns (block early to save API costs)
const BLOCKED_CONTENT_PATTERNS = [
  // Explicit content
  /\b(?:nude|naked|nsfw|xxx|porn|pornographic|sexual|erotic)\b/i,

  // Violence
  /\b(?:gore|gory|bloody|brutal|torture|mutilate|decapitate)\b/i,

  // Hate symbols
  /\b(?:nazi|swastika|hitler|white supremac|kkk)\b/i,

  // Graphic violence
  /\b(?:kill|murder|death|dead body|corpse|suicide)\b/i,
];

// Warning patterns (allow but log)
const WARNING_PATTERNS = [
  /\b(?:weapon|gun|rifle|knife|sword|blood)\b/i,
  /\b(?:scary|horror|creepy|disturbing)\b/i,
];

/**
 * Validate image generation request
 */
export function validateImageRequest(prompt: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Check prompt exists and has content
  if (!prompt || typeof prompt !== 'string') {
    errors.push('Prompt is required');
    return { isValid: false, errors, warnings };
  }

  const trimmed = prompt.trim();

  // 2. Check minimum length
  if (trimmed.length < 3) {
    errors.push('Prompt must be at least 3 characters long');
  }

  // 3. Check maximum length (Imagen limit)
  if (trimmed.length > 4000) {
    errors.push('Prompt exceeds maximum length of 4000 characters');
  }

  // 4. Check for blocked content
  for (const pattern of BLOCKED_CONTENT_PATTERNS) {
    if (pattern.test(trimmed)) {
      errors.push('Prompt may violate content policy. Please rephrase and try again.');
      logger.warn({ prompt: trimmed.substring(0, 50) }, 'Blocked prompt due to content policy');
      break; // Only report once
    }
  }

  // 5. Check for warning content (allow but log)
  for (const pattern of WARNING_PATTERNS) {
    if (pattern.test(trimmed)) {
      warnings.push('Prompt contains potentially sensitive content');
      logger.info({ prompt: trimmed.substring(0, 50) }, 'Warning content detected in prompt');
      break;
    }
  }

  // 6. Check for very repetitive content (likely spam or error)
  if (trimmed.length > 20) {
    const words = trimmed.toLowerCase().split(/\s+/);
    const uniqueWords = new Set(words);

    if (uniqueWords.size / words.length < 0.3) {
      warnings.push('Prompt appears very repetitive and may not generate good results');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Sanitize prompt for safe processing
 */
export function sanitizePrompt(prompt: string): string {
  return prompt
    .trim()
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[^\w\s.,!?'"-]/g, '') // Remove special characters except basic punctuation
    .substring(0, 4000); // Enforce max length
}

/**
 * Check if prompt is safe to process
 */
export function isPromptSafe(prompt: string): boolean {
  for (const pattern of BLOCKED_CONTENT_PATTERNS) {
    if (pattern.test(prompt)) {
      return false;
    }
  }
  return true;
}
