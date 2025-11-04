// apps/web/src/server/google/gemini.ts

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

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
 * Generates an image using Google Imagen 4 via the Gemini API.
 *
 * @param prompt The text prompt for image generation.
 * @param opts Options for image generation.
 * @returns A promise that resolves to an array of generated images.
 */
export async function generateImage(prompt: string, opts?: ImageGenOptions): Promise<ImageData[]> {
    if (!GOOGLE_API_KEY) {
        throw new Error("GOOGLE_API_KEY is not set in environment variables.");
    }

    const model = opts?.model || DEFAULT_IMAGE_GEN_MODEL;
    
    // Map legacy size to aspectRatio if needed
    const aspectRatio = opts?.aspectRatio || (opts?.size ? mapSizeToAspectRatio(opts.size) : "1:1");
    
    // Determine sample count (default 1, max 4)
    const sampleCount = opts?.sampleCount ? Math.min(4, Math.max(1, opts.sampleCount)) : 1;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GOOGLE_API_KEY}`;

    // Build request body for Imagen 4
    // Note: responseMimeType cannot be "image/png" - images are returned automatically in response parts
    const body: any = {
        contents: [{
            parts: [{ text: prompt }]
        }],
    };

    // Add Imagen-specific parameters to generationConfig
    const generationConfig: any = {};
    
    // Note: temperature and responseMimeType are not valid for Imagen models
    // Images are returned automatically in the response parts
    
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

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Imagen API error response:", errorText);
            
            // Parse error for better messages
            let errorMessage = `Imagen API request failed with status ${response.status}`;
            try {
                const errorData = JSON.parse(errorText);
                if (errorData.error?.message) {
                    errorMessage = errorData.error.message;
                } else if (errorData.error) {
                    errorMessage = String(errorData.error);
                }
            } catch {
                // Use raw error text if JSON parsing fails
                if (errorText) {
                    errorMessage = errorText.substring(0, 200);
                }
            }

            // Map common error codes to user-friendly messages
            if (response.status === 429) {
                errorMessage = "Image generation quota exceeded. Please try again later.";
            } else if (response.status === 400) {
                errorMessage = errorMessage.includes("content policy") 
                    ? "Prompt violates content policy. Please modify your prompt."
                    : errorMessage;
            } else if (response.status === 503) {
                errorMessage = "Image generation temporarily unavailable. Please try again later.";
            }

            throw new Error(errorMessage);
        }

        const data = await response.json();

        if (!data.candidates || data.candidates.length === 0) {
            return [];
        }

        // Parse Imagen 4 response format
        const images: ImageData[] = data.candidates.flatMap((candidate: any) =>
            candidate.content?.parts
                ?.filter((part: any) => part.inlineData?.mimeType?.startsWith('image/'))
                .map((part: any) => ({
                    mime: 'image/png' as const,
                    dataUrl: `data:image/png;base64,${part.inlineData.data}`,
                })) || []
        );

        if (images.length === 0) {
            console.warn("Imagen API returned no images in response:", JSON.stringify(data).substring(0, 500));
        }

        return images;

    } catch (error) {
        console.error("Failed to fetch from Imagen API:", error);
        throw error;
    }
}
