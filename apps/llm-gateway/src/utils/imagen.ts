// apps/llm-gateway/src/utils/imagen.ts
// Google Imagen 4 image generation utility

import { GoogleAuth } from 'google-auth-library';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fetchWithRetry, TimeoutError, NonRetryableError } from './retry.js';
import { logger } from '../log.js';
import { getCachedImage, setCachedImage } from './imageCache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const VERTEX_AI_ACCESS_TOKEN = process.env.VERTEX_AI_ACCESS_TOKEN;
const VERTEX_AI_API_KEY = process.env.VERTEX_AI_API_KEY;
const GCP_SERVICE_ACCOUNT_PATH = process.env.GCP_SERVICE_ACCOUNT_PATH || resolve(__dirname, '../../config/google-service-account.json');
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT_ID || 'ultra-welder-475901-k9';
const GCP_LOCATION = process.env.GCP_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

// Initialize Google Auth client for service account
let authClient: GoogleAuth | null = null;
try {
    // Try to load service account JSON
    const serviceAccountPath = GCP_SERVICE_ACCOUNT_PATH;
    try {
        const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
        authClient = new GoogleAuth({
            credentials: serviceAccount,
            scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        });
    } catch {
        // Service account file not found or invalid, will use access token or API key
        authClient = null;
    }
} catch {
    authClient = null;
}

// Imagen 4 model variants
export const IMAGEN_MODELS = {
    STANDARD: 'imagen-4.0-generate-001',      // $0.04 per image
    ULTRA: 'imagen-4.0-ultra-generate-001',  // $0.06 per image - enhanced precision
    FAST: 'imagen-4.0-fast-generate-001',     // Faster generation
} as const;

export type ImagenModel = typeof IMAGEN_MODELS[keyof typeof IMAGEN_MODELS];

// Default to standard Imagen 4
const DEFAULT_IMAGE_GEN_MODEL = IMAGEN_MODELS.STANDARD;

export interface ImageGenOptions {
    /** Image aspect ratio */
    aspectRatio?: "1:1" | "9:16" | "16:9" | "4:3" | "3:4";
    /** Number of images to generate (1-4) */
    sampleCount?: number;
    /** Safety filter level */
    safetyFilterLevel?: "BLOCK_NONE" | "BLOCK_ONLY_HIGH" | "BLOCK_MEDIUM_AND_HIGH";
    /** Person generation policy */
    personGeneration?: "ALLOW_ALL" | "ALLOW_ADULT" | "DONT_ALLOW";
    /** Negative prompt to exclude certain elements */
    negativePrompt?: string;
    /** Seed for reproducibility */
    seed?: number;
    /** Model variant to use */
    model?: ImagenModel;
    /** Legacy size parameter (maps to aspectRatio) */
    size?: "1024x1024" | "768x1024" | "1024x768";
}

export interface ImageData {
    mime: 'image/png';
    dataUrl: string;
}

/**
 * Maps legacy size parameter to aspect ratio
 */
function mapSizeToAspectRatio(size?: string): "1:1" | "9:16" | "16:9" | "4:3" | "3:4" {
    switch (size) {
        case "1024x1024":
            return "1:1";
        case "768x1024":
            return "3:4";
        case "1024x768":
            return "4:3";
        default:
            return "1:1";
    }
}

/**
 * Lists available models from Google's Generative Language API
 * This can help debug which models are available
 */
async function listAvailableModels(): Promise<string[]> {
    if (!GOOGLE_API_KEY) {
        return [];
    }
    
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${GOOGLE_API_KEY}`);
        if (!response.ok) {
            return [];
        }
        const data = await response.json() as any;
        return data.models?.map((m: any) => m.name) || [];
    } catch {
        return [];
    }
}

/**
 * Generates an image using Google Imagen 4 via Vertex AI or Gemini API.
 * Prefers Vertex AI if configured, otherwise falls back to generativelanguage API.
 *
 * @param prompt The text prompt for image generation.
 * @param opts Options for image generation.
 * @returns A promise that resolves to an array of generated images.
 */
export async function generateImage(prompt: string, opts?: ImageGenOptions, userId?: string): Promise<ImageData[]> {
    const model = opts?.model || DEFAULT_IMAGE_GEN_MODEL;

    // Map legacy size to aspectRatio if needed
    const aspectRatio = opts?.aspectRatio || (opts?.size ? mapSizeToAspectRatio(opts.size) : "1:1");

    // Determine sample count (default 1, max 4)
    const sampleCount = opts?.sampleCount ? Math.min(4, Math.max(1, opts.sampleCount)) : 1;

    // Check cache first (with userId for hybrid caching)
    const cachedImages = await getCachedImage(prompt, opts, userId);
    if (cachedImages) {
        logger.info({ prompt: prompt.substring(0, 50), userId: userId?.substring(0, 8) }, 'Using cached image');
        return cachedImages.map((img, index) => ({
            mime: img.mime,
            dataUrl: img.dataUrl,
        }));
    }

    // Determine which API to use
    // Imagen models are ONLY available through Vertex AI, which requires service account/OAuth
    // Vertex AI doesn't support API keys - only service account authentication
    // Use Vertex AI if service account or access token is available
    const useVertexAI = (authClient || VERTEX_AI_ACCESS_TOKEN) && GCP_PROJECT_ID;
    
    let url: string;
    let headers: Record<string, string>;
    let body: any;

    if (useVertexAI) {
        // Use Vertex AI endpoint with service account or access token (API keys not supported)
        url = `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/publishers/google/models/${model}:predict`;
        
        // Get access token from service account or use provided token
        let accessToken: string;
        if (authClient) {
            const client = await authClient.getClient();
            const tokenResponse = await client.getAccessToken();
            accessToken = tokenResponse.token || '';
        } else if (VERTEX_AI_ACCESS_TOKEN) {
            accessToken = VERTEX_AI_ACCESS_TOKEN;
        } else {
            throw new Error('No authentication method available for Vertex AI');
        }
        
        headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        };

        // Vertex AI uses a different request format
        const instances = [{
            prompt: prompt,
        }];

        const parameters: any = {};
        
        if (aspectRatio !== "1:1") {
            parameters.aspectRatio = aspectRatio;
        }
        // Always include sampleCount, even if it's 1 (default is 4 if not specified)
        parameters.sampleCount = sampleCount;
        if (opts?.safetyFilterLevel) {
            parameters.safetyFilterLevel = opts.safetyFilterLevel;
        }
        if (opts?.personGeneration) {
            parameters.personGeneration = opts.personGeneration;
        }
        if (opts?.negativePrompt) {
            parameters.negativePrompt = opts.negativePrompt;
        }
        if (opts?.seed !== undefined) {
            parameters.seed = opts.seed;
        }

        body = {
            instances,
            parameters, // Always include parameters, even if it only has sampleCount
        };
    } else {
        // Fallback: Try generativelanguage API (though Imagen models may not be available here)
        // Note: Imagen models typically require Vertex AI
        const apiKey = VERTEX_AI_API_KEY || GOOGLE_API_KEY;
        if (!apiKey) {
            throw new Error("Imagen models require Vertex AI with service account authentication. Please set up GCP_SERVICE_ACCOUNT_PATH or use VERTEX_AI_ACCESS_TOKEN.");
        }

        url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        headers = {
            'Content-Type': 'application/json',
        };

        // Build request body for generativelanguage API
        body = {
            contents: [{
                parts: [{ text: prompt }]
            }],
        };

        // Add Imagen-specific parameters to generationConfig
        const generationConfig: any = {};
        
        if (aspectRatio !== "1:1") {
            generationConfig.aspectRatio = aspectRatio;
        }
        if (sampleCount > 1) {
            generationConfig.sampleCount = sampleCount;
        }
        if (opts?.safetyFilterLevel) {
            generationConfig.safetyFilterLevel = opts.safetyFilterLevel;
        }
        if (opts?.personGeneration) {
            generationConfig.personGeneration = opts.personGeneration;
        }
        if (opts?.negativePrompt) {
            generationConfig.negativePrompt = opts.negativePrompt;
        }
        if (opts?.seed !== undefined) {
            generationConfig.seed = opts.seed;
        }

        // Only add generationConfig if we have Imagen-specific parameters
        if (Object.keys(generationConfig).length > 0) {
            body.generationConfig = generationConfig;
        }
    }

    try {
        const response = await fetchWithRetry(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        }, {
            maxRetries: 3,
            timeoutMs: 60000,
            retryableStatusCodes: [429, 500, 502, 503, 504],
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error({ status: response.status, errorText: errorText.substring(0, 500) }, "Imagen API error response");
            logger.debug({ body }, "Imagen API request body");

            // Parse error for better messages
            let errorMessage = `Imagen API request failed with status ${response.status}`;
            try {
                const errorData = JSON.parse(errorText);
                if (errorData.error?.message) {
                    errorMessage = errorData.error.message;
                } else if (errorData.error) {
                    errorMessage = String(errorData.error);
                }
                // Log full error details for debugging
                if (errorData.error?.details) {
                    logger.debug({ errorDetails: errorData.error.details }, "Imagen API error details");
                }
            } catch {
                // Use raw error text if JSON parsing fails
                if (errorText) {
                    errorMessage = errorText.substring(0, 500);
                }
            }

            // Map common error codes to user-friendly messages
            if (response.status === 429) {
                errorMessage = "Image generation quota exceeded. Please try again later.";
            } else if (response.status === 400) {
                errorMessage = errorMessage.includes("content policy")
                    ? "Prompt violates content policy. Please modify your prompt."
                    : errorMessage;
            } else if (response.status === 401 || response.status === 403) {
                if (errorMessage.includes("PERMISSION_DENIED") || errorMessage.includes("Permission")) {
                    errorMessage = `Vertex AI permission denied. The service account needs the "Vertex AI User" role. Please grant the service account the "roles/aiplatform.user" role in Google Cloud Console.`;
                } else if (useVertexAI) {
                    errorMessage = "Vertex AI authentication failed. Please check your service account JSON file, VERTEX_AI_ACCESS_TOKEN, GCP_PROJECT_ID, and GCP_LOCATION.";
                } else {
                    errorMessage = "Google API authentication failed. Please check your GOOGLE_API_KEY.";
                }
            } else if (response.status === 503) {
                errorMessage = "Image generation temporarily unavailable. Please try again later.";
            }

            throw new Error(errorMessage);
        }

        const data = await response.json() as any;

        let images: ImageData[] = [];

        if (useVertexAI) {
            // Parse Vertex AI response format
            // Vertex AI returns: { predictions: [{ bytesBase64Encoded: "...", mimeType: "image/png" }] }
            if (data.predictions && Array.isArray(data.predictions)) {
                images = data.predictions
                    .filter((pred: any) => pred.bytesBase64Encoded)
                    .slice(0, sampleCount) // Limit to requested sampleCount
                    .map((pred: any) => ({
                        mime: 'image/png' as const,
                        dataUrl: `data:image/png;base64,${pred.bytesBase64Encoded}`,
                    }));
            }
        } else {
            // Parse generativelanguage API response format
            if (data.candidates && data.candidates.length > 0) {
                images = data.candidates.flatMap((candidate: any) =>
                    candidate.content?.parts
                        ?.filter((part: any) => part.inlineData?.mimeType?.startsWith('image/'))
                        .map((part: any) => ({
                            mime: 'image/png' as const,
                            dataUrl: `data:image/png;base64,${part.inlineData.data}`,
                        })) || []
                ).slice(0, sampleCount); // Limit to requested sampleCount
            }
        }

        if (images.length === 0) {
            logger.warn({ responseData: JSON.stringify(data).substring(0, 500) }, "Imagen API returned no images in response");
        }

        // Cache the successfully generated images (with userId for hybrid caching)
        if (images.length > 0) {
            const imagesToCache = images.map(img => ({
                mime: img.mime,
                dataUrl: img.dataUrl,
            }));
            await setCachedImage(prompt, opts, imagesToCache, userId);
        }

        return images;

    } catch (error: any) {
        logger.error({ error, prompt: prompt.substring(0, 100) }, 'Image generation failed');

        // Map specific errors to user-friendly messages
        if (error instanceof TimeoutError) {
            throw new Error('Image generation timed out. Please try again with a simpler prompt.');
        }

        if (error instanceof NonRetryableError) {
            if (error.statusCode === 400) {
                throw new Error('Invalid request. Please check your prompt and try again.');
            }
            if (error.statusCode === 403) {
                throw new Error('Your prompt may violate content policy. Please rephrase and try again.');
            }
        }

        // Re-throw the error (it already has a good message from earlier processing)
        throw error;
    }
}

// Cost per image (in USD)
export const IMAGEN_COSTS = {
    [IMAGEN_MODELS.STANDARD]: 0.04,
    [IMAGEN_MODELS.ULTRA]: 0.06,
    [IMAGEN_MODELS.FAST]: 0.04, // Assuming same as standard
} as const;

