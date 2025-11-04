/**
 * Rotating list of image generation response prompts
 * These are displayed when the user requests image creation
 */

import { useArtifactStore } from '@/store/artifactStore';
import type { ImageArtifact } from '@/store/artifactStore';

const IMAGE_RESPONSE_PROMPTS = [
  "Ok, one second",
  "Let me create that image for you",
  "Generating your image now",
  "Creating your image",
  "Working on it",
  "On it",
  "Got it",
];

let currentIndex = 0;

/**
 * Get the next image response prompt from the rotating list
 */
export function getNextImagePrompt(): string {
  const prompt = IMAGE_RESPONSE_PROMPTS[currentIndex];
  currentIndex = (currentIndex + 1) % IMAGE_RESPONSE_PROMPTS.length;
  return prompt;
}

/**
 * Summarize user prompt for image generation response
 * Extracts key parts of the prompt without repeating word-for-word
 */
export function summarizeImagePrompt(userPrompt: string): string {
  const lowerPrompt = userPrompt.toLowerCase().trim();
  
  // Remove common image generation phrases
  const cleaned = lowerPrompt
    .replace(/^(create|generate|make|draw|render)\s+(a|an|the|me|an?)\s+(image|picture|photo|illustration|drawing|logo|graphic)\s+(of|for|with|showing)?\s*/i, '')
    .replace(/^(show|display|give|give me)\s+(a|an|the|me)?\s+(image|picture|photo|illustration|drawing|logo|graphic)\s+(of|for|with|showing)?\s*/i, '')
    .trim();
  
  // If cleaned is empty or too short, use original but simplified
  if (!cleaned || cleaned.length < 5) {
    // Extract main content after first verb
    const words = userPrompt.split(/\s+/);
    const verbIndex = words.findIndex(w => 
      /^(create|generate|make|draw|render|show|display)$/i.test(w)
    );
    if (verbIndex >= 0 && verbIndex < words.length - 1) {
      return words.slice(verbIndex + 1).join(' ').substring(0, 80);
    }
    return userPrompt.substring(0, 80);
  }
  
  // Limit to reasonable length
  return cleaned.substring(0, 80);
}

/**
 * Generate full image response message with prompt summary
 * Always returns "Let me create that image for you..." with prompt summary
 */
export function generateImageResponseMessage(userPrompt: string): string {
  const summary = summarizeImagePrompt(userPrompt);
  
  if (summary && summary.length > 0) {
    return `Let me create that image for you... ${summary}`;
  }
  
  return `Let me create that image for you...`;
}

/**
 * Poll for image artifact to appear in the store
 * Returns when artifact is found or timeout is reached
 */
export async function waitForImageArtifact(
  artifactId: string,
  threadId: string,
  maxWaitMs: number = 30000
): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 200; // Check every 200ms
  
  return new Promise((resolve) => {
    const checkArtifact = () => {
      const artifactStore = useArtifactStore.getState();
      const artifact = artifactStore.getArtifactById(artifactId);
      
      if (artifact && artifact.type === 'image') {
        // Check if image data is actually loaded
        const imageArtifact = artifact as ImageArtifact;
        if (imageArtifact.data?.images && imageArtifact.data.images.length > 0) {
          resolve(true);
          return;
        }
      }
      
      // Check timeout
      if (Date.now() - startTime >= maxWaitMs) {
        resolve(false);
        return;
      }
      
      // Continue polling
      setTimeout(checkArtifact, pollInterval);
    };
    
    checkArtifact();
  });
}

/**
 * Get animated dots string based on current frame
 */
export function getAnimatedDots(frame: number): string {
  const dots = ['.', '..', '...'];
  return dots[frame % dots.length];
}

