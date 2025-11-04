import { logger } from '../log.js';

export interface ImageIntent {
  isImageRequest: boolean;
  confidence: number; // 0.0 to 1.0
  extractedPrompt: string; // The actual image description
  originalQuery: string;
  detectedAspectRatio?: '1:1' | '9:16' | '16:9' | '4:3' | '3:4';
  aspectRatioReason?: string;
}

// Strong indicators of image generation intent
const EXPLICIT_IMAGE_PATTERNS = [
  // Direct creation requests
  /(?:create|generate|make|draw|produce|build|design)\s+(?:an?|some|the|me)?\s*(?:image|picture|photo|illustration|graphic|artwork|drawing|painting|sketch|render)/i,

  // "Show me" visual patterns
  /show\s+me\s+(?:what|how|an?)\s+.*(?:looks?|look like|appear|would be)/i,

  // Visual action verbs
  /(?:visualize|illustrate|depict|render|paint|sketch)\s+/i,

  // Imagen-specific triggers
  /\b(?:imagen|image gen|img gen|generate image)\b/i,

  // Art direction requests
  /(?:paint|sketch|draw)\s+(?:me\s+)?(?:an?|the)\s+/i,
];

// Medium confidence patterns
const IMAGE_CONTEXT_PATTERNS = [
  // Descriptive visual requests
  /(?:what does|what would|how does|how would)\s+.+\s+look like/i,

  // Art style mentions
  /\b(?:in the style of|styled like|artistic|photorealistic|realistic|oil painting|watercolor|digital art)\b/i,

  // Camera/photo terminology
  /\b(?:photograph|photo|snapshot|shot|camera|lens|lighting|composition)\b/i,
];

// Visual subject keywords
const VISUAL_KEYWORDS = [
  'image', 'picture', 'photo', 'illustration', 'graphic', 'artwork',
  'drawing', 'painting', 'sketch', 'render', 'visualization', 'portrait',
  'landscape', 'scene', 'scenery', 'view', 'panorama'
];

// Aspect ratio detection patterns
const ASPECT_RATIO_PATTERNS = {
  'portrait': {
    ratio: '9:16' as const,
    patterns: [
      /\b(?:portrait|vertical|tall|standing|person|face|headshot|selfie)\b/i,
      /\b(?:phone|mobile|story|stories)\b/i,
    ]
  },
  'landscape': {
    ratio: '16:9' as const,
    patterns: [
      /\b(?:landscape|horizontal|wide|panorama|scenery|vista|cinematic)\b/i,
      /\b(?:widescreen|desktop|wallpaper|banner)\b/i,
    ]
  },
  'photo_portrait': {
    ratio: '3:4' as const,
    patterns: [
      /\b(?:photo portrait|professional portrait|headshot photo)\b/i,
      /\b(?:standard photo|traditional photo)\b/i,
    ]
  },
  'photo_landscape': {
    ratio: '4:3' as const,
    patterns: [
      /\b(?:photo landscape|classic photo|traditional landscape)\b/i,
    ]
  },
  'square': {
    ratio: '1:1' as const,
    patterns: [
      /\b(?:square|instagram|post|profile|avatar|icon)\b/i,
    ]
  }
};

/**
 * Detects if user query intends to generate an image
 */
export function detectImageIntent(userPrompt: string): ImageIntent {
  const trimmed = userPrompt.trim();
  const lowerPrompt = trimmed.toLowerCase();

  let confidence = 0;
  let extractedPrompt = trimmed;

  // Check explicit patterns (high confidence)
  for (const pattern of EXPLICIT_IMAGE_PATTERNS) {
    if (pattern.test(trimmed)) {
      confidence = 0.95;

      // Try to extract just the description part
      // "create an image of a sunset" → "a sunset"
      const ofMatch = trimmed.match(/(?:of|showing|depicting|with|for)\s+(.+)$/i);
      if (ofMatch) {
        extractedPrompt = ofMatch[1].trim();
      } else {
        // Remove the instruction part
        extractedPrompt = trimmed.replace(pattern, '').trim();
      }
      break;
    }
  }

  // Check context patterns (medium confidence)
  if (confidence < 0.7) {
    for (const pattern of IMAGE_CONTEXT_PATTERNS) {
      if (pattern.test(trimmed)) {
        confidence = Math.max(confidence, 0.75);

        // Extract the subject
        const likeMatch = trimmed.match(/(?:look like|looks like|would be)\s+(.+?)(?:\?|$)/i);
        if (likeMatch) {
          extractedPrompt = likeMatch[1].trim();
        }
        break;
      }
    }
  }

  // Check for visual keywords (lower confidence boost)
  if (confidence < 0.6) {
    const keywordCount = VISUAL_KEYWORDS.filter(keyword =>
      lowerPrompt.includes(keyword)
    ).length;

    if (keywordCount > 0) {
      confidence = Math.max(confidence, Math.min(keywordCount * 0.25, 0.65));
    }
  }

  // Detect aspect ratio from context
  const { ratio, reason } = detectAspectRatio(extractedPrompt);

  const isImageRequest = confidence >= 0.7;

  if (isImageRequest) {
    logger.debug({
      original: userPrompt.substring(0, 50),
      extracted: extractedPrompt.substring(0, 50),
      confidence,
      aspectRatio: ratio
    }, 'Image intent detected');
  }

  return {
    isImageRequest,
    confidence,
    extractedPrompt: isImageRequest ? extractedPrompt : trimmed,
    originalQuery: userPrompt,
    detectedAspectRatio: ratio,
    aspectRatioReason: reason
  };
}

/**
 * Detects optimal aspect ratio based on prompt content
 */
function detectAspectRatio(prompt: string): { ratio: '1:1' | '9:16' | '16:9' | '4:3' | '3:4'; reason: string } {
  const lowerPrompt = prompt.toLowerCase();

  // Check each aspect ratio pattern
  for (const [type, config] of Object.entries(ASPECT_RATIO_PATTERNS)) {
    for (const pattern of config.patterns) {
      if (pattern.test(lowerPrompt)) {
        return {
          ratio: config.ratio,
          reason: `Detected ${type} context`
        };
      }
    }
  }

  // Default to square
  return {
    ratio: '1:1',
    reason: 'Default square format'
  };
}

/**
 * Extracts the core subject from a prompt
 */
export function extractSubject(prompt: string): string {
  const lower = prompt.toLowerCase();

  // Remove common instruction prefixes
  let subject = prompt
    .replace(/^(?:create|generate|make|draw|show me|paint|sketch|illustrate|depict|render)\s+(?:an?|the|me|some)?\s*/i, '')
    .replace(/^(?:image|picture|photo|illustration|drawing|painting)\s+(?:of|showing|depicting)?\s*/i, '')
    .trim();

  // Remove trailing questions
  subject = subject.replace(/\?+$/, '').trim();

  return subject || prompt;
}
