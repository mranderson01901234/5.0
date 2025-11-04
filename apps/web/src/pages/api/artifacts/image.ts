import { getAuth } from '@clerk/nextjs/server';
import { NextApiRequest, NextApiResponse } from 'next';
import { generateImage, type ImageGenOptions, IMAGEN_MODELS } from '../../../server/google/gemini';
import { getEnv } from '../../../utils/env';

const { VITE_API_BASE_URL } = getEnv();

// Cost per image (in USD)
const IMAGEN_COSTS = {
    [IMAGEN_MODELS.STANDARD]: 0.04,
    [IMAGEN_MODELS.ULTRA]: 0.06,
    [IMAGEN_MODELS.FAST]: 0.04, // Assuming same as standard
} as const;

interface ImageGenerationRequest {
    threadId: string;
    prompt: string;
    size?: "1024x1024" | "768x1024" | "1024x768";
    aspectRatio?: "1:1" | "9:16" | "16:9" | "4:3" | "3:4";
    sampleCount?: number;
    safetyFilterLevel?: "BLOCK_NONE" | "BLOCK_ONLY_HIGH" | "BLOCK_MEDIUM_AND_HIGH";
    personGeneration?: "ALLOW_ALL" | "ALLOW_ADULT" | "DONT_ALLOW";
    negativePrompt?: string;
    seed?: number;
    model?: typeof IMAGEN_MODELS[keyof typeof IMAGEN_MODELS];
    artifactId?: string; // For regenerate - existing artifact ID
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    if (process.env.IMAGE_GEN_ENABLED !== 'true') {
        return res.status(403).json({ error: 'Image generation is disabled.' });
    }

    const { threadId, prompt, size, aspectRatio, sampleCount, safetyFilterLevel, personGeneration, negativePrompt, seed, model, artifactId }: ImageGenerationRequest = req.body;

    if (!threadId || !prompt) {
        return res.status(400).json({ error: 'threadId and prompt are required.' });
    }

    try {
        const { getToken } = getAuth(req);
        const token = await getToken();

        if (!token) {
            return res.status(401).json({ error: 'Authentication required.' });
        }

        // Build image generation options
        const imageOptions: ImageGenOptions = {};
        if (size) imageOptions.size = size;
        if (aspectRatio) imageOptions.aspectRatio = aspectRatio;
        if (sampleCount !== undefined) imageOptions.sampleCount = sampleCount;
        if (safetyFilterLevel) imageOptions.safetyFilterLevel = safetyFilterLevel;
        if (personGeneration) imageOptions.personGeneration = personGeneration;
        if (negativePrompt) imageOptions.negativePrompt = negativePrompt;
        if (seed !== undefined) imageOptions.seed = seed;
        if (model) imageOptions.model = model;

        const startTime = Date.now();
        const images = await generateImage(prompt, imageOptions);
        const generationTime = Date.now() - startTime;

        if (!images || images.length === 0) {
            return res.status(500).json({ error: 'Failed to generate images.' });
        }

        // Calculate cost
        const modelUsed = model || IMAGEN_MODELS.STANDARD;
        const costPerImage = IMAGEN_COSTS[modelUsed as keyof typeof IMAGEN_COSTS] || 0.04;
        const totalCost = costPerImage * images.length;

        const artifactPayload = {
            threadId,
            type: 'image',
            data: {
                images,
                prompt,
                size,
                aspectRatio,
                sampleCount,
                model: modelUsed,
                metadata: {
                    cost: totalCost,
                    costPerImage,
                    generationTimeMs: generationTime,
                    imageCount: images.length,
                    timestamp: Date.now(),
                },
            },
        };

        const gatewayUrl = new URL('/api/artifacts/create', VITE_API_BASE_URL).toString();

        const gatewayResponse = await fetch(gatewayUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(artifactPayload),
        });

        if (!gatewayResponse.ok) {
            const errorBody = await gatewayResponse.text();
            console.error('Failed to save artifact to gateway:', errorBody);
            return res.status(gatewayResponse.status).json({ error: 'Failed to save artifact.', details: errorBody });
        }

        const savedArtifact = await gatewayResponse.json();

        // Log cost tracking
        console.log(`[Image Generation] Cost: $${totalCost.toFixed(4)} for ${images.length} image(s) using ${modelUsed} (${generationTime}ms)`);

        return res.status(200).json({ 
            artifactId: savedArtifact.id,
            cost: totalCost,
            imageCount: images.length,
            model: modelUsed,
        });

    } catch (error: any) {
        console.error('Error in image artifact creation:', error);
        
        // Provide user-friendly error messages
        let errorMessage = error.message || 'Internal server error';
        let statusCode = 500;

        if (errorMessage.includes('quota exceeded')) {
            statusCode = 429;
        } else if (errorMessage.includes('content policy')) {
            statusCode = 400;
        } else if (errorMessage.includes('unavailable')) {
            statusCode = 503;
        }

        return res.status(statusCode).json({ error: errorMessage });
    }
}
